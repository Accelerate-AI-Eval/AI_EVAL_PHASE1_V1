/**
 * Internal Score Trace Controller
 *
 * INTERNAL USE ONLY — access gated by requireInternalUser middleware.
 * Must never be exposed to buyer or vendor users.
 *
 * Routes:
 *   GET /api/v1/internal/score-trace/irs/:assessmentId
 *   GET /api/v1/internal/score-trace/vts/:reportId
 */

import type { Request, Response } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { cotsBuyerAssessments } from "../../schema/assessments/cotsBuyerAssessments.js";
import { assessments } from "../../schema/assessments/assessments.js";
import { customerRiskAssessmentReports } from "../../schema/assessments/customerRiskAssessmentReports.js";
import { buildIrsScoreTrace } from "../../services/irsScoreTrace.js";
import { buildIrsFactorExplanations } from "../../services/irsFactorExplanations.js";
import { loadVtsScoreTraceByReportOrAttestationId } from "../../services/loadVtsScoreTrace.js";
import { buildScsScoreTrace } from "../../services/scsScoreTrace.js";
import { findAttestationForBuyerVendorProduct } from "../../services/findAttestationForBuyerVendorProduct.js";
import { scoreCotsBuyerWithPython } from "../../services/pythonScoringClient.js";
import { enrichBuyerCotsScoringPayload } from "../../services/enrichBuyerCotsScoringPayload.js";
import { irsFinalScoreFromParts } from "../../services/buyerImplementationRiskScore.js";
import {
  appendixSalesRiskBreakdown,
  extractOverallRiskScoreFromReport,
} from "../../utils/mergeScoreRationale.js";
import { getActiveLlmModelMeta } from "../../utils/activeLlmModelMeta.js";

function toIsoTimestamp(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "string" && value.trim()) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Stored score time — never wall-clock of the explainability request. */
function resolveScoreCalculatedAt(
  report: Record<string, unknown> | null | undefined,
  ...rowTimes: unknown[]
): string | null {
  if (report != null && typeof report === "object") {
    for (const key of ["irsRescoredAt", "generatedAt", "generated_at"] as const) {
      const iso = toIsoTimestamp(report[key]);
      if (iso) return iso;
    }
  }
  for (const t of rowTimes) {
    const iso = toIsoTimestamp(t);
    if (iso) return iso;
  }
  return null;
}

/** Prefer DB column, then report JSON modelId fields, then active Controls model. */
function resolveStoredLlmModelId(
  columnId: string | null | undefined,
  report: Record<string, unknown> | null | undefined,
): string | null {
  const fromCol = typeof columnId === "string" ? columnId.trim() : "";
  if (fromCol) return fromCol;
  if (report != null && typeof report === "object") {
    for (const key of ["llmModelId", "llm_model_id", "modelId", "model_id"] as const) {
      const v = report[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }
  // Older / CSV reports may never have stamped a model — fall back to Controls selection.
  try {
    const active = getActiveLlmModelMeta().modelId?.trim();
    if (active) return active;
  } catch {
    /* ignore */
  }
  return null;
}

type IrsBreakdown = {
  vendorRisk: number;
  organizationalReadinessGap: number;
  integrationRisk: number;
  vendorTrustScore: number;
  intentMultiplier?: number;
};

function breakdownDrift(a: IrsBreakdown, b: IrsBreakdown): boolean {
  return (
    Math.abs(a.organizationalReadinessGap - b.organizationalReadinessGap) >= 1 ||
    Math.abs(a.integrationRisk - b.integrationRisk) >= 1 ||
    Math.abs(a.vendorRisk - b.vendorRisk) >= 1
  );
}

/**
 * When stored IRS was computed with older formula logic, refresh IRS fields in the
 * report JSON (keep LLM narrative) so score-trace and buyer readiness score match.
 */
async function refreshStaleIrsOnReport(opts: {
  assessmentId: string;
  report: Record<string, unknown>;
  buyerPayload: Record<string, unknown>;
  vendorName: string;
  productName: string;
  storedBreakdown: IrsBreakdown;
  storedScore: number;
}): Promise<{
  report: Record<string, unknown>;
  storedBreakdown: IrsBreakdown;
  storedScore: number;
  usedAttestation: boolean;
  refreshed: boolean;
}> {
  const { assessmentId, buyerPayload, vendorName, productName, storedBreakdown, storedScore } = opts;
  let report = opts.report;

  try {
    const attestation = await findAttestationForBuyerVendorProduct(vendorName, productName);
    const fresh = await scoreCotsBuyerWithPython({
      buyerPayload,
      attestationRow: attestation,
      vendorName,
      productName,
    });
    const intentMultiplier = Number(fresh.breakdown.intentMultiplier ?? 1);
    const parts = irsFinalScoreFromParts(
      Number(fresh.breakdown.vendorRisk ?? 0),
      Number(fresh.breakdown.organizationalReadinessGap ?? 0),
      Number(fresh.breakdown.integrationRisk ?? 0),
      Number.isFinite(intentMultiplier) && intentMultiplier > 0 ? intentMultiplier : 1,
    );
    const freshBreakdown: IrsBreakdown = {
      vendorRisk: parts.vendorRisk,
      organizationalReadinessGap: parts.orgGap,
      integrationRisk: parts.integrationRisk,
      vendorTrustScore: Math.round(Number(fresh.breakdown.vendorTrustScore ?? 50) * 100) / 100,
      intentMultiplier: Number.isFinite(intentMultiplier) ? intentMultiplier : 1,
    };
    const freshScore = parts.score;
    const scoreDrift = Math.abs(freshScore - storedScore) >= 1;
    if (!breakdownDrift(storedBreakdown, freshBreakdown) && !scoreDrift) {
      const riskSource =
        (report.implementationRiskSource as Record<string, unknown> | undefined) ??
        (report.source as Record<string, unknown> | undefined);
      return {
        report,
        storedBreakdown,
        storedScore,
        usedAttestation: Boolean(riskSource?.usedAttestation ?? fresh.source.usedAttestation),
        refreshed: false,
      };
    }

    const rationale = typeof fresh.rationale === "string" ? fresh.rationale.trim() : "";
    report = {
      ...report,
      implementationRiskScore: freshScore,
      implementationReadinessGrade: fresh.grade,
      implementationRiskClassification: fresh.classification,
      implementationRiskDecision: fresh.decision,
      implementationRiskRecommendedAction: fresh.recommendedAction,
      implementationRiskBreakdown: freshBreakdown,
      readinessProfile: fresh.readiness_profile,
      implementationRiskSource: fresh.source,
      scoreRationale: rationale || report.scoreRationale,
      scoreRationaleType: rationale ? "IRS" : report.scoreRationaleType,
      irsScoringVersion: fresh.scoring_version ?? "irs-1.1",
      irsRescoredAt: new Date().toISOString(),
    };

    await db
      .update(cotsBuyerAssessments)
      .set({
        vendor_risk_assessment_report: report,
        score_rationale: rationale || undefined,
        score_rationale_type: rationale ? "IRS" : undefined,
        updated_at: new Date(),
      })
      .where(eq(cotsBuyerAssessments.assessment_id, assessmentId));

    return {
      report,
      storedBreakdown: freshBreakdown,
      storedScore: freshScore,
      usedAttestation: Boolean(fresh.source.usedAttestation),
      refreshed: true,
    };
  } catch (e) {
    console.error("refreshStaleIrsOnReport:", e);
    const riskSource =
      (report.implementationRiskSource as Record<string, unknown> | undefined) ??
      (report.source as Record<string, unknown> | undefined);
    return {
      report,
      storedBreakdown,
      storedScore,
      usedAttestation: Boolean(riskSource?.usedAttestation),
      refreshed: false,
    };
  }
}

// ── IRS Trace ──────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/internal/score-trace/irs/:assessmentId
 *
 * assessmentId = the base assessment UUID (assessments.id).
 * Returns a ScoreTrace for the Buyer Implementation Risk Score.
 * If stored IRS was scored with older formula rules, refreshes IRS fields in-place.
 */
export async function getIrsScoreTrace(req: Request, res: Response): Promise<void> {
  try {
    const assessmentId = typeof req.params?.assessmentId === "string"
      ? req.params.assessmentId.trim()
      : "";

    if (!assessmentId) {
      res.status(400).json({ error: "assessmentId is required" });
      return;
    }

    // Fetch the buyer assessment row
    const [row] = await db
      .select({
        assessment_id:                    cotsBuyerAssessments.assessment_id,
        vendor_name:                      cotsBuyerAssessments.vendor_name,
        specific_product:                 cotsBuyerAssessments.specific_product,
        vendor_risk_assessment_report:    cotsBuyerAssessments.vendor_risk_assessment_report,
        llm_model_id:                     cotsBuyerAssessments.llm_model_id,
        // Scoring input fields (DB column names → camelCase keys for scoring)
        digital_maturity:                 cotsBuyerAssessments.digital_maturity,
        governance_maturity:              cotsBuyerAssessments.governance_maturity,
        ai_governance_board:              cotsBuyerAssessments.ai_governance_board,
        ai_ethics_policy:                 cotsBuyerAssessments.ai_ethics_policy,
        team_composition:                 cotsBuyerAssessments.team_composition,
        risk_appetite:                    cotsBuyerAssessments.risk_appetite,
        critical_of_ai_solution:          cotsBuyerAssessments.critical_of_ai_solution,
        integrate_system:                 cotsBuyerAssessments.integrate_system,
        gap_requirement_product:          cotsBuyerAssessments.gap_requirement_product,
        rollback_capability:              cotsBuyerAssessments.rollback_capability,
        vendor_usage_data:                cotsBuyerAssessments.vendor_usage_data,
        audit_logs:                       cotsBuyerAssessments.audit_logs,
        testing_results:                  cotsBuyerAssessments.testing_results,
        organization_id:                  cotsBuyerAssessments.organization_id,
        current_usage_state:              cotsBuyerAssessments.current_usage_state,
        implementation_capacity:          cotsBuyerAssessments.implementation_capacity,
        human_review_level:               cotsBuyerAssessments.human_review_level,
        decision_stakes:                  cotsBuyerAssessments.statke_at_ai_decisions,
        unavailability_impact:            cotsBuyerAssessments.unavailability_impact,
        data_sensitivity:                 cotsBuyerAssessments.data_sensitivity_level,
        integration_access_levels:        cotsBuyerAssessments.integration_access_levels,
        output_exposure:                  cotsBuyerAssessments.output_exposure,
        training_use_of_data:             cotsBuyerAssessments.training_use_of_data,
        training_use_of_data_stance:      cotsBuyerAssessments.training_use_of_data_stance,
        monitoring_data_stance:           cotsBuyerAssessments.monitoring_data_stance,
        audit_logs_stance:                cotsBuyerAssessments.audit_logs_stance,
        data_export_capability:           cotsBuyerAssessments.data_export_capability,
        deployment_model:                 cotsBuyerAssessments.deployment_model,
        pilot_status:                     cotsBuyerAssessments.pilot_status,
        users_in_scope:                   cotsBuyerAssessments.users_in_scope,
        training_effort:                  cotsBuyerAssessments.training_effort,
        vendor_evidence_received:         cotsBuyerAssessments.vendor_evidence_received,
        contracts_in_place:               cotsBuyerAssessments.contracts_in_place,
        answer_confidence:                cotsBuyerAssessments.answer_confidence,
        use_case_types:                   cotsBuyerAssessments.use_case_types,
        accountable_owner_name:           cotsBuyerAssessments.accountable_owner_name,
        assessment_status:                assessments.status,
        assessment_updated_at:            assessments.updated_at,
        buyer_updated_at:                 cotsBuyerAssessments.updated_at,
        buyer_created_at:                 cotsBuyerAssessments.created_at,
      })
      .from(cotsBuyerAssessments)
      .innerJoin(assessments, eq(cotsBuyerAssessments.assessment_id, assessments.id))
      .where(
        and(
          eq(cotsBuyerAssessments.assessment_id, assessmentId),
          eq(assessments.type, "cots_buyer"),
        ),
      )
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Buyer COTS assessment not found" });
      return;
    }

    const reportRaw = row.vendor_risk_assessment_report as Record<string, unknown> | null;
    if (!reportRaw) {
      res.status(404).json({
        error: "No vendor risk assessment report found for this assessment. Has it been submitted?",
      });
      return;
    }

    // Extract stored IRS values
    let storedScore = Number(reportRaw.implementationRiskScore ?? 0);
    const rawBreakdown = reportRaw.implementationRiskBreakdown as Record<string, unknown> | undefined;

    if (!rawBreakdown) {
      res.status(422).json({
        error: "implementationRiskBreakdown is missing from the stored report — cannot produce trace.",
      });
      return;
    }

    let storedBreakdown: IrsBreakdown = {
      vendorRisk:                  Number(rawBreakdown.vendorRisk                  ?? 0),
      organizationalReadinessGap:  Number(rawBreakdown.organizationalReadinessGap  ?? 0),
      integrationRisk:             Number(rawBreakdown.integrationRisk             ?? 0),
      vendorTrustScore:            Number(rawBreakdown.vendorTrustScore            ?? 50),
      intentMultiplier:            Number(rawBreakdown.intentMultiplier ?? 1) || 1,
    };
    let traceBreakdown = storedBreakdown;
    let scoringDetail =
      asRecord(reportRaw.implementationRiskDetail) ??
      asRecord(reportRaw.irsScoringDetail) ??
      null;
    let traceScoringVersion =
      typeof reportRaw.irsScoringVersion === "string" && reportRaw.irsScoringVersion.trim()
        ? reportRaw.irsScoringVersion.trim()
        : null;

    // Reconstruct the buyer payload with camelCase keys (mirrors buildBuyerContextForReport)
    const buyerPayload = await enrichBuyerCotsScoringPayload(
      {
        digitalMaturityLevel:           row.digital_maturity,
        dataGovernanceMaturity:         row.governance_maturity,
        aiGovernanceBoard:              row.ai_governance_board,
        aiEthicsPolicy:                 row.ai_ethics_policy,
        implementationTeamComposition:  row.team_composition,
        riskAppetite:                   row.risk_appetite,
        criticality:                    row.critical_of_ai_solution,
        integrationSystems:             row.integrate_system,
        requirementGaps:                row.gap_requirement_product,
        rollbackCapability:             row.rollback_capability,
        monitoringDataAvailable:        row.vendor_usage_data,
        auditLogsAvailable:             row.audit_logs,
        testingResultsAvailable:        row.testing_results,
        currentUsageState:              row.current_usage_state,
        implementationCapacity:         row.implementation_capacity,
        humanReviewLevel:               row.human_review_level,
        decisionStakes:                 row.decision_stakes,
        unavailabilityImpact:           row.unavailability_impact,
        dataSensitivity:                row.data_sensitivity,
        integrationAccessLevels:        row.integration_access_levels,
        outputExposure:                 row.output_exposure,
        trainingUseOfData:              row.training_use_of_data,
        trainingUseOfDataStance:        row.training_use_of_data_stance,
        monitoringDataStance:           row.monitoring_data_stance,
        auditLogsStance:                row.audit_logs_stance,
        dataExportCapability:           row.data_export_capability,
        deploymentModel:                row.deployment_model,
        pilotStatus:                    row.pilot_status,
        usersInScope:                   row.users_in_scope,
        trainingEffort:                 row.training_effort,
        vendorEvidenceReceived:         row.vendor_evidence_received,
        contractsInPlace:               row.contracts_in_place,
        answerConfidence:               row.answer_confidence,
        useCaseTypes:                   row.use_case_types,
        accountableOwnerName:           row.accountable_owner_name,
        organizationId:                 row.organization_id,
      },
      row.organization_id,
    );

    const vendorName = String(row.vendor_name ?? "Vendor");
    const productName = String(row.specific_product ?? "Product");

    const riskSource =
      (reportRaw.implementationRiskSource as Record<string, unknown> | undefined) ??
      (reportRaw.source as Record<string, unknown> | undefined);
    let usedAttestation = Boolean(riskSource?.usedAttestation);
    let calculatedAt = resolveScoreCalculatedAt(
      reportRaw,
      row.buyer_updated_at,
      row.buyer_created_at,
      row.assessment_updated_at,
    );

    let usedLiveScoringDetail = false;
    if (!scoringDetail) {
      try {
        const attestation = await findAttestationForBuyerVendorProduct(vendorName, productName);
        const fresh = await scoreCotsBuyerWithPython({
          buyerPayload,
          attestationRow: attestation,
          vendorName,
          productName,
          timeoutMs: 15_000,
        });
        const intentMultiplier = Number(fresh.breakdown.intentMultiplier ?? 1);
        traceBreakdown = {
          vendorRisk: Number(fresh.breakdown.vendorRisk ?? 0),
          organizationalReadinessGap: Number(fresh.breakdown.organizationalReadinessGap ?? 0),
          integrationRisk: Number(fresh.breakdown.integrationRisk ?? 0),
          vendorTrustScore: Number(fresh.breakdown.vendorTrustScore ?? 50),
          intentMultiplier: Number.isFinite(intentMultiplier) ? intentMultiplier : 1,
        };
        usedAttestation = Boolean(fresh.source.usedAttestation);
        scoringDetail = fresh.detail ?? null;
        traceScoringVersion = fresh.scoring_version ?? traceScoringVersion;
        usedLiveScoringDetail = scoringDetail != null;
      } catch (freshErr) {
        console.warn(
          "getIrsScoreTrace: live Python IRS detail unavailable; using legacy trace fallback:",
          freshErr instanceof Error ? freshErr.message : freshErr,
        );
      }
    }

    const probe = buildIrsScoreTrace({
      buyerPayload,
      storedBreakdown: traceBreakdown,
      storedScore,
      usedAttestation,
      vendorName,
      productName,
      generatedAt: calculatedAt,
      scoringDetail,
      scoringVersion: traceScoringVersion,
    });
    if (usedLiveScoringDetail) {
      probe.warnings = [
        "Explainability used live Python irs-2.x scoring detail because the stored report did not include implementationRiskDetail. The saved report was not modified.",
        ...probe.warnings,
      ];
    }

    const irsFactorExplanations = buildIrsFactorExplanations(probe);
    const llmModelId = resolveStoredLlmModelId(row.llm_model_id, reportRaw);

    res.status(200).json({
      success: true,
      data: { ...probe, irsFactorExplanations, irsRefreshed: false, llmModelId },
    });
  } catch (e) {
    console.error("getIrsScoreTrace:", e);
    res.status(500).json({ error: "Failed to generate IRS score trace" });
  }
}

// ── VTS Trace ──────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/internal/score-trace/vts/:reportId
 *
 * reportId = the generated_profile_reports UUID.
 * Returns a ScoreTrace for the Vendor Trust Score.
 */
export async function getVtsScoreTrace(req: Request, res: Response): Promise<void> {
  try {
    const reportId = typeof req.params?.reportId === "string"
      ? req.params.reportId.trim()
      : "";

    if (!reportId) {
      res.status(400).json({ error: "reportId is required" });
      return;
    }

    const loaded = await loadVtsScoreTraceByReportOrAttestationId(reportId);
    if (!loaded) {
      res.status(404).json({
        error: "Score trace unavailable: no stored score breakdown for this vendor assessment. Submit a new attestation to generate one.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: { ...loaded.trace, llmModelId: loaded.llmModelId },
    });
  } catch (e) {
    console.error("getVtsScoreTrace:", e);
    res.status(500).json({ error: "Failed to generate VTS score trace" });
  }
}

// ── SCS Trace (Type 2 — Vendor COTS / Sales Confidence) ───────────────────────

/**
 * GET /api/v1/internal/score-trace/scs/:assessmentId
 *
 * assessmentId = the base assessment UUID (assessments.id).
 * Returns a ScoreTrace for Sales Confidence (= 100 − sales risk).
 */
export async function getScsScoreTrace(req: Request, res: Response): Promise<void> {
  try {
    const assessmentId =
      typeof req.params?.assessmentId === "string" ? req.params.assessmentId.trim() : "";

    if (!assessmentId) {
      res.status(400).json({ error: "assessmentId is required" });
      return;
    }

    const [row] = await db
      .select({
        id: customerRiskAssessmentReports.id,
        report: customerRiskAssessmentReports.report,
        title: customerRiskAssessmentReports.title,
        score_rationale: customerRiskAssessmentReports.score_rationale,
        llm_model_id: customerRiskAssessmentReports.llm_model_id,
        created_at: customerRiskAssessmentReports.created_at,
      })
      .from(customerRiskAssessmentReports)
      .where(eq(customerRiskAssessmentReports.assessment_id, assessmentId))
      .orderBy(desc(customerRiskAssessmentReports.created_at))
      .limit(1);

    if (!row) {
      res.status(404).json({
        error:
          "Score trace unavailable: no stored customer risk report for this Vendor COTS assessment.",
      });
      return;
    }

    const report =
      row.report != null && typeof row.report === "object" && !Array.isArray(row.report)
        ? (row.report as Record<string, unknown>)
        : null;

    if (!report) {
      res.status(404).json({ error: "Stored report is empty — cannot produce SCS score trace." });
      return;
    }

    const breakdown = appendixSalesRiskBreakdown(report);
    const storedSalesRisk =
      extractOverallRiskScoreFromReport(report) ??
      (breakdown != null
        ? Number(breakdown.sales_risk_score ?? breakdown.salesRiskScore)
        : NaN);

    if (!Number.isFinite(storedSalesRisk)) {
      res.status(422).json({
        error: "Sales risk score is missing from the stored report — cannot produce trace.",
      });
      return;
    }

    const dealProbability =
      breakdown != null &&
      Number.isFinite(Number(breakdown.deal_probability_pct ?? breakdown.dealProbabilityPct))
        ? Number(breakdown.deal_probability_pct ?? breakdown.dealProbabilityPct)
        : null;

    const detailRaw =
      (breakdown?.detail != null &&
      typeof breakdown.detail === "object" &&
      !Array.isArray(breakdown.detail)
        ? (breakdown.detail as Record<string, unknown>)
        : null) ??
      (() => {
        const gen = report.generatedAnalysis ?? report.generated_analysis;
        if (gen == null || typeof gen !== "object" || Array.isArray(gen)) return null;
        const full =
          (gen as Record<string, unknown>).fullReport ??
          (gen as Record<string, unknown>).full_report;
        if (full == null || typeof full !== "object" || Array.isArray(full)) return null;
        const appendix = (full as Record<string, unknown>).appendix;
        if (appendix == null || typeof appendix !== "object" || Array.isArray(appendix)) return null;
        const d =
          (appendix as Record<string, unknown>).salesRiskDetail ??
          (appendix as Record<string, unknown>).sales_risk_detail;
        return d != null && typeof d === "object" && !Array.isArray(d)
          ? (d as Record<string, unknown>)
          : null;
      })();

    const trace = buildScsScoreTrace({
      storedSalesRisk: Number(storedSalesRisk),
      dealProbability,
      customerFrictionRisk:
        breakdown != null
          ? Number(breakdown.customer_friction_risk ?? breakdown.customerFrictionRisk)
          : null,
      implementationRisk:
        breakdown != null
          ? Number(breakdown.implementation_risk ?? breakdown.implementationRisk)
          : null,
      competitiveRisk:
        breakdown != null
          ? Number(breakdown.competitive_risk ?? breakdown.competitiveRisk)
          : null,
      assessmentId,
      assessmentTitle: row.title?.trim() || null,
      grade: breakdown != null ? String(breakdown.grade ?? "").trim() || null : null,
      classification:
        breakdown != null ? String(breakdown.classification ?? "").trim() || null : null,
      detail:
        detailRaw != null && typeof detailRaw === "object" && !Array.isArray(detailRaw)
          ? (detailRaw as Record<string, unknown>)
          : null,
      generatedAt: resolveScoreCalculatedAt(report, row.created_at),
    });

    const llmModelId = resolveStoredLlmModelId(row.llm_model_id, report);

    res.status(200).json({ success: true, data: { ...trace, llmModelId } });
  } catch (e) {
    console.error("getScsScoreTrace:", e);
    res.status(500).json({ error: "Failed to generate SCS score trace" });
  }
}

