import type { Request, Response } from "express";
import { db } from "../../database/db.js";
import { pool } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { assessments } from "../../schema/assessments/assessments.js";
import { cotsVendorAssessments } from "../../schema/assessments/cotsVendorAssessments.js";
import { eq, and } from "drizzle-orm";
import { assessmentUserArchiveLog } from "../../schema/assessments/assessmentUserArchiveLog.js";

function isUserArchiveBlocked(user: Record<string, unknown>) {
  const role = String(user.role ?? "").toLowerCase().trim();
  const platform = String(user.user_platform_role ?? "")
    .toLowerCase()
    .replace(/_/g, " ");
  return role === "viewer" || platform === "system viewer";
}

function isTimeExpiredAt(expiryAt: Date | string | null | undefined) {
  if (expiryAt == null) return false;
  try {
    const d = new Date(expiryAt);
    if (Number.isNaN(d.getTime())) return false;
    const today = new Date();
    d.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return d.getTime() < today.getTime();
  } catch {
    return false;
  }
}

async function getAttestationExpiryForCotsVendor(assessmentId: string): Promise<Date | null> {
  const [cots] = await db
    .select({ attestationId: cotsVendorAssessments.vendor_attestation_id })
    .from(cotsVendorAssessments)
    .where(eq(cotsVendorAssessments.assessment_id, assessmentId))
    .limit(1);
  if (!cots?.attestationId) return null;
  const { rows } = await pool.query<{ expiry_at: Date }>(
    `SELECT vsa.expiry_at FROM vendor_self_attestations vsa
     WHERE (vsa.vendor_self_attestation_id = $1::uuid OR vsa.id = $1::uuid) LIMIT 1`,
    [String(cots.attestationId)],
  );
  const t = rows[0]?.expiry_at;
  return t instanceof Date ? t : t != null ? new Date(t) : null;
}

/**
 * PATCH /assessments/:id/user-archive
 * Body: { "userArchived": true, "reason": "..." } / { "userArchived": false, "reason": "..." }.
 * Reason is required; each change is logged with user id in assessment_user_archive_log.
 */
const patchAssessmentUserArchive = async (req: Request, res: Response) => {
  try {
    const decoded = req.user as { id?: number } | undefined;
    const userId = decoded?.id;
    if (userId == null) return res.status(401).json({ message: "User not found from token" });
    const id = (req.params as { id?: string }).id;
    if (!id) return res.status(400).json({ message: "Assessment ID required" });
    const body = req.body as { userArchived?: boolean; reason?: string };
    if (typeof body?.userArchived !== "boolean") {
      return res.status(400).json({ message: "body.userArchived must be a boolean" });
    }
    const reasonRaw = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (reasonRaw.length === 0) {
      return res.status(400).json({ message: "A reason is required for this change." });
    }
    if (reasonRaw.length > 4000) {
      return res.status(400).json({ message: "Reason must be 4000 characters or less." });
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, Number(userId)))
      .limit(1);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (isUserArchiveBlocked(user as Record<string, unknown>)) {
      return res.status(403).json({ message: "View-only access cannot change archive state." });
    }
    const orgId = String(
      (user as { organization_id?: number | null }).organization_id ?? "",
    ).trim();
    if (!orgId) return res.status(400).json({ message: "User has no organization" });

    const [a] = await db
      .select()
      .from(assessments)
      .where(and(eq(assessments.id, id), eq(assessments.organization_id, orgId)))
      .limit(1);
    if (!a) return res.status(404).json({ message: "Assessment not found" });

    const status = String(a.status ?? "").toLowerCase();
    const aRow = a as { expiry_at?: Date | null; type?: string; user_archived_at?: Date | null };
    if (body.userArchived) {
      if (status !== "submitted") {
        return res.status(400).json({
          message: "Only completed (submitted) assessments can be archived.",
        });
      }
      if (isTimeExpiredAt(aRow.expiry_at)) {
        return res
          .status(400)
          .json({ message: "This assessment is already past its expiry; it appears in Archived automatically." });
      }
      if (aRow.type === "cots_vendor") {
        const attEx = await getAttestationExpiryForCotsVendor(id);
        if (isTimeExpiredAt(attEx)) {
          return res.status(400).json({ message: "The linked attestation is expired; this assessment cannot be archived manually." });
        }
      }
      const now = new Date();
      const uid = Number(userId);
      await db.transaction(async (tx) => {
        await tx
          .update(assessments)
          .set({ user_archived_at: now, updated_at: now })
          .where(eq(assessments.id, id));
        await tx.insert(assessmentUserArchiveLog).values({
          assessment_id: id,
          user_id: uid,
          action: "archive",
          reason: reasonRaw,
        });
      });
      return res.status(200).json({ message: "Assessment archived", userArchivedAt: now.toISOString() });
    }

    if (status !== "submitted") {
      return res.status(400).json({ message: "Only completed assessments can be restored from the archive list." });
    }
    if (aRow.user_archived_at == null) {
      return res.status(400).json({ message: "Assessment is not in the user archive." });
    }
    if (isTimeExpiredAt(aRow.expiry_at)) {
      return res.status(400).json({ message: "Cannot restore: assessment is past its expiry date." });
    }
    if (aRow.type === "cots_vendor") {
      const attEx = await getAttestationExpiryForCotsVendor(id);
      if (isTimeExpiredAt(attEx)) {
        return res.status(400).json({ message: "Cannot restore: linked attestation is expired." });
      }
    }
    const nowR = new Date();
    const uid2 = Number(userId);
    await db.transaction(async (tx) => {
      await tx
        .update(assessments)
        .set({ user_archived_at: null, updated_at: nowR })
        .where(eq(assessments.id, id));
      await tx.insert(assessmentUserArchiveLog).values({
        assessment_id: id,
        user_id: uid2,
        action: "reactive",
        reason: reasonRaw,
      });
    });
    return res.status(200).json({ message: "Assessment restored to Current", userArchivedAt: null });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const isMissingCol = /user_archived_at|assessment_user_archive_log|does not exist|42703/i.test(msg);
    console.error("patchAssessmentUserArchive:", error);
    return res.status(500).json({
      message: isMissingCol
        ? "Database may be missing columns or the audit log table. Run migrations 20260423_add_user_archived_at_to_assessments.sql and 20260424_assessment_user_archive_log.sql"
        : "Internal server error",
    });
  }
};

export default patchAssessmentUserArchive;
