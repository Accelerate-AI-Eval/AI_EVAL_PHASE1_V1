import { useEffect, useState, useMemo } from "react"
import type { z } from "zod"
import Button from "../../UI/Button"
import BuyerContactInformation from "./BuyerContactInformation"
import BuyerOrganizationScale from "./BuyerOrganizationScale"
import BuyerGeopgraphy from "./BuyerGeopgraphy"
import { ChevronLeftCircle, ChevronRightCircle, Send } from "lucide-react"
import StepBuyerOnboardingPreview from "./StepBuyerOnboardingPreview"
import BuyerOrganizationProfile from "./BuyerOrganizationProfile"
import CurrentAiMaturity from "./CurrentAiMaturity"
import RegulatoryContext from "./RegulatoryContext"
import TechnicalEnvironment from "./TechnicalEnvironment"
import RiskAppetite from "./RiskAppetite"
import { useNavigate, useParams } from "react-router-dom"
import { jwtDecode } from "jwt-decode"
import CardOnBoarding from "../../UI/CardOnBoarding"
import CardContainerOnBoarding from "../../UI/CardContainerOnBoarding"
import { buyerFormInitialState } from "../../../constants/buyerFormInitialState"
import type { BuyerDataInterface } from "../../../types/formDataBuyer"
import CardConfirmation from "../../UI/CardConfirmation"
import MultiStepTabs from "../../UI/MultiStepTabs"
import { BUYER_ONBOARDING_TAB_STEPS } from "./BuyerOnboardingTabs"
import {
  buyerStep0OrganizationProfileSchema,
  buyerStep1ContactSchema,
  buyerStep2OrganizationScaleSchema,
  buyerStep3GeographySchema,
  buyerStep4CurrentAiMaturitySchema,
  buyerStep5RegulatoryContextSchema,
  buyerStep6TechnicalEnvironmentSchema,
  buyerStep7RiskAppetiteSchema,
} from "../../../schemas/onboarding/buyer.schema"
import "../../../styles/card.css"
import "../VendorOnboarding/vendor_onboarding.css"
import { getApiBaseUrl } from "../../../utils/apiBaseUrl"
import { fetchOnboardingAccessStatus } from "../../../utils/onboardingAccessStatus"
import { toast } from "react-toastify"

interface OnboardingJwtPayload {
  email?: string
  userId?: string | number
  organizationId?: string | number
  exp?: number
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

const stepSchemas = [
  buyerStep0OrganizationProfileSchema,
  buyerStep1ContactSchema,
  buyerStep2OrganizationScaleSchema,
  buyerStep3GeographySchema,
  buyerStep4CurrentAiMaturitySchema,
  buyerStep5RegulatoryContextSchema,
  buyerStep6TechnicalEnvironmentSchema,
  buyerStep7RiskAppetiteSchema,
]

function getStepData(step: number, form: BuyerDataInterface): Record<string, unknown> {
  const steps = [
    {
      organizationName: form.organizationName,
      organizationType: form.organizationType,
      sector: form.sector,
      organizationWebsite: form.organizationWebsite,
      organizationDescription: form.organizationDescription,
    },
    {
      primaryContactName: form.primaryContactName,
      primaryContactEmail: form.primaryContactEmail,
      primaryContactRole: form.primaryContactRole,
      departmentOwner: form.departmentOwner,
    },
    {
      employeeCount: form.employeeCount,
      annualRevenue: form.annualRevenue,
      yearFounded: form.yearFounded,
    },
    {
      headquartersLocation: form.headquartersLocation,
      operatingRegions: form.operatingRegions ?? [],
      dataResidencyRequirements: form.dataResidencyRequirements ?? [],
    },
    {
      existingAIInitiatives: form.existingAIInitiatives,
      aiGovernanceMaturity: form.aiGovernanceMaturity,
      dataGovernanceMaturity: form.dataGovernanceMaturity,
      aiSkillsAvailability: form.aiSkillsAvailability,
      changeManagementCapability: form.changeManagementCapability,
    },
    {
      primaryRegulatoryFrameworks: form.primaryRegulatoryFrameworks ?? [],
      regulatoryPenaltyExposure: form.regulatoryPenaltyExposure,
      dataClassificationHandled: form.dataClassificationHandled ?? [],
      piiHandling: form.piiHandling,
    },
    { existingTechStack: form.existingTechStack ?? [] },
    {
      aiRiskAppetite: form.aiRiskAppetite,
      acceptableRiskLevel: form.acceptableRiskLevel,
    },
  ]
  return steps[step] ?? {}
}

const BuyerMainForm = ({ type }: { type: string }) => {
  const { token: tokenFromRoute } = useParams<{ token: string }>()

  useEffect(() => {
    document.title = "AI-Q | Buyer Onboarding"
  }, [])

  /** JWT is in the URL (`/onBoarding/buyerOnboarding/:token`); keep sessionStorage in sync for refresh/back. */
  useEffect(() => {
    const raw = tokenFromRoute?.trim()
    if (!raw) return
    sessionStorage.setItem("onboardingToken", raw)
    try {
      const decoded = jwtDecode<OnboardingJwtPayload>(raw)
      if (decoded.email) sessionStorage.setItem("email", String(decoded.email))
      if (decoded.userId != null) sessionStorage.setItem("userId", String(decoded.userId))
      if (decoded.organizationId != null) {
        sessionStorage.setItem("organizationId", String(decoded.organizationId))
      }
    } catch {
      // API still validates Bearer token
    }
  }, [tokenFromRoute])

  const BASE_URL = getApiBaseUrl()
  const navigate = useNavigate()

  const [currentStep, setCurrentStep] = useState(0)
  const [allStepsFilled, setAllStepsFilled] = useState(false)
  const [formBuyerData, setFormBuyerData] = useState<BuyerDataInterface>(buyerFormInitialState as BuyerDataInterface)
  const [validationError, setValidationError] = useState<z.ZodError | null>(null)
  /** Inline field errors only after user clicks Continue and validation fails on that step */
  const [showInlineErrors, setShowInlineErrors] = useState(false)
  /** False until access-status allows this page (or fails open on network error) */
  const [onboardingGateReady, setOnboardingGateReady] = useState(false)

  const token =
    (tokenFromRoute && tokenFromRoute.trim() !== "")
      ? tokenFromRoute.trim()
      : sessionStorage.getItem("onboardingToken")

  useEffect(() => {
    const t = token?.trim()
    if (!t) {
      setOnboardingGateReady(true)
      return
    }
    let cancelled = false
    ;(async () => {
      const result = await fetchOnboardingAccessStatus(t)
      if (cancelled) return
      if (result.ok && result.onboardingCompleted) {
        sessionStorage.removeItem("onboardingToken")
        toast.info("You have already completed onboarding. Please sign in.")
        navigate("/login", { replace: true })
        return
      }
      if (!result.ok && (result.reason === "unauthorized" || result.reason === "not_found")) {
        sessionStorage.removeItem("onboardingToken")
        navigate("/login", { replace: true })
        return
      }
      setOnboardingGateReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [token, navigate])

  const handleContinue = async () => {
    if (currentStep >= 8) return
    const schema = stepSchemas[currentStep]
    const stepData = getStepData(currentStep, formBuyerData)
    const result = schema.safeParse(stepData)
    if (!result.success) {
      setShowInlineErrors(true)
      setValidationError(result.error)
      return
    }
    setValidationError(null)
    setShowInlineErrors(false)
    const orgId = sessionStorage.getItem("organizationId")
    if (token) {
      try {
        const res = await fetch(`${BASE_URL}/buyerOnboarding/save-progress`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            ...formBuyerData,
            organization_Id: orgId ?? undefined,
          }),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          console.error("Save progress failed:", data?.error ?? res.statusText)
        }
      } catch (err) {
        console.error("Save progress error:", err)
      }
    }
    setCurrentStep((prev) => prev + 1)
  }

  const handleBack = () => {
    setValidationError(null)
    setShowInlineErrors(false)
    setCurrentStep((prev) => prev - 1)
  }

  useEffect(() => {
    setShowInlineErrors(false)
    setValidationError(null)
  }, [currentStep])

  // After Continue failed, re-validate on change so errors clear/update as the user edits (no errors before first Continue).
  useEffect(() => {
    if (currentStep > 7) return
    if (!showInlineErrors) return
    const schema = stepSchemas[currentStep]
    const stepData = getStepData(currentStep, formBuyerData)
    const result = schema.safeParse(stepData)
    if (result.success) setValidationError(null)
    else setValidationError(result.error)
  }, [formBuyerData, currentStep, showInlineErrors])

  const stepFieldErrors = useMemo(() => {
    if (!showInlineErrors || !validationError || currentStep > 7) return {}
    return getFieldErrorsFromZod(validationError, currentStep)
  }, [validationError, currentStep, showInlineErrors])

  const tabStepsWithContent = useMemo(() => {
    const stepIconNodes = BUYER_ONBOARDING_TAB_STEPS.map((s) =>
      s.icon ? <s.icon key={s.id} size={18} /> : null
    );
    return [
      {
        ...BUYER_ONBOARDING_TAB_STEPS[0],
        content: (
          <BuyerOrganizationProfile
            formBuyerData={formBuyerData}
            setFormBuyerData={setFormBuyerData}
            fieldErrors={currentStep === 0 ? stepFieldErrors : undefined}
            title={BUYER_ONBOARDING_TAB_STEPS[0].label}
            subTitle={BUYER_ONBOARDING_TAB_STEPS[0].subTitle}
            icon={stepIconNodes[0]}
          />
        ),
      },
      {
        ...BUYER_ONBOARDING_TAB_STEPS[1],
        content: (
          <BuyerContactInformation
            formBuyerData={formBuyerData}
            setFormBuyerData={setFormBuyerData}
            fieldErrors={currentStep === 1 ? stepFieldErrors : undefined}
            title={BUYER_ONBOARDING_TAB_STEPS[1].label}
            subTitle={BUYER_ONBOARDING_TAB_STEPS[1].subTitle}
            icon={stepIconNodes[1]}
          />
        ),
      },
      {
        ...BUYER_ONBOARDING_TAB_STEPS[2],
        content: (
          <BuyerOrganizationScale
            formBuyerData={formBuyerData}
            setFormBuyerData={setFormBuyerData}
            fieldErrors={currentStep === 2 ? stepFieldErrors : undefined}
            title={BUYER_ONBOARDING_TAB_STEPS[2].label}
            subTitle={BUYER_ONBOARDING_TAB_STEPS[2].subTitle}
            icon={stepIconNodes[2]}
          />
        ),
      },
      {
        ...BUYER_ONBOARDING_TAB_STEPS[3],
        content: (
          <BuyerGeopgraphy
            formBuyerData={formBuyerData}
            setFormBuyerData={setFormBuyerData}
            fieldErrors={currentStep === 3 ? stepFieldErrors : undefined}
            title={BUYER_ONBOARDING_TAB_STEPS[3].label}
            subTitle={BUYER_ONBOARDING_TAB_STEPS[3].subTitle}
            icon={stepIconNodes[3]}
          />
        ),
      },
      {
        ...BUYER_ONBOARDING_TAB_STEPS[4],
        content: (
          <CurrentAiMaturity
            formBuyerData={formBuyerData}
            setFormBuyerData={setFormBuyerData}
            fieldErrors={currentStep === 4 ? stepFieldErrors : undefined}
            title={BUYER_ONBOARDING_TAB_STEPS[4].label}
            subTitle={BUYER_ONBOARDING_TAB_STEPS[4].subTitle}
            icon={stepIconNodes[4]}
          />
        ),
      },
      {
        ...BUYER_ONBOARDING_TAB_STEPS[5],
        content: (
          <RegulatoryContext
            formBuyerData={formBuyerData}
            setFormBuyerData={setFormBuyerData}
            fieldErrors={currentStep === 5 ? stepFieldErrors : undefined}
            title={BUYER_ONBOARDING_TAB_STEPS[5].label}
            subTitle={BUYER_ONBOARDING_TAB_STEPS[5].subTitle}
            icon={stepIconNodes[5]}
          />
        ),
      },
      {
        ...BUYER_ONBOARDING_TAB_STEPS[6],
        content: (
          <TechnicalEnvironment
            formBuyerData={formBuyerData}
            setFormBuyerData={setFormBuyerData}
            fieldErrors={currentStep === 6 ? stepFieldErrors : undefined}
            title={BUYER_ONBOARDING_TAB_STEPS[6].label}
            subTitle={BUYER_ONBOARDING_TAB_STEPS[6].subTitle}
            icon={stepIconNodes[6]}
          />
        ),
      },
      {
        ...BUYER_ONBOARDING_TAB_STEPS[7],
        content: (
          <RiskAppetite
            formBuyerData={formBuyerData}
            setFormBuyerData={setFormBuyerData}
            fieldErrors={currentStep === 7 ? stepFieldErrors : undefined}
            title={BUYER_ONBOARDING_TAB_STEPS[7].label}
            subTitle={BUYER_ONBOARDING_TAB_STEPS[7].subTitle}
            icon={stepIconNodes[7]}
          />
        ),
      },
      {
        ...BUYER_ONBOARDING_TAB_STEPS[8],
        content: allStepsFilled ? (
          <CardConfirmation pageNavigateLink="Go to Login" navigateTo="/login" />
        ) : (
          <StepBuyerOnboardingPreview
            formBuyerData={formBuyerData}
            title={BUYER_ONBOARDING_TAB_STEPS[8].label}
            subTitle={BUYER_ONBOARDING_TAB_STEPS[8].subTitle}
            icon={stepIconNodes[8]}
          />
        ),
      },
    ];
  }, [
    formBuyerData,
    allStepsFilled,
    currentStep,
    stepFieldErrors,
  ])

  const completedStepsForProgress = Array.from({ length: currentStep }, (_, i) => i)

  const canGoNext = useMemo(() => {
    if (currentStep >= 8) return true
    const schema = stepSchemas[currentStep]
    const stepData = getStepData(currentStep, formBuyerData)
    return schema.safeParse(stepData).success
  }, [currentStep, formBuyerData])

  const disabledSteps = useMemo(() => {
    const disabled: number[] = []
    for (let i = 0; i <= 7; i++) {
      const schema = stepSchemas[i]
      const data = getStepData(i, formBuyerData)
      if (!schema.safeParse(data).success) {
        for (let j = i + 1; j <= 8; j++) disabled.push(j)
        break
      }
    }
    return disabled
  }, [formBuyerData])

  const handleBackToSelection = () => navigate(`/onboarding/${token}`)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const url = `${BASE_URL}/buyerOnboarding`
    const payload = {
      ...formBuyerData,
      buyer_Id: sessionStorage.getItem("userId"),
      organization_Id: sessionStorage.getItem("organizationId") ?? undefined,
    }
    console.log("[Buyer onboarding] Submit clicked", {
      url,
      hasOnboardingToken: Boolean(token),
      tokenSource: tokenFromRoute?.trim() ? "route" : "sessionStorage",
      userId: sessionStorage.getItem("userId"),
      organizationId: sessionStorage.getItem("organizationId"),
    })
    if (!token) {
      console.warn("[Buyer onboarding] Aborted: no token in URL or sessionStorage")
      return
    }
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      })
      const bodyText = await response.text()
      let bodyJson: unknown = null
      try {
        bodyJson = bodyText ? JSON.parse(bodyText) : null
      } catch {
        bodyJson = bodyText
      }
      console.log("[Buyer onboarding] Response", {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        body: bodyJson,
      })
      if (response.ok) setAllStepsFilled(true)
      else console.warn("[Buyer onboarding] Submit failed — see status/body above")
    } catch (err) {
      console.error("[Buyer onboarding] Submit fetch error", err)
    }
  }

  if (!onboardingGateReady) {
    return (
      <div className="form_card_centered">
        <p style={{ textAlign: "center", color: "#64748b" }}>Loading…</p>
      </div>
    )
  }

  return (
    <div className="form_card_centered">
      <CardContainerOnBoarding>
        <form onSubmit={handleSubmit} className="stepOne">
          <CardOnBoarding className="card_vendor">
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

          <div className="vendor_action_btns">
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

            {currentStep < 8 && (
              <div className="action_continue_btn">
                <Button onClick={handleContinue} type="button" className="continue_btn">
                  <span>
                    Continue <ChevronRightCircle size={16} />
                  </span>
                </Button>
              </div>
            )}

            {currentStep === 8 && !allStepsFilled && (
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
  )
}

export default BuyerMainForm
