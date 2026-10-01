import "dotenv/config";
import type {
  BuyerPriorityWeight,
  RankedEligibleVendor,
  ComparisonMatrixRow,
  CapabilityGapsByVendor,
} from "./buyerVendorRiskReportAgent.js";
import { invokeBedrockAnthropicText } from "../../utils/invokeBedrockWithUsage.js";
import { isTokenQuotaExceededError } from "../../services/admin/featureTokenQuota.service.js";
import { clampScore2 } from "../../utils/roundScore.js";

export type VendorComparisonMatrixPayload = {
  buyerPrioritiesAndWeights: BuyerPriorityWeight[];
  rankedEligibleVendors: RankedEligibleVendor[];
  comparisonMatrix: ComparisonMatrixRow[];
  capabilityGapsByVendor: CapabilityGapsByVendor[];
  recommendationSummary: string[];
};

const PROMPT = `You are an enterprise procurement and risk analyst. The user already has a COMPLETE buyer vendor risk assessment report (JSON). Your job is to produce a focused "Vendor Comparison Matrix" summary as NEW JSON for an executive pack.

Output ONLY valid JSON (no markdown, no code fences) with exactly these keys:
{
  "buyerPrioritiesAndWeights": [
    { "priority": "<short label>", "weightPercent": <integer 5-35>, "notes": "<explicit tie to buyer report>" }
  ],
  "rankedEligibleVendors": [
    { "rank": 1, "vendorName": "...", "productName": "...", "eligible": true, "overallScore": <0-100 optional>, "notes": "<optional>" }
  ],
  "comparisonMatrix": [
    { "dimension": "Trust", "cells": [ { "vendorLabel": "<Vendor – Product>", "highlight": "<text>" } ] },
    { "dimension": "Risk buckets", "cells": [ { "vendorLabel": "...", "highlight": "..." } ] },
    { "dimension": "Key requirements coverage", "cells": [ { "vendorLabel": "...", "highlight": "..." } ] },
    { "dimension": "Security & compliance", "cells": [ { "vendorLabel": "...", "highlight": "..." } ] }
  ],
  "capabilityGapsByVendor": [
    { "vendorLabel": "<Vendor – Product>", "gaps": ["<gap>", "..."] }
  ],
  "recommendationSummary": ["<2-4 bullets synthesizing the FULL input report: executive summary, strengths, gaps, risk domains, recommendations>"]
}

Rules:
- buyerPrioritiesAndWeights: 5-7 items, weightPercent positive integers summing to 100 (±2).
- rankedEligibleVendors: ONLY eligible: true rows, ranked. Empty array if none qualify.
- recommendationSummary: 2-4 bullets only, decision-ready, grounded in the complete report JSON below.

Use only information supported by the complete report. If the report is thin, state that conservatively.`;

function extractJsonObject(text: string): Record<string, unknown> | null {
  const t = text.trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function asPriorityArray(raw: unknown): BuyerPriorityWeight[] {
  if (!Array.isArray(raw)) return [];
  const out: BuyerPriorityWeight[] = [];
  for (const item of raw) {
    const o = item as Record<string, unknown>;
    const priority = String(o.priority ?? "").trim();
    const w = Math.round(Number(o.weightPercent));
    if (!priority || !Number.isFinite(w) || w < 1) continue;
    out.push({
      priority: priority.slice(0, 200),
      weightPercent: Math.min(100, w),
      notes: o.notes != null ? String(o.notes).slice(0, 400) : undefined,
    });
  }
  return out;
}

function asRankedArray(raw: unknown): RankedEligibleVendor[] {
  if (!Array.isArray(raw)) return [];
  const out: RankedEligibleVendor[] = [];
  let i = 0;
  for (const item of raw) {
    const o = item as Record<string, unknown>;
    if (!Boolean(o.eligible)) continue;
    const vendorName = String(o.vendorName ?? "").trim() || "Vendor";
    const productName = String(o.productName ?? "").trim() || "Product";
    const overallScore = Number(o.overallScore);
    i += 1;
    out.push({
      rank: Number.isFinite(Number(o.rank)) ? Math.max(1, Math.round(Number(o.rank))) : i,
      vendorName: vendorName.slice(0, 200),
      productName: productName.slice(0, 200),
      eligible: true,
      overallScore: Number.isFinite(overallScore) ? clampScore2(overallScore) : undefined,
      notes: o.notes != null ? String(o.notes).slice(0, 500) : undefined,
    });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

function asMatrixArray(raw: unknown): ComparisonMatrixRow[] {
  if (!Array.isArray(raw)) return [];
  const out: ComparisonMatrixRow[] = [];
  for (const item of raw) {
    const o = item as Record<string, unknown>;
    const dimension = String(o.dimension ?? "").trim();
    if (!dimension) continue;
    const cellsRaw = Array.isArray(o.cells) ? o.cells : [];
    const cells = cellsRaw
      .map((c) => {
        const x = c as Record<string, unknown>;
        return {
          vendorLabel: String(x.vendorLabel ?? "").slice(0, 300),
          highlight: String(x.highlight ?? "").slice(0, 1200),
        };
      })
      .filter((c) => c.vendorLabel && c.highlight);
    if (cells.length > 0) out.push({ dimension: dimension.slice(0, 120), cells });
  }
  return out;
}

function asGapsArray(raw: unknown): CapabilityGapsByVendor[] {
  if (!Array.isArray(raw)) return [];
  const out: CapabilityGapsByVendor[] = [];
  for (const item of raw) {
    const o = item as Record<string, unknown>;
    const vendorLabel = String(o.vendorLabel ?? "").trim();
    const gaps = Array.isArray(o.gaps)
      ? (o.gaps as unknown[]).map((g) => String(g).slice(0, 500)).filter(Boolean)
      : [];
    if (vendorLabel && gaps.length > 0) out.push({ vendorLabel: vendorLabel.slice(0, 300), gaps: gaps.slice(0, 20) });
  }
  return out;
}

function asSummaryArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[]).map((s) => String(s).slice(0, 500)).filter(Boolean).slice(0, 4);
}

function normalizePayload(
  raw: Record<string, unknown>,
  fallback: VendorComparisonMatrixPayload,
): VendorComparisonMatrixPayload {
  const priorities = asPriorityArray(raw.buyerPrioritiesAndWeights);
  const ranked = asRankedArray(raw.rankedEligibleVendors);
  const matrix = asMatrixArray(raw.comparisonMatrix);
  const gaps = asGapsArray(raw.capabilityGapsByVendor);
  const summary = asSummaryArray(raw.recommendationSummary);
  return {
    buyerPrioritiesAndWeights: priorities.length > 0 ? priorities : fallback.buyerPrioritiesAndWeights,
    rankedEligibleVendors: ranked.length > 0 ? ranked : fallback.rankedEligibleVendors,
    comparisonMatrix: matrix.length > 0 ? matrix : fallback.comparisonMatrix,
    capabilityGapsByVendor: gaps.length > 0 ? gaps : fallback.capabilityGapsByVendor,
    recommendationSummary: summary.length > 0 ? summary : fallback.recommendationSummary,
  };
}

function fallbackFromCompleteReport(complete: Record<string, unknown>): VendorComparisonMatrixPayload {
  return {
    buyerPrioritiesAndWeights: asPriorityArray(complete.buyerPrioritiesAndWeights),
    rankedEligibleVendors: asRankedArray(complete.rankedEligibleVendors),
    comparisonMatrix: asMatrixArray(complete.comparisonMatrix),
    capabilityGapsByVendor: asGapsArray(complete.capabilityGapsByVendor),
    recommendationSummary: asSummaryArray(complete.recommendationSummary),
  };
}

async function invokeModel(prompt: string): Promise<string> {
  return invokeBedrockAnthropicText({
    prompt,
    maxTokens: 8192,
    temperature: 0.3,
    feature: "reports",
  });
}

/**
 * Generate Vendor Comparison Matrix sections (34–38) from the enriched complete buyer vendor risk report JSON.
 */
export async function generateVendorComparisonMatrixFromCompleteReport(
  completeReport: Record<string, unknown>,
  extraContext: string,
): Promise<VendorComparisonMatrixPayload> {
  const fb = fallbackFromCompleteReport(completeReport);
  const userPrompt = [
    PROMPT,
    "",
    "--- Optional additional context (e.g. analysis report from same assessment) ---",
    extraContext.slice(0, 12000),
    "",
    "--- Complete buyer vendor risk report (JSON) ---",
    JSON.stringify(completeReport, null, 2).slice(0, 24000),
    "",
    "Respond with ONLY the JSON object for the five keys above.",
  ].join("\n");

  try {
    const rawText = await invokeModel(userPrompt);
    const parsed = extractJsonObject(rawText);
    if (parsed) return normalizePayload(parsed, fb);
  } catch (e) {
    if (isTokenQuotaExceededError(e)) throw e;
    console.error("generateVendorComparisonMatrixFromCompleteReport LLM error:", e);
  }
  return fb;
}
