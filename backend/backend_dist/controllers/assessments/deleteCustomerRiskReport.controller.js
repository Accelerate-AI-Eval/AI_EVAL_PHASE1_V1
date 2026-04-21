import { eq, and } from "drizzle-orm";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { customerRiskAssessmentReports } from "../../schema/assessments/customerRiskAssessmentReports.js";
import { assessments } from "../../schema/assessments/assessments.js";
/**
 * DELETE /customerRiskReports/:id
 * Deletes an Analysis Report. Allowed only when the linked assessment is expired.
 * User must belong to the same organization as the report.
 */
const deleteCustomerRiskReport = async (req, res) => {
    try {
        const payload = req.user;
        const userId = payload?.id;
        if (userId == null) {
            res.status(401).json({ success: false, message: "User not authenticated" });
            return;
        }
        const idParam = req.params.id;
        const id = idParam != null && String(idParam).trim() !== "" ? String(idParam).trim() : null;
        if (!id) {
            res.status(400).json({ success: false, message: "Report ID required" });
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
        const [row] = await db
            .select({
            id: customerRiskAssessmentReports.id,
            expiryAt: assessments.expiry_at,
        })
            .from(customerRiskAssessmentReports)
            .innerJoin(assessments, eq(customerRiskAssessmentReports.assessment_id, assessments.id))
            .where(and(eq(customerRiskAssessmentReports.id, id), eq(customerRiskAssessmentReports.organization_id, orgId)))
            .limit(1);
        if (!row) {
            res.status(404).json({ success: false, message: "Report not found" });
            return;
        }
        const expiryAt = row.expiryAt;
        if (expiryAt == null) {
            res.status(403).json({
                success: false,
                message: "Report cannot be deleted because the assessment has not expired",
            });
            return;
        }
        const expiryDate = expiryAt instanceof Date ? new Date(expiryAt.getTime()) : new Date(expiryAt);
        expiryDate.setHours(0, 0, 0, 0);
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        if (!Number.isNaN(expiryDate.getTime()) && expiryDate.getTime() >= todayStart.getTime()) {
            res.status(403).json({
                success: false,
                message: "Report can only be deleted when the related assessment has expired",
            });
            return;
        }
        await db
            .delete(customerRiskAssessmentReports)
            .where(and(eq(customerRiskAssessmentReports.id, id), eq(customerRiskAssessmentReports.organization_id, orgId)));
        res.status(200).json({ success: true, message: "Report deleted" });
    }
    catch (error) {
        console.error("deleteCustomerRiskReport error:", error);
        res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : "Failed to delete report",
        });
    }
};
export default deleteCustomerRiskReport;
