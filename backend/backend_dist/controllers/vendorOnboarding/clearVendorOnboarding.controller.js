import { db } from "../../database/db.js";
import { vendors } from "../../schema/schema.js";
import { eq } from "drizzle-orm";
/**
 * POST /onboarding/clear-vendor
 * Delete vendor_onboarding row for the current user's organization.
 * Call when user had chosen vendor then goes back and selects buyer (onboardingAccess required).
 */
export default async function clearVendorOnboarding(req, res) {
    try {
        const user = req.onboardingUser;
        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }
        const organizationId = String(user.organization_id ?? "").trim();
        if (!organizationId) {
            return res.status(400).json({ error: "Organization ID is required" });
        }
        await db.delete(vendors).where(eq(vendors.organizationId, organizationId));
        res.status(200).json({ success: true, message: "Vendor onboarding data cleared" });
    }
    catch (error) {
        console.error("clearVendorOnboarding error:", error);
        res.status(500).json({ error: "Failed to clear vendor onboarding data" });
    }
}
