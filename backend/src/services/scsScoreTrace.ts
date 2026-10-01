/**
 * SCS / Sales Confidence Score Trace — internal operator explainability only.
 *
 * Builds a ScoreTrace from stored customer_risk_assessment_reports sales-risk breakdown.
 *
 * Card UI shows Sales Confidence = 100 − SRS, where:
 *   SRS = (CFR × 0.35) + (IR × 0.35) + (CR × 0.30)
 *
 * Category scores exposed as (higher = better):
 *   Customer Friction score = 100 − CFR
 *   Implementation score    = 100 − IR
 *   Competitive score       = 100 − CR
 *
 * INTERNAL USE ONLY — never return this data to buyer or vendor users.
 */

import { SCORING_VERSION } from "../lib/scoringVersion.js";
import type { ScoreTrace, ScoreTraceComponent } from "../types/scoreTrace.js";
import {
  buildScsFactorExplanations,
  type ScsFactorExplanation,
} from "./scsFactorExplanations.js";

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toIsoTimestamp(value: string | Date | null | undefined): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function component(
  label: string,
  category: string,
  contributionRaw: number,
  reason: string,
  sourceType: ScoreTraceComponent["sourceType"],
  sourceLabel: string,
): ScoreTraceComponent {
  const contribution = round2(contributionRaw);
  return {
    label,
    category,
    contribution,
    direction: contribution > 0 ? "positive" : contribution < 0 ? "negative" : "neutral",
    reason,
    sourceType,
    sourceLabel,
    internalOnly: true,
  };
}

export type ScsTraceInput = {
  /** Stored sales risk score (0–100, higher = harder deal). */
  storedSalesRisk: number;
  /** Optional deal probability / sales confidence (0–100). Defaults to 100 − sales risk. */
  dealProbability?: number | null;
  customerFrictionRisk: number | null;
  implementationRisk: number | null;
  competitiveRisk: number | null;
  assessmentId: string;
  /** Human-readable assessment / product name for evidence labels. */
  assessmentTitle?: string | null;
  grade?: string | null;
  classification?: string | null;
  /** Optional nested formula detail for richer improvement tips. */
  detail?: Record<string, unknown> | null;
  /** When the stored sales-risk score was calculated (report created_at). */
  generatedAt?: string | Date | null;
};

export function buildScsScoreTrace(input: ScsTraceInput): ScoreTrace {
  const {
    storedSalesRisk,
    dealProbability,
    customerFrictionRisk,
    implementationRisk,
    competitiveRisk,
    assessmentId,
    assessmentTitle,
    grade,
    classification,
    detail,
  } = input;

  const evidenceLabel =
    (typeof assessmentTitle === "string" && assessmentTitle.trim()) ||
    "Vendor COTS Assessment";

  const warnings: string[] = [];
  const missingEvidence: string[] = [];

  const cfr = customerFrictionRisk != null && Number.isFinite(customerFrictionRisk)
    ? Math.max(0, Math.min(100, customerFrictionRisk))
    : null;
  const ir = implementationRisk != null && Number.isFinite(implementationRisk)
    ? Math.max(0, Math.min(100, implementationRisk))
    : null;
  const cr = competitiveRisk != null && Number.isFinite(competitiveRisk)
    ? Math.max(0, Math.min(100, competitiveRisk))
    : null;

  const salesConfidence = round2(
    Math.max(
      0,
      Math.min(
        100,
        dealProbability != null && Number.isFinite(dealProbability)
          ? Number(dealProbability)
          : 100 - storedSalesRisk,
      ),
    ),
  );

  const customerFrictionScore = cfr != null ? round2(100 - cfr) : undefined;
  const implementationScore = ir != null ? round2(100 - ir) : undefined;
  const competitiveScore = cr != null ? round2(100 - cr) : undefined;

  const components: ScoreTraceComponent[] = [];
  const hasCategories = cfr != null && ir != null && cr != null;

  if (hasCategories) {
    const cfrContrib = -(cfr! * 0.35);
    const irContrib = -(ir! * 0.35);
    const crContrib = -(cr! * 0.3);

    const recomputedRisk = round2(Math.max(0, Math.min(100, cfr! * 0.35 + ir! * 0.35 + cr! * 0.3)));
    if (Math.abs(recomputedRisk - storedSalesRisk) > 2) {
      warnings.push(
        `Score reconciliation mismatch: category risks (CFR=${cfr}, IR=${ir}, CR=${cr}) ` +
          `recompute to SRS≈${recomputedRisk}, but stored sales risk is ${storedSalesRisk}. ` +
          `Treating stored score as authoritative.`,
      );
    }

    components.push(
      component(
        "Customer Friction Risk (Regulatory + Data Sensitivity + Risk Tolerance)",
        "CustomerFriction",
        cfrContrib,
        `Customer friction risk = ${cfr}/100; confidence = ${customerFrictionScore}/100. ` +
          `Deducts ${round2(cfr! * 0.35)} from base sales confidence (weight 35%).`,
        "assessment_answer",
        evidenceLabel,
      ),
    );
    components.push(
      component(
        "Implementation Risk (Integration + Customization + Timeline + Mitigations)",
        "Implementation",
        irContrib,
        `Implementation risk = ${ir}/100; confidence = ${implementationScore}/100. ` +
          `Deducts ${round2(ir! * 0.35)} from base sales confidence (weight 35%).`,
        "assessment_answer",
        evidenceLabel,
      ),
    );
    components.push(
      component(
        "Competitive Risk (Alternatives + Budget + Differentiation)",
        "Competitive",
        crContrib,
        `Competitive risk = ${cr}/100; confidence = ${competitiveScore}/100. ` +
          `Deducts ${round2(cr! * 0.3)} from base sales confidence (weight 30%).`,
        "assessment_answer",
        evidenceLabel,
      ),
    );

    if (cfr! >= 50) {
      missingEvidence.push(
        `Customer friction risk is ${cfr}/100 — strengthen compliance documentation, ` +
          `clarify data sensitivity handling, and align to customer risk tolerance.`,
      );
    }
    if (ir! >= 50) {
      missingEvidence.push(
        `Implementation risk is ${ir}/100 — simplify integrations, reduce customization, ` +
          `and add concrete risk mitigations for customer concerns.`,
      );
    }
    if (cr! >= 50) {
      missingEvidence.push(
        `Competitive risk is ${cr}/100 — sharpen differentiation vs alternatives ` +
          `and right-size packaging for the customer budget.`,
      );
    }
  } else {
    warnings.push(
      `Sales-risk category breakdown (CFR / IR / CR) is incomplete for assessment ${assessmentId}. ` +
        `Category-level explainability is limited until the assessment is re-scored.`,
    );
    missingEvidence.push(
      "No complete sales-risk category breakdown available — re-submit the Vendor COTS assessment to refresh scoring detail.",
    );
  }

  if (grade || classification) {
    warnings.push(
      `Grade/classification from formula: ${[grade, classification].filter(Boolean).join(" — ")}.`,
    );
  }

  const scsFactorExplanations: ScsFactorExplanation[] = buildScsFactorExplanations({
    customerFrictionRisk: cfr,
    implementationRisk: ir,
    competitiveRisk: cr,
    detail: detail ?? null,
  });

  return {
    scoreType: "sales_confidence",
    finalScore: salesConfidence,
    formula: "",
    scoringVersion: SCORING_VERSION,
    rawSubScores: {
      customerFrictionScore,
      implementationScore,
      competitiveScore,
      salesRiskScore: round2(storedSalesRisk),
    },
    components,
    warnings,
    missingEvidence,
    scsFactorExplanations: scsFactorExplanations.length > 0 ? scsFactorExplanations : undefined,
    generatedAt: toIsoTimestamp(input.generatedAt) ?? new Date().toISOString(),
    internalOnly: true,
  };
}
