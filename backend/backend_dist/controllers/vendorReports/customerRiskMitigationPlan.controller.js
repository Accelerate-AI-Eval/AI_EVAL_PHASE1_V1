import { eq, and } from "drizzle-orm";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { customerRiskAssessmentReports } from "../../schema/assessments/customerRiskAssessmentReports.js";
import { cotsVendorAssessments } from "../../schema/assessments/cotsVendorAssessments.js";
import { vendorSelfAttestations } from "../../schema/assessments/vendorSelfAttestations.js";
import { generalReports } from "../../schema/assessments/generalReports.js";
import { generateCustomerRiskMitigationPlan } from "../agents/customerRiskMitigationPlanAgent.js";
function toStr(v) {
    if (v == null)
        return "";
    if (Array.isArray(v))
        return v.map(toStr).join("; ");
    if (typeof v === "object")
        return JSON.stringify(v);
    return String(v).trim();
}
/** Build a text summary of attestation for the LLM from vendor_self_attestations row. */
function buildAttestationSummary(row) {
    const lines = [
        `Product name: ${toStr(row.product_name)}`,
        `Company: ${toStr(row.company_description)}`,
        `Website: ${toStr(row.company_website)}`,
        `Vendor type: ${toStr(row.vendor_type)}`,
        `Target industries: ${toStr(row.target_industries)}`,
        `Headquarters: ${toStr(row.headquarter_location)}`,
        `Regions: ${toStr(row.operate_regions)}`,
        `Security/compliance certificates: ${toStr(row.security_compliance_certificates)}`,
        `Regulatory/compliance material: ${toStr(row.regulatorycompliance_cert_material)}`,
        `Data residency: ${toStr(row.data_residency_options)}`,
        `Deployment scale: ${toStr(row.deployment_scale)}`,
        `SLA: ${toStr(row.sla_guarantee)}`,
        `Incident response: ${toStr(row.incident_response_plan)}`,
    ];
    return lines.filter((s) => s.length > 0).join("\n");
}
const REPORT_TYPE_CUSTOMER_RISK_MITIGATION = "Customer Risk Mitigation Plan";
/**
 * POST /customerRiskMitigationPlan
 * Body: { assessmentId: string, assessmentLabel?: string }
 * Fetches customer risk report + vendor attestation, generates Customer Risk Mitigation Plan (sections 22–27), saves to general_reports.
 */
const customerRiskMitigationPlan = async (req, res) => {
    try {
        const payload = req.user;
        const userId = payload?.id;
        if (userId == null) {
            res.status(401).json({ success: false, message: "User not authenticated" });
            return;
        }
        const assessmentId = typeof req.body?.assessmentId === "string" ? req.body.assessmentId.trim() : null;
        if (!assessmentId) {
            res.status(400).json({ success: false, message: "assessmentId is required" });
            return;
        }
        const assessmentLabel = typeof req.body?.assessmentLabel === "string" ? req.body.assessmentLabel.trim() || null : null;
        const [user] = await db
            .select({ organization_id: usersTable.organization_id })
            .from(usersTable)
            .where(eq(usersTable.id, Number(userId)))
            .limit(1);
        const orgId = user?.organization_id != null ? String(user.organization_id).trim() : "";
        if (!orgId) {
            res.status(403).json({ success: false, message: "User has no organization" });
            return;
        }
        const [reportRow] = await db
            .select({
            id: customerRiskAssessmentReports.id,
            report: customerRiskAssessmentReports.report,
        })
            .from(customerRiskAssessmentReports)
            .where(and(eq(customerRiskAssessmentReports.assessment_id, assessmentId), eq(customerRiskAssessmentReports.organization_id, orgId)))
            .limit(1);
        if (!reportRow?.report || typeof reportRow.report !== "object") {
            res.status(404).json({
                success: false,
                message: "No analysis report found for this assessment",
            });
            return;
        }
        const [vendorRow] = await db
            .select({ vendor_attestation_id: cotsVendorAssessments.vendor_attestation_id })
            .from(cotsVendorAssessments)
            .where(eq(cotsVendorAssessments.assessment_id, assessmentId))
            .limit(1);
        let attestationSummary = "No vendor attestation data available for this assessment.";
        if (vendorRow?.vendor_attestation_id) {
            const [attestRow] = await db
                .select()
                .from(vendorSelfAttestations)
                .where(eq(vendorSelfAttestations.id, vendorRow.vendor_attestation_id))
                .limit(1);
            if (attestRow && typeof attestRow === "object") {
                attestationSummary = buildAttestationSummary(attestRow);
            }
        }
        const reportJson = reportRow.report;
        const content = await generateCustomerRiskMitigationPlan(reportJson, attestationSummary);
        const [inserted] = await db
            .insert(generalReports)
            .values({
            assessment_id: assessmentId,
            organization_id: orgId,
            report_type: REPORT_TYPE_CUSTOMER_RISK_MITIGATION,
            content,
            assessment_label: assessmentLabel,
            created_by: userId,
        })
            .returning();
        if (!inserted) {
            res.status(500).json({ success: false, message: "Failed to save report" });
            return;
        }
        const created_at = inserted.created_at;
        const generatedAt = created_at instanceof Date ? created_at.toISOString() : String(created_at);
        res.status(200).json({
            success: true,
            data: {
                brief: content,
                report: {
                    id: String(inserted.id),
                    assessmentId: String(inserted.assessment_id),
                    assessmentLabel: inserted.assessment_label ?? undefined,
                    reportType: inserted.report_type,
                    generatedAt,
                    briefContent: inserted.content ?? undefined,
                    createdBy: inserted.created_by,
                },
            },
        });
    }
    catch (err) {
        console.error("customerRiskMitigationPlan error:", err);
        res.status(500).json({
            success: false,
            message: err instanceof Error ? err.message : "Failed to generate Customer Risk Mitigation Plan",
        });
    }
};
export default customerRiskMitigationPlan;
