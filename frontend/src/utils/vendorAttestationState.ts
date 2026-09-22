/**
 * Shared helpers to build Vendor Self Attestation form state from API responses.
 */
import type {
  AttestationCompanyProfile,
  VendorSelfAttestationPayload,
  VendorSelfAttestationFormState,
  DocumentUploadState,
} from "../types/vendorSelfAttestation";
import { normalizeVendorMaturityStage } from "../constants/vendorOnboardingData";

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
    vendorName: (api.vendorName as string) ?? (api.vendor_name as string) ?? "",
    vendorType: (api.vendorType as string) ?? "",
    sector: sectorNorm,
    vendorMaturity: normalizeVendorMaturityStage(api.vendorMaturity as string),
    companyWebsite: (api.companyWebsite as string) ?? "",
    companyDescription: (api.companyDescription as string) ?? "",
    employeeCount: (api.employeeCount as string) ?? "",
    yearFounded: api.yearFounded != null ? Number(api.yearFounded) : "",
    headquartersLocation: (api.headquartersLocation as string) ?? "",
    operatingRegions: Array.isArray(api.operatingRegions) ? (api.operatingRegions as string[]) : [],
    fundingStatus: (api.fundingStatus as string) ?? "",
    financialPosition: (api.financialPosition as string) ?? "",
    enterpriseCustomers:
      api.enterpriseCustomers != null && api.enterpriseCustomers !== ""
        ? String(api.enterpriseCustomers)
        : "",
    customerRetentionRate:
      api.customerRetentionRate != null && api.customerRetentionRate !== ""
        ? String(api.customerRetentionRate)
        : "",
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
  fundingStatus: "",
  financialPosition: "",
  enterpriseCustomers: "",
  customerRetentionRate: "",
};

function isPlaceholderVendorName(value: unknown): boolean {
  const text = String(value ?? "").trim();
  if (!text) return true;
  const lower = text.toLowerCase();
  return lower === "n/a" || lower === "na" || lower === "not specified";
}

export function withVendorNameFallback(
  companyProfile: AttestationCompanyProfile,
  ...fallbacks: Array<string | null | undefined>
): AttestationCompanyProfile {
  if (!isPlaceholderVendorName(companyProfile.vendorName)) return companyProfile;
  for (const fallback of fallbacks) {
    if (isPlaceholderVendorName(fallback)) continue;
    return { ...companyProfile, vendorName: String(fallback).trim() };
  }
  return companyProfile;
}

/**
 * Copies answers already given during onboarding onto the attestation payload, so questions
 * that exist on both forms are not asked a second time under their attestation field names.
 * Mutates and returns `attestation`; existing attestation answers always win.
 */
export function carryOverOnboardingAnswers(
  attestation: VendorSelfAttestationPayload,
  companyApi: Record<string, unknown>,
): VendorSelfAttestationPayload {
  if (!attestation.trust_centre_url && companyApi.trustCentreUrl)
    attestation.trust_centre_url = String(companyApi.trustCentreUrl);

  if (!attestation.security_incidents?.length && Array.isArray(companyApi.securityIncidents)) {
    attestation.security_incidents =
      companyApi.securityIncidents as VendorSelfAttestationPayload["security_incidents"];
  }
  if (!attestation.has_public_security_incident) {
    const onboardingAnswer = companyApi.hasPublicSecurityIncident;
    if (typeof onboardingAnswer === "string" && onboardingAnswer.trim()) {
      attestation.has_public_security_incident = onboardingAnswer.trim().toLowerCase();
    } else if (attestation.security_incidents?.length) {
      attestation.has_public_security_incident = "yes";
    }
  }
  return attestation;
}

export function buildFormStateFromApi(
  result: {
    companyProfile?: Record<string, unknown>;
    attestation?: Record<string, unknown>;
  },
  vendorNameFallback?: string | null,
): VendorSelfAttestationFormState {
  const companyProfile = withVendorNameFallback(
    result.companyProfile && Object.keys(result.companyProfile).length > 0
      ? mapApiCompanyProfile(result.companyProfile)
      : emptyCompanyProfile,
    vendorNameFallback,
  );
  const companyApi = result.companyProfile ?? {};
  const attestation: VendorSelfAttestationPayload =
    result.attestation && Object.keys(result.attestation).length > 0
      ? { ...(result.attestation as VendorSelfAttestationPayload) }
      : {};
  carryOverOnboardingAnswers(attestation, companyApi);
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
