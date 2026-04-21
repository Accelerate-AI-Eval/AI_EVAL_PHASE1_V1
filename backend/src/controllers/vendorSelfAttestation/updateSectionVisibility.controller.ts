import type { Request, Response } from "express";
import { db } from "../../database/db.js";
import { vendorSelfAttestations } from "../../schema/schema.js";
import { and, eq } from "drizzle-orm";

type SectionKey =
  | "visible_ai_governance"
  | "visible_security_posture"
  | "visible_data_privacy"
  | "visible_compliance"
  | "visible_model_risk"
  | "visible_data_practices"
  | "visible_compliance_certifications"
  | "visible_operations_support"
  | "visible_vendor_management"
  | "visible_company_identity"
  | "visible_company_reach";

/**
 * PATCH /vendorSelfAttestation/section-visibility
 * Body: { attestationId: string, visible_ai_governance?: boolean, visible_security_posture?: boolean, visible_data_privacy?: boolean, visible_compliance?: boolean, visible_model_risk?: boolean }
 * Updates which detail sections are visible to buyers. Only the attestation owner can update.
 *
 * IMPORTANT: Product Profile toggle – must NOT update attestation submission metadata.
 * We only set section visibility fields. Do NOT set updated_at or submitted_at here.
 * submitted_at is set only in submitVendorSelfAttestation when status becomes COMPLETED.
 */
const updateSectionVisibility = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = req.user as { id?: number; userId?: string | number } | undefined;
    const rawId = payload?.id ?? payload?.userId;
    const userId = rawId != null ? Number(rawId) : NaN;

    if (!Number.isInteger(userId) || userId < 1) {
      res.status(401).json({ success: false, message: "User not authenticated" });
      return;
    }

    const body = req.body ?? {};
    const attestationId =
      typeof body.attestationId === "string" ? body.attestationId.trim() : null;

    if (!attestationId) {
      res.status(400).json({ success: false, message: "attestationId is required" });
      return;
    }

    const sectionKeys: SectionKey[] = [
      "visible_ai_governance",
      "visible_security_posture",
      "visible_data_privacy",
      "visible_compliance",
      "visible_model_risk",
      "visible_data_practices",
      "visible_compliance_certifications",
      "visible_operations_support",
      "visible_vendor_management",
      "visible_company_identity",
      "visible_company_reach",
    ];

    const updates: Record<string, boolean> = {};
    for (const key of sectionKeys) {
      if (typeof body[key] === "boolean") updates[key] = body[key];
      else if (body[key] === "true" || body[key] === true) updates[key] = true;
      else if (body[key] === "false" || body[key] === false) updates[key] = false;
    }

    if (Object.keys(updates).length === 0) {
      res.status(200).json({ success: true, message: "No section visibility changes." });
      return;
    }

    // Only update section visibility; do not touch updated_at so attestation "Submitted" date is unchanged
    const result = await db
      .update(vendorSelfAttestations)
      .set(updates)
      .where(
        and(
          eq(vendorSelfAttestations.id, attestationId),
          eq(vendorSelfAttestations.user_id, userId)
        )
      )
      .returning({ id: vendorSelfAttestations.id });

    if (!result || result.length === 0) {
      res.status(404).json({
        success: false,
        message: "Attestation not found or you do not have permission to update it.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Section visibility updated.",
    });
  } catch (error) {
    console.error("updateSectionVisibility error:", error);
    res.status(500).json({ success: false, message: "Could not update. Try again." });
  }
};

export default updateSectionVisibility;
