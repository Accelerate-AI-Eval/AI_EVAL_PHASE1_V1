/**
 * Framework mapping + certification gap analysis for Organizations portal (buyer / vendor COTS views).
 */

import {
  buildFrameworkMappingRowsFromVendorCotsAssessment,
  hasVendorCotsRegulatoryRequirementsProvided,
} from "./vendorCotsFrameworkMappingGenerator.js";
import {
  type FrameworkMappingTableRow,
  resolveFrameworkMappingRowsForAttestation,
  isSubstantiveFrameworkMappingRow,
} from "./frameworkMappingFromCompliance.js";
import { calcCertificationsScore } from "../controllers/agents/vendorAttestation.js";
import {
  buildCertificationsSearchBlobsFromPayload,
  buyerVendorCertificationsToSearchBlob,
} from "./complianceCertBlobs.js";
import {
  normalizeCertIndustrySegmentInput,
  getRelevantCertificationFrameworkSet,
} from "./certIndustrySegmentRelevance.js";

export type CertificationGapRow = {
  framework: string;
  status: "met" | "gap";
  points?: number;
  detail?: string;
};

type CertBreakdownRow = { framework: string; points: number; detail?: string };

function frameworkMappingRowsFromVendorRiskReport(rawReport: unknown): FrameworkMappingTableRow[] {
  if (!rawReport || typeof rawReport !== "object") return [];
  const reportObj = rawReport as Record<string, unknown>;
  const top = reportObj.frameworkMapping as { rows?: FrameworkMappingTableRow[] } | undefined;
  if (Array.isArray(top?.rows)) return top.rows;
  const generated = reportObj.generatedAnalysis as { fullReport?: Record<string, unknown> } | undefined;
  const nested = generated?.fullReport?.frameworkMapping as { rows?: FrameworkMappingTableRow[] } | undefined;
  return Array.isArray(nested?.rows) ? nested.rows : [];
}

export function deriveBuyerIndustrySegmentForVendorCots(
  customerSector: unknown,
  queryOverride: string | undefined,
): string {
  if (queryOverride != null && String(queryOverride).trim() !== "") {
    return String(queryOverride).trim();
  }
  if (customerSector == null) return "";
  if (typeof customerSector === "string") return customerSector;
  if (typeof customerSector === "object" && !Array.isArray(customerSector)) {
    const o = customerSector as Record<string, unknown>;
    for (const key of ["private_sector", "public_sector", "non_profit_sector"] as const) {
      const v = o[key];
      if (Array.isArray(v) && v.length > 0) {
        return String(v[0]).trim();
      }
    }
  }
  return "";
}

function attestationRowToCertPayload(row: Record<string, unknown>): Record<string, unknown> {
  return {
    security_certifications: row.security_certifications,
    security_compliance_certificates: row.security_compliance_certificates,
    document_uploads: row.document_uploads,
    regulatorycompliance_cert_material: row.regulatorycompliance_cert_material,
  };
}

function gapAnalysisFromDetected(
  segmentKey: string,
  allDetected: CertBreakdownRow[],
): { relevantFrameworks: string[]; certificationGapAnalysis: CertificationGapRow[] } {
  const relevant = getRelevantCertificationFrameworkSet(segmentKey);
  const relevantFrameworks = [...relevant].sort((a, b) => a.localeCompare(b));
  const certificationGapAnalysis: CertificationGapRow[] = relevantFrameworks.map((fw) => {
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

export function buildVendorCotsOrganizationalPortalInsights(
  vendorCotsCamel: Record<string, unknown>,
  attestationRow: Record<string, unknown> | null | undefined,
  buyerIndustrySegmentRaw: string,
): {
  frameworkMappingRows: FrameworkMappingTableRow[];
  attestationFrameworkRows: FrameworkMappingTableRow[];
  regulatoryRequirementsDocumentProvided: boolean;
  buyerIndustrySegment: string;
  relevantFrameworks: string[];
  certificationGapAnalysis: CertificationGapRow[];
  allDetectedCertifications: CertBreakdownRow[];
} {
  const regulatoryRequirementsDocumentProvided =
    hasVendorCotsRegulatoryRequirementsProvided(vendorCotsCamel);
  const frameworkMappingRows = regulatoryRequirementsDocumentProvided
    ? buildFrameworkMappingRowsFromVendorCotsAssessment(vendorCotsCamel)
    : [];
  const segment = normalizeCertIndustrySegmentInput(buyerIndustrySegmentRaw);

  const attPayload = attestationRow ? attestationRowToCertPayload(attestationRow) : {};
  const blobs = buildCertificationsSearchBlobsFromPayload(attPayload);
  const certScore = calcCertificationsScore({
    certificationsSearchBlob: blobs.certificationsSearchBlob,
    complianceUploadBlob: blobs.complianceUploadBlob,
    buyerIndustrySegment: segment,
    sector: "Technology",
  } as Record<string, unknown>);

  const rawAll = (certScore as unknown as { all_detected_breakdown?: unknown[] }).all_detected_breakdown;
  const allDetected: CertBreakdownRow[] = Array.isArray(rawAll)
    ? rawAll
        .filter((r): r is Record<string, unknown> => r != null && typeof r === "object" && !Array.isArray(r))
        .map((r) => ({
          framework: String(r.framework ?? ""),
          points: Number(r.points),
          detail: r.detail != null ? String(r.detail) : undefined,
        }))
        .filter((r) => r.framework.length > 0)
    : [];

  const { relevantFrameworks, certificationGapAnalysis } = gapAnalysisFromDetected(segment, allDetected);

  const attestationFrameworkRows = attestationRow
    ? resolveFrameworkMappingRowsForAttestation(
        attestationRow as Record<string, unknown>,
      ).filter(isSubstantiveFrameworkMappingRow)
    : [];

  return {
    frameworkMappingRows,
    attestationFrameworkRows,
    regulatoryRequirementsDocumentProvided,
    buyerIndustrySegment: segment,
    relevantFrameworks,
    certificationGapAnalysis,
    allDetectedCertifications: allDetected,
  };
}

export function buildBuyerCotsOrganizationalPortalInsights(input: {
  industrySector: unknown;
  vendorCertifications: unknown;
  vendorRiskReport: unknown;
}): {
  reportFrameworkMappingRows: FrameworkMappingTableRow[];
  buyerIndustrySegment: string;
  relevantFrameworks: string[];
  certificationGapAnalysis: CertificationGapRow[];
  allDetectedCertifications: CertBreakdownRow[];
} {
  const segmentRaw =
    typeof input.industrySector === "string"
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
  } as Record<string, unknown>);

  const rawAll = (certScore as unknown as { all_detected_breakdown?: unknown[] }).all_detected_breakdown;
  const allDetected: CertBreakdownRow[] = Array.isArray(rawAll)
    ? rawAll
        .filter((r): r is Record<string, unknown> => r != null && typeof r === "object" && !Array.isArray(r))
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
