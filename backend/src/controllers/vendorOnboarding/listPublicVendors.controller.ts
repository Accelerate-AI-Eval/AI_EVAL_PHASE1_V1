import type { Request, Response } from "express";
import { db } from "../../database/db.js";
import { vendors, usersTable, createOrganization, vendorSelfAttestations } from "../../schema/schema.js";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { attestationBelongsToVendorDirectoryRow } from "../../services/vendorDirectoryAttestationScope.js";

/**
 * GET /vendorDirectory
 * Buyer-facing vendor list. Requires vendor_onboarding.public_directory_listing = true (set automatically when
 * a product is marked visible to buyers in Product Profile, or via PATCH public-directory-listing).
 * Active organization and at least one directory-eligible product (COMPLETED, visible_to_buyer, not expired,
 * not user-archived) for the vendor org — products may belong to any org member, not only vendor_onboarding.user_id.
 */
const listPublicVendors = async (req: Request, res: Response): Promise<void> => {
  try {
    const scopeAll = typeof req.query?.scope === "string" && req.query.scope.trim().toLowerCase() === "all";
    let isSystemAdmin = false;
    if (scopeAll) {
      const payload = req.user as { id?: number; userId?: string | number; email?: string } | undefined;
      const rawId = payload?.id ?? payload?.userId;
      const userId = rawId != null ? Number(rawId) : NaN;
      if (Number.isInteger(userId) && userId >= 1) {
        const [row] = await db
          .select({ user_platform_role: usersTable.user_platform_role, role: usersTable.role, organization_id: usersTable.organization_id })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);
        const r = row as Record<string, unknown> | undefined;
        const platformRole = String(r?.user_platform_role ?? "").trim().toLowerCase();
        const role = String(r?.role ?? "").trim().toLowerCase();
        const orgId = r?.organization_id;
        isSystemAdmin =
          platformRole === "system admin" ||
          platformRole === "system_admin" ||
          platformRole === "systemadmin" ||
          (Number(orgId) === 1 && role === "admin");
      }
    }

    const selectFields = {
      id: vendors.id,
      userId: vendors.userId,
      organizationId: vendors.organizationId,
      vendorType: vendors.vendorType,
      companyWebsite: vendors.companyWebsite,
      companyDescription: vendors.companyDescription,
      headquartersLocation: vendors.headquartersLocation,
      vendorMaturity: vendors.vendorMaturity,
      sector: vendors.sector,
      publicDirectoryListing: vendors.publicDirectoryListing, // response field; default list filters eq(..., true)
      organizationName: createOrganization.organizationName,
    };
    const joinCondition = sql`${createOrganization.id} = (${vendors.organizationId})::int`;
    const rows =
      scopeAll && isSystemAdmin
        ? await db
            .select(selectFields)
            .from(vendors)
            .leftJoin(createOrganization, joinCondition)
        : await db
            .select(selectFields)
            .from(vendors)
            .leftJoin(createOrganization, joinCondition)
            .where(
              and(
                // public.vendor_onboarding.public_directory_listing — buyer directory vendor list gate
                eq(vendors.publicDirectoryListing, true),
                eq(createOrganization.organizationStatus, "active"),
              ),
            );
    const vendorUuidList = rows
      .map((r) => r.id)
      .filter((id): id is string => id != null && String(id).trim() !== "");
    const productRows =
      vendorUuidList.length > 0
        ? await db
            .select({
              user_id: vendors.userId,
              product_name: vendorSelfAttestations.product_name,
            })
            .from(vendors)
            .innerJoin(createOrganization, joinCondition)
            .innerJoin(
              vendorSelfAttestations,
              and(
                attestationBelongsToVendorDirectoryRow(),
                eq(vendorSelfAttestations.visible_to_buyer, true),
                sql`upper(${vendorSelfAttestations.status}) = 'COMPLETED'`,
                sql`(${vendorSelfAttestations.expiry_at} IS NULL OR ${vendorSelfAttestations.expiry_at} >= now())`,
                isNull(vendorSelfAttestations.user_archived_at),
              ),
            )
            .where(inArray(vendors.id, vendorUuidList))
        : [];
    const productNamesByUserId: Record<number, string[]> = {};
    for (const pr of productRows) {
      const uid = pr.user_id;
      if (uid == null) continue;
      const name = (pr.product_name ?? "").trim();
      if (!name) continue;
      if (!productNamesByUserId[uid]) productNamesByUserId[uid] = [];
      if (!productNamesByUserId[uid].includes(name)) productNamesByUserId[uid].push(name);
    }

    let list = rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      organizationId: r.organizationId,
      organizationName: r.organizationName ?? null,
      vendorType: r.vendorType ?? "",
      companyWebsite: r.companyWebsite ?? "",
      companyDescription: r.companyDescription ?? "",
      headquartersLocation: r.headquartersLocation ?? "",
      vendorMaturity: r.vendorMaturity ?? "",
      sector: r.sector ?? null,
      productNames: (r.userId != null && productNamesByUserId[r.userId]) ? productNamesByUserId[r.userId] : [],
    }));
    if (!(scopeAll && isSystemAdmin)) {
      list = list.filter(
        (v) => Array.isArray(v.productNames) && v.productNames.length > 0,
      );
    }

    res.status(200).json({
      success: true,
      vendors: list,
    });
  } catch (e: unknown) {
    const err = e as { message?: string };
    const msg = err?.message ?? "";
    if (msg.includes("public_directory_listing") || msg.includes("does not exist")) {
      res.status(200).json({ success: true, vendors: [] });
      return;
    }
    console.error("listPublicVendors error:", e);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export default listPublicVendors;
