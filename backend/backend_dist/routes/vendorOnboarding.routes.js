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
// GET: Fetch vendor onboarding data for the logged-in user (JWT required)
vendorRoutes.get("/vendorOnboarding", authenticateToken, fetchVendorOnboarding);
// PATCH: Vendor sets Public Directory Listing on/off (dashboard toggle)
vendorRoutes.patch("/vendorOnboarding/public-directory-listing", authenticateToken, updatePublicDirectoryListing);
// GET: List vendors who have Public Directory Listing on (for buyer Vendor Portal)
vendorRoutes.get("/vendorDirectory", authenticateToken, listPublicVendors);
// GET: Products this user has used in COTS assessments (must be before :vendorId routes)
vendorRoutes.get("/vendorDirectory/assessment-products", authenticateToken, listVendorDirectoryAssessmentProducts);
// GET: List products visible to buyers for a vendor (only COMPLETED + visible_to_buyer)
vendorRoutes.get("/vendorDirectory/:vendorId/products", authenticateToken, listVendorVisibleProducts);
// GET: Full product detail for buyer (only if visible to buyers)
vendorRoutes.get("/vendorDirectory/:vendorId/products/:productId", authenticateToken, getVendorProductDetail);
vendorRoutes.post("/vendorOnboarding", onboardingAccess, insertVendorOnboarding);
vendorRoutes.post("/vendorOnboarding/save-progress", onboardingAccess, saveVendorOnboardingProgress);
vendorRoutes.post("/vendorOnboarding/clear-buyer", onboardingAccess, clearBuyerOnboarding);
export default vendorRoutes;
