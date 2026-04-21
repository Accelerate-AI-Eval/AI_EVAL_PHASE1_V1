import express from "express";
import authenticateToken from "../middlewares/routesProtection.js";
import getSectors from "../controllers/lookup/getSectors.controller.js";
const lookupRouter = express.Router();
// GET sectors with nested industries (for dropdowns and vendor/buyer sector details)
lookupRouter
    .get("/sectors", authenticateToken, getSectors);
export default lookupRouter;
