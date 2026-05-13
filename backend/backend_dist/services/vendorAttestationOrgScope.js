import { db } from "../database/db.js";
import { createOrganization, usersTable, vendorSelfAttestations } from "../schema/schema.js";
import { eq, or } from "drizzle-orm";
/**
 * Org (or owner) scope for vendor_self_attestations — matches GET /vendorSelfAttestation list/detail
 * and PATCH /vendorSelfAttestation/:id/user-archive so any same-organization member can update
 * visibility, not only the row's user_id.
 */
export async function vendorAttestationListWhereForUser(userId) {
    const [currentUserRow] = await db
        .select({ organization_id: usersTable.organization_id })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
    const orgId = currentUserRow?.organization_id;
    const orgIdStr = orgId != null ? String(orgId) : "";
    let orgNameForFilter = null;
    const numOrgId = Number(orgIdStr);
    if (orgIdStr && Number.isInteger(numOrgId) && numOrgId >= 1) {
        const [orgRow] = await db
            .select({ organizationName: createOrganization.organizationName })
            .from(createOrganization)
            .where(eq(createOrganization.id, numOrgId))
            .limit(1);
        orgNameForFilter = orgRow?.organizationName ?? null;
    }
    if (orgIdStr || orgNameForFilter) {
        if (orgIdStr && orgNameForFilter) {
            return or(eq(vendorSelfAttestations.organization_id, orgIdStr), eq(vendorSelfAttestations.organization_id, orgNameForFilter));
        }
        return eq(vendorSelfAttestations.organization_id, orgIdStr || orgNameForFilter || "");
    }
    return eq(vendorSelfAttestations.user_id, userId);
}
