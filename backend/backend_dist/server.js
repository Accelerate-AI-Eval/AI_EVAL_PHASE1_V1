import dotenv from "dotenv";
// dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local" });
import express from "express";
import cors from "cors";
import { initDB } from "./database/db.js";
import orgrouter from "./routes/organization.routes.js";
import userRoutes from "./routes/userRoutes.routes.js";
import vendorRoutes from "./routes/vendorOnboarding.routes.js";
import vendorSelfAttestationRoutes from "./routes/vendorSelfAttestation.routes.js";
import attestationRoutes from "./routes/attestation.routes.js";
import buyerRoutes from "./routes/buyerOnboarding.routes.js";
import assessmentRoutes from "./routes/assessment.routes.js";
import lookupRoutes from "./routes/lookup.routes.js";
import healthRoute from "./routes/health.routes.js";
const PORT = process.env.BACKEND_PORT ?? 5003;
const app = express();
const baseUrl = process.env.BASE_URL?.trim();
const allowedOrigins = [...(baseUrl ? [baseUrl] : [])];
// CORS first so preflight (OPTIONS) and all responses get correct headers
app.use(cors({
    origin: (origin, cb) => {
        // Allow requests with no origin (e.g. Postman, same-origin) or when origin is in the list
        if (!origin)
            return cb(null, true);
        if (allowedOrigins.includes(origin))
            return cb(null, true);
        // In development, allow any localhost origin so CORS never blocks
        if (process.env.NODE_ENV !== "production" &&
            /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
            return cb(null, true);
        }
        return cb(null, true);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    optionsSuccessStatus: 204,
}));
// Ensure CORS headers are on every response (even 4xx/5xx) so browser can read the body
app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin &&
        (allowedOrigins.includes(origin) ||
            (process.env.NODE_ENV !== "production" &&
                /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)))) {
        res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Credentials", "true");
    next();
});
// Allow larger request bodies (default is ~100kb; Buyer COTS and other forms can exceed this)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
// Preflight: respond to OPTIONS for any /api/v1 path with 204 (CORS headers set by cors() above)
app.use("/api/v1", (req, res, next) => {
    if (req.method === "OPTIONS") {
        return res.status(204).end();
    }
    next();
});
app.use("/api/v1", [
    userRoutes,
    orgrouter,
    vendorRoutes,
    vendorSelfAttestationRoutes,
    attestationRoutes,
    buyerRoutes,
    assessmentRoutes,
    lookupRoutes,
    healthRoute,
]);
console.log("Starting server...");
try {
    //** Calling database function
    await initDB();
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
}
catch (err) {
    console.error("Server failed:", err.message);
}
