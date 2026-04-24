import { db } from "../../database/db.js";
import { vendors, usersTable, createOrganization, vendorSelfAttestations } from "../../schema/schema.js";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
/**
 * GET /vendorDirectory
 * Returns only vendors who have turned on Public Directory Listing (for buyer-facing directory).
 * When DB has public_directory_listing column, filter by it; when column is missing, returns [].
 * Query ?scope=all (system admin only): returns all vendors, no filter.
 */
const listPublicVendors = async (req, res) => {
    try {
        const scopeAll = typeof req.query?.scope === "string" && req.query.scope.trim().toLowerCase() === "all";
        let isSystemAdmin = false;
        if (scopeAll) {
            const payload = req.user;
            const rawId = payload?.id ?? payload?.userId;
            const userId = rawId != null ? Number(rawId) : NaN;
            if (Number.isInteger(userId) && userId >= 1) {
                const [row] = await db
                    .select({ user_platform_role: usersTable.user_platform_role, role: usersTable.role, organization_id: usersTable.organization_id })
                    .from(usersTable)
                    .where(eq(usersTable.id, userId))
                    .limit(1);
                const r = row;
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
            publicDirectoryListing: vendors.publicDirectoryListing,
            organizationName: createOrganization.organizationName,
        };
        const joinCondition = sql `${createOrganization.id} = (${vendors.organizationId})::int`;
        const rows = scopeAll && isSystemAdmin
            ? await db
                .select(selectFields)
                .from(vendors)
                .leftJoin(createOrganization, joinCondition)
            : await db
                .select(selectFields)
                .from(vendors)
                .leftJoin(createOrganization, joinCondition)
                .where(eq(vendors.publicDirectoryListing, true));
        const vendorIds = rows.map((r) => r.userId).filter((id) => id != null && Number.isInteger(id));
        const productRows = vendorIds.length > 0
            ? await db
                .select({
                user_id: vendorSelfAttestations.user_id,
                product_name: vendorSelfAttestations.product_name,
            })
                .from(vendorSelfAttestations)
                .where(and(inArray(vendorSelfAttestations.user_id, vendorIds), eq(vendorSelfAttestations.visible_to_buyer, true), sql `upper(${vendorSelfAttestations.status}) = 'COMPLETED'`, sql `(${vendorSelfAttestations.expiry_at} IS NULL OR ${vendorSelfAttestations.expiry_at} >= now())`, isNull(vendorSelfAttestations.user_archived_at)))
            : [];
        const productNamesByUserId = {};
        for (const pr of productRows) {
            const uid = pr.user_id;
            if (uid == null)
                continue;
            const name = (pr.product_name ?? "").trim();
            if (!name)
                continue;
            if (!productNamesByUserId[uid])
                productNamesByUserId[uid] = [];
            if (!productNamesByUserId[uid].includes(name))
                productNamesByUserId[uid].push(name);
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
            list = list.filter((v) => Array.isArray(v.productNames) && v.productNames.length > 0);
        }
        res.status(200).json({
            success: true,
            vendors: list,
        });
    }
    catch (e) {
        const err = e;
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
