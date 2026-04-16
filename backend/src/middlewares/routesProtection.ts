import jwt from "jsonwebtoken";
import type { JwtPayload } from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { getJwtSecret } from "../config/auth.js";
import { db } from "../database/db.js";
import { createOrganization, usersTable } from "../schema/schema.js";

interface AuthRequest extends Request {
  user?: string | JwtPayload;
}

function parseTokenUserId(decoded: unknown): number | null {
  if (decoded == null || typeof decoded !== "object" || Array.isArray(decoded)) {
    return null;
  }
  const p = decoded as Record<string, unknown>;
  const raw = p.id ?? p.userId;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** True when the user's organization row exists and organizationStatus is active. */
async function isUserOrganizationActive(userId: number): Promise<boolean> {
  const rows = await db
    .select({ organizationStatus: createOrganization.organizationStatus })
    .from(usersTable)
    .leftJoin(createOrganization, eq(usersTable.organization_id, createOrganization.id))
    .where(eq(usersTable.id, userId))
    .limit(1);
  const orgStatus = String(rows[0]?.organizationStatus ?? "").trim().toLowerCase();
  return orgStatus === "active";
}

const authenticateToken = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ message: "Token missing" });

  const JWT_SECRET = getJwtSecret();
  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      const isExpired = err.name === "TokenExpiredError";
      return res
        .status(isExpired ? 401 : 403)
        .json({ message: isExpired ? "Token expired" : "Token invalid or expired" });
    }

    void (async () => {
      try {
        const userId = parseTokenUserId(decoded);
        if (userId != null) {
          const active = await isUserOrganizationActive(userId);
          if (!active) {
            return res.status(403).json({
              code: "organization_inactive",
              message:
                "Your organization is inactive. Access is denied. Please contact your administrator.",
            });
          }
        }
        if (decoded !== undefined) req.user = decoded;
        next();
      } catch (e) {
        console.error("authenticateToken organization check:", e);
        return res.status(500).json({ message: "Authorization check failed" });
      }
    })();
  });
};

export default authenticateToken;
