import "../../VendorOnboarding/vendor_onboarding.css";
import "../../BuyerOnboarding/buyer_onboarding.css";
import "../../VendorAttestations/vendor_attestation_preview.css";
import "../../UserManagement/user_management.css";
import "../../../../styles/card.css";
import CardContainerOnBoarding from "../../../UI/CardContainerOnBoarding";
import CardOnBoarding from "../../../UI/CardOnBoarding";
import MultiStepTabs from "../../../UI/MultiStepTabs";
import {
  BUYER_COTS_INITIAL_STATE,
  BUYER_COTS_MULTISELECT_KEYS,
} from "../../../../constants/buyerCotsAssessmentKeys";
import { BUYER_COTS_FORM_SECTIONS } from "../../../../constants/buyerCotsFormSchema";
import {
  applyBuyerCotsDerivedFields,
  defaultReviewDueDate,
  sessionAssessorName,
} from "../../../../constants/buyerCotsDerived";
import {
  flattenOnboardingSectorIndustries,
  mapOnboardingToAssessmentForm,
  toBuyerSectorValue,
} from "../../../../constants/buyerCotsOnboardingMapping";
import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useParams, Navigate, useLocation } from "react-router-dom";
import { toast } from "react-toastify";
import { apiErrorMessage, errorToUserMessage } from "../../../../utils/tokenQuotaError";
import Button from "../../../UI/Button";
import {
  ChevronLeftCircle,
  ChevronRightCircle,
  Send,
  Save,
  FileCheck,
} from "lucide-react";
import CardConfirmation from "../../../UI/CardConfirmation";
import SubmitProgressOverlay from "../../../UI/SubmitProgressOverlay";
import BuyerCotsDynamicStep from "./BuyerCotsDynamicStep";
import StepBuyerCotsPreview from "./StepBuyerCotsPreview";
import { BUYER_COTS_TAB_STEPS } from "./buyerCotsTabs";
import {
  BUYER_COTS_ATTESTATION_PREFILL_KEYS,
  mergeAttestationPrefill,
} from "../../../../constants/buyerCotsAttestationMapping";

const BASE_URL =
  import.meta.env.VITE_BASE_URL ?? "http://localhost:5003/api/v1";
// After Evidence go to Review; Auto-Generated step commented out
const TOTAL_STEPS = 9;

const BUYER_COTS_SECTION_KEYS = [
  "context",
  "purchase",
  "dataLegal",
  "oversight",
  "environment",
  "vendorTrust",
  "exit",
  "provenance",
] as const;

type BuyerAssessmentPrefillState = {
  prefillVendorName?: unknown;
  prefillProductName?: unknown;
  vendorName?: unknown;
  productName?: unknown;
};

function hasValue(
  formData: Record<string, string>,
  key: string,
  isMultiselect: boolean,
): boolean {
  const v = formData[key];
  if (v == null || v === "") return false;
  if (isMultiselect || key === "industrySector") {
    try {
      const parsed = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.length > 0;
      if (parsed && typeof parsed === "object") {
        return flattenOnboardingSectorIndustries(parsed).length > 0;
      }
    } catch {
      return false;
    }
  }
  return String(v).trim().length > 0;
}

function parseJsonList(raw: unknown): string[] {
  if (raw == null || raw === "") return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function isBuyerCotsStepValid(
  stepIndex: number,
  formData: Record<string, string>,
): boolean {
  return Object.keys(getBuyerCotsStepFieldErrors(stepIndex, formData)).length === 0;
}

function getBuyerCotsStepFieldErrors(
  stepIndex: number,
  formData: Record<string, string>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (stepIndex < 0 || stepIndex >= BUYER_COTS_FORM_SECTIONS.length) return errors;
  const section = BUYER_COTS_FORM_SECTIONS[stepIndex];
  for (const field of section.fields) {
    if (field.showWhen) {
      const raw = String(formData[field.showWhen.key] ?? "");
      const visible =
        raw.includes(field.showWhen.includes) ||
        parseJsonList(raw).some((v) => v.includes(field.showWhen!.includes));
      if (!visible) continue;
    }
    if (!field.required) continue;
    if (field.readOnly) continue;
    if ((BUYER_COTS_ATTESTATION_PREFILL_KEYS as readonly string[]).includes(field.key)) continue;
    if (field.inputType === "vendorProduct") {
      if (!hasValue(formData, "vendorName", false)) errors.vendorName = "This field is required";
      if (!hasValue(formData, "productName", false)) errors.productName = "This field is required";
      continue;
    }
    if (field.inputType === "targetOutcome") {
      if (!hasValue(formData, "targetOutcomeMetric", false))
        errors.targetOutcomeMetric = "This field is required";
      if (!hasValue(formData, "targetOutcomeBaseline", false))
        errors.targetOutcomeBaseline = "This field is required";
      if (!hasValue(formData, "targetOutcomeTarget", false))
        errors.targetOutcomeTarget = "This field is required";
      continue;
    }
    if (field.inputType === "accountableOwner") {
      if (!hasValue(formData, "owningDepartment", false))
        errors.owningDepartment = "This field is required";
      if (!hasValue(formData, "accountableOwnerName", false))
        errors.accountableOwnerName = "This field is required";
      if (!hasValue(formData, "accountableOwnerRole", false))
        errors.accountableOwnerRole = "This field is required";
      continue;
    }
    if (field.inputType === "assessor") {
      if (!hasValue(formData, "assessorName", false))
        errors.assessorName = "This field is required";
      if (!hasValue(formData, "assessorRole", false))
        errors.assessorRole = "This field is required";
      continue;
    }
    if (field.inputType === "confirmDispute") {
      const hasAnswer =
        hasValue(formData, field.key, false) || hasValue(formData, `${field.key}Attested`, false);
      if (!hasAnswer) errors[field.key] = "This field is required";
      continue;
    }
    if (field.inputType === "industrySector") {
      if (!hasValue(formData, field.key, true)) errors[field.key] = "This field is required";
      continue;
    }
    if (field.inputType === "evidenceHold") {
      if (!hasValue(formData, "vendorEvidenceReceived", true)) {
        errors.vendorEvidenceReceived = "This field is required";
      }
      continue;
    }
    if (field.inputType === "integrationAccess") {
      if (!hasValue(formData, "integrationSystems", true)) {
        errors.integrationSystems = "This field is required";
      }
      continue;
    }
    const multi = field.inputType === "multiselect";
    if (!hasValue(formData, field.key, multi)) errors[field.key] = "This field is required";
  }
  if (section.id === "oversight") {
    const domains = parseJsonList(formData.decisionDomains);
    const highRisk = domains.length > 0 && !domains.includes("None of these");
    if (highRisk && !hasValue(formData, "humanReviewLevel", false)) {
      errors.humanReviewLevel = "Required for high-risk decision domains";
    }
  }
  return errors;
}

const AUTO_GENERATED_KEYS = [
  "identifiedRisks",
  "riskDomainScores",
  "contextualMultipliers",
  "riskMitigation",
];

/** Form keys that store multiselect as JSON strings; send as parsed arrays for jsonb columns */
const MULTISELECT_JSON_KEYS = BUYER_COTS_MULTISELECT_KEYS;

function prepareSubmitPayload(
  data: Record<string, string>,
  riskMitigationMappingIds: number[],
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...data };
  for (const key of MULTISELECT_JSON_KEYS) {
    const v = out[key];
    if (typeof v === "string" && v.trim().length > 0) {
      try {
        const parsed = JSON.parse(v);
        if (key === "industrySector") {
            const labels = flattenOnboardingSectorIndustries(parsed);
            if (labels.length > 0) out[key] = labels;
            continue;
          }
          if (Array.isArray(parsed)) out[key] = parsed;
      } catch {
        // leave as string if not valid JSON
      }
    }
  }
  for (const key of ["integrationAccessLevels"] as const) {
    const v = out[key];
    if (typeof v === "string" && v.trim().length > 0) {
      try {
        const parsed = JSON.parse(v);
        if (parsed && typeof parsed === "object") out[key] = parsed;
      } catch {
        /* leave */
      }
    }
  }
  if (riskMitigationMappingIds.length > 0) {
    out.riskMitigationMappingIds = riskMitigationMappingIds;
  }
  const attestationId = String(data.vendorAttestationId ?? data.selectedProductId ?? "").trim();
  if (attestationId) {
    out.vendorAttestationId = attestationId;
    out.selectedProductId = attestationId;
  }
  return out;
}

const BuyerAssessment = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { id: assessmentIdFromUrl } = useParams();
  const [assessmentId, setAssessmentId] = useState<string | null>(
    assessmentIdFromUrl ?? null,
  );
  const [currentStep, setCurrentStep] = useState(0);
  const [allStepsFilled, setAllStepsFilled] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>(() =>
    applyBuyerCotsDerivedFields({
      ...BUYER_COTS_INITIAL_STATE,
      assessorName: sessionAssessorName(),
      reviewDueDate: defaultReviewDueDate(),
    }),
  );
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [autoGeneratedLoading, setAutoGeneratedLoading] = useState(false);
  const [onboardingFetched, setOnboardingFetched] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const [riskMitigationMappingIds, setRiskMitigationMappingIds] = useState<
    number[]
  >([]);
  const [validationAttemptedSteps, setValidationAttemptedSteps] = useState<
    Set<number>
  >(new Set());
  const autoGeneratedFetchedRef = useRef(false);

  const handleContinue = async () => {
    if (
      currentStep < BUYER_COTS_SECTION_KEYS.length &&
      !isBuyerCotsStepValid(currentStep, formData)
    ) {
      setValidationAttemptedSteps((prev) => new Set(prev).add(currentStep));
      return;
    }
    const saved = await handleSaveDraft({ silent: true });
    if (saved) setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS - 1));
  };
  const handleBack = () => setCurrentStep((prev) => Math.max(0, prev - 1));
  const handleBackToAssessments = () => navigate("/assessments");

  // Sync assessmentId from URL (e.g. when navigating to /buyerAssessment/:id)
  useEffect(() => {
    if (assessmentIdFromUrl) setAssessmentId(assessmentIdFromUrl);
  }, [assessmentIdFromUrl]);

  // Prefill vendor/product when user starts from AI Vendor Directory create-assessment action.
  useEffect(() => {
    if (assessmentIdFromUrl) return;
    const params = new URLSearchParams(location.search);
    const state = (location.state ?? {}) as BuyerAssessmentPrefillState;
    const pickText = (value: unknown): string =>
      typeof value === "string" ? value.trim() : "";

    const vendorName =
      pickText(state.prefillVendorName) ||
      pickText(state.vendorName) ||
      pickText(params.get("vendorName"));
    const productName =
      pickText(state.prefillProductName) ||
      pickText(state.productName) ||
      pickText(params.get("productName"));

    if (!vendorName && !productName) return;
    setFormData((prev) => {
      const next = { ...prev };
      if (vendorName) next.vendorName = vendorName;
      if (productName) next.productName = productName;
      if (
        next.vendorName === prev.vendorName &&
        next.productName === prev.productName
      ) {
        return prev;
      }
      return next;
    });
  }, [assessmentIdFromUrl, location.search, location.state]);

  // Load draft by id when URL has /buyerAssessment/:id
  useEffect(() => {
    if (!assessmentIdFromUrl || draftLoaded) return;
    const token = sessionStorage.getItem("bearerToken");
    if (!token) return;
    setDraftLoaded(true); // prevent re-run
    fetch(`${BASE_URL}/buyerCotsAssessment/${assessmentIdFromUrl}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        const result = await res.json().catch(() => ({}));
        if (res.status === 403 || (!res.ok && !result?.success)) {
          setAccessDenied(true);
          return;
        }
        if (result?.success && result?.data) {
          const d = result.data;
          const status = String(d.status ?? "").toLowerCase();
          if (status === "completed" || status === "submitted") {
            toast.info("This assessment is completed and cannot be edited.");
            navigate("/assessments", { replace: true });
            return;
          }
          setAssessmentId(d.assessmentId);
          const patch: Record<string, string> = {};
          Object.keys({ ...BUYER_COTS_INITIAL_STATE, vendorName: "", productName: "" }).forEach(
            (key) => {
              const v = d[key];
              if (v == null) return;
              if (key === "industrySector") {
                const sector = toBuyerSectorValue(v);
                if (
                  sector.public_sector.length ||
                  sector.private_sector.length ||
                  sector.non_profit_sector.length
                ) {
                  patch[key] = JSON.stringify(sector);
                }
                return;
              }
              if (typeof v === "object") {
                patch[key] = JSON.stringify(v);
                return;
              }
              patch[key] = String(v);
            },
          );
          if (d.reviewDueDate) {
            patch.reviewDueDate = String(d.reviewDueDate).slice(0, 10);
          }
          if (Array.isArray(d.riskMitigationMappingIds))
            setRiskMitigationMappingIds(
              d.riskMitigationMappingIds
                .map((n: number) => Number(n))
                .filter((n: number) => !Number.isNaN(n)),
            );
          setFormData((prev) => applyBuyerCotsDerivedFields(prev, patch));
          const orgId = d.organizationId;
          if (orgId) sessionStorage.setItem("organizationId", orgId);
        }
      })
      .catch(() => {
        /* keep draftLoaded true so we don't retry in a loop */
      });
  }, [assessmentIdFromUrl, draftLoaded, navigate]);

  const attestationPrefillRef = useRef<string>("");
  useEffect(() => {
    const attestationId = String(
      formData.vendorAttestationId ?? formData.selectedProductId ?? "",
    ).trim();
    if (!attestationId) {
      attestationPrefillRef.current = "";
      return;
    }
    if (attestationPrefillRef.current === attestationId) return;
    const token = sessionStorage.getItem("bearerToken");
    if (!token) return;
    fetch(`${BASE_URL.replace(/\/$/, "")}/buyerCotsAssessment/attestation-prefill/${encodeURIComponent(attestationId)}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json?.success || !json.prefill) return;
        attestationPrefillRef.current = attestationId;
        setFormData((prev) => mergeAttestationPrefill(prev, json.prefill as Record<string, string>, true));
      })
      .catch(() => {
        /* leave fields for the user to complete */
      });
  }, [
    formData.vendorAttestationId,
    formData.selectedProductId,
    formData.trainingUseOfData,
    formData.monitoringDataAvailable,
    formData.auditLogsAvailable,
    formData.dataExportCapability,
  ]);

  // Fetch buyer onboarding for the current user's org and pre-fill auto-populated fields (read-only in UI)
  useEffect(() => {
    if (onboardingFetched) return;
    const token = sessionStorage.getItem("bearerToken");
    if (!token) return;

    setOnboardingFetched(true);

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    const applyBuyerData = (result, isEditDraft: boolean) => {
      const buyer = result?.data?.buyer ?? null;
      if (buyer && result?.data?.organizationId) {
        sessionStorage.setItem("organizationId", result.data.organizationId);
      }
      const patch = mapOnboardingToAssessmentForm(buyer);
      if (!Object.keys(patch).length) return;
      // New assessment: apply all onboarding fields.
      // Draft edit: only fill fields that are still empty so saved answers are not overwritten.
      setFormData((prev) => {
        if (!isEditDraft) return applyBuyerCotsDerivedFields(prev, patch);
        const nextPatch: Record<string, string> = {};
        for (const [key, value] of Object.entries(patch)) {
          const existing = prev[key];
          const empty =
            existing == null ||
            String(existing).trim() === "" ||
            String(existing).trim() === "[]";
          if (empty) nextPatch[key] = value;
        }
        return applyBuyerCotsDerivedFields(prev, nextPatch);
      });
    };

    const isEditDraft = Boolean(assessmentIdFromUrl);
    // 1) GET /buyerOnboarding/me – uses JWT to get user's org and return buyer onboarding
    fetch(`${BASE_URL}/buyerOnboarding/me`, { method: "GET", headers })
      .then((res) => res.json())
      .then((result) => {
        if (result?.data != null) {
          applyBuyerData(result, isEditDraft);
          return;
        }
        throw new Error("No data");
      })
      .catch(() => {
        const organizationId = sessionStorage.getItem("organizationId");
        if (!organizationId) return;
        return fetch(
          `${BASE_URL}/orgOnboarding/${encodeURIComponent(organizationId)}`,
          {
            method: "GET",
            headers,
          },
        )
          .then((res) => res.json())
          .then((r) => applyBuyerData(r, isEditDraft));
      })
      .catch(() => setOnboardingFetched(false));
  }, [onboardingFetched, assessmentIdFromUrl]);

  // Auto Generated step commented out: after Evidence go to Review
  // useEffect(() => {
  //   if (currentStep !== 8 || autoGeneratedFetchedRef.current) return;
  //   const token = sessionStorage.getItem("bearerToken");
  //   const organizationId = sessionStorage.getItem("organizationId");
  //   if (!token || !organizationId) return;
  //   autoGeneratedFetchedRef.current = true;
  //   setAutoGeneratedLoading(true);
  //   fetch(`${BASE_URL}/buyerCotsAssessment/autoGenerated`, {
  //     method: "POST",
  //     headers: {
  //       "Content-Type": "application/json",
  //       Authorization: `Bearer ${token}`,
  //     },
  //     body: JSON.stringify({ organizationId, ...formData }),
  //   })
  //     .then((res) => res.json())
  //     .then((result) => {
  //       if (result.data) {
  //         setFormData((prev) => {
  //           const next = { ...prev };
  //           AUTO_GENERATED_KEYS.forEach((key) => {
  //             if (result.data[key] != null)
  //               next[key] = String(result.data[key]);
  //           });
  //           return next;
  //         });
  //         const ids = result.data.riskMitigationMappingIds;
  //         if (Array.isArray(ids)) {
  //           setRiskMitigationMappingIds(
  //             ids.map((id) => Number(id)).filter((n) => !Number.isNaN(n)),
  //           );
  //         }
  //       }
  //     })
  //     .catch(() => {
  //       autoGeneratedFetchedRef.current = false;
  //     })
  //     .finally(() => setAutoGeneratedLoading(false));
  // }, [currentStep]);

  const handleSaveDraft = async (options?: { silent?: boolean }): Promise<boolean> => {
    const silent = options?.silent === true;
    setSubmitError("");
    const token = sessionStorage.getItem("bearerToken");
    const organizationId = sessionStorage.getItem("organizationId");
    if (!token) {
      setSubmitError("Please log in again.");
      return false;
    }
    if (!organizationId) {
      setSubmitError(
        "Organization context missing. Please complete onboarding or log in again.",
      );
      return false;
    }
    if (!silent) setSavingDraft(true);
    try {
      const payload: Record<string, unknown> = {
        organizationId,
        ...prepareSubmitPayload(formData, riskMitigationMappingIds),
      };
      if (assessmentId) payload.assessmentId = assessmentId;
      const response = await fetch(
        `${BASE_URL}/buyerCotsAssessment/save-draft`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        },
      );
      let result: { message?: string; assessmentId?: string } = {};
      try {
        const text = await response.text();
        if (text) result = JSON.parse(text);
      } catch {
        result = {
          message: response.ok ? "Draft saved" : "Failed to save draft",
        };
      }
      if (!response.ok)
        throw new Error(result.message || "Failed to save draft");
      const savedId =
        result.assessmentId != null ? String(result.assessmentId) : null;
      if (savedId) {
        setAssessmentId(savedId);
        if (!assessmentIdFromUrl) {
          window.history.replaceState(null, "", `/buyerAssessment/${savedId}`);
        }
      }
      if (!silent) toast.success("Draft saved.");
      return true;
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : "Failed to save draft",
      );
      return false;
    } finally {
      if (!silent) setSavingDraft(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");
    setSubmitting(true);
    const token = sessionStorage.getItem("bearerToken");
    const organizationId = sessionStorage.getItem("organizationId");
    if (!organizationId) {
      setSubmitError(
        "Organization context missing. Please complete onboarding or log in again.",
      );
      setSubmitting(false);
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        organizationId,
        ...prepareSubmitPayload(formData, riskMitigationMappingIds),
      };
      if (assessmentId) payload.assessmentId = assessmentId;
      const response = await fetch(`${BASE_URL}/buyerCotsAssessment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(apiErrorMessage(result, "Failed to submit assessment"));
      }
      const submittedId =
        result.assessmentId != null
          ? String(result.assessmentId)
          : assessmentId != null
            ? String(assessmentId)
            : "";
      if (submittedId) {
        navigate(
          `/buyer-vendor-risk-report/${encodeURIComponent(submittedId)}`,
          { replace: true },
        );
      } else {
        navigate("/reports", { replace: true });
      }
    } catch (err) {
      setSubmitError(errorToUserMessage(err, "Failed to submit assessment"));
    } finally {
      setSubmitting(false);
    }
  };

  const stepFieldErrors = useMemo(
    () => getBuyerCotsStepFieldErrors(currentStep, formData),
    [currentStep, formData],
  );
  const effectiveFieldErrors = useMemo(
    () =>
      validationAttemptedSteps.has(currentStep) ? stepFieldErrors : {},
    [validationAttemptedSteps, currentStep, stepFieldErrors],
  );
  const disabledSteps = useMemo(() => {
    const disabled: number[] = [];
    for (let i = 0; i < TOTAL_STEPS; i++) {
      if (
        i < BUYER_COTS_SECTION_KEYS.length &&
        !isBuyerCotsStepValid(i, formData)
      ) {
        for (let j = i + 1; j < TOTAL_STEPS; j++) disabled.push(j);
        break;
      }
    }
    return disabled;
  }, [formData]);

  const stepIconNodes = useMemo(
    () =>
      BUYER_COTS_TAB_STEPS.map((s) =>
        s.icon ? <s.icon key={s.id} size={18} /> : null
      ),
    [],
  );

  const tabStepsWithContent = useMemo(
    () =>
      BUYER_COTS_TAB_STEPS.map((step, index) => {
        const iconNode = stepIconNodes[index];
        const commonHeader = {
          title: step.label,
          subTitle: step.subTitle,
          icon: iconNode,
        };
        const fieldErrors =
          index === currentStep && index < BUYER_COTS_FORM_SECTIONS.length
            ? effectiveFieldErrors
            : undefined;
        let content: React.ReactNode;
        if (index < BUYER_COTS_FORM_SECTIONS.length) {
          content = (
            <BuyerCotsDynamicStep
              section={BUYER_COTS_FORM_SECTIONS[index]}
              formData={formData}
              setFormData={setFormData}
              fieldErrors={fieldErrors}
              {...commonHeader}
            />
          );
        } else {
          content = (
            <StepBuyerCotsPreview formData={formData} {...commonHeader} />
          );
        }
        return {
          id: step.id,
          label: step.label,
          icon: step.icon,
          content,
        };
      }),
    [
      formData,
      stepIconNodes,
      currentStep,
      effectiveFieldErrors,
    ],
  );

  const completedStepsForProgress = Array.from(
    { length: currentStep },
    (_, i) => i,
  );

  if (assessmentIdFromUrl && accessDenied) {
    return <Navigate to="/accessDenied" replace />;
  }

  return (
    <div className="sec_user_page org_settings_page">
      <div className="org_settings_header page_header_align">
        <div className="org_settings_headers page_header_row">
          <span className="icon_size_header" aria-hidden>
            <FileCheck size={24} className="header_icon_svg" />
          </span>
          <div className="page_header_title_block">
            <h1 className="org_settings_title page_header_title">Buyer COTS Assessment</h1>
            <p className="org_settings_subtitle page_header_subtitle">
              Complete and submit your buyer assessment.
            </p>
          </div>
        </div>
      </div>
      {submitting && (
        <SubmitProgressOverlay
          variant="assessment"
          headline="Building an assessment that can explain itself"
        />
      )}
      <div className="form_card_centered">
      <CardContainerOnBoarding>
        <button
          type="button"
          className="form_back_to_assessments"
          onClick={() => navigate("/assessments")}
          aria-label="Back to Assessments"
          disabled={submitting}
        >
          <ChevronLeftCircle size={18} />
          <span>Back to Assessments</span>
        </button>
        <form onSubmit={handleSubmit}>
          {allStepsFilled ? (
            <CardOnBoarding className="card_vendor">
              <CardConfirmation />
            </CardOnBoarding>
          ) : (
            <>
              <MultiStepTabs
                steps={tabStepsWithContent}
                currentStep={currentStep}
                onStepChange={(step) => {
                  if (submitting) return;
                  setCurrentStep(step);
                }}
                completedSteps={completedStepsForProgress}
                disabledSteps={disabledSteps}
                canGoNext={
                  currentStep >= TOTAL_STEPS - 1 ||
                  isBuyerCotsStepValid(currentStep, formData)
                }
                className="vendor_onboarding_tabs"
              />
              <CardOnBoarding className="card_vendor">
                {submitError && (
                  <p
                    className="vendor_form_block_error"
                    role="alert"
                    style={{ marginBottom: 8 }}
                  >
                    {submitError}
                  </p>
                )}
                <div className="vendor_action_btns">
                  {!allStepsFilled && (
                    <div className="action_back">
                      <Button
                        type="button"
                        onClick={
                          currentStep === 0
                            ? handleBackToAssessments
                            : handleBack
                        }
                        disabled={submitting}
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
                    {!allStepsFilled && (
                      <div className="vendor_attestation_save_draft_wrapper">
                        <Button
                          type="button"
                          onClick={handleSaveDraft}
                          disabled={savingDraft || submitting}
                          className="vendor_attestation_save_draft_btn_form"
                        >
                          <span>
                            <Save size={16} />
                            {savingDraft ? " Saving…" : " Save draft"}
                          </span>
                        </Button>
                      </div>
                    )}

                    {currentStep < TOTAL_STEPS - 1 && !allStepsFilled && (
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

                    {currentStep === TOTAL_STEPS - 1 && !allStepsFilled && (
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
            </>
          )}
        </form>
      </CardContainerOnBoarding>
      </div>
    </div>
  );
};

export default BuyerAssessment;
