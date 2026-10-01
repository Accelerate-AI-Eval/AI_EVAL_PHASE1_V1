import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { usersTable, generatedProfileReports, vendorSelfAttestations } from "../../schema/schema.js";
import { generateVendorAttestationReport, buildReportPayloadAndSummary } from "../agents/vendorAttestation.js";
import { stampActiveLlmModel, getActiveLlmModelMeta } from "../../utils/activeLlmModelMeta.js";
import {
  assertFeatureTokenQuota,
  sendIfTokenQuotaExceeded,
} from "../../services/admin/featureTokenQuota.service.js";

/**
 * POST /vendorSelfAttestation/generate-profile
 * Body: { vendorData: string, formData: object, attestationId?: string }
 * VTS is calculated by Python; Node stores trust_score + report in generated_profile_reports.
 */
const generateProductProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const vendorData = typeof req.body?.vendorData === "string" ? req.body.vendorData : "";
    if (!vendorData.trim()) {
      res.status(400).json({
        success: false,
        message: "vendorData is required and must be a non-empty string",
      });
      return;
    }

    const formulaPayload =
      req.body?.formData && typeof req.body.formData === "object"
        ? (req.body.formData as Record<string, unknown>)
        : null;
    if (!formulaPayload) {
      res.status(400).json({
        success: false,
        message: "formData is required; Vendor Trust Score is calculated by the Python scoring service",
      });
      return;
    }

    const payload = req.user as { id?: number; userId?: string | number; email?: string } | undefined;
    let rawId = payload?.id ?? payload?.userId;
    let userId = rawId != null ? Number(rawId) : NaN;

    if ((!Number.isInteger(userId) || userId < 1) && payload?.email) {
      const email = String(payload.email).trim();
      if (email) {
        const users = await db
          .select({ id: usersTable.id })
          .from(usersTable)
          .where(eq(usersTable.email, email))
          .limit(1);
        if (users[0]) userId = users[0].id;
      }
    }

    if (!Number.isInteger(userId) || userId < 1) {
      res.status(401).json({
        success: false,
        message: "User not authenticated or invalid user identifier",
      });
      return;
    }

    const [userRow] = await db
      .select({ organization_id: usersTable.organization_id })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const organizationIdStr = userRow?.organization_id != null ? String(userRow.organization_id) : null;

    const attestationIdRaw = req.body?.attestationId ?? req.body?.attestation_id;
    const attestationId =
      typeof attestationIdRaw === "string" && attestationIdRaw.trim() ? attestationIdRaw.trim() : null;

    let scoringPayload: Record<string, unknown> = { ...formulaPayload };
    if (attestationId) {
      const [attest] = await db
        .select({ assessment_id: vendorSelfAttestations.assessment_id })
        .from(vendorSelfAttestations)
        .where(eq(vendorSelfAttestations.id, attestationId))
        .limit(1);
      const linked = attest?.assessment_id ? String(attest.assessment_id) : "";
      if (linked) {
        scoringPayload = { ...scoringPayload, assessment_id: linked, assessmentId: linked };
      }
    }

    await assertFeatureTokenQuota("attestation");

    // Python calculates VTS; Node persists trust_score + report
    const report = await generateVendorAttestationReport(vendorData, scoringPayload);
    const built = buildReportPayloadAndSummary(report);
    const reportPayload = stampActiveLlmModel(
      built.reportPayload as unknown as Record<string, unknown>,
    );
    const llmMeta = getActiveLlmModelMeta();
    const { trustScoreNum, summaryToStore } = built;

    const summaryForDb = summaryToStore && summaryToStore.length > 0 ? summaryToStore : null;

    const trustScoreForDb = Number.isFinite(trustScoreNum)
      ? Math.min(100, Math.max(0, Math.round((trustScoreNum + Number.EPSILON) * 100) / 100))
      : 0;
    const scoring = report.scoringResult;
    const gradeForDb = scoring?.grade?.trim() || String(report.trustScore?.grade ?? "").trim() || null;
    const scoreRationaleForDb =
      typeof reportPayload.scoreRationale === "string" && reportPayload.scoreRationale.trim()
        ? reportPayload.scoreRationale.trim()
        : typeof scoring?.rationale === "string" && scoring.rationale.trim()
          ? scoring.rationale.trim()
          : null;

    const [inserted] = await db
      .insert(generatedProfileReports)
      .values({
        user_id: userId,
        organization_id: organizationIdStr,
        attestation_id: attestationId ?? undefined,
        trust_score: trustScoreForDb,
        summary: summaryForDb,
        report: reportPayload,
        product_risk: scoring?.product_risk,
        governance_risk: scoring?.governance_risk,
        operational_risk: scoring?.operational_risk,
        weighted_risk: scoring?.weighted_risk,
        grade: gradeForDb ?? undefined,
        classification: scoring?.classification || undefined,
        formula_detail: scoring?.detail ?? undefined,
        scoring_version: scoring?.scoring_version || undefined,
        score_rationale: scoreRationaleForDb ?? undefined,
        score_rationale_type: scoreRationaleForDb ? "VTS" : undefined,
        llm_model_id: llmMeta.modelId,
        llm_model_label: llmMeta.modelLabel,
      })
      .returning({ id: generatedProfileReports.id });

    if (attestationId && inserted?.id) {
      await db
        .update(vendorSelfAttestations)
        .set({
          generated_profile_report: reportPayload,
          latest_trust_score: trustScoreForDb,
          latest_trust_grade: gradeForDb ?? undefined,
          latest_profile_report_id: inserted.id,
          llm_model_id: llmMeta.modelId,
          llm_model_label: llmMeta.modelLabel,
          updated_at: new Date(),
        })
        .where(eq(vendorSelfAttestations.id, attestationId));
    }

    res.status(200).json({
      success: true,
      data: {
        trustScore: reportPayload.trustScore,
        sections: report.sections,
        modelId: llmMeta.modelId,
        modelLabel: llmMeta.modelLabel,
      },
    });
  } catch (error) {
    if (sendIfTokenQuotaExceeded(res, error)) return;
    console.error("generateProductProfile error:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to generate product profile",
    });
  }
};

export default generateProductProfile;
