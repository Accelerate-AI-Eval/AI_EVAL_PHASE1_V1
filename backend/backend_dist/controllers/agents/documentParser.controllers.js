/**
 * Compliance document parsing for vendor attestation uploads.
 * Re-exports the service used after attestation submit; HTTP routes can import from here if needed.
 */
export { extractExpiryFromText, parseAndStoreComplianceDocumentExpiries, } from "../../services/complianceDocumentParser.js";
