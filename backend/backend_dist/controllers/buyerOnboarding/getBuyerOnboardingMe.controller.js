import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { buyerOnboarding } from "../../schema/buyer/addBuyer.schema.js";
import { eq } from "drizzle-orm";
/** GET /buyerOnboarding/me - returns buyer onboarding for the authenticated user's organization */
const getBuyerOnboardingMe = async (req, res) => {
    try {
        const decoded = req.user;
        const userId = decoded?.id;
        if (userId == null) {
            return res.status(401).json({ message: "User not found from token" });
        }
        const [user] = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.id, Number(userId)))
            .limit(1);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const orgId = user.organization_id;
        const orgIdStr = orgId != null ? String(orgId).trim() : "";
        if (!orgIdStr) {
            return res.status(400).json({ message: "User has no organization" });
        }
        const [buyer] = await db
            .select()
            .from(buyerOnboarding)
            .where(eq(buyerOnboarding.organizationId, orgIdStr))
            .limit(1);
        return res.status(200).json({
            message: "Buyer onboarding data fetched successfully",
            data: {
                buyer: buyer ?? null,
                organizationId: orgIdStr,
            },
        });
    }
    catch (error) {
        console.error("getBuyerOnboardingMe:", error instanceof Error ? error.message : String(error));
        return res.status(500).json({ message: "Internal server error" });
    }
};
export default getBuyerOnboardingMe;
