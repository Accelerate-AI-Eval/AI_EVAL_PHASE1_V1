/**
 * VTS Score Trace — internal operator explainability only.
 *
 * Builds a ScoreTrace from stored generated_profile_reports data.
 *
 * Category contributions come from scoreByCategory / risk columns.
 * Per-factor detail uses stored factorExplanations, or is rebuilt from
 * formula_detail by getVtsScoreTrace when that field was never persisted.
 *
 * This trace operates at the CATEGORY level:
 * - Product risk contribution  = ProductRisk × 0.40
 * - Governance risk contribution = GovernanceRisk × 0.30
 * - Operational risk contribution = OperationalRisk × 0.30
 *
 * Each category's contribution to the final VTS is emitted as a component.
 * Per-factor detail (cert-level, policy-level) comes from stored factorExplanations
 * or is rebuilt from formula_detail by getVtsScoreTrace when missing.
 *
 * INTERNAL USE ONLY — never return this data to buyer or vendor users.
 */

import { SCORING_VERSION } from "../lib/scoringVersion.js";
import type { ScoreTrace, ScoreTraceComponent } from "../types/scoreTrace.js";
import type { FactorExplanation } from "./vtsFactorExplanations.js";

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

export type VtsTraceInput = {
  /** Stored trust_score from generated_profile_reports (integer 0–100). */
  storedTrustScore: number;
  /**
   * Stored scoreByCategory from generated_profile_reports.report.trustScore.
   * Keys are "Product", "Governance", "Operational" (0–100, where higher = better).
   */
  scoreByCategory: Record<string, number> | null;
  /** Report ID for context in warnings. */
  reportId: string;
  /** attestation_id from generated_profile_reports (may be null if not linked). */
  attestationId: string | null;
  /**
   * Factor-level explanations from stored report (or rebuilt from formula_detail).
   */
  factorExplanations?: FactorExplanation[];
  /** When the stored VTS was calculated (profile report created_at). */
  generatedAt?: string | Date | null;
  /**
   * Pillar weights the score was actually calculated with. A pillar with nothing
   * measured is dropped and its weight shared out, so these are not always
   * 0.40 / 0.30 / 0.30.
   */
  pillarWeights?: { product: number; governance: number; operational: number } | null;
};

const DEFAULT_PILLAR_WEIGHTS = { product: 0.4, governance: 0.3, operational: 0.3 };

export function buildVtsScoreTrace(input: VtsTraceInput): ScoreTrace {
  const { storedTrustScore, scoreByCategory, reportId, factorExplanations } = input;
  const weights = input.pillarWeights ?? DEFAULT_PILLAR_WEIGHTS;
  const hasFactorDetail = Array.isArray(factorExplanations) && factorExplanations.length > 0;
  const warnings: string[] = [];
  const missingEvidence: string[] = [];

  const productScore  = typeof scoreByCategory?.["Product"]     === "number" ? scoreByCategory["Product"]     : null;
  const govScore      = typeof scoreByCategory?.["Governance"]  === "number" ? scoreByCategory["Governance"]  : null;
  const opsScore      = typeof scoreByCategory?.["Operational"] === "number" ? scoreByCategory["Operational"] : null;

  const hasCategories = productScore !== null && govScore !== null && opsScore !== null;

  const components: ScoreTraceComponent[] = [];

  if (hasCategories) {
    // Convert category scores (0–100, higher = better) to sub-risks (0–100, higher = worse)
    const productRisk     = Math.max(0, Math.min(100, 100 - productScore!));
    const governanceRisk  = Math.max(0, Math.min(100, 100 - govScore!));
    const operationalRisk = Math.max(0, Math.min(100, 100 - opsScore!));

    // Each sub-risk deducts from the base VTS of 100
    const productContrib    = -(productRisk    * weights.product);
    const governanceContrib = -(governanceRisk * weights.governance);
    const operationalContrib= -(operationalRisk* weights.operational);

    // Reconcile
    const recomputed = round2(Math.max(0, 100 + productContrib + governanceContrib + operationalContrib));
    if (Math.abs(recomputed - storedTrustScore) > 2) {
      warnings.push(
        `Score reconciliation mismatch: category scores (Product=${productScore}, Governance=${govScore}, Operational=${opsScore}) ` +
          `recompute to VTS≈${recomputed}, but stored trust_score is ${storedTrustScore}. ` +
          `Treating stored score as authoritative. This may indicate rounding differences or that ` +
          `the report was generated via the LLM path (not the formula path).`,
      );
    }

    components.push(
      component(
        "Product Risk (Likelihood × Impact × Contextual Multipliers)",
        "Product",
        productContrib,
        `Product score = ${productScore}/100; Product risk = ${productRisk}. Deducts ${round2(productRisk * weights.product)} from base VTS (weight ${Math.round(weights.product * 100)}%).`,
        "vendor_attestation",
        "Vendor attestation profile",
      ),
    );

    components.push(
      component(
        "Governance Risk (Certifications + Policies + Controls + Maturity)",
        "Governance",
        governanceContrib,
        `Governance score = ${govScore}/100; Governance risk = ${governanceRisk}. Deducts ${round2(governanceRisk * weights.governance)} from base VTS (weight ${Math.round(weights.governance * 100)}%). ` +
          `Includes: certifications (SOC 2, ISO 27001, HIPAA, etc.), assessment quality, data retention/incident response policies, operational controls, vendor maturity.`,
        "vendor_attestation",
        "Vendor attestation profile",
      ),
    );

    components.push(
      component(
        "Operational Risk (SLAs + Incident Management + Stability + Support)",
        "Operational",
        operationalContrib,
        `Operational score = ${opsScore}/100; Operational risk = ${operationalRisk}. Deducts ${round2(operationalRisk * weights.operational)} from base VTS (weight ${Math.round(weights.operational * 100)}%). ` +
          `Includes: SLA uptime commitment, incident response maturity, deployment scale, company stability, support tier.`,
        "vendor_attestation",
        "Vendor attestation profile",
      ),
    );

    // Sub-factor hints based on low category scores
    if (govScore !== null && govScore < 50) {
      missingEvidence.push(
        `Governance score is ${govScore}/100 — common causes: missing SOC 2 Type 2 certification (+15 pts), ` +
          `missing ISO 27001 (+10 pts), no incident response plan (+10 pts), no AI ethics policy (+8 pts).`,
      );
    }
    if (opsScore !== null && opsScore < 50) {
      missingEvidence.push(
        `Operational score is ${opsScore}/100 — common causes: low SLA uptime commitment, no 24/7 support tier, ` +
          `early-stage company, limited deployment scale.`,
      );
    }
    if (productScore !== null && productScore < 50) {
      missingEvidence.push(
        `Product score is ${productScore}/100 — reflects high inherent risk from likelihood/impact scores, ` +
          `low mitigation effectiveness, or low confidence factor (e.g., self-reported only, no third-party audit).`,
      );
    }
  } else {
    warnings.push(
      `scoreByCategory (Product/Governance/Operational) is missing from the stored report (report ID: ${reportId}). ` +
        `This may mean the report was generated via the LLM path without formula data, or from an older scoring version. ` +
        `Category-level breakdown is not available.`,
    );
    missingEvidence.push(
      "No scoreByCategory data available — re-generating the profile with formula data would produce a detailed breakdown.",
    );
  }

  return {
    scoreType: "vendor_trust",
    finalScore: storedTrustScore,
    formula: "",
    scoringVersion: SCORING_VERSION,
    rawSubScores: {
      productScore:    productScore    ?? undefined,
      governanceScore: govScore        ?? undefined,
      operationalScore: opsScore       ?? undefined,
    },
    components,
    warnings,
    missingEvidence,
    factorExplanations: hasFactorDetail ? factorExplanations : undefined,
    generatedAt: toIsoTimestamp(input.generatedAt) ?? new Date().toISOString(),
    internalOnly: true,
  };
}
