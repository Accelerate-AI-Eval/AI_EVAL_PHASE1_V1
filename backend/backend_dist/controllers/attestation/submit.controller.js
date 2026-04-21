import { db } from "../../database/db.js";
import { attestations } from "../../schema/schema.js";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { resolveUserId } from "./resolveUserId.js";
/** Minimal required keys for submit validation; adjust as needed */
const REQUIRED_KEYS = []; // e.g. ["attestation", "document_uploads"] if you want strict validation
function validateRequired(formData) {
    for (const key of REQUIRED_KEYS) {
        if (formData[key] === undefined || formData[key] === null) {
            return `Missing required field: ${key}`;
        }
    }
    return null;
}
/**
 * POST /attestation/submit
 * Validates required fields, saves/updates attestation with status = COMPLETED.
 * Submit ALWAYS marks as completed.
 */
export default async function submit(req, res) {
    try {
        const userId = await resolveUserId(req);
        if (!userId) {
            res.status(401).json({ success: false, message: "User not authenticated" });
            return;
        }
        const body = req.body ?? {};
        const formData = body.formData ?? body.form_data ?? body;
        const data = typeof formData === "object" ? formData : {};
        const id = body.id ?? body.attestationId;
        const err = validateRequired(data);
        if (err) {
            res.status(400).json({ success: false, message: err });
            return;
        }
        const payload = {
            user_id: userId,
            status: "COMPLETED",
            form_data: data,
            updated_at: sql `now()`,
        };
        if (id) {
            const [existing] = await db
                .select()
                .from(attestations)
                .where(eq(attestations.id, id))
                .limit(1);
            if (existing && existing.user_id === userId) {
                await db.update(attestations).set(payload).where(eq(attestations.id, id));
                const [saved] = await db.select().from(attestations).where(eq(attestations.id, id)).limit(1);
                res.status(200).json({
                    success: true,
                    message: "Attestation submitted",
                    attestation: saved
                        ? {
                            id: saved.id,
                            status: saved.status,
                            formData: saved.form_data,
                            createdAt: saved.created_at,
                            updatedAt: saved.updated_at,
                        }
                        : null,
                });
                return;
            }
        }
        const [inserted] = await db
            .insert(attestations)
            .values({
            user_id: userId,
            status: "COMPLETED",
            form_data: data,
        })
            .returning();
        res.status(201).json({
            success: true,
            message: "Attestation submitted",
            attestation: inserted
                ? {
                    id: inserted.id,
                    status: inserted.status,
                    formData: inserted.form_data,
                    createdAt: inserted.created_at,
                    updatedAt: inserted.updated_at,
                }
                : null,
        });
    }
    catch (e) {
        const err = e;
        const msg = err?.message ?? "";
        if (msg.includes("attestations") && (msg.includes("does not exist") || err?.code === "42P01")) {
            res.status(503).json({
                success: false,
                message: "Attestations table missing. From backend folder run: npm run db:run-0007",
            });
            return;
        }
        console.error("submit attestation error:", e);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
