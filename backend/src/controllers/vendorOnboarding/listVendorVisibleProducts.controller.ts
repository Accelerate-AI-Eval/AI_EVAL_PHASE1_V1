import type { Request, Response } from "express";
import { db } from "../../database/db.js";
import { vendors, vendorSelfAttestations, usersTable, generatedProfileReports } from "../../schema/schema.js";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

function firstNonEmptyText(...vals: (string | null | undefined)[]): string | undefined {
  for (const v of vals) {
    const t = typeof v === "string" ? v.trim() : "";
    if (t) return t;
  }
  return undefined;
}

/**
 * GET /vendorDirectory/:vendorId/products
 * Returns only products (attestations) that are COMPLETED, visible_to_buyer = true,
 * and not archived (expiry_at null or in the future). Vendor must have publicDirectoryListing = true.
 * Query ?all=true (system admin only): returns all attestations for this vendor (any status).
 */
const listVendorVisibleProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const vendorId = typeof req.params?.vendorId === "string" ? req.params.vendorId.trim() : null;
    if (!vendorId) {
      res.status(400).json({ success: false, message: "Vendor ID is required" });
      return;
    }

    const allProducts = typeof req.query?.all === "string" && req.query.all.trim().toLowerCase() === "true";
    let isSystemAdmin = false;
    if (allProducts) {
      const payload = req.user as { id?: number; userId?: string | number } | undefined;
      const rawId = payload?.id ?? payload?.userId;
      const userId = rawId != null ? Number(rawId) : NaN;
      if (Number.isInteger(userId) && userId >= 1) {
        const [row] = await db
          .select({ user_platform_role: usersTable.user_platform_role, role: usersTable.role, organization_id: usersTable.organization_id })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);
        const r = row as Record<string, unknown> | undefined;
        const platformRole = String(r?.user_platform_role ?? "").trim().toLowerCase();
        const role = String(r?.role ?? "").trim().toLowerCase();
        const orgId = r?.organization_id;
        isSystemAdmin =
          platformRole === "system admin" ||
          platformRole === "system_admin" ||
          platformRole === "systemadmin" ||
          (Number(orgId) === 1 && role === "admin");
      }
    }

    const [vendor] = await db
      .select({
        id: vendors.id,
        userId: vendors.userId,
        publicDirectoryListing: vendors.publicDirectoryListing,
      })
      .from(vendors)
      .where(eq(vendors.id, vendorId))
      .limit(1);

    if (!vendor) {
      res.status(404).json({ success: false, message: "Vendor not found" });
      return;
    }

    if (!allProducts && !vendor.publicDirectoryListing) {
      res.status(200).json({ success: true, products: [] });
      return;
    }

    const vendorUserId = vendor.userId != null ? Number(vendor.userId) : null;
    if (vendorUserId == null) {
      res.status(200).json({ success: true, products: [] });
      return;
    }

    const rows =
      allProducts && isSystemAdmin
        ? await db
            .select({
              id: vendorSelfAttestations.id,
              product_name: vendorSelfAttestations.product_name,
              status: vendorSelfAttestations.status,
              updated_at: vendorSelfAttestations.updated_at,
              visible_to_buyer: vendorSelfAttestations.visible_to_buyer,
              target_industries: vendorSelfAttestations.target_industries,
              market_product_material: vendorSelfAttestations.market_product_material,
              unique_solution: vendorSelfAttestations.unique_solution,
              tech_product_specifications: vendorSelfAttestations.tech_product_specifications,
            })
            .from(vendorSelfAttestations)
            .where(eq(vendorSelfAttestations.user_id, vendorUserId))
            .orderBy(desc(vendorSelfAttestations.updated_at))
        : await db
            .select({
              id: vendorSelfAttestations.id,
              product_name: vendorSelfAttestations.product_name,
              status: vendorSelfAttestations.status,
              updated_at: vendorSelfAttestations.updated_at,
              visible_to_buyer: vendorSelfAttestations.visible_to_buyer,
              target_industries: vendorSelfAttestations.target_industries,
              market_product_material: vendorSelfAttestations.market_product_material,
              unique_solution: vendorSelfAttestations.unique_solution,
              tech_product_specifications: vendorSelfAttestations.tech_product_specifications,
            })
            .from(vendorSelfAttestations)
            .where(
              and(
                eq(vendorSelfAttestations.user_id, vendorUserId),
                eq(vendorSelfAttestations.status, "COMPLETED"),
                eq(vendorSelfAttestations.visible_to_buyer, true),
                sql`(${vendorSelfAttestations.expiry_at} IS NULL OR ${vendorSelfAttestations.expiry_at} >= now())`
              )
            )
            .orderBy(desc(vendorSelfAttestations.updated_at));

    const attestationIds = rows.map((r) => r.id).filter((id): id is string => id != null && String(id).trim() !== "");
    /**
     * Trust score per product from report column (same as Product Profile):
     * report.trustScore.overallScore from generated_profile_reports.report (latest report per attestation).
     * Fallback to trust_score column if overallScore is missing in report JSON.
     */
    const trustScoreByAttestation: Record<string, number> = {};
    const trustSummaryByAttestation: Record<string, string> = {};
    if (attestationIds.length > 0) {
      const reportRows = await db
        .select({
          attestation_id: generatedProfileReports.attestation_id,
          report: generatedProfileReports.report,
          trust_score: generatedProfileReports.trust_score,
        })
        .from(generatedProfileReports)
        .where(inArray(generatedProfileReports.attestation_id, attestationIds))
        .orderBy(desc(generatedProfileReports.created_at));
      for (const row of reportRows) {
        const aid = row.attestation_id != null ? String(row.attestation_id) : "";
        if (!aid) continue;
        let report = row.report as Record<string, unknown> | string | null | undefined;
        if (typeof report === "string") {
          try {
            report = JSON.parse(report) as Record<string, unknown>;
          } catch {
            report = null;
          }
        }
        const ts = report?.trustScore as Record<string, unknown> | null | undefined;
        if (trustScoreByAttestation[aid] === undefined) {
          const overallScore = typeof ts?.overallScore === "number" ? ts.overallScore : null;
          const col = row.trust_score != null && Number.isFinite(Number(row.trust_score)) ? Number(row.trust_score) : null;
          const val = overallScore ?? col;
          if (val != null && Number.isFinite(val)) trustScoreByAttestation[aid] = val;
        }
        if (trustSummaryByAttestation[aid] === undefined) {
          const summ = typeof ts?.summary === "string" ? ts.summary.trim() : "";
          if (summ) trustSummaryByAttestation[aid] = summ;
        }
      }
    }

    const products = rows.map((r) => {
      const apiStatus = (r.status ?? "").toUpperCase();
      const status = apiStatus === "COMPLETED" ? "Completed" : apiStatus === "REJECTED" ? "Rejected" : "Draft";
      const idStr = r.id != null ? String(r.id) : "";
      const trustScore = idStr ? (trustScoreByAttestation[idStr] ?? null) : null;
      const productDescription = firstNonEmptyText(
        r.market_product_material,
        r.unique_solution,
        r.tech_product_specifications,
        idStr ? trustSummaryByAttestation[idStr] : undefined,
      );
      const sectorRaw = r.target_industries;
      let sector: Record<string, unknown> | string | null = null;
      if (sectorRaw != null && typeof sectorRaw === "object" && !Array.isArray(sectorRaw)) {
        sector = sectorRaw as Record<string, unknown>;
      } else if (typeof sectorRaw === "string" && sectorRaw.trim()) {
        try {
          const p = JSON.parse(sectorRaw) as Record<string, unknown>;
          sector = typeof p === "object" && p !== null ? p : null;
        } catch {
          sector = sectorRaw;
        }
      }
      return {
        id: r.id,
        productName: (r.product_name ?? "").trim() || "Product",
        status,
        updated_at: r.updated_at ?? null,
        /** Echo for clients (admin ?all=true may include non-visible rows). */
        visible_to_buyer: Boolean(r.visible_to_buyer),
        trustScore,
        summary: idStr ? trustSummaryByAttestation[idStr] : undefined,
        /** Product-facing blurb for directory cards (attestation fields, then trust report summary). */
        productDescription: productDescription ?? undefined,
        sector: sector ?? undefined,
      };
    });

    res.status(200).json({
      success: true,
      products,
    });
  } catch (e) {
    console.error("listVendorVisibleProducts error:", e);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export default listVendorVisibleProducts;
