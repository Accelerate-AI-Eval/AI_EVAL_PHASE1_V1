import { db } from "../../database/db.js";
import { vendorSelfAttestations } from "../../schema/schema.js";
import { and, eq } from "drizzle-orm";
import { vendorAttestationListWhereForUser } from "../../services/vendorAttestationOrgScope.js";
import { enablePublicDirectoryListingForAttestation } from "../../services/vendorDirectoryAttestationScope.js";
/**
 * PATCH /vendorSelfAttestation/visibility
 * Body: { attestationId: string, visible: boolean }
 * Sets visible_to_buyer for the given attestation. Caller must be the attestation owner or in the
 * same organization (same scope as GET /vendorSelfAttestation).
 *
 * IMPORTANT: Product Profile toggle – must NOT update attestation submission metadata.
 * We only set visible_to_buyer. Do NOT set updated_at or submitted_at here.
 * submitted_at is set only in submitVendorSelfAttestation when status becomes COMPLETED.
 */
const updateAttestationVisibility = async (req, res) => {
    try {
        const payload = req.user;
        const rawId = payload?.id ?? payload?.userId;
        const userId = rawId != null ? Number(rawId) : NaN;
        if (!Number.isInteger(userId) || userId < 1) {
            res.status(401).json({ success: false, message: "User not authenticated" });
            return;
        }
        const body = req.body ?? {};
        const attestationId = typeof body.attestationId === "string" ? body.attestationId.trim() : null;
        const visible = typeof body.visible === "boolean"
            ? body.visible
            : body.visible === "true" || body.visible === true;
        if (!attestationId) {
            res.status(400).json({ success: false, message: "attestationId is required" });
            return;
        }
        const listWhere = await vendorAttestationListWhereForUser(userId);
        // Only update visibility; do not touch updated_at so attestation "Submitted" date is unchanged
        const result = await db
            .update(vendorSelfAttestations)
            .set({ visible_to_buyer: Boolean(visible) })
            .where(and(eq(vendorSelfAttestations.id, attestationId), listWhere))
            .returning({ id: vendorSelfAttestations.id });
        if (!result || result.length === 0) {
            res.status(404).json({
                success: false,
                message: "Attestation not found or you do not have permission to update it.",
            });
            return;
        }
        if (visible) {
            // public_directory_listing: turn on org directory eligibility for buyer APIs (see vendorDirectoryAttestationScope.ts)
            await enablePublicDirectoryListingForAttestation(attestationId);
        }
        res.status(200).json({
            success: true,
            message: visible
                ? "Product is now visible to buyers."
                : "Product is now hidden from buyers.",
        });
    }
    catch (error) {
        console.error("updateAttestationVisibility error:", error);
        res.status(500).json({ success: false, message: "Could not update. Try again." });
    }
};
export default updateAttestationVisibility;
