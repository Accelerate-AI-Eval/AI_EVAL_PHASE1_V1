import type { Request, Response } from "express";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { vendorSelfAttestations } from "../../schema/assessments/vendorSelfAttestations.js";
import { vendorSelfAttestationUserArchiveLog } from "../../schema/assessments/vendorSelfAttestationUserArchiveLog.js";
import { createOrganization } from "../../schema/organizations/organizations.js";
import { and, eq, or } from "drizzle-orm";

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

/**
 * PATCH /vendorSelfAttestation/:id/user-archive
 * Body: { userArchived: boolean, reason: string }.
 */
const patchVendorSelfAttestationUserArchive = async (req: Request, res: Response): Promise<void> => {
  try {
    const decoded = req.user as { id?: number } | undefined;
    const userId = decoded?.id;
    if (userId == null) {
      res.status(401).json({ success: false, message: "User not found from token" });
      return;
    }
    const id = (req.params as { id?: string }).id;
    if (!id) {
      res.status(400).json({ success: false, message: "Attestation ID required" });
      return;
    }
    const body = req.body as { userArchived?: boolean; reason?: string };
    if (typeof body?.userArchived !== "boolean") {
      res.status(400).json({ success: false, message: "body.userArchived must be a boolean" });
      return;
    }
    const reasonRaw = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (reasonRaw.length === 0) {
      res.status(400).json({ success: false, message: "A reason is required for this change." });
      return;
    }
    if (reasonRaw.length > 4000) {
      res.status(400).json({ success: false, message: "Reason must be 4000 characters or less." });
      return;
    }

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, Number(userId)))
      .limit(1);
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }
    if (isUserArchiveBlocked(user as Record<string, unknown>)) {
      res.status(403).json({ success: false, message: "View-only access cannot change archive state." });
      return;
    }
    const orgIdRaw = (user as { organization_id?: number | null }).organization_id;
    const orgIdStr = orgIdRaw != null ? String(orgIdRaw) : "";
    let orgNameForFilter: string | null = null;
    const numOrgId = Number(orgIdStr);
    if (orgIdStr && Number.isInteger(numOrgId) && numOrgId >= 1) {
      const [orgRow] = await db
        .select({ organizationName: createOrganization.organizationName })
        .from(createOrganization)
        .where(eq(createOrganization.id, numOrgId))
        .limit(1);
      orgNameForFilter = orgRow?.organizationName ?? null;
    }
    const listWhere =
      orgIdStr || orgNameForFilter
        ? orgIdStr && orgNameForFilter
          ? or(
              eq(vendorSelfAttestations.organization_id, orgIdStr),
              eq(vendorSelfAttestations.organization_id, orgNameForFilter),
            )
          : eq(vendorSelfAttestations.organization_id, orgIdStr || orgNameForFilter || "")
        : eq(vendorSelfAttestations.user_id, userId);
    const whereSingle = and(eq(vendorSelfAttestations.id, id), listWhere);
    const [a] = await db.select().from(vendorSelfAttestations).where(whereSingle).limit(1);
    if (!a) {
      res.status(404).json({ success: false, message: "Attestation not found" });
      return;
    }
    const status = String(a.status ?? "").toLowerCase();
    const aRow = a as { expiry_at?: Date | null; user_archived_at?: Date | null };
    if (body.userArchived) {
      if (status !== "completed") {
        res
          .status(400)
          .json({ success: false, message: "Only completed (submitted) attestations can be archived." });
        return;
      }
      if (isTimeExpiredAt(aRow.expiry_at)) {
        res.status(400).json({
          success: false,
          message: "This attestation is already past its expiry; it appears in Archived automatically.",
        });
        return;
      }
      const now = new Date();
      const uid = Number(userId);
      await db.transaction(async (tx) => {
        await tx
          .update(vendorSelfAttestations)
          .set({ user_archived_at: now, updated_at: now })
          .where(eq(vendorSelfAttestations.id, id));
        await tx.insert(vendorSelfAttestationUserArchiveLog).values({
          vendor_self_attestation_id: id,
          user_id: uid,
          action: "archive",
          reason: reasonRaw,
        });
      });
      res
        .status(200)
        .json({ success: true, message: "Attestation archived", userArchivedAt: now.toISOString() });
      return;
    }
    if (status !== "completed") {
      res
        .status(400)
        .json({ success: false, message: "Only completed attestations can be restored from the archive list." });
      return;
    }
    if (aRow.user_archived_at == null) {
      res.status(400).json({ success: false, message: "Attestation is not in the user archive." });
      return;
    }
    if (isTimeExpiredAt(aRow.expiry_at)) {
      res.status(400).json({ success: false, message: "Cannot restore: attestation is past its expiry date." });
      return;
    }
    const nowR = new Date();
    const uid2 = Number(userId);
    await db.transaction(async (tx) => {
      await tx
        .update(vendorSelfAttestations)
        .set({ user_archived_at: null, updated_at: nowR })
        .where(eq(vendorSelfAttestations.id, id));
      await tx.insert(vendorSelfAttestationUserArchiveLog).values({
        vendor_self_attestation_id: id,
        user_id: uid2,
        action: "reactive",
        reason: reasonRaw,
      });
    });
    res.status(200).json({ success: true, message: "Attestation restored to Current", userArchivedAt: null });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const isMissingCol =
      /user_archived_at|vendor_self_attestation_user_archive_log|does not exist|42703/i.test(msg);
    console.error("patchVendorSelfAttestationUserArchive:", error);
    res.status(500).json({
      success: false,
      message: isMissingCol
        ? "Database may be missing attestation user-archive migration. Run 20260425 and 20260426 SQL migrations."
        : "Internal server error",
    });
  }
};

export default patchVendorSelfAttestationUserArchive;
