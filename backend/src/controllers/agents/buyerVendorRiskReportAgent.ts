import "dotenv/config";
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import {
  getTop5RisksWithMitigations,
  formatTop5RisksForPrompt,
} from "../../services/getTop5RisksFromAssessmentContext.js";
import { calculateBuyerImplementationRiskScore } from "../../services/buyerImplementationRiskScore.js";

const REGION = process.env.AWS_DEFAULT_REGION || "us-east-1";
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "anthropic.claude-3-sonnet-20240229-v1:0";
const client = new BedrockRuntimeClient({ region: REGION });

export type VendorRiskRecommendation = {
  priority: "High" | "Medium" | "Low";
  title: string;
  description: string;
  timeline: string;
};

/** How this domain is classified for display (vendor-side, buyer-side, or combined). */
export type RiskScope = "vendor" | "buyer" | "both";

export type VendorRiskDomain = {
  domain: string;
  riskScore: number;
  summary: string;
  /** Primary lens for UI grouping; omit/legacy → treated as "both". */
  riskScope?: RiskScope;
};

export type BuyerPriorityWeight = {
  priority: string;
  weightPercent: number;
  notes?: string;
};

export type RankedEligibleVendor = {
  rank: number;
  vendorName: string;
  productName: string;
  eligible: boolean;
  overallScore?: number;
  notes?: string;
};

export type ComparisonMatrixRow = {
  dimension: string;
  cells: { vendorLabel: string; highlight: string }[];
};

export type CapabilityGapsByVendor = {
  vendorLabel: string;
  gaps: string[];
};

export type FrameworkMappingReportBlock = {
  rows: Array<{
    framework?: string;
    coverage?: string;
    controls?: string;
    notes?: string;
  }>;
};

export type BuyerVendorRiskReport = {
  generatedAt: string;
  overallRiskScore: number;
  implementationRiskScore?: number;
  /** Letter grade (A–D) from implementation risk formula; matches rounded IRS. */
  implementationReadinessGrade?: string;
  implementationRiskClassification?: string;
  implementationRiskDecision?: string;
  implementationRiskRecommendedAction?: string;
  implementationRiskBreakdown?: Record<string, unknown>;
  recommendationLabel: string;
  executiveSummary: string;
  keyStrengths: string[];
  areasForImprovement: string[];
  riskAnalysis: VendorRiskDomain[];
  recommendations: VendorRiskRecommendation[];
  implementationNotes: string;
  /** Explicit buyer decision criteria with weights (sum ~100). */
  buyerPrioritiesAndWeights: BuyerPriorityWeight[];
  /** Eligible vendors only in ranked order (this assessment is single-vendor; one row). */
  rankedEligibleVendors: RankedEligibleVendor[];
  /** Side-by-side style rows: trust, risk buckets, requirements, security/compliance. */
  comparisonMatrix: ComparisonMatrixRow[];
  capabilityGapsByVendor: CapabilityGapsByVendor[];
  /** 2–4 bullets synthesizing the full report. */
  recommendationSummary: string[];
};

const SYSTEM_PROMPT = `You are an enterprise AI risk analyst. Output ONLY valid JSON (no markdown, no code fences).

The JSON must match this structure exactly:
{
  "overallRiskScore": <integer 0-100, higher = safer/better fit>,
  "recommendationLabel": "<e.g. Recommended for Approval | Conditional Approval | Further Review Required>",
  "executiveSummary": "<3-5 sentences combining buyer context and vendor attestation; MUST explicitly mention 'Vendor trust score: <overallRiskScore>/100'>",
  "keyStrengths": ["<6-10 short bullet strings from attestation: certs, SLA, security, compliance>"],
  "areasForImprovement": ["<4-8 caution items: gaps, residual risks, deployment limits>"],
  "riskAnalysis": [
    { "domain": "Data Privacy & Protection", "riskScope": "both", "riskScore": <1-10 lower=better>, "summary": "<2-4 sentences per Rules>" },
    { "domain": "Security Controls & Infrastructure", "riskScope": "vendor", "riskScore": <1-10>, "summary": "<2-4 sentences per Rules>" },
    { "domain": "Regulatory Compliance", "riskScope": "buyer", "riskScore": <1-10>, "summary": "<2-4 sentences per Rules>" },
    { "domain": "AI Governance & Ethics", "riskScope": "buyer", "riskScore": <1-10>, "summary": "<2-4 sentences per Rules>" },
    { "domain": "Operational Resilience", "riskScope": "both", "riskScore": <1-10>, "summary": "<2-4 sentences per Rules>" },
    { "domain": "Vendor Financial Stability", "riskScope": "vendor", "riskScore": <1-10>, "summary": "<2-4 sentences per Rules>" },
    { "domain": "Integration & Technical Architecture", "riskScope": "buyer", "riskScore": <1-10>, "summary": "<2-4 sentences per Rules>" },
    { "domain": "Model Reliability & Hallucination Risk", "riskScope": "both", "riskScore": <1-10>, "summary": "<2-4 sentences per Rules>" },
    { "domain": "Vendor Lock-in & Portability", "riskScope": "both", "riskScore": <1-10>, "summary": "<2-4 sentences per Rules>" },
    { "domain": "Third-Party & Supply Chain Risk", "riskScope": "vendor", "riskScore": <1-10>, "summary": "<2-4 sentences per Rules>" }
  ],
  "recommendations": [
    { "priority": "High|Medium|Low", "title": "<short>", "description": "<actionable>", "timeline": "<e.g. Immediate, Within 30 days>" }
  ],
  "implementationNotes": "<single paragraph: phased rollout, pilot, governance, metrics; tailored to buyer timeline and maturity>",
  "buyerPrioritiesAndWeights": [
    { "priority": "<short criterion label>", "weightPercent": <integer 5-35>, "notes": "<tied to buyer answers>" }
  ],
  "rankedEligibleVendors": [
    {
      "rank": 1,
      "vendorName": "<from input>",
      "productName": "<from input>",
      "eligible": <true if vendor meets minimum bar for this buyer; false only with clear disqualifier in inputs>,
      "overallScore": <same scale as overallRiskScore 0-100>,
      "notes": "<optional eligibility nuance>"
    }
  ],
  "comparisonMatrix": [
    { "dimension": "Trust", "cells": [ { "vendorLabel": "<Vendor – Product>", "highlight": "<2-4 sentences: attestation depth, transparency, evidence>" } ] },
    { "dimension": "Risk buckets", "cells": [ { "vendorLabel": "<Vendor – Product>", "highlight": "<summarize high/medium/low risk themes from riskAnalysis>" } ] },
    { "dimension": "Key requirements coverage", "cells": [ { "vendorLabel": "<Vendor – Product>", "highlight": "<map buyer integrations, data sensitivity, timeline, governance to vendor evidence>" } ] },
    { "dimension": "Security & compliance", "cells": [ { "vendorLabel": "<Vendor – Product>", "highlight": "<certs, hosting, IR, residency, logging; gaps>" } ] }
  ],
  "capabilityGapsByVendor": [
    { "vendorLabel": "<Vendor – Product>", "gaps": ["<specific gap vs buyer need>", "..."] }
  ],
  "recommendationSummary": ["<exactly 2-4 bullets synthesizing the FULL report below — combine themes from executiveSummary, keyStrengths, areasForImprovement, riskAnalysis, comparisonMatrix, and recommendations; decision-ready tone; do not paste section titles only>"]
}

Rules for riskAnalysis: Each object MUST include "riskScope": exactly one of "vendor", "buyer", or "both".
- "vendor": domain is primarily supplier/attestation/product evidence (controls, subprocessors, SLAs, vendor viability).
- "buyer": domain is primarily buyer-side context (requirements, obligations, internal governance, stack, sensitivity).
- "both": material exposure from vendor and buyer sides together; use for cross-cutting domains.
Use the example spread above (3 vendor, 3 buyer, 4 both) unless inputs clearly warrant a different mix.
For "summary": If riskScope is "vendor", focus on vendor-side factors (still mention buyer implications in one clause if needed). If "buyer", focus on buyer context. If "both", explicitly address vendor risk and buyer risk (e.g. "Vendor risk: … Buyer risk: …").

Rules for buyerPrioritiesAndWeights: include 5-7 items; weightPercent values must be positive integers summing to 100 (±2 allowed; prefer exactly 100).

Rules for rankedEligibleVendors: include ONLY vendors with eligible: true, in rank order (1, 2, …). If the assessed vendor is not eligible, use an empty array []. For this workflow there is at most one vendor/product pair. Do not include ineligible rows.

Rules for comparisonMatrix: use exactly these four dimension strings in order: "Trust", "Risk buckets", "Key requirements coverage", "Security & compliance".

CRITICAL ORDER: Put actionable "recommendations" BEFORE "implementationNotes" in your reasoning; recommendations must address gaps between buyer requirements (regulatory, data sensitivity, integrations, gaps) and vendor attestation. Include 5-8 recommendations with mixed priorities.

If the user message includes a block "--- Database-matched top risks and mitigations ---", those rows come from the same risk_mappings and risk_top5_mitigations database tables used for vendor assessments (matched to this buyer context). You MUST weight overallRiskScore and riskAnalysis against those catalog risks; reference their themes and the listed mitigations in recommendations and implementationNotes where relevant. Do not invent fake risk IDs; narrate using the provided titles/descriptions.

Use only facts inferable from the inputs. If attestation data is sparse, say so in summaries and score conservatively.`;

function ensureExecutiveSummaryHasTrustScore(summary: string, overallRiskScore: number): string {
  const trustPattern = /vendor\s+trust\s+score\s*:/i;
  const scoreText = `Vendor trust score: ${overallRiskScore}/100.`;
  const cleanSummary = summary.trim();
  if (!cleanSummary) return scoreText;
  if (trustPattern.test(cleanSummary)) return cleanSummary;
  return `${scoreText} ${cleanSummary}`.slice(0, 4000);
}

function vendorProductLabel(vendorName: string, productName: string): string {
  const v = vendorName.trim() || "Vendor";
  const p = productName.trim() || "Product";
  return `${v} – ${p}`;
}

function defaultBuyerPrioritiesFromContext(ctx: BuyerReportEnrichContext): BuyerPriorityWeight[] {
  const reg = ctx.regulatorySnippet ? ` (${ctx.regulatorySnippet.slice(0, 80)})` : "";
  return [
    { priority: "Regulatory & compliance fit", weightPercent: 22, notes: `Mapped to stated requirements${reg}.` },
    { priority: "Security & data protection", weightPercent: 22, notes: `Sensitivity: ${ctx.dataSensitivity || "not specified"}.` },
    { priority: "Integration & technical fit", weightPercent: 18, notes: `Stacks and systems from assessment.` },
    { priority: "AI governance & oversight", weightPercent: 14, notes: `Governance maturity: ${ctx.governanceMaturity || "not specified"}.` },
    { priority: "Operational resilience & SLA", weightPercent: 12, notes: `Criticality: ${ctx.criticality || "not specified"}.` },
    { priority: "Time-to-value & rollout", weightPercent: 12, notes: `Timeline: ${ctx.targetTimeline || "not specified"}.` },
  ];
}

function buildRecommendationSummaryFromFullReport(
  executiveSummary: string,
  keyStrengths: string[],
  areasForImprovement: string[],
  recommendations: VendorRiskRecommendation[],
): string[] {
  const bullets: string[] = [];
  const exec = executiveSummary.trim();
  if (exec.length > 0) {
    const first = exec.split(/(?<=[.!?])\s+/)[0]?.trim() ?? exec;
    bullets.push(first.length > 280 ? `${first.slice(0, 277)}…` : first);
  }
  for (const s of keyStrengths.slice(0, 1)) {
    if (bullets.length >= 4) break;
    const t = s.trim();
    if (t) bullets.push(`Strength to leverage: ${t}`.slice(0, 280));
  }
  for (const g of areasForImprovement.slice(0, 2)) {
    if (bullets.length >= 4) break;
    bullets.push(`Gap to address: ${g}`.slice(0, 280));
  }
  for (const r of recommendations.slice(0, 2)) {
    if (bullets.length >= 4) break;
    const tail = r.description.trim().slice(0, 100);
    bullets.push(
      `${r.priority} — ${r.title}${tail ? `: ${tail}${r.description.length > 100 ? "…" : ""}` : ""}`.slice(0, 280),
    );
  }
  const out = bullets.filter(Boolean).slice(0, 4);
  if (out.length === 0) {
    return ["Review the full report sections below and validate residual risks before commitment."];
  }
  return out.length >= 2
    ? out
    : [...out, "Validate residual risks and contractual controls before production commitment."];
}

function defaultStructuredSections(
  vendorName: string,
  productName: string,
  hasAttestation: boolean,
  overallRiskScore: number,
  keyStrengths: string[],
  areasForImprovement: string[],
  riskAnalysis: VendorRiskDomain[],
  recommendations: VendorRiskRecommendation[],
  executiveSummary: string,
  ctx: BuyerReportEnrichContext,
): Pick<
  BuyerVendorRiskReport,
  | "buyerPrioritiesAndWeights"
  | "rankedEligibleVendors"
  | "comparisonMatrix"
  | "capabilityGapsByVendor"
  | "recommendationSummary"
> {
  const label = vendorProductLabel(vendorName, productName);
  const eligible = hasAttestation || overallRiskScore >= 58;
  const highDomains = riskAnalysis.filter((d) => d.riskScore >= 6).map((d) => d.domain);
  const bucketText =
    highDomains.length > 0
      ? `Elevated attention: ${highDomains.slice(0, 4).join(", ")}. Other domains within typical bounds based on available evidence.`
      : "No single domain stands out as extreme; validate residual risk in diligence.";

  const summary = buildRecommendationSummaryFromFullReport(
    executiveSummary,
    keyStrengths,
    areasForImprovement,
    recommendations,
  );

  return {
    buyerPrioritiesAndWeights: defaultBuyerPrioritiesFromContext(ctx),
    rankedEligibleVendors: eligible
      ? [
          {
            rank: 1,
            vendorName: vendorName.trim() || "Vendor",
            productName: productName.trim() || "Product",
            eligible: true,
            overallScore: overallRiskScore,
            notes: hasAttestation
              ? "Eligible for shortlist with attestation on file."
              : "Eligible pending supplemental vendor evidence.",
          },
        ]
      : [],
    comparisonMatrix: [
      {
        dimension: "Trust",
        cells: [
          {
            vendorLabel: label,
            highlight: hasAttestation
              ? "Vendor self-attestation is available; corroborate claims with SOC reports and contractual terms."
              : "Limited buyer-visible attestation; prioritize direct security and compliance artifacts.",
          },
        ],
      },
      {
        dimension: "Risk buckets",
        cells: [{ vendorLabel: label, highlight: bucketText }],
      },
      {
        dimension: "Key requirements coverage",
        cells: [
          {
            vendorLabel: label,
            highlight:
              "Cross-check integration, data handling, and governance expectations from the buyer assessment against vendor disclosures; gaps drive remediation items below.",
          },
        ],
      },
      {
        dimension: "Security & compliance",
        cells: [
          {
            vendorLabel: label,
            highlight:
              "Review certificates, hosting model, incident response, and residency options against regulatory and sensitivity requirements stated in the assessment.",
          },
        ],
      },
    ],
    capabilityGapsByVendor: [
      {
        vendorLabel: label,
        gaps: areasForImprovement.length > 0 ? areasForImprovement.slice(0, 8) : ["Gather evidence for open requirements in the assessment."],
      },
    ],
    recommendationSummary: summary.slice(0, 4),
  };
}

function buildFallbackReport(
  vendorName: string,
  productName: string,
  hasAttestation: boolean,
): BuyerVendorRiskReport {
  const now = new Date().toISOString();
  const overallRiskScore = hasAttestation ? 75 : 55;
  const executiveSummaryBase = `This assessment evaluates ${vendorName}'s ${productName} against your stated requirements. ${
    hasAttestation
      ? "Vendor self-attestation data was available and informs this summary."
      : "A matching public vendor attestation was not found; strengthen due diligence with direct vendor evidence."
  } Review recommendations before implementation.`;
  const executiveSummary = ensureExecutiveSummaryHasTrustScore(executiveSummaryBase, overallRiskScore);
  const areasForImprovement = [
    "Confirm data residency and sub-processor alignment with your policies.",
    "Define human-in-the-loop controls for high-stakes AI decisions.",
    "Map integration requirements to vendor API and SSO capabilities.",
  ];
  const riskAnalysis: VendorRiskDomain[] = [
    {
      domain: "Data Privacy & Protection",
      riskScope: "both",
      riskScore: 4,
      summary:
        "Vendor risk: confirm what the vendor attests for data handling, retention, and subprocessors. Buyer risk: your sensitivity and residency rules may require tighter controls than the vendor’s default.",
    },
    {
      domain: "Security Controls & Infrastructure",
      riskScope: "vendor",
      riskScore: 4,
      summary:
        "Vendor risk: request SOC 2, pen test summaries, and encryption posture. Buyer risk: your integration and identity model determines how much exposure you inherit in production.",
    },
    {
      domain: "Regulatory Compliance",
      riskScope: "buyer",
      riskScore: 5,
      summary:
        "Vendor risk: map certifications and compliance scope to the product. Buyer risk: your sector and obligations may exceed what the vendor’s attestations cover.",
    },
    {
      domain: "AI Governance & Ethics",
      riskScope: "buyer",
      riskScore: 5,
      summary:
        "Vendor risk: review documented model governance and acceptable use. Buyer risk: internal AI policies and oversight must close gaps for your use cases.",
    },
    {
      domain: "Operational Resilience",
      riskScope: "both",
      riskScore: 4,
      summary:
        "Vendor risk: validate SLA, uptime, and incident response. Buyer risk: your criticality and recovery objectives drive how much residual downtime risk is acceptable.",
    },
    {
      domain: "Vendor Financial Stability",
      riskScope: "vendor",
      riskScore: 3,
      summary:
        "Vendor risk: assess supplier viability and roadmap commitment. Buyer risk: long-term dependency may be unacceptable if procurement or continuity standards are strict.",
    },
    {
      domain: "Integration & Technical Architecture",
      riskScope: "buyer",
      riskScore: 5,
      summary:
        "Vendor risk: APIs, SSO, and hosting options from the product. Buyer risk: your stack and security architecture determine integration complexity and attack surface.",
    },
    {
      domain: "Model Reliability & Hallucination Risk",
      riskScope: "both",
      riskScore: 6,
      summary:
        "Vendor risk: transparency on model limits and monitoring. Buyer risk: high-stakes decisions amplify harm if outputs are wrong—design human review accordingly.",
    },
    {
      domain: "Vendor Lock-in & Portability",
      riskScope: "both",
      riskScore: 5,
      summary:
        "Vendor risk: export, APIs, and data portability terms. Buyer risk: your exit and multi-vendor strategy affects acceptable lock-in.",
    },
    {
      domain: "Third-Party & Supply Chain Risk",
      riskScope: "vendor",
      riskScore: 4,
      summary:
        "Vendor risk: sub-processors and cloud chain for this product. Buyer risk: your third-party risk program may require additional due diligence or contractual pass-through.",
    },
  ];
  const recommendations: VendorRiskRecommendation[] = [
    {
      priority: "High",
      title: "Establish data governance for AI use case",
      description:
        "Define data classification, retention, and access rules aligned with the sensitivity level you selected in the assessment.",
      timeline: "Immediate",
    },
    {
      priority: "High",
      title: "Integration and security review",
      description:
        "Run a structured review of SSO, APIs, and logging against your integration and audit requirements.",
      timeline: "Within 30 days",
    },
    {
      priority: "Medium",
      title: "Pilot with clear success metrics",
      description: "Scope a limited pilot tied to the business outcomes and timeline you documented.",
      timeline: "Within 60 days",
    },
    {
      priority: "Medium",
      title: "User training and change management",
      description: "Train users on limitations of generative AI and approved use cases.",
      timeline: "Before production rollout",
    },
    {
      priority: "Low",
      title: "Ongoing monitoring",
      description: "Track model behavior, incidents, and vendor updates on a quarterly cadence.",
      timeline: "Ongoing",
    },
  ];
  const keyStrengths = hasAttestation
    ? [
        "Vendor completed a self-attestation visible to buyers.",
        "Product profile and trust indicators are on file.",
        "Review attestation sections in the product profile for detail.",
      ]
    : [
        "Complete vendor questionnaire and request SOC 2 / security documentation.",
        "Validate product fit against your integration and regulatory requirements.",
      ];
  const ctx: BuyerReportEnrichContext = {};
  const structured = defaultStructuredSections(
    vendorName,
    productName,
    hasAttestation,
    overallRiskScore,
    keyStrengths,
    areasForImprovement,
    riskAnalysis,
    recommendations,
    executiveSummary,
    ctx,
  );
  return {
    generatedAt: now,
    overallRiskScore,
    recommendationLabel: hasAttestation
      ? "Conditional approval — review gaps below"
      : "Further review required — limited vendor attestation data",
    executiveSummary,
    keyStrengths,
    areasForImprovement,
    riskAnalysis,
    recommendations,
    implementationNotes: `Phased approach: (1) Complete security and legal review; (2) Deploy to a pilot group aligned with your implementation team composition; (3) Measure against your success metrics before broader rollout. Adjust timeline to your target implementation window and budget range.`,
    ...structured,
  };
}

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

function parseBuyerPriorities(raw: unknown): BuyerPriorityWeight[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
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
  return out.length > 0 ? out : null;
}

/** Eligible vendors only; empty array if LLM returned none eligible. Null if field missing/invalid. */
function parseRankedVendors(raw: unknown): RankedEligibleVendor[] | null {
  if (!Array.isArray(raw)) return null;
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
      overallScore: Number.isFinite(overallScore) ? Math.min(100, Math.max(0, Math.round(overallScore))) : undefined,
      notes: o.notes != null ? String(o.notes).slice(0, 500) : undefined,
    });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

function parseComparisonMatrix(raw: unknown): ComparisonMatrixRow[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
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
  return out.length > 0 ? out : null;
}

function parseCapabilityGaps(raw: unknown): CapabilityGapsByVendor[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: CapabilityGapsByVendor[] = [];
  for (const item of raw) {
    const o = item as Record<string, unknown>;
    const vendorLabel = String(o.vendorLabel ?? "").trim();
    const gaps = Array.isArray(o.gaps)
      ? (o.gaps as unknown[]).map((g) => String(g).slice(0, 500)).filter(Boolean)
      : [];
    if (vendorLabel && gaps.length > 0) out.push({ vendorLabel: vendorLabel.slice(0, 300), gaps: gaps.slice(0, 20) });
  }
  return out.length > 0 ? out : null;
}

function parseRecommendationSummary(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const bullets = (raw as unknown[]).map((s) => String(s).slice(0, 500)).filter(Boolean);
  if (bullets.length === 0) return null;
  return bullets.slice(0, 4);
}

function normalizeRiskScope(v: unknown, fallback: RiskScope): RiskScope {
  const s = String(v ?? "").toLowerCase().trim();
  if (s === "vendor" || s === "buyer" || s === "both") return s;
  return fallback;
}

function normalizeReport(
  raw: Record<string, unknown>,
  vendorName: string,
  productName: string,
  hasAttestation: boolean,
): BuyerVendorRiskReport {
  const fb = buildFallbackReport(vendorName, productName, hasAttestation);
  const score = Number(raw.overallRiskScore);
  const recs = Array.isArray(raw.recommendations)
    ? (raw.recommendations as unknown[])
        .map((r) => {
          const o = r as Record<string, unknown>;
          const p = String(o.priority ?? "Medium");
          const pr: VendorRiskRecommendation["priority"] = p === "High" || p === "Low" ? p : "Medium";
          return {
            priority: pr,
            title: String(o.title ?? "Recommendation").slice(0, 200),
            description: String(o.description ?? "").slice(0, 800),
            timeline: String(o.timeline ?? "TBD").slice(0, 120),
          };
        })
        .filter((x) => x.title)
    : fb.recommendations;

  const domains = Array.isArray(raw.riskAnalysis)
    ? (raw.riskAnalysis as unknown[]).map((d, i) => {
        const o = d as Record<string, unknown>;
        const domain = String(o.domain ?? fb.riskAnalysis[i]?.domain ?? `Domain ${i + 1}`);
        const rs = Math.min(10, Math.max(1, Number(o.riskScore) || 5));
        const fbRow = fb.riskAnalysis[i] as VendorRiskDomain | undefined;
        const riskScope = normalizeRiskScope(o.riskScope, fbRow?.riskScope ?? "both");
        return {
          domain,
          riskScore: rs,
          summary: String(o.summary ?? "").slice(0, 600),
          riskScope,
        };
      })
    : fb.riskAnalysis;

  const overallRiskScore = Number.isFinite(score) ? Math.min(100, Math.max(0, Math.round(score))) : fb.overallRiskScore;
  const keyStrengths = Array.isArray(raw.keyStrengths)
    ? (raw.keyStrengths as unknown[]).map((s) => String(s).slice(0, 400)).filter(Boolean)
    : fb.keyStrengths;
  const areasForImprovement = Array.isArray(raw.areasForImprovement)
    ? (raw.areasForImprovement as unknown[]).map((s) => String(s).slice(0, 500)).filter(Boolean)
    : fb.areasForImprovement;
  const executiveSummary = ensureExecutiveSummaryHasTrustScore(
    String(raw.executiveSummary ?? fb.executiveSummary).slice(0, 4000),
    overallRiskScore,
  );
  const recommendations = recs.length > 0 ? recs : fb.recommendations;
  const riskAnalysis = domains.length >= 5 ? domains : fb.riskAnalysis;

  const ctx: BuyerReportEnrichContext = {};
  const defaults = defaultStructuredSections(
    vendorName,
    productName,
    hasAttestation,
    overallRiskScore,
    keyStrengths,
    areasForImprovement,
    riskAnalysis,
    recommendations,
    executiveSummary,
    ctx,
  );

  const buyerPrioritiesAndWeights = parseBuyerPriorities(raw.buyerPrioritiesAndWeights) ?? defaults.buyerPrioritiesAndWeights;
  const parsedRanked = parseRankedVendors(raw.rankedEligibleVendors);
  const rankedEligibleVendors =
    parsedRanked !== null ? parsedRanked : defaults.rankedEligibleVendors;
  const comparisonMatrix = parseComparisonMatrix(raw.comparisonMatrix) ?? defaults.comparisonMatrix;
  const capabilityGapsByVendor = parseCapabilityGaps(raw.capabilityGapsByVendor) ?? defaults.capabilityGapsByVendor;
  const recommendationSummary = parseRecommendationSummary(raw.recommendationSummary) ?? defaults.recommendationSummary;
  const implementationRiskScoreRaw = Number(raw.implementationRiskScore);
  const implementationRiskScore = Number.isFinite(implementationRiskScoreRaw)
    ? Math.min(100, Math.max(0, Number(implementationRiskScoreRaw.toFixed(2))))
    : undefined;
  const implementationRiskClassification =
    raw.implementationRiskClassification != null
      ? String(raw.implementationRiskClassification).slice(0, 120)
      : undefined;
  const implementationRiskDecision =
    raw.implementationRiskDecision != null
      ? String(raw.implementationRiskDecision).slice(0, 120)
      : undefined;
  const implementationRiskRecommendedAction =
    raw.implementationRiskRecommendedAction != null
      ? String(raw.implementationRiskRecommendedAction).slice(0, 500)
      : undefined;
  const implementationRiskBreakdown =
    raw.implementationRiskBreakdown != null && typeof raw.implementationRiskBreakdown === "object"
      ? (raw.implementationRiskBreakdown as Record<string, unknown>)
      : undefined;

  return {
    generatedAt: new Date().toISOString(),
    overallRiskScore,
    implementationRiskScore,
    implementationRiskClassification,
    implementationRiskDecision,
    implementationRiskRecommendedAction,
    implementationRiskBreakdown,
    recommendationLabel: String(raw.recommendationLabel ?? fb.recommendationLabel).slice(0, 200),
    executiveSummary,
    keyStrengths,
    areasForImprovement,
    riskAnalysis,
    recommendations,
    implementationNotes: String(raw.implementationNotes ?? fb.implementationNotes).slice(0, 6000),
    buyerPrioritiesAndWeights,
    rankedEligibleVendors,
    comparisonMatrix,
    capabilityGapsByVendor,
    recommendationSummary,
  };
}

async function invokeModel(prompt: string): Promise<string> {
  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 8192,
    temperature: 0.35,
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
 * Generate Vendor Risk Assessment Report from buyer assessment payload + optional vendor attestation row.
 */
export async function generateBuyerVendorRiskReport(
  buyerPayload: Record<string, unknown>,
  attestationRow: Record<string, unknown> | null,
  vendorName: string,
  productName: string,
): Promise<BuyerVendorRiskReport> {
  const hasAttestation = attestationRow != null;
  const implementationRisk = calculateBuyerImplementationRiskScore(
    buyerPayload,
    attestationRow,
    vendorName,
    productName,
  );
  const attestationSlice: Record<string, unknown> = attestationRow
    ? {
        product_name: attestationRow.product_name,
        security_compliance_certificates: attestationRow.security_compliance_certificates,
        solution_hosted: attestationRow.solution_hosted,
        sla_guarantee: attestationRow.sla_guarantee,
        incident_response_plan: attestationRow.incident_response_plan,
        data_residency_options: attestationRow.data_residency_options,
        pii_information: attestationRow.pii_information,
        human_oversight: attestationRow.human_oversight,
        training_data_document: attestationRow.training_data_document,
        generated_profile_report: attestationRow.generated_profile_report,
        document_uploads: attestationRow.document_uploads,
      }
    : {};

  let dbRisksBlock = "";
  try {
    const top5 = await getTop5RisksWithMitigations(buyerPayload);
    dbRisksBlock = formatTop5RisksForPrompt(top5);
  } catch (e) {
    console.error("getTop5RisksWithMitigations (buyer vendor risk report):", e);
  }

  const userPrompt = [
    SYSTEM_PROMPT,
    "",
    "--- Buyer assessment (answers) ---",
    JSON.stringify(buyerPayload, null, 2).slice(0, 14000),
    "--- Vendor attestation (selected product; may be empty) ---",
    JSON.stringify(attestationSlice, null, 2).slice(0, 12000),
    dbRisksBlock ? `\n${dbRisksBlock}\n` : "",
    `Vendor display name: ${vendorName}. Product: ${productName}.`,
    "Respond with ONLY the JSON object.",
  ].join("\n");

  try {
    const rawText = await invokeModel(userPrompt);
    const parsed = extractJsonObject(rawText);
    if (parsed) {
      const normalized = normalizeReport(parsed, vendorName, productName, hasAttestation);
      return {
        ...normalized,
        implementationRiskScore: implementationRisk.implementationRiskScore,
        implementationReadinessGrade: implementationRisk.grade,
        implementationRiskClassification: implementationRisk.classification,
        implementationRiskDecision: implementationRisk.decision,
        implementationRiskRecommendedAction: implementationRisk.recommendedAction,
        implementationRiskBreakdown: implementationRisk.breakdown,
      };
    }
  } catch (e) {
    console.error("generateBuyerVendorRiskReport LLM error:", e);
  }
  const fallback = buildFallbackReport(vendorName, productName, hasAttestation);
  return {
    ...fallback,
    implementationRiskScore: implementationRisk.implementationRiskScore,
    implementationReadinessGrade: implementationRisk.grade,
    implementationRiskClassification: implementationRisk.classification,
    implementationRiskDecision: implementationRisk.decision,
    implementationRiskRecommendedAction: implementationRisk.recommendedAction,
    implementationRiskBreakdown: implementationRisk.breakdown,
  };
}

export type BuyerReportEnrichContext = {
  criticality?: string | null;
  riskAppetite?: string | null;
  dataSensitivity?: string | null;
  governanceMaturity?: string | null;
  targetTimeline?: string | null;
  regulatorySnippet?: string | null;
};

/** Normalize regulatory_requirements JSON/text for priority notes (buyer COTS row). */
export function regulatorySnippetFromJson(reg: unknown): string | null {
  if (reg == null) return null;
  if (typeof reg === "string") return reg.slice(0, 200);
  if (Array.isArray(reg)) {
    const parts = reg.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).filter(Boolean);
    return parts.join(", ").slice(0, 200) || null;
  }
  if (typeof reg === "object") return JSON.stringify(reg).slice(0, 200);
  return String(reg).slice(0, 200);
}

/**
 * Ensures stored JSON (including legacy reports) exposes structured buyer-side sections
 * and buyer-linked priority weights when missing.
 */
export function enrichStoredBuyerVendorReport(
  report: Record<string, unknown>,
  vendorName: string,
  productName: string,
  ctx: BuyerReportEnrichContext,
): BuyerVendorRiskReport {
  const hasAttestationHint = Array.isArray(report.keyStrengths) && (report.keyStrengths as unknown[]).length >= 2;
  const normalized = normalizeReport(report, vendorName, productName, hasAttestationHint);
  const regSnip = ctx.regulatorySnippet ?? null;
  const priorities =
    parseBuyerPriorities(report.buyerPrioritiesAndWeights) ??
    defaultBuyerPrioritiesFromContext({
      ...ctx,
      regulatorySnippet: regSnip,
    });
  const preservedFramework =
    report.frameworkMapping != null && typeof report.frameworkMapping === "object"
      ? (report.frameworkMapping as FrameworkMappingReportBlock)
      : undefined;
  return {
    ...normalized,
    buyerPrioritiesAndWeights: priorities,
    ...(preservedFramework != null && Array.isArray(preservedFramework.rows)
      ? { frameworkMapping: preservedFramework }
      : {}),
  };
}
