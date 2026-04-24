import { db } from "../../database/db.js";
import { createOrganization, usersTable } from "../../schema/schema.js";
import { eq } from "drizzle-orm";
import { SIGNUP_LINK_EXPIRY_DAYS, ONBOARDING_LINK_EXPIRY_DAYS } from "../../constants/tokenExpiry.js";
/**
 * Derive onboarding status from DB and token expiry.
 * - Completed: user_onboarding_completed === true.
 * - Expired (signup): account is invited and signup link has expired (invited_at + 7 days < now). Status is then persisted as expired.
 * - Expired (onboarding): signup completed, onboarding not completed, onboarding link sent at + 1 day < now.
 * - Pending: otherwise.
 */
function getOnboardingStatus(user) {
    if (String(user.user_onboarding_completed ?? "").toLowerCase() === "true") {
        return "completed";
    }
    const accountStatus = String(user.account_status ?? "").toLowerCase();
    const signupCompleted = String(user.user_signup_completed ?? "").toLowerCase() === "true";
    if (accountStatus === "invited" && user.invited_at) {
        const invitedAt = typeof user.invited_at === "string" ? new Date(user.invited_at) : user.invited_at;
        const expiry = new Date(invitedAt);
        expiry.setDate(expiry.getDate() + SIGNUP_LINK_EXPIRY_DAYS);
        if (new Date() > expiry) {
            return "expired";
        }
    }
    if (signupCompleted && user.onboarding_link_sent_at) {
        const sentAt = typeof user.onboarding_link_sent_at === "string" ? new Date(user.onboarding_link_sent_at) : user.onboarding_link_sent_at;
        const expiry = new Date(sentAt);
        expiry.setDate(expiry.getDate() + ONBOARDING_LINK_EXPIRY_DAYS);
        if (new Date() > expiry) {
            return "expired";
        }
    }
    return user.onboarding_status ?? "pending";
}
/**
 * Fetch users for the requester.
 * - System admin: gets all users.
 * - Buyer (Admin) / Vendor (Admin): only users from their own organization.
 */
const fetchAllUsers = async (req, res) => {
    try {
        const decoded = req.user;
        const userId = decoded?.id;
        if (userId == null) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const currentUserRows = await db
            .select({
            organization_id: usersTable.organization_id,
            user_platform_role: usersTable.user_platform_role,
        })
            .from(usersTable)
            .where(eq(usersTable.id, Number(userId)))
            .limit(1);
        const currentUser = currentUserRows[0];
        if (!currentUser) {
            return res.status(404).json({ message: "User not found" });
        }
        const platformRole = (currentUser.user_platform_role ?? "").trim().toLowerCase();
        let userRows;
        if (platformRole === "vendor" || platformRole === "buyer") {
            const orgId = currentUser.organization_id;
            if (orgId == null) {
                userRows = [];
            }
            else {
                userRows = await db
                    .select({
                    user: usersTable,
                    organizationName: createOrganization.organizationName,
                })
                    .from(usersTable)
                    .leftJoin(createOrganization, eq(usersTable.organization_id, createOrganization.id))
                    .where(eq(usersTable.organization_id, orgId));
            }
        }
        else {
            userRows = await db
                .select({
                user: usersTable,
                organizationName: createOrganization.organizationName,
            })
                .from(usersTable)
                .leftJoin(createOrganization, eq(usersTable.organization_id, createOrganization.id));
        }
        // Automatically mark as expired when not completed: invited + onboarding pending and signup expiry (invited_at) has passed
        const expiredUserIds = new Map();
        for (const { user } of userRows) {
            const onboardingStatus = getOnboardingStatus(user);
            if (onboardingStatus === "expired" && user.id != null) {
                const accountStatus = String(user.account_status ?? "").toLowerCase();
                if (accountStatus === "invited" || accountStatus === "confirmed") {
                    expiredUserIds.set(user.id, { accountStatus: accountStatus });
                }
            }
        }
        for (const [id, { accountStatus }] of expiredUserIds) {
            try {
                if (accountStatus === "invited") {
                    await db
                        .update(usersTable)
                        .set({ onboarding_status: "expired", account_status: "expired" })
                        .where(eq(usersTable.id, id));
                }
                else {
                    await db
                        .update(usersTable)
                        .set({ onboarding_status: "expired" })
                        .where(eq(usersTable.id, id));
                }
            }
            catch (err) {
                console.error("Failed to set expired for user", id, err);
            }
        }
        const data = userRows.map(({ user, organizationName }) => {
            const onboardingStatus = getOnboardingStatus(user);
            const wasMarkedExpired = user.id != null && expiredUserIds.has(user.id);
            const info = user.id != null ? expiredUserIds.get(user.id) : undefined;
            return {
                ...user,
                organization_id: user.organization_id,
                organization_name: organizationName ?? "",
                onboarding_status: wasMarkedExpired ? "expired" : onboardingStatus,
                account_status: wasMarkedExpired && info?.accountStatus === "invited" ? "expired" : user.account_status,
            };
        });
        res.status(200).json({
            message: "Users fetched successfully",
            data,
        });
    }
    catch (error) {
        console.error("Error in fetchAllUsers:", error instanceof Error ? error.message : String(error));
        res.status(500).json({ error: "Internal server error" });
    }
};
export default fetchAllUsers;
