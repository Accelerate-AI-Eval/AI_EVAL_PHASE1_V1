import { db } from "../../database/db.js";
import { createOrganization } from "../../schema/organizations/createOrganization.js";
import { vendorSelfAttestations } from "../../schema/assessments/vendorSelfAttestations.js";
import { and, eq, or } from "drizzle-orm";
/** Map one attestation row to API shape (same as fetchVendorSelfAttestation). */
function mapAttestationRow(attestRow) {
    const raw = String(attestRow.status ?? "").toUpperCase();
    const rowStatus = raw === "DRAFT" ? "DRAFT" : "COMPLETED";
    return {
        id: attestRow.id,
        status: rowStatus,
        created_at: attestRow.created_at ?? undefined,
        updated_at: attestRow.updated_at ?? undefined,
        product_name: attestRow.product_name ?? undefined,
        visible_to_buyer: attestRow.visible_to_buyer === true || attestRow.visible_to_buyer === 1,
        visible_ai_governance: attestRow.visible_ai_governance === true,
        visible_security_posture: attestRow.visible_security_posture === true,
        visible_data_privacy: attestRow.visible_data_privacy === true,
        visible_compliance: attestRow.visible_compliance === true,
        visible_model_risk: attestRow.visible_model_risk === true,
        visible_data_practices: attestRow.visible_data_practices === true,
        visible_compliance_certifications: attestRow.visible_compliance_certifications === true,
        visible_operations_support: attestRow.visible_operations_support === true,
        visible_vendor_management: attestRow.visible_vendor_management === true,
        purchase_decision_makers: attestRow.purchase_decisions_by ?? undefined,
        pain_points_solved: attestRow.pain_points ?? undefined,
        alternatives_considered: attestRow.alternatives_consider ?? undefined,
        unique_value_proposition: attestRow.unique_solution ?? undefined,
        typical_customer_roi: attestRow.roi_value_metrics ?? undefined,
        ai_capabilities: attestRow.product_capabilities ?? undefined,
        ai_model_types: attestRow.ai_models_usage ?? undefined,
        model_transparency: attestRow.ai_model_transparency ?? undefined,
        decision_autonomy: attestRow.ai_autonomy_level ?? undefined,
        security_certifications: attestRow.security_compliance_certificates ?? undefined,
        assessment_completion_level: attestRow.assessment_feedback ?? undefined,
        pii_handling: attestRow.pii_information ?? undefined,
        data_residency_options: attestRow.data_residency_options ?? undefined,
        data_retention_policy: attestRow.data_retention_policy ?? undefined,
        bias_testing_approach: attestRow.bias_ai ?? undefined,
        adversarial_security_testing: attestRow.security_testing ?? undefined,
        human_oversight: attestRow.human_oversight ?? undefined,
        training_data_documentation: attestRow.training_data_document ?? undefined,
        uptime_sla: attestRow.sla_guarantee ?? undefined,
        incident_response_plan: attestRow.incident_response_plan ?? undefined,
        rollback_capability: attestRow.rollback_deployment_issues ?? undefined,
        hosting_deployment: attestRow.solution_hosted ?? undefined,
        deployment_scale: attestRow.deployment_scale ?? undefined,
        product_stage: attestRow.stage_product ?? undefined,
        interaction_data_available: attestRow.available_usage_data ?? undefined,
        audit_logs_available: attestRow.audit_logs ?? undefined,
        testing_results_available: attestRow.test_results ?? undefined,
        document_uploads: attestRow.document_uploads ?? undefined,
        compliance_document_expiries: attestRow.compliance_document_expiries ?? undefined,
    };
}
function companyProfileFromAttestationRow(row) {
    const sectorRaw = row.target_industries;
    let sector = {};
    if (sectorRaw != null && typeof sectorRaw === "object" && !Array.isArray(sectorRaw)) {
        sector = sectorRaw;
    }
    else if (typeof sectorRaw === "string" && sectorRaw.trim()) {
        try {
            const p = JSON.parse(sectorRaw);
            sector = typeof p === "object" && p !== null ? p : {};
        }
        catch {
            sector = {};
        }
    }
    const opReg = row.operate_regions;
    const operatingRegions = Array.isArray(opReg) ? opReg : (opReg != null && typeof opReg === "object" ? opReg : []);
    return {
        vendorType: row.vendor_type ?? "",
        sector,
        vendorMaturity: row.company_stage ?? "",
        companyWebsite: row.company_website ?? "",
        companyDescription: row.company_description ?? "",
        employeeCount: row.no_of_employees ?? "",
        yearFounded: row.year_founded ?? null,
        headquartersLocation: row.headquarter_location ?? "",
        operatingRegions,
    };
}
/**
 * GET /orgAttestationPreview/:orgId/:attestationId - returns full attestation + companyProfile for preview.
 * Used by organization page to show attestation preview modal (system admin viewing org's attestations).
 */
const getOrgAttestationPreview = async (req, res) => {
    try {
        const orgIdParam = String(req.params.orgId ?? "").trim();
        const attestationId = String(req.params.attestationId ?? "").trim();
        if (!orgIdParam || !attestationId) {
            return res.status(400).json({ message: "Organization ID and attestation ID are required" });
        }
        const orgRow = await db
            .select({
            id: createOrganization.id,
            organizationName: createOrganization.organizationName,
        })
            .from(createOrganization)
            .where(eq(createOrganization.id, Number(orgIdParam) || 0))
            .limit(1);
        const orgName = orgRow[0]?.organizationName ?? null;
        const whereClause = orgName
            ? and(eq(vendorSelfAttestations.id, attestationId), or(eq(vendorSelfAttestations.organization_id, orgIdParam), eq(vendorSelfAttestations.organization_id, orgName)))
            : and(eq(vendorSelfAttestations.id, attestationId), eq(vendorSelfAttestations.organization_id, orgIdParam));
        const [one] = await db
            .select()
            .from(vendorSelfAttestations)
            .where(whereClause)
            .limit(1);
        if (!one) {
            return res.status(404).json({
                success: false,
                message: "Attestation not found",
                companyProfile: {},
                attestation: {},
            });
        }
        const oneRow = one;
        const attestation = mapAttestationRow(oneRow);
        const companyProfile = companyProfileFromAttestationRow(oneRow);
        return res.status(200).json({
            success: true,
            message: "Attestation preview fetched successfully",
            companyProfile,
            attestation,
        });
    }
    catch (error) {
        console.error("Error in getOrgAttestationPreview:", error instanceof Error ? error.message : String(error));
        return res.status(500).json({
            success: false,
            message: "Internal server error",
            companyProfile: {},
            attestation: {},
        });
    }
};
export default getOrgAttestationPreview;
