import { db } from "../../database/db.js";
import { attestations, usersTable } from "../../schema/schema.js";
import { eq } from "drizzle-orm";
import { resolveUserId } from "./resolveUserId.js";
/**
 * GET /attestations
 * Returns attestations for the current user. System admins see all attestations (with user_id).
 */
export default async function list(req, res) {
    try {
        const userId = await resolveUserId(req);
        if (!userId) {
            res.status(401).json({ success: false, message: "User not authenticated" });
            return;
        }
        const [user] = await db
            .select({ user_platform_role: usersTable.user_platform_role })
            .from(usersTable)
            .where(eq(usersTable.id, userId))
            .limit(1);
        const platformRole = String((user?.user_platform_role ?? "").trim()).toLowerCase();
        const isSystemAdmin = platformRole === "system admin";
        const rowsRes = isSystemAdmin
            ? await db
                .select({
                id: attestations.id,
                user_id: attestations.user_id,
                status: attestations.status,
                createdAt: attestations.created_at,
                updatedAt: attestations.updated_at,
            })
                .from(attestations)
            : await db
                .select({
                id: attestations.id,
                user_id: attestations.user_id,
                status: attestations.status,
                createdAt: attestations.created_at,
                updatedAt: attestations.updated_at,
            })
                .from(attestations)
                .where(eq(attestations.user_id, userId));
        res.status(200).json({
            success: true,
            attestations: rowsRes.map((r) => ({
                id: r.id,
                ...(isSystemAdmin && r.user_id != null ? { userId: r.user_id } : {}),
                status: r.status,
                createdAt: r.createdAt,
                updatedAt: r.updatedAt,
            })),
        });
    }
    catch (e) {
        const err = e;
        const msg = err?.message ?? "";
        // If attestations table does not exist (migration 0007 not run), return empty list so UI does not break
        if (msg.includes("attestations") && (msg.includes("does not exist") || err?.code === "42P01")) {
            res.status(200).json({ success: true, attestations: [] });
            return;
        }
        console.error("list attestations error:", e);
        res.status(500).json({ success: false, message: "Server error" });
    }
}
