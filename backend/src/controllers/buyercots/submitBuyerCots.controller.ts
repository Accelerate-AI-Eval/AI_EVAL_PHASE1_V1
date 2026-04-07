import type { Request, Response } from "express";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { assessments } from "../../schema/assessments/assessments.js";
import { cotsBuyerAssessments } from "../../schema/assessments/cotsBuyerAssessments.js";
import { eq, and } from "drizzle-orm";
import { findAttestationForBuyerAssessment } from "../../services/findAttestationForBuyerVendorProduct.js";
import { resolveFrameworkMappingRowsForAttestation } from "../../services/frameworkMappingFromCompliance.js";
import { generateBuyerVendorRiskReport } from "../agents/buyerVendorRiskReportAgent.js";

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
  };
}

async function persistVendorRiskReport(
  assessmentId: string,
  body: Record<string, unknown>,
  vendorName: string,
  productName: string,
): Promise<void> {
  try {
    const attestation = await findAttestationForBuyerAssessment({
      attestationId: readBuyerAttestationIdFromBody(body),
      vendorName,
      productName,
    });
    const report = await generateBuyerVendorRiskReport(
      buildBuyerContextForReport(body),
      attestation,
      vendorName || "Vendor",
      productName || "Product",
    );
    const frameworkRows = resolveFrameworkMappingRowsForAttestation(attestation);
    const reportStored = {
      ...report,
      frameworkMapping: { rows: frameworkRows },
    } as unknown as Record<string, unknown>;
    await db
      .update(cotsBuyerAssessments)
      .set({
        vendor_risk_assessment_report: reportStored,
        updated_at: new Date(),
      })
      .where(eq(cotsBuyerAssessments.assessment_id, assessmentId));
  } catch (e) {
    console.error("persistVendorRiskReport:", e);
  }
}

/** Map API (camelCase) to DB columns (Excel buyer_cots sheet names). */
function buildPayloadCots(body: Record<string, unknown>) {
  const get = (k: string) => body[k] ?? body[k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
  const parseJson = (v: unknown) => {
    if (v == null) return null;
    if (typeof v === "string" && v.trim()) {
      try {
        const p = JSON.parse(v);
        return Array.isArray(p) ? p : p;
      } catch {
        return v;
      }
    }
    return v;
  };
  return {
    user_id: get("userId") != null ? Number(get("userId")) || null : null,
    organization_id: get("organizationId") != null ? String(get("organizationId")).slice(0, 255) : null,
    organization_name: get("organizationName") != null ? String(get("organizationName")).slice(0, 255) : null,
    industry: get("industry") != null ? String(get("industry")).slice(0, 200) : null,
    industry_sector: get("industrySector") != null ? String(get("industrySector")).slice(0, 200) : null,
    employee_count: get("employeeCount") != null ? String(get("employeeCount")).slice(0, 100) : null,
    geographic_regions: parseJson(get("geographicRegions") ?? get("operatingRegions")),
    pain_point: get("businessPainPoint") != null ? String(get("businessPainPoint")) : null,
    business_outcomes: get("expectedOutcomes") != null ? String(get("expectedOutcomes")).slice(0, 300) : null,
    business_unit: get("owningDepartment") != null ? String(get("owningDepartment")).slice(0, 100) : null,
    budget_range: get("budgetRange") != null ? String(get("budgetRange")).slice(0, 100) : null,
    target_timeline: get("targetTimeline") != null ? String(get("targetTimeline")).slice(0, 100) : null,
    critical_of_ai_solution: get("criticality") != null ? String(get("criticality")).slice(0, 100) : null,
    vendor_name: get("vendorName") != null ? String(get("vendorName")).slice(0, 200) : null,
    specific_product: get("productName") != null ? String(get("productName")).slice(0, 200) : null,
    gap_requirement_product: get("requirementGaps") != null ? String(get("requirementGaps")) : null,
    integrate_system: parseJson(get("integrationSystems")),
    integrate_system_other: get("integrationSystemsOther") != null ? String(get("integrationSystemsOther")).slice(0, 300) : null,
    current_tech_stack: parseJson(get("techStack")),
    digital_maturity: get("digitalMaturityLevel") != null ? String(get("digitalMaturityLevel")).slice(0, 100) : null,
    governance_maturity: get("dataGovernanceMaturity") != null ? String(get("dataGovernanceMaturity")).slice(0, 100) : null,
    ai_governance_board: get("aiGovernanceBoard") != null ? String(get("aiGovernanceBoard")).slice(0, 100) : null,
    ai_ethics_policy: get("aiEthicsPolicy") != null ? String(get("aiEthicsPolicy")).slice(0, 100) : null,
    team_composition: parseJson(get("implementationTeamComposition")),
    data_sensitivity_level: get("dataSensitivity") != null ? String(get("dataSensitivity")).slice(0, 100) : null,
    regulatory_requirments: parseJson(get("regulatoryRequirements")),
    risk_appetite: get("riskAppetite") != null ? String(get("riskAppetite")).slice(0, 100) : null,
    statke_at_ai_decisions: get("decisionStakes") != null ? String(get("decisionStakes")).slice(0, 100) : null,
    impact_by_ai: parseJson(get("impactedStakeholders")),
    vendor_capabilities: get("vendorValidationApproach") != null ? String(get("vendorValidationApproach")).slice(0, 100) : null,
    vendor_security_posture: get("vendorSecurityPosture") != null ? String(get("vendorSecurityPosture")).slice(0, 100) : null,
    vendor_compliance_certifications: parseJson(get("vendorCertifications")),
    phased_rollout_plan: get("pilotRolloutPlan") != null ? String(get("pilotRolloutPlan")).slice(0, 100) : null,
    rollback_capability: get("rollbackCapability") != null ? String(get("rollbackCapability")).slice(0, 100) : null,
    management_plan: get("changeManagementPlan") != null ? String(get("changeManagementPlan")).slice(0, 100) : null,
    compliance_document: get("complianceDocument") != null ? String(get("complianceDocument")) : null,
    vendor_usage_data: get("monitoringDataAvailable") != null ? String(get("monitoringDataAvailable")).slice(0, 100) : null,
    audit_logs: get("auditLogsAvailable") != null ? String(get("auditLogsAvailable")).slice(0, 100) : null,
    testing_results: get("testingResultsAvailable") != null ? String(get("testingResultsAvailable")).slice(0, 100) : null,
    identified_risks: get("identifiedRisks") != null ? String(get("identifiedRisks")) : null,
    risk_domain_scores: get("riskDomainScores") != null ? String(get("riskDomainScores")) : null,
    contextual_multipliers: get("contextualMultipliers") != null ? String(get("contextualMultipliers")) : null,
    buyer_risk_mitigation: get("riskMitigation") != null ? String(get("riskMitigation")) : null,
    risk_mitigation_mapping_ids: parseJson(get("riskMitigationMappingIds")),
  };
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
      await persistVendorRiskReport(
        assessmentId,
        body as Record<string, unknown>,
        String(payloadCots.vendor_name ?? ""),
        String(payloadCots.specific_product ?? ""),
      );
      return res.status(200).json({
        message: "Buyer COTS assessment submitted successfully",
        assessmentId,
        vendorRiskReportAvailable: true,
      });
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
    await persistVendorRiskReport(
      assessment.id,
      body as Record<string, unknown>,
      String(payloadCots.vendor_name ?? ""),
      String(payloadCots.specific_product ?? ""),
    );
    return res.status(201).json({
      message: "Buyer COTS assessment submitted successfully",
      assessmentId: assessment.id,
      vendorRiskReportAvailable: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error in submitBuyerCotsAssessment:", message);
    return res.status(500).json({ message: "Internal server error" });
  }
};

export default submitBuyerCotsAssessment;
