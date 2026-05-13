import { db } from "../../database/db.js";
import { vendors } from "../../schema/schema.js";
import { eq, sql } from "drizzle-orm";
const COLUMN_MISSING = /public_directory_listing|does not exist|column .* does not exist/i;
/**
 * PATCH /vendorOnboarding/public-directory-listing
 * Body: { enabled: boolean }
 *
 * Database: public.vendor_onboarding.public_directory_listing (boolean). Drizzle: vendors.publicDirectoryListing.
 *
 * Public Directory Listing: org-wide opt-in stored on that column.
 * When enabled, the vendor can appear in GET /vendorDirectory and buyers can list products via
 * GET /vendorDirectory/:vendorId/products (subject to active org, COMPLETED + visible_to_buyer products).
 * Paired with GET /vendorOnboarding (data.publicDirectoryListing) for the Product Profile toggle.
 * Also see enablePublicDirectoryListingForAttestation when a product is marked visible to buyers.
 *
 * Sets the flag for the JWT user’s vendor_onboarding row. If the column is missing, runs
 * ALTER TABLE ... ADD COLUMN IF NOT EXISTS then retries the update.
 */
const updatePublicDirectoryListing = async (req, res) => {
    try {
        const payload = req.user;
        const rawId = payload?.id ?? payload?.userId;
        const userId = rawId != null ? Number(rawId) : NaN;
        if (!Number.isInteger(userId) || userId < 1) {
            res.status(401).json({ success: false, message: "User not authenticated" });
            return;
        }
        const body = req.body ?? {};
        const enabled = typeof body.enabled === "boolean"
            ? body.enabled
            : body.enabled === "true" || body.enabled === true;
        async function doUpdate() {
            return db
                .update(vendors)
                .set({
                publicDirectoryListing: Boolean(enabled),
                updatedAt: new Date(),
            })
                .where(eq(vendors.userId, userId))
                .returning({ id: vendors.id });
        }
        let result;
        try {
            result = await doUpdate();
        }
        catch (firstErr) {
            const msg = firstErr instanceof Error ? firstErr.message : String(firstErr);
            if (!COLUMN_MISSING.test(msg)) {
                throw firstErr;
            }
            // Column missing: add it then retry
            await db.execute(sql `
        ALTER TABLE public.vendor_onboarding
        ADD COLUMN IF NOT EXISTS public_directory_listing boolean NOT NULL DEFAULT false
      `);
            result = await doUpdate();
        }
        if (!result || result.length === 0) {
            res.status(404).json({
                success: false,
                message: "Vendor onboarding not found. Complete vendor onboarding first to enable Public Directory Listing.",
            });
            return;
        }
        res.status(200).json({
            success: true,
            message: enabled ? "Public directory listing enabled." : "Public directory listing disabled.",
        });
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error("updatePublicDirectoryListing error:", msg);
        res.status(500).json({ success: false, message: "Could not update. Try again." });
    }
};
export default updatePublicDirectoryListing;
