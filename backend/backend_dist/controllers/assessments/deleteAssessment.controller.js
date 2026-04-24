import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { assessments } from "../../schema/assessments/assessments.js";
import { cotsBuyerAssessments } from "../../schema/assessments/cotsBuyerAssessments.js";
import { cotsVendorAssessments } from "../../schema/assessments/cotsVendorAssessments.js";
import { eq, and } from "drizzle-orm";
/** DELETE /assessments/:id - delete draft or expired (same org). Permanently removes assessment and its COTS row. */
const deleteAssessment = async (req, res) => {
    try {
        const decoded = req.user;
        const userId = decoded?.id;
        if (userId == null)
            return res.status(401).json({ message: "User not found from token" });
        const id = req.params.id;
        if (!id)
            return res.status(400).json({ message: "Assessment ID required" });
        const [user] = await db.select().from(usersTable).where(eq(usersTable.id, Number(userId))).limit(1);
        if (!user)
            return res.status(404).json({ message: "User not found" });
        const orgId = String(user.organization_id ?? "").trim();
        if (!orgId)
            return res.status(400).json({ message: "User has no organization" });
        const [row] = await db
            .select({
            id: assessments.id,
            status: assessments.status,
            type: assessments.type,
            expiry_at: assessments.expiry_at,
        })
            .from(assessments)
            .where(and(eq(assessments.id, id), eq(assessments.organization_id, orgId)))
            .limit(1);
        if (!row)
            return res.status(404).json({ message: "Assessment not found" });
        const status = String(row.status ?? "").toLowerCase();
        const expiryAt = row.expiry_at;
        const isExpired = expiryAt != null &&
            (() => {
                try {
                    const d = new Date(expiryAt);
                    return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
                }
                catch {
                    return false;
                }
            })();
        const canDelete = status === "draft" || isExpired;
        if (!canDelete) {
            return res.status(403).json({
                message: "Only draft or expired assessments can be deleted.",
            });
        }
        const assessmentType = String(row.type ?? "");
        await db.transaction(async (tx) => {
            if (assessmentType === "cots_vendor") {
                await tx.delete(cotsVendorAssessments).where(eq(cotsVendorAssessments.assessment_id, id));
            }
            else if (assessmentType === "cots_buyer") {
                await tx.delete(cotsBuyerAssessments).where(eq(cotsBuyerAssessments.assessment_id, id));
            }
            await tx.delete(assessments).where(eq(assessments.id, id));
        });
        return res.status(200).json({ message: "Assessment deleted" });
    }
    catch (error) {
        console.error("deleteAssessment:", error instanceof Error ? error.message : String(error));
        return res.status(500).json({ message: "Internal server error" });
    }
};
export default deleteAssessment;
