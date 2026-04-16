import type { Request, Response } from "express";
import { db, pool } from "../../database/db.js";
import { expireSubmittedAssessmentsAndArchiveBuyerReports } from "../../services/expireAndArchiveCotsBuyerAssessments.js";
import { usersTable } from "../../schema/schema.js";
import { eq } from "drizzle-orm";


/**
 * GET /assessments (uses authenticated user's org).
 * System admins see all assessments; others see only their organization's.
 */
const listAssessmentsByOrganization = async (req: Request, res: Response) => {
  try {
    const decoded = req.user as { id?: number } | undefined;
    const userId = decoded?.id;
    if (userId == null) {
      return res.status(401).json({ message: "User not found from token" });
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, Number(userId)))
      .limit(1);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const platformRole = String((user as Record<string, unknown>).user_platform_role ?? "").trim().toLowerCase().replace(/_/g, " ");
    const isSystemAdmin = platformRole === "system admin";
    const isSystemManager = platformRole === "system manager";
    const isSystemViewer = platformRole === "system viewer";
    const isSystemUser = isSystemAdmin || isSystemManager || isSystemViewer;

    const organizationIdFromQuery = typeof req.query?.organizationId === "string" ? req.query.organizationId.trim() || null : null;
    const orgIdFromUser = user.organization_id;
    const orgIdStrFromUser = orgIdFromUser != null ? String(orgIdFromUser).trim() : "";
    const orgIdStr = (isSystemUser && organizationIdFromQuery ? organizationIdFromQuery : orgIdStrFromUser) || "";
    if (!isSystemAdmin && !orgIdStr) {
      return res.status(400).json({ message: "User has no organization" });
    }
    // Ensure string for varchar column (avoids driver/DB type mismatch)
    const orgIdParam = String(orgIdStr);

    await expireSubmittedAssessmentsAndArchiveBuyerReports(pool);

    // System user (admin/manager/viewer) with organizationId in query: filter to that org. Non-system: filter to user's org. System admin without query: no filter (all).
    const filterByOrg = !isSystemUser || (isSystemUser && organizationIdFromQuery != null);
    const whereClause = filterByOrg ? "a.organization_id = $1" : "1 = 1";
    const queryParams = filterByOrg ? [orgIdParam] : [];
    const { rows } = await pool.query<Record<string, unknown>>(
      `SELECT
        a.id AS "assessmentId",
        a.type,
        a.status,
        a.created_at AS "createdAt",
        a.updated_at AS "updatedAt",
        a.expiry_at AS "expiryAt",
        a.organization_id AS "organizationId",
        b.organization_name AS "organizationName",
        b.user_id AS "completedByUserId",
        u.email AS "completedByUserEmail",
        u.user_first_name AS "completedByUserFirstName",
        u.user_last_name AS "completedByUserLastName",
        u.user_name AS "completedByUserName",
        v.user_id AS "vendorCompletedByUserId",
        u2.email AS "vendorCompletedByUserEmail",
        u2.user_first_name AS "vendorCompletedByUserFirstName",
        u2.user_last_name AS "vendorCompletedByUserLastName",
        u2.user_name AS "vendorCompletedByUserName",
        b.industry_sector AS "industrySector",
        b.pain_point AS "businessPainPoint",
        b.business_outcomes AS "expectedOutcomes",
        b.business_unit AS "owningDepartment",
        b.budget_range AS "budgetRange",
        b.target_timeline AS "targetTimeline",
        b.critical_of_ai_solution AS "criticality",
        b.vendor_name AS "vendorName",
        b.specific_product AS "productName",
        b.gap_requirement_product AS "requirementGaps",
        b.integrate_system AS "integrationSystems",
        b.integrate_system_other AS "integrationSystemsOther",
        b.current_tech_stack AS "techStack",
        b.digital_maturity AS "digitalMaturityLevel",
        b.governance_maturity AS "dataGovernanceMaturity",
        b.ai_governance_board AS "aiGovernanceBoard",
        b.ai_ethics_policy AS "aiEthicsPolicy",
        b.team_composition AS "implementationTeamComposition",
        b.data_sensitivity_level AS "dataSensitivity",
        b.regulatory_requirments AS "regulatoryRequirements",
        b.risk_appetite AS "riskAppetite",
        b.statke_at_ai_decisions AS "decisionStakes",
        b.impact_by_ai AS "impactedStakeholders",
        b.vendor_capabilities AS "vendorValidationApproach",
        b.vendor_security_posture AS "vendorSecurityPosture",
        b.vendor_compliance_certifications AS "vendorCertifications",
        b.phased_rollout_plan AS "pilotRolloutPlan",
        b.rollback_capability AS "rollbackCapability",
        b.management_plan AS "changeManagementPlan",
        b.vendor_usage_data AS "monitoringDataAvailable",
        b.audit_logs AS "auditLogsAvailable",
        b.testing_results AS "testingResultsAvailable",
        b.identified_risks AS "identifiedRisks",
        b.risk_domain_scores AS "riskDomainScores",
        b.contextual_multipliers AS "contextualMultipliers",
        b.buyer_risk_mitigation AS "riskMitigation",
        b.risk_mitigation_mapping_ids AS "riskMitigationMappingIds",
        b.created_at AS "cotsCreatedAt",
        b.updated_at AS "cotsUpdatedAt",
        v.vendor_attestation_id::text AS "vendorAttestationId",
        v.customer_organization_name AS "customerOrganizationName",
        v.customer_sector AS "customerSector",
        v.primary_pain_point AS "primaryPainPoint",
        v.expected_outcomes AS "vendorExpectedOutcomes",
        v.customer_budget_range AS "customerBudgetRange",
        v.implementation_timeline AS "implementationTimeline",
        v.product_features AS "productFeatures",
        v.implementation_approach AS "implementationApproach",
        v.customization_level AS "customizationLevel",
        v.integration_complexity AS "integrationComplexity",
        v.regulatory_requirements AS "vendorRegulatoryRequirements",
        v.regulatory_requirements_other AS "regulatoryRequirementsOther",
        v.data_sensitivity AS "vendorDataSensitivity",
        v.customer_risk_tolerance AS "customerRiskTolerance",
        v.alternatives_considered AS "alternativesConsidered",
        v.key_advantages AS "keyAdvantages",
        v.customer_specific_risks AS "customerSpecificRisks",
        v.customer_specific_risks_other AS "customerSpecificRisksOther",
        v.identified_risks AS "vendorIdentifiedRisks",
        v.risk_domain_scores AS "vendorRiskDomainScores",
        v.contextual_multipliers AS "vendorContextualMultipliers",
        v.risk_mitigation AS "vendorRiskMitigation",
        v.created_at AS "vendorCotsCreatedAt",
        v.updated_at AS "vendorCotsUpdatedAt",
        vsa.product_name AS "attestationProductName",
        vsa.expiry_at AS "attestationExpiryAt",
        COALESCE(
          CASE
            WHEN (b.vendor_risk_assessment_report->>'implementationRiskScore') IS NOT NULL
              AND TRIM(b.vendor_risk_assessment_report->>'implementationRiskScore') <> ''
              AND TRIM(b.vendor_risk_assessment_report->>'implementationRiskScore')
                ~ '^[-+]?[0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?$'
            THEN TRIM(b.vendor_risk_assessment_report->>'implementationRiskScore')::double precision
            ELSE NULL
          END,
          vcr.vendor_report_risk_score
        ) AS "reportRiskScore"
      FROM assessments a
      LEFT JOIN cots_buyer_assessments b ON a.id = b.assessment_id
      LEFT JOIN cots_vendor_assessments v ON a.id = v.assessment_id
      LEFT JOIN vendor_self_attestations vsa ON (v.vendor_attestation_id = vsa.vendor_self_attestation_id OR v.vendor_attestation_id = vsa.id)
      LEFT JOIN LATERAL (
        SELECT
          CASE
            WHEN COALESCE(
              cr.report->'generatedAnalysis'->>'overallRiskScore',
              cr.report->>'overallRiskScore'
            ) IS NOT NULL
              AND TRIM(
                COALESCE(
                  cr.report->'generatedAnalysis'->>'overallRiskScore',
                  cr.report->>'overallRiskScore'
                )
              ) <> ''
              AND TRIM(
                COALESCE(
                  cr.report->'generatedAnalysis'->>'overallRiskScore',
                  cr.report->>'overallRiskScore'
                )
              ) ~ '^[-+]?[0-9]*\\.?[0-9]+([eE][-+]?[0-9]+)?$'
            THEN TRIM(
              COALESCE(
                cr.report->'generatedAnalysis'->>'overallRiskScore',
                cr.report->>'overallRiskScore'
              )
            )::double precision
            ELSE NULL
          END AS vendor_report_risk_score
        FROM customer_risk_assessment_reports cr
        WHERE cr.assessment_id = a.id
        ORDER BY cr.created_at DESC
        LIMIT 1
      ) vcr ON TRUE
      LEFT JOIN users u ON b.user_id = u.id
      LEFT JOIN users u2 ON v.user_id = u2.id
      WHERE ${whereClause}
      ORDER BY a.created_at DESC`,
      queryParams
    );

    const list = rows.map((r) => ({
      assessmentId: r.assessmentId,
      type: r.type,
      status: r.status,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      expiryAt: r.expiryAt ?? null,
      organizationId: r.organizationId,
      organizationName: r.organizationName ?? null,
      completedByUserId:
        r.type === "cots_vendor"
          ? (r.vendorCompletedByUserId ?? null)
          : (r.completedByUserId ?? null),
      completedByUserEmail:
        r.type === "cots_vendor"
          ? (r.vendorCompletedByUserEmail ?? null)
          : (r.completedByUserEmail ?? null),
      completedByUserFirstName:
        r.type === "cots_vendor"
          ? (r.vendorCompletedByUserFirstName ?? null)
          : (r.completedByUserFirstName ?? null),
      completedByUserLastName:
        r.type === "cots_vendor"
          ? (r.vendorCompletedByUserLastName ?? null)
          : (r.completedByUserLastName ?? null),
      completedByUserName:
        r.type === "cots_vendor"
          ? (r.vendorCompletedByUserName ?? null)
          : (r.completedByUserName ?? null),
      industrySector: r.industrySector ?? null,
      businessPainPoint: r.businessPainPoint ?? null,
      expectedOutcomes: r.expectedOutcomes ?? null,
      owningDepartment: r.owningDepartment ?? null,
      budgetRange: r.budgetRange ?? null,
      targetTimeline: r.targetTimeline ?? null,
      criticality: r.criticality ?? null,
      vendorName: r.vendorName ?? null,
      productName:
        r.type === "cots_vendor"
          ? (r.attestationProductName ?? r.productName ?? null)
          : (r.productName ?? null),
      requirementGaps: r.requirementGaps ?? null,
      integrationSystems: r.integrationSystems ?? null,
      integrationSystemsOther: r.integrationSystemsOther ?? null,
      techStack: r.techStack ?? null,
      digitalMaturityLevel: r.digitalMaturityLevel ?? null,
      dataGovernanceMaturity: r.dataGovernanceMaturity ?? null,
      aiGovernanceBoard: r.aiGovernanceBoard ?? null,
      aiEthicsPolicy: r.aiEthicsPolicy ?? null,
      implementationTeamComposition: r.implementationTeamComposition ?? null,
      dataSensitivity: r.dataSensitivity ?? null,
      regulatoryRequirements: r.regulatoryRequirements ?? null,
      riskAppetite: r.riskAppetite ?? null,
      decisionStakes: r.decisionStakes ?? null,
      impactedStakeholders: r.impactedStakeholders ?? null,
      vendorValidationApproach: r.vendorValidationApproach ?? null,
      vendorSecurityPosture: r.vendorSecurityPosture ?? null,
      vendorCertifications: r.vendorCertifications ?? null,
      pilotRolloutPlan: r.pilotRolloutPlan ?? null,
      rollbackCapability: r.rollbackCapability ?? null,
      changeManagementPlan: r.changeManagementPlan ?? null,
      monitoringDataAvailable: r.monitoringDataAvailable ?? null,
      auditLogsAvailable: r.auditLogsAvailable ?? null,
      testingResultsAvailable: r.testingResultsAvailable ?? null,
      identifiedRisks: r.identifiedRisks ?? null,
      riskDomainScores: r.riskDomainScores ?? null,
      contextualMultipliers: r.contextualMultipliers ?? null,
      riskMitigation: r.riskMitigation ?? null,
      riskMitigationMappingIds: r.riskMitigationMappingIds ?? null,
      cotsCreatedAt: r.cotsCreatedAt ?? null,
      cotsUpdatedAt: r.cotsUpdatedAt ?? null,
      // Vendor COTS: linked attestation expiry (when attestation expires, assessment is archived too)
      attestationExpiryAt: r.attestationExpiryAt instanceof Date ? r.attestationExpiryAt.toISOString() : (r.attestationExpiryAt != null ? String(r.attestationExpiryAt) : null),
      // Vendor COTS fields (populated when type === "cots_vendor")
      vendorAttestationId: r.vendorAttestationId ?? null,
      customerOrganizationName: r.customerOrganizationName ?? null,
      customerSector: r.customerSector ?? null,
      primaryPainPoint: r.primaryPainPoint ?? null,
      vendorExpectedOutcomes: r.vendorExpectedOutcomes ?? null,
      customerBudgetRange: r.customerBudgetRange ?? null,
      implementationTimeline: r.implementationTimeline ?? null,
      productFeatures: r.productFeatures ?? null,
      implementationApproach: r.implementationApproach ?? null,
      customizationLevel: r.customizationLevel ?? null,
      integrationComplexity: r.integrationComplexity ?? null,
      vendorRegulatoryRequirements: r.vendorRegulatoryRequirements ?? null,
      regulatoryRequirementsOther: r.regulatoryRequirementsOther ?? null,
      vendorDataSensitivity: r.vendorDataSensitivity ?? null,
      customerRiskTolerance: r.customerRiskTolerance ?? null,
      alternativesConsidered: r.alternativesConsidered ?? null,
      keyAdvantages: r.keyAdvantages ?? null,
      customerSpecificRisks: r.customerSpecificRisks ?? null,
      customerSpecificRisksOther: r.customerSpecificRisksOther ?? null,
      vendorIdentifiedRisks: r.vendorIdentifiedRisks ?? null,
      vendorRiskDomainScores: r.vendorRiskDomainScores ?? null,
      vendorContextualMultipliers: r.vendorContextualMultipliers ?? null,
      vendorRiskMitigation: r.vendorRiskMitigation ?? null,
      vendorCotsCreatedAt: r.vendorCotsCreatedAt ?? null,
      vendorCotsUpdatedAt: r.vendorCotsUpdatedAt ?? null,
      reportRiskScore:
        r.reportRiskScore != null && Number.isFinite(Number(r.reportRiskScore))
          ? Number(r.reportRiskScore)
          : null,
    }));

    return res.status(200).json({
      message: "Assessments fetched successfully",
      data: { assessments: list, organizationId: isSystemAdmin ? undefined : orgIdStr },
    });
  } catch (error) {
    const err = error as Error & { code?: string; detail?: string; hint?: string; cause?: unknown };
    const pgErr = err.cause as { code?: string; detail?: string } | undefined;
    const code = err.code ?? pgErr?.code;
    const detail = err.detail ?? pgErr?.detail;
    console.error("listAssessmentsByOrganization: Failed query:", err.message);
    if (detail) console.error("listAssessmentsByOrganization: Detail:", detail);
    if (code) console.error("listAssessmentsByOrganization: Code:", code);
    const isColumnMissing = err.message?.includes("does not exist") || code === "42703";
    return res.status(500).json({
      message: "Internal server error",
      ...(process.env.NODE_ENV !== "production" && { code, detail, rawMessage: err.message }),
      hint: isColumnMissing
        ? "A table column may be missing. From backend folder run: node migrations/run-migration-0024.js then node migrations/run-migration-0026.js"
        : undefined,
    });
  }
};

export default listAssessmentsByOrganization;
