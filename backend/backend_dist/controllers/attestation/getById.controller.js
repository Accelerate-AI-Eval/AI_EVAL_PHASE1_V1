import { db } from "../../database/db.js";
import { attestations } from "../../schema/schema.js";
import { eq, and } from "drizzle-orm";
import { resolveUserId } from "./resolveUserId.js";
/**
 * GET /attestation/:id
 * Returns attestation data for editing. User can only access their own.
 */
export default async function getById(req, res) {
    try {
        const userId = await resolveUserId(req);
        if (!userId) {
            res.status(401).json({ success: false, message: "User not authenticated" });
            return;
        }
        const rawId = req.params.id;
        const id = Array.isArray(rawId) ? rawId[0] : rawId;
        if (!id || typeof id !== "string") {
            res.status(400).json({ success: false, message: "Attestation id required" });
            return;
        }
        const [row] = await db
            .select()
            .from(attestations)
            .where(and(eq(attestations.id, id), eq(attestations.user_id, userId)))
            .limit(1);
        if (!row) {
            res.status(404).json({ success: false, message: "Attestation not found" });
            return;
        }
        res.status(200).json({
            success: true,
            attestation: {
                id: row.id,
                status: row.status,
                formData: row.form_data,
                createdAt: row.created_at,
                updatedAt: row.updated_at,
            },
        });
    }
    catch (e) {
        const err = e;
        const msg = err?.message ?? "";
        // If attestations table does not exist (migration 0007 not run), return 404 so UI can handle
        if (msg.includes("attestations") && (msg.includes("does not exist") || err?.code === "42P01")) {
            res.status(404).json({ success: false, message: "Attestation not found" });
            return;
        }
        console.error("getById attestation error:", e);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
