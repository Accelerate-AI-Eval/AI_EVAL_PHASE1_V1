import jwt from "jsonwebtoken";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { eq } from "drizzle-orm";
const userTokenVerify = async (req, res, next) => {
    // Normalize token to string
    const tokenParam = Array.isArray(req.params.token) ? req.params.token[0] : req.params.token;
    if (!tokenParam) {
        return res.status(400).json({ message: "Token missing" });
    }
    try {
        const decoded = jwt.verify(tokenParam, process.env.JWT_SECRET_KEY);
        // Make sure decoded is an object and has email
        if (typeof decoded !== "object" || !("email" in decoded)) {
            return res.status(400).json({ message: "Invalid token format!" });
        }
        req.email = decoded.email;
        console.log("Verified email from token:", req.email);
        next();
    }
    catch (err) {
        // When token is expired (signup not done within 7 days from sent time), mark account as expired
        if (err.name === "TokenExpiredError") {
            try {
                const decoded = jwt.decode(tokenParam);
                const email = decoded?.email?.trim().toLowerCase();
                if (email) {
                    await db
                        .update(usersTable)
                        .set({ onboarding_status: "expired", account_status: "expired" })
                        .where(eq(usersTable.email, email));
                }
            }
            catch (_) {
                // ignore
            }
        }
        console.log("JWT verify error:", err.message);
        const isExpired = err?.name === "TokenExpiredError";
        return res.status(401).json({
            message: isExpired
                ? "Signup link has expired. Please ask your admin to resend the invite."
                : "Invalid or expired token",
        });
    }
};
export default userTokenVerify;
