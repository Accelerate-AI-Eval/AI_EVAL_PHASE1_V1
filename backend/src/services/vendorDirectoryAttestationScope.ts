import { db } from "../database/db.js";
import { createOrganization, vendorSelfAttestations, vendors } from "../schema/schema.js";
import { eq, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

/*
 * --- public_directory_listing (Public Directory Listing) ---
 * PostgreSQL: public.vendor_onboarding.public_directory_listing (boolean, default false).
 * Drizzle: vendors.publicDirectoryListing in schema/vendor (addVendor.schema.ts).
 *
 * Meaning: org-level switch for whether this vendor row is eligible for buyer-facing directory APIs
 * (GET /vendorDirectory, GET /vendorDirectory/:vendorId/products, GET .../products/:productId) alongside
 * active org and visible_to_buyer product rules.
 *
 * Writes:
 * - PATCH /vendorOnboarding/public-directory-listing (updatePublicDirectoryListing.controller.ts)
 * - PATCH /vendorSelfAttestation/visibility with visible=true calls enablePublicDirectoryListingForAttestation below
 *   so buyers can discover the org after a product is marked visible (Product Profile org toggle may be hidden in UI).
 *
 * Reads: fetchVendorOnboarding (data.publicDirectoryListing); buyer controllers filter eq(..., true) unless admin scope.
 * Column DDL: public_directory_listing on public.vendor_onboarding (see migrations / ALTER in fetch + PATCH handlers).
 */

/**
 * Match attestations to a vendor directory row: same onboarding user_id **or** same organization
 * (organization_id on attestation may store numeric org id string or organization name, same as GET /vendorSelfAttestation).
 */
export function attestationBelongsToVendorDirectoryRow() {
  return or(
    eq(vendorSelfAttestations.user_id, vendors.userId),
    eq(vendorSelfAttestations.organization_id, vendors.organizationId),
    eq(vendorSelfAttestations.organization_id, createOrganization.organizationName),
  );
}

/** Same rules as {@link attestationBelongsToVendorDirectoryRow} using resolved vendor row values (no join). */
export function attestationBelongsToVendorByIds(
  vendorUserId: number | null | undefined,
  vendorOrganizationId: string | null | undefined,
  organizationName: string | null | undefined,
): SQL {
  const parts: SQL[] = [];
  if (vendorUserId != null && Number.isInteger(vendorUserId) && vendorUserId >= 1) {
    parts.push(eq(vendorSelfAttestations.user_id, vendorUserId));
  }
  const oid = vendorOrganizationId != null ? String(vendorOrganizationId).trim() : "";
  const oname = organizationName != null ? String(organizationName).trim() : "";
  if (oid) parts.push(eq(vendorSelfAttestations.organization_id, oid));
  if (oname && oname !== oid) parts.push(eq(vendorSelfAttestations.organization_id, oname));
  if (parts.length === 0) {
    return sql`false`;
  }
  if (parts.length === 1) return parts[0]!;
  let acc: SQL = parts[0]!;
  for (let i = 1; i < parts.length; i++) {
    acc = or(acc, parts[i]!) as SQL;
  }
  return acc;
}

const COLUMN_MISSING = /public_directory_listing|does not exist|column .* does not exist/i;

/**
 * Sets vendor_onboarding.public_directory_listing = true for the onboarding row(s) matching the attestation’s
 * user_id / organization_id so buyer directory APIs (which gate on this column) can return the vendor.
 * @see file-level comment above for full public_directory_listing feature map.
 */
export async function enablePublicDirectoryListingForAttestation(attestationId: string): Promise<void> {
  const [row] = await db
    .select({
      organization_id: vendorSelfAttestations.organization_id,
      user_id: vendorSelfAttestations.user_id,
    })
    .from(vendorSelfAttestations)
    .where(eq(vendorSelfAttestations.id, attestationId))
    .limit(1);
  if (row?.user_id == null || !Number.isInteger(Number(row.user_id))) return;
  const uid = Number(row.user_id);
  const orgId = row.organization_id != null ? String(row.organization_id).trim() : "";
  const whereClause =
    orgId !== "" ? or(eq(vendors.userId, uid), eq(vendors.organizationId, orgId)) : eq(vendors.userId, uid);

  async function doUpdate() {
    await db
      .update(vendors)
      .set({ publicDirectoryListing: true, updatedAt: new Date() })
      .where(whereClause);
  }

  try {
    await doUpdate();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!COLUMN_MISSING.test(msg)) throw e;
    await db.execute(sql`
      ALTER TABLE public.vendor_onboarding
      ADD COLUMN IF NOT EXISTS public_directory_listing boolean NOT NULL DEFAULT false
    `);
    await doUpdate();
  }
}
