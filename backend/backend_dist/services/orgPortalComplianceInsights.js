/**
 * Framework mapping + certification gap analysis for Organizations portal (buyer / vendor COTS views).
 */
import { mergeFrameworkMappingRows, vendorCotsFrameworkMappingRowsForListView, vendorCotsFrameworkMappingRowsFromAttestation, } from "./frameworkMappingFromCompliance.js";
import { narrowVendorCotsFrameworkRowsToAiDomainControls } from "./vendorCotsAttestationFrameworkControls.js";
import { attestationFrameworkRowsCoverRegulatoryFramework, getVendorCotsRegulatoryFrameworkNamesFromPayload, mergeVendorCotsAttestationRowsWithRegulatoryGaps, vendorCotsRegulatoryAttestationGapRow, } from "./vendorCotsFrameworkMappingGenerator.js";
import { calcCertificationsScore } from "../controllers/agents/vendorAttestation.js";
import { buildCertificationsSearchBlobsFromPayload, buyerVendorCertificationsToSearchBlob, } from "./complianceCertBlobs.js";
import { normalizeCertIndustrySegmentInput, getRelevantCertificationFrameworkSet, } from "./certIndustrySegmentRelevance.js";
function ensureRegulatoryGapRowsPresent(rows, payload) {
    const required = getVendorCotsRegulatoryFrameworkNamesFromPayload(payload);
    if (required.length === 0)
        return rows;
    const out = [...rows];
    for (const fw of required) {
        if (!attestationFrameworkRowsCoverRegulatoryFramework(out, fw)) {
            out.push(vendorCotsRegulatoryAttestationGapRow(fw));
        }
    }
    return out;
}
function frameworkMappingRowsFromVendorRiskReport(rawReport) {
    if (!rawReport || typeof rawReport !== "object")
        return [];
    const reportObj = rawReport;
    const top = reportObj.frameworkMapping;
    if (Array.isArray(top?.rows))
        return top.rows;
    const generated = reportObj.generatedAnalysis;
    const nested = generated?.fullReport?.frameworkMapping;
    return Array.isArray(nested?.rows) ? nested.rows : [];
}
export function deriveBuyerIndustrySegmentForVendorCots(customerSector, queryOverride) {
    if (queryOverride != null && String(queryOverride).trim() !== "") {
        return String(queryOverride).trim();
    }
    if (customerSector == null)
        return "";
    if (typeof customerSector === "string")
        return customerSector;
    if (typeof customerSector === "object" && !Array.isArray(customerSector)) {
        const o = customerSector;
        for (const key of ["private_sector", "public_sector", "non_profit_sector"]) {
            const v = o[key];
            if (Array.isArray(v) && v.length > 0) {
                return String(v[0]).trim();
            }
        }
    }
    return "";
}
function attestationRowToCertPayload(row) {
    return {
        security_certifications: row.security_certifications,
        security_compliance_certificates: row.security_compliance_certificates,
        document_uploads: row.document_uploads,
        regulatorycompliance_cert_material: row.regulatorycompliance_cert_material,
    };
}
function gapAnalysisFromDetected(segmentKey, allDetected) {
    const relevant = getRelevantCertificationFrameworkSet(segmentKey);
    const relevantFrameworks = [...relevant].sort((a, b) => a.localeCompare(b));
    const certificationGapAnalysis = relevantFrameworks.map((fw) => {
        const hit = allDetected.find((r) => String(r.framework) === fw);
        return {
            framework: fw,
            status: hit ? "met" : "gap",
            points: hit ? Number(hit.points) : undefined,
            detail: hit?.detail != null ? String(hit.detail) : undefined,
        };
    });
    return { relevantFrameworks, certificationGapAnalysis };
}
export function buildVendorCotsOrganizationalPortalInsights(_vendorCotsCamel, attestationRow, buyerIndustrySegmentRaw, opts) {
    const segment = normalizeCertIndustrySegmentInput(buyerIndustrySegmentRaw);
    const attPayload = attestationRow ? attestationRowToCertPayload(attestationRow) : {};
    const blobs = buildCertificationsSearchBlobsFromPayload(attPayload);
    const certScore = calcCertificationsScore({
        certificationsSearchBlob: blobs.certificationsSearchBlob,
        complianceUploadBlob: blobs.complianceUploadBlob,
        buyerIndustrySegment: segment,
        sector: "Technology",
    });
    const rawAll = certScore.all_detected_breakdown;
    const allDetected = Array.isArray(rawAll)
        ? rawAll
            .filter((r) => r != null && typeof r === "object" && !Array.isArray(r))
            .map((r) => ({
            framework: String(r.framework ?? ""),
            points: Number(r.points),
            detail: r.detail != null ? String(r.detail) : undefined,
        }))
            .filter((r) => r.framework.length > 0)
        : [];
    const { relevantFrameworks, certificationGapAnalysis } = gapAnalysisFromDetected(segment, allDetected);
    const computedRows = narrowVendorCotsFrameworkRowsToAiDomainControls(mergeVendorCotsAttestationRowsWithRegulatoryGaps(vendorCotsFrameworkMappingRowsFromAttestation(attestationRow), _vendorCotsCamel), _vendorCotsCamel);
    const fromStoredReport = opts?.storedCustomerRiskReport != null
        ? vendorCotsFrameworkMappingRowsForListView(attestationRow, opts.storedCustomerRiskReport)
        : [];
    const mergedFrameworkRows = mergeFrameworkMappingRows(computedRows, fromStoredReport);
    const frameworkMappingRowsRaw = mergedFrameworkRows.length > 0
        ? mergedFrameworkRows
        : computedRows.length > 0
            ? computedRows
            : fromStoredReport;
    const frameworkMappingRows = ensureRegulatoryGapRowsPresent(frameworkMappingRowsRaw, _vendorCotsCamel);
    return {
        frameworkMappingRows,
        attestationFrameworkRows: [],
        buyerIndustrySegment: segment,
        relevantFrameworks,
        certificationGapAnalysis,
        allDetectedCertifications: allDetected,
    };
}
export function buildBuyerCotsOrganizationalPortalInsights(input) {
    const segmentRaw = typeof input.industrySector === "string"
        ? input.industrySector
        : input.industrySector != null
            ? JSON.stringify(input.industrySector)
            : "";
    const segment = normalizeCertIndustrySegmentInput(segmentRaw);
    const certBlob = buyerVendorCertificationsToSearchBlob(input.vendorCertifications);
    const certScore = calcCertificationsScore({
        certificationsSearchBlob: certBlob,
        complianceUploadBlob: "",
        buyerIndustrySegment: segment,
        sector: "Technology",
    });
    const rawAll = certScore.all_detected_breakdown;
    const allDetected = Array.isArray(rawAll)
        ? rawAll
            .filter((r) => r != null && typeof r === "object" && !Array.isArray(r))
            .map((r) => ({
            framework: String(r.framework ?? ""),
            points: Number(r.points),
            detail: r.detail != null ? String(r.detail) : undefined,
        }))
            .filter((r) => r.framework.length > 0)
        : [];
    const { relevantFrameworks, certificationGapAnalysis } = gapAnalysisFromDetected(segment, allDetected);
    const reportFrameworkMappingRows = frameworkMappingRowsFromVendorRiskReport(input.vendorRiskReport);
    return {
        reportFrameworkMappingRows,
        buyerIndustrySegment: segment,
        relevantFrameworks,
        certificationGapAnalysis,
        allDetectedCertifications: allDetected,
    };
}
