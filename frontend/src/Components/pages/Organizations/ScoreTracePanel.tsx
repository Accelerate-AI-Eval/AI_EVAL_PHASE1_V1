/**
 * ScoreTracePanel — INTERNAL ONLY
 *
 * "Vendor Trust Analysis" drawer for internal operators.
 * Shows: executive summary, category breakdown, score waterfall,
 * score drivers, improvement plan, projected score, methodology, notes.
 *
 * NEVER rendered for buyer or vendor users.
 * Gated at two layers:
 *   1. Backend: requireInternalUser (org_id=1 + system platform role)
 *   2. Frontend: caller checks isInternalUser before mounting
 */
import React, { useState, useEffect, useCallback } from "react";
import { CircleX, AlertTriangle, TrendingUp } from "lucide-react";
import { AdminLlmModelLabel } from "../../UI/AdminLlmModelInfo";
import LoadingMessage from "../../UI/LoadingMessage";
import "./score_trace_panel.css";

// ── Types ─────────────────────────────────────────────────────────────────────

type ScoreTraceComponent = {
  label: string;
  category: string;
  contribution: number;
  direction: "positive" | "negative" | "neutral";
  reason: string;
  sourceType: string;
  sourceLabel: string;
};

type FactorExplanation = {
  category: "Product" | "Governance" | "Operational";
  group: string;
  factor: string;
  status: "present" | "missing" | "weak" | "strong";
  /** Evidence points the line item can award. */
  maxPoints: number;
  awardedPoints: number;
  /** Points off the category score — the factors in a category sum to 100 − category score. */
  deduction: number;
  /** Trust-score points the gap costs — the factors in a category sum to that category's deduction. */
  scoreImpact: number;
  vendorAnswer: string;
  reason: string;
  improvement: string;
  estimatedLift: number;
  evidenceSource: string;
  internalOnly: boolean;
};

type IrsFactorExplanation = {
  category: "OrgReadiness" | "Integration" | "VendorRisk";
  factor: string;
  status: "present" | "missing" | "weak" | "strong";
  contribution: number;
  deduction: number;
  estimatedLift: number;
  reason: string;
  improvement: string;
  sourceField: string;
  internalOnly: boolean;
};

type ScsFactorExplanation = {
  category: "CustomerFriction" | "Implementation" | "Competitive";
  factor: string;
  status: "present" | "missing" | "weak" | "strong";
  contribution: number;
  deduction: number;
  estimatedLift: number;
  reason: string;
  improvement: string;
  sourceField: string;
  internalOnly: boolean;
};

type ScoreTrace = {
  scoreType: "vendor_trust" | "buyer_implementation_risk" | "sales_confidence";
  finalScore: number;
  formula: string;
  scoringVersion: string;
  rawSubScores: Record<string, number | undefined>;
  components: ScoreTraceComponent[];
  warnings: string[];
  missingEvidence: string[];
  /** VTS factor-level explanations — from formula path only. Vendor mode pre-filtered server-side. */
  factorExplanations?: FactorExplanation[];
  /** IRS factor-level explanations — INTERNAL ONLY. Attached by getIrsScoreTrace controller. */
  irsFactorExplanations?: IrsFactorExplanation[];
  /** SCS factor-level explanations — Improvement Plan for Type 2. */
  scsFactorExplanations?: ScsFactorExplanation[];
  /** Stored Bedrock/Controls model id from the score-trace API (when persisted). */
  llmModelId?: string | null;
  generatedAt: string;
};

type ParsedOpportunity = {
  title: string;
  whyItHelps: string;
  evidenceNeeded: string;
  category: string;
  lift: number | null;
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface ScoreTracePanelProps {
  isOpen: boolean;
  onClose: () => void;
  assessmentId: string;
  assessmentTitle: string;
  traceType: "irs" | "vts" | "scs";
  reportId?: string;
  /** "vendor" hides formula, methodology, internal warnings, and INTERNAL ONLY badges. */
  mode?: "internal" | "vendor";
  /** Used in vendor mode to call the vendor-safe score endpoint. */
  vendorAttestationId?: string;
  /** Stored LLM model id for System Admin header (types 1–3). Ids only — not display names. */
  llmModelName?: string | null;
  /**
   * Score already shown on the parent card. When set, the headline uses this
   * so explainability matches the card instead of a recomputed canonical value.
   */
  cardScore?: number | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE_TYPE_LABELS: Record<string, string> = {
  assessment_answer:  "Buyer Assessment",
  vendor_attestation: "Vendor Attestation",
  uploaded_document:  "Uploaded Document",
  certification:      "Certification",
  risk_intellect:     "Risk Intellect",
  system_default:     "System Default",
};

const SUB_SCORE_LABELS: Record<string, string> = {
  vendorRisk:       "Vendor Risk",
  orgReadinessGap:  "Org Readiness Gap",
  integrationRisk:  "Integration Risk",
  vendorTrustScore: "Vendor Trust Score",
  productScore:     "Product Score",
  governanceScore:  "Governance Score",
  operationalScore: "Operational Score",
  customerFrictionScore: "Customer Friction Score",
  implementationScore: "Implementation Score",
  competitiveScore: "Competitive Score",
  salesRiskScore: "Sales Risk Score",
};

const CATEGORY_TO_SUBSCORE_KEY: Record<string, string> = {
  Product:     "productScore",
  Governance:  "governanceScore",
  Operational: "operationalScore",
};

const SCS_CATEGORY_TO_SUBSCORE_KEY: Record<string, string> = {
  CustomerFriction: "customerFrictionScore",
  Implementation: "implementationScore",
  Competitive: "competitiveScore",
};

const SCS_CATEGORY_DISPLAY: Record<string, string> = {
  CustomerFriction: "Customer Friction",
  Implementation: "Implementation",
  Competitive: "Competitive",
};

// IRS-specific constants
const IRS_CATEGORY_DISPLAY: Record<string, string> = {
  OrgReadiness: "Org Readiness Gap",
  Integration:  "Integration Risk",
  VendorRisk:   "Vendor Risk",
};

/** Buyer COTS assessment field keys → display names (not DB / camelCase schema keys). */
const IRS_FIELD_DISPLAY: Record<string, string> = {
  digitalMaturityLevel: "Digital Maturity Level",
  dataGovernanceMaturity: "Data Governance Maturity",
  aiGovernanceBoard: "AI Governance Board",
  aiEthicsPolicy: "AI Ethics Policy",
  implementationTeamComposition: "Implementation Team Composition",
  implementationCapacity: "Implementation Capacity",
  riskAppetite: "Risk Appetite",
  criticality: "Decision Stakes",
  decisionStakes: "Decision Stakes",
  integrationSystems: "Integration Systems",
  integrationAccessLevels: "Integration Access Levels",
  requirementGaps: "Current Usage State",
  currentUsageState: "Current Usage State",
  rollbackCapability: "Rollback Capability",
  monitoringDataAvailable: "Monitoring Data Available",
  auditLogsAvailable: "Audit Logs Available",
  testingResultsAvailable: "Testing Results Available",
  humanReviewLevel: "Human Review Level",
  dataSensitivity: "Data Sensitivity",
  unavailabilityImpact: "Unavailability Impact",
  dataExportCapability: "Data Export Capability",
  outputExposure: "Output Exposure",
  trainingUseOfData: "Training Use of Data",
  deploymentModel: "Deployment Model",
  pilotStatus: "Pilot Status",
  usersInScope: "Users in Scope",
  trainingEffort: "Training Effort",
  contractsInPlace: "Contracts in Place",
  useCaseTypes: "Use Case Types",
  answerConfidence: "Answer Confidence",
  vendorEvidenceReceived: "Vendor Evidence Received",
};

// Maps IRS category → rawSubScores key
const IRS_CATEGORY_TO_SUBSCORE_KEY: Record<string, string> = {
  OrgReadiness: "orgReadinessGap",
  Integration:  "integrationRisk",
  VendorRisk:   "vendorTrustScore",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** camelCase / snake_case → Title Case when no explicit map entry exists. */
function humanizeFieldKey(raw: string): string {
  const s = raw.trim();
  if (!s) return s;
  if (IRS_FIELD_DISPLAY[s]) return IRS_FIELD_DISPLAY[s];
  return s
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (ch) => ch.toUpperCase())
    .replace(/\bAi\b/g, "AI")
    .replace(/\bId\b/g, "ID");
}

function formatEvidenceSourceLabel(sourceLabel: string): string {
  const stripped = sourceLabel
    .replace(/^field:\s*/i, "")
    .replace(/^fields:\s*/i, "")
    .replace(/^vendor:\s*/i, "")
    .replace(/^report:\s*/i, "")
    .replace(/^attestation:\s*/i, "")
    .replace(/^assessment:\s*/i, "")
    .trim();
  if (!stripped) return stripped;
  // Multi-field: "criticality, riskAppetite"
  if (stripped.includes(",")) {
    return stripped
      .split(",")
      .map((part) => humanizeFieldKey(part.trim()))
      .filter(Boolean)
      .join(", ");
  }
  return humanizeFieldKey(stripped);
}

function displayCategoryName(category: string): string {
  return (
    IRS_CATEGORY_DISPLAY[category] ??
    SCS_CATEGORY_DISPLAY[category] ??
    category.replace(/([a-z])([A-Z])/g, "$1 $2")
  );
}

function sanitizeEvidenceLabel(
  sourceLabel: string,
  sourceType: string,
  fallbackName?: string,
): string {
  const stripped = sourceLabel
    .replace(/^field:\s*/i, "")
    .replace(/^fields:\s*/i, "")
    .replace(/^vendor:\s*/i, "")
    .replace(/^report:\s*/i, "")
    .replace(/^attestation:\s*/i, "")
    .replace(/^assessment:\s*/i, "")
    .trim();

  const namedFallback = fallbackName?.trim();

  if (UUID_RE.test(stripped)) {
    if (namedFallback) return namedFallback;
    if (sourceType === "vendor_attestation") return "Vendor Attestation";
    if (sourceType === "assessment_answer") return "Assessment Answers";
    return "Generated Profile Report";
  }

  // "assessment: <uuid>" / "report: <uuid>" left as-is after partial strip
  const uuidMatch = stripped.match(UUID_RE);
  if (uuidMatch && stripped.length <= uuidMatch[0].length + 2) {
    if (namedFallback) return namedFallback;
    if (sourceType === "assessment_answer") return "Assessment Answers";
    return "Generated Profile Report";
  }

  // Prefer proper assessment field names over camelCase / DB keys
  if (
    sourceType === "assessment_answer" ||
    /^field/i.test(sourceLabel) ||
    IRS_FIELD_DISPLAY[stripped] ||
    stripped.includes(",")
  ) {
    return formatEvidenceSourceLabel(sourceLabel);
  }

  return formatEvidenceSourceLabel(stripped) || stripped;
}

function formatContribution(n: number): string {
  if (n === 0) return "±0.0";
  return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
}

function riskRatingLabel(score: number): string {
  if (score >= 80) return "Very Low Risk";
  if (score >= 65) return "Low Risk";
  if (score >= 50) return "Moderate Risk";
  if (score >= 35) return "High Risk";
  return "Critical Risk";
}

function riskRatingKey(score: number): string {
  if (score >= 80) return "verylow";
  if (score >= 65) return "low";
  if (score >= 50) return "moderate";
  if (score >= 35) return "high";
  return "critical";
}

function scoreCircleClass(score: number): string {
  if (score >= 65) return "stp_score_good";
  if (score >= 50) return "stp_score_medium";
  if (score >= 35) return "stp_score_concerning";
  return "stp_score_poor";
}

function categoryRatingLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 75) return "Good";
  if (score >= 55) return "Acceptable";
  if (score >= 40) return "Needs Improvement";
  return "Poor";
}

function categoryRatingKey(score: number): string {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 55) return "acceptable";
  if (score >= 40) return "needswork";
  return "poor";
}

function vtsComponentSeverity(
  c: ScoreTraceComponent,
  rawSubScores: Record<string, number | undefined>,
): string {
  const subScoreKey = CATEGORY_TO_SUBSCORE_KEY[c.category];
  const categoryScore = subScoreKey ? rawSubScores[subScoreKey] : undefined;
  if (typeof categoryScore === "number") {
    if (categoryScore >= 70) return "low_concern";
    if (categoryScore >= 50) return "moderate";
    return "negative";
  }
  return c.direction;
}

/** Deterministic IRS insight — no LLM, derived purely from IRS trace data */
function buildIrsInsight(trace: ScoreTrace): string {
  const { rawSubScores, finalScore, irsFactorExplanations } = trace;
  const orgGap = rawSubScores.orgReadinessGap;
  const intRisk = rawSubScores.integrationRisk;
  const vts = rawSubScores.vendorTrustScore;

  const ratingLabel = finalScore >= 65 ? "low" : finalScore >= 50 ? "moderate" : finalScore >= 35 ? "high" : "critical";

  let text = `Overall implementation risk is ${ratingLabel}`;
  if (finalScore >= 65)       text += ` — this buyer profile presents a manageable implementation profile`;
  else if (finalScore >= 50)  text += ` — the implementation can proceed with targeted risk mitigations`;
  else if (finalScore >= 35)  text += ` — significant gaps must be addressed before implementation proceeds`;
  else                        text += ` — multiple critical gaps create substantial implementation risk`;
  text += ".";

  const gaps: string[] = [];
  if (orgGap !== undefined && orgGap > 50)  gaps.push(`organizational readiness (gap: ${Math.round(orgGap)})`);
  if (intRisk !== undefined && intRisk > 40) gaps.push(`integration complexity (risk: ${Math.round(intRisk)})`);
  if (vts !== undefined && vts < 50)         gaps.push(`vendor trust score (${Math.round(vts)}/100)`);

  if (gaps.length > 0) {
    text += ` The primary risk drivers are ${gaps.join(" and ")}.`;
  }

  const actionable = irsFactorExplanations?.filter((f) => f.estimatedLift > 0 && !f.internalOnly) ?? [];
  if (actionable.length > 0) {
    const topLift = actionable.slice(0, 2).map((f) => f.factor.replace(/^(No |Digital Maturity:|Data Governance:)\s*/i, "")).join(" and ");
    text += ` Addressing ${topLift.toLowerCase()} would have the highest impact on reducing risk.`;
  }

  return text;
}

/** Deterministic SCS insight — no LLM, derived from type 2 readiness (100 − sales risk) */
function buildScsInsight(trace: ScoreTrace): string {
  const { rawSubScores, finalScore } = trace;
  const readiness = Math.round(finalScore);
  const cfr = rawSubScores.customerFrictionScore;
  const impl = rawSubScores.implementationScore;
  const comp = rawSubScores.competitiveScore;

  if (cfr === undefined && impl === undefined && comp === undefined) {
    return "Category-level readiness breakdown is unavailable. Re-submitting the Vendor COTS assessment will refresh scoring detail.";
  }

  const scored: { name: string; score: number }[] = [];
  if (cfr !== undefined) scored.push({ name: "customer-friction posture", score: Math.round(cfr) });
  if (impl !== undefined) scored.push({ name: "implementation readiness for the deal", score: Math.round(impl) });
  if (comp !== undefined) scored.push({ name: "competitive positioning", score: Math.round(comp) });
  scored.sort((a, b) => b.score - a.score);
  const strongest = scored[0];
  const weakest = scored[scored.length - 1];

  let text = `Overall readiness is ${readiness}/100`;
  if (readiness >= 80) text += " — this deal presents a strong confidence profile";
  else if (readiness >= 65) text += " — the deal can proceed with targeted risk mitigations";
  else if (readiness >= 50) text += " — material sales risks should be addressed before close";
  else text += " — multiple sales-risk drivers create substantial deal friction";
  text += ".";

  if (strongest) {
    text += ` Strongest area: ${strongest.name} (${strongest.score}/100).`;
  }
  if (weakest && strongest && weakest.score < strongest.score) {
    text += ` Biggest drag: ${weakest.name} (${weakest.score}/100).`;
  }
  return text;
}

/** Deterministic VTS Insight — no LLM, derived purely from trace data */
function buildAiInsight(trace: ScoreTrace): string {
  if (trace.scoreType === "sales_confidence") return buildScsInsight(trace);
  const { rawSubScores, finalScore } = trace;
  const productScore  = rawSubScores.productScore;
  const govScore      = rawSubScores.governanceScore;
  const opsScore      = rawSubScores.operationalScore;

  if (productScore === undefined && govScore === undefined && opsScore === undefined) {
    return "Category-level score breakdown is unavailable. Submitting an updated vendor attestation will generate a detailed breakdown and enable targeted improvement recommendations.";
  }

  const scored: { name: string; label: string; score: number }[] = [];
  if (productScore !== undefined) scored.push({ name: "product capability", label: "Product", score: Math.round(productScore) });
  if (govScore     !== undefined) scored.push({ name: "governance maturity", label: "Governance", score: Math.round(govScore) });
  if (opsScore     !== undefined) scored.push({ name: "operational readiness", label: "Operational", score: Math.round(opsScore) });

  scored.sort((a, b) => b.score - a.score);
  const strongest = scored[0];
  const weakest   = scored[scored.length - 1];

  let text = "";

  if (strongest.score >= 80) {
    text += `The vendor demonstrates strong ${strongest.name} (${strongest.score}/100)`;
  } else if (strongest.score >= 60) {
    text += `The vendor shows acceptable ${strongest.name} (${strongest.score}/100)`;
  } else {
    text += `All scoring categories currently require improvement`;
  }

  if (scored.length > 1 && weakest.score < strongest.score) {
    if (weakest.score < 50) {
      text += `, but is significantly constrained by ${weakest.name} (${weakest.score}/100)`;
    } else if (weakest.score < 70) {
      text += ` with moderate constraints from ${weakest.name} (${weakest.score}/100)`;
    }
  }
  text += ".";

  const govGap  = govScore  !== undefined && govScore  < 60;
  const opsGap  = opsScore  !== undefined && opsScore  < 60;
  const prodGap = productScore !== undefined && productScore < 60;

  if (govGap) {
    text += " Addressing missing governance evidence — particularly compliance certifications and policy documentation — would substantially improve enterprise readiness and buyer confidence.";
  } else if (opsGap) {
    text += " Strengthening operational documentation and SLA commitments would reduce operational risk and lift the overall score.";
  } else if (prodGap) {
    text += " Improving product risk mitigation evidence or obtaining a third-party audit would increase confidence in the product score.";
  } else if (finalScore < 80) {
    text += " Incremental evidence improvements across governance and operational categories would further strengthen the overall score.";
  } else {
    text += " The vendor demonstrates strong evidence coverage across all categories.";
  }

  return text;
}

function parseImprovementOpportunities(missingEvidence: string[]): ParsedOpportunity[] {
  const result: ParsedOpportunity[] = [];

  for (const ev of missingEvidence) {
    if (
      ev.toLowerCase().includes("no scorebycat") ||
      ev.toLowerCase().includes("re-generating") ||
      ev.toLowerCase().includes("per-factor sub-breakdown") ||
      ev.toLowerCase().includes("not stored in generated_profile")
    ) continue;

    const dashIdx = ev.indexOf(" — ");

    if (dashIdx === -1) {
      const ptsMatch = ev.match(/\(\+(\d+)\s*pts?\)/i);
      const clean = ev.replace(/\s*\(\+\d+\s*pts?\)/gi, "").trim();
      if (clean.length > 3) {
        result.push({ title: clean.charAt(0).toUpperCase() + clean.slice(1), whyItHelps: "", evidenceNeeded: "", category: "General", lift: ptsMatch ? parseInt(ptsMatch[1]) : null });
      }
      continue;
    }

    const header   = ev.substring(0, dashIdx);
    const catMatch = header.match(/^(Governance|Operational|Product)/i);
    const category = catMatch ? catMatch[1] : "General";
    const causesRaw = ev.substring(dashIdx + 3);
    const isActionable = causesRaw.toLowerCase().includes("common causes:");

    if (!isActionable) {
      result.push({ title: `Review ${category} risk factors`, whyItHelps: causesRaw.replace(/\.$/, "").trim(), evidenceNeeded: `Third-party audit or additional verification of ${category.toLowerCase()} risk factors`, category, lift: null });
      continue;
    }

    const causesStart = causesRaw.replace(/^[^:]+:\s*/i, "");
    const items = causesStart.split(/,\s*(?![^(]*\))/);

    for (const item of items) {
      const trimmed = item.trim().replace(/\.$/, "");
      if (!trimmed || trimmed.length < 4) continue;

      const ptsMatch = trimmed.match(/\(\+(\d+)\s*pts?\)/i);
      const lift = ptsMatch ? parseInt(ptsMatch[1]) : null;
      const rawTitle = trimmed.replace(/\s*\(\+\d+\s*pts?\)/gi, "").trim();
      if (!rawTitle) continue;

      let displayTitle = rawTitle;
      if (displayTitle.toLowerCase().startsWith("missing "))       displayTitle = "Add "     + displayTitle.substring("missing ".length);
      else if (displayTitle.toLowerCase().startsWith("no "))       displayTitle = "Provide " + displayTitle.substring("no ".length);
      else if (displayTitle.toLowerCase().startsWith("low "))      displayTitle = "Improve " + displayTitle;
      displayTitle = displayTitle.charAt(0).toUpperCase() + displayTitle.slice(1);

      result.push({ title: displayTitle, whyItHelps: evidenceWhyText(rawTitle, category), evidenceNeeded: evidenceNeededText(rawTitle), category, lift });
    }
  }

  // Sort by lift descending (nulls last)
  return result.sort((a, b) => {
    if (a.lift !== null && b.lift !== null) return b.lift - a.lift;
    if (a.lift !== null) return -1;
    if (b.lift !== null) return 1;
    return 0;
  });
}

function evidenceWhyText(rawTitle: string, category: string): string {
  const t = rawTitle.toLowerCase();
  if (t.includes("soc 2"))           return "SOC 2 Type II provides independent evidence of security controls and operational maturity.";
  if (t.includes("iso 27001"))       return "ISO 27001 improves confidence in information security management practices.";
  if (t.includes("incident response")) return "A documented incident response plan demonstrates operational readiness and reduces response risk.";
  if (t.includes("ai ethics") || t.includes("ethics policy")) return "An AI ethics policy demonstrates responsible AI governance and reduces regulatory exposure.";
  if (t.includes("sla") || t.includes("uptime")) return "Higher SLA uptime commitments signal operational reliability and reduce buyer risk exposure.";
  if (t.includes("24/7") || t.includes("support tier")) return "24/7 support availability improves operational continuity and reduces escalation risk.";
  if (t.includes("early-stage") || t.includes("deployment scale")) return "Deployment scale and company maturity reduce operational continuity risk.";
  return `Additional ${category.toLowerCase()} evidence reduces risk and improves the Vendor Trust Score.`;
}

function evidenceNeededText(rawTitle: string): string {
  const t = rawTitle.toLowerCase();
  if (t.includes("soc 2 type 2") || t.includes("soc 2 type ii")) return "SOC 2 Type II report or attestation letter";
  if (t.includes("soc 2"))             return "SOC 2 report or attestation letter";
  if (t.includes("iso 27001"))         return "ISO 27001 certificate";
  if (t.includes("incident response")) return "Documented incident response plan or policy";
  if (t.includes("ai ethics") || t.includes("ethics policy")) return "AI ethics policy document";
  if (t.includes("sla") || t.includes("uptime")) return "SLA documentation showing uptime commitments";
  if (t.includes("24/7") || t.includes("support tier")) return "Support tier documentation or service agreement";
  return "Supporting documentation or certification";
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScoreTracePanel({
  isOpen,
  onClose,
  assessmentId,
  assessmentTitle,
  traceType,
  reportId,
  mode = "internal",
  vendorAttestationId,
  llmModelName = null,
  cardScore = null,
}: ScoreTracePanelProps) {
  const [trace, setTrace]   = useState<ScoreTrace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState<string | null>(null);
  const [activeLlmLabel, setActiveLlmLabel] = useState<string | null>(null);

  const BASE_URL = (import.meta.env.VITE_BASE_URL ?? "http://localhost:5003/api/v1") as string;

  useEffect(() => {
    if (!isOpen) {
      setActiveLlmLabel(null);
      return;
    }
    if (mode === "vendor") return;
    const fromProp = typeof llmModelName === "string" ? llmModelName.trim() : "";
    if (fromProp) setActiveLlmLabel(fromProp);
    // If prop is empty, fetchTrace will hydrate from API llmModelId.
  }, [isOpen, mode, llmModelName]);

  const fetchTrace = useCallback(async () => {
    const token = sessionStorage.getItem("bearerToken");
    setLoading(true);
    setError(null);
    setTrace(null);

    try {
      let path: string;
      if (mode === "vendor" && vendorAttestationId) {
        path = `/vendorSelfAttestation/score-summary/${encodeURIComponent(vendorAttestationId)}`;
      } else if (traceType === "vts") {
        const id = reportId || assessmentId;
        if (!id) { setLoading(false); return; }
        path = `/internal/score-trace/vts/${encodeURIComponent(id)}`;
      } else if (traceType === "scs") {
        if (!assessmentId) { setLoading(false); return; }
        path = `/internal/score-trace/scs/${encodeURIComponent(assessmentId)}`;
      } else {
        if (!assessmentId) { setLoading(false); return; }
        path = `/internal/score-trace/irs/${encodeURIComponent(assessmentId)}`;
      }

      const res = await fetch(`${BASE_URL.replace(/\/$/, "")}${path}`, {
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
      });

      const result = await res.json() as { data?: Partial<ScoreTrace>; error?: string; success?: boolean };
      if (!res.ok) throw new Error(result?.error ?? "Failed to load score trace");
      if (!result.data) throw new Error("No score data returned");

      // Coerce to full ScoreTrace — vendor endpoint omits formula/components/warnings; default to safe empty values
      const d = result.data;
      const raw = d as Record<string, unknown>;
      const apiLlmModelId =
        (typeof raw.llmModelId === "string" && raw.llmModelId.trim()) ||
        (typeof raw.llm_model_id === "string" && raw.llm_model_id.trim()) ||
        null;
      const rawSubScores = {
        ...(typeof raw.raw_sub_scores === "object" && raw.raw_sub_scores != null && !Array.isArray(raw.raw_sub_scores)
          ? (raw.raw_sub_scores as Record<string, number | undefined>)
          : {}),
        ...(d.rawSubScores ?? {}),
      };
      const coerced: ScoreTrace = {
        scoreType:         d.scoreType         ?? "vendor_trust",
        finalScore:        d.finalScore        ?? 0,
        formula:           d.formula           ?? "",
        scoringVersion:    d.scoringVersion    ?? "",
        rawSubScores,
        components:        d.components        ?? [],
        warnings:          d.warnings          ?? [],
        missingEvidence:   d.missingEvidence   ?? [],
        factorExplanations: Array.isArray(raw.factorExplanations)
          ? (raw.factorExplanations as FactorExplanation[])
          : undefined,
        irsFactorExplanations: Array.isArray(raw.irsFactorExplanations)
          ? (raw.irsFactorExplanations as IrsFactorExplanation[])
          : undefined,
        scsFactorExplanations: Array.isArray(raw.scsFactorExplanations)
          ? (raw.scsFactorExplanations as ScsFactorExplanation[])
          : undefined,
        llmModelId:        apiLlmModelId,
        generatedAt:
          (typeof d.generatedAt === "string" && d.generatedAt.trim()) ||
          (typeof raw.generated_at === "string" && raw.generated_at.trim()) ||
          "",
      };
      setTrace(coerced);

      // Prefer parent prop; otherwise show model id returned by the score-trace API.
      if (mode !== "vendor") {
        const fromProp = typeof llmModelName === "string" ? llmModelName.trim() : "";
        setActiveLlmLabel(fromProp || apiLlmModelId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unexpected error loading score data");
    } finally {
      setLoading(false);
    }
  }, [assessmentId, reportId, traceType, mode, vendorAttestationId, BASE_URL, llmModelName]);

  useEffect(() => {
    if (isOpen) void fetchTrace();
    else { setTrace(null); setError(null); }
  }, [isOpen, fetchTrace]);

  useEffect(() => {
    if (!isOpen) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // ── Derived values ────────────────────────────────────────────────────────
  // Prefer the requested traceType so titles are correct while loading (before
  // trace.scoreType is available). Otherwise VTS falls through to IRS labels.

  const isVendorMode = mode === "vendor";
  const isVts =
    isVendorMode ||
    traceType === "vts" ||
    trace?.scoreType === "vendor_trust";
  const isScs =
    !isVts &&
    (traceType === "scs" || trace?.scoreType === "sales_confidence");
  const isIrs = !isVts && !isScs;
  const drawerTitle = isVendorMode
    ? "Trust Score Analysis"
    : isVts
      ? "Vendor Trust Score Explainability"
      : isScs
        ? "Readiness Explainability"
        : "Implementation Risk Explainability";
  const scoreTypeLabel = isVts
    ? "Vendor Trust Score"
    : isScs
      ? "Readiness Score"
      : "Implementation Risk Score";

  const subScoreEntries = trace
    ? (Object.entries(trace.rawSubScores).filter(([, v]) => v !== undefined) as [string, number][])
    : [];

  const components = trace?.components ?? [];

  // VTS: build improvements from factorExplanations when available, fallback to missingEvidence parsing
  const factorImprovements: FactorExplanation[] = isVts && trace?.factorExplanations
    ? trace.factorExplanations
        .filter((f) => f.deduction > 0)
        .sort((a, b) => b.estimatedLift - a.estimatedLift)
    : [];
  const improvements = factorImprovements.length > 0
    ? []
    : (isVts || isScs) && trace ? parseImprovementOpportunities(trace.missingEvidence) : [];

  // IRS: build improvements from irsFactorExplanations
  const irsFactorImprovements: IrsFactorExplanation[] = isIrs && trace?.irsFactorExplanations
    ? trace.irsFactorExplanations
        .filter((f) => f.estimatedLift > 0)
        .sort((a, b) => b.estimatedLift - a.estimatedLift)
    : [];

  // SCS: build improvements from scsFactorExplanations
  const scsFactorImprovements: ScsFactorExplanation[] = isScs && trace?.scsFactorExplanations
    ? trace.scsFactorExplanations
        .filter((f) => f.estimatedLift > 0)
        .sort((a, b) => b.estimatedLift - a.estimatedLift)
    : [];

  // Evidence coverage: average of category scores (VTS / SCS)
  const vtsCategoryScores = isVts && trace
    ? [trace.rawSubScores.productScore, trace.rawSubScores.governanceScore, trace.rawSubScores.operationalScore]
        .filter((v): v is number => typeof v === "number")
    : [];
  const scsCategoryScores = isScs && trace
    ? [
        trace.rawSubScores.customerFrictionScore,
        trace.rawSubScores.implementationScore,
        trace.rawSubScores.competitiveScore,
      ].filter((v): v is number => typeof v === "number")
    : [];
  const categoryScoresForCoverage = isScs ? scsCategoryScores : vtsCategoryScores;

  const coverageAvg = categoryScoresForCoverage.length > 0
    ? categoryScoresForCoverage.reduce((s, v) => s + v, 0) / categoryScoresForCoverage.length
    : null;

  const coverageLabel = coverageAvg !== null
    ? coverageAvg >= 70 ? "High" : coverageAvg >= 50 ? "Medium" : "Low"
    : null;

  // Dispatch to the correct insight builder
  const aiInsight = trace
    ? isIrs
      ? buildIrsInsight(trace)
      : buildAiInsight(trace)
    : "";

  // Projected score — sum of available lifts, capped at 100
  const totalLift = isIrs
    ? irsFactorImprovements.reduce((s, f) => s + f.estimatedLift, 0)
    : isScs
      ? scsFactorImprovements.reduce((s, f) => s + f.estimatedLift, 0)
    : factorImprovements.length > 0
      ? factorImprovements.reduce((s, f) => s + f.estimatedLift, 0)
      : improvements.reduce((s, o) => s + (o.lift ?? 0), 0);

  const cardHeadline =
    typeof cardScore === "number" && Number.isFinite(cardScore)
      ? Math.round(Math.max(0, Math.min(100, cardScore)))
      : null;
  const scsReadiness = trace
    ? Math.round(
        Number.isFinite(trace.finalScore)
          ? trace.finalScore
          : Math.max(0, Math.min(100, 100 - Number(trace.rawSubScores.salesRiskScore ?? 0))),
      )
    : 0;
  const irsImplementationRisk = trace
    ? Math.round(Math.max(0, Math.min(100, 100 - trace.finalScore)))
    : 0;
  const headlineScore =
    cardHeadline ??
    (trace ? (isScs ? scsReadiness : isIrs ? irsImplementationRisk : Math.round(trace.finalScore)) : 0);
  // Type 2 readiness and type 1 VTS: higher is better. Type 3 implementation risk: higher is worse.
  const ratingScore = isIrs ? Math.max(0, Math.min(100, 100 - headlineScore)) : headlineScore;
  const projectedScore = trace
    ? isIrs
      ? Math.max(0, headlineScore - totalLift)
      : Math.min(headlineScore + totalLift, 100)
    : null;

  const generatedAt = (() => {
    if (!trace?.generatedAt) return "";
    const d = new Date(trace.generatedAt);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  })();

  return (
    <div className="stp_overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={drawerTitle}>
      <div className="stp_panel" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="stp_header">
          <div className="stp_header_left">
            {!isVendorMode && <span className="stp_internal_badge">INTERNAL ONLY</span>}
            <h2 className="stp_title">{drawerTitle}</h2>
            <p className="stp_subtitle" title={assessmentTitle}>{assessmentTitle}</p>
            {!isVendorMode && (
              <AdminLlmModelLabel
                modelName={activeLlmLabel || trace?.llmModelId || null}
                fallbackToActive
                preferModelId
                showIcon={false}
                className="stp_llm_model_row stp_llm_model_label"
              />
            )}
          </div>
          <button type="button" className="stp_close_btn" onClick={onClose} aria-label="Close">
            <CircleX size={22} />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="stp_body">

          {loading && <LoadingMessage message="Loading analysis…" compact />}

          {!loading && error && (
            <div className="stp_error" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {!loading && !error && trace && (
            <>
              {/* ──────────────────────────────────────────────────────────────
                  SECTION A — Executive Summary
              ────────────────────────────────────────────────────────────── */}
              <section className="stp_exec_summary">
                {/* Score row */}
                <div className="stp_exec_score_row">
                  <div className={`stp_score_circle ${scoreCircleClass(ratingScore)}`}>
                    <span className="stp_score_number">{headlineScore}</span>
                    <span className="stp_score_denom">/ 100</span>
                  </div>
                  <div className="stp_exec_score_meta">
                    <p className="stp_score_type_label">{scoreTypeLabel}</p>
                    <span className={`stp_risk_rating_pill stp_risk_${riskRatingKey(ratingScore)}`}>
                      {riskRatingLabel(ratingScore)}
                    </span>
                    <div className="stp_exec_meta_row">
                      {coverageLabel && (
                        <span className="stp_exec_meta_item">
                          <span className="stp_exec_meta_label">Coverage</span>
                          <span className={`stp_coverage_badge stp_coverage_${coverageLabel.toLowerCase()}`}>{coverageLabel}</span>
                        </span>
                      )}
                      <span className="stp_exec_meta_item">
                        <span className="stp_exec_meta_label">Version</span>
                        <span className="stp_exec_meta_value">v{trace.scoringVersion}</span>
                      </span>
                      {generatedAt && (
                        <span className="stp_exec_meta_item">
                          <span className="stp_exec_meta_label">Calculated</span>
                          <span className="stp_exec_meta_value">{generatedAt}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* AI Insight (deterministic) */}
                {aiInsight && (
                  <div className="stp_ai_insight">
                    <span className="stp_ai_insight_label">Analysis</span>
                    <p className="stp_ai_insight_text">{aiInsight}</p>
                  </div>
                )}
              </section>

              {/* ──────────────────────────────────────────────────────────────
                  SECTION B — Category Cards (VTS / SCS) or Sub-Score Grid (IRS)
              ────────────────────────────────────────────────────────────── */}
              {isVts && vtsCategoryScores.length > 0 ? (
                <section className="stp_section">
                  <h3 className="stp_section_title">Category Breakdown</h3>
                  <div className="stp_cat_cards_grid">
                    {(["Product", "Governance", "Operational"] as const).map((cat) => {
                      const key = CATEGORY_TO_SUBSCORE_KEY[cat];
                      const score = key ? trace.rawSubScores[key] : undefined;
                      if (score === undefined) return null;
                      const pct   = Math.round(score);
                      const rKey  = categoryRatingKey(pct);
                      const rLabel = categoryRatingLabel(pct);
                      const catHints = trace.factorExplanations
                        ? trace.factorExplanations
                            .filter((f) => f.category === cat && f.deduction > 0)
                            .sort((a, b) => b.deduction - a.deduction)
                            .slice(0, 3)
                        : [];
                      return (
                        <div key={cat} className={`stp_cat_card stp_cat_${rKey}`}>
                          <div className="stp_cat_card_header">
                            <span className="stp_cat_name">{cat}</span>
                            <span className="stp_cat_score">{pct}<span className="stp_cat_score_denom">/100</span></span>
                          </div>
                          <div className="stp_cat_progress">
                            <div className="stp_cat_progress_fill" style={{ width: `${pct}%` }} />
                          </div>
                          <span className={`stp_cat_rating_label stp_cat_rating_${rKey}`}>{rLabel}</span>
                          {catHints.length > 0 && (
                            <div className="stp_cat_factor_hints">
                              {catHints.map((f, fi) => (
                                <div key={fi} className={`stp_cat_factor_hint stp_factor_${f.status}`}>
                                  <span className="stp_cat_factor_hint_name">{f.factor}</span>
                                  <span className="stp_cat_factor_hint_ded">−{f.deduction.toFixed(1)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : isScs && scsCategoryScores.length > 0 ? (
                <section className="stp_section">
                  <h3 className="stp_section_title">Category Breakdown</h3>
                  <div className="stp_cat_cards_grid">
                    {(["CustomerFriction", "Implementation", "Competitive"] as const).map((cat) => {
                      const key = SCS_CATEGORY_TO_SUBSCORE_KEY[cat];
                      const score = key ? trace.rawSubScores[key] : undefined;
                      if (score === undefined) return null;
                      const pct = Math.round(score);
                      const rKey = categoryRatingKey(pct);
                      const rLabel = categoryRatingLabel(pct);
                      return (
                        <div key={cat} className={`stp_cat_card stp_cat_${rKey}`}>
                          <div className="stp_cat_card_header">
                            <span className="stp_cat_name">{SCS_CATEGORY_DISPLAY[cat]}</span>
                            <span className="stp_cat_score">{pct}<span className="stp_cat_score_denom">/100</span></span>
                          </div>
                          <div className="stp_cat_progress">
                            <div className="stp_cat_progress_fill" style={{ width: `${pct}%` }} />
                          </div>
                          <span className={`stp_cat_rating_label stp_cat_rating_${rKey}`}>{rLabel}</span>
                          <span className="stp_cat_readiness_note">
                            Readiness {pct}/100
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ) : isIrs && (
                // IRS: category cards with risk-driver values (higher = more risk)
                <section className="stp_section">
                  <h3 className="stp_section_title">Category Breakdown</h3>
                  <div className="stp_cat_cards_grid">
                    {(["OrgReadiness", "Integration", "VendorRisk"] as const).map((cat) => {
                      const subKey   = IRS_CATEGORY_TO_SUBSCORE_KEY[cat];
                      const rawVal   = subKey ? trace.rawSubScores[subKey] : undefined;
                      if (rawVal === undefined) return null;
                      const risk = Math.round(subKey === "vendorTrustScore" ? 100 - rawVal : rawVal);
                      const rKey      = categoryRatingKey(Math.max(0, 100 - risk));
                      const rLabel    = categoryRatingLabel(Math.max(0, 100 - risk));
                      // Hide VendorRisk card in vendor mode (internalOnly)
                      if (cat === "VendorRisk" && isVendorMode) return null;
                      const catHints = trace.irsFactorExplanations
                        ? trace.irsFactorExplanations
                            .filter((f) => f.category === cat && f.deduction > 0)
                            .sort((a, b) => b.deduction - a.deduction)
                            .slice(0, 3)
                        : [];
                      return (
                        <div key={cat} className={`stp_cat_card stp_cat_${rKey}`}>
                          <div className="stp_cat_card_header">
                            <span className="stp_cat_name">{IRS_CATEGORY_DISPLAY[cat]}</span>
                            <span className="stp_cat_score">
                              {risk}<span className="stp_cat_score_denom">/100</span>
                            </span>
                          </div>
                          <div className="stp_cat_progress">
                            <div className="stp_cat_progress_fill" style={{ width: `${Math.max(0, 100 - risk)}%` }} />
                          </div>
                          <span className={`stp_cat_rating_label stp_cat_rating_${rKey}`}>{rLabel}</span>
                          {cat !== "VendorRisk" && (
                            <span className="stp_cat_readiness_note">
                              Risk {risk}/100
                            </span>
                          )}
                          {cat === "VendorRisk" && (
                            <span className="stp_cat_readiness_note">Vendor risk {risk}/100</span>
                          )}
                          {catHints.length > 0 && (
                            <div className="stp_cat_factor_hints">
                              {catHints.map((f, fi) => (
                                <div key={fi} className={`stp_cat_factor_hint stp_factor_${f.status}`}>
                                  <span className="stp_cat_factor_hint_name">{f.factor}</span>
                                  <span className="stp_cat_factor_hint_ded">−{f.deduction}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ──────────────────────────────────────────────────────────────
                  SECTION C — Score Waterfall
              ────────────────────────────────────────────────────────────── */}
              {components.length > 0 && (
                <section className="stp_section">
                  <h3 className="stp_section_title">Score Waterfall</h3>
                  <div className="stp_waterfall">
                    <div className="stp_waterfall_row stp_waterfall_base">
                      <span className="stp_wf_label">Starting Score</span>
                      <div className="stp_wf_bar_wrap">
                        <div className="stp_wf_bar stp_wf_bar_base" style={{ width: "100%" }} />
                      </div>
                      <span className="stp_wf_value stp_wf_value_base">100</span>
                    </div>
                    {components.map((c, idx) => {
                      const pct = Math.abs(Math.round(c.contribution));
                      const isNeg = c.contribution < 0;
                      return (
                        <div key={idx} className={`stp_waterfall_row ${isNeg ? "stp_wf_neg" : "stp_wf_pos"}`}>
                          <span className="stp_wf_label">{c.label.split(" (")[0]}</span>
                          <div className="stp_wf_bar_wrap">
                            <div
                              className={`stp_wf_bar ${isNeg ? "stp_wf_bar_neg" : "stp_wf_bar_pos"}`}
                              style={{ width: `${Math.min(pct, 50)}%` }}
                            />
                          </div>
                          <span className="stp_wf_value">{formatContribution(c.contribution)}</span>
                        </div>
                      );
                    })}
                    <div className="stp_waterfall_row stp_waterfall_final">
                      <span className="stp_wf_label stp_wf_label_final">Final Score</span>
                      <div className="stp_wf_bar_wrap">
                        <div className="stp_wf_bar stp_wf_bar_final" style={{ width: `${trace.finalScore}%` }} />
                      </div>
                      <span className="stp_wf_value stp_wf_value_final">{trace.finalScore}</span>
                    </div>
                  </div>
                </section>
              )}

              {/* ──────────────────────────────────────────────────────────────
                  SECTION D — Score Drivers
              ────────────────────────────────────────────────────────────── */}
              {components.length > 0 && (
                <section className="stp_section">
                  <h3 className="stp_section_title">Score Drivers</h3>
                  <div className="stp_cards_list">
                    {components.map((c, idx) => {
                      const severity = isVts
                        ? vtsComponentSeverity(c, trace.rawSubScores)
                        : c.direction;

                      const evidenceName = sanitizeEvidenceLabel(
                        c.sourceLabel,
                        c.sourceType,
                        assessmentTitle,
                      );
                      const sourceLabel  = SOURCE_TYPE_LABELS[c.sourceType] ?? c.sourceType;
                      const showEvidence = c.sourceType !== "system_default" && evidenceName;

                      const subScoreKey   = CATEGORY_TO_SUBSCORE_KEY[c.category];
                      const categoryScore = subScoreKey ? trace.rawSubScores[subScoreKey] : undefined;

                      return (
                        <div key={idx} className={`stp_card stp_card_${severity}`}>
                          <div className="stp_card_top">
                            <span className={`stp_impact_badge stp_impact_${severity}`}>
                              {formatContribution(c.contribution)}
                            </span>
                            <span className="stp_card_title">{c.label.split(" (")[0]}</span>
                            <div className="stp_card_top_right">
                              {typeof categoryScore === "number" && (
                                <span className={`stp_subscore_chip ${severity === "negative" ? "stp_chip_poor" : severity === "moderate" ? "stp_chip_medium" : "stp_chip_good"}`}>
                                  {Math.round(categoryScore)}/100
                                </span>
                              )}
                              <span className="stp_category_pill">{displayCategoryName(c.category)}</span>
                            </div>
                          </div>
                          <div className="stp_card_body">
                            {(() => {
                              // VTS: show all factors for the component's category (category-level grouping)
                              if (isVts) {
                                const driverFactors = trace.factorExplanations
                                  ? trace.factorExplanations
                                      .filter((f) => f.category === c.category && f.deduction > 0)
                                      .sort((a, b) => b.deduction - a.deduction)
                                  : [];
                                const subKey = CATEGORY_TO_SUBSCORE_KEY[c.category];
                                const catSc = subKey ? trace.rawSubScores[subKey] : undefined;
                                if (driverFactors.length > 0) {
                                  const categoryLoss = driverFactors.reduce((s, f) => s + f.deduction, 0);
                                  const scoreLoss = driverFactors.reduce((s, f) => s + f.scoreImpact, 0);
                                  return (
                                    <div className="stp_driver_factor_block">
                                      <p className="stp_driver_factor_header">
                                        {displayCategoryName(c.category)} score is {catSc !== undefined ? `${Math.round(catSc)}/100` : "—"} because:
                                      </p>
                                      <ul className="stp_driver_factor_list">
                                        {driverFactors.map((f, fi) => (
                                          <li key={fi} className={`stp_driver_factor_item stp_factor_${f.status}`}>
                                            <span className="stp_driver_factor_name">{f.factor}</span>
                                            <span className={`stp_driver_factor_status stp_factor_status_${f.status}`}>{f.status}</span>
                                            <span className="stp_driver_factor_ded">−{f.deduction.toFixed(1)} pts</span>
                                          </li>
                                        ))}
                                      </ul>
                                      <p className="stp_driver_factor_total">
                                        Totals −{categoryLoss.toFixed(1)} on the {displayCategoryName(c.category).toLowerCase()} score,
                                        which removes {scoreLoss.toFixed(1)} points from the trust score.
                                      </p>
                                    </div>
                                  );
                                }
                                return <p className="stp_card_reason_text">{c.reason.split(".")[0]}.</p>;
                              }

                              // IRS: each component IS a factor — enrich with IrsFactorExplanation data
                              const matchedFactor = trace.irsFactorExplanations?.find((f) => f.factor === c.label);
                              return (
                                <div className="stp_irs_factor_detail">
                                  <p className="stp_card_reason_text">{c.reason.split(".")[0]}.</p>
                                  {matchedFactor && (
                                    <div className="stp_irs_factor_meta">
                                      <span className={`stp_irs_factor_status stp_factor_status_${matchedFactor.status}`}>
                                        {matchedFactor.status}
                                      </span>
                                      {matchedFactor.estimatedLift > 0 && (
                                        <span className="stp_irs_factor_lift">
                                          Fix → recover {matchedFactor.estimatedLift.toFixed(1)} pts
                                        </span>
                                      )}
                                      {matchedFactor.improvement !== "No action needed." && (
                                        <p className="stp_irs_factor_improvement">{matchedFactor.improvement}</p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                            <div className="stp_card_fields">
                              {showEvidence && (
                                <div className="stp_card_field">
                                  <span className="stp_field_label">Evidence</span>
                                  <span className="stp_field_value">{evidenceName}</span>
                                </div>
                              )}
                              <div className="stp_card_field">
                                <span className="stp_field_label">Category</span>
                                <span className="stp_field_value">{displayCategoryName(c.category)}</span>
                              </div>
                              <div className="stp_card_field">
                                <span className="stp_field_label">Source</span>
                                <span className="stp_field_value">{sourceLabel}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ──────────────────────────────────────────────────────────────
                  SECTION E — Improvement Plan
                  VTS: factor-level cards or legacy parsed fallback
                  IRS: structured IrsFactorExplanation improvement cards
              ────────────────────────────────────────────────────────────── */}
              {(factorImprovements.length > 0 ||
                improvements.length > 0 ||
                irsFactorImprovements.length > 0 ||
                scsFactorImprovements.length > 0) && (
                <section className="stp_section">
                  <h3 className="stp_section_title stp_section_title_green">
                    <TrendingUp size={13} aria-hidden="true" />
                    Improvement Plan
                  </h3>
                  <p className="stp_improve_disclaimer">
                    {isIrs
                      ? "Estimated risk reduction — not applied until buyer data is updated and scoring reruns."
                      : isScs
                        ? "Estimated readiness lift — not applied until deal inputs are updated and scoring reruns."
                        : "Trust-score points recovered by closing each gap — not applied until evidence is submitted and scoring reruns."}
                  </p>
                  <div className="stp_cards_list">
                    {/* IRS improvement cards — grouped by category */}
                    {isIrs && irsFactorImprovements.length > 0 && (() => {
                      const irsGroups = (["OrgReadiness", "Integration", "VendorRisk"] as const)
                        .filter((cat) => !(cat === "VendorRisk" && isVendorMode))
                        .map((cat) => ({ cat, items: irsFactorImprovements.filter((f) => f.category === cat) }))
                        .filter((g) => g.items.length > 0);
                      return irsGroups.map(({ cat, items }) => (
                        <React.Fragment key={cat}>
                          <div className="stp_improve_group_header">{IRS_CATEGORY_DISPLAY[cat]}</div>
                          {items.map((f, idx) => (
                            <div key={idx} className={`stp_improve_card stp_factor_card stp_factor_${f.status}`}>
                              <div className="stp_improve_card_top">
                                <span className="stp_lift_badge">
                                  {f.status === "missing" ? "Missing" : f.status === "weak" ? "Weak" : "Partial"}
                                  {" · "}+{f.estimatedLift.toFixed(1)} pts potential
                                </span>
                                <span className="stp_improve_title">{f.factor}</span>
                              </div>
                              <div className="stp_improve_card_body">
                                <div className="stp_improve_meta_row">
                                  <span className="stp_field_label">Why it matters</span>
                                  <span className="stp_improve_why">{f.reason}</span>
                                </div>
                                <div className="stp_improve_meta_row">
                                  <span className="stp_field_label">Improvement</span>
                                  <span className="stp_field_value">{f.improvement}</span>
                                </div>
                                <div className="stp_improve_meta_row">
                                  <span className="stp_field_label">Source field</span>
                                  <span className="stp_field_value">{formatEvidenceSourceLabel(f.sourceField)}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </React.Fragment>
                      ));
                    })()}

                    {/* SCS improvement cards — grouped by category */}
                    {isScs && scsFactorImprovements.length > 0 && (() => {
                      const scsGroups = (["CustomerFriction", "Implementation", "Competitive"] as const)
                        .map((cat) => ({
                          cat,
                          items: scsFactorImprovements.filter((f) => f.category === cat),
                        }))
                        .filter((g) => g.items.length > 0);
                      return scsGroups.map(({ cat, items }) => (
                        <React.Fragment key={cat}>
                          <div className="stp_improve_group_header">{SCS_CATEGORY_DISPLAY[cat]}</div>
                          {items.map((f, idx) => (
                            <div key={idx} className={`stp_improve_card stp_factor_card stp_factor_${f.status}`}>
                              <div className="stp_improve_card_top">
                                <span className="stp_lift_badge">
                                  {f.status === "missing" ? "High risk" : f.status === "weak" ? "Elevated" : "Partial"}
                                  {" · "}+{f.estimatedLift.toFixed(1)} pts potential
                                </span>
                                <span className="stp_improve_title">{f.factor}</span>
                              </div>
                              <div className="stp_improve_card_body">
                                <div className="stp_improve_meta_row">
                                  <span className="stp_field_label">Why it matters</span>
                                  <span className="stp_improve_why">{f.reason}</span>
                                </div>
                                <div className="stp_improve_meta_row">
                                  <span className="stp_field_label">Improvement</span>
                                  <span className="stp_field_value">{f.improvement}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </React.Fragment>
                      ));
                    })()}

                    {/* VTS improvement cards — factor-level when available, legacy fallback otherwise */}
                    {isVts && factorImprovements.length > 0
                      ? (() => {
                          const improvementGroups = (["Governance", "Operational", "Product"] as const)
                            .map((cat) => ({ cat, items: factorImprovements.filter((f) => f.category === cat) }))
                            .filter((g) => g.items.length > 0);
                          return improvementGroups.map(({ cat, items }) => (
                            <React.Fragment key={cat}>
                              <div className="stp_improve_group_header">{cat}</div>
                              {items.map((f, idx) => {
                                const statusCls =
                                  f.status === "missing" ? "stp_factor_missing"
                                  : f.status === "weak"  ? "stp_factor_weak"
                                  : f.status === "present" ? "stp_factor_present"
                                  : "stp_factor_strong";
                                return (
                                  <div key={idx} className={`stp_improve_card stp_factor_card ${statusCls}`}>
                                    <div className="stp_improve_card_top">
                                      <span className="stp_lift_badge">
                                        {f.status === "missing" ? "Missing" : f.status === "weak" ? "Weak" : "Partial"}
                                        {" · "}+{f.estimatedLift.toFixed(1)} pts on the trust score
                                      </span>
                                      <span className="stp_improve_title">{f.factor}</span>
                                    </div>
                                    <div className="stp_improve_card_body">
                                      <div className="stp_factor_score_row">
                                        <span className="stp_field_label">Evidence</span>
                                        <span className="stp_factor_pts">{f.awardedPoints} / {f.maxPoints} pts</span>
                                        <div className="stp_factor_bar_track">
                                          <div className="stp_factor_bar_fill" style={{ width: `${(f.awardedPoints / f.maxPoints) * 100}%` }} />
                                        </div>
                                      </div>
                                      {f.vendorAnswer && f.vendorAnswer !== "Not specified" && (
                                        <div className="stp_improve_meta_row">
                                          <span className="stp_field_label">Vendor answer</span>
                                          <span className="stp_field_value">{f.vendorAnswer}</span>
                                        </div>
                                      )}
                                      <div className="stp_improve_meta_row">
                                        <span className="stp_field_label">Why it matters</span>
                                        <span className="stp_improve_why">{f.reason}</span>
                                      </div>
                                      <div className="stp_improve_meta_row">
                                        <span className="stp_field_label">Improvement</span>
                                        <span className="stp_field_value">{f.improvement}</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </React.Fragment>
                          ));
                        })()
                      : isVts && improvements.map((opp, idx) => (
                          <div key={idx} className="stp_improve_card">
                            <div className="stp_improve_card_top">
                              {opp.lift !== null
                                ? <span className="stp_lift_badge">+{opp.lift} pts potential</span>
                                : <span className="stp_lift_badge stp_lift_badge_soft">Potential improvement</span>
                              }
                              <span className="stp_improve_title">{opp.title}</span>
                              <span className="stp_category_pill stp_category_pill_green">{opp.category}</span>
                            </div>
                            <div className="stp_improve_card_body">
                              {opp.whyItHelps && (
                                <div className="stp_improve_meta_row">
                                  <span className="stp_field_label">Why this helps</span>
                                  <span className="stp_improve_why">{opp.whyItHelps}</span>
                                </div>
                              )}
                              {opp.evidenceNeeded && (
                                <div className="stp_improve_meta_row">
                                  <span className="stp_field_label">Evidence needed</span>
                                  <span className="stp_field_value">{opp.evidenceNeeded}</span>
                                </div>
                              )}
                              <div className="stp_improve_meta_row">
                                <span className="stp_field_label">Status</span>
                                <span className="stp_field_value stp_field_missing">Missing Evidence</span>
                              </div>
                            </div>
                          </div>
                        ))
                    }
                  </div>
                </section>
              )}

              {/* ──────────────────────────────────────────────────────────────
                  SECTION I — Full Factor Analysis (internal only)
                  VTS: Shows all factors including internalOnly ones
                  IRS: Shows all IRS factor explanations grouped by category
              ────────────────────────────────────────────────────────────── */}
              {!isVendorMode && isVts && trace.factorExplanations && trace.factorExplanations.length > 0 && (
                <section className="stp_section">
                  <h3 className="stp_section_title">Factor Analysis (Internal)</h3>
                  <div className="stp_factor_table">
                    {(["Governance", "Operational", "Product"] as const).map((cat) => {
                      const catFactors = trace.factorExplanations!.filter((f) => f.category === cat);
                      if (catFactors.length === 0) return null;
                      return (
                        <div key={cat} className="stp_factor_group">
                          <div className="stp_factor_group_header">{cat}</div>
                          {catFactors.map((f, fi) => (
                            <div key={fi} className={`stp_factor_row ${f.deduction === 0 ? "stp_factor_row_ok" : f.status === "missing" ? "stp_factor_row_missing" : "stp_factor_row_partial"}`}>
                              <span className="stp_factor_row_name">{f.factor}{f.internalOnly && <span className="stp_factor_internal_tag"> (internal)</span>}</span>
                              <span className="stp_factor_row_pts">{f.awardedPoints}/{f.maxPoints}</span>
                              <span className={`stp_factor_row_status stp_factor_status_${f.status}`}>{f.status}</span>
                              {f.deduction > 0 && (
                                <span className="stp_factor_row_deduction">
                                  −{f.deduction.toFixed(1)} cat / −{f.scoreImpact.toFixed(1)} VTS
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {!isVendorMode && isIrs && trace.irsFactorExplanations && trace.irsFactorExplanations.length > 0 && (
                <section className="stp_section">
                  <h3 className="stp_section_title">Factor Analysis (Internal)</h3>
                  <div className="stp_factor_table">
                    {(["OrgReadiness", "Integration", "VendorRisk"] as const).map((cat) => {
                      const catFactors = trace.irsFactorExplanations!.filter((f) => f.category === cat);
                      if (catFactors.length === 0) return null;
                      return (
                        <div key={cat} className="stp_factor_group">
                          <div className="stp_factor_group_header">{IRS_CATEGORY_DISPLAY[cat]}</div>
                          {catFactors.map((f, fi) => (
                            <div key={fi} className={`stp_factor_row ${f.deduction === 0 ? "stp_factor_row_ok" : f.status === "missing" ? "stp_factor_row_missing" : "stp_factor_row_partial"}`}>
                              <span className="stp_factor_row_name">
                                {f.factor}{f.internalOnly && <span className="stp_factor_internal_tag"> (internal)</span>}
                              </span>
                              <span className={`stp_factor_row_status stp_factor_status_${f.status}`}>{f.status}</span>
                              {f.deduction > 0 && <span className="stp_factor_row_deduction">−{f.deduction} pts</span>}
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ──────────────────────────────────────────────────────────────
                  SECTION F — Projected Score
              ────────────────────────────────────────────────────────────── */}
              {projectedScore !== null && totalLift > 0 && (
                <section className="stp_section">
                  <h3 className="stp_section_title">
                    {isIrs ? "Projected Score / Risk Reduction" : "Projected Score"}
                  </h3>
                  <div className="stp_projected_block">
                    <div className="stp_projected_row">
                      <div className="stp_projected_item">
                        <span className="stp_projected_label">Current Score</span>
                        <span className={`stp_projected_value stp_projected_current stp_risk_${riskRatingKey(ratingScore)}`}>{headlineScore}</span>
                      </div>
                      <div className="stp_projected_arrow">→</div>
                      <div className="stp_projected_item">
                        <span className="stp_projected_label">{isIrs ? "Potential Reduction" : "Potential Lift"}</span>
                        <span className="stp_projected_value stp_projected_lift">
                          {isIrs ? "−" : "+"}
                          {Math.min(
                            Math.round(totalLift),
                            isIrs ? headlineScore : 100 - headlineScore,
                          )}
                        </span>
                      </div>
                      <div className="stp_projected_arrow">→</div>
                      <div className="stp_projected_item">
                        <span className="stp_projected_label">
                          Projected Score{(!isIrs && projectedScore >= 100) || (isIrs && projectedScore <= 0) ? " (capped)" : ""}
                          {isIrs && ` · ${riskRatingLabel(Math.max(0, Math.min(100, 100 - projectedScore)))}`}
                        </span>
                        <span className="stp_projected_value stp_projected_final">{projectedScore}</span>
                      </div>
                    </div>
                    <div className="stp_projected_bar_track">
                      <div className="stp_projected_bar_current" style={{ width: `${ratingScore}%` }} />
                      <div
                        className="stp_projected_bar_lift"
                        style={{
                          width: `${Math.max(0, Math.min(100, ratingScore + totalLift) - ratingScore)}%`,
                          left: `${ratingScore}%`,
                        }}
                      />
                    </div>
                    <p className="stp_projected_disclaimer">
                      {isIrs
                        ? "Projected implementation risk if identified gaps are remediated. Lower score = lower implementation risk. Actual score may differ after reassessment."
                        : isScs
                          ? "Projected readiness if deal risks are reduced. Higher score = higher readiness. Actual score may differ after rescoring."
                        : "Projected score is an estimate based on missing evidence hints. Actual score may differ after rescoring."}
                    </p>
                  </div>
                </section>
              )}

              {/* Methodology / formula block intentionally omitted — formulas are internal only and must not appear in reports. */}

              {/* ──────────────────────────────────────────────────────────────
                  SECTION H — Scoring Notes (internal warnings, hidden in vendor mode)
              ────────────────────────────────────────────────────────────── */}
              {!isVendorMode && trace.warnings.length > 0 && (
                <section className="stp_section">
                  <h3 className="stp_section_title stp_section_title_muted">
                    <AlertTriangle size={12} aria-hidden="true" />
                    Scoring Notes
                  </h3>
                  <ul className="stp_warning_list">
                    {trace.warnings.map((w, idx) => (
                      <li key={idx} className="stp_warning_item">{w}</li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        {trace && (
          <div className="stp_footer">
            {generatedAt && (
              <>
                <span>Generated: {generatedAt}</span>
                <span className="stp_footer_dot">·</span>
              </>
            )}
            <span>v{trace.scoringVersion}</span>
            <span className="stp_footer_dot">·</span>
            {!isVendorMode && <span className="stp_internal_footer_badge">INTERNAL ONLY</span>}
          </div>
        )}
      </div>
    </div>
  );
}
