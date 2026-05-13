import type { Request, Response } from "express";
import { db } from "../../database/db.js";
import { vendors } from "../../schema/schema.js";
import { eq, sql } from "drizzle-orm";

/**
 * Fetch vendor onboarding data for the currently authenticated user.
 * Uses userId from JWT (req.user) to look up the vendor_onboarding row.
 * Returns empty object when no record exists so the frontend can show an empty form.
 *
 * Response data includes publicDirectoryListing (Public Directory Listing): org-level flag for whether
 * the vendor is opted into the buyer-facing directory. Same row is updated by PATCH
 * /vendorOnboarding/public-directory-listing. Ensures public_directory_listing exists
 * (ADD COLUMN IF NOT EXISTS) before selecting so older DBs do not throw "column does not exist".
 */
const fetchVendorOnboarding = async (req: Request, res: Response): Promise<void> => {
  try {
    // --- 1. Ensure user is authenticated (userId from JWT / request context) ---
    const payload = req.user as { id?: number; userId?: string | number } | undefined;
    const rawId = payload?.id ?? payload?.userId;
    const userId = rawId != null ? Number(rawId) : NaN;

    if (!Number.isInteger(userId) || userId < 1) {
      res.status(401).json({
        success: false,
        message: "User not authenticated or invalid user identifier",
        data: {},
      });
      return;
    }

    // --- 2. vendor_onboarding.public_directory_listing: ensure column exists before select (legacy DBs) ---
    try {
      await db.execute(sql`
        ALTER TABLE public.vendor_onboarding
        ADD COLUMN IF NOT EXISTS public_directory_listing boolean NOT NULL DEFAULT false
      `);
    } catch {
      // Ignore (e.g. permission)
    }

    // --- 3. Fetch vendor record by userId ---
    const colMissing = /public_directory_listing|does not exist|column .* does not exist/i;
    let row: Record<string, unknown> | null = null;
    let publicListing = false;
    try {
      const fullRows = await db.select().from(vendors).where(eq(vendors.userId, userId)).limit(1);
      const r = fullRows[0];
      if (r) {
        row = r as Record<string, unknown>;
        publicListing = Boolean(row.publicDirectoryListing ?? row.public_directory_listing);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!colMissing.test(msg)) throw err;
      // Column still missing (e.g. ALTER had no permission): select without it
      const fallbackRows = await db
        .select({
          userId: vendors.userId,
          organizationId: vendors.organizationId,
          vendorName: vendors.vendorName,
          vendorType: vendors.vendorType,
          sector: vendors.sector,
          vendorMaturity: vendors.vendorMaturity,
          companyWebsite: vendors.companyWebsite,
          companyDescription: vendors.companyDescription,
          primaryContactName: vendors.primaryContactName,
          primaryContactEmail: vendors.primaryContactEmail,
          primaryContactRole: vendors.primaryContactRole,
          employeeCount: vendors.employeeCount,
          yearFounded: vendors.yearFounded,
          headquartersLocation: vendors.headquartersLocation,
          operatingRegions: vendors.operatingRegions,
        })
        .from(vendors)
        .where(eq(vendors.userId, userId))
        .limit(1);
      row = (fallbackRows[0] ?? null) as Record<string, unknown> | null;
    }

    // --- 4. Return clean JSON: data object or empty placeholder when no record ---
    if (!row) {
      res.status(200).json({
        success: true,
        message: "No vendor onboarding data found",
        data: {},
      });
      return;
    }

    // Map DB row to a clean API shape (camelCase, optional parsing of JSON fields)
    const sectorRaw = row.sector;
    let sector: Record<string, unknown> | string = {};
    if (typeof sectorRaw === "string") {
      try {
        const parsed = JSON.parse(sectorRaw);
        sector = typeof parsed === "object" && parsed !== null ? parsed : {};
      } catch {
        sector = {};
      }
    } else if (sectorRaw != null && typeof sectorRaw === "object") {
      sector = sectorRaw as Record<string, unknown>;
    }

    const data = {
      userId: row.userId,
      organizationId: row.organizationId,
      vendorName: row.vendorName ?? "",
      vendorType: row.vendorType ?? "",
      sector: sector ?? {},
      vendorMaturity: row.vendorMaturity ?? "",
      companyWebsite: row.companyWebsite ?? "",
      companyDescription: row.companyDescription ?? "",
      primaryContactName: row.primaryContactName ?? "",
      primaryContactEmail: row.primaryContactEmail ?? "",
      primaryContactRole: row.primaryContactRole ?? "",
      employeeCount: row.employeeCount ?? "",
      yearFounded: row.yearFounded ?? null,
      headquartersLocation: row.headquartersLocation ?? "",
      operatingRegions: Array.isArray(row.operatingRegions)
        ? row.operatingRegions
        : row.operatingRegions != null && typeof row.operatingRegions === "object"
          ? (row.operatingRegions as string[])
          : [],
      // Public Directory Listing (see vendorOnboarding.routes block comment)
      publicDirectoryListing: publicListing,
    };

    res.status(200).json({
      success: true,
      message: "Vendor onboarding data fetched successfully",
      data,
    });
  } catch (error) {
    // --- 4. Handle database and unexpected errors ---
    console.error("fetchVendorOnboarding error:", error);
    res.status(500).json({
      success: false,
      message: "Database or server error",
      data: {},
    });
  }
};

export default fetchVendorOnboarding;
