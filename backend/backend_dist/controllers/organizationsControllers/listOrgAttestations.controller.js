import { db } from "../../database/db.js";
import { createOrganization } from "../../schema/organizations/createOrganization.js";
import { vendorSelfAttestations } from "../../schema/assessments/vendorSelfAttestations.js";
import { usersTable } from "../../schema/schema.js";
import { desc, eq, or } from "drizzle-orm";
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
/**
 * GET /orgAttestations/:id - returns all vendor self-attestations for the organization.
 * :id is the organization's numeric id. Matches organization_id in vendor_self_attestations (id or org name).
 * Includes completedBy (user who completed/submitted the attestation).
 */
const listOrgAttestations = async (req, res) => {
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
        const whereClause = orgName
            ? or(eq(vendorSelfAttestations.organization_id, orgIdParam), eq(vendorSelfAttestations.organization_id, orgName))
            : eq(vendorSelfAttestations.organization_id, orgIdParam);
        const rows = await db
            .select({
            id: vendorSelfAttestations.id,
            user_id: vendorSelfAttestations.user_id,
            vendor_self_attestation_id: vendorSelfAttestations.vendor_self_attestation_id,
            status: vendorSelfAttestations.status,
            product_name: vendorSelfAttestations.product_name,
            vendor_type: vendorSelfAttestations.vendor_type,
            company_website: vendorSelfAttestations.company_website,
            company_description: vendorSelfAttestations.company_description,
            created_at: vendorSelfAttestations.created_at,
            updated_at: vendorSelfAttestations.updated_at,
            expiry_at: vendorSelfAttestations.expiry_at,
            compliance_document_expiries: vendorSelfAttestations.compliance_document_expiries,
            user_name: usersTable.user_name,
            user_first_name: usersTable.user_first_name,
            user_last_name: usersTable.user_last_name,
            user_email: usersTable.email,
        })
            .from(vendorSelfAttestations)
            .leftJoin(usersTable, eq(vendorSelfAttestations.user_id, usersTable.id))
            .where(whereClause)
            .orderBy(desc(vendorSelfAttestations.updated_at));
        return res.status(200).json({
            message: "Attestations fetched successfully",
            data: rows.map((a) => {
                const completedByName = userDisplayName({
                    user_name: a.user_name,
                    user_first_name: a.user_first_name,
                    user_last_name: a.user_last_name,
                    email: a.user_email,
                });
                return {
                    id: a.id,
                    vendor_self_attestation_id: a.vendor_self_attestation_id,
                    status: (a.status ?? "DRAFT").toString().toUpperCase(),
                    product_name: a.product_name ?? "",
                    vendor_type: a.vendor_type ?? "",
                    company_website: a.company_website ?? "",
                    company_description: a.company_description ?? "",
                    created_at: a.created_at,
                    updated_at: a.updated_at,
                    expiry_at: a.expiry_at ?? null,
                    compliance_document_expiries: a.compliance_document_expiries ?? {},
                    completedBy: { name: completedByName },
                };
            }),
        });
    }
    catch (error) {
        console.error("Error in listOrgAttestations:", error instanceof Error ? error.message : String(error));
        return res.status(500).json({ error: "Internal server error" });
    }
};
export default listOrgAttestations;
