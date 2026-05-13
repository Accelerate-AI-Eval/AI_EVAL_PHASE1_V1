import express from "express";
import insertVendorOnboarding from "../controllers/vendorOnboarding/addVendor.controllers.js";
import fetchVendorOnboarding from "../controllers/vendorOnboarding/fetchVendorOnboarding.controller.js";
import updatePublicDirectoryListing from "../controllers/vendorOnboarding/updatePublicDirectoryListing.controller.js";
import listPublicVendors from "../controllers/vendorOnboarding/listPublicVendors.controller.js";
import listVendorDirectoryAssessmentProducts from "../controllers/vendorOnboarding/listVendorDirectoryAssessmentProducts.controller.js";
import listVendorVisibleProducts from "../controllers/vendorOnboarding/listVendorVisibleProducts.controller.js";
import getVendorProductDetail from "../controllers/vendorOnboarding/getVendorProductDetail.controller.js";
import saveVendorOnboardingProgress from "../controllers/vendorOnboarding/saveVendorOnboardingProgress.controller.js";
import clearBuyerOnboarding from "../controllers/buyerOnboarding/clearBuyerOnboarding.controller.js";
import onboardingAccess from "../middlewares/onboarding/onboardingTokenVerify.middleware.js";
import authenticateToken from "../middlewares/routesProtection.js";

const vendorRoutes = express.Router();

/*
 * public_directory_listing (DB) / publicDirectoryListing (API & Drizzle):
 * - PostgreSQL column on public.vendor_onboarding; see vendorDirectoryAttestationScope.ts header for full map.
 * - GET /vendorOnboarding exposes data.publicDirectoryListing; PATCH .../public-directory-listing sets it.
 * - Buyer routes below also require this flag (plus org active + visible products) except admin ?scope=all.
 * - May be set true automatically when a product is marked visible to buyers (PATCH attestation visibility).
 */
// GET: Fetch vendor onboarding data for the logged-in user (JWT required)
vendorRoutes.get("/vendorOnboarding", authenticateToken, fetchVendorOnboarding);
// PATCH: Sets vendor_onboarding.public_directory_listing (org-wide; Product Profile toggle when uncommented)
vendorRoutes.patch("/vendorOnboarding/public-directory-listing", authenticateToken, updatePublicDirectoryListing);

// GET: Vendors with public_directory_listing = true (buyer Vendor Portal directory)
vendorRoutes.get("/vendorDirectory", authenticateToken, listPublicVendors);
// GET: Products this user has used in COTS assessments (must be before :vendorId routes)
vendorRoutes.get("/vendorDirectory/assessment-products", authenticateToken, listVendorDirectoryAssessmentProducts);
// GET: List products visible to buyers for a vendor (only COMPLETED + visible_to_buyer)
vendorRoutes.get("/vendorDirectory/:vendorId/products", authenticateToken, listVendorVisibleProducts);
// GET: Full product detail for buyer (only if visible to buyers)
vendorRoutes.get("/vendorDirectory/:vendorId/products/:productId", authenticateToken, getVendorProductDetail);

vendorRoutes.post(
  "/vendorOnboarding",
  onboardingAccess,
  insertVendorOnboarding,
);
vendorRoutes.post(
  "/vendorOnboarding/save-progress",
  onboardingAccess,
  saveVendorOnboardingProgress,
);
vendorRoutes.post(
  "/vendorOnboarding/clear-buyer",
  onboardingAccess,
  clearBuyerOnboarding,
);

export default vendorRoutes;
