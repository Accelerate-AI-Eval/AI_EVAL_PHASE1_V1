import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
const SALT_ROUNDS = 10;
const resetPassword = async (req, res) => {
    const { token, newPassword, email: confirmEmail } = req.body;
    if (!token || !newPassword) {
        return res.status(400).json({
            message: "Token and new password are required",
        });
    }
    if (typeof newPassword !== "string" || newPassword.length < 8) {
        return res.status(400).json({
            message: "Password must be at least 8 characters",
        });
    }
    const emailFromUser = typeof confirmEmail === "string" ? confirmEmail.trim().toLowerCase() : "";
    if (!emailFromUser) {
        return res.status(400).json({
            message: "Email is required to confirm your account before resetting password",
        });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY);
        if (decoded.purpose !== "password_reset") {
            return res.status(400).json({ message: "Invalid reset link" });
        }
        const emailFromToken = (decoded.email ?? "").toLowerCase();
        if (emailFromToken !== emailFromUser) {
            return res.status(400).json({
                message: "Email does not match the reset link. Please use the link sent to your email.",
            });
        }
        const email = emailFromToken;
        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
        const result = await db
            .update(usersTable)
            .set({ user_password: hashedPassword })
            .where(eq(usersTable.email, email))
            .returning({ id: usersTable.id });
        if (result.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }
        return res.status(200).json({
            message: "Password reset successfully. You can now sign in.",
        });
    }
    catch (err) {
        if (err instanceof jwt.TokenExpiredError) {
            return res.status(400).json({
                message: "Reset link has expired. Please request a new one.",
            });
        }
        if (err instanceof jwt.JsonWebTokenError) {
            return res.status(400).json({
                message: "Invalid or expired reset link. Please request a new one.",
            });
        }
        console.error("Reset password error:", err);
        return res.status(500).json({
            message: "Something went wrong. Please try again later.",
        });
    }
};
export default resetPassword;
