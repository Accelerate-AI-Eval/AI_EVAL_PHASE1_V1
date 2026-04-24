import "dotenv/config";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
const REGION = process.env.AWS_DEFAULT_REGION || "us-east-1";
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-sonnet-20240229-v1:0";
const client = new BedrockRuntimeClient({ region: REGION });
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
function extractJsonObject(text) {
    const t = text.trim();
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start < 0 || end <= start)
        return null;
    try {
        return JSON.parse(t.slice(start, end + 1));
    }
    catch {
        return null;
    }
}
function asPriorityArray(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const item of raw) {
        const o = item;
        const priority = String(o.priority ?? "").trim();
        const w = Math.round(Number(o.weightPercent));
        if (!priority || !Number.isFinite(w) || w < 1)
            continue;
        out.push({
            priority: priority.slice(0, 200),
            weightPercent: Math.min(100, w),
            notes: o.notes != null ? String(o.notes).slice(0, 400) : undefined,
        });
    }
    return out;
}
function asRankedArray(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    let i = 0;
    for (const item of raw) {
        const o = item;
        if (!Boolean(o.eligible))
            continue;
        const vendorName = String(o.vendorName ?? "").trim() || "Vendor";
        const productName = String(o.productName ?? "").trim() || "Product";
        const overallScore = Number(o.overallScore);
        i += 1;
        out.push({
            rank: Number.isFinite(Number(o.rank)) ? Math.max(1, Math.round(Number(o.rank))) : i,
            vendorName: vendorName.slice(0, 200),
            productName: productName.slice(0, 200),
            eligible: true,
            overallScore: Number.isFinite(overallScore) ? Math.min(100, Math.max(0, Math.round(overallScore))) : undefined,
            notes: o.notes != null ? String(o.notes).slice(0, 500) : undefined,
        });
    }
    return out.sort((a, b) => a.rank - b.rank);
}
function asMatrixArray(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const item of raw) {
        const o = item;
        const dimension = String(o.dimension ?? "").trim();
        if (!dimension)
            continue;
        const cellsRaw = Array.isArray(o.cells) ? o.cells : [];
        const cells = cellsRaw
            .map((c) => {
            const x = c;
            return {
                vendorLabel: String(x.vendorLabel ?? "").slice(0, 300),
                highlight: String(x.highlight ?? "").slice(0, 1200),
            };
        })
            .filter((c) => c.vendorLabel && c.highlight);
        if (cells.length > 0)
            out.push({ dimension: dimension.slice(0, 120), cells });
    }
    return out;
}
function asGapsArray(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const item of raw) {
        const o = item;
        const vendorLabel = String(o.vendorLabel ?? "").trim();
        const gaps = Array.isArray(o.gaps)
            ? o.gaps.map((g) => String(g).slice(0, 500)).filter(Boolean)
            : [];
        if (vendorLabel && gaps.length > 0)
            out.push({ vendorLabel: vendorLabel.slice(0, 300), gaps: gaps.slice(0, 20) });
    }
    return out;
}
function asSummaryArray(raw) {
    if (!Array.isArray(raw))
        return [];
    return raw.map((s) => String(s).slice(0, 500)).filter(Boolean).slice(0, 4);
}
function normalizePayload(raw, fallback) {
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
function fallbackFromCompleteReport(complete) {
    return {
        buyerPrioritiesAndWeights: asPriorityArray(complete.buyerPrioritiesAndWeights),
        rankedEligibleVendors: asRankedArray(complete.rankedEligibleVendors),
        comparisonMatrix: asMatrixArray(complete.comparisonMatrix),
        capabilityGapsByVendor: asGapsArray(complete.capabilityGapsByVendor),
        recommendationSummary: asSummaryArray(complete.recommendationSummary),
    };
}
async function invokeModel(prompt) {
    const body = JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 8192,
        temperature: 0.3,
        messages: [{ role: "user", content: [{ type: "text", text: prompt }] }],
    });
    const command = new InvokeModelCommand({
        modelId: MODEL_ID,
        contentType: "application/json",
        accept: "application/json",
        body,
    });
    const response = await client.send(command);
    const result = JSON.parse(new TextDecoder().decode(response.body));
    return result.content?.[0]?.text ?? "";
}
/**
 * Generate Vendor Comparison Matrix sections (34–38) from the enriched complete buyer vendor risk report JSON.
 */
export async function generateVendorComparisonMatrixFromCompleteReport(completeReport, extraContext) {
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
        if (parsed)
            return normalizePayload(parsed, fb);
    }
    catch (e) {
        console.error("generateVendorComparisonMatrixFromCompleteReport LLM error:", e);
    }
    return fb;
}
