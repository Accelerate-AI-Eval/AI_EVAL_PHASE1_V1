import * as path from "path";
import * as fs from "fs";
const UPLOADS_DIR = path.resolve(process.cwd(), "public", "uploads_vendor_attestations");
/**
 * Sanitize file name: allow only base name (no path segments) to prevent path traversal.
 */
function safeFileName(name) {
    const base = path.basename(name);
    if (!base || base === "." || base === "..")
        return "";
    return base;
}
/**
 * GET /vendorSelfAttestation/document/:attestationId/:fileName
 * Serves an uploaded attestation document so the user can open it from the preview.
 * File must exist under uploads/vendor-attestations/:attestationId/:fileName.
 * Returns 404 if file does not exist.
 */
const getAttestationDocument = async (req, res) => {
    try {
        const attestationId = String(req.params.attestationId ?? "").trim();
        let rawFileName = String(req.params.fileName ?? "").trim();
        try {
            if (rawFileName && /%[0-9A-Fa-f]{2}/.test(rawFileName)) {
                rawFileName = decodeURIComponent(rawFileName);
            }
        }
        catch {
            // use rawFileName as-is if decode fails
        }
        const fileName = safeFileName(rawFileName);
        if (!attestationId || !fileName) {
            res.status(400).json({ success: false, message: "Attestation ID and file name are required" });
            return;
        }
        const dir = path.resolve(UPLOADS_DIR, attestationId);
        const filePath = path.resolve(dir, fileName);
        const uploadsResolved = path.resolve(UPLOADS_DIR);
        // Ensure resolved path is under UPLOADS_DIR (no path traversal)
        const relative = path.relative(uploadsResolved, filePath);
        if (relative.startsWith("..") || path.isAbsolute(relative)) {
            res.status(400).json({ success: false, message: "Invalid path" });
            return;
        }
        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
            res.status(404).json({ success: false, message: "Document not found" });
            return;
        }
        res.setHeader("Content-Disposition", `inline; filename="${fileName}"`);
        res.sendFile(filePath, (err) => {
            if (err && !res.headersSent) {
                console.error("getAttestationDocument sendFile error:", err);
                res.status(500).json({ success: false, message: "Failed to send document" });
            }
        });
    }
    catch (err) {
        console.error("getAttestationDocument error:", err);
        if (!res.headersSent) {
            res.status(500).json({ success: false, message: "Server error" });
        }
    }
};
export default getAttestationDocument;
