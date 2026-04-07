import type { Request, Response } from "express";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { assessments } from "../../schema/assessments/assessments.js";
import { cotsVendorAssessments } from "../../schema/assessments/cotsVendorAssessments.js";
import { vendorSelfAttestations } from "../../schema/assessments/vendorSelfAttestations.js";
import { eq, and, or } from "drizzle-orm";
import {
  buildVendorCotsOrganizationalPortalInsights,
  deriveBuyerIndustrySegmentForVendorCots,
} from "../../services/orgPortalComplianceInsights.js";

/** GET /vendorCotsAssessment/:id - return one vendor COTS assessment for view/edit. User must belong to same org. */
const getVendorCotsById = async (req: Request, res: Response) => {
  try {
    const decoded = req.user as { id?: number } | undefined;
    const userId = decoded?.id;
    if (userId == null) {
      return res.status(401).json({ message: "User not found from token" });
    }
    const idParam = (req.params as { id?: string }).id;
    const id = idParam != null && String(idParam).trim() !== "" ? String(idParam).trim() : null;
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
      ? and(eq(assessments.id, id), eq(assessments.type, "cots_vendor"))
      : and(eq(assessments.id, id), eq(assessments.organization_id, orgId), eq(assessments.type, "cots_vendor"));

    const rows = await db
      .select({
        assessmentId: assessments.id,
        type: assessments.type,
        status: assessments.status,
        organizationId: assessments.organization_id,
        created_at: assessments.created_at,
        updated_at: assessments.updated_at,
        expiry_at: assessments.expiry_at,
        vendor_attestation_id: cotsVendorAssessments.vendor_attestation_id,
        attestation_product_name: vendorSelfAttestations.product_name,
        customer_organization_name: cotsVendorAssessments.customer_organization_name,
        customer_sector: cotsVendorAssessments.customer_sector,
        primary_pain_point: cotsVendorAssessments.primary_pain_point,
        expected_outcomes: cotsVendorAssessments.expected_outcomes,
        customer_budget_range: cotsVendorAssessments.customer_budget_range,
        implementation_timeline: cotsVendorAssessments.implementation_timeline,
        product_features: cotsVendorAssessments.product_features,
        implementation_approach: cotsVendorAssessments.implementation_approach,
        customization_level: cotsVendorAssessments.customization_level,
        integration_complexity: cotsVendorAssessments.integration_complexity,
        regulatory_requirements: cotsVendorAssessments.regulatory_requirements,
        regulatory_requirements_other: cotsVendorAssessments.regulatory_requirements_other,
        data_sensitivity: cotsVendorAssessments.data_sensitivity,
        customer_risk_tolerance: cotsVendorAssessments.customer_risk_tolerance,
        alternatives_considered: cotsVendorAssessments.alternatives_considered,
        key_advantages: cotsVendorAssessments.key_advantages,
        customer_specific_risks: cotsVendorAssessments.customer_specific_risks,
        customer_specific_risks_other: cotsVendorAssessments.customer_specific_risks_other,
        identified_risks: cotsVendorAssessments.identified_risks,
        risk_domain_scores: cotsVendorAssessments.risk_domain_scores,
        contextual_multipliers: cotsVendorAssessments.contextual_multipliers,
        risk_mitigation: cotsVendorAssessments.risk_mitigation,
        attestation_security_compliance_certificates: vendorSelfAttestations.security_compliance_certificates,
        attestation_document_uploads: vendorSelfAttestations.document_uploads,
        attestation_regulatorycompliance_cert_material: vendorSelfAttestations.regulatorycompliance_cert_material,
        attestation_framework_mapping_rows: vendorSelfAttestations.framework_mapping_rows,
        attestation_compliance_document_expiries: vendorSelfAttestations.compliance_document_expiries,
      })
      .from(assessments)
      .leftJoin(cotsVendorAssessments, eq(assessments.id, cotsVendorAssessments.assessment_id))
      .leftJoin(
        vendorSelfAttestations,
        or(
          eq(cotsVendorAssessments.vendor_attestation_id, vendorSelfAttestations.vendor_self_attestation_id),
          eq(cotsVendorAssessments.vendor_attestation_id, vendorSelfAttestations.id)
        )
      )
      .where(whereCondition)
      .limit(1);

    const r = rows[0];
    if (!r || !r.assessmentId) {
      return res.status(404).json({ message: "Assessment not found" });
    }
    const toJson = (v: unknown) =>
      v != null ? (Array.isArray(v) ? v : typeof v === "object" ? JSON.stringify(v) : String(v)) : "";
    const data: Record<string, unknown> = {
      assessmentId: r.assessmentId,
      type: "cots_vendor",
      status: r.status,
      organizationId: r.organizationId,
      createdAt: (r as { created_at?: unknown }).created_at,
      updatedAt: (r as { updated_at?: unknown }).updated_at,
      expiryAt: (r as { expiry_at?: unknown }).expiry_at,
      selectedProductId: r.vendor_attestation_id ?? "",
      attestationProductName: (r as { attestation_product_name?: string | null }).attestation_product_name ?? "",
      customerOrganizationName: r.customer_organization_name ?? "",
      customerSector: r.customer_sector ?? "",
      primaryPainPoint: r.primary_pain_point ?? "",
      expectedOutcomes: r.expected_outcomes ?? "",
      customerBudgetRange: r.customer_budget_range ?? "",
      implementationTimeline: r.implementation_timeline ?? "",
      productFeatures:
        r.product_features != null
          ? Array.isArray(r.product_features)
            ? r.product_features
            : toJson(r.product_features)
          : "",
      implementationApproach: r.implementation_approach ?? "",
      customizationLevel: r.customization_level ?? "",
      integrationComplexity: r.integration_complexity ?? "",
      regulatoryRequirements:
        r.regulatory_requirements != null
          ? Array.isArray(r.regulatory_requirements)
            ? r.regulatory_requirements
            : toJson(r.regulatory_requirements)
          : "",
      regulatoryRequirementsOther: r.regulatory_requirements_other ?? "",
      dataSensitivity: r.data_sensitivity ?? "",
      customerRiskTolerance: r.customer_risk_tolerance ?? "",
      alternativesConsidered: r.alternatives_considered ?? "",
      keyAdvantages: r.key_advantages ?? "",
      customerSpecificRisks:
        r.customer_specific_risks != null
          ? Array.isArray(r.customer_specific_risks)
            ? r.customer_specific_risks
            : toJson(r.customer_specific_risks)
          : "",
      customerSpecificRisksOther: r.customer_specific_risks_other ?? "",
      identifiedRisks: r.identified_risks ?? "",
      riskDomainScores: r.risk_domain_scores ?? "",
      contextualMultipliers: r.contextual_multipliers ?? "",
      riskMitigation: r.risk_mitigation ?? "",
    };

    const rx = r as typeof r & {
      attestation_security_compliance_certificates?: unknown;
      attestation_document_uploads?: unknown;
      attestation_regulatorycompliance_cert_material?: unknown;
      attestation_framework_mapping_rows?: unknown;
      attestation_compliance_document_expiries?: unknown;
    };
    const q = req.query as { buyerIndustrySegment?: string };
    const segmentForInsights = deriveBuyerIndustrySegmentForVendorCots(
      data.customerSector,
      typeof q?.buyerIndustrySegment === "string" ? q.buyerIndustrySegment : undefined,
    );
    const hasAttestation = rx.vendor_attestation_id != null && String(rx.vendor_attestation_id).trim() !== "";
    const attestationRow = hasAttestation
      ? {
          security_compliance_certificates: rx.attestation_security_compliance_certificates,
          document_uploads: rx.attestation_document_uploads,
          regulatorycompliance_cert_material: rx.attestation_regulatorycompliance_cert_material,
          framework_mapping_rows: rx.attestation_framework_mapping_rows,
          compliance_document_expiries: rx.attestation_compliance_document_expiries,
        }
      : null;
    data.organizationalPortal = buildVendorCotsOrganizationalPortalInsights(data, attestationRow, segmentForInsights);

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("getVendorCotsById:", error instanceof Error ? error.message : String(error));
    return res.status(500).json({ message: "Internal server error" });
  }
};

export default getVendorCotsById;
