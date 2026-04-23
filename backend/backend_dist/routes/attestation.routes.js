import express from "express";
import authenticateToken from "../middlewares/routesProtection.js";
import saveDraft from "../controllers/attestation/saveDraft.controller.js";
import submit from "../controllers/attestation/submit.controller.js";
import getById from "../controllers/attestation/getById.controller.js";
import list from "../controllers/attestation/list.controller.js";
const router = express.Router();
router
    .get("/attestation/:id", authenticateToken, getById)
    .get("/attestations", authenticateToken, list)
    .post("/attestation/save-draft", authenticateToken, saveDraft)
    .post("/attestation/submit", authenticateToken, submit);
export default router;
