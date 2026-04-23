import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { eq } from "drizzle-orm";
/** GET /me - returns current user display info (no password). Requires authenticateToken. */
const getMe = async (req, res) => {
    const decoded = req.user;
    const userId = decoded?.id;
    if (userId == null) {
        return res.status(401).json({ message: "Unauthorized" });
    }
    try {
        const rows = await db
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
        const user = rows[0];
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        return res.status(200).json(user);
    }
    catch (err) {
        console.error("getMe error:", err);
        return res.status(500).json({ message: "Server error" });
    }
};
export default getMe;
