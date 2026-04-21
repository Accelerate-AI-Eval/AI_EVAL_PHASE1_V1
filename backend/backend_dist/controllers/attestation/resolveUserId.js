import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { eq } from "drizzle-orm";
/**
 * Resolve user id from JWT (id/userId) or by email. Returns NaN if not found.
 */
export async function resolveUserId(req) {
    const payload = req.user;
    let rawId = payload?.id ?? payload?.userId;
    let userId = rawId != null ? Number(rawId) : NaN;
    if ((!Number.isInteger(userId) || userId < 1) && payload?.email) {
        const email = String(payload.email).trim();
        if (email) {
            const users = await db
                .select({ id: usersTable.id })
                .from(usersTable)
                .where(eq(usersTable.email, email))
                .limit(1);
            if (users[0])
                userId = users[0].id;
        }
    }
    return Number.isInteger(userId) && userId >= 1 ? userId : NaN;
}
