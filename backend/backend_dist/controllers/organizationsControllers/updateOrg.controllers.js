import { db } from "../../database/db.js";
import { createOrganization, organizationEditLogs } from "../../schema/schema.js";
import { eq } from "drizzle-orm";
const updateOrganization = async (req, res) => {
    const data = req.body;
    const idParam = req.params?.id;
    const rawId = Array.isArray(idParam) ? idParam[0] : idParam;
    const orgId = rawId != null && String(rawId).trim() !== "" ? Number(String(rawId).trim()) : NaN;
    if (!Number.isInteger(orgId) || orgId < 1) {
        return res.status(400).json({
            success: false,
            message: "Invalid organization id",
        });
    }
    const organizationName = typeof data.isOrganization === "string" ? data.isOrganization.trim() : "";
    const organizationStatus = typeof data.isStatus === "string" ? data.isStatus.trim().toLowerCase() : "";
    const reason = typeof data.isReason === "string" ? data.isReason.trim() : "";
    if (!organizationName) {
        return res.status(400).json({
            success: false,
            message: "Organization name is required",
        });
    }
    if (organizationStatus !== "active" && organizationStatus !== "inactive") {
        return res.status(400).json({
            success: false,
            message: "Status must be active or inactive",
        });
    }
    const userIdFromBody = data.userId != null && String(data.userId).trim() !== "" ? String(data.userId).trim() : null;
    const userIdFromToken = req.user?.id;
    const updatedBy = userIdFromBody ?? (userIdFromToken != null ? String(userIdFromToken) : null);
    if (!updatedBy) {
        return res.status(400).json({
            success: false,
            message: "User ID is required for audit log. Please log in again.",
        });
    }
    try {
        await db
            .update(createOrganization)
            .set({
            organizationName,
            organizationStatus: organizationStatus,
        })
            .where(eq(createOrganization.id, orgId));
        await db.insert(organizationEditLogs).values({
            organizationId: String(orgId),
            organizationName,
            organizationStatus: organizationStatus,
            updated_by: updatedBy,
            reason: reason || "—",
        });
        return res.status(200).json({
            success: true,
            message: "Organization updated successfully",
        });
    }
    catch (error) {
        console.error("updateOrganization error:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to update organization",
        });
    }
};
export default updateOrganization;
