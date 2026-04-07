import "dotenv/config";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const REGION = process.env.AWS_DEFAULT_REGION || "us-east-1";
// const MODEL_ID ="us.anthropic.claude-haiku-4-5-20251001-v1:0";
const MODEL_ID = "anthropic.claude-3-sonnet-20240229-v1:0";

const client = new BedrockRuntimeClient({ region: REGION });

import {
  getTop5RisksWithMitigations,
  formatTop5RisksForPrompt,
  type Top5RisksWithMitigations,
} from "../../services/getTop5RisksFromAssessmentContext.js";
import type { FrameworkMappingTableRow } from "../../services/frameworkMappingFromCompliance.js";

export interface RecommendationWithPriority {
  priority: "High" | "Medium" | "Low";
  title: string;
  description: string;
  timeline: string;
}

export interface RoiAnalysis {
  timeSavedPerEmployee?: string;
  timeSavedSource?: string;
  annualHoursRecovered?: string;
  annualHoursRecoveredCalculation?: string;
  productivityValue?: string;
  productivityValueCalculation?: string;
  annualCost?: string;
  annualCostCalculation?: string;
  roiMultiple?: string;
  roiMultipleCalculation?: string;
  paybackPeriod?: string;
  paybackSource?: string;
  comparisonAlternatives?: {
    alternative: string;
    annualCost: string;
    roi: string;
    notes: string;
  }[];
}

export interface RiskCategoryBlock {
  name: string;
  initialRisk?: string;
  level?: string;
  score?: string;
  risks: string[];
  mitigations: string[];
  residualRisk?: string;
}

export interface ComplianceRequirement {
  name: string;
  description: string;
  status: "Met" | "Pending" | "Deferred";
}

export interface FrameworkRow {
  framework: string;
  coverage: string;
  controls: string;
  notes: string;
}

export interface ImplementationPhase {
  title: string;
  timeline: string;
  status: "Complete" | "In Progress" | "Planned";
  activities: string[];
  deliverables: string[];
  pilotResults?: {
    activeUsage?: string;
    timeSaved?: string;
    securityIncidents?: string;
    satisfaction?: string;
    testimonial?: string;
  };
}

export interface Appendix {
  methodology?: string;
  preparedBy?: string;
  reviewedBy?: string;
  confidentiality?: string;
  dataSources?: string[];
  salesRiskFormula?: Record<string, unknown>;
  salesRiskBreakdown?: Record<string, unknown>;
}

export interface FullReportJson {
  roiAnalysis?: RoiAnalysis;
  securityPosture?: RiskCategoryBlock;
  complianceAlignment?: {
    summary?: string;
    requirements?: ComplianceRequirement[];
  };
  frameworkMapping?: { rows?: FrameworkRow[] };
  implementationPlan?: { phases?: ImplementationPhase[] };
  competitivePositioning?: string;
  appendix?: Appendix;
}

/** LLM-written short bullets per catalog-matched risk (merged into report.dbTop5Risks on save). */
export interface MatchedRiskSummary {
  risk_id: string;
  summary_points: string[];
}

/** LLM-written short bullets per catalog mitigation (merged into report.dbTop5Risks.mitigationsByRiskId on save). */
export interface MatchedMitigationSummary {
  risk_id: string;
  mitigation_action_name: string;
  summary_points: string[];
}

export interface GeneratedVendorCotsReport {
  overallRiskScore: number;
  riskLevel: string;
  summary: string;
  executiveSummary?: string;
  keyRisks: string[];
  recommendations: string[];
  recommendationsWithPriority?: RecommendationWithPriority[];
  fullReport?: FullReportJson;
  /** Model-generated concise bullets for each DB top-5 risk (keyed by risk_id). */
  matchedRiskSummaries?: MatchedRiskSummary[];
  /** Model-generated concise bullets per listed catalog mitigation (risk_id + exact action name). */
  matchedMitigationSummaries?: MatchedMitigationSummary[];
  raw?: string;
}

const VENDOR_COTS_REPORT_PROMPT = `You are a risk analyst. Using ONLY the vendor COTS (Commercial Off-The-Shelf) assessment data provided below, generate a structured Analysis Report.

Output the report in the following sections with clear headings. Use the exact section titles below.

## 0. Risk Score
- **Overall Risk Score:** [0-100] (higher = higher risk)
- **Risk Level:** [Low | Moderate | High]
- **Summary:** 2–4 sentences summarizing the overall risk posture for this customer engagement.

## 1. Executive Summary
Write 2–5 paragraphs as a narrative executive summary. Include: deployment context, key benefits or outcomes, infrastructure/security highlights, risk conclusion (e.g. low overall risk with manageable mitigations), and a brief recommendation (e.g. recommend proceeding with deployment). Use professional tone.

## 2. Key Risks
List 3–6 key risks as bullet points. Each line: "- [risk description]". Base these on: identified_risks, customer_specific_risks, data_sensitivity, regulatory_requirements, integration_complexity, and risk_domain_scores if provided.

## 3. Recommendations
List 3–6 actionable recommendations. For each line use this format: "- **Priority:** [High|Medium|Low] | **Title:** [short title] | **Description:** [1-2 sentences] | **Timeline:** [e.g. Immediate, Within 30 days, Q2 2026]"

If a "Database-matched top risks and mitigations" section is provided below, incorporate those risks and their recommended mitigations into your Key Risks and Recommendations where relevant.

## 4. REPORT_JSON
After the sections above, output a single JSON object in a fenced code block starting with \`\`\`json and ending with \`\`\`. The JSON must contain only these keys (use empty strings or empty arrays if not applicable). Infer reasonable values from the assessment data.
- roiAnalysis: object with timeSavedPerEmployee (string), timeSavedSource (string), annualHoursRecovered, productivityValue, annualCost, roiMultiple, paybackPeriod, paybackSource; comparisonAlternatives: array of { alternative, annualCost, roi, notes }
- securityPosture: object with level (string), score (string e.g. "8/100"), risks (string array — each string ONE short bullet phrase, max ~25 words, not paragraphs), mitigations (string array of short actionable lines), residualRisk (string)
- matchedRiskSummaries: array. If "Database-matched top risks" appears above, include exactly one object per listed catalog risk (same order, max 5). Each: { "risk_id": "<exact Risk [id] from that section>", "summary_points": ["2-4 concise bullets", "..."] } — bullets only from that risk's title/description; each bullet under 25 words; no generic filler. If no database-matched risks, use [].
- matchedMitigationSummaries: array. For every "Mitigation:" line under those risks (same order), include { "risk_id": "<exact Risk [id]>", "mitigation_action_name": "<exact mitigation action name before '(' from that line>", "summary_points": ["1-3 complete sentences or short bullets", "..."] } — summarize only that mitigation's catalog meaning (name + definition text above); each bullet a full thought (not truncated mid-sentence); under 35 words each; no generic filler. If a risk has no mitigations, omit entries for it. If no database-matched risks, use [].
- complianceAlignment: object with summary (string), requirements: array of { name, description, status: "Met"|"Pending"|"Deferred" }
- frameworkMapping: object with rows: array of { framework, coverage, controls, notes }. If a "Product attestation: compliance framework mappings" JSON block appears in the assessment context, include every row from that block in frameworkMapping.rows (preserve framework names and use attestation coverage, controls, and notes when provided). Do not omit attestation frameworks.
- implementationPlan: object with phases: array of { title, timeline, status: "Complete"|"In Progress"|"Planned", activities (string array), deliverables (string array) }
- competitivePositioning: string (2-4 sentences)
- appendix: object with methodology (string), preparedBy (string), reviewedBy (string), confidentiality (string), dataSources (string array)

Use only the data provided; if a field is empty or "Not specified", say so or use empty value. Be concise.
`;

function buildAssessmentContext(
  payload: Record<string, unknown>,
  top5: Top5RisksWithMitigations | null,
  attestationFrameworkRows?: FrameworkMappingTableRow[],
): string {
  const toStr = (v: unknown): string => {
    if (v == null) return "Not specified";
    if (Array.isArray(v))
      return v.length ? v.map(toStr).join(", ") : "Not specified";
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };
  const lines: string[] = [
    "--- Vendor COTS Assessment Data ---",
    `Customer organization: ${toStr(payload.customer_organization_name ?? payload.customerOrganizationName)}`,
    `Customer sector: ${toStr(payload.customer_sector ?? payload.customerSector)}`,
    `Primary pain point: ${toStr(payload.primary_pain_point ?? payload.primaryPainPoint)}`,
    `Expected outcomes: ${toStr(payload.expected_outcomes ?? payload.expectedOutcomes)}`,
    `Customer budget range: ${toStr(payload.customer_budget_range ?? payload.customerBudgetRange)}`,
    `Implementation timeline: ${toStr(payload.implementation_timeline ?? payload.implementationTimeline)}`,
    `Product features: ${toStr(payload.product_features ?? payload.productFeatures)}`,
    `Implementation approach: ${toStr(payload.implementation_approach ?? payload.implementationApproach)}`,
    `Customization level: ${toStr(payload.customization_level ?? payload.customizationLevel)}`,
    `Integration complexity: ${toStr(payload.integration_complexity ?? payload.integrationComplexity)}`,
    `Regulatory requirements: ${toStr(payload.regulatory_requirements ?? payload.regulatoryRequirements)}`,
    `Regulatory requirements (other): ${toStr(payload.regulatory_requirements_other ?? payload.regulatoryRequirementsOther)}`,
    `Data sensitivity: ${toStr(payload.data_sensitivity ?? payload.dataSensitivity)}`,
    `Customer risk tolerance: ${toStr(payload.customer_risk_tolerance ?? payload.customerRiskTolerance)}`,
    `Alternatives considered: ${toStr(payload.alternatives_considered ?? payload.alternativesConsidered)}`,
    `Key advantages: ${toStr(payload.key_advantages ?? payload.keyAdvantages)}`,
    `Customer-specific risks: ${toStr(payload.customer_specific_risks ?? payload.customerSpecificRisks)}`,
    `Customer-specific risks (other): ${toStr(payload.customer_specific_risks_other ?? payload.customerSpecificRisksOther)}`,
    `Identified risks: ${toStr(payload.identified_risks ?? payload.identifiedRisks)}`,
    `Risk domain scores: ${toStr(payload.risk_domain_scores ?? payload.riskDomainScores)}`,
    `Contextual multipliers: ${toStr(payload.contextual_multipliers ?? payload.contextualMultipliers)}`,
    `Risk mitigation: ${toStr(payload.risk_mitigation ?? payload.riskMitigation)}`,
    "--- End of data ---",
  ];
  const dbSection = formatTop5RisksForPrompt(top5);
  if (dbSection) lines.push("", dbSection);
  if (attestationFrameworkRows && attestationFrameworkRows.length > 0) {
    lines.push(
      "",
      "--- Framework mappings for this report (vendor attestation compliance + Vendor COTS regulatory/formula-derived rows; authoritative for REPORT_JSON.frameworkMapping.rows) ---",
      JSON.stringify(attestationFrameworkRows, null, 2),
      "--- End of framework mappings ---",
    );
  }
  return lines.join("\n");
}

function parseReportSections(rawReply: string): GeneratedVendorCotsReport {
  let overallRiskScore = 0;
  let riskLevel = "Moderate";
  let summary = "";
  let executiveSummary = "";
  const keyRisks: string[] = [];
  const recommendations: string[] = [];
  const recommendationsWithPriority: RecommendationWithPriority[] = [];

  const section0 =
    rawReply.match(/##\s*0\.?\s*Risk Score[\s\S]*?(?=\n\s*##\s*1|$)/i)?.[0] ??
    "";
  if (section0) {
    const scoreMatch =
      section0.match(/\*\*Overall Risk Score\*\*:\s*(\d+)/i) ??
      section0.match(/Overall Risk Score\s*:\s*(\d+)/i);
    if (scoreMatch) {
      const n = parseInt(scoreMatch[1], 10);
      overallRiskScore = Math.min(100, Math.max(0, n));
    }
    const levelMatch =
      section0.match(/\*\*Risk Level\*\*:\s*([^\n*]+)/i) ??
      section0.match(/Risk Level\s*:\s*([^\n*]+)/i);
    if (levelMatch) riskLevel = levelMatch[1].trim().slice(0, 50) || "Moderate";
    const summaryMatch =
      section0.match(
        /\*\*Summary\*\*:\s*([\s\S]*?)(?=\n\s*##|\n\s*[-*]\s*\*\*[A-Za-z]|$)/im,
      ) ??
      section0.match(/Summary:\s*([\s\S]*?)(?=\n\s*##|\n\s*[-*]\s*\*\*|$)/im);
    if (summaryMatch) summary = summaryMatch[1].replace(/\n+/g, " ").trim();
  }

  const section1 =
    rawReply.match(
      /##\s*1\.?\s*Executive Summary[\s\S]*?(?=\n\s*##\s*2|$)/i,
    )?.[0] ?? "";
  if (section1) {
    const content = section1
      .replace(/##\s*1\.?\s*Executive Summary\s*/i, "")
      .trim();
    executiveSummary = content
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .join("\n\n");
  }

  let section2 =
    rawReply.match(/##\s*2\.?\s*Key Risks[\s\S]*?(?=\n\s*##\s*3|$)/i)?.[0] ??
    "";
  if (!section2)
    section2 =
      rawReply.match(/##\s*1\.?\s*Key Risks[\s\S]*?(?=\n\s*##\s*2|$)/i)?.[0] ??
      "";
  if (section2) {
    const bullets = section2
      .split(/\n/)
      .filter((line) => /^\s*[-*]\s+/.test(line));
    for (const b of bullets) {
      const text = b.replace(/^\s*[-*]\s+/, "").trim();
      if (text.length > 0) keyRisks.push(text);
    }
  }

  let section3 =
    rawReply.match(/##\s*3\.?\s*Recommendations[\s\S]*?(?=\n\s*##|$)/i)?.[0] ??
    "";
  if (!section3)
    section3 =
      rawReply.match(
        /##\s*2\.?\s*Recommendations[\s\S]*?(?=\n\s*##|$)/i,
      )?.[0] ?? "";
  if (section3) {
    const lines = section3
      .split(/\n/)
      .filter((line) => /^\s*[-*]\s+/.test(line));
    for (const line of lines) {
      const text = line.replace(/^\s*[-*]\s+/, "").trim();
      if (!text) continue;
      const priMatch = text.match(/\*\*Priority:\*\*\s*(\w+)/i);
      const titleMatch = text.match(/\*\*Title:\*\*\s*([^|]+)/);
      const descMatch = text.match(/\*\*Description:\*\*\s*([^|]+)/);
      const timeMatch = text.match(/\*\*Timeline:\*\*\s*([^|]+)/);
      if (priMatch && titleMatch) {
        const priority = (
          priMatch[1].trim() === "High" ||
          priMatch[1].trim() === "Medium" ||
          priMatch[1].trim() === "Low"
            ? priMatch[1].trim()
            : "Medium"
        ) as "High" | "Medium" | "Low";
        recommendationsWithPriority.push({
          priority,
          title: titleMatch[1].trim(),
          description: descMatch ? descMatch[1].trim() : "",
          timeline: timeMatch ? timeMatch[1].trim() : "",
        });
      }
      recommendations.push(text);
    }
  }

  if (overallRiskScore === 0 && /\d{1,3}/.test(rawReply)) {
    const anyNum =
      rawReply.match(/\*\*Overall Risk Score\*\*[^\d]*(\d{1,3})/i)?.[1] ??
      rawReply.match(/Risk Score[^\d]*(\d{1,3})/i)?.[1];
    if (anyNum)
      overallRiskScore = Math.min(100, Math.max(0, parseInt(anyNum, 10)));
  }

  let fullReport: FullReportJson | undefined;
  let matchedRiskSummaries: MatchedRiskSummary[] | undefined;
  let matchedMitigationSummaries: MatchedMitigationSummary[] | undefined;
  const jsonBlock =
    rawReply.match(/```json\s*([\s\S]*?)```/)?.[1] ??
    rawReply.match(/---REPORT_JSON---\s*([\s\S]*?)(?=\n---|$)/)?.[1];
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock.trim()) as Record<string, unknown>;
      fullReport = {
        roiAnalysis: sanitizeRoi(parsed.roiAnalysis),
        securityPosture: sanitizeRiskCategoryBlock(parsed.securityPosture),
        complianceAlignment: sanitizeComplianceAlignment(
          parsed.complianceAlignment,
        ),
        frameworkMapping: sanitizeFrameworkMapping(parsed.frameworkMapping),
        implementationPlan: sanitizeImplementationPlan(
          parsed.implementationPlan,
        ),
        competitivePositioning:
          typeof parsed.competitivePositioning === "string"
            ? parsed.competitivePositioning
            : undefined,
        appendix: sanitizeAppendix(parsed.appendix),
      };
      matchedRiskSummaries = sanitizeMatchedRiskSummaries(
        parsed.matchedRiskSummaries,
      );
      matchedMitigationSummaries = sanitizeMatchedMitigationSummaries(
        parsed.matchedMitigationSummaries,
      );
    } catch {
      // ignore invalid JSON
    }
  }
  console.log("overallRiskScore", overallRiskScore);
  return {
    overallRiskScore,
    riskLevel,
    summary: summary || "No summary generated.",
    executiveSummary: executiveSummary || undefined,
    keyRisks,
    recommendations,
    recommendationsWithPriority:
      recommendationsWithPriority.length > 0
        ? recommendationsWithPriority
        : undefined,
    fullReport,
    matchedRiskSummaries,
    matchedMitigationSummaries,
  };
}

function sanitizeMatchedRiskSummaries(
  v: unknown,
): MatchedRiskSummary[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: MatchedRiskSummary[] = [];
  for (const x of v) {
    if (x == null || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const risk_id = String(o.risk_id ?? "").trim();
    if (!risk_id) continue;
    const summary_points = Array.isArray(o.summary_points)
      ? (o.summary_points as unknown[])
          .map((p) => String(p ?? "").trim())
          .filter((s) => s.length > 1)
          .slice(0, 8)
      : [];
    if (summary_points.length === 0) continue;
    out.push({ risk_id, summary_points });
  }
  return out.length > 0 ? out : undefined;
}

function sanitizeMatchedMitigationSummaries(
  v: unknown,
): MatchedMitigationSummary[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: MatchedMitigationSummary[] = [];
  for (const x of v) {
    if (x == null || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const risk_id = String(o.risk_id ?? "").trim();
    const mitigation_action_name = String(
      o.mitigation_action_name ?? "",
    ).trim();
    if (!risk_id || !mitigation_action_name) continue;
    const summary_points = Array.isArray(o.summary_points)
      ? (o.summary_points as unknown[])
          .map((p) => String(p ?? "").trim())
          .filter((s) => s.length > 1)
          .slice(0, 6)
      : [];
    if (summary_points.length === 0) continue;
    out.push({ risk_id, mitigation_action_name, summary_points });
  }
  return out.length > 0 ? out : undefined;
}

function sanitizeRoi(v: unknown): RoiAnalysis | undefined {
  if (v == null || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const arr = Array.isArray(o.comparisonAlternatives)
    ? (o.comparisonAlternatives as unknown[]).map((x) => {
        const t =
          x && typeof x === "object" ? (x as Record<string, unknown>) : {};
        return {
          alternative: String(t.alternative ?? ""),
          annualCost: String(t.annualCost ?? ""),
          roi: String(t.roi ?? ""),
          notes: String(t.notes ?? ""),
        };
      })
    : undefined;
  return {
    timeSavedPerEmployee:
      typeof o.timeSavedPerEmployee === "string"
        ? o.timeSavedPerEmployee
        : undefined,
    timeSavedSource:
      typeof o.timeSavedSource === "string" ? o.timeSavedSource : undefined,
    annualHoursRecovered:
      typeof o.annualHoursRecovered === "string"
        ? o.annualHoursRecovered
        : undefined,
    annualHoursRecoveredCalculation:
      typeof o.annualHoursRecoveredCalculation === "string"
        ? o.annualHoursRecoveredCalculation
        : undefined,
    productivityValue:
      typeof o.productivityValue === "string" ? o.productivityValue : undefined,
    productivityValueCalculation:
      typeof o.productivityValueCalculation === "string"
        ? o.productivityValueCalculation
        : undefined,
    annualCost: typeof o.annualCost === "string" ? o.annualCost : undefined,
    annualCostCalculation:
      typeof o.annualCostCalculation === "string"
        ? o.annualCostCalculation
        : undefined,
    roiMultiple: typeof o.roiMultiple === "string" ? o.roiMultiple : undefined,
    roiMultipleCalculation:
      typeof o.roiMultipleCalculation === "string"
        ? o.roiMultipleCalculation
        : undefined,
    paybackPeriod:
      typeof o.paybackPeriod === "string" ? o.paybackPeriod : undefined,
    paybackSource:
      typeof o.paybackSource === "string" ? o.paybackSource : undefined,
    comparisonAlternatives: arr,
  };
}

function sanitizeRiskCategoryBlock(v: unknown): RiskCategoryBlock | undefined {
  if (v == null || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const risks = Array.isArray(o.risks)
    ? (o.risks as unknown[]).map((x) => String(x))
    : [];
  const mitigations = Array.isArray(o.mitigations)
    ? (o.mitigations as unknown[]).map((x) => String(x))
    : [];
  const level = typeof o.level === "string" ? o.level : undefined;
  return {
    name: typeof o.name === "string" ? o.name : "Risk",
    initialRisk: level,
    level,
    score: typeof o.score === "string" ? o.score : undefined,
    risks,
    mitigations,
    residualRisk:
      typeof o.residualRisk === "string" ? o.residualRisk : undefined,
  };
}

function sanitizeComplianceAlignment(
  v: unknown,
): FullReportJson["complianceAlignment"] {
  if (v == null || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const requirements = Array.isArray(o.requirements)
    ? (o.requirements as unknown[]).map((x): ComplianceRequirement => {
        const t =
          x && typeof x === "object" ? (x as Record<string, unknown>) : {};
        const status: ComplianceRequirement["status"] =
          t.status === "Met" ||
          t.status === "Pending" ||
          t.status === "Deferred"
            ? t.status
            : "Pending";
        return {
          name: String(t.name ?? ""),
          description: String(t.description ?? ""),
          status,
        };
      })
    : undefined;
  return {
    summary: typeof o.summary === "string" ? o.summary : undefined,
    requirements,
  };
}

function sanitizeFrameworkMapping(
  v: unknown,
): FullReportJson["frameworkMapping"] {
  if (v == null || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const rows = Array.isArray(o.rows)
    ? (o.rows as unknown[]).map((x) => {
        const t =
          x && typeof x === "object" ? (x as Record<string, unknown>) : {};
        return {
          framework: String(t.framework ?? ""),
          coverage: String(t.coverage ?? ""),
          controls: String(t.controls ?? ""),
          notes: String(t.notes ?? ""),
        };
      })
    : undefined;
  return { rows };
}

function sanitizeImplementationPlan(
  v: unknown,
): FullReportJson["implementationPlan"] {
  if (v == null || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const phases = Array.isArray(o.phases)
    ? (o.phases as unknown[]).map((x): ImplementationPhase => {
        const t =
          x && typeof x === "object" ? (x as Record<string, unknown>) : {};
        const status: ImplementationPhase["status"] =
          t.status === "Complete" ||
          t.status === "In Progress" ||
          t.status === "Planned"
            ? t.status
            : "Planned";
        return {
          title: String(t.title ?? ""),
          timeline: String(t.timeline ?? ""),
          status,
          activities: Array.isArray(t.activities)
            ? (t.activities as unknown[]).map(String)
            : [],
          deliverables: Array.isArray(t.deliverables)
            ? (t.deliverables as unknown[]).map(String)
            : [],
        };
      })
    : undefined;
  return { phases };
}

function sanitizeAppendix(v: unknown): Appendix | undefined {
  if (v == null || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const dataSources = Array.isArray(o.dataSources)
    ? (o.dataSources as unknown[]).map(String)
    : undefined;
  return {
    methodology: typeof o.methodology === "string" ? o.methodology : undefined,
    preparedBy: typeof o.preparedBy === "string" ? o.preparedBy : undefined,
    reviewedBy: typeof o.reviewedBy === "string" ? o.reviewedBy : undefined,
    confidentiality:
      typeof o.confidentiality === "string" ? o.confidentiality : undefined,
    dataSources,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 – CUSTOMER FRICTION RISK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 2.2.2  Regulatory Complexity
 *
 * @param {{
 *   customerRegulatoryRequirements: string[],
 *   sector: string
 * }} p
 */
function calcRegulatoryComplexity(p: any) {
  const sectorMultiplierMap: Record<string, number> = {
    Healthcare: 6,
    Financial_Services: 5,
    Government: 5,
    Autonomous_Systems: 7,
    E_Commerce: 3,
    Technology: 2,
  };

  const multiplier = sectorMultiplierMap[p.sector] ?? 2;
  const count = Array.isArray(p.customerRegulatoryRequirements)
    ? p.customerRegulatoryRequirements.length
    : 0;
  const value = count * multiplier;

  return {
    regulatory_requirement_count: count,
    regulatory_requirements: p.customerRegulatoryRequirements ?? [],
    sector_complexity_multiplier: multiplier,
    value,
  };
}

/**
 * 2.2.3  Data Sensitivity Friction
 *
 * @param {{
 *   customerDataSensitivity: string,
 *   sector: string,
 *   customerRegulatoryRequirements: string[]
 * }} p
 */
function calcDataSensitivityFriction(p: any) {
  const sensitivityMap: Record<string, number> = {
    "Critical (Life-safety, National security)": 30,
    "High (PHI, Financial data, PII)": 20,
    "Medium (Business confidential)": 10,
    "Low (Public or anonymized)": 5,
  };

  const basePoints = sensitivityMap[p.customerDataSensitivity];
  if (basePoints === undefined) {
    throw new Error(
      `Unknown customerDataSensitivity: ${p.customerDataSensitivity}`,
    );
  }

  const regCount = Array.isArray(p.customerRegulatoryRequirements)
    ? p.customerRegulatoryRequirements.length
    : 0;
  const burdenRate = ["Healthcare", "Financial_Services"].includes(p.sector)
    ? 3
    : 2;
  const docBurden = regCount * burdenRate;

  return {
    data_sensitivity_base_points: basePoints,
    regulatory_count: regCount,
    compliance_burden_rate: burdenRate,
    compliance_documentation_burden: docBurden,
    value: basePoints + docBurden,
  };
}

/**
 * 2.2.4  Risk Tolerance Friction
 *
 * @param {{
 *   customerRiskTolerance: string,
 *   customerSpecificRiskCount: number,
 *   customerRegulatoryRequirements: string[]
 * }} p
 */
function calcRiskToleranceFriction(p: any) {
  const toleranceMap: Record<string, number> = {
    Aggressive: 3,
    Moderate: 8,
    Conservative: 15,
    Risk_averse: 20,
  };

  const base = toleranceMap[p.customerRiskTolerance];
  if (base === undefined) {
    throw new Error(
      `Unknown customerRiskTolerance: ${p.customerRiskTolerance}`,
    );
  }

  const regCount = Array.isArray(p.customerRegulatoryRequirements)
    ? p.customerRegulatoryRequirements.length
    : 0;
  const isConservative = ["Conservative", "Risk_averse"].includes(
    p.customerRiskTolerance,
  );
  const proofBurden = isConservative
    ? p.customerSpecificRiskCount * 2 + regCount
    : p.customerSpecificRiskCount;

  return {
    tolerance_base_points: base,
    is_conservative_or_averse: isConservative,
    customer_specific_risk_count: p.customerSpecificRiskCount,
    regulatory_count: regCount,
    proof_requirement_burden: proofBurden,
    value: base + proofBurden,
  };
}

/**
 * 2.2.5  Customer-Specific Risk Friction
 *
 * @param {{
 *   customerSpecificRiskCount: number,
 *   customerType: string,
 *   customerHasUniqueRequirements: boolean,
 *   uniqueRequirementsList?: string[]
 * }} p
 */
function calcCustomerSpecificRiskFriction(p: any) {
  const riskWeightMap: Record<string, number> = {
    Enterprise: 12,
    Mid_market: 10,
    SMB: 7,
  };

  const riskWeight = riskWeightMap[p.customerType];
  if (riskWeight === undefined) {
    throw new Error(`Unknown customerType: ${p.customerType}`);
  }

  const baseContribution = p.customerSpecificRiskCount * riskWeight;
  const uniquePenalty = p.customerHasUniqueRequirements
    ? p.customerSpecificRiskCount * 5
    : 0;

  return {
    customer_specific_risk_count: p.customerSpecificRiskCount,
    customer_type: p.customerType,
    risk_weight: riskWeight,
    base_contribution: baseContribution,
    has_unique_requirements: p.customerHasUniqueRequirements,
    unique_requirements_list: p.uniqueRequirementsList ?? [],
    unique_requirement_penalty: uniquePenalty,
    value: baseContribution + uniquePenalty,
  };
}

/**
 * 2.2.6  Total Customer Friction Risk
 *
 * @param {Object} p  Combined input for all CFR sub-components
 */
function calculateCustomerFrictionRisk(p: any) {
  const regulatory = calcRegulatoryComplexity(p);
  const dataSens = calcDataSensitivityFriction(p);
  const riskTol = calcRiskToleranceFriction(p);
  const specific = calcCustomerSpecificRiskFriction(p);

  const raw =
    regulatory.value + dataSens.value + riskTol.value + specific.value;
  const value = Math.min(100, raw);

  return {
    regulatory_complexity: regulatory,
    data_sensitivity_friction: dataSens,
    risk_tolerance_friction: riskTol,
    customer_specific_risk_friction: specific,
    raw_total: raw,
    is_capped: raw > 100,
    value,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 – IMPLEMENTATION RISK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 2.3.2  Integration Complexity
 *
 * @param {{
 *   integrationPoints: { systemType: string }[],
 * }} p
 */
function calcIntegrationComplexity(p: any) {
  const complexityMap: Record<string, number> = {
    Legacy_mainframe: 35,
    Legacy_client_server: 28,
    Modern_monolith: 20,
    Microservices: 15,
    Cloud_native_API: 10,
    SaaS_standard_connector: 5,
  };

  if (!p.integrationPoints || p.integrationPoints.length === 0) {
    return {
      integration_points: [],
      integration_point_count: 0,
      per_point_scores: [],
      average_complexity: 0,
      system_count_penalty: 0,
      value: 0,
    };
  }

  const perPointScores = p.integrationPoints.map((pt: any) => {
    const score = complexityMap[pt.systemType];
    if (score === undefined)
      throw new Error(`Unknown systemType: ${pt.systemType}`);
    return { system_type: pt.systemType, complexity_score: score };
  });

  const avg =
    perPointScores.reduce((s: number, pt: any) => s + pt.complexity_score, 0) /
    perPointScores.length;
  const countPenalty =
    p.integrationPoints.length > 3 ? (p.integrationPoints.length - 3) * 5 : 0;

  return {
    integration_points: perPointScores,
    integration_point_count: p.integrationPoints.length,
    average_complexity: parseFloat(avg.toFixed(4)),
    system_count_penalty: countPenalty,
    value: parseFloat((avg + countPenalty).toFixed(4)),
  };
}

/**
 * 2.3.3  Customization Required
 *
 * @param {{
 *   customizationLevel: string,
 *   sector: string,
 *   customerRequiresIndustryWorkflows: boolean,
 *   businessProcessChangesRequired: number
 * }} p
 */
function calcCustomizationRequired(p: any) {
  const custMap: Record<string, number> = {
    "None (use as-is)": 0,
    "Minimal (configuration only)": 5,
    "Moderate (config + light dev)": 15,
    "Extensive (significant dev)": 25,
    Custom_build: 40,
  };
  const industryPenaltyMap: Record<string, number> = {
    Healthcare: 12,
    Financial_Services: 10,
    Government: 8,
    Other: 5,
  };

  const base = custMap[p.customizationLevel];
  if (base === undefined)
    throw new Error(`Unknown customizationLevel: ${p.customizationLevel}`);

  const industryPenalty = p.customerRequiresIndustryWorkflows
    ? (industryPenaltyMap[p.sector] ?? industryPenaltyMap.Other)
    : 0;
  const workflowPenalty = (p.businessProcessChangesRequired ?? 0) * 3;

  return {
    base_customization_effort: base,
    customer_requires_industry_workflows: p.customerRequiresIndustryWorkflows,
    industry_specific_penalty: industryPenalty,
    business_process_changes: p.businessProcessChangesRequired ?? 0,
    workflow_modification_penalty: workflowPenalty,
    value: base + industryPenalty + workflowPenalty,
  };
}

/**
 * 2.3.4  Timeline Pressure
 *
 * @param {{
 *   implementationTimelineMonths: number,
 *   regulatoryDeadlineExists: boolean,
 *   monthsUntilDeadline?: number
 * }} p
 */
function calcTimelinePressure(p: any) {
  let baseRisk;
  const months = p.implementationTimelineMonths;
  if (months < 2) baseRisk = 30;
  else if (months < 3) baseRisk = 20;
  else if (months < 6) baseRisk = 10;
  else if (months < 12) baseRisk = 5;
  else baseRisk = 2;

  let deadlineCriticality = 0;
  if (p.regulatoryDeadlineExists && p.monthsUntilDeadline !== undefined) {
    deadlineCriticality = Math.min(15, p.monthsUntilDeadline * -3 + 20);
    deadlineCriticality = Math.max(0, deadlineCriticality); // floor at 0
  }

  return {
    implementation_timeline_months: months,
    base_timeline_risk: baseRisk,
    regulatory_deadline_exists: p.regulatoryDeadlineExists,
    months_until_deadline: p.monthsUntilDeadline ?? null,
    deadline_criticality_bonus: deadlineCriticality,
    value: baseRisk + deadlineCriticality,
  };
}

/**
 * 2.3.5  Feature Gap
 *
 * @param {{
 *   productFeatureMatchPct: number,
 *   missingCriticalFeatures: string[]
 * }} p
 */
function calcFeatureGap(p: any) {
  const baseGap = (100 - p.productFeatureMatchPct) / 2;
  const criticalCount = Array.isArray(p.missingCriticalFeatures)
    ? p.missingCriticalFeatures.length
    : 0;
  const criticalPenalty = criticalCount * 8;

  return {
    product_feature_match_pct: p.productFeatureMatchPct,
    feature_gap_base: parseFloat(baseGap.toFixed(4)),
    missing_critical_features: p.missingCriticalFeatures ?? [],
    missing_critical_count: criticalCount,
    critical_feature_penalty: criticalPenalty,
    value: parseFloat((baseGap + criticalPenalty).toFixed(4)),
  };
}

/**
 * 2.3.6  Mitigation Gap
 *
 * @param {{
 *   customerSpecificRiskCount: number,
 *   proposedMitigationsCount: number,
 *   avgMitigationsPerRisk?: number   // defaults to 4 per spec
 * }} p
 */
function calcMitigationGap(p: any) {
  const avgPerRisk = p.avgMitigationsPerRisk ?? 4;
  const requiredMit = p.customerSpecificRiskCount * avgPerRisk;
  const proposedMit = p.proposedMitigationsCount;
  const MAX_PENALTY = 40;

  const gap = Math.max(0, requiredMit - proposedMit);
  const gapRatio = requiredMit > 0 ? gap / requiredMit : 0;
  const value = parseFloat((gapRatio * MAX_PENALTY).toFixed(4));

  return {
    customer_specific_risk_count: p.customerSpecificRiskCount,
    avg_mitigations_per_risk: avgPerRisk,
    required_mitigations: requiredMit,
    proposed_mitigations: proposedMit,
    mitigation_gap_count: gap,
    gap_ratio: parseFloat(gapRatio.toFixed(4)),
    max_penalty: MAX_PENALTY,
    value,
  };
}

/**
 * 2.3.7  Total Implementation Risk
 *
 * @param {Object} p  Combined input for all IR sub-components
 */
function calculateImplementationRisk(p: any) {
  const integration = calcIntegrationComplexity(p);
  const customization = calcCustomizationRequired(p);
  const timeline = calcTimelinePressure(p);
  const featureGap = calcFeatureGap(p);
  const mitigationGap = calcMitigationGap(p);

  const raw =
    integration.value +
    customization.value +
    timeline.value +
    featureGap.value +
    mitigationGap.value;
  const value = parseFloat(Math.min(100, raw).toFixed(4));

  return {
    integration_complexity: integration,
    customization_required: customization,
    timeline_pressure: timeline,
    feature_gap: featureGap,
    mitigation_gap: mitigationGap,
    raw_total: parseFloat(raw.toFixed(4)),
    is_capped: raw > 100,
    value,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 – COMPETITIVE RISK
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 2.4.2  Competitive Alternatives
 *
 * @param {{
 *   competitorCount: string,
 *   customerConsideringBuildVsBuy: boolean,
 *   customerTechnicalCapability?: string
 * }} p
 */
function calcCompetitiveAlternatives(p: any) {
  const competitorMap: Record<string, number> = {
    "0 (sole source)": 0,
    "1 competitor": 10,
    "2-3 competitors": 20,
    "4+ competitors": 25,
  };

  const baseCompetition = competitorMap[p.competitorCount];
  if (baseCompetition === undefined) {
    throw new Error(`Unknown competitorCount: ${p.competitorCount}`);
  }

  const buildCapabilityMap: Record<string, number> = {
    "Strong (can build)": 20,
    "Moderate (difficult build)": 10,
    "Weak (unlikely to build)": 5,
  };

  let buildPenalty = 0;
  if (p.customerConsideringBuildVsBuy) {
    const cap = buildCapabilityMap[p.customerTechnicalCapability];
    if (cap === undefined)
      throw new Error(
        `Unknown customerTechnicalCapability: ${p.customerTechnicalCapability}`,
      );
    buildPenalty = cap;
  }

  return {
    competitor_count_label: p.competitorCount,
    base_competition_points: baseCompetition,
    customer_considering_build_vs_buy: p.customerConsideringBuildVsBuy,
    customer_technical_capability: p.customerTechnicalCapability ?? null,
    build_option_penalty: buildPenalty,
    value: baseCompetition + buildPenalty,
  };
}

/**
 * 2.4.3  Budget Constraint
 *
 * @param {{
 *   budgetMidpoint: string,
 *   approvalLevels: string
 * }} p
 */
function calcBudgetConstraint(p: any) {
  const budgetMap: Record<string, number> = {
    "< $100K": 35,
    "$100K-$250K": 25,
    "$250K-$500K": 15,
    "$500K-$1M": 10,
    "$1M-$5M": 5,
    "> $5M": 0,
  };
  const approvalMap: Record<string, number> = {
    VP_and_below: 0,
    C_suite_single: 3,
    C_suite_multiple: 8,
    Board_approval: 15,
  };

  const budgetPts = budgetMap[p.budgetMidpoint];
  if (budgetPts === undefined)
    throw new Error(`Unknown budgetMidpoint: ${p.budgetMidpoint}`);
  const approvalPts = approvalMap[p.approvalLevels];
  if (approvalPts === undefined)
    throw new Error(`Unknown approvalLevels: ${p.approvalLevels}`);

  return {
    budget_midpoint: p.budgetMidpoint,
    budget_base_points: budgetPts,
    approval_levels: p.approvalLevels,
    budget_approval_complexity: approvalPts,
    value: budgetPts + approvalPts,
  };
}

/**
 * 2.4.4  Competitive Advantage  (negative points = better for vendor)
 *
 * @param {{
 *   uniqueDifferentiators: { advantageType: string }[],
 *   yearsInCustomerSector: number
 * }} p
 */
function calcCompetitiveAdvantage(p: any) {
  const differentiatorValueMap: Record<string, number> = {
    Regulatory_certification: 10,
    Proven_customer_in_sector: 8,
    Faster_deployment: 5,
    Lower_TCO: 7,
    Superior_feature_set: 6,
    Domain_expertise: 8,
    Technology_leadership: 5,
  };

  const differentiatorBreakdown = (p.uniqueDifferentiators ?? []).map(
    (d: any) => {
      const val = differentiatorValueMap[d.advantageType];
      if (val === undefined)
        throw new Error(`Unknown advantageType: ${d.advantageType}`);
      return { advantage_type: d.advantageType, value: val };
    },
  );

  const differentiatorTotal = differentiatorBreakdown.reduce(
    (s: number, d: any) => s + d.value,
    0,
  );
  const industryBonus = (p.yearsInCustomerSector ?? 0) >= 5 ? -10 : 0;

  const value = -differentiatorTotal + industryBonus;

  return {
    unique_differentiators: differentiatorBreakdown,
    differentiator_total: differentiatorTotal,
    years_in_customer_sector: p.yearsInCustomerSector ?? 0,
    industry_expertise_bonus: industryBonus,
    note: "Negative value = competitive advantage (reduces risk)",
    value: parseFloat(value.toFixed(4)),
  };
}

/**
 * 2.4.5  Vendor-Buyer Maturity Gap
 *
 * @param {{
 *   vendorStage: string,
 *   customerType: string,
 *   customerExpectsLargerVendorFeatures: boolean,
 *   customerEmployeeCount?: number,
 *   vendorEmployeeCount?: number
 * }} p
 */
function calcVendorBuyerMaturityGap(p: any) {
  // Lookup table: [vendorStage][customerType]
  const gapTable: Record<string, Record<string, number>> = {
    startup: { Enterprise: 25, Mid_market: 15, SMB: 5 },
    growth: { Enterprise: 15, Mid_market: 5, SMB: 0 },
    established: { Enterprise: 5, Mid_market: 0, SMB: 0 },
    mature: { Enterprise: 0, Mid_market: 0, SMB: 0 },
  };

  const stageRow = gapTable[p.vendorStage];
  if (!stageRow) throw new Error(`Unknown vendorStage: ${p.vendorStage}`);
  const baseGap = stageRow[p.customerType] ?? 0;

  let mismatchPenalty = 0;
  if (p.customerExpectsLargerVendorFeatures) {
    const custEmp = p.customerEmployeeCount ?? 0;
    const vendEmp = p.vendorEmployeeCount ?? 1; // avoid div by zero
    mismatchPenalty = Math.min(15, (custEmp / vendEmp) * 3);
    mismatchPenalty = parseFloat(mismatchPenalty.toFixed(4));
  }

  return {
    vendor_stage: p.vendorStage,
    customer_type: p.customerType,
    base_maturity_gap: baseGap,
    customer_expects_larger_vendor_features:
      p.customerExpectsLargerVendorFeatures,
    customer_employee_count: p.customerEmployeeCount ?? null,
    vendor_employee_count: p.vendorEmployeeCount ?? null,
    expectation_mismatch_penalty: mismatchPenalty,
    value: parseFloat((baseGap + mismatchPenalty).toFixed(4)),
  };
}

/**
 * 2.4.6  Total Competitive Risk
 *
 * @param {Object} p  Combined input for all CR sub-components
 */
function calculateCompetitiveRisk(p: any) {
  const alternatives = calcCompetitiveAlternatives(p);
  const budget = calcBudgetConstraint(p);
  const advantage = calcCompetitiveAdvantage(p);
  const maturityGap = calcVendorBuyerMaturityGap(p);

  const raw =
    alternatives.value + budget.value + advantage.value + maturityGap.value;
  const value = parseFloat(Math.max(0, raw).toFixed(4));
// console.log("value",value)
  return {
    competitive_alternatives: alternatives,
    budget_constraint: budget,
    competitive_advantage: advantage,
    vendor_buyer_maturity_gap: maturityGap,
    raw_total: parseFloat(raw.toFixed(4)),
    is_floored: raw < 0,
    value,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 – FINAL SALES RISK SCORE
// ─────────────────────────────────────────────────────────────────────────────

function interpretSalesRiskScore(dealProbability: number) {
  if (dealProbability >= 90)
    return {
      grade: "A",
      classification: "High Confidence Deal",
      deal_characteristics: "Low friction; strong fit; weak competition",
      recommended_actions:
        "Standard sales process; focus on value demonstration",
    };
  if (dealProbability >= 80)
    return {
      grade: "B",
      classification: "Favorable Deal",
      deal_characteristics: "Minor friction; good fit; manageable competition",
      recommended_actions:
        "Standard sales process; executive sponsorship helpful",
    };
  if (dealProbability >= 70)
    return {
      grade: "C",
      classification: "Moderate Deal",
      deal_characteristics: "Some friction; gaps present; competitive pressure",
      recommended_actions:
        "Extended sales cycle; custom proposal with mitigation roadmap",
    };
  if (dealProbability >= 60)
    return {
      grade: "D",
      classification: "Review Deal Strategy",
      deal_characteristics:
        "Strategy High friction; notable gaps; strong competition",
      recommended_actions:
        "Executive engagement required; review resource investment before pursuing",
    };
  return {
    grade: "E",
    classification: "Reassess Opportunity",
    deal_characteristics: "Critical friction; major gaps; intense competition",
    recommended_actions:
      "Reassess deal viability; only pursue if strategically critical ",
  };
}

function calculateSalesRiskScore(userInput: any) {
  // ── Customer Friction Risk ────────────────────────────────────────────────
  const CFR = calculateCustomerFrictionRisk(userInput);

  // ── Implementation Risk ───────────────────────────────────────────────────
  const IR = calculateImplementationRisk(userInput);

  // ── Competitive Risk ──────────────────────────────────────────────────────
  const CR = calculateCompetitiveRisk(userInput);

  // ── Final SRS ─────────────────────────────────────────────────────────────
  const weightedScore = CFR.value * 0.35 + IR.value * 0.35 + CR.value * 0.3;
  const srs = parseFloat(Math.min(100, Math.max(0, weightedScore)).toFixed(2));
  const dealProbability = parseFloat(Math.max(0, 100 - srs).toFixed(2));
  const dealProbabilityRounded = Math.max(0, Math.min(100, Math.round(dealProbability)));
  const interpretation = interpretSalesRiskScore(dealProbabilityRounded);

  console.log("srs",srs)
  console.log("dealProbability",dealProbability)

  // ── DB-ready result ───────────────────────────────────────────────────────
  return {
    // ── Primary columns ──────────────────────────────────────────────────────
    sales_risk_score: srs,
    deal_probability_pct: dealProbability,
    customer_friction_risk: CFR.value,
    implementation_risk: IR.value,
    competitive_risk: CR.value,
    grade: interpretation.grade,
    classification: interpretation.classification,
    deal_characteristics: interpretation.deal_characteristics,
    recommended_actions: interpretation.recommended_actions,

    // ── Full breakdown (store as JSONB) ───────────────────────────────────
    detail: {
      customer_friction_risk: CFR,
      implementation_risk: IR,
      competitive_risk: CR,
      final_formula: {
        expression: "SRS = 100 - ((CFR × 0.35) + (IR × 0.35) + (CR × 0.30))",
        customer_friction_contribution: parseFloat(
          (CFR.value * 0.35).toFixed(4),
        ),
        implementation_risk_contribution: parseFloat(
          (IR.value * 0.35).toFixed(4),
        ),
        competitive_risk_contribution: parseFloat((CR.value * 0.3).toFixed(4)),
        weighted_sum: parseFloat(weightedScore.toFixed(4)),
      },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export {
  // Main entry point
  calculateSalesRiskScore,

  // Customer Friction Risk sub-calculators
  calcRegulatoryComplexity,
  calcDataSensitivityFriction,
  calcRiskToleranceFriction,
  calcCustomerSpecificRiskFriction,
  calculateCustomerFrictionRisk,

  // Implementation Risk sub-calculators
  calcIntegrationComplexity,
  calcCustomizationRequired,
  calcTimelinePressure,
  calcFeatureGap,
  calcMitigationGap,
  calculateImplementationRisk,

  // Competitive Risk sub-calculators
  calcCompetitiveAlternatives,
  calcBudgetConstraint,
  calcCompetitiveAdvantage,
  calcVendorBuyerMaturityGap,
  calculateCompetitiveRisk,
};

type SalesRiskFormulaResult = {
  sales_risk_score: number;
  deal_probability_pct: number;
  customer_friction_risk: number;
  implementation_risk: number;
  competitive_risk: number;
  grade: string;
  classification: string;
  deal_characteristics: string;
  recommended_actions: string;
  detail?: {
    final_formula?: Record<string, unknown>;
  };
};

function toStringValue(v: unknown): string {
  return String(v ?? "").trim();
}

function toStringList(v: unknown): string[] {
  if (Array.isArray(v))
    return v.map((x) => String(x ?? "").trim()).filter(Boolean);
  const s = toStringValue(v);
  if (!s) return [];
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** Regulatory selections + CFR regulatory complexity used for framework mapping on submit. */
export function getVendorCotsRegulatoryComplexitySnapshot(
  payload: Record<string, unknown>,
) {
  const regulatory = toStringList(
    payload.regulatory_requirements ?? payload.regulatoryRequirements,
  );
  const sector = normalizeSectorForFormula(
    toStringValue(payload.customer_sector ?? payload.customerSector),
  );
  return {
    regulatory,
    sector,
    complexity: calcRegulatoryComplexity({
      customerRegulatoryRequirements: regulatory,
      sector,
    }),
  };
}

function normalizeSectorForFormula(
  raw: string,
):
  | "Healthcare"
  | "Financial_Services"
  | "Government"
  | "E_Commerce"
  | "Technology" {
  const s = raw.toLowerCase();
  if (
    s.includes("healthcare") ||
    s.includes("hospital") ||
    s.includes("medical") ||
    s.includes("pharma")
  )
    return "Healthcare";
  if (s.includes("financial") || s.includes("bank") || s.includes("insurance"))
    return "Financial_Services";
  if (
    s.includes("government") ||
    s.includes("federal") ||
    s.includes("state") ||
    s.includes("local")
  )
    return "Government";
  if (
    s.includes("retail") ||
    s.includes("e-commerce") ||
    s.includes("ecommerce")
  )
    return "E_Commerce";
  return "Technology";
}

function normalizeRiskToleranceForFormula(
  raw: string,
): "Aggressive" | "Moderate" | "Conservative" | "Risk_averse" {
  const s = raw.toLowerCase();
  if (
    s.includes("very low") ||
    s.includes("risk-averse") ||
    s.includes("zero tolerance")
  )
    return "Risk_averse";
  if (s.includes("low")) return "Conservative";
  if (s.includes("high") || s.includes("very high")) return "Aggressive";
  return "Moderate";
}

function normalizeDataSensitivityForFormula(
  raw: string,
):
  | "Critical (Life-safety, National security)"
  | "High (PHI, Financial data, PII)"
  | "Medium (Business confidential)"
  | "Low (Public or anonymized)" {
  const s = raw.toLowerCase();
  if (
    s.includes("extremely sensitive") ||
    s.includes("national security") ||
    s.includes("itar") ||
    s.includes("cui")
  ) {
    return "Critical (Life-safety, National security)";
  }
  if (
    s.includes("highly sensitive") ||
    s.includes("sensitive") ||
    s.includes("phi") ||
    s.includes("financial") ||
    s.includes("pii")
  ) {
    return "High (PHI, Financial data, PII)";
  }
  if (s.includes("internal") || s.includes("business confidential"))
    return "Medium (Business confidential)";
  return "Low (Public or anonymized)";
}

function normalizeCustomizationForFormula(
  raw: string,
):
  | "None (use as-is)"
  | "Minimal (configuration only)"
  | "Moderate (config + light dev)"
  | "Extensive (significant dev)"
  | "Custom_build" {
  const s = raw.toLowerCase();
  if (s.includes("none") || s.includes("as-is")) return "None (use as-is)";
  if (s.includes("minimal") || s.includes("no code"))
    return "Minimal (configuration only)";
  if (
    s.includes("moderate") ||
    s.includes("workflow") ||
    s.includes("integration")
  )
    return "Moderate (config + light dev)";
  if (
    s.includes("significant") ||
    s.includes("extensive") ||
    s.includes("major")
  )
    return "Extensive (significant dev)";
  return "Custom_build";
}

function buildIntegrationPointsForFormula(
  raw: string,
): Array<{ systemType: string }> {
  const s = raw.toLowerCase();
  if (s.includes("standalone"))
    return [{ systemType: "SaaS_standard_connector" }];
  if (s.includes("simple")) return [{ systemType: "Cloud_native_API" }];
  if (s.includes("moderate"))
    return [{ systemType: "Microservices" }, { systemType: "Modern_monolith" }];
  if (s.includes("complex") && !s.includes("very")) {
    return [
      { systemType: "Legacy_client_server" },
      { systemType: "Modern_monolith" },
      { systemType: "Microservices" },
      { systemType: "Cloud_native_API" },
    ];
  }
  return [
    { systemType: "Legacy_mainframe" },
    { systemType: "Legacy_client_server" },
    { systemType: "Modern_monolith" },
    { systemType: "Microservices" },
    { systemType: "Cloud_native_API" },
  ];
}

function timelineMonthsForFormula(raw: string): number {
  const s = raw.toLowerCase();
  if (s.includes("immediate")) return 1;
  if (s.includes("1-3")) return 2;
  if (s.includes("3-6")) return 5;
  if (s.includes("6-12")) return 9;
  if (s.includes("12-18")) return 15;
  if (s.includes("18+")) return 20;
  return 6;
}

function budgetForFormula(
  raw: string,
):
  | "< $100K"
  | "$100K-$250K"
  | "$250K-$500K"
  | "$500K-$1M"
  | "$1M-$5M"
  | "> $5M" {
  const s = raw.toLowerCase();
  if (
    s.includes("under $50") ||
    s.includes("$50k - $100k") ||
    s.includes("$50k-$100k")
  )
    return "< $100K";
  if (s.includes("$100k - $250k") || s.includes("$100k-$250k"))
    return "$100K-$250K";
  if (s.includes("$250k - $500k") || s.includes("$250k-$500k"))
    return "$250K-$500K";
  if (s.includes("$500k - $1m") || s.includes("$500k-$1m")) return "$500K-$1M";
  if (s.includes("$1m - $5m") || s.includes("$1m-$5m")) return "$1M-$5M";
  return "> $5M";
}

function customerTypeForFormula(
  budgetMidpoint: string,
): "Enterprise" | "Mid_market" | "SMB" {
  if (budgetMidpoint === "$1M-$5M" || budgetMidpoint === "> $5M")
    return "Enterprise";
  if (budgetMidpoint === "$250K-$500K" || budgetMidpoint === "$500K-$1M")
    return "Mid_market";
  return "SMB";
}

function riskLevelFromFormulaScore(score: number): "Low" | "Moderate" | "High" {
  if (score <= 33) return "Low";
  if (score <= 66) return "Moderate";
  return "High";
}

function buildFormulaInputFromPayload(payload: Record<string, unknown>) {
  const sector = normalizeSectorForFormula(
    toStringValue(payload.customer_sector ?? payload.customerSector),
  );
  const regulatory = toStringList(
    payload.regulatory_requirements ?? payload.regulatoryRequirements,
  );
  const customerSpecificRisks = toStringList(
    payload.customer_specific_risks ?? payload.customerSpecificRisks,
  );
  const riskMitigations = toStringList(
    payload.risk_mitigation ?? payload.riskMitigation,
  );
  const budgetMidpoint = budgetForFormula(
    toStringValue(payload.customer_budget_range ?? payload.customerBudgetRange),
  );
  const customerType = customerTypeForFormula(budgetMidpoint);
  const alternatives = toStringValue(
    payload.alternatives_considered ?? payload.alternativesConsidered,
  );
  const keyAdvantages = toStringList(
    payload.key_advantages ?? payload.keyAdvantages,
  );

  return {
    customerRegulatoryRequirements: regulatory,
    sector,
    customerDataSensitivity: normalizeDataSensitivityForFormula(
      toStringValue(payload.data_sensitivity ?? payload.dataSensitivity),
    ),
    customerRiskTolerance: normalizeRiskToleranceForFormula(
      toStringValue(
        payload.customer_risk_tolerance ?? payload.customerRiskTolerance,
      ),
    ),
    customerSpecificRiskCount: customerSpecificRisks.length,
    customerType,
    customerHasUniqueRequirements: Boolean(
      toStringValue(
        payload.customer_specific_risks_other ??
          payload.customerSpecificRisksOther,
      ),
    ),
    uniqueRequirementsList: toStringList(
      payload.customer_specific_risks_other ??
        payload.customerSpecificRisksOther,
    ),
    integrationPoints: buildIntegrationPointsForFormula(
      toStringValue(
        payload.integration_complexity ?? payload.integrationComplexity,
      ),
    ),
    customizationLevel: normalizeCustomizationForFormula(
      toStringValue(payload.customization_level ?? payload.customizationLevel),
    ),
    customerRequiresIndustryWorkflows: customerType !== "SMB",
    businessProcessChangesRequired: Math.min(
      4,
      Math.max(0, customerSpecificRisks.length),
    ),
    implementationTimelineMonths: timelineMonthsForFormula(
      toStringValue(
        payload.implementation_timeline ?? payload.implementationTimeline,
      ),
    ),
    regulatoryDeadlineExists: false,
    monthsUntilDeadline: undefined,
    productFeatureMatchPct: 80,
    missingCriticalFeatures: [],
    proposedMitigationsCount: riskMitigations.length,
    avgMitigationsPerRisk: 4,
    competitorCount: alternatives ? "2-3 competitors" : "1 competitor",
    customerConsideringBuildVsBuy: alternatives.toLowerCase().includes("build"),
    customerTechnicalCapability: "Moderate (difficult build)",
    budgetMidpoint,
    approvalLevels: "C_suite_single",
    uniqueDifferentiators: keyAdvantages.length
      ? keyAdvantages
          .slice(0, 3)
          .map(() => ({ advantageType: "Domain_expertise" }))
      : [{ advantageType: "Faster_deployment" }],
    yearsInCustomerSector: 5,
    vendorStage: "growth",
    customerExpectsLargerVendorFeatures: customerType === "Enterprise",
    customerEmployeeCount:
      customerType === "Enterprise"
        ? 2000
        : customerType === "Mid_market"
          ? 500
          : 100,
    vendorEmployeeCount: 250,
  };
}

async function invokeModel(userInput: string): Promise<string> {
  const body = JSON.stringify({
    anthropic_version: "bedrock-2023-05-31",
    max_tokens: 8192,
    temperature: 0.3,
    messages: [{ role: "user", content: [{ type: "text", text: userInput }] }],
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
 * Generate a structured Analysis Report from vendor COTS assessment data.
 * Called when a vendor user completes (submits) a vendor COTS assessment.
 * Uses risk_mappings table: compares assessment context (domain, timing, intent, primary_risk, secondary_risks)
 * to get top 5 risks, then compares that data to risk_top5_mitigations table to attach mitigations.
 * If top5RisksWithMitigations is not provided, the agent fetches it via getTop5RisksWithMitigations(payload).
 */
export async function generateVendorCotsReport(
  payload: Record<string, unknown>,
  top5RisksWithMitigations?: Top5RisksWithMitigations | null,
  attestationFrameworkRows?: FrameworkMappingTableRow[],
): Promise<GeneratedVendorCotsReport | null> {
  try {
    let top5: Top5RisksWithMitigations | null =
      top5RisksWithMitigations ?? null;
    if (top5 == null) {
      top5 = await getTop5RisksWithMitigations(payload);
    }
    const context = buildAssessmentContext(
      payload,
      top5,
      attestationFrameworkRows,
    );
    const userInput = VENDOR_COTS_REPORT_PROMPT + "\n\n" + context;
    const rawReply = await invokeModel(userInput);
    if (!rawReply.trim()) return null;
    const parsed = parseReportSections(rawReply);

    let formulaResult: SalesRiskFormulaResult | null = null;
    try {
      formulaResult = calculateSalesRiskScore(
        buildFormulaInputFromPayload(payload),
      ) as SalesRiskFormulaResult;
    } catch (scoreErr) {
      console.error(
        "calculateSalesRiskScore failed; falling back to model score:",
        scoreErr,
      );
    }

    if (!formulaResult) return { ...parsed, raw: rawReply };

    const score = Math.min(
      100,
      Math.max(0, Math.round(formulaResult.sales_risk_score)),
    );
    const riskLevel = riskLevelFromFormulaScore(score);
    const appendix =
      parsed.fullReport?.appendix &&
      typeof parsed.fullReport.appendix === "object"
        ? (parsed.fullReport.appendix as Record<string, unknown>)
        : {};

    return {
      ...parsed,
      overallRiskScore: score,
      riskLevel,
      fullReport: {
        ...(parsed.fullReport ?? {}),
        appendix: {
          ...appendix,
          salesRiskFormula: formulaResult.detail?.final_formula ?? undefined,
          salesRiskBreakdown: {
            customer_friction_risk: formulaResult.customer_friction_risk,
            implementation_risk: formulaResult.implementation_risk,
            competitive_risk: formulaResult.competitive_risk,
            deal_probability_pct: formulaResult.deal_probability_pct,
            grade: formulaResult.grade,
            classification: formulaResult.classification,
          },
        },
      },
      raw: rawReply,
    };
  } catch (err) {
    console.error("generateVendorCotsReport error:", err);
    return null;
  }
}
