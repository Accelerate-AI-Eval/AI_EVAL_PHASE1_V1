import { useEffect, useState, useCallback, useMemo } from "react";
import { useLocation, useParams, useNavigate, Navigate } from "react-router-dom";
import CardContainerOnBoarding from "../../UI/CardContainerOnBoarding";
import CardOnBoarding from "../../UI/CardOnBoarding";
import Button from "../../UI/Button";
import { useRef } from "react";
import {
  ChevronLeftCircle,
  ChevronRightCircle,
  Send,
  Save,
  FileCheck,
  Info,
  X,
  Loader2,
} from "lucide-react";
import Modal from "../../UI/Modal";
import { toast } from "react-toastify";
import MultiStepTabs from "../../UI/MultiStepTabs";
import StepVendorSelfAttestationPrev, {
  type ComplianceDocumentExpiryMeta,
} from "./StepVendorSelfAttestationPrev";
import { VENDOR_SELF_ATTESTATION } from "../../../constants/vendorAttestionData";
import { ATTESTATION_SECTION_FIELDS } from "../../../constants/vendorAttestationFields";
import type {
  AttestationCompanyProfile,
  VendorSelfAttestationPayload,
  VendorSelfAttestationFormState,
  DocumentUploadState,
} from "../../../types/vendorSelfAttestation";
import { VENDOR_SELF_ATTESTATION_TAB_STEPS } from "./vendorSelfAttestationTabs";
import {
  TabCompanyProfile,
  TabDocumentUpload,
  TabProductProfile,
  TabAITechCapabilities,
  TabComplianceCertifications,
  TabDataHandlingPrivacy,
  TabAiSafetyTesting,
  TabOperationsReliability,
  TabDeploymentArchitecture,
  TabEvidenceSupportingDoc,
} from "./tabs";
import "../VendorOnboarding/vendor_onboarding.css";
import "../UserManagement/user_management.css";
import "./vendor_attestation_preview.css";

const defaultCompanyProfile: AttestationCompanyProfile = {
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

const defaultAttestation: VendorSelfAttestationPayload = {};

const defaultDocumentUpload: DocumentUploadState = {
  "0": [],
  "1": [],
  "2": { categories: [], byCategory: {} },
  evidenceTestingPolicy: [],
};

const defaultFormState: VendorSelfAttestationFormState = {
  companyProfile: defaultCompanyProfile,
  attestation: defaultAttestation,
  documentUpload: defaultDocumentUpload,
};

const ATTESTATION_SECTION_KEYS = [
  "product_profile",
  "ai_technical_capabilities",
  "compliance_certifications",
  "data_handling_privacy",
  "ai_safety_testing",
  "operations_reliability",
  "deployment_architecture",
  "evidence_supporting_documentation",
] as const;

/** Check if a value is non-empty (string or array). */
function hasValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

/** Validate one attestation step (2–9) using required flags from VENDOR_SELF_ATTESTATION. */
function isAttestationStepValid(
  stepIndex: number,
  attestation: VendorSelfAttestationPayload,
  sectionKey: string,
  sectionData: Record<string, { required?: boolean }>,
): boolean {
  const mappings = ATTESTATION_SECTION_FIELDS[sectionKey];
  if (!mappings) return true;
  const dataEntries = Object.entries(sectionData).filter(
    ([k]) =>
      k !== "length" && Object.prototype.hasOwnProperty.call(sectionData, k),
  );
  for (let i = 0; i < dataEntries.length; i++) {
    const entry = dataEntries[i];
    if (!entry) continue;
    const [, fieldConfig] = entry;
    if (fieldConfig.required !== true) continue;
    const mapping = mappings[i];
    if (!mapping || !mapping.key) continue;
    const value = attestation[mapping.key];
    if (!hasValue(value)) return false;
  }
  return true;
}

/** Step 0: company profile required fields. */
function isCompanyProfileValid(
  companyProfile: AttestationCompanyProfile,
): boolean {
  if (!(companyProfile.vendorType ?? "").trim()) return false;
  if (!(companyProfile.companyWebsite ?? "").trim()) return false;
  if (!(companyProfile.companyDescription ?? "").trim()) return false;
  const sector = companyProfile.sector;
  if (sector && typeof sector === "object" && !Array.isArray(sector)) {
    const s = sector as Record<string, string[]>;
    const total =
      (s.public_sector?.length ?? 0) +
      (s.private_sector?.length ?? 0) +
      (s.non_profit_sector?.length ?? 0);
    if (total === 0) return false;
  }
  return true;
}

/** Return true if step is valid (required fields filled). */
function isVendorAttestationStepValid(
  stepIndex: number,
  formState: VendorSelfAttestationFormState,
): boolean {
  if (stepIndex === 0) return isCompanyProfileValid(formState.companyProfile);
  if (stepIndex === 1) return true; // Document upload: all optional
  const attestationStepIndex = stepIndex - 2;
  if (
    attestationStepIndex < 0 ||
    attestationStepIndex >= ATTESTATION_SECTION_KEYS.length
  )
    return true;
  const sectionKey = ATTESTATION_SECTION_KEYS[attestationStepIndex];
  const sectionData = (
    VENDOR_SELF_ATTESTATION as Record<
      string,
      Record<string, { required?: boolean }>
    >
  )[sectionKey];
  if (!sectionData) return true;
  // Compliance & Certifications: also require at least one Regulatory/Compliance certification category selected
  if (sectionKey === "compliance_certifications") {
    const regulatoryCategories = formState.documentUpload?.["2"]?.categories ?? [];
    if (regulatoryCategories.length === 0) return false;
  }
  return isAttestationStepValid(
    stepIndex,
    formState.attestation,
    sectionKey,
    sectionData,
  );
}

/** Per-field validation errors for the current step (for inline display like Vendor Onboarding). */
function getStepFieldErrors(
  stepIndex: number,
  formState: VendorSelfAttestationFormState,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (stepIndex === 0) {
    const cp = formState.companyProfile;
    if (!(cp.vendorType ?? "").trim()) errors.vendorType = "Required";
    const sector = cp.sector;
    if (sector && typeof sector === "object" && !Array.isArray(sector)) {
      const s = sector as Record<string, string[]>;
      const total =
        (s.public_sector?.length ?? 0) +
        (s.private_sector?.length ?? 0) +
        (s.non_profit_sector?.length ?? 0);
      if (total === 0) errors.sector = "Select at least one industry sector";
    } else {
      errors.sector = "Select at least one industry sector";
    }
    if (!(cp.companyWebsite ?? "").trim()) errors.companyWebsite = "Required";
    if (!(cp.companyDescription ?? "").trim())
      errors.companyDescription = "Required";
    if (!(cp.vendorMaturity ?? "").trim()) errors.vendorMaturity = "Required";
    if (!(cp.employeeCount ?? "").trim()) errors.employeeCount = "Required";
    if (cp.yearFounded === "" || cp.yearFounded == null)
      errors.yearFounded = "Required";
    if (!(cp.headquartersLocation ?? "").trim())
      errors.headquartersLocation = "Required";
    if (!(cp.operatingRegions?.length ?? 0))
      errors.operatingRegions = "Select at least one region";
    return errors;
  }
  if (stepIndex === 1) return {};
  const attestationStepIndex = stepIndex - 2;
  if (
    attestationStepIndex < 0 ||
    attestationStepIndex >= ATTESTATION_SECTION_KEYS.length
  )
    return {};
  const sectionKey = ATTESTATION_SECTION_KEYS[attestationStepIndex];
  const sectionData = (
    VENDOR_SELF_ATTESTATION as Record<
      string,
      Record<string, { required?: boolean }>
    >
  )[sectionKey];
  const mappings = ATTESTATION_SECTION_FIELDS[sectionKey];
  if (!sectionData || !mappings) return {};
  // Compliance: require at least one Regulatory/Compliance certification category
  if (sectionKey === "compliance_certifications") {
    const regulatoryCategories = formState.documentUpload?.["2"]?.categories ?? [];
    if (regulatoryCategories.length === 0) {
      errors.regulatoryCertificationMaterial = "Select at least one certification type and upload materials";
    }
  }
  const dataEntries = Object.entries(sectionData).filter(
    ([k]) =>
      k !== "length" && Object.prototype.hasOwnProperty.call(sectionData, k),
  );
  for (let i = 0; i < dataEntries.length; i++) {
    const [, fieldConfig] = dataEntries[i];
    if (fieldConfig.required !== true) continue;
    const mapping = mappings[i];
    if (!mapping?.key) continue;
    const value = formState.attestation[mapping.key];
    if (!hasValue(value)) errors[mapping.key] = "This field is required";
  }
  return errors;
}

/** Map API companyProfile (from vendor_onboarding) to AttestationCompanyProfile */
function mapApiCompanyProfile(
  api: Record<string, unknown>,
): AttestationCompanyProfile {
  const sector = api.sector;
  let sectorNorm: Record<string, string[]> = {
    public_sector: [],
    private_sector: [],
    non_profit_sector: [],
  };
  if (sector && typeof sector === "object" && !Array.isArray(sector)) {
    const s = sector as Record<string, unknown>;
    sectorNorm = {
      public_sector: Array.isArray(s.public_sector)
        ? (s.public_sector as string[])
        : [],
      private_sector: Array.isArray(s.private_sector)
        ? (s.private_sector as string[])
        : [],
      non_profit_sector: Array.isArray(s.non_profit_sector)
        ? (s.non_profit_sector as string[])
        : [],
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
    operatingRegions: Array.isArray(api.operatingRegions)
      ? (api.operatingRegions as string[])
      : [],
  };
}

/** Build form state from GET /attestation/:id response (attestation.formData). */
function buildFormStateFromFormData(
  formData: Record<string, unknown> | null | undefined,
): VendorSelfAttestationFormState {
  if (!formData || typeof formData !== "object") {
    return defaultFormState;
  }
  const companyProfile =
    formData.companyProfile &&
    typeof formData.companyProfile === "object" &&
    Object.keys(formData.companyProfile as object).length > 0
      ? mapApiCompanyProfile(formData.companyProfile as Record<string, unknown>)
      : defaultCompanyProfile;
  const attestation =
    formData.attestation &&
    typeof formData.attestation === "object" &&
    Object.keys(formData.attestation as object).length > 0
      ? (formData.attestation as VendorSelfAttestationPayload)
      : defaultAttestation;
  const docUpload = formData.documentUpload ?? formData.document_uploads;
  let documentUpload: DocumentUploadState = defaultDocumentUpload;
  if (docUpload && typeof docUpload === "object") {
    const d = docUpload as Record<string, unknown>;
    const slot2 = d["2"];
    let regulatory2: DocumentUploadState["2"] = {
      categories: [],
      byCategory: {},
    };
    if (slot2 != null && typeof slot2 === "object" && !Array.isArray(slot2)) {
      const s = slot2 as Record<string, unknown>;
      regulatory2 = {
        categories: Array.isArray(s.categories)
          ? (s.categories as string[])
          : [],
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
    };
  }
  return { companyProfile, attestation, documentUpload };
}

const VendorAttestationsMainForm = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { token: urlToken } = useParams<{ token?: string }>();
  const searchParams = new URLSearchParams(location.search);
  const editIdFromUrl = searchParams.get("edit")?.trim() || null;
  const editIdRaw =
    (location.state as { editId?: string } | null)?.editId ?? editIdFromUrl;
  const editId =
    typeof editIdRaw === "string" && editIdRaw.trim()
      ? editIdRaw.trim()
      : undefined;
  const searchNew = searchParams.get("new");
  const newAttestation =
    (location.state as { newAttestation?: boolean } | null)?.newAttestation ===
      true ||
    searchNew === "1" ||
    searchNew === "true";
  const isFromOnboarding = !sessionStorage.getItem("bearerToken");

  useEffect(() => {
    document.title = "AI-Q | Vendor Attestation";
  }, []);

  const BASE_URL =
    import.meta.env.VITE_BASE_URL ?? "http://localhost:5003/api/v1";

  const [currentStep, setCurrentStep] = useState<number>(0);
  const [allStepsFilled, setAllStepsFilled] = useState<boolean>(false);
  const [formState, setFormState] =
    useState<VendorSelfAttestationFormState>(defaultFormState);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [attestationId, setAttestationId] = useState<string | null>(null);
  const [documentViewerOpen, setDocumentViewerOpen] = useState(false);
  const [documentViewerLoading, setDocumentViewerLoading] = useState(false);
  const [documentViewerUrl, setDocumentViewerUrl] = useState<string | null>(null);
  const [documentViewerFileName, setDocumentViewerFileName] = useState<string | null>(null);
  const formStateRef = useRef(formState);
  formStateRef.current = formState;
  const documentViewerUrlRef = useRef<string | null>(null);
  documentViewerUrlRef.current = documentViewerUrl;

  /** When user adds files before attestationId exists, we store File objects here and upload them on Save Draft / Continue. */
  type PendingDocFiles = {
    "0": File[];
    "1": File[];
    "2": Record<string, File[]>;
    evidenceTestingPolicy: File[];
  };
  const defaultPending: PendingDocFiles = {
    "0": [],
    "1": [],
    "2": {},
    evidenceTestingPolicy: [],
  };
  const pendingFilesRef = useRef<PendingDocFiles>({ ...defaultPending });
  const storePendingFiles = useCallback(
    (slot: "0" | "1" | "evidenceTestingPolicy", files: File[], category?: string) => {
      if (slot === "2" && category != null) {
        const arr = pendingFilesRef.current["2"][category] ?? [];
        arr.push(...files);
        pendingFilesRef.current["2"][category] = arr;
      } else if (slot === "0" || slot === "1" || slot === "evidenceTestingPolicy") {
        pendingFilesRef.current[slot].push(...files);
      }
    },
    [],
  );
  const hasPendingFiles = useCallback(() => {
    const p = pendingFilesRef.current;
    if (p["0"].length > 0 || p["1"].length > 0 || p.evidenceTestingPolicy.length > 0) return true;
    return Object.values(p["2"]).some((arr) => arr.length > 0);
  }, []);
  const clearPendingFiles = useCallback(() => {
    pendingFilesRef.current = {
      "0": [],
      "1": [],
      "2": {},
      evidenceTestingPolicy: [],
    };
  }, []);

  const closeDocumentViewer = useCallback(() => {
    const url = documentViewerUrlRef.current;
    if (url) {
      URL.revokeObjectURL(url);
      documentViewerUrlRef.current = null;
    }
    setDocumentViewerUrl(null);
    setDocumentViewerOpen(false);
    setDocumentViewerLoading(false);
    setDocumentViewerFileName(null);
  }, []);

  const handleOpenDocument = useCallback(
    (fileName: string) => {
      const token =
        sessionStorage.getItem("bearerToken") ??
        sessionStorage.getItem("onboardingToken") ??
        (typeof urlToken === "string" ? urlToken : null);
      if (!token || !attestationId) {
        toast.error("Cannot open document. Save draft first if you have not yet.");
        return;
      }
      setDocumentViewerOpen(true);
      setDocumentViewerLoading(true);
      setDocumentViewerFileName(fileName);
      setDocumentViewerUrl(null);
      const base = (BASE_URL ?? "").toString().replace(/\/$/, "");
      const url = `${base}/vendorSelfAttestation/document/${encodeURIComponent(attestationId)}/${encodeURIComponent(fileName)}`;
      (async () => {
        try {
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) {
            setDocumentViewerOpen(false);
            setDocumentViewerLoading(false);
            setDocumentViewerFileName(null);
            toast.error(res.status === 404 ? "Document not found." : "Failed to open document.");
            return;
          }
          const blob = await res.blob();
          const blobUrl = URL.createObjectURL(blob);
          setDocumentViewerUrl(blobUrl);
          setDocumentViewerLoading(false);
        } catch {
          setDocumentViewerOpen(false);
          setDocumentViewerLoading(false);
          setDocumentViewerFileName(null);
          toast.error("Failed to open document.");
        }
      })();
    },
    [attestationId, BASE_URL, urlToken]
  );

  const uploadDocument = useCallback(
    async (attId: string, file: File): Promise<string> => {
      const token =
        sessionStorage.getItem("bearerToken") ??
        sessionStorage.getItem("onboardingToken") ??
        (typeof urlToken === "string" ? urlToken : null);
      if (!token) throw new Error("Not authenticated");
      const url = `${BASE_URL}/vendorSelfAttestation/upload/${encodeURIComponent(attId)}`;
      const form = new FormData();
      form.append("document", file);
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message ?? "Upload failed");
      const fileName = data?.fileName;
      if (typeof fileName !== "string") throw new Error("Invalid response");
      return fileName;
    },
    [BASE_URL, urlToken]
  );

  // Load vendor self attestation from vendor_self_attestations (GET /vendorSelfAttestation).
  // With editId: load that draft; without editId: treat as new (empty attestation).
  const [fetchDone, setFetchDone] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  useEffect(() => {
    const token =
      sessionStorage.getItem("bearerToken") ??
      sessionStorage.getItem("onboardingToken") ??
      (typeof urlToken === "string" ? urlToken : null);
    if (!token) {
      setFetchError("Please log in or complete onboarding to load your data.");
      setFetchDone(true);
      return;
    }

    let cancelled = false;
    (async () => {
      setFetchError(null);
      try {
        const organizationId = sessionStorage.getItem("organizationId") ?? "";
        const params = new URLSearchParams();
        if (organizationId) params.set("organizationId", organizationId);
        if (editId) params.set("id", editId);
        const query = params.toString() ? `?${params.toString()}` : "";
        const response = await fetch(
          `${BASE_URL}/vendorSelfAttestation${query}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          },
        );
        const text = await response.text();
        let result: {
          success?: boolean;
          companyProfile?: Record<string, unknown>;
          attestation?: Record<string, unknown>;
          attestations?: Record<string, unknown>[];
          message?: string;
        } = {};
        try {
          result = text ? JSON.parse(text) : {};
        } catch {
          if (!cancelled) {
            setFormState(defaultFormState);
            setFetchError(null);
            setFetchDone(true);
          }
          return;
        }
        if (cancelled) return;
        if (!response.ok) {
          if (!cancelled) {
            setFormState(defaultFormState);
            if (response.status === 403) {
              setAccessDenied(true);
            } else {
              const errMsg =
                response.status === 401
                  ? (result.message as string) || "Session expired. Please sign in again."
                  : null;
              setFetchError(errMsg);
            }
            setFetchDone(true);
          }
          return;
        }
        if (result.success) {
          if (editId && !result.attestation) {
            if (!cancelled) {
              setAccessDenied(true);
              setFetchDone(true);
            }
            return;
          }
          if (
            result.companyProfile?.organizationId &&
            !sessionStorage.getItem("organizationId")
          ) {
            sessionStorage.setItem(
              "organizationId",
              String(result.companyProfile.organizationId),
            );
          }
          let companyProfile =
            result.companyProfile &&
            Object.keys(result.companyProfile).length > 0
              ? mapApiCompanyProfile(result.companyProfile)
              : defaultCompanyProfile;

          const hasCompanyProfileData =
            (companyProfile.vendorType ?? "").trim() !== "" ||
            (companyProfile.companyWebsite ?? "").trim() !== "" ||
            (companyProfile.companyDescription ?? "").trim() !== "";
          if (!hasCompanyProfileData && token) {
            try {
              const onboardingRes = await fetch(`${BASE_URL}/vendorOnboarding`, {
                method: "GET",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
              });
              const onboardingJson = await onboardingRes.json();
              if (
                !cancelled &&
                onboardingRes.ok &&
                onboardingJson?.success &&
                onboardingJson?.data &&
                typeof onboardingJson.data === "object" &&
                Object.keys(onboardingJson.data).length > 0
              ) {
                companyProfile = mapApiCompanyProfile(
                  onboardingJson.data as Record<string, unknown>,
                );
                if (
                  onboardingJson.data.organizationId &&
                  !sessionStorage.getItem("organizationId")
                ) {
                  sessionStorage.setItem(
                    "organizationId",
                    String(onboardingJson.data.organizationId),
                  );
                }
              }
            } catch {
              // keep companyProfile from attestation response
            }
          }
          const attestationData = editId
            ? (result.attestation as Record<string, unknown> | undefined)
            : undefined;
          if (attestationData?.id != null) {
            setAttestationId(String(attestationData.id));
          } else if (editId) {
            setAttestationId(editId);
          } else {
            setAttestationId(null);
          }
          const attestation: VendorSelfAttestationPayload =
            attestationData && typeof attestationData === "object"
              ? {
                  ...defaultAttestation,
                  ...(attestationData as VendorSelfAttestationPayload),
                }
              : defaultAttestation;
          const docUpload = attestationData?.document_uploads;
          let documentUpload: DocumentUploadState = {
            ...defaultDocumentUpload,
          };
          if (docUpload && typeof docUpload === "object") {
            const d = docUpload as Record<string, unknown>;
            const slot2 = d["2"];
            let regulatory2: DocumentUploadState["2"] = {
              categories: [],
              byCategory: {},
            };
            if (
              slot2 != null &&
              typeof slot2 === "object" &&
              !Array.isArray(slot2)
            ) {
              const s = slot2 as Record<string, unknown>;
              regulatory2 = {
                categories: Array.isArray(s.categories)
                  ? (s.categories as string[])
                  : [],
                byCategory:
                  s.byCategory && typeof s.byCategory === "object"
                    ? (s.byCategory as Record<string, string[]>)
                    : {},
              };
            } else if (Array.isArray(slot2)) {
              regulatory2 = { categories: [], byCategory: {} };
            }
            documentUpload = {
              "0": Array.isArray(d["0"])
                ? (d["0"] as string[])
                : defaultDocumentUpload["0"],
              "1": Array.isArray(d["1"])
                ? (d["1"] as string[])
                : defaultDocumentUpload["1"],
              "2": regulatory2,
              evidenceTestingPolicy: Array.isArray(d.evidenceTestingPolicy)
                ? (d.evidenceTestingPolicy as string[])
                : defaultDocumentUpload.evidenceTestingPolicy,
            };
          }
          setFormState((prev) => ({
            ...prev,
            companyProfile,
            attestation,
            documentUpload,
          }));
          setFetchError(null);
        } else {
          if (!cancelled) {
            setFormState(defaultFormState);
            setFetchError(null);
          }
        }
        if (!cancelled) setFetchDone(true);
      } catch {
        if (!cancelled) {
          setFormState(defaultFormState);
          setFetchError(null);
          setFetchDone(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [BASE_URL, editId, urlToken, newAttestation]);

  const setCompanyProfile = useCallback(
    (next: React.SetStateAction<AttestationCompanyProfile>) => {
      setFormState((prev) => ({
        ...prev,
        companyProfile:
          typeof next === "function" ? next(prev.companyProfile) : next,
      }));
    },
    [],
  );

  const setAttestation = useCallback(
    (next: React.SetStateAction<VendorSelfAttestationPayload>) => {
      setFormState((prev) => ({
        ...prev,
        attestation: typeof next === "function" ? next(prev.attestation) : next,
      }));
    },
    [],
  );

  const setDocumentUpload = useCallback(
    (next: React.SetStateAction<DocumentUploadState>) => {
      setFormState((prev) => ({
        ...prev,
        documentUpload:
          typeof next === "function"
            ? next(prev.documentUpload ?? defaultDocumentUpload)
            : next,
      }));
    },
    [],
  );

  const [stepValidationError, setStepValidationError] = useState<string | null>(
    null,
  );
  /** Validation runs only on Continue; show per-field errors only after user has attempted Continue on that step. */
  const [validationAttemptedSteps, setValidationAttemptedSteps] = useState<
    Set<number>
  >(() => new Set());

  const totalSteps = VENDOR_SELF_ATTESTATION_TAB_STEPS.length;
  const completedStepsForProgress = Array.from(
    { length: currentStep },
    (_, i) => i,
  );

  const handleContinue = async () => {
    if (!isVendorAttestationStepValid(currentStep, formState)) {
      setValidationAttemptedSteps((prev) => new Set(prev).add(currentStep));
      return;
    }
    setStepValidationError(null);
    await saveDraftOrSubmit(true);
    setCurrentStep((prev) => Math.min(prev + 1, totalSteps - 1));
  };

  const handleBack = () => {
    setStepValidationError(null);
    setCurrentStep((prev) => Math.max(0, prev - 1));
  };

  const disabledSteps = useMemo(() => {
    const disabled: number[] = [];
    for (let i = 0; i < totalSteps; i++) {
      if (!isVendorAttestationStepValid(i, formState)) {
        for (let j = i + 1; j < totalSteps; j++) disabled.push(j);
        break;
      }
    }
    return disabled;
  }, [formState, totalSteps]);

  const stepFieldErrors = useMemo(
    () => getStepFieldErrors(currentStep, formState),
    [currentStep, formState],
  );

  /** Show field-level errors only after user has clicked Continue on this step (Sheet 1: validate on Continue). */
  const effectiveFieldErrors = useMemo(
    () => (validationAttemptedSteps.has(currentStep) ? stepFieldErrors : {}),
    [validationAttemptedSteps, currentStep, stepFieldErrors],
  );

  const tabStepsWithContent = useMemo(
    () =>
      VENDOR_SELF_ATTESTATION_TAB_STEPS.map((step, index) => {
        const StepIcon = step.icon;
        const stepHeaderProps = {
          title: step.label,
          subTitle: step.subTitle,
          icon: StepIcon ? <StepIcon size={18} /> : undefined,
        };
        return {
          ...step,
          content: (() => {
            if (index === 0) {
              return currentStep === 0 && !fetchDone ? (
                <p style={{ padding: "1rem" }}>Loading company profile…</p>
              ) : (
                <TabCompanyProfile
                  companyProfile={formState.companyProfile}
                  setCompanyProfile={setCompanyProfile}
                  fieldErrors={effectiveFieldErrors}
                  title={stepHeaderProps.title}
                  subTitle={stepHeaderProps.subTitle}
                  icon={stepHeaderProps.icon}
                />
              );
            }
            if (index === 1) {
              return (
                <TabDocumentUpload
                  documentUpload={
                    formState.documentUpload ?? defaultDocumentUpload
                  }
                  setDocumentUpload={setDocumentUpload}
                  documentUploadConfig={VENDOR_SELF_ATTESTATION.document_upload}
                  attestationId={attestationId}
                  onUploadDocument={uploadDocument}
                  onStorePendingFiles={storePendingFiles}
                  title={stepHeaderProps.title}
                  subTitle={stepHeaderProps.subTitle}
                  icon={stepHeaderProps.icon}
                />
              );
            }
            if (index === 2) {
              return (
                <TabProductProfile
                  attestation={formState.attestation}
                  setAttestation={setAttestation}
                  data={VENDOR_SELF_ATTESTATION.product_profile}
                  fieldErrors={effectiveFieldErrors}
                  title={stepHeaderProps.title}
                  subTitle={stepHeaderProps.subTitle}
                  icon={stepHeaderProps.icon}
                />
              );
            }
            if (index === 3) {
              return (
                <TabAITechCapabilities
                  attestation={formState.attestation}
                  setAttestation={setAttestation}
                  data={VENDOR_SELF_ATTESTATION.ai_technical_capabilities}
                  fieldErrors={effectiveFieldErrors}
                  title={stepHeaderProps.title}
                  subTitle={stepHeaderProps.subTitle}
                  icon={stepHeaderProps.icon}
                />
              );
            }
            if (index === 4) {
              return (
                <TabComplianceCertifications
                  attestation={formState.attestation}
                  setAttestation={setAttestation}
                  data={VENDOR_SELF_ATTESTATION.compliance_certifications}
                  fieldErrors={effectiveFieldErrors}
                  title={stepHeaderProps.title}
                  subTitle={stepHeaderProps.subTitle}
                  icon={stepHeaderProps.icon}
                  documentUpload={formState.documentUpload ?? defaultDocumentUpload}
                  setDocumentUpload={setDocumentUpload}
                  attestationId={attestationId}
                  onUploadDocument={uploadDocument}
                  onStorePendingFiles={storePendingFiles}
                  onOpenDocument={handleOpenDocument}
                />
              );
            }
            if (index === 5) {
              return (
                <TabDataHandlingPrivacy
                  attestation={formState.attestation}
                  setAttestation={setAttestation}
                  data={VENDOR_SELF_ATTESTATION.data_handling_privacy}
                  fieldErrors={effectiveFieldErrors}
                  title={stepHeaderProps.title}
                  subTitle={stepHeaderProps.subTitle}
                  icon={stepHeaderProps.icon}
                />
              );
            }
            if (index === 6) {
              return (
                <TabAiSafetyTesting
                  attestation={formState.attestation}
                  setAttestation={setAttestation}
                  data={VENDOR_SELF_ATTESTATION.ai_safety_testing}
                  fieldErrors={effectiveFieldErrors}
                  title={stepHeaderProps.title}
                  subTitle={stepHeaderProps.subTitle}
                  icon={stepHeaderProps.icon}
                />
              );
            }
            if (index === 7) {
              return (
                <TabOperationsReliability
                  attestation={formState.attestation}
                  setAttestation={setAttestation}
                  data={VENDOR_SELF_ATTESTATION.operations_reliability}
                  fieldErrors={effectiveFieldErrors}
                  title={stepHeaderProps.title}
                  subTitle={stepHeaderProps.subTitle}
                  icon={stepHeaderProps.icon}
                />
              );
            }
            if (index === 8) {
              return (
                <TabDeploymentArchitecture
                  attestation={formState.attestation}
                  setAttestation={setAttestation}
                  data={VENDOR_SELF_ATTESTATION.deployment_architecture}
                  fieldErrors={effectiveFieldErrors}
                  title={stepHeaderProps.title}
                  subTitle={stepHeaderProps.subTitle}
                  icon={stepHeaderProps.icon}
                />
              );
            }
            if (index === 9) {
              return (
                <TabEvidenceSupportingDoc
                  attestation={formState.attestation}
                  setAttestation={setAttestation}
                  documentUpload={
                    formState.documentUpload ?? defaultDocumentUpload
                  }
                  setDocumentUpload={setDocumentUpload}
                  attestationId={attestationId}
                  onUploadDocument={uploadDocument}
                  onStorePendingFiles={storePendingFiles}
                  data={
                    VENDOR_SELF_ATTESTATION.evidence_supporting_documentation
                  }
                  fieldErrors={effectiveFieldErrors}
                  title={stepHeaderProps.title}
                  subTitle={stepHeaderProps.subTitle}
                  icon={stepHeaderProps.icon}
                />
              );
            }
            // index === 10: Review
            return (
              <StepVendorSelfAttestationPrev
                formState={formState}
                attestationId={attestationId}
                onOpenDocument={handleOpenDocument}
                onNavigateToStep={setCurrentStep}
                complianceDocumentExpiries={(() => {
                  const raw = (formState.attestation as unknown as Record<string, unknown>)
                    ?.compliance_document_expiries;
                  return raw != null && typeof raw === "object" && !Array.isArray(raw)
                    ? (raw as Record<string, ComplianceDocumentExpiryMeta>)
                    : null;
                })()}
              />
            );
          })(),
        };
      }),
    [
      currentStep,
      fetchDone,
      formState,
      effectiveFieldErrors,
      setCompanyProfile,
      setAttestation,
      setDocumentUpload,
      allStepsFilled,
      attestationId,
      handleOpenDocument,
      uploadDocument,
    ],
  );

  const saveDraftOrSubmit = async (isDraft: boolean) => {
    setSubmitError(null);
    if (!isDraft) setSubmitting(true);
    const token =
      sessionStorage.getItem("bearerToken") ??
      sessionStorage.getItem("onboardingToken") ??
      (typeof urlToken === "string" ? urlToken : null);
    if (!token) {
      setSubmitError(
        "Not authenticated. Please log in or complete onboarding.",
      );
      if (!isDraft) setSubmitting(false);
      return false;
    }
    const latestState = formStateRef.current;
    const endpoint = `${BASE_URL}/vendorSelfAttestation`;
    let documentUpload = latestState.documentUpload ?? defaultDocumentUpload;
    const attestation = latestState.attestation ?? {};
    let currentAttestationId = attestationId;
    const pending = pendingFilesRef.current;

    const doPost = async (
      attId: string | null,
      docUpload: DocumentUploadState,
    ): Promise<{ ok: boolean; savedId?: string }> => {
      const payload: Record<string, unknown> = {
        ...attestation,
        document_uploads: docUpload,
        is_draft: isDraft,
        companyProfile: latestState.companyProfile,
      };
      const productName = attestation.product_name;
      payload.product_name =
        productName != null && String(productName).trim() !== ""
          ? String(productName).trim()
          : null;
      if (attId) {
        payload.attestationId = attId;
      } else {
        payload.newAttestation = true;
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const text = await response.text();
      let result: {
        success?: boolean;
        message?: string;
        attestation?: { id?: string; status?: string };
      } = {};
      try {
        result = text ? JSON.parse(text) : {};
      } catch {
        setSubmitError("Invalid response from server");
        return { ok: false };
      }
      if (!response.ok) {
        const msg =
          (result.message as string) ||
          (isDraft ? "Save draft failed" : "Submit failed");
        if (response.status === 403) {
          setSubmitError(
            'Completed attestations cannot be modified. Please use "New Attestation" to create a new one.',
          );
        } else {
          setSubmitError(msg);
        }
        return { ok: false };
      }
      const savedId = result.success && result.attestation?.id
        ? String(result.attestation.id)
        : undefined;
      return { ok: true, savedId };
    };

    try {
      if (!currentAttestationId && hasPendingFiles()) {
        const first = await doPost(null, defaultDocumentUpload);
        if (!first.ok) {
          if (!isDraft) setSubmitting(false);
          return false;
        }
        if (first.savedId) {
          currentAttestationId = first.savedId;
          setAttestationId(first.savedId);
          if (isDraft) setFetchError(null);
          if (window.history.replaceState) {
            const params = new URLSearchParams(window.location.search);
            params.delete("new");
            params.set("edit", first.savedId);
            const url =
              window.location.pathname +
              `?${params.toString()}` +
              (window.location.hash || "");
            window.history.replaceState(null, "", url);
          }
        }
      }

      if (hasPendingFiles() && currentAttestationId) {
        const merged: DocumentUploadState = {
          "0": [],
          "1": [],
          "2": {
            categories: documentUpload["2"]?.categories ?? [],
            byCategory: { ...(documentUpload["2"]?.byCategory ?? {}) },
          },
          evidenceTestingPolicy: [],
        };
        for (const file of pending["0"]) {
          try {
            const name = await uploadDocument(currentAttestationId, file);
            merged["0"].push(name);
          } catch {
            merged["0"].push(file.name);
          }
        }
        for (const file of pending["1"]) {
          try {
            const name = await uploadDocument(currentAttestationId, file);
            merged["1"].push(name);
          } catch {
            merged["1"].push(file.name);
          }
        }
        for (const [cat, files] of Object.entries(pending["2"])) {
          merged["2"].byCategory[cat] = [];
          for (const file of files) {
            try {
              const name = await uploadDocument(currentAttestationId, file);
              merged["2"].byCategory[cat].push(name);
            } catch {
              merged["2"].byCategory[cat].push(file.name);
            }
          }
        }
        for (const file of pending.evidenceTestingPolicy) {
          try {
            const name = await uploadDocument(currentAttestationId, file);
            merged.evidenceTestingPolicy.push(name);
          } catch {
            merged.evidenceTestingPolicy.push(file.name);
          }
        }
        clearPendingFiles();
        documentUpload = merged;
        setDocumentUpload(merged);
        const second = await doPost(currentAttestationId, merged);
        if (!second.ok) {
          if (!isDraft) setSubmitting(false);
          return false;
        }
        return true;
      }

      const single = await doPost(currentAttestationId ?? null, documentUpload);
      if (!single.ok) {
        if (!isDraft) setSubmitting(false);
        return false;
      }
      if (single.savedId && !currentAttestationId) {
        setAttestationId(single.savedId);
        if (isDraft) setFetchError(null);
        if (window.history.replaceState) {
          const params = new URLSearchParams(window.location.search);
          params.delete("new");
          params.set("edit", single.savedId);
          const url =
            window.location.pathname +
            `?${params.toString()}` +
            (window.location.hash || "");
          window.history.replaceState(null, "", url);
        }
      }
      return true;
    } catch {
      setSubmitError("Network or server error");
      if (!isDraft) setSubmitting(false);
      return false;
    } finally {
      if (!isDraft) setSubmitting(false);
    }
  };

  const handleSaveDraft = async (e: React.MouseEvent) => {
    e.preventDefault();
    const ok = await saveDraftOrSubmit(true);
    if (ok) toast.success("Draft saved successfully.");
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Full submit only: is_draft: false → backend sets status COMPLETED and generates product profile report
    const ok = await saveDraftOrSubmit(false);
    if (ok) {
      toast.success("Attestation submitted. Product profile report has been generated.");
      navigate("/product_profile", { replace: true });
    }
  };

  if (accessDenied) {
    return <Navigate to="/accessDenied" replace />;
  }

  return (
    <div className="sec_user_page org_settings_page">
      {submitting && (
        <div
          className="vendor_attestation_submit_overlay"
          role="status"
          aria-live="polite"
          aria-label="Submitting attestation and generating product profile"
        >
          <div className="vendor_attestation_submit_overlay_content">
            <Loader2 size={32} className="vendor_attestation_submit_overlay_loader" aria-hidden />
            <p>Submitting attestation and generating product profile…</p>
            <p className="vendor_attestation_submit_overlay_hint">Please wait. Do not close or refresh.</p>
          </div>
        </div>
      )}

      <Modal
        isOpen={documentViewerOpen}
        onClose={closeDocumentViewer}
        overlayClassName="vendor_attestation_doc_viewer_overlay"
        popupClassName="vendor_attestation_doc_viewer_modal"
      >
        <div className="vendor_attestation_doc_viewer_content">
          <div className="vendor_attestation_doc_viewer_header">
            <span className="vendor_attestation_doc_viewer_title">
              {documentViewerFileName ?? "Document"}
            </span>
            <button
              type="button"
              className="vendor_attestation_doc_viewer_close"
              onClick={closeDocumentViewer}
              aria-label="Close document viewer"
            >
              <X size={20} />
            </button>
          </div>
          <div className="vendor_attestation_doc_viewer_body">
            {documentViewerLoading ? (
              <div className="vendor_attestation_doc_viewer_loading">
                <Loader2 size={32} className="spin" aria-hidden />
                <p>Loading document…</p>
              </div>
            ) : documentViewerUrl ? (
              <iframe
                title={documentViewerFileName ?? "Document"}
                src={documentViewerUrl}
                className="vendor_attestation_doc_viewer_iframe"
              />
            ) : null}
          </div>
        </div>
      </Modal>

      <div className="org_settings_header page_header_align">
        <div className="org_settings_headers page_header_row">
          <span className="icon_size_header" aria-hidden>
            <FileCheck size={24} className="header_icon_svg" />
          </span>
          <div className="page_header_title_block">
            <h1 className="org_settings_title page_header_title">Vendor Self Attestation</h1>
            <p className="org_settings_subtitle page_header_subtitle">
              Complete and submit your vendor self-attestation.
            </p>
          </div>
        </div>
      </div>

      <div className="form_card_centered">
        <CardContainerOnBoarding>
          <button
            type="button"
            className="form_back_to_assessments"
            onClick={() => navigate("/attestation_details")}
            aria-label="Back to Self Attestations"
            disabled={submitting}
          >
            <ChevronLeftCircle size={18} />
            <span>Back to Self Attestations</span>
          </button>
          {fetchError && (
            <p className="orgError" style={{ marginBottom: "0.5rem" }}>
              {fetchError}
            </p>
          )}
          <form onSubmit={handleSubmit}>
            <MultiStepTabs
              steps={tabStepsWithContent}
              currentStep={currentStep}
              onStepChange={(step) => {
                if (submitting) return;
                setStepValidationError(null);
                setCurrentStep(step);
              }}
              completedSteps={completedStepsForProgress}
              disabledSteps={disabledSteps}
              canGoNext={isVendorAttestationStepValid(currentStep, formState)}
              className="vendor_onboarding_tabs"
            />

            <CardOnBoarding className="card_vendor">
              {stepValidationError && (
                <p
                  className="orgError"
                  style={{ marginBottom: "0.5rem" }}
                  role="alert"
                >
                  {stepValidationError}
                </p>
              )}
              {submitError && (
                <p className="orgError" style={{ marginTop: "0.5rem" }}>
                  {submitError}
                </p>
              )}

              <div className="vendor_action_btns">
                {!allStepsFilled && (
                  <div className="action_back">
                    <Button
                      type="button"
                      onClick={currentStep > 0 ? handleBack : undefined}
                      disabled={currentStep === 0 || submitting}
                      className="back_btn"
                    >
                      <span>
                        <ChevronLeftCircle size={16} />
                        Back
                      </span>
                    </Button>
                  </div>
                )}
                <div className="last_two_btns">
                  {!allStepsFilled && !isFromOnboarding && (
                    <div className="vendor_attestation_save_draft_wrapper">
                      <Button
                        type="button"
                        onClick={handleSaveDraft}
                        disabled={submitting}
                        className="vendor_attestation_save_draft_btn_form"
                      >
                        <span>
                          <Save size={16} />
                          Save draft
                        </span>
                      </Button>
                    </div>
                  )}

                  {currentStep < totalSteps - 1 && (
                    <div className="action_continue_btn">
                      <Button
                        type="button"
                        onClick={handleContinue}
                        disabled={submitting}
                        className="continue_btn"
                      >
                        <span>
                          Continue <ChevronRightCircle size={16} />
                        </span>
                      </Button>
                    </div>
                  )}

                  {currentStep === totalSteps - 1 && !allStepsFilled && (
                    <div className="action_submit_btn">
                      <Button type="submit" className="submit_btn_vendor" disabled={submitting}>
                        <span>
                          Submit <Send size={16} />
                        </span>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </CardOnBoarding>
          </form>
        </CardContainerOnBoarding>
      </div>
    </div>
  );
};

export default VendorAttestationsMainForm;
