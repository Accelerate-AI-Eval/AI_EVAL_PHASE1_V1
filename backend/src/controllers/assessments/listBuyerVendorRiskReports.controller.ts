import type { Request, Response } from "express";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db, pool } from "../../database/db.js";
import { expireSubmittedAssessmentsAndArchiveBuyerReports } from "../../services/expireAndArchiveCotsBuyerAssessments.js";
import { usersTable } from "../../schema/schema.js";
import { assessments } from "../../schema/assessments/assessments.js";
import { cotsBuyerAssessments } from "../../schema/assessments/cotsBuyerAssessments.js";

/**
 * GET /buyerVendorRiskReports
 * Submitted buyer COTS assessments with a generated vendor risk report, for the user's org (newest first).
 * System Manager / Viewer: optional ?organizationId= when org not on user.
 */
const listBuyerVendorRiskReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = req.user as { id?: number; userId?: string | number } | undefined;
    const rawId = payload?.id ?? payload?.userId;
    const userId = rawId != null ? Number(rawId) : NaN;
    if (!Number.isInteger(userId) || userId < 1) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const [user] = await db
      .select({
        organization_id: usersTable.organization_id,
        user_platform_role: usersTable.user_platform_role,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    let orgId = user?.organization_id != null ? String(user.organization_id).trim() : "";
    const platformRole = (user?.user_platform_role ?? "").toString().trim().toLowerCase().replace(/_/g, " ");
    const isSystemManagerOrViewer =
      platformRole === "system manager" || platformRole === "system viewer";
    if (!orgId && isSystemManagerOrViewer) {
      const fromQuery =
        typeof req.query?.organizationId === "string" ? req.query.organizationId.trim() || "" : "";
      if (fromQuery) orgId = fromQuery;
    }

    if (!orgId) {
      res.status(200).json({ success: true, data: { reports: [] } });
      return;
    }

    await expireSubmittedAssessmentsAndArchiveBuyerReports(pool);

    const rows = await db
      .select({
        assessmentId: cotsBuyerAssessments.assessment_id,
        vendorName: cotsBuyerAssessments.vendor_name,
        productName: cotsBuyerAssessments.specific_product,
        updatedAt: assessments.updated_at,
        expiryAt: assessments.expiry_at,
        vendorRiskReport: cotsBuyerAssessments.vendor_risk_assessment_report,
      })
      .from(cotsBuyerAssessments)
      .innerJoin(assessments, eq(cotsBuyerAssessments.assessment_id, assessments.id))
      .where(
        and(
          eq(assessments.organization_id, orgId),
          eq(assessments.type, "cots_buyer"),
          eq(assessments.status, "submitted"),
          isNotNull(cotsBuyerAssessments.vendor_risk_assessment_report),
        ),
      )
      .orderBy(desc(assessments.updated_at))
      .limit(100);

    const reports = rows.map((r) => {
      const vendor = (r.vendorName ?? "").trim() || "Vendor";
      const product = (r.productName ?? "").trim() || "Product";
      const title = `${vendor} – ${product}`;
      const rep = r.vendorRiskReport;
      const repObj = rep != null && typeof rep === "object" ? (rep as Record<string, unknown>) : null;
      const irsRaw = repObj != null ? Number(repObj.implementationRiskScore) : NaN;
      const implementationRiskScore = Number.isFinite(irsRaw) ? Number(irsRaw.toFixed(2)) : null;
      return {
        id: `bvr-${r.assessmentId}`,
        source: "buyer_vendor_risk" as const,
        assessmentId: r.assessmentId,
        title,
        createdAt:
          r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt ?? ""),
        expiryAt:
          r.expiryAt instanceof Date ? r.expiryAt.toISOString() : (r.expiryAt != null ? String(r.expiryAt) : null),
        attestationExpiryAt: null as string | null,
        implementationRiskScore,
      };
    });

    res.status(200).json({ success: true, data: { reports } });
  } catch (e) {
    console.error("listBuyerVendorRiskReports:", e);
    res.status(500).json({ success: false, message: "Failed to list reports" });
  }
};

export default listBuyerVendorRiskReports;
