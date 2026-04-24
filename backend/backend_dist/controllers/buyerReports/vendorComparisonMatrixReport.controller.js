import { eq, and } from "drizzle-orm";
import { db, pool } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { assessments } from "../../schema/assessments/assessments.js";
import { cotsBuyerAssessments } from "../../schema/assessments/cotsBuyerAssessments.js";
import { customerRiskAssessmentReports } from "../../schema/assessments/customerRiskAssessmentReports.js";
import { generalReports } from "../../schema/assessments/generalReports.js";
import { expireSubmittedAssessmentsAndArchiveBuyerReports } from "../../services/expireAndArchiveCotsBuyerAssessments.js";
import { hasCotsBuyerArchivedReportColumn } from "../../services/cotsBuyerArchivedColumn.js";
import { enrichStoredBuyerVendorReport, regulatorySnippetFromJson, } from "../agents/buyerVendorRiskReportAgent.js";
import { generateVendorComparisonMatrixFromCompleteReport } from "../agents/vendorComparisonMatrixReportAgent.js";
const REPORT_TYPE = "Vendor Comparison Matrix";
function toExtraContextSnippet(report) {
    if (report == null)
        return "";
    if (typeof report === "string")
        return report.slice(0, 8000);
    try {
        return JSON.stringify(report, null, 2).slice(0, 8000);
    }
    catch {
        return String(report).slice(0, 8000);
    }
}
/**
 * POST /vendorComparisonMatrixReport
 * Body: { assessmentId: string, assessmentLabel?: string }
 * Loads the complete buyer vendor risk report for the assessment, optionally merges customer risk analysis report,
 * generates matrix sections 34–38 via LLM, stores JSON in general_reports (Assessment Analysis tab).
 */
const vendorComparisonMatrixReport = async (req, res) => {
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
        await expireSubmittedAssessmentsAndArchiveBuyerReports(pool);
        const [aRow] = await db
            .select({ id: assessments.id, type: assessments.type })
            .from(assessments)
            .where(and(eq(assessments.id, assessmentId), eq(assessments.organization_id, orgId)))
            .limit(1);
        if (!aRow || String(aRow.type ?? "").toLowerCase() !== "cots_buyer") {
            res.status(404).json({
                success: false,
                message: "Buyer assessment not found or access denied",
            });
            return;
        }
        const whereCots = eq(cotsBuyerAssessments.assessment_id, assessmentId);
        const hasArchiveCol = await hasCotsBuyerArchivedReportColumn(pool);
        const [cotsRow] = hasArchiveCol
            ? await db
                .select({
                report: cotsBuyerAssessments.vendor_risk_assessment_report,
                archived_report: cotsBuyerAssessments.archived_vendor_risk_assessment_report,
                vendor_name: cotsBuyerAssessments.vendor_name,
                specific_product: cotsBuyerAssessments.specific_product,
                assessment_status: assessments.status,
                criticality: cotsBuyerAssessments.critical_of_ai_solution,
                risk_appetite: cotsBuyerAssessments.risk_appetite,
                data_sensitivity: cotsBuyerAssessments.data_sensitivity_level,
                governance_maturity: cotsBuyerAssessments.governance_maturity,
                target_timeline: cotsBuyerAssessments.target_timeline,
                regulatory_requirments: cotsBuyerAssessments.regulatory_requirments,
            })
                .from(cotsBuyerAssessments)
                .innerJoin(assessments, eq(cotsBuyerAssessments.assessment_id, assessments.id))
                .where(whereCots)
                .limit(1)
            : await db
                .select({
                report: cotsBuyerAssessments.vendor_risk_assessment_report,
                vendor_name: cotsBuyerAssessments.vendor_name,
                specific_product: cotsBuyerAssessments.specific_product,
                assessment_status: assessments.status,
                criticality: cotsBuyerAssessments.critical_of_ai_solution,
                risk_appetite: cotsBuyerAssessments.risk_appetite,
                data_sensitivity: cotsBuyerAssessments.data_sensitivity_level,
                governance_maturity: cotsBuyerAssessments.governance_maturity,
                target_timeline: cotsBuyerAssessments.target_timeline,
                regulatory_requirments: cotsBuyerAssessments.regulatory_requirments,
            })
                .from(cotsBuyerAssessments)
                .innerJoin(assessments, eq(cotsBuyerAssessments.assessment_id, assessments.id))
                .where(whereCots)
                .limit(1);
        if (!cotsRow) {
            res.status(404).json({ success: false, message: "Buyer assessment data not found" });
            return;
        }
        const archived = String(cotsRow.assessment_status ?? "").toLowerCase() === "expired";
        const rawReport = hasArchiveCol && archived
            ? cotsRow.archived_report
            : cotsRow.report;
        if (rawReport == null || typeof rawReport !== "object") {
            res.status(404).json({
                success: false,
                message: "Complete vendor report not found for this assessment. Open Complete Reports after submit, or wait for report generation to finish.",
            });
            return;
        }
        const vendorName = cotsRow.vendor_name ?? "";
        const productName = cotsRow.specific_product ?? "";
        const completeEnriched = enrichStoredBuyerVendorReport(rawReport, vendorName, productName, {
            criticality: cotsRow.criticality,
            riskAppetite: cotsRow.risk_appetite,
            dataSensitivity: cotsRow.data_sensitivity,
            governanceMaturity: cotsRow.governance_maturity,
            targetTimeline: cotsRow.target_timeline,
            regulatorySnippet: regulatorySnippetFromJson(cotsRow.regulatory_requirments),
        });
        const [crr] = await db
            .select({ report: customerRiskAssessmentReports.report })
            .from(customerRiskAssessmentReports)
            .where(and(eq(customerRiskAssessmentReports.assessment_id, assessmentId), eq(customerRiskAssessmentReports.organization_id, orgId)))
            .limit(1);
        const extraContext = crr?.report != null ? toExtraContextSnippet(crr.report) : "";
        const matrixPayload = await generateVendorComparisonMatrixFromCompleteReport(completeEnriched, extraContext);
        const stored = {
            version: 1,
            generatedAt: new Date().toISOString(),
            assessmentId,
            vendorName,
            productName,
            ...matrixPayload,
        };
        const [inserted] = await db
            .insert(generalReports)
            .values({
            assessment_id: assessmentId,
            organization_id: orgId,
            report_type: REPORT_TYPE,
            content: JSON.stringify(stored),
            assessment_label: assessmentLabel,
            created_by: Number(userId),
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
                matrix: matrixPayload,
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
        console.error("vendorComparisonMatrixReport error:", err);
        res.status(500).json({
            success: false,
            message: err instanceof Error ? err.message : "Failed to generate Vendor Comparison Matrix",
        });
    }
};
export default vendorComparisonMatrixReport;
