/**
 * Shared helpers to build Vendor Self Attestation form state from API responses.
 */
import type {
  AttestationCompanyProfile,
  VendorSelfAttestationPayload,
  VendorSelfAttestationFormState,
  DocumentUploadState,
} from "../types/vendorSelfAttestation";

export const defaultDocumentUpload: DocumentUploadState = {
  "0": [],
  "1": [],
  "2": { categories: [], byCategory: {} },
  evidenceTestingPolicy: [],
  aiGovernancePolicy: [],
};

export function mapApiCompanyProfile(api: Record<string, unknown>): AttestationCompanyProfile {
  const sector = api.sector;
  let sectorNorm: Record<string, string[]> = {
    public_sector: [],
    private_sector: [],
    non_profit_sector: [],
  };
  if (sector && typeof sector === "object" && !Array.isArray(sector)) {
    const s = sector as Record<string, unknown>;
    sectorNorm = {
      public_sector: Array.isArray(s.public_sector) ? (s.public_sector as string[]) : [],
      private_sector: Array.isArray(s.private_sector) ? (s.private_sector as string[]) : [],
      non_profit_sector: Array.isArray(s.non_profit_sector) ? (s.non_profit_sector as string[]) : [],
    };
  }
  return {
    vendorName: (api.vendorName as string) ?? "",
    vendorType: (api.vendorType as string) ?? "",
    sector: sectorNorm,
    vendorMaturity: (api.vendorMaturity as string) ?? "",
    companyWebsite: (api.companyWebsite as string) ?? "",
    companyDescription: (api.companyDescription as string) ?? "",
    employeeCount: (api.employeeCount as string) ?? "",
    yearFounded: api.yearFounded != null ? Number(api.yearFounded) : "",
    headquartersLocation: (api.headquartersLocation as string) ?? "",
    operatingRegions: Array.isArray(api.operatingRegions) ? (api.operatingRegions as string[]) : [],
  };
}

const emptyCompanyProfile: AttestationCompanyProfile = {
  vendorName: "",
  vendorType: "",
  sector: { public_sector: [], private_sector: [], non_profit_sector: [] },
  vendorMaturity: "",
  companyWebsite: "",
  companyDescription: "",
  employeeCount: "",
  yearFounded: "",
  headquartersLocation: "",
  operatingRegions: [],
};

export function buildFormStateFromApi(result: {
  companyProfile?: Record<string, unknown>;
  attestation?: Record<string, unknown>;
}): VendorSelfAttestationFormState {
  const companyProfile =
    result.companyProfile && Object.keys(result.companyProfile).length > 0
      ? mapApiCompanyProfile(result.companyProfile)
      : emptyCompanyProfile;
  const attestation =
    result.attestation && Object.keys(result.attestation).length > 0
      ? (result.attestation as VendorSelfAttestationPayload)
      : {};
  const docUpload = result.attestation?.document_uploads;
  let documentUpload: DocumentUploadState = defaultDocumentUpload;
  if (docUpload && typeof docUpload === "object") {
    const d = docUpload as Record<string, unknown>;
    const slot2 = d["2"];
    let regulatory2: DocumentUploadState["2"] = { categories: [], byCategory: {} };
    if (slot2 != null && typeof slot2 === "object" && !Array.isArray(slot2)) {
      const s = slot2 as Record<string, unknown>;
      regulatory2 = {
        categories: Array.isArray(s.categories) ? (s.categories as string[]) : [],
        byCategory:
          s.byCategory && typeof s.byCategory === "object"
            ? (s.byCategory as Record<string, string[]>)
            : {},
      };
    }
    documentUpload = {
      "0": Array.isArray(d["0"]) ? (d["0"] as string[]) : [],
      "1": Array.isArray(d["1"]) ? (d["1"] as string[]) : [],
      "2": regulatory2,
      evidenceTestingPolicy: Array.isArray(d.evidenceTestingPolicy)
        ? (d.evidenceTestingPolicy as string[])
        : [],
      aiGovernancePolicy: Array.isArray(d.aiGovernancePolicy)
        ? (d.aiGovernancePolicy as string[])
        : [],
    };
  }
  return { companyProfile, attestation, documentUpload };
}
