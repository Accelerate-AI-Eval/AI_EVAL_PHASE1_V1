import { db } from "../database/db.js";
import { vendors, vendorSelfAttestations, createOrganization } from "../schema/schema.js";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { attestationBelongsToVendorDirectoryRow } from "./vendorDirectoryAttestationScope.js";
/**
 * Find the vendor's completed buyer-visible attestation row matching directory vendor name + product name.
 * Gates on vendors.publicDirectoryListing (DB: public_directory_listing) so name-based resolution aligns with GET /vendorDirectory.
 */
export async function findAttestationForBuyerVendorProduct(vendorName, productName) {
    const vName = (vendorName ?? "").trim();
    const pName = (productName ?? "").trim();
    if (!vName || !pName)
        return null;
    const joinOrg = sql `${createOrganization.id} = (${vendors.organizationId})::int`;
    const rows = await db
        .select({
        row: vendorSelfAttestations,
    })
        .from(vendors)
        .innerJoin(createOrganization, joinOrg)
        .innerJoin(vendorSelfAttestations, attestationBelongsToVendorDirectoryRow())
        .where(and(eq(vendors.publicDirectoryListing, true), // public_directory_listing — same gate as buyer vendor directory
    sql `trim(lower(${createOrganization.organizationName})) = trim(lower(${vName}))`, sql `trim(lower(coalesce(${vendorSelfAttestations.product_name}, ''))) = trim(lower(${pName}))`, sql `upper(trim(coalesce(${vendorSelfAttestations.status}, ''))) = 'COMPLETED'`, eq(vendorSelfAttestations.visible_to_buyer, true), sql `(${vendorSelfAttestations.expiry_at} IS NULL OR ${vendorSelfAttestations.expiry_at} >= now())`, isNull(vendorSelfAttestations.user_archived_at)))
        .orderBy(desc(vendorSelfAttestations.updated_at))
        .limit(1);
    const r = rows[0]?.row;
    if (!r)
        return null;
    return { ...r };
}
const completedVisibleBuyerAttestation = and(sql `upper(trim(coalesce(${vendorSelfAttestations.status}, ''))) = 'COMPLETED'`, eq(vendorSelfAttestations.visible_to_buyer, true), sql `(${vendorSelfAttestations.expiry_at} IS NULL OR ${vendorSelfAttestations.expiry_at} >= now())`, isNull(vendorSelfAttestations.user_archived_at));
/**
 * Resolve attestation for buyer-side vendor risk report: prefer explicit attestation id from the assessment
 * (directory product / organization flow), else match by public vendor name + product name.
 */
export async function findAttestationForBuyerAssessment(opts) {
    const id = (opts.attestationId ?? "").trim();
    if (id) {
        const [row] = await db
            .select()
            .from(vendorSelfAttestations)
            .where(and(or(eq(vendorSelfAttestations.id, id), eq(vendorSelfAttestations.vendor_self_attestation_id, id)), completedVisibleBuyerAttestation))
            .limit(1);
        if (row)
            return { ...row };
    }
    return findAttestationForBuyerVendorProduct(opts.vendorName, opts.productName);
}
