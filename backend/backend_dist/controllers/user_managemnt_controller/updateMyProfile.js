import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
const SALT_ROUNDS = 10;
/**
 * PUT /me - update current user's profile fields and/or password.
 * Body: { user_name?: string, user_first_name?: string, user_last_name?: string, newPassword?: string }
 * Current password is not required to change password (user is already authenticated).
 */
const updateMyProfile = async (req, res) => {
    const decoded = req.user;
    const userId = decoded?.id;
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    const body = req.body ?? {};
    const user_name = typeof body.user_name === "string" ? body.user_name.trim() || null : undefined;
    const user_first_name = typeof body.user_first_name === "string" ? body.user_first_name.trim() || null : undefined;
    const user_last_name = typeof body.user_last_name === "string" ? body.user_last_name.trim() || null : undefined;
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : undefined;
    if (user_name === undefined &&
        user_first_name === undefined &&
        user_last_name === undefined &&
        newPassword === undefined) {
        return res.status(400).json({ message: "At least one editable field is required to update." });
    }
    try {
        const [user] = await db
            .select({
            id: usersTable.id,
            email: usersTable.email,
            user_name: usersTable.user_name,
            user_first_name: usersTable.user_first_name,
            user_last_name: usersTable.user_last_name,
        })
            .from(usersTable)
            .where(eq(usersTable.id, Number(userId)))
            .limit(1);
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const updates = {};
        if (user_name !== undefined && user_name !== user.user_name) {
            if (user_name !== null && user_name.length > 0) {
                const existing = await db
                    .select({ id: usersTable.id })
                    .from(usersTable)
                    .where(eq(usersTable.user_name, user_name))
                    .limit(1);
                if (existing.length > 0 && existing[0].id !== user.id) {
                    return res.status(400).json({ message: "Username must be unique. This username is already taken." });
                }
            }
            updates.user_name = user_name;
        }
        if (newPassword !== undefined && newPassword.length > 0) {
            if (newPassword.length < 6) {
                return res.status(400).json({ message: "New password must be at least 6 characters." });
            }
            updates.user_password = await bcrypt.hash(newPassword, SALT_ROUNDS);
        }
        if (user_first_name !== undefined && user_first_name !== user.user_first_name) {
            updates.user_first_name = user_first_name;
        }
        if (user_last_name !== undefined && user_last_name !== user.user_last_name) {
            updates.user_last_name = user_last_name;
        }
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                message: "At least one editable field is required to update.",
            });
        }
        const [updated] = await db
            .update(usersTable)
            .set(updates)
            .where(eq(usersTable.id, Number(userId)))
            .returning({
            id: usersTable.id,
            email: usersTable.email,
            user_name: usersTable.user_name,
            user_first_name: usersTable.user_first_name,
            user_last_name: usersTable.user_last_name,
        });
        if (!updated) {
            return res.status(500).json({ message: "Update failed." });
        }
        return res.status(200).json({
            message: "Profile updated successfully.",
            user: updated,
        });
    }
    catch (err) {
        console.error("updateMyProfile error:", err);
        return res.status(500).json({ message: "Server error." });
    }
};
export default updateMyProfile;
