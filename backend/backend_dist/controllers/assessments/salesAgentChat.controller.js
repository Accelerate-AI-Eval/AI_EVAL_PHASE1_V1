import { eq, and } from "drizzle-orm";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { customerRiskAssessmentReports } from "../../schema/assessments/customerRiskAssessmentReports.js";
import { answerSalesQuestion } from "../agents/salesEnablementAgent.js";
/**
 * POST /salesEnablement/chat
 * Body: { assessmentId: string, question: string }
 * Answers the user's question about the selected assessment using the complete report (LLM).
 */
const salesAgentChat = async (req, res) => {
    try {
        const payload = req.user;
        const userId = payload?.id;
        if (userId == null) {
            res.status(401).json({ success: false, message: "User not authenticated" });
            return;
        }
        const assessmentId = typeof req.body?.assessmentId === "string" ? req.body.assessmentId.trim() : null;
        const question = typeof req.body?.question === "string" ? req.body.question.trim() : "";
        if (!assessmentId) {
            res.status(400).json({ success: false, message: "assessmentId is required" });
            return;
        }
        if (!question) {
            res.status(400).json({ success: false, message: "question is required" });
            return;
        }
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
        const answer = await answerSalesQuestion(reportJson, question);
        if (answer == null) {
            res.status(500).json({
                success: false,
                message: "Failed to generate answer",
            });
            return;
        }
        res.status(200).json({
            success: true,
            data: { answer },
        });
    }
    catch (error) {
        console.error("salesAgentChat controller error:", error);
        res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : "Failed to answer question",
        });
    }
};
export default salesAgentChat;
