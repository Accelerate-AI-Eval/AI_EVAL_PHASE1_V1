import express from "express";
import fetchVendorSelfAttestation from "../controllers/vendorSelfAttestation/fetchVendorSelfAttestation.controller.js";
import submitVendorSelfAttestation from "../controllers/vendorSelfAttestation/submitVendorSelfAttestation.controller.js";
import getAttestationDocument from "../controllers/vendorSelfAttestation/getAttestationDocument.controller.js";
import { uploadAttestationDocument } from "../controllers/vendorSelfAttestation/uploadAttestationDocument.controller.js";
import updateAttestationVisibility from "../controllers/vendorSelfAttestation/updateAttestationVisibility.controller.js";
import updateSectionVisibility from "../controllers/vendorSelfAttestation/updateSectionVisibility.controller.js";
import generateProductProfile from "../controllers/vendorSelfAttestation/generateProductProfile.controller.js";
import listGeneratedReports from "../controllers/vendorSelfAttestation/listGeneratedReports.controller.js";
import authenticateToken from "../middlewares/routesProtection.js";
const router = express.Router();
// GET: Fetch company profile + attestation data for the logged-in vendor
router.get("/vendorSelfAttestation", authenticateToken, fetchVendorSelfAttestation);
// GET: Serve an uploaded attestation document (for preview "open document")
router.get("/vendorSelfAttestation/document/:attestationId/:fileName", authenticateToken, getAttestationDocument);
// POST: Upload a document for an attestation (multipart form field "document")
router.post("/vendorSelfAttestation/upload/:attestationId", authenticateToken, uploadAttestationDocument);
// POST: Submit or update vendor self attestation (upsert by user_id)
router.post("/vendorSelfAttestation", authenticateToken, submitVendorSelfAttestation);
// PATCH: Set visibility to buyers for a completed product (attestation)
router.patch("/vendorSelfAttestation/visibility", authenticateToken, updateAttestationVisibility);
// PATCH: Set which detail sections are visible to buyers (per card)
router.patch("/vendorSelfAttestation/section-visibility", authenticateToken, updateSectionVisibility);
// POST: Generate product profile report from vendor data (agent; no file output). Saves to generated_profile_reports.
router.post("/vendorSelfAttestation/generate-profile", authenticateToken, generateProductProfile);
// GET: List stored generated profile reports for the current user
router.get("/vendorSelfAttestation/generated-reports", authenticateToken, listGeneratedReports);
export default router;
