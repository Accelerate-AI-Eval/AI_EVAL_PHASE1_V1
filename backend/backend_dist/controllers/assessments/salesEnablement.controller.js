import { eq, and } from "drizzle-orm";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { customerRiskAssessmentReports } from "../../schema/assessments/customerRiskAssessmentReports.js";
import { generateSalesEnablement } from "../agents/salesEnablementAgent.js";
/**
 * POST /assessments/salesEnablement
 * Body: { assessmentId: string, type?: "swot" | "battlecard" }
 * Fetches the complete customer risk report for the given assessment.
 * When type is "swot" only SWOT analysis is generated; when "battlecard" only Battle Card; when omitted, both (legacy).
 */
const salesEnablement = async (req, res) => {
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
        const type = req.body?.type === "swot" || req.body?.type === "battlecard"
            ? req.body.type
            : "both";
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
                message: "No complete report found for this assessment",
            });
            return;
        }
        const reportJson = reportRow.report;
        const result = await generateSalesEnablement(reportJson, type);
        if (!result) {
            res.status(500).json({
                success: false,
                message: type === "swot"
                    ? "Failed to generate SWOT analysis"
                    : type === "battlecard"
                        ? "Failed to generate Battle Card"
                        : "Failed to generate SWOT and Battle Card",
            });
            return;
        }
        const data = {};
        if (type === "swot" || type === "both")
            data.swot = result.swot;
        if (type === "battlecard" || type === "both")
            data.battleCard = result.battleCard;
        res.status(200).json({
            success: true,
            data,
        });
    }
    catch (error) {
        console.error("salesEnablement controller error:", error);
        res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : "Failed to generate sales enablement",
        });
    }
};
export default salesEnablement;
