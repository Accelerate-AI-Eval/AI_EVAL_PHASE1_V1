import type { Request, Response } from "express";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { assessments } from "../../schema/assessments/assessments.js";
import { cotsBuyerAssessments } from "../../schema/assessments/cotsBuyerAssessments.js";
import { eq, and } from "drizzle-orm";
import { findAttestationForBuyerAssessment } from "../../services/findAttestationForBuyerVendorProduct.js";
import { resolveFrameworkMappingRowsForAttestation } from "../../services/frameworkMappingFromCompliance.js";
import { generateBuyerVendorRiskReport } from "../agents/buyerVendorRiskReportAgent.js";
import { stampActiveLlmModel, getActiveLlmModelMeta } from "../../utils/activeLlmModelMeta.js";
import {
  assertFeatureTokenQuota,
  isTokenQuotaExceededError,
  sendIfTokenQuotaExceeded,
} from "../../services/admin/featureTokenQuota.service.js";
import { buildPayloadCots } from "../../services/cotsBuyerPayload.js";
import { enrichBuyerCotsScoringPayload } from "../../services/enrichBuyerCotsScoringPayload.js";
import {
  getRequestActor,
  runWithRequestActor,
} from "../../utils/requestActorContext.js";

function readBuyerAttestationIdFromBody(body: Record<string, unknown>): string | null {
  const keys = [
    "vendorAttestationId",
    "vendor_attestation_id",
    "attestationId",
    "attestation_id",
    "selectedProductId",
    "selected_product_id",
    "productAttestationId",
    "product_attestation_id",
  ];
  for (const k of keys) {
    const v = body[k];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return null;
}

function buildBuyerContextForReport(body: Record<string, unknown>): Record<string, unknown> {
  const g = (k: string) => body[k];
  return {
    organizationName: g("organizationName"),
    industrySector: g("industrySector"),
    employeeCount: g("employeeCount"),
    operatingRegions: g("operatingRegions"),
    businessPainPoint: g("businessPainPoint"),
    expectedOutcomes: g("expectedOutcomes"),
    owningDepartment: g("owningDepartment"),
    budgetRange: g("budgetRange"),
    targetTimeline: g("targetTimeline"),
    criticality: g("criticality"),
    vendorName: g("vendorName"),
    productName: g("productName"),
    requirementGaps: g("requirementGaps"),
    integrationSystems: g("integrationSystems"),
    integrationSystemsOther: g("integrationSystemsOther"),
    techStack: g("techStack"),
    digitalMaturityLevel: g("digitalMaturityLevel"),
    dataGovernanceMaturity: g("dataGovernanceMaturity"),
    aiGovernanceBoard: g("aiGovernanceBoard"),
    aiEthicsPolicy: g("aiEthicsPolicy"),
    implementationTeamComposition: g("implementationTeamComposition"),
    dataSensitivity: g("dataSensitivity"),
    regulatoryRequirements: g("regulatoryRequirements"),
    riskAppetite: g("riskAppetite"),
    decisionStakes: g("decisionStakes"),
    impactedStakeholders: g("impactedStakeholders"),
    vendorValidationApproach: g("vendorValidationApproach"),
    vendorSecurityPosture: g("vendorSecurityPosture"),
    vendorCertifications: g("vendorCertifications"),
    pilotRolloutPlan: g("pilotRolloutPlan"),
    rollbackCapability: g("rollbackCapability"),
    changeManagementPlan: g("changeManagementPlan"),
    identifiedRisks: g("identifiedRisks"),
    riskDomainScores: g("riskDomainScores"),
    riskMitigation: g("riskMitigation"),
    riskMitigationMappingIds: g("riskMitigationMappingIds"),
    monitoringDataAvailable: g("monitoringDataAvailable"),
    auditLogsAvailable: g("auditLogsAvailable"),
    testingResultsAvailable: g("testingResultsAvailable"),
    useCaseTypes: g("useCaseTypes"),
    usersInScope: g("usersInScope"),
    currentUsageState: g("currentUsageState"),
    pilotStatus: g("pilotStatus"),
    dataClasses: g("dataClasses"),
    dataSubjectJurisdictions: g("dataSubjectJurisdictions"),
    decisionDomains: g("decisionDomains"),
    outputExposure: g("outputExposure"),
    humanReviewLevel: g("humanReviewLevel"),
    aiDisclosure: g("aiDisclosure"),
    deploymentModel: g("deploymentModel"),
    cloudProvider: g("cloudProvider"),
    integrationAccessLevels: g("integrationAccessLevels"),
    implementationCapacity: g("implementationCapacity"),
    trainingEffort: g("trainingEffort"),
    vendorEvidenceReceived: g("vendorEvidenceReceived"),
    unavailabilityImpact: g("unavailabilityImpact"),
    dataExportCapability: g("dataExportCapability"),
    contractsInPlace: g("contractsInPlace"),
    answerConfidence: g("answerConfidence"),
    trainingUseOfData: g("trainingUseOfData"),
    trainingUseOfDataStance: g("trainingUseOfDataStance"),
    monitoringDataStance: g("monitoringDataStance"),
    auditLogsStance: g("auditLogsStance"),
    dataExportStance: g("dataExportStance"),
    accountableOwnerName: g("accountableOwnerName"),
    organizationId: g("organizationId"),
  };
}

async function persistVendorRiskReport(
  assessmentId: string,
  body: Record<string, unknown>,
  vendorName: string,
  productName: string,
): Promise<boolean> {
  try {
    const attestation = await findAttestationForBuyerAssessment({
      attestationId: readBuyerAttestationIdFromBody(body),
      vendorName,
      productName,
    });
    const report = await generateBuyerVendorRiskReport(
      await enrichBuyerCotsScoringPayload(
        {
          ...buildBuyerContextForReport(body),
          organizationId: body.organizationId ?? body.organization_id,
        },
        String(body.organizationId ?? body.organization_id ?? ""),
      ),
      attestation,
      vendorName || "Vendor",
      productName || "Product",
    );
    const frameworkRows = resolveFrameworkMappingRowsForAttestation(attestation);
    const llmMeta = getActiveLlmModelMeta();
    const reportStored = stampActiveLlmModel({
      ...report,
      frameworkMapping: { rows: frameworkRows },
    } as unknown as Record<string, unknown>);
    const irsRationale =
      typeof report.scoreRationale === "string" ? report.scoreRationale.trim() : "";
    await db
      .update(cotsBuyerAssessments)
      .set({
        vendor_risk_assessment_report: reportStored,
        score_rationale: irsRationale || undefined,
        score_rationale_type: irsRationale ? "IRS" : undefined,
        llm_model_id: llmMeta.modelId,
        llm_model_label: llmMeta.modelLabel,
        updated_at: new Date(),
      })
      .where(eq(cotsBuyerAssessments.assessment_id, assessmentId));
    return true;
  } catch (e) {
    if (isTokenQuotaExceededError(e)) throw e;
    console.error("persistVendorRiskReport:", e);
    return false;
  }
}

/**
 * LLM report generation often exceeds the gateway idle timeout (~60s).
 * Save the assessment, send JSON to the browser, THEN generate the report.
 * Do not await this from the HTTP handler.
 */
function queueVendorRiskReport(
  assessmentId: string,
  body: Record<string, unknown>,
  vendorName: string,
  productName: string,
): void {
  const actor = getRequestActor();
  setImmediate(() => {
    void runWithRequestActor(actor, async () => {
      try {
        await persistVendorRiskReport(assessmentId, body, vendorName, productName);
      } catch (err) {
        console.error(
          "Background buyer COTS report generation failed:",
          assessmentId,
          err instanceof Error ? err.message : err,
        );
      }
    });
  });
}

/** POST /buyerCotsAssessment - create or update (from draft) and set status submitted. Organization ID is taken from the authenticated user (DB). */
const submitBuyerCotsAssessment = async (req: Request, res: Response) => {
  try {
    const decoded = req.user as { id?: number } | undefined;
    const userId = decoded?.id;
    if (userId == null) {
      return res.status(401).json({ message: "User not found from token" });
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, Number(userId))).limit(1);
    if (!user) return res.status(404).json({ message: "User not found" });
    const organizationId = String((user as Record<string, unknown>).organization_id ?? "").trim();
    if (!organizationId) {
      return res.status(400).json({ message: "User has no organization. Complete onboarding or contact admin." });
    }

    await assertFeatureTokenQuota("assessment");

    const body = req.body ?? {};
    const assessmentIdRaw = body.assessmentId ?? body.assessment_id;
    const assessmentId = typeof assessmentIdRaw === "string" ? assessmentIdRaw.trim() || null : null;
    const payloadCots = buildPayloadCots(body);
    payloadCots.organization_id = organizationId;
    payloadCots.user_id = Number(userId);

    if (assessmentId) {
      const [existing] = await db
        .select({ id: assessments.id, status: assessments.status })
        .from(assessments)
        .where(and(eq(assessments.id, assessmentId), eq(assessments.organization_id, organizationId), eq(assessments.type, "cots_buyer")))
        .limit(1);
      if (!existing) {
        return res.status(404).json({ message: "Assessment not found or access denied" });
      }
      const currentStatus = String((existing as { status?: string }).status ?? "").toLowerCase();
      if (currentStatus === "completed" || currentStatus === "submitted") {
        return res.status(403).json({ message: "Completed assessments cannot be modified." });
      }
      await db.transaction(async (tx) => {
        await tx.update(assessments).set({ status: "submitted", updated_at: new Date() }).where(eq(assessments.id, assessmentId));
        await tx
          .update(cotsBuyerAssessments)
          .set({ ...payloadCots, updated_at: new Date() })
          .where(eq(cotsBuyerAssessments.assessment_id, assessmentId));
      });
      const reportBody = { ...(body as Record<string, unknown>), organizationId };
      res.status(200).json({
        message: "Buyer COTS assessment submitted successfully",
        assessmentId,
        reportGenerating: true,
      });
      queueVendorRiskReport(
        assessmentId,
        reportBody,
        String(payloadCots.vendor_name ?? ""),
        String(payloadCots.specific_product ?? ""),
      );
      return;
    }

    const [assessment] = await db.transaction(async (tx) => {
      const [a] = await tx
        .insert(assessments)
        .values({
          type: "cots_buyer",
          organization_id: organizationId,
          status: "submitted",
        })
        .returning({ id: assessments.id });
      if (!a?.id) throw new Error("Failed to create assessment");
      await tx.insert(cotsBuyerAssessments).values({ assessment_id: a.id, ...payloadCots });
      return [a];
    });
    const reportBody = { ...(body as Record<string, unknown>), organizationId };
    res.status(201).json({
      message: "Buyer COTS assessment submitted successfully",
      assessmentId: assessment.id,
      reportGenerating: true,
    });
    queueVendorRiskReport(
      assessment.id,
      reportBody,
      String(payloadCots.vendor_name ?? ""),
      String(payloadCots.specific_product ?? ""),
    );
    return;
  } catch (error) {
    if (sendIfTokenQuotaExceeded(res, error)) return;
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error in submitBuyerCotsAssessment:", message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export default submitBuyerCotsAssessment;
