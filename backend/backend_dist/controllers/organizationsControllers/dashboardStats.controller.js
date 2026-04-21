import { count } from "drizzle-orm";
import { db } from "../../database/db.js";
import { createOrganization } from "../../schema/organizations/createOrganization.js";
import { vendorOnboarding } from "../../schema/vendor/addVendor.schema.js";
import { buyerOnboarding } from "../../schema/buyer/addBuyer.schema.js";
import { vendorSelfAttestations } from "../../schema/assessments/vendorSelfAttestations.js";
/**
 * GET /dashboardStats - returns counts for system admin dashboard.
 * Total organizations, total vendors (vendor onboarding), total buyers (buyer onboarding), total attestations (vendor self-attestations).
 */
const getDashboardStats = async (req, res) => {
    try {
        const [orgResult] = await db
            .select({ total: count() })
            .from(createOrganization);
        const [vendorResult] = await db
            .select({ total: count() })
            .from(vendorOnboarding);
        const [buyerResult] = await db
            .select({ total: count() })
            .from(buyerOnboarding);
        const [attestationResult] = await db
            .select({ total: count() })
            .from(vendorSelfAttestations);
        res.status(200).json({
            message: "Dashboard stats fetched successfully",
            data: {
                totalOrganizations: Number(orgResult?.total ?? 0),
                totalVendors: Number(vendorResult?.total ?? 0),
                totalBuyers: Number(buyerResult?.total ?? 0),
                totalAttestations: Number(attestationResult?.total ?? 0),
            },
        });
    }
    catch (error) {
        console.error("Error in getDashboardStats:", error instanceof Error ? error.message : String(error));
        res.status(500).json({ error: "Internal server error" });
    }
};
export default getDashboardStats;
