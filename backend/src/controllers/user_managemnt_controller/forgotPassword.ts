import type { Request, Response } from "express";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import emailConfig from "../../functions/emailconfig.js";

const RESET_TOKEN_EXPIRY = "1h";
const BASE_URL = process.env.BASE_URL;

const RESET_MAIL_PLATFORM_NAME = "AI-Q Platform";
const RESET_MAIL_PRIMARY = "#3b66f5";
const RESET_MAIL_PAGE_BG = "#f4f4f4";

/** Password reset email: table layout + inline styles (aligned with invite mail). */
function resetPasswordEmailTemplate(resetLink: string) {
  const brandHyphen = RESET_MAIL_PLATFORM_NAME.replace("-", "&#8209;");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Reset your password</title>
</head>
<body style="margin:0;padding:0;background-color:${RESET_MAIL_PAGE_BG};font-family:Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;color:#333333;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${RESET_MAIL_PAGE_BG};padding:24px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;">
        <tr>
          <td style="padding:40px;">
            <h1 style="margin:0 0 24px;font-size:22px;line-height:1.3;font-weight:700;color:${RESET_MAIL_PRIMARY};">Reset your password</h1>
            <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#333333;">We received a request to reset the password for your ${brandHyphen} account.</p>
            <p style="margin:0 0 28px;font-size:16px;line-height:1.5;color:#333333;">Click the button below to choose a new password.</p>
            <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 28px;">
              <tr>
                <td style="border-radius:6px;background-color:${RESET_MAIL_PRIMARY};">
                  <a href="${resetLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:6px;">Reset Password</a>
                </td>
              </tr>
            </table>
            <p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#333333;">This link expires in 1 hour. If you did not request a password reset, you can safely ignore this email.</p>
            <p style="margin:0 0 24px;font-size:16px;line-height:1.5;color:#333333;">Thanks,<br>The ${RESET_MAIL_PLATFORM_NAME} Team</p>
            <p style="margin:0;font-size:12px;line-height:1.5;color:#888888;text-align:center;">&copy; 2026 ${RESET_MAIL_PLATFORM_NAME}. All rights reserved.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

const forgotPassword = async (req: Request, res: Response) => {
  const email = req.body?.email?.trim()?.toLowerCase();

  if (!email) {
    return res.status(400).json({ message: "Email is required" });
  }

  try {
    const user = await db
      .select({ id: usersTable.id, email: usersTable.email })
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    // Always return success to avoid leaking whether email exists
    if (user.length === 0) {
      return res.status(200).json({
        message:
          "If an account exists with this email, you will receive a password reset link shortly.",
      });
    }

    const secret = process.env.JWT_SECRET_KEY;
    if (!secret) {
      console.error("Forgot password: JWT_SECRET_KEY is not set");
      return res.status(500).json({
        message: "Something went wrong. Please try again later.",
      });
    }

    const userRow = user[0];
    if (!userRow) {
      return res.status(404).json({ message: "User not found" });
    }
    const resetToken = jwt.sign(
      { email: userRow.email, purpose: "password_reset" },
      secret,
      { expiresIn: RESET_TOKEN_EXPIRY } as jwt.SignOptions,
    );

    const resetLink = `${BASE_URL}/resetPassword?token=${encodeURIComponent(resetToken)}`;

    try {
      const transporter = emailConfig();
      await transporter.sendMail({
        from: {
          name: RESET_MAIL_PLATFORM_NAME,
          address: process.env.SENDER_EMAIL_ID || "",
        },
        to: email,
        subject: `Reset your ${RESET_MAIL_PLATFORM_NAME} password`,
        html: resetPasswordEmailTemplate(resetLink),
      });
    } catch (emailErr: unknown) {
      console.error("Forgot password: email send failed", emailErr);
      return res.status(200).json({
        message:
          "If an account exists with this email, you will receive a password reset link shortly.",
      });
    }

    return res.status(200).json({
      message:
        "If an account exists with this email, you will receive a password reset link shortly.",
    });
  } catch (err: unknown) {
    console.error("Forgot password error:", err);
    return res.status(500).json({
      message: "Something went wrong. Please try again later.",
    });
  }
};

export default forgotPassword;
