import { db } from "../../database/db.js";
import { createOrganization } from "../../schema/organizations/createOrganization.js";
import { buyerOnboarding } from "../../schema/buyer/addBuyer.schema.js";
import { vendorOnboarding } from "../../schema/vendor/addVendor.schema.js";
import { usersTable } from "../../schema/schema.js";
import { eq, or } from "drizzle-orm";
function userDisplayName(u) {
    const name = (u.user_name ?? "").trim();
    if (name)
        return name;
    const first = (u.user_first_name ?? "").trim();
    const last = (u.user_last_name ?? "").trim();
    const full = [first, last].filter(Boolean).join(" ").trim();
    if (full)
        return full;
    return (u.email ?? "").trim() || "—";
}
/** GET /orgOnboarding/:id - returns buyer and vendor onboarding data for the organization.
 *  :id is the organization's numeric id from the organizations table.
 *  Onboarding tables may store organization_id as either this id or the org name, so we match both.
 *  Includes completedBy (user name) and completedAt (updated_at) for each.
 */
const fetchOrgOnboarding = async (req, res) => {
    try {
        const orgIdParam = String(req.params.id ?? "").trim();
        if (!orgIdParam) {
            return res.status(400).json({ message: "Organization ID is required" });
        }
        const orgRow = await db
            .select({
            id: createOrganization.id,
            organizationName: createOrganization.organizationName,
        })
            .from(createOrganization)
            .where(eq(createOrganization.id, Number(orgIdParam) || 0))
            .limit(1);
        const orgName = orgRow[0]?.organizationName ?? null;
        const buyerWhere = orgName
            ? or(eq(buyerOnboarding.organizationId, orgIdParam), eq(buyerOnboarding.organizationId, orgName))
            : eq(buyerOnboarding.organizationId, orgIdParam);
        const [buyerRow] = await db
            .select()
            .from(buyerOnboarding)
            .where(buyerWhere)
            .limit(1);
        const vendorWhere = orgName
            ? or(eq(vendorOnboarding.organizationId, orgIdParam), eq(vendorOnboarding.organizationId, orgName))
            : eq(vendorOnboarding.organizationId, orgIdParam);
        const [vendorRow] = await db
            .select()
            .from(vendorOnboarding)
            .where(vendorWhere)
            .limit(1);
        let buyer = buyerRow ? { ...buyerRow } : null;
        let vendor = vendorRow ? { ...vendorRow } : null;
        if (buyer && buyer.userId != null) {
            const [buyerUser] = await db
                .select({
                user_name: usersTable.user_name,
                user_first_name: usersTable.user_first_name,
                user_last_name: usersTable.user_last_name,
                email: usersTable.email,
            })
                .from(usersTable)
                .where(eq(usersTable.id, Number(buyer.userId)))
                .limit(1);
            const u = buyerUser;
            buyer.completedBy = u
                ? { name: userDisplayName(u), email: u.email ?? "" }
                : { name: "—", email: "" };
            buyer.completedAt = buyerRow.updatedAt ?? buyerRow.createdAt ?? null;
        }
        if (vendor && vendor.userId != null) {
            const [vendorUser] = await db
                .select({
                user_name: usersTable.user_name,
                user_first_name: usersTable.user_first_name,
                user_last_name: usersTable.user_last_name,
                email: usersTable.email,
            })
                .from(usersTable)
                .where(eq(usersTable.id, Number(vendor.userId)))
                .limit(1);
            const u = vendorUser;
            vendor.completedBy = u
                ? { name: userDisplayName(u), email: u.email ?? "" }
                : { name: "—", email: "" };
            vendor.completedAt = vendorRow.updatedAt ?? vendorRow.createdAt ?? null;
        }
        return res.status(200).json({
            message: "Onboarding data fetched successfully",
            data: {
                buyer,
                vendor,
            },
        });
    }
    catch (error) {
        console.error("Error in fetchOrgOnboarding:", error instanceof Error ? error.message : String(error));
        return res.status(500).json({ message: "Internal server error" });
    }
};
export default fetchOrgOnboarding;
