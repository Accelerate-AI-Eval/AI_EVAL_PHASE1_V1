import { db } from "../../database/db.js";
import { buyersTable } from "../../schema/schema.js";
import { eq } from "drizzle-orm";
/**
 * POST /onboarding/clear-buyer
 * Delete buyer_onboarding row for the current user's organization.
 * Call when user had chosen buyer then goes back and selects vendor (onboardingAccess required).
 */
export default async function clearBuyerOnboarding(req, res) {
    try {
        const user = req.onboardingUser;
        if (!user) {
            return res.status(401).json({ error: "User not found" });
        }
        const organizationId = String(user.organization_id ?? "").trim();
        if (!organizationId) {
            return res.status(400).json({ error: "Organization ID is required" });
        }
        await db.delete(buyersTable).where(eq(buyersTable.organizationId, organizationId));
        res.status(200).json({ success: true, message: "Buyer onboarding data cleared" });
    }
    catch (error) {
        console.error("clearBuyerOnboarding error:", error);
        res.status(500).json({ error: "Failed to clear buyer onboarding data" });
    }
}
