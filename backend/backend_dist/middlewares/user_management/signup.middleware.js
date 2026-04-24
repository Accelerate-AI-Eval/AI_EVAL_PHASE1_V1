import { eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
const signupAccess = async (req, res, next) => {
    try {
        // Use email from token
        const userEmail = req.email;
        if (!userEmail) {
            return res.status(400).json({ message: "Email not provided" });
        }
        const existingUser = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.email, userEmail))
            .limit(1);
        const existingRow = existingUser[0];
        if (existingUser.length > 0 && existingRow !== undefined && existingRow.user_signup_completed === "true") {
            return res.status(409).json({ message: "Signup already completed" });
        }
        next();
    }
    catch (error) {
        console.error("Signup access check error:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
export default signupAccess;
