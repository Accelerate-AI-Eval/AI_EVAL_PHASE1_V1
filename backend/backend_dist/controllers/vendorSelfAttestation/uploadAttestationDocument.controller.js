import * as path from "path";
import * as fs from "fs";
import multer from "multer";
import { db } from "../../database/db.js";
import { vendorSelfAttestations, usersTable } from "../../schema/schema.js";
import { and, eq } from "drizzle-orm";
const UPLOADS_DIR = path.resolve(process.cwd(), "public", "uploads_vendor_attestations");
const ALLOWED_EXT = [".pdf", ".doc", ".docx", ".ppt", ".pptx"];
const MAX_FILENAME_LENGTH = 255;
function safeFileName(name) {
    const base = path.basename(name);
    if (!base || base === "." || base === "..")
        return "";
    if (base.length > MAX_FILENAME_LENGTH)
        return base.slice(0, MAX_FILENAME_LENGTH);
    const ext = path.extname(base).toLowerCase();
    if (ext && !ALLOWED_EXT.includes(ext))
        return "";
    return base;
}
/**
 * POST /vendorSelfAttestation/upload/:attestationId
 * Accepts multipart/form-data with field "document" (single file) or "documents" (multiple).
 * Stores file(s) under uploads/vendor-attestations/:attestationId/.
 * Attestation must exist and belong to the current user.
 */
export async function uploadAttestationDocument(req, res) {
    const attestationId = String(req.params?.attestationId ?? "").trim();
    if (!attestationId) {
        res.status(400).json({ success: false, message: "Attestation ID is required" });
        return;
    }
    const payload = req.user;
    let rawId = payload?.id ?? payload?.userId;
    let userId = rawId != null ? Number(rawId) : NaN;
    try {
        if ((!Number.isInteger(userId) || userId < 1) && payload?.email) {
            const [u] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, String(payload.email).trim())).limit(1);
            if (u)
                userId = u.id;
        }
        if (!Number.isInteger(userId) || userId < 1) {
            res.status(401).json({ success: false, message: "Unauthorized" });
            return;
        }
        const [row] = await db
            .select({ id: vendorSelfAttestations.id })
            .from(vendorSelfAttestations)
            .where(and(eq(vendorSelfAttestations.id, attestationId), eq(vendorSelfAttestations.user_id, userId)))
            .limit(1);
        if (!row) {
            res.status(404).json({ success: false, message: "Attestation not found" });
            return;
        }
        const dir = path.resolve(UPLOADS_DIR, attestationId);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        const storage = multer.diskStorage({
            destination: (_req, _file, cb) => cb(null, dir),
            filename: (_req, file, cb) => {
                const safe = safeFileName(file.originalname || "document");
                const name = safe || `upload-${Date.now()}${path.extname(file.originalname || "") || ".bin"}`;
                cb(null, name);
            },
        });
        const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB per file
        const upload = multer({
            storage,
            limits: { fileSize: MAX_FILE_SIZE_BYTES },
            fileFilter: (_req, file, cb) => {
                const name = file.originalname || "";
                const ext = path.extname(name).toLowerCase();
                if (ext && !ALLOWED_EXT.includes(ext)) {
                    return cb(new Error("Invalid file type. Allowed: PDF, DOC, DOCX, PPT, PPTX"));
                }
                cb(null, true);
            },
        });
        const run = () => {
            const single = upload.single("document");
            single(req, res, (err) => {
                if (err) {
                    const multerErr = err;
                    if (multerErr?.code === "LIMIT_FILE_SIZE") {
                        res.status(400).json({ success: false, message: "File too large (max 10MB per file)" });
                        return;
                    }
                    res.status(400).json({ success: false, message: err instanceof Error ? err.message : "Upload failed" });
                    return;
                }
                const file = req.file;
                if (!file) {
                    res.status(400).json({ success: false, message: "No file in field 'document'" });
                    return;
                }
                res.status(200).json({ success: true, fileName: file.filename });
            });
        };
        run();
    }
    catch (e) {
        console.error("uploadAttestationDocument error:", e);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: "Server error" });
        }
    }
}
