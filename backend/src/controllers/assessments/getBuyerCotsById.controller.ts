import type { Request, Response } from "express";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { assessments } from "../../schema/assessments/assessments.js";
import { cotsBuyerAssessments } from "../../schema/assessments/cotsBuyerAssessments.js";
import { eq, and } from "drizzle-orm";
import { buildBuyerCotsOrganizationalPortalInsights } from "../../services/orgPortalComplianceInsights.js";
import { buyerImplementationReadinessGradeFromScore } from "../../services/buyerImplementationRiskScore.js";
import { buildBuyerCotsFrameworkMappingRows } from "../../services/buyerCotsFrameworkMapping.js";

function extractImplementationReadinessFromVendorReport(report: unknown): {
  implementationReadinessGrade: string | null;
  implementationRiskScore: number | null;
} {
  if (report == null || typeof report !== "object") {
    return { implementationReadinessGrade: null, implementationRiskScore: null };
  }
  const r = report as Record<string, unknown>;
  const rawScore = r.implementationRiskScore;
  const n = typeof rawScore === "number" ? rawScore : Number(rawScore);
  const implementationRiskScore = Number.isFinite(n)
    ? Math.min(100, Math.max(0, Math.round(n)))
    : null;
  const rawLetter = r.implementationReadinessGrade;
  let implementationReadinessGrade: string | null =
    rawLetter != null && String(rawLetter).trim() !== ""
      ? String(rawLetter).trim().slice(0, 8)
      : null;
  if (implementationReadinessGrade == null && implementationRiskScore != null) {
    implementationReadinessGrade = buyerImplementationReadinessGradeFromScore(implementationRiskScore);
  }
  return { implementationReadinessGrade, implementationRiskScore };
}

/** GET /buyerCotsAssessment/:id - return one buyer COTS assessment for resume. User must belong to same org. */
const getBuyerCotsById = async (req: Request, res: Response) => {
  try {
    const decoded = req.user as { id?: number } | undefined;
    const userId = decoded?.id;
    if (userId == null) {
      return res.status(401).json({ message: "User not found from token" });
    }
    const id = (req.params as { id?: string }).id;
    if (!id) {
      return res.status(400).json({ message: "Assessment ID required" });
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, Number(userId))).limit(1);
    if (!user) return res.status(404).json({ message: "User not found" });
    const platformRole = String((user as Record<string, unknown>).user_platform_role ?? "").trim().toLowerCase().replace(/_/g, " ");
    const isSystemUser =
      platformRole === "system admin" || platformRole === "system manager" || platformRole === "system viewer";
    const orgId = String((user as Record<string, unknown>).organization_id ?? "").trim();
    if (!isSystemUser && !orgId) return res.status(400).json({ message: "User has no organization" });

    const whereCondition = isSystemUser
      ? and(eq(assessments.id, id), eq(assessments.type, "cots_buyer"))
      : and(eq(assessments.id, id), eq(assessments.organization_id, orgId), eq(assessments.type, "cots_buyer"));

    const rows = await db
      .select({
        assessmentId: assessments.id,
        type: assessments.type,
        status: assessments.status,
        organizationId: assessments.organization_id,
        created_at: assessments.created_at,
        updated_at: assessments.updated_at,
        expiry_at: assessments.expiry_at,
        organization_name: cotsBuyerAssessments.organization_name,
        industry_sector: cotsBuyerAssessments.industry_sector,
        employee_count: cotsBuyerAssessments.employee_count,
        geographic_regions: cotsBuyerAssessments.geographic_regions,
        pain_point: cotsBuyerAssessments.pain_point,
        business_outcomes: cotsBuyerAssessments.business_outcomes,
        business_unit: cotsBuyerAssessments.business_unit,
        budget_range: cotsBuyerAssessments.budget_range,
        target_timeline: cotsBuyerAssessments.target_timeline,
        critical_of_ai_solution: cotsBuyerAssessments.critical_of_ai_solution,
        vendor_name: cotsBuyerAssessments.vendor_name,
        specific_product: cotsBuyerAssessments.specific_product,
        gap_requirement_product: cotsBuyerAssessments.gap_requirement_product,
        integrate_system: cotsBuyerAssessments.integrate_system,
        integrate_system_other: cotsBuyerAssessments.integrate_system_other,
        current_tech_stack: cotsBuyerAssessments.current_tech_stack,
        digital_maturity: cotsBuyerAssessments.digital_maturity,
        governance_maturity: cotsBuyerAssessments.governance_maturity,
        ai_governance_board: cotsBuyerAssessments.ai_governance_board,
        ai_ethics_policy: cotsBuyerAssessments.ai_ethics_policy,
        team_composition: cotsBuyerAssessments.team_composition,
        data_sensitivity_level: cotsBuyerAssessments.data_sensitivity_level,
        regulatory_requirments: cotsBuyerAssessments.regulatory_requirments,
        risk_appetite: cotsBuyerAssessments.risk_appetite,
        statke_at_ai_decisions: cotsBuyerAssessments.statke_at_ai_decisions,
        impact_by_ai: cotsBuyerAssessments.impact_by_ai,
        vendor_capabilities: cotsBuyerAssessments.vendor_capabilities,
        vendor_security_posture: cotsBuyerAssessments.vendor_security_posture,
        vendor_compliance_certifications: cotsBuyerAssessments.vendor_compliance_certifications,
        phased_rollout_plan: cotsBuyerAssessments.phased_rollout_plan,
        rollback_capability: cotsBuyerAssessments.rollback_capability,
        management_plan: cotsBuyerAssessments.management_plan,
        vendor_usage_data: cotsBuyerAssessments.vendor_usage_data,
        audit_logs: cotsBuyerAssessments.audit_logs,
        testing_results: cotsBuyerAssessments.testing_results,
        identified_risks: cotsBuyerAssessments.identified_risks,
        risk_domain_scores: cotsBuyerAssessments.risk_domain_scores,
        contextual_multipliers: cotsBuyerAssessments.contextual_multipliers,
        buyer_risk_mitigation: cotsBuyerAssessments.buyer_risk_mitigation,
        risk_mitigation_mapping_ids: cotsBuyerAssessments.risk_mitigation_mapping_ids,
        vendor_risk_assessment_report: cotsBuyerAssessments.vendor_risk_assessment_report,
      })
      .from(assessments)
      .leftJoin(cotsBuyerAssessments, eq(assessments.id, cotsBuyerAssessments.assessment_id))
      .where(whereCondition)
      .limit(1);

    const r = rows[0];
    if (!r || !r.assessmentId) {
      return res.status(404).json({ message: "Assessment not found" });
    }
    const toJson = (v: unknown) => (v != null ? (Array.isArray(v) ? v : typeof v === "object" ? JSON.stringify(v) : String(v)) : "");
    const operatingRegionsVal = r.geographic_regions;
    const operatingRegions = Array.isArray(operatingRegionsVal)
      ? operatingRegionsVal
      : operatingRegionsVal != null && typeof operatingRegionsVal === "object"
        ? (operatingRegionsVal as string[])
        : typeof operatingRegionsVal === "string"
          ? operatingRegionsVal
          : "";
    const data: Record<string, unknown> = {
      assessmentId: r.assessmentId,
      type: "cots_buyer",
      status: r.status,
      organizationId: r.organizationId,
      createdAt: (r as { created_at?: unknown }).created_at,
      updatedAt: (r as { updated_at?: unknown }).updated_at,
      expiryAt: (r as { expiry_at?: unknown }).expiry_at,
      organizationName: r.organization_name ?? "",
      industrySector: r.industry_sector ?? "",
      employeeCount: r.employee_count ?? "",
      operatingRegions,
      businessPainPoint: r.pain_point ?? "",
      expectedOutcomes: r.business_outcomes ?? "",
      owningDepartment: r.business_unit ?? "",
      budgetRange: r.budget_range ?? "",
      targetTimeline: r.target_timeline ?? "",
      criticality: r.critical_of_ai_solution ?? "",
      vendorName: r.vendor_name ?? "",
      productName: r.specific_product ?? "",
      requirementGaps: r.gap_requirement_product ?? "",
      integrationSystems: r.integrate_system != null ? (Array.isArray(r.integrate_system) ? r.integrate_system : toJson(r.integrate_system)) : "",
      integrationSystemsOther: r.integrate_system_other ?? "",
      techStack: r.current_tech_stack != null ? (Array.isArray(r.current_tech_stack) ? r.current_tech_stack : toJson(r.current_tech_stack)) : "",
      digitalMaturityLevel: r.digital_maturity ?? "",
      dataGovernanceMaturity: r.governance_maturity ?? "",
      aiGovernanceBoard: r.ai_governance_board ?? "",
      aiEthicsPolicy: r.ai_ethics_policy ?? "",
      implementationTeamComposition: r.team_composition != null ? (Array.isArray(r.team_composition) ? r.team_composition : toJson(r.team_composition)) : "",
      dataSensitivity: r.data_sensitivity_level ?? "",
      regulatoryRequirements: r.regulatory_requirments != null ? (Array.isArray(r.regulatory_requirments) ? r.regulatory_requirments : toJson(r.regulatory_requirments)) : "",
      riskAppetite: r.risk_appetite ?? "",
      decisionStakes: r.statke_at_ai_decisions ?? "",
      impactedStakeholders: r.impact_by_ai != null ? (Array.isArray(r.impact_by_ai) ? r.impact_by_ai : toJson(r.impact_by_ai)) : "",
      vendorValidationApproach: r.vendor_capabilities ?? "",
      vendorSecurityPosture: r.vendor_security_posture ?? "",
      vendorCertifications: r.vendor_compliance_certifications != null ? (Array.isArray(r.vendor_compliance_certifications) ? r.vendor_compliance_certifications : toJson(r.vendor_compliance_certifications)) : "",
      pilotRolloutPlan: r.phased_rollout_plan ?? "",
      rollbackCapability: r.rollback_capability ?? "",
      changeManagementPlan: r.management_plan ?? "",
      monitoringDataAvailable: r.vendor_usage_data ?? "",
      auditLogsAvailable: r.audit_logs ?? "",
      testingResultsAvailable: r.testing_results ?? "",
      identifiedRisks: r.identified_risks ?? "",
      riskDomainScores: r.risk_domain_scores ?? "",
      contextualMultipliers: r.contextual_multipliers ?? "",
      riskMitigation: r.buyer_risk_mitigation ?? "",
      riskMitigationMappingIds: Array.isArray(r.risk_mitigation_mapping_ids) ? r.risk_mitigation_mapping_ids : [],
      ...extractImplementationReadinessFromVendorReport(
        (r as { vendor_risk_assessment_report?: unknown }).vendor_risk_assessment_report,
      ),
    };
    data.organizationalPortal = buildBuyerCotsOrganizationalPortalInsights({
      industrySector: r.industry_sector,
      vendorCertifications: r.vendor_compliance_certifications,
      vendorRiskReport: {
        frameworkMapping: {
          rows: buildBuyerCotsFrameworkMappingRows(
            (r as { vendor_risk_assessment_report?: unknown }).vendor_risk_assessment_report,
            r.regulatory_requirments,
          ),
        },
      },
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("getBuyerCotsById:", error instanceof Error ? error.message : String(error));
    return res.status(500).json({ message: "Internal server error" });
  }
};

export default getBuyerCotsById;
