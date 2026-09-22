/**
 * VTS Factor Explanations
 *
 * Wraps the factor ledger emitted by the Python scoring service with buyer- and
 * vendor-facing copy.
 *
 * IMPORTANT:
 * - Does NOT change any scoring math — reads formula output only.
 * - `deduction` is the number of VTS points the gap actually costs, so the
 *   factors under a category sum to that category's deduction from the score.
 *   `maxPoints` / `awardedPoints` remain the underlying evidence points.
 * - internalOnly: false → safe to return to vendors.
 * - internalOnly: true  → internal operators only.
 */

export interface FactorExplanation {
  category: "Product" | "Governance" | "Operational";
  group: string;
  factor: string;
  status: "present" | "missing" | "weak" | "strong";
  /** Evidence points this line item can award. */
  maxPoints: number;
  /** Evidence points awarded. */
  awardedPoints: number;
  /** Points off the category score. Sums to (100 − category score). */
  deduction: number;
  /** VTS points this gap costs. Sums to the category's deduction from the score. */
  scoreImpact: number;
  vendorAnswer: string;
  reason: string;
  improvement: string;
  /** VTS points recovered by closing the gap — same scale as `deduction`. */
  estimatedLift: number;
  evidenceSource: "Vendor Attestation";
  internalOnly: boolean;
}

/** One line item as emitted by scoring_service._build_factor_ledger. */
interface LedgerRow {
  category: string;
  group?: string;
  group_label?: string;
  key: string;
  label: string;
  earned: number;
  attainable: number;
  weight: number;
  category_impact: number;
  score_impact: number;
}

export interface VtsFormulaResult {
  vendor_trust_score: number;
  product_risk: number;
  governance_risk: number;
  operational_risk: number;
  detail: {
    factor_ledger?: unknown;
    product_risk?: {
      confidence_factor?: { value: number };
      mitigation_effectiveness?: { value: number };
    };
  };
}

// ─── Copy ─────────────────────────────────────────────────────────────────────

type Copy = {
  /** Explains where the line item currently stands. */
  reason: (earned: number, max: number) => string;
  /** What the vendor does to close the gap. */
  improvement: string;
  /** Attestation field to echo back as the vendor's own answer. */
  answerField?: string;
  internalOnly?: boolean;
};

const full = (s: string) => (earned: number, max: number) =>
  earned >= max ? `${s} — full credit.` : s;

const COPY: Record<string, Copy> = {
  assessment_method: {
    reason: (e) =>
      e >= 20 ? "Independent third-party audit in place — full credit."
      : e >= 10 ? "Internal or third-party review used; an independent audit scores higher."
      : e > 0 ? "Self-assessment only — external validation scores significantly higher."
      : "No formal security assessment method reported.",
    improvement: "Engage an independent third-party auditor for your security assessment.",
    answerField: "assessmentMethod",
  },
  audit_frequency: {
    reason: full("Audits run on a regular cadence"),
    improvement: "Move to an annual audit cadence.",
    answerField: "auditFrequency",
  },
  data_retention: {
    reason: (e) =>
      e >= 12 ? "Data retention policy documented and enforced — full credit."
      : e > 0 ? "Policy exists but is not consistently enforced."
      : "No data retention policy detected.",
    improvement: "Document a data retention policy with retention periods and deletion procedures, and enforce it.",
  },
  incident_response: {
    reason: (e) =>
      e >= 15 ? "Incident response plan documented and regularly tested — full credit."
      : e >= 10 ? "Plan documented but not yet tested."
      : e > 0 ? "Basic runbook only — limited maturity."
      : "No incident response plan detected.",
    improvement: "Document a full incident response plan and exercise it annually.",
  },
  privacy_policy: {
    reason: (e) =>
      e >= 10 ? "Comprehensive privacy policy covering GDPR/CCPA — full credit."
      : e > 0 ? "Privacy policy in place but not comprehensive."
      : "No privacy policy detected.",
    improvement: "Expand the privacy policy to cover GDPR and CCPA comprehensively.",
  },
  ai_ethics: {
    reason: (e) =>
      e >= 8 ? "Board-approved AI ethics policy, operationalized — full credit."
      : e > 0 ? "AI ethics policy exists but is not fully operationalized."
      : "No AI ethics policy detected.",
    improvement: "Develop an AI ethics policy covering fairness, transparency and accountability, and get board approval.",
  },
  human_oversight: {
    reason: (e) =>
      e >= 12 ? "Human always in the loop for AI decisions — full credit."
      : e > 0 ? "Human oversight exists but is not always in the loop."
      : "No human oversight capability reported.",
    improvement: "Implement human-in-the-loop review for high-stakes AI decisions.",
    answerField: "humanOversightCapabilities",
  },
  continuous_monitoring: {
    reason: (e) =>
      e >= 10 ? "Real-time monitoring and alerting — full credit."
      : e > 0 ? "Monitoring in place, but not real-time."
      : "No continuous monitoring reported.",
    improvement: "Implement real-time monitoring and alerting for model performance and anomalies.",
    answerField: "continuousMonitoring",
  },
  model_version_control: {
    reason: (e) =>
      e >= 8 ? "Automated MLOps pipeline for versioning — full credit."
      : e > 0 ? "Model versioning exists but is manual or basic."
      : "No model version control reported.",
    improvement: "Adopt an automated MLOps pipeline for model versioning and deployment tracking.",
  },
  funding_stability: {
    reason: (e) => (e > 0 ? "Funding position contributes to maturity." : "Funding position not reported or early-stage."),
    improvement: "Maturity improves with stable funding and a growing enterprise customer base.",
    answerField: "fundingStatus",
    internalOnly: true,
  },
  financial_position: {
    reason: (e) => (e > 0 ? "Financial position contributes to maturity." : "Financial position not reported."),
    improvement: "Report a profitable or well-funded financial position.",
    answerField: "financialStatus",
    internalOnly: true,
  },
  encryption_at_rest: {
    reason: (e) =>
      e >= 10 ? "Customer-managed keys at rest — full credit."
      : e > 0 ? "Encryption at rest present but not at the strongest level."
      : "No encryption-at-rest control disclosed.",
    improvement: "Move to AES-256 with customer-managed keys and attach evidence.",
    answerField: "encryptionAtRest",
  },
  tls_in_transit: {
    reason: (e) => (e >= 8 ? "TLS 1.3 in transit — full credit." : e > 0 ? "TLS enforced; TLS 1.3 scores highest." : "No TLS version disclosed."),
    improvement: "Enforce TLS 1.3 in transit.",
    answerField: "tlsInTransit",
  },
  data_subject_rights: {
    reason: (e) => (e > 0 ? "Some data-subject rights disclosed." : "No data-subject rights disclosed."),
    improvement: "Document the rights you support and whether you act as processor, controller, or both.",
  },
  sub_processors: {
    reason: (e) =>
      e >= 8 ? "Sub-processors named with purpose and region — full credit."
      : e > 0 ? "Sub-processors listed; adding purpose and region for each scores higher."
      : "No sub-processors listed.",
    improvement: "Publish a sub-processor list with name, purpose and region.",
  },
  vdp: {
    reason: (e) =>
      e >= 6 ? "Published vulnerability disclosure policy with URL — full credit."
      : e > 0 ? "A VDP exists; publishing a URL scores higher."
      : "No vulnerability disclosure policy published.",
    improvement: "Publish a VDP with a public URL and an acknowledgement SLA.",
  },
  bug_bounty: {
    reason: (e) =>
      e >= 4 ? "Public bug bounty with URL — full credit."
      : e > 0 ? "A bug bounty exists; a public program with URL scores higher."
      : "No bug bounty program disclosed.",
    improvement: "Run a public bug bounty and publish the program URL.",
  },
  dpa: {
    reason: (e) => (e >= 4 ? "DPA publicly available — full credit." : e > 0 ? "DPA available on request." : "No DPA disclosed."),
    improvement: "Make a Data Processing Agreement publicly available.",
    answerField: "dpaAvailable",
  },
  sla_uptime: {
    reason: (e) =>
      e >= 25 ? "99.99%+ uptime SLA — full credit."
      : e >= 15 ? "Uptime SLA committed; a higher availability target scores better."
      : e > 0 ? "Low uptime SLA."
      : "No uptime SLA provided.",
    improvement: "Publish a higher uptime SLA backed by infrastructure redundancy.",
    answerField: "slaUptime",
  },
  incident_response_sla: {
    reason: (e) => (e >= 8 ? "Critical incident response under 15 minutes — full credit." : e > 0 ? "Response SLA committed but not best-in-class." : "No incident response SLA provided."),
    improvement: "Commit to a critical incident response SLA under 1 hour.",
    answerField: "criticalIncidentResponse",
  },
  incident_resolution_sla: {
    reason: (e) => (e >= 7 ? "Critical resolution within 4 hours — full credit." : e > 0 ? "Resolution SLA committed but slow." : "No incident resolution SLA provided."),
    improvement: "Commit to a critical incident resolution SLA under 24 hours.",
    answerField: "criticalIncidentResolution",
  },
  incident_plan_testing: {
    reason: (e) =>
      e >= 12 ? "Incident plan tested quarterly — full credit."
      : e > 0 ? "Plan is tested, but not quarterly."
      : "No incident response plan testing reported.",
    improvement: "Test the incident response plan quarterly.",
  },
  incident_automation: {
    reason: (e) =>
      e >= 10 ? "Fully automated incident response — full credit."
      : e > 0 ? "Incident response is partly manual."
      : "No incident response automation reported.",
    improvement: "Implement automated incident detection and response tooling.",
    answerField: "rollbackProcedures",
  },
  incident_communication: {
    reason: (e) =>
      e >= 8 ? "Proactive status page with real-time updates — full credit."
      : e > 0 ? "Customer communication exists but is not proactive."
      : "No customer incident communication process reported.",
    improvement: "Publish a status page with proactive incident notifications.",
    answerField: "incidentCommunication",
  },
  deployment_scale: {
    reason: (e) =>
      e >= 12 ? "Enterprise multi-tenant deployment at scale — full credit."
      : e > 0 ? "Deployment scale below enterprise multi-tenant."
      : "Deployment scale not reported.",
    improvement: "Demonstrate enterprise-scale multi-tenant deployments.",
    answerField: "deploymentScale",
  },
  multi_tenancy: {
    reason: (e) =>
      e >= 8 ? "Full customer instance isolation — full credit."
      : e > 0 ? "Tenant isolation in place but not full instance isolation."
      : "Multi-tenancy not supported or isolation method not specified.",
    improvement: "Implement full instance isolation between customers.",
  },
  company_age: {
    reason: (e, m) => (e >= m ? "Long operating history — full credit." : e > 0 ? "Operating history still building." : "Company age not provided."),
    improvement: "Continue building operating history.",
  },
  financial_health: {
    reason: (e) =>
      e >= 10 ? "Profitable for 3+ years — full credit."
      : e > 0 ? "Adequate financial stability, short of sustained profitability."
      : "Financial health not reported.",
    improvement: "Demonstrate profitability or a multi-year funding runway.",
    answerField: "financialStatus",
  },
  customer_retention: {
    reason: (e) =>
      e >= 8 ? "Retention at 95%+ — full credit."
      : e > 0 ? "Retention reported below 95%."
      : "Customer retention rate not reported.",
    improvement: "Report your customer retention rate; 95%+ earns full credit.",
  },
  incident_history: {
    reason: (e, m) => (e >= m ? "Disclosed incidents were low severity or resolved." : "Disclosed incidents include unresolved or high-severity events."),
    improvement: "Resolve and document outstanding security incidents.",
  },
  support_tier: {
    reason: (e) =>
      e >= 10 ? "24/7 support via phone, chat and email — full credit."
      : e > 0 ? "Support available but not 24/7 across all channels."
      : "Support tier not specified.",
    improvement: "Offer 24/7 support across phone, chat and email for enterprise clients.",
    answerField: "supportTiers",
  },
  technical_account_management: {
    reason: (e) =>
      e >= 5 ? "Dedicated Technical Account Manager — full credit."
      : e > 0 ? "Shared or standard account management only."
      : "Technical account management not specified.",
    improvement: "Offer a dedicated Technical Account Manager for enterprise accounts.",
    answerField: "technicalAccountManager",
  },
  healthcare_workflows: {
    reason: (e) => (e > 0 ? "HIPAA-compliant workflow support confirmed." : "No HIPAA workflow support reported for a healthcare-facing product."),
    improvement: "Document HIPAA-compliant workflow support and attach the BAA.",
  },
};

const CERT_COPY = (framework: string): Copy => ({
  reason: (e, m) =>
    e >= m ? `${framework} verified — full credit.`
    : e > 0 ? `${framework} claimed but not evidenced at the highest tier.`
    : `No ${framework} evidence detected, and this framework is relevant to the buyer's industry.`,
  improvement: `Obtain ${framework} and upload the certificate or audit report.`,
});

function copyFor(row: LedgerRow): Copy {
  if (row.key.startsWith("cert::")) return CERT_COPY(row.label);
  return (
    COPY[row.key] ?? {
      reason: (e, m) => (e >= m ? `${row.label} — full credit.` : `${row.label} is not fully evidenced.`),
      improvement: `Provide evidence for ${row.label}.`,
    }
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Keep two decimals so category totals reconcile; the UI rounds for display. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function statusFor(earned: number, max: number): FactorExplanation["status"] {
  if (earned <= 0) return "missing";
  if (earned >= max) return "strong";
  return earned >= max * 0.6 ? "present" : "weak";
}

function isLedgerRow(value: unknown): value is LedgerRow {
  if (value == null || typeof value !== "object") return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.key === "string" &&
    typeof r.label === "string" &&
    typeof r.category === "string" &&
    Number.isFinite(Number(r.earned)) &&
    Number.isFinite(Number(r.attainable)) &&
    Number.isFinite(Number(r.category_impact)) &&
    Number.isFinite(Number(r.score_impact))
  );
}

function readLedger(detail: unknown): LedgerRow[] {
  if (detail == null || typeof detail !== "object") return [];
  const raw = (detail as Record<string, unknown>).factor_ledger;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isLedgerRow).map((r) => ({
    ...r,
    earned: Number(r.earned),
    attainable: Number(r.attainable),
    category_impact: Number(r.category_impact),
    score_impact: Number(r.score_impact),
    weight: Number(r.weight),
  }));
}

function strGet(input: Record<string, unknown>, key: string | undefined): string {
  if (!key) return "";
  return String(input[key] ?? "").trim();
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function buildFactorExplanations(
  formula: VtsFormulaResult,
  input: Record<string, unknown>,
): FactorExplanation[] {
  const ledger = readLedger(formula.detail);
  if (ledger.length === 0) return [];

  const meVal = Number(formula.detail?.product_risk?.mitigation_effectiveness?.value ?? 0);
  const cfVal = Number(formula.detail?.product_risk?.confidence_factor?.value ?? 0);

  return ledger.map((row) => {
    const category = row.category as FactorExplanation["category"];

    if (row.key === "product_risk") {
      const productScore = Math.round(row.earned);
      return {
        category: "Product",
        group: row.group ?? "product_risk",
        factor: "AI Product Risk Profile (Internal)",
        status: statusFor(row.earned, row.attainable),
        maxPoints: row.attainable,
        awardedPoints: productScore,
        deduction: round2(row.category_impact),
        scoreImpact: round2(row.score_impact),
        vendorAnswer: `Product risk ${formula.product_risk.toFixed(2)} risk units`,
        reason:
          `Product score = ${productScore}/100 (= 100 − ${formula.product_risk.toFixed(2)} product risk), ` +
          `calculated as Inherent Risk × (1 − Mitigation Effectiveness) × Confidence Factor. ` +
          `Mitigation Effectiveness = ${(meVal * 100).toFixed(1)}%. Confidence Factor = ${cfVal.toFixed(3)}.`,
        improvement:
          "Improve mitigation controls, provide stronger evidence, and reduce AI deployment scope or criticality.",
        estimatedLift: round2(row.score_impact),
        evidenceSource: "Vendor Attestation",
        internalOnly: true,
      };
    }

    const copy = copyFor(row);
    const answer = strGet(input, copy.answerField);
    return {
      category,
      group: row.group ?? "",
      factor: row.label,
      status: statusFor(row.earned, row.attainable),
      maxPoints: row.attainable,
      awardedPoints: row.earned,
      deduction: round2(row.category_impact),
      scoreImpact: round2(row.score_impact),
      vendorAnswer: answer || (row.earned > 0 ? `${row.earned}/${row.attainable} pts` : "Not specified"),
      reason: copy.reason(row.earned, row.attainable),
      improvement: row.earned >= row.attainable ? "No action needed." : copy.improvement,
      estimatedLift: round2(row.score_impact),
      evidenceSource: "Vendor Attestation",
      internalOnly: copy.internalOnly === true,
    };
  });
}

/**
 * Rebuild factor explanations from stored formula_detail (or scoringResult.detail).
 * Used when report.trustScore.factorExplanations was never persisted (older reports,
 * CSV import path, or buildFactorExplanations failed at generation time).
 *
 * Reports scored before the ledger existed have no factor_ledger to read, so they
 * yield no explanations rather than a reconstruction that would not reconcile.
 */
export function rebuildFactorExplanationsFromStoredDetail(opts: {
  storedTrustScore: number;
  productRisk: number | null;
  governanceRisk: number | null;
  operationalRisk: number | null;
  formulaDetail: unknown;
  formulaInput?: Record<string, unknown>;
}): FactorExplanation[] {
  const detail =
    opts.formulaDetail != null &&
    typeof opts.formulaDetail === "object" &&
    !Array.isArray(opts.formulaDetail)
      ? (opts.formulaDetail as VtsFormulaResult["detail"])
      : null;
  if (!detail) return [];

  try {
    return buildFactorExplanations(
      {
        vendor_trust_score: opts.storedTrustScore,
        product_risk: opts.productRisk ?? 0,
        governance_risk: opts.governanceRisk ?? 0,
        operational_risk: opts.operationalRisk ?? 0,
        detail,
      },
      opts.formulaInput ?? {},
    );
  } catch {
    return [];
  }
}
