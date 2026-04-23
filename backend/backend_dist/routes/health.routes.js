import express from "express";
import healthCheck from "../controllers/health/health.controller.js";
const healthRoute = express.Router();
// Health check route
healthRoute
    .get("/api/v1/health", healthCheck);
export default healthRoute;
