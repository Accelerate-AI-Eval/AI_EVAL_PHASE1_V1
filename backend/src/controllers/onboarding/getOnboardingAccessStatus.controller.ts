import type { Request, Response } from "express";
import { eq } from "drizzle-orm";
import jwt from "jsonwebtoken";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";

/**
 * GET /onboarding/access-status — Bearer: onboarding JWT (same as invite/signup link).
 * Returns whether the user has already finished onboarding (so the SPA can redirect).
 * Does not return 409 for completed users (unlike POST onboarding routes).
 */
export default async function getOnboardingAccessStatus(req: Request, res: Response) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Missing token" });
    }
    const token = authHeader.split(" ")[1];
    let decoded: jwt.JwtPayload | string;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET_KEY ?? "fallback-secret");
    } catch {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const payload = typeof decoded === "object" && decoded !== null ? decoded : null;
    const email = payload && "email" in payload ? String((payload as { email?: string }).email ?? "") : "";
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

    return res.status(200).json({
      onboardingCompleted: found.user_onboarding_completed === "true",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Internal server error" });
  }
}
