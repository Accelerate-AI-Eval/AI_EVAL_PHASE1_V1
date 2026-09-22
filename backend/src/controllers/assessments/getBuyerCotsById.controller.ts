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
        compliance_document: cotsBuyerAssessments.compliance_document,
        vendor_usage_data: cotsBuyerAssessments.vendor_usage_data,
        audit_logs: cotsBuyerAssessments.audit_logs,
        testing_results: cotsBuyerAssessments.testing_results,
        identified_risks: cotsBuyerAssessments.identified_risks,
        risk_domain_scores: cotsBuyerAssessments.risk_domain_scores,
        contextual_multipliers: cotsBuyerAssessments.contextual_multipliers,
        buyer_risk_mitigation: cotsBuyerAssessments.buyer_risk_mitigation,
        risk_mitigation_mapping_ids: cotsBuyerAssessments.risk_mitigation_mapping_ids,
        vendor_risk_assessment_report: cotsBuyerAssessments.vendor_risk_assessment_report,
        use_case_types: cotsBuyerAssessments.use_case_types,
        users_in_scope: cotsBuyerAssessments.users_in_scope,
        current_usage_state: cotsBuyerAssessments.current_usage_state,
        pilot_status: cotsBuyerAssessments.pilot_status,
        accountable_owner_name: cotsBuyerAssessments.accountable_owner_name,
        accountable_owner_role: cotsBuyerAssessments.accountable_owner_role,
        data_classes: cotsBuyerAssessments.data_classes,
        data_subject_jurisdictions: cotsBuyerAssessments.data_subject_jurisdictions,
        decision_domains: cotsBuyerAssessments.decision_domains,
        output_exposure: cotsBuyerAssessments.output_exposure,
        regulatory_requirements_derived: cotsBuyerAssessments.regulatory_requirements_derived,
        regulatory_requirements_added: cotsBuyerAssessments.regulatory_requirements_added,
        regulatory_requirements_removed: cotsBuyerAssessments.regulatory_requirements_removed,
        retention_requirement: cotsBuyerAssessments.retention_requirement,
        training_use_of_data: cotsBuyerAssessments.training_use_of_data,
        training_use_of_data_stance: cotsBuyerAssessments.training_use_of_data_stance,
        training_use_of_data_dispute_note: cotsBuyerAssessments.training_use_of_data_dispute_note,
        human_review_level: cotsBuyerAssessments.human_review_level,
        ai_disclosure: cotsBuyerAssessments.ai_disclosure,
        deployment_model: cotsBuyerAssessments.deployment_model,
        cloud_provider: cotsBuyerAssessments.cloud_provider,
        integration_access_levels: cotsBuyerAssessments.integration_access_levels,
        implementation_capacity: cotsBuyerAssessments.implementation_capacity,
        training_effort: cotsBuyerAssessments.training_effort,
        vendor_evidence_received: cotsBuyerAssessments.vendor_evidence_received,
        monitoring_data_stance: cotsBuyerAssessments.monitoring_data_stance,
        monitoring_data_dispute_note: cotsBuyerAssessments.monitoring_data_dispute_note,
        audit_logs_stance: cotsBuyerAssessments.audit_logs_stance,
        audit_logs_dispute_note: cotsBuyerAssessments.audit_logs_dispute_note,
        data_export_capability: cotsBuyerAssessments.data_export_capability,
        data_export_stance: cotsBuyerAssessments.data_export_stance,
        data_export_dispute_note: cotsBuyerAssessments.data_export_dispute_note,
        unavailability_impact: cotsBuyerAssessments.unavailability_impact,
        contracts_in_place: cotsBuyerAssessments.contracts_in_place,
        contract_notice_period: cotsBuyerAssessments.contract_notice_period,
        assessor_name: cotsBuyerAssessments.assessor_name,
        assessor_role: cotsBuyerAssessments.assessor_role,
        answer_confidence: cotsBuyerAssessments.answer_confidence,
        review_due_date: cotsBuyerAssessments.review_due_date,
        unlinked_vendor: cotsBuyerAssessments.unlinked_vendor,
        target_outcome_metric: cotsBuyerAssessments.target_outcome_metric,
        target_outcome_baseline: cotsBuyerAssessments.target_outcome_baseline,
        target_outcome_target: cotsBuyerAssessments.target_outcome_target,
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
    const toStringList = (v: unknown): string[] => {
      if (v == null || v === "") return [];
      if (Array.isArray(v)) return v.map(String).map((x) => x.trim()).filter(Boolean);
      const s = String(v).trim();
      if (!s) return [];
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed.map(String).map((x) => x.trim()).filter(Boolean);
      } catch {
        /* comma-separated */
      }
      return s.split(",").map((x) => x.trim()).filter(Boolean);
    };
    const looksLikeFileName = (s: string) => /\.(pdf|doc|docx|ppt|pptx)$/i.test(s);
    const evidenceOptions = toStringList(r.vendor_evidence_received).filter((s) => !looksLikeFileName(s));
    const evidenceFilesByCategory = (() => {
      const raw = r.compliance_document;
      if (raw == null || String(raw).trim() === "") return {};
      if (typeof raw === "object" && !Array.isArray(raw)) return raw;
      const s = String(raw).trim();
      try {
        const parsed = JSON.parse(s);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
      } catch {
        /* legacy comma-separated names */
      }
      return {};
    })();
    const operatingRegions = toStringList(r.geographic_regions);
    const data: Record<string, unknown> = {
      assessmentId: r.assessmentId,
      type: "cots_buyer",
      status: r.status,
      organizationId: r.organizationId,
      createdAt: (r as { created_at?: unknown }).created_at,
      updatedAt: (r as { updated_at?: unknown }).updated_at,
      expiryAt: (r as { expiry_at?: unknown }).expiry_at,
      organizationName: r.organization_name ?? "",
      industrySector: (() => {
        const raw = r.industry_sector;
        if (raw == null || String(raw).trim() === "") return [];
        const s = String(raw).trim();
        try {
          const parsed = JSON.parse(s);
          if (Array.isArray(parsed)) {
            return parsed.map(String).map((x) => x.trim()).filter(Boolean);
          }
        } catch {
          /* comma-separated varchar */
        }
        return s
          .split(",")
          .map((part) => part.trim())
          .filter(Boolean);
      })(),
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
      vendorComplianceDocumentation: evidenceFilesByCategory,
      monitoringDataAvailable: r.vendor_usage_data ?? "",
      auditLogsAvailable: r.audit_logs ?? "",
      testingResultsAvailable: r.testing_results ?? "",
      identifiedRisks: r.identified_risks ?? "",
      riskDomainScores: r.risk_domain_scores ?? "",
      contextualMultipliers: r.contextual_multipliers ?? "",
      riskMitigation: r.buyer_risk_mitigation ?? "",
      riskMitigationMappingIds: Array.isArray(r.risk_mitigation_mapping_ids) ? r.risk_mitigation_mapping_ids : [],
      useCaseTypes: r.use_case_types != null ? (Array.isArray(r.use_case_types) ? r.use_case_types : toJson(r.use_case_types)) : "",
      usersInScope: r.users_in_scope ?? "",
      currentUsageState: r.current_usage_state ?? "",
      pilotStatus: r.pilot_status ?? "",
      accountableOwnerName: r.accountable_owner_name ?? "",
      accountableOwnerRole: r.accountable_owner_role ?? "",
      dataClasses: r.data_classes != null ? (Array.isArray(r.data_classes) ? r.data_classes : toJson(r.data_classes)) : "",
      dataSubjectJurisdictions: r.data_subject_jurisdictions != null ? (Array.isArray(r.data_subject_jurisdictions) ? r.data_subject_jurisdictions : toJson(r.data_subject_jurisdictions)) : "",
      decisionDomains: r.decision_domains != null ? (Array.isArray(r.decision_domains) ? r.decision_domains : toJson(r.decision_domains)) : "",
      outputExposure: r.output_exposure ?? "",
      regulatoryRequirementsDerived: r.regulatory_requirements_derived != null ? (Array.isArray(r.regulatory_requirements_derived) ? r.regulatory_requirements_derived : toJson(r.regulatory_requirements_derived)) : "",
      regulatoryRequirementsAdded: r.regulatory_requirements_added != null ? (Array.isArray(r.regulatory_requirements_added) ? r.regulatory_requirements_added : toJson(r.regulatory_requirements_added)) : "",
      regulatoryRequirementsRemoved: r.regulatory_requirements_removed != null ? (Array.isArray(r.regulatory_requirements_removed) ? r.regulatory_requirements_removed : toJson(r.regulatory_requirements_removed)) : "",
      retentionRequirement: r.retention_requirement ?? "",
      trainingUseOfData: r.training_use_of_data ?? "",
      trainingUseOfDataStance: r.training_use_of_data_stance ?? "",
      trainingUseOfDataDisputeNote: r.training_use_of_data_dispute_note ?? "",
      humanReviewLevel: r.human_review_level ?? "",
      aiDisclosure: r.ai_disclosure ?? "",
      deploymentModel: r.deployment_model ?? "",
      cloudProvider: r.cloud_provider != null ? (Array.isArray(r.cloud_provider) ? r.cloud_provider : toJson(r.cloud_provider)) : "",
      integrationAccessLevels: r.integration_access_levels != null ? toJson(r.integration_access_levels) : "",
      implementationCapacity: r.implementation_capacity ?? "",
      trainingEffort: r.training_effort ?? "",
      vendorEvidenceReceived: evidenceOptions,
      monitoringDataStance: r.monitoring_data_stance ?? "",
      monitoringDataDisputeNote: r.monitoring_data_dispute_note ?? "",
      auditLogsStance: r.audit_logs_stance ?? "",
      auditLogsDisputeNote: r.audit_logs_dispute_note ?? "",
      dataExportCapability: r.data_export_capability ?? "",
      dataExportStance: r.data_export_stance ?? "",
      dataExportDisputeNote: r.data_export_dispute_note ?? "",
      unavailabilityImpact: r.unavailability_impact ?? "",
      contractsInPlace: r.contracts_in_place != null ? (Array.isArray(r.contracts_in_place) ? r.contracts_in_place : toJson(r.contracts_in_place)) : "",
      contractNoticePeriod: r.contract_notice_period ?? "",
      assessorName: r.assessor_name ?? "",
      assessorRole: r.assessor_role ?? "",
      answerConfidence: r.answer_confidence ?? "",
      reviewDueDate: r.review_due_date != null ? new Date(r.review_due_date as Date).toISOString().slice(0, 10) : "",
      unlinkedVendor: r.unlinked_vendor ?? "",
      targetOutcomeMetric: r.target_outcome_metric ?? "",
      targetOutcomeBaseline: r.target_outcome_baseline ?? "",
      targetOutcomeTarget: r.target_outcome_target ?? "",
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
