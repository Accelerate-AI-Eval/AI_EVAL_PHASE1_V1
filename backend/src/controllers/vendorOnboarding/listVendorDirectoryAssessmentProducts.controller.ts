import type { Request, Response } from "express";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { eq } from "drizzle-orm";
import { listDirectoryProductsFromAssessments } from "../../services/vendorDirectoryAssessmentProducts.js";

/**
 * GET /vendorDirectory/assessment-products
 * Products the current user has referenced in COTS assessments (buyer: vendor + product fields;
 * vendor: vendor COTS with selected product). Used for AI Vendor Directory "My Products" tab.
 * Includes products even when the vendor organization is inactive so buyers keep visibility to assessments they referenced.
 */
const listVendorDirectoryAssessmentProducts = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = req.user as { id?: number; userId?: string | number; email?: string } | undefined;
    let rawId = payload?.id ?? payload?.userId;
    let userId = rawId != null ? Number(rawId) : NaN;

    if ((!Number.isInteger(userId) || userId < 1) && payload?.email) {
      const [u] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .where(eq(usersTable.email, String(payload.email).trim()))
        .limit(1);
      if (u) userId = u.id;
    }

    if (!Number.isInteger(userId) || userId < 1) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const products = await listDirectoryProductsFromAssessments(userId);
    res.status(200).json({ success: true, products });
  } catch (e) {
    console.error("listVendorDirectoryAssessmentProducts error:", e);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export default listVendorDirectoryAssessmentProducts;
