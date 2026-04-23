import { eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import jwt from "jsonwebtoken";
const onboardingAccess = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        // console.log("auth",authHeader)
        if (!authHeader?.startsWith("Bearer ")) {
            return res.status(401).json({ message: "Missing token" });
        }
        const token = authHeader.split(" ")[1];
        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET_KEY ?? "fallback-secret");
        }
        catch (err) {
            return res.status(401).json({ message: "Invalid or expired token" });
        }
        req.user = decoded;
        const payload = typeof decoded === "object" && decoded !== null ? decoded : null;
        const email = payload && "email" in payload ? String(payload.email ?? "") : "";
        let existingUser = await db
            .select()
            .from(usersTable)
            .where(eq(usersTable.email, email))
            .limit(1);
        if (!existingUser?.length && payload && "userId" in payload && payload.userId != null) {
            const id = Number(payload.userId);
            if (!Number.isNaN(id)) {
                existingUser = await db
                    .select()
                    .from(usersTable)
                    .where(eq(usersTable.id, id))
                    .limit(1);
            }
        }
        const found = existingUser[0];
        if (!found) {
            return res.status(404).json({ message: "User not found" });
        }
        if (found.user_onboarding_completed === "true") {
            return res.status(409).json({ message: "Onboarding already completed" });
        }
        req.onboardingUser = found;
        next();
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: "Internal server error" });
    }
};
export default onboardingAccess;
