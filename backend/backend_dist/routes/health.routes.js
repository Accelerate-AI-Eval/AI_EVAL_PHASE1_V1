import express from "express";
import healthCheck from "../controllers/health/health.controller.js";
const healthRoute = express.Router();
// Health check route
healthRoute
    .get("/health", healthCheck);
export default healthRoute;
