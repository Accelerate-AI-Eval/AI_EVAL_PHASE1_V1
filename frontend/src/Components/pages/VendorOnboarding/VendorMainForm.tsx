import { useEffect, useState, useMemo, useCallback } from "react";
import type { z } from "zod";
import "./vendor_onboarding.css";
import Button from "../../UI/Button";
import StepCompanyProfile from "./StepCompanyProfile";
import StepContactInformation from "./StepContactInformation";
import StepCompanyScale from "./StepCompanyScale";
import StepGeopgraphy from "./StepGeopgraphy";
import { ChevronLeftCircle, ChevronRightCircle, Send } from "lucide-react";
import StepVendorOnboardingPreview from "./StepVendorOnboardingPreview";
import { useNavigate, useParams } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import CardOnBoarding from "../../UI/CardOnBoarding";
import CardContainerOnBoarding from "../../UI/CardContainerOnBoarding";
import CardConfirmation from "../../UI/CardConfirmation";
import MultiStepTabs from "../../UI/MultiStepTabs";
import { toast } from "react-toastify";
import { VENDOR_ONBOARDING_TAB_STEPS } from "./vendorOnboardingTabs";
import type { VendorDataInterface } from "../../../types/formDataVendor";
import { vendorStep1CompanyProfileSchema } from "../../../schemas/onboarding/vendor.schema";
import { vendorStep2ContactSchema } from "../../../schemas/onboarding/vendorStep2.schema";
import { vendorStep3CompanyScaleSchema } from "../../../schemas/onboarding/vendorStep3.schema";
import { vendorStep4GeographySchema } from "../../../schemas/onboarding/vendorStep4.schema";
import { getApiBaseUrl } from "../../../utils/apiBaseUrl";
import { fetchOnboardingAccessStatus } from "../../../utils/onboardingAccessStatus";

interface OnboardingJwtPayload {
  email?: string;
  userId?: string | number;
  organizationId?: string | number;
  exp?: number;
}

/** Flatten Zod error into a list of user-facing messages */
function getValidationMessages(error: z.ZodError): string[] {
  const flat = error.flatten()
  const form: string[] = flat.formErrors ?? []
  const field: string[] = (flat.fieldErrors && Object.values(flat.fieldErrors).flat()) as string[]
  return [...form, ...field].filter(Boolean)
}

/** Per-field errors for inline display. Step 0: assign formErrors (e.g. sector refine) to "sector". */
function getFieldErrorsFromZod(error: z.ZodError, stepIndex: number): Record<string, string> {
  const flat = error.flatten()
  const result: Record<string, string> = {}
  const fieldErrors = flat.fieldErrors as Record<string, string[] | undefined> | undefined
  if (fieldErrors) {
    for (const [key, messages] of Object.entries(fieldErrors)) {
      if (Array.isArray(messages) && messages[0]) result[key] = messages[0]
    }
  }
  const formErrors = flat.formErrors ?? []
  if (stepIndex === 0 && formErrors.length > 0) result.sector = formErrors[0]
  return result
}


/** Default empty form state for vendor onboarding */
const getDefaultVendorFormState = (
  type: string,
  vendor_Id: string | null,
  organization_Id: string | null,
): VendorDataInterface & {
  role?: string;
  vendorId?: string | null;
  organization_Id?: string;
} => ({
  role: type,
  vendorId: vendor_Id,
  organization_Id: organization_Id ?? undefined,
  vendorType: "",
  vendorName: "",
  sector: {
    public_sector: [],
    private_sector: [],
    non_profit_sector: [],
  },
  vendorMaturity: "",
  companyWebsite: "",
  companyDescription: "",
  primaryContactName: "",
  primaryContactEmail: "",
  primaryContactRole: "",
  employeeCount: "",
  yearFounded: "" as unknown as number,
  headquartersLocation: "",
  operatingRegions: [],
});

/**
 * Normalize API vendor data into form state. Handles missing/empty fields and sector shape.
 */
function mapApiDataToFormState(
  apiData: Record<string, unknown>,
  defaults: ReturnType<typeof getDefaultVendorFormState>,
): VendorDataInterface & {
  role?: string;
  vendorId?: string | null;
  organization_Id?: string;
} {
  const sector = apiData.sector;
  let sectorNormalized = defaults.sector;
  if (sector && typeof sector === "object" && !Array.isArray(sector)) {
    const s = sector as Record<string, unknown>;
    sectorNormalized = {
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
    ...defaults,
    organization_Id:
      (apiData.organizationId as string) ?? defaults.organization_Id,
    vendorType: (apiData.vendorType as string) ?? "",
    vendorName: (apiData.vendorName as string) ?? "",
    sector: sectorNormalized,
    vendorMaturity: (apiData.vendorMaturity as string) ?? "",
    companyWebsite: (apiData.companyWebsite as string) ?? "",
    companyDescription: (apiData.companyDescription as string) ?? "",
    primaryContactName: (apiData.primaryContactName as string) ?? "",
    primaryContactEmail: (apiData.primaryContactEmail as string) ?? "",
    primaryContactRole: (apiData.primaryContactRole as string) ?? "",
    employeeCount: (apiData.employeeCount as string) ?? "",
    yearFounded:
      apiData.yearFounded != null && apiData.yearFounded !== ""
        ? Number(apiData.yearFounded)
        : (defaults.yearFounded as number),
    headquartersLocation: (apiData.headquartersLocation as string) ?? "",
    operatingRegions: Array.isArray(apiData.operatingRegions)
      ? (apiData.operatingRegions as string[])
      : [],
  };
}

export default function VendorMainForm({ type }: { type: string }) {
  const { token: tokenFromRoute } = useParams<{ token: string }>();

  useEffect(() => {
    document.title = "AI-Q | Vendor Onboarding";
  }, []);

  /** JWT is in the URL (`/onBoarding/vendorOnboarding/:token`); keep sessionStorage in sync for refresh/back. */
  useEffect(() => {
    const raw = tokenFromRoute?.trim();
    if (!raw) return;
    sessionStorage.setItem("onboardingToken", raw);
    try {
      const decoded = jwtDecode<OnboardingJwtPayload>(raw);
      if (decoded.email) sessionStorage.setItem("email", String(decoded.email));
      if (decoded.userId != null) {
        sessionStorage.setItem("userId", String(decoded.userId));
      }
      if (decoded.organizationId != null) {
        sessionStorage.setItem("organizationId", String(decoded.organizationId));
      }
    } catch {
      // API still validates Bearer token
    }
  }, [tokenFromRoute]);

  const BASE_URL = getApiBaseUrl();
  const onboardingToken =
    tokenFromRoute && tokenFromRoute.trim() !== ""
      ? tokenFromRoute.trim()
      : sessionStorage.getItem("onboardingToken");

  const vendor_Id = sessionStorage.getItem("userId");
  const organization_Id =
    sessionStorage.getItem("organizationId") ??
    sessionStorage.getItem("org_Id");
  const navigate = useNavigate();

  const allDataVendor = useMemo(
    () => getDefaultVendorFormState(type, vendor_Id, organization_Id),
    [type, vendor_Id, organization_Id],
  );

  const [currentStep, setCurrentStep] = useState<number>(0);
  const [allStepsFilled, setAllStepsFilled] = useState<boolean>(false);
  const [formVendorData, setFormVendorData] =
    useState<VendorDataInterface>(allDataVendor);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<z.ZodError | null>(null);
  /** Inline field errors only after user clicks Continue and validation fails on that step */
  const [showInlineErrors, setShowInlineErrors] = useState(false);
  // Path to vendor self attestation (set after successful onboarding submit; includes token when available)
  const [attestationPath, setAttestationPath] = useState<string>("");
  const [onboardingGateReady, setOnboardingGateReady] = useState(false);

  useEffect(() => {
    const t = onboardingToken?.trim();
    if (!t) {
      setOnboardingGateReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const result = await fetchOnboardingAccessStatus(t);
      if (cancelled) return;
      if (result.ok && result.onboardingCompleted) {
        sessionStorage.removeItem("onboardingToken");
        toast.info("You have already completed onboarding. Please sign in.");
        navigate("/login", { replace: true });
        return;
      }
      if (!result.ok && (result.reason === "unauthorized" || result.reason === "not_found")) {
        sessionStorage.removeItem("onboardingToken");
        navigate("/login", { replace: true });
        return;
      }
      setOnboardingGateReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [onboardingToken, navigate]);

  /** When user clicks "Proceed to Vendor Self Attestation": already auto-logged in from submit, or login with signup credentials. Then CardConfirmation navigates to self attestation (which fetches vendor onboarding data). */
  const handleProceedToAttestation = useCallback(async () => {
    if (sessionStorage.getItem("bearerToken")) {
      return;
    }
    const signupEmail = sessionStorage.getItem("signupEmail")?.trim();
    const signupPassword = sessionStorage.getItem("signupPassword");
    if (!signupEmail || !signupPassword) {
      throw new Error("Sign-in credentials not found. Please sign in from the login page, then go to Vendor Self Attestation.");
    }
    const response = await fetch(`${BASE_URL}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: signupEmail.toLowerCase(), password: signupPassword }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message ?? "Login failed. Please sign in from the login page.");
    }
    const bearerToken = result.token;
    const userDetails = result.userDetails?.[0] as Record<string, unknown> | undefined;
    if (!bearerToken || !userDetails) {
      throw new Error("Invalid response from server. Please sign in from the login page.");
    }
    sessionStorage.setItem("bearerToken", bearerToken);
    sessionStorage.setItem("userEmail", String(userDetails.email ?? ""));
    sessionStorage.setItem("userRole", userDetails.role != null ? String(userDetails.role).trim() : "");
    sessionStorage.setItem("userId", String(userDetails.id ?? ""));
    sessionStorage.setItem("organizationName", String(userDetails.organization_name ?? "").trim());
    sessionStorage.setItem("organizationId", String(userDetails.organization_id ?? userDetails.organizationId ?? "").trim());
    sessionStorage.setItem("userName", String(userDetails.user_name ?? "").trim());
    sessionStorage.setItem("userFirstName", String(userDetails.user_first_name ?? "").trim());
    sessionStorage.setItem("userLastName", String(userDetails.user_last_name ?? "").trim());
    const platformRole = userDetails.user_platform_role;
    sessionStorage.setItem("systemRole", platformRole != null && String(platformRole).trim() !== "" ? String(platformRole).trim() : "vendor");
    sessionStorage.setItem("user_signup_completed", String(userDetails.user_signup_completed ?? "false"));
    sessionStorage.setItem("user_onboarding_completed", String(userDetails.user_onboarding_completed ?? "true"));
    sessionStorage.removeItem("signupEmail");
    sessionStorage.removeItem("signupPassword");
    toast.success("Signed in successfully.");
  }, [BASE_URL]);

  // Fetch existing vendor onboarding data for the logged-in user and map into form state
  useEffect(() => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token) return;

    let cancelled = false;
    const fetchVendorData = async () => {
      setFetchError(null);
      try {
        const response = await fetch(`${BASE_URL}/vendorOnboarding`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        const text = await response.text();
        let result: {
          success?: boolean;
          data?: Record<string, unknown>;
          message?: string;
        } = {};
        try {
          result = text ? JSON.parse(text) : {};
        } catch {
          setFetchError("Invalid response from server");
          return;
        }

        if (cancelled) return;

        if (!response.ok) {
          setFetchError(
            (result.message as string) || "Failed to load vendor data",
          );
          return;
        }

        const data = result.data;
        if (result.success && data && Object.keys(data).length > 0) {
          setFormVendorData((prev) => mapApiDataToFormState(data, prev));
        }
        // If no data or empty object, form stays as default (empty) — no need to set state
      } catch (err) {
        if (!cancelled) setFetchError("Network or server error");
      }
    };

    fetchVendorData();
    return () => {
      cancelled = true;
    };
  }, [BASE_URL]);

  const handleContinue = async () => {
    if (currentStep >= 4) return

    const stepSchemas = [
      vendorStep1CompanyProfileSchema,
      vendorStep2ContactSchema,
      vendorStep3CompanyScaleSchema,
      vendorStep4GeographySchema,
    ]
    const schema = stepSchemas[currentStep]
    const stepData = [
      {
        vendorType: formVendorData.vendorType,
        vendorName: formVendorData.vendorName,
        sector: formVendorData.sector,
        vendorMaturity: formVendorData.vendorMaturity,
        companyWebsite: formVendorData.companyWebsite,
        companyDescription: formVendorData.companyDescription,
      },
      {
        primaryContactName: formVendorData.primaryContactName,
        primaryContactEmail: formVendorData.primaryContactEmail,
        primaryContactRole: formVendorData.primaryContactRole,
      },
      {
        employeeCount: formVendorData.employeeCount,
        yearFounded: formVendorData.yearFounded,
      },
      {
        headquartersLocation: formVendorData.headquartersLocation,
        operatingRegions: formVendorData.operatingRegions ?? [],
      },
    ][currentStep]

    const result = schema.safeParse(stepData)
    if (!result.success) {
      setShowInlineErrors(true);
      setValidationError(result.error);
      return;
    }
    setValidationError(null);
    setShowInlineErrors(false);
    const orgId =
      sessionStorage.getItem("organizationId") ?? sessionStorage.getItem("org_Id")
    try {
      const res = await fetch(`${BASE_URL}/vendorOnboarding/save-progress`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${onboardingToken}`,
        },
        body: JSON.stringify({
          ...formVendorData,
          organization_Id: orgId ?? formVendorData.organization_Id,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        console.error("Save progress failed:", data?.error ?? res.statusText)
      }
    } catch (err) {
      console.error("Save progress error:", err)
    }
    setCurrentStep((prev) => prev + 1)
  }

  const handleBack = () => {
    setValidationError(null);
    setShowInlineErrors(false);
    setCurrentStep((prev) => prev - 1);
  };

  useEffect(() => {
    setShowInlineErrors(false);
    setValidationError(null);
  }, [currentStep]);

  // After Continue failed, re-validate on change so errors clear/update as the user edits (no errors before first Continue).
  const vendorStepSchemas = [
    vendorStep1CompanyProfileSchema,
    vendorStep2ContactSchema,
    vendorStep3CompanyScaleSchema,
    vendorStep4GeographySchema,
  ]
  useEffect(() => {
    if (currentStep > 3) return
    const schema = vendorStepSchemas[currentStep]
    const stepData = [
      {
        vendorType: formVendorData.vendorType,
        vendorName: formVendorData.vendorName,
        sector: formVendorData.sector,
        vendorMaturity: formVendorData.vendorMaturity,
        companyWebsite: formVendorData.companyWebsite,
        companyDescription: formVendorData.companyDescription,
      },
      {
        primaryContactName: formVendorData.primaryContactName,
        primaryContactEmail: formVendorData.primaryContactEmail,
        primaryContactRole: formVendorData.primaryContactRole,
      },
      {
        employeeCount: formVendorData.employeeCount,
        yearFounded: formVendorData.yearFounded,
      },
      {
        headquartersLocation: formVendorData.headquartersLocation,
        operatingRegions: formVendorData.operatingRegions ?? [],
      },
    ][currentStep]
    const result = schema.safeParse(stepData)
    if (!showInlineErrors) return
    if (result.success) setValidationError(null)
    else setValidationError(result.error)
  }, [formVendorData, currentStep, showInlineErrors])

  // Step-specific field errors for inline display (only when validation failed on that step)
  const stepFieldErrors = useMemo(() => {
    if (!showInlineErrors || !validationError || currentStep > 3) return {}
    return getFieldErrorsFromZod(validationError, currentStep)
  }, [validationError, currentStep, showInlineErrors])

  // Can advance to next step via tab icon (same condition as Continue: current step valid). Used only for steps 0-3; step 4 has no next.
  const canGoNext = useMemo(() => {
    if (currentStep > 3) return true
    const schema = vendorStepSchemas[currentStep]
    const stepData = [
      {
        vendorType: formVendorData.vendorType,
        vendorName: formVendorData.vendorName,
        sector: formVendorData.sector,
        vendorMaturity: formVendorData.vendorMaturity,
        companyWebsite: formVendorData.companyWebsite,
        companyDescription: formVendorData.companyDescription,
      },
      {
        primaryContactName: formVendorData.primaryContactName,
        primaryContactEmail: formVendorData.primaryContactEmail,
        primaryContactRole: formVendorData.primaryContactRole,
      },
      {
        employeeCount: formVendorData.employeeCount,
        yearFounded: formVendorData.yearFounded,
      },
      {
        headquartersLocation: formVendorData.headquartersLocation,
        operatingRegions: formVendorData.operatingRegions ?? [],
      },
    ][currentStep]
    return schema.safeParse(stepData).success
  }, [currentStep, formVendorData])

  // Steps with content for MultiStepTabs; clicking a tab navigates to that step
  const tabStepsWithContent = useMemo(
    () => [
      {
        ...VENDOR_ONBOARDING_TAB_STEPS[0],
        content: (
          <StepCompanyProfile
            formVendorData={formVendorData}
            setFormVendorData={setFormVendorData}
            fieldErrors={currentStep === 0 ? stepFieldErrors : undefined}
          />
        ),
      },
      {
        ...VENDOR_ONBOARDING_TAB_STEPS[1],
        content: (
          <StepContactInformation
            formVendorData={formVendorData}
            setFormVendorData={setFormVendorData}
            fieldErrors={currentStep === 1 ? stepFieldErrors : undefined}
          />
        ),
      },
      {
        ...VENDOR_ONBOARDING_TAB_STEPS[2],
        content: (
          <StepCompanyScale
            formVendorData={formVendorData}
            setFormVendorData={setFormVendorData}
            fieldErrors={currentStep === 2 ? stepFieldErrors : undefined}
          />
        ),
      },
      {
        ...VENDOR_ONBOARDING_TAB_STEPS[3],
        content: (
          <StepGeopgraphy
            formVendorData={formVendorData}
            setFormVendorData={setFormVendorData}
            fieldErrors={currentStep === 3 ? stepFieldErrors : undefined}
          />
        ),
      },
      {
        ...VENDOR_ONBOARDING_TAB_STEPS[4],
        content: allStepsFilled ? (
          <CardConfirmation
            pageNavigateLink="Proceed to Vendor Self Attestation"
            navigateTo={attestationPath || "/vendorSelfAttestation"}
            replace
            onProceed={handleProceedToAttestation}
          />
        ) : (
          <StepVendorOnboardingPreview formVendorData={formVendorData} />
        ),
      },
    ],
    [
      formVendorData,
      setFormVendorData,
      allStepsFilled,
      attestationPath,
      onboardingToken,
      currentStep,
      stepFieldErrors,
    ]
  );

  // Completed steps for progress: steps before current (user has visited them)
  const completedStepsForProgress = Array.from(
    { length: currentStep },
    (_, i) => i
  );

  // Disable tabs until previous steps are valid (required fields completed)
  const disabledSteps = useMemo(() => {
    const disabled: number[] = [];
    const step1Result = vendorStep1CompanyProfileSchema.safeParse({
      vendorType: formVendorData.vendorType,
      vendorName: formVendorData.vendorName,
      sector: formVendorData.sector,
      vendorMaturity: formVendorData.vendorMaturity,
      companyWebsite: formVendorData.companyWebsite,
      companyDescription: formVendorData.companyDescription,
    });
    if (!step1Result.success) {
      disabled.push(1, 2, 3, 4);
      return disabled;
    }
    const step2Result = vendorStep2ContactSchema.safeParse({
      primaryContactName: formVendorData.primaryContactName,
      primaryContactEmail: formVendorData.primaryContactEmail,
      primaryContactRole: formVendorData.primaryContactRole,
    });
    if (!step2Result.success) {
      disabled.push(2, 3, 4);
      return disabled;
    }
    const step3Result = vendorStep3CompanyScaleSchema.safeParse({
      employeeCount: formVendorData.employeeCount,
      yearFounded: formVendorData.yearFounded,
    });
    if (!step3Result.success) {
      disabled.push(3, 4);
      return disabled;
    }
    const step4Result = vendorStep4GeographySchema.safeParse({
      headquartersLocation: formVendorData.headquartersLocation,
      operatingRegions: formVendorData.operatingRegions ?? [],
    });
    if (!step4Result.success) {
      disabled.push(4);
    }
    return disabled;
  }, [formVendorData]);

  const handleBackToSelection = () =>
    navigate(`/onboarding/${onboardingToken}`);

  const handleSubmitPreview = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!onboardingToken) return;
    const orgId =
      sessionStorage.getItem("organizationId") ??
      sessionStorage.getItem("org_Id");
    try {
      const payload = {
        ...formVendorData,
        vendorId: sessionStorage.getItem("userId") ?? formVendorData.vendorId,
        organization_Id: orgId ?? formVendorData.organization_Id ?? undefined,
      };
      const response = await fetch(`${BASE_URL}/vendorOnboarding`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${onboardingToken}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (response.ok) {
        const bearerToken = result.token;
        const userDetails = result.userDetails?.[0];
        if (bearerToken && userDetails) {
          sessionStorage.setItem("bearerToken", bearerToken);
          sessionStorage.setItem("userEmail", String(userDetails.email ?? ""));
          sessionStorage.setItem(
            "userRole",
            userDetails.role != null ? String(userDetails.role).trim() : "",
          );
          sessionStorage.setItem("userId", String(userDetails.id ?? ""));
          sessionStorage.setItem(
            "organizationName",
            String(userDetails.organization_name ?? "").trim(),
          );
          sessionStorage.setItem(
            "organizationId",
            String(userDetails.organization_id ?? userDetails.organizationId ?? "").trim(),
          );
          sessionStorage.setItem(
            "userName",
            String(userDetails.user_name ?? "").trim(),
          );
          sessionStorage.setItem(
            "userFirstName",
            String(userDetails.user_first_name ?? "").trim(),
          );
          sessionStorage.setItem(
            "userLastName",
            String(userDetails.user_last_name ?? "").trim(),
          );
          const platformRole = userDetails.user_platform_role;
          sessionStorage.setItem(
            "systemRole",
            platformRole != null && platformRole !== ""
              ? String(platformRole).trim()
              : "vendor",
          );
          sessionStorage.setItem(
            "user_signup_completed",
            String(userDetails.user_signup_completed ?? "false"),
          );
          sessionStorage.setItem(
            "user_onboarding_completed",
            String(userDetails.user_onboarding_completed ?? "true"),
          );
        }
        setAttestationPath("/vendorSelfAttestation");
        setAllStepsFilled(true);
      }
    } catch (error) {
      console.log(error);
    }
  };

  if (!onboardingGateReady) {
    return (
      <div className="form_card_centered">
        <p style={{ textAlign: "center", color: "#64748b" }}>Loading…</p>
      </div>
    );
  }

  return (
    <div className="form_card_centered">
      <CardContainerOnBoarding>
        {fetchError && (
          <p className="orgError" style={{ marginBottom: "0.5rem" }}>
            {fetchError}
          </p>
        )}
        <form onSubmit={handleSubmitPreview} className="stepsForm">
         <MultiStepTabs
            steps={tabStepsWithContent}
            currentStep={currentStep}
            onStepChange={(step) => {
              setValidationError(null)
              setCurrentStep(step)
            }}
            completedSteps={completedStepsForProgress}
            disabledSteps={disabledSteps}
            canGoNext={canGoNext}
            className="vendor_onboarding_tabs"
          />

        <CardOnBoarding className="card_vendor">
         
          {/* {validationError && currentStep < 4 && (
            <div className="vendor_step_validation_errors" role="alert">
              <p className="vendor_step_validation_errors_title">
                Please fix the following before continuing:
              </p>
              <ul className="vendor_step_validation_errors_list">
                {getValidationMessages(validationError).map((msg, i) => (
                  <li key={i}>{msg}</li>
                ))}
              </ul>
            </div>
          )} */}

          {/* Navigation buttons */}
        <div className="vendor_action_btns">
          {/* Show back button only if confirmation is NOT shown */}
          {!allStepsFilled && (
            <div className="action_back">
              <Button
                type="button"
                onClick={currentStep === 0 ? handleBackToSelection : handleBack}
                className="back_btn"
              >
                <span>
                  <ChevronLeftCircle size={16} />
                  Back
                </span>
              </Button>
            </div>
          )}

          {/* Continue button for steps 0-3 */}
          {currentStep < 4 && (
            <div className="action_continue_btn">
              <Button
                onClick={handleContinue}
                type="button"
                className="continue_btn"
              >
                <span>
                  Continue <ChevronRightCircle size={16} />
                </span>
              </Button>
            </div>
          )}

          {/* Submit button for preview step */}
          {currentStep === 4 && !allStepsFilled && (
            <div className="action_submit_btn">
              <Button type="submit" className="submit_btn_vendor">
                <span>
                  Submit <Send size={16} />
                </span>
              </Button>
            </div>
          )}
        </div>
        </CardOnBoarding>
        </form>
      </CardContainerOnBoarding>
    </div>
  );
}
