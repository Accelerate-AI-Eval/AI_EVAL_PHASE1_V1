import { useState, useEffect } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { CircleChevronLeft, CheckCircle2, AlertTriangle, XCircle, Download, FileText, Building2, TrendingUp, Shield, BarChart3, Eye, List, Layers, AlertCircle, Info } from "lucide-react"
import { formatDateDDMMMYYYY } from "../../../utils/formatDate.js"
import {
  customerRiskReportApprovalHeading,
  alignmentScoreFromRiskScore,
  gradeFromOverallRiskScore,
} from "../../../utils/completeReportGrade"
import {
  riskScopeFromRow,
  groupRisksByDomain,
  type ReportRiskScope,
} from "../../../utils/reportRiskScope"
import {
  frameworkControlsDisplayLinesTopRanked,
  FRAMEWORK_MAPPING_TOP_CONTROLS_MAX,
} from "../../../utils/frameworkMappingControlsDisplay"
import { sanitizeFrameworkMappingNotesForDisplay } from "../../../utils/frameworkMappingNotesDisplay"
import { formatFrameworkMappingFrameworkForDisplay } from "../../../utils/frameworkMappingFrameworkDisplay"
import { riskRowsToSummaryPoints, stringsToSummaryPoints } from "../../../utils/summarizeRiskPoints"
import LoadingMessage from "../../UI/LoadingMessage"
import "../UserManagement/user_management.css"
import "./reports.css"

const BASE_URL = import.meta.env.VITE_BASE_URL

type DbRisk = {
  risk_mapping_id: number
  risk_id: string | null
  risk_title: string | null
  domains: string | null
  intent: string | null
  timing: string | null
  risk_type_detected?: string | null
  primary_risk: string | null
  description: string | null
  executive_summary: string | null
  /** Present when the report agent merged LLM bullets for this row (preferred over client-side split). */
  summary_points?: string[]
}

type Mitigation = {
  mapping_id: number
  risk_id: string
  mitigation_action_name: string
  mitigation_category: string
  mitigation_definition: string | null
  /** LLM bullets merged at report generation (preferred over raw definition in UI). */
  mitigation_summary_points?: string[]
}

type DeploymentOverview = {
  useCase?: string
  productTier?: string
  targetUsers?: string
  infrastructure?: string
  deploymentTimeline?: string
  annualContractValue?: string
}

type RecommendationWithPriority = {
  priority: "High" | "Medium" | "Low"
  title: string
  description: string
  timeline: string
}

type RoiAnalysis = {
  timeSavedPerEmployee?: string
  timeSavedSource?: string
  annualHoursRecovered?: string
  annualHoursRecoveredCalculation?: string
  productivityValue?: string
  productivityValueCalculation?: string
  annualCost?: string
  annualCostCalculation?: string
  roiMultiple?: string
  roiMultipleCalculation?: string
  paybackPeriod?: string
  paybackSource?: string
  comparisonAlternatives?: { alternative: string; annualCost: string; roi: string; notes: string }[]
}

type RiskCategoryBlock = {
  name?: string
  level?: string
  initialRisk?: string
  score?: string
  risks?: string[]
  mitigations?: string[]
  residualRisk?: string
}

type ComplianceRequirement = { name: string; description: string; status: string }
type FrameworkRow = { framework: string; coverage: string; controls: string; notes: string }
type ImplementationPhase = {
  title: string
  timeline: string
  status: string
  activities: string[]
  deliverables: string[]
}

type FullReport = {
  roiAnalysis?: RoiAnalysis
  securityPosture?: RiskCategoryBlock
  complianceAlignment?: { summary?: string; requirements?: ComplianceRequirement[] }
  frameworkMapping?: { rows?: FrameworkRow[] }
  implementationPlan?: { phases?: ImplementationPhase[] }
  competitivePositioning?: string
  appendix?: {
    methodology?: string
    preparedBy?: string
    reviewedBy?: string
    confidentiality?: string
    dataSources?: string[]
    /** Risk catalog IDs and mitigation action names fetched for this assessment (set on submit). */
    catalogRisksAndMitigations?: Array<{
      risk_id: string
      risk_domain?: string
      risk_title?: string
      mitigation_action_names: string[]
    }>
    /** Flat appendix rows for risk table (risk id, title, mitigation id + name). */
    catalogRiskMitigationActions?: Array<{
      risk_id: string
      risk_domain?: string
      risk_title?: string
      mitigation_action_id?: string
      mitigation_action_name: string
    }>
  }
}

type AppendixRiskTableRow = {
  riskId: string
  riskDomain: string
  mitigationRef: string
}

function buildAppendixRiskTableRows(
  appendix: FullReport["appendix"],
  domainByRiskId: Record<string, string> = {},
): AppendixRiskTableRow[] {
  if (!appendix) return []
  const flat = appendix.catalogRiskMitigationActions
  if (flat && flat.length > 0) {
    return flat.map((r) => {
      const id = stripMarkdownBold(String(r.mitigation_action_id ?? "").trim())
      const name = stripMarkdownBold(String(r.mitigation_action_name ?? "").trim())
      const mitigationRef = id || name || "—"
      return {
        riskId: stripMarkdownBold(String(r.risk_id ?? "")) || "—",
        riskDomain:
          stripMarkdownBold(
            String(domainByRiskId[String(r.risk_id ?? "").trim()] ?? "").trim(),
          ) ||
          stripMarkdownBold(String(r.risk_domain ?? "").trim()) ||
          stripMarkdownBold(String(r.risk_title ?? "").trim()) ||
          "—",
        mitigationRef,
      }
    })
  }
  const grouped = appendix.catalogRisksAndMitigations
  if (!grouped || grouped.length === 0) return []
  const rows: AppendixRiskTableRow[] = []
  for (const r of grouped) {
    const riskId = stripMarkdownBold(String(r.risk_id ?? "")) || "—"
    const riskDomain =
      stripMarkdownBold(String(domainByRiskId[String(r.risk_id ?? "").trim()] ?? "").trim()) ||
      stripMarkdownBold(String(r.risk_domain ?? "").trim()) ||
      stripMarkdownBold(String(r.risk_title ?? "").trim()) ||
      "—"
    const names = r.mitigation_action_names ?? []
    if (names.length === 0) {
      rows.push({ riskId, riskDomain, mitigationRef: "—" })
    } else {
      for (const n of names) {
        const name = stripMarkdownBold(String(n).trim())
        rows.push({
          riskId,
          riskDomain,
          mitigationRef: name || "—",
        })
      }
    }
  }
  return rows
}

function formatReportValue(val: unknown): string {
  if (val == null || val === "") return "—"
  if (Array.isArray(val)) return val.map((v) => stripMarkdownBold(String(v))).join(", ")
  if (typeof val === "object") return JSON.stringify(val)
  return stripMarkdownBold(String(val))
}

/** Remove markdown bold markers (**) from report text so they are not shown in the UI. */
function stripMarkdownBold(s: string): string {
  return String(s).replace(/\*\*/g, "")
}

function frameworkDisplayKey(framework: string): string {
  return String(framework ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

const SKIPPABLE_FRAMEWORK_KEY = new Set([
  "",
  "—",
  "-",
  "n/a",
  "not specified",
  "none",
  "tbd",
  "unknown",
])

function coerceFrameworkRow(raw: unknown): FrameworkRow | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  const fw =
    o.framework ??
    o.Framework ??
    o.framework_name ??
    o.frameworkName
  const framework = fw != null ? String(fw).trim() : ""
  if (!framework) return null
  const cov = o.coverage ?? o.Coverage
  const ctrl = o.controls ?? o.Controls
  const n = o.notes ?? o.Notes
  return {
    framework,
    coverage: cov != null ? String(cov) : "—",
    controls: ctrl != null ? String(ctrl) : "—",
    notes: n != null ? String(n) : "—",
  }
}

function shouldShowFrameworkRow(r: FrameworkRow): boolean {
  const k = frameworkDisplayKey(r.framework)
  return k.length >= 2 && !SKIPPABLE_FRAMEWORK_KEY.has(k)
}

/**
 * Collect framework mapping rows from all common report JSON shapes (camelCase / snake_case, nested or root).
 * Order: generatedAnalysis.fullReport first, then root frameworkMappingRows — dedupe by framework name.
 */
function collectFrameworkRowsFromReportPayload(data: Record<string, unknown>): FrameworkRow[] {
  const ordered: FrameworkRow[] = []
  const pushFromArray = (arr: unknown) => {
    if (!Array.isArray(arr)) return
    for (const x of arr) {
      const c = coerceFrameworkRow(x)
      if (c && shouldShowFrameworkRow(c)) ordered.push(c)
    }
  }
  const genRaw = data.generatedAnalysis ?? data.generated_analysis
  if (genRaw && typeof genRaw === "object" && !Array.isArray(genRaw)) {
    const gen = genRaw as Record<string, unknown>
    const fr = gen.fullReport ?? gen.full_report
    if (fr && typeof fr === "object" && !Array.isArray(fr)) {
      const frObj = fr as Record<string, unknown>
      const fm = frObj.frameworkMapping ?? frObj.framework_mapping
      if (fm && typeof fm === "object" && !Array.isArray(fm)) {
        pushFromArray((fm as Record<string, unknown>).rows)
      }
    }
  }
  pushFromArray(data.frameworkMappingRows ?? data.framework_mapping_rows)

  const seen = new Set<string>()
  const out: FrameworkRow[] = []
  for (const r of ordered) {
    const k = frameworkDisplayKey(r.framework)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(r)
  }
  return out
}

function frameworkAttestationBanner(
  status: unknown,
): { text: string; variant: "warn" | "info" } | null {
  const s = String(status ?? "").trim().toLowerCase()
  if (s === "missing") {
    return {
      text: "No product attestation is linked or the record was not found. Rows below (if any) are from this assessment only—not from uploaded compliance documents.",
      variant: "warn",
    }
  }
  if (s === "incomplete") {
    return {
      text: "The linked product attestation has no framework mappings yet. Add or process compliance documents on the product profile to show evidence-based rows here.",
      variant: "warn",
    }
  }
  if (s === "available") return null
  return {
    text: "This report may predate attestation status labels. Confirm framework coverage against the current product attestation if needed.",
    variant: "info",
  }
}

function riskLevelClass(level: string): string {
  const l = String(level).toLowerCase()
  if (l.includes("low") || l.includes("very")) return "risk_low"
  if (l.includes("high") || l.includes("medium")) return "risk_medium"
  return "risk_low"
}

function isSystemUserRole(): boolean {
  const role = (sessionStorage.getItem("systemRole") ?? "").toLowerCase().trim().replace(/_/g, " ")
  return role === "system admin" || role === "system manager" || role === "system viewer"
}

function isVendorViewer(): boolean {
  const role = (sessionStorage.getItem("systemRole") ?? "").toLowerCase().trim().replace(/_/g, " ")
  return role === "vendor"
}

function tabReportTitle(raw: string): string {
  const t = String(raw ?? "").trim()
  if (!t) return ""
  return t.replace(/^Analysis Report:\s*/i, "").trim() || t
}

export default function ReportDetail() {
  const { reportId } = useParams<{ reportId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const reportNavState = location.state as {
    reportTitle?: string
    hideFrameworkMapping?: boolean
  } | null
  const reportTitleFromNavState = (reportNavState?.reportTitle ?? "").trim()
  const hideFrameworkMapping = reportNavState?.hideFrameworkMapping === true
  const cachedTitleKey = reportId ? `completeReportTitle:${reportId}` : ""
  const cachedReportTitle = cachedTitleKey ? (sessionStorage.getItem(cachedTitleKey) ?? "").trim() : ""
  const showExportPdf = !isSystemUserRole()
  const [report, setReport] = useState<{
    id: string
    assessmentId?: string
    title: string
    report: Record<string, unknown>
    createdAt: string
    expiryAt?: string | null
    attestationExpiryAt?: string | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  const LOADER_MIN_MS = 2500 // same as Assessments page

  useEffect(() => {
    if (!reportId?.trim()) {
      setNotFound(true)
      setLoading(false)
      return
    }
    const token = sessionStorage.getItem("bearerToken")
    if (!token) {
      setLoading(false)
      setNotFound(true)
      return
    }
    setLoading(true)
    setNotFound(false)
    const loadStart = Date.now()
    const finishLoading = () => {
      const elapsed = Date.now() - loadStart
      const remaining = Math.max(0, LOADER_MIN_MS - elapsed)
      setTimeout(() => setLoading(false), remaining)
    }
    fetch(`${BASE_URL}/customerRiskReports/${encodeURIComponent(reportId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true)
          return null
        }
        return res.json()
      })
      .then((data) => {
        if (data?.success && data?.data) {
          setReport({
            id: data.data.id,
            assessmentId: data.data.assessmentId,
            title: data.data.title,
            report: data.data.report ?? {},
            createdAt: data.data.createdAt ?? "",
            expiryAt: data.data.expiryAt ?? null,
            attestationExpiryAt: data.data.attestationExpiryAt ?? null,
          })
          setNotFound(false)
        } else {
          setNotFound(true)
        }
      })
      .catch(() => setNotFound(true))
      .finally(() => finishLoading())
  }, [reportId])

  useEffect(() => {
    if (loading) {
      const loadingTitle = "Complete Report"
      document.title = `AI-Q | ${loadingTitle}`
      return () => { document.title = "AI-Q" }
    }
    if (notFound || !report) {
      document.title = "AI-Q | Report not found"
      return () => { document.title = "AI-Q" }
    }
    const title = "Complete Report"
    document.title = `AI-Q | ${title}`
    if (cachedTitleKey) {
      sessionStorage.setItem(cachedTitleKey, title)
    }
    return () => { document.title = "AI-Q" }
  }, [loading, notFound, report, reportTitleFromNavState, cachedReportTitle, cachedTitleKey])

  const handleBack = (e: React.MouseEvent) => {
    e.preventDefault()
    navigate("/reports", { state: { tab: "assessment" as const } })
  }

  if (loading) {
    return (
      <div className="sec_user_page org_settings_page reports_page report_detail_page">
        <LoadingMessage message="Loading report…" />
      </div>
    )
  }

  if (notFound || !report) {
    return (
      <div className="sec_user_page org_settings_page reports_page report_detail_page">
        <div className="report_detail_empty">
          <h2 className="report_detail_empty_title">Report not found</h2>
          <p className="report_detail_empty_text">This report does not exist or has been removed.</p>
          <a
            href="/reports"
            className="report_assessment_back report_detail_empty_back"
            onClick={handleBack}
          >
            <CircleChevronLeft size={20} aria-hidden /> Back to Reports
          </a>
        </div>
      </div>
    )
  }

  const data = report.report as Record<string, unknown>
  const assessmentDate = formatDateDDMMMYYYY(report.createdAt)
  const title = report.title || "Analysis Report"
  const expiryAt = report.expiryAt
  const attestationExpiryAt = report.attestationExpiryAt
  const isAssessmentExpired =
    expiryAt != null &&
    String(expiryAt).trim() !== "" &&
    !Number.isNaN(new Date(expiryAt).getTime()) &&
    new Date(expiryAt).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0)
  const isAttestationExpired =
    attestationExpiryAt != null &&
    String(attestationExpiryAt).trim() !== "" &&
    !Number.isNaN(new Date(attestationExpiryAt).getTime()) &&
    new Date(attestationExpiryAt).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0)
  const isArchived = isAssessmentExpired || isAttestationExpired
  const orgName = formatReportValue(data.customerOrganizationName)
  const sector = formatReportValue(data.customerSector)

  const dbTop5 = data.dbTop5Risks as { top5Risks?: DbRisk[]; mitigationsByRiskId?: Record<string, Mitigation[]> } | undefined
  const top5Risks: DbRisk[] = dbTop5?.top5Risks ?? []
  const mitigationsByRiskId: Record<string, Mitigation[]> = dbTop5?.mitigationsByRiskId ?? {}
  const domainByRiskId: Record<string, string> = Object.fromEntries(
    top5Risks
      .map((r) => [String(r.risk_id ?? "").trim(), String(r.domains ?? "").trim()] as const)
      .filter(([riskId, domain]) => riskId !== "" && domain !== ""),
  )

  const generated = data.generatedAnalysis as {
    overallRiskScore?: number
    riskLevel?: string
    summary?: string
    executiveSummary?: string
    keyRisks?: string[]
    recommendations?: string[]
    recommendationsWithPriority?: RecommendationWithPriority[]
    fullReport?: FullReport
  } | undefined
  const fullReport = generated?.fullReport
  const appendixRiskTableRows = buildAppendixRiskTableRows(
    fullReport?.appendix,
    domainByRiskId,
  )

  const deployment = data.deploymentOverview as DeploymentOverview | undefined
  const overallScore = generated?.overallRiskScore ?? 0
  const overallLevel = generated?.riskLevel ?? "Low"
  const alignmentScoreDisplay = alignmentScoreFromRiskScore(overallScore)
  const contextSummaryPreview = (() => {
    const raw = generated?.executiveSummary ?? generated?.summary
    if (raw == null || String(raw).trim() === "") return ""
    return stripMarkdownBold(String(raw)).replace(/\s*---+\s*/g, " ").replace(/\s+/g, " ").trim()
  })()

  const RISK_SCOPE_SECTIONS: {
    scope: ReportRiskScope
    label: string
    tagClass: string
  }[] = [
    { scope: "vendor", label: "Vendor risk", tagClass: "report_risk_tag_vendor" },
    { scope: "buyer", label: "Buyer risk", tagClass: "report_risk_tag_buyer" },
    { scope: "shared", label: "Shared risk", tagClass: "report_risk_tag_shared" },
  ]

  const risksByScope: Record<ReportRiskScope, DbRisk[]> = {
    vendor: [],
    buyer: [],
    shared: [],
  }
  for (const r of top5Risks) {
    risksByScope[riskScopeFromRow(r)].push(r)
  }

  const renderDomainRiskBlocks = (risks: DbRisk[]) => {
    const byDomain = groupRisksByDomain(risks)
    const domains = Object.keys(byDomain)
    return domains.map((domain, di) => {
      const domainRisks = byDomain[domain] ?? []
      const initialRisk = domainRisks[0]?.primary_risk ?? "Low"
      const riskList = riskRowsToSummaryPoints(domainRisks)
      const mitigList: string[] = []
      domainRisks.forEach((r) => {
        if (r.risk_id && mitigationsByRiskId[r.risk_id]) {
          mitigationsByRiskId[r.risk_id].forEach((m) => {
            const bot = m.mitigation_summary_points
            if (Array.isArray(bot) && bot.length > 0) {
              for (const pt of bot) {
                const line = String(pt ?? "").trim()
                if (line.length > 1) mitigList.push(line)
              }
              return
            }
            mitigList.push(
              m.mitigation_action_name +
                (m.mitigation_definition
                  ? ` — ${String(m.mitigation_definition).trim()}`
                  : ""),
            )
          })
        }
      })
      return (
        <div key={`${domain}-${di}`} className="report_risk_category_block">
          <div className="report_risk_category_header">
            <h3 className="report_risk_category_title">{domain}</h3>
            <span className={`report_risk_badge ${riskLevelClass(initialRisk)}`}>
              {initialRisk || "Low"}
            </span>
            <span className="report_risk_category_score">{(domainRisks.length * 10)}/100</span>
          </div>
          <div className="report_risks_list">
            <h4>RISKS</h4>
            <ul className="report_risk_summary_list">
              {riskList.map((t, i) => (
                <li key={i}>
                  <AlertTriangle size={14} className="report_icon_warn" /> {t}
                </li>
              ))}
              {riskList.length === 0 && <li>—</li>}
            </ul>
          </div>
          <div className="report_mitigations_list">
            <h4>MITIGATIONS</h4>
            <ul>
              {mitigList.map((t, i) => (
                <li key={i}>
                  <CheckCircle2 size={14} className="report_icon_ok" /> {t}
                </li>
              ))}
              {mitigList.length === 0 && <li>—</li>}
            </ul>
          </div>
          <p className="report_residual_risk">
            Residual Risk:{" "}
            <span className="report_risk_badge risk_low">Very Low</span>
          </p>
        </div>
      )
    })
  }

  const recsWithPriority = generated?.recommendationsWithPriority ?? []
  const recsSimple = generated?.recommendations ?? []
  const frameworkRows = collectFrameworkRowsFromReportPayload(data)
  const frameworkMappingAttestationStatus =
    data.frameworkMappingAttestationStatus ?? data.framework_mapping_attestation_status
  const frameworkAttestationBannerContent =
    frameworkAttestationBanner(frameworkMappingAttestationStatus)

  return (
    <div className="sec_user_page org_settings_page reports_page report_detail_page report_assessment_layout">
      {/* Header */}
      <header className="report_assessment_header">
        <a href="/reports" className="report_assessment_back" onClick={handleBack}>
          <CircleChevronLeft size={20} aria-hidden /> Back to Reports
        </a>
        <div className="report_assessment_title_row">
          <h1 className="report_assessment_title">{title}</h1>
          {!isArchived && showExportPdf && (
            <button type="button" className="report_detail_export_btn">
              <Download size={18} /> Export PDF
            </button>
          )}
        </div>
        <p className="report_assessment_subtitle">Analysis Report • {assessmentDate} • AI Generated</p>
      </header>

      {/* Vendor-Side Assessment Context Panel — vendors: score box + short context line (full narrative in Executive Summary only); buyers: preview + approval banner below */}
      <section
        className={`report_context_panel${isVendorViewer() ? " report_context_panel_vendor_portal" : ""}`}
      >
        <span className="report_context_pill">Customer-Specific Risk Assessment (Vendor-Side)</span>
        <div className="report_context_inner">
          <div className="report_context_left">
            <h2 className="report_context_entity">{orgName !== "—" ? orgName : "Customer"}</h2>
            {sector !== "—" ? <p className="report_context_meta">{sector}</p> : null}
            <p className="report_context_desc">
              {isVendorViewer()
                ? "Assessment context and risk evaluation for this customer engagement."
                : contextSummaryPreview.length > 0
                  ? contextSummaryPreview
                  : "Assessment context and risk evaluation for this customer engagement."}
            </p>
          </div>
          <div className="report_context_right">
            <p className="report_context_vendor">
              Vendor: {title.includes(" - ") ? title.split(" - ")[1]?.trim() || "—" : "—"}
            </p>
            {isVendorViewer() ? (
              <div className="report_context_rating" aria-label="Overall assessment grade and alignment score">
                <span className="report_context_grade">{gradeFromOverallRiskScore(overallScore)}</span>
                <span className="report_context_score">({alignmentScoreDisplay}/100)</span>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {!isVendorViewer() && (
        <section
          className="report_approval_summary_banner"
          aria-labelledby="report-approval-summary-heading"
        >
          <h2 id="report-approval-summary-heading" className="report_approval_summary_title">
            {customerRiskReportApprovalHeading(overallScore, overallLevel)}
          </h2>
          <p className="report_approval_summary_sub">
            Overall alignment score: {alignmentScoreDisplay}
            /100 (higher indicates stronger alignment / lower residual risk)
          </p>
        </section>
      )}

      <section className="report_section_card">
        <h2 className="report_section_heading">
          <FileText size={20} aria-hidden /> Executive Summary
        </h2>
        <div className="report_summary_body report_exec_summary">
          {generated?.executiveSummary ? (
            (() => {
              const text = stripMarkdownBold(generated.executiveSummary)
                .replace(/\s*---+\s*/g, " ")
                .trim();
              return text
                ? text
                    .split(/\n\n/)
                    .map((p) => stripMarkdownBold(p).replace(/\s*---+\s*/g, " ").trim())
                    .filter((p) => p.length > 0 && !/^\s*-{2,}\s*$/.test(p))
                    .map((p, i) => <p key={i}>{p}</p>)
                : <p>No executive summary generated.</p>;
            })()
          ) : generated?.summary ? (
            <p>{stripMarkdownBold(String(generated.summary)).replace(/\s*---+\s*/g, " ").trim()}</p>
          ) : (
            <p>No executive summary generated.</p>
          )}
        </div>
      </section>

      {/* Deployment Overview */}
      <section className="report_section_card">
        <h2 className="report_section_heading">
          <Building2 size={20} aria-hidden /> Deployment Overview
        </h2>
        <div className="report_deployment_grid">
          <div className="report_deployment_item"><span className="report_deployment_label">USE CASE</span><span className="report_deployment_value">{formatReportValue(deployment?.useCase || data.expectedOutcomes || data.primaryPainPoint)}</span></div>
          <div className="report_deployment_item"><span className="report_deployment_label">PRODUCT TIER</span><span className="report_deployment_value">{formatReportValue(deployment?.productTier)}</span></div>
          <div className="report_deployment_item"><span className="report_deployment_label">TARGET USERS</span><span className="report_deployment_value">{formatReportValue(deployment?.targetUsers)}</span></div>
          <div className="report_deployment_item"><span className="report_deployment_label">INFRASTRUCTURE</span><span className="report_deployment_value">{formatReportValue(deployment?.infrastructure || data.integrationComplexity)}</span></div>
          <div className="report_deployment_item"><span className="report_deployment_label">DEPLOYMENT TIMELINE</span><span className="report_deployment_value">{formatReportValue(deployment?.deploymentTimeline || data.implementationTimeline)}</span></div>
          <div className="report_deployment_item"><span className="report_deployment_label">ANNUAL CONTRACT VALUE</span><span className="report_deployment_value">{formatReportValue(deployment?.annualContractValue || data.customerBudgetRange)}</span></div>
        </div>
      </section>

      {/* ROI Analysis */}
      <section className="report_section_card">
        <h2 className="report_section_heading">
          <TrendingUp size={20} aria-hidden /> ROI Analysis
        </h2>
        <p className="report_roi_heading">
          {fullReport?.roiAnalysis?.roiMultiple && formatReportValue(fullReport.roiAnalysis.roiMultiple) !== "—"
            ? `Projected ${formatReportValue(fullReport.roiAnalysis.roiMultiple)} Return on Investment`
            : "Projected Return on Investment"}
        </p>
        <div className="report_roi_grid">
          <div className="report_roi_card">
            <span className="report_roi_value">{formatReportValue(fullReport?.roiAnalysis?.timeSavedPerEmployee)}</span>
            <span className="report_roi_label">TIME SAVED PER EMPLOYEE</span>
            <span className="report_roi_sub">{formatReportValue(fullReport?.roiAnalysis?.timeSavedSource)}</span>
          </div>
          <div className="report_roi_card">
            <span className="report_roi_value">{formatReportValue(fullReport?.roiAnalysis?.annualHoursRecovered)}</span>
            <span className="report_roi_label">ANNUAL HOURS RECOVERED</span>
            <span className="report_roi_sub">{formatReportValue(fullReport?.roiAnalysis?.annualHoursRecoveredCalculation)}</span>
          </div>
          <div className="report_roi_card">
            <span className="report_roi_value">{formatReportValue(fullReport?.roiAnalysis?.productivityValue)}</span>
            <span className="report_roi_label">PRODUCTIVITY VALUE</span>
            <span className="report_roi_sub">{formatReportValue(fullReport?.roiAnalysis?.productivityValueCalculation)}</span>
          </div>
          <div className="report_roi_card">
            <span className="report_roi_value">{formatReportValue(fullReport?.roiAnalysis?.annualCost || deployment?.annualContractValue || data.customerBudgetRange)}</span>
            <span className="report_roi_label">ANNUAL COST</span>
            <span className="report_roi_sub">{formatReportValue(fullReport?.roiAnalysis?.annualCostCalculation)}</span>
          </div>
          <div className="report_roi_card">
            <span className="report_roi_value">{formatReportValue(fullReport?.roiAnalysis?.roiMultiple)}</span>
            <span className="report_roi_label">ROI MULTIPLE</span>
            <span className="report_roi_sub">{formatReportValue(fullReport?.roiAnalysis?.roiMultipleCalculation)}</span>
          </div>
          <div className="report_roi_card">
            <span className="report_roi_value">{formatReportValue(fullReport?.roiAnalysis?.paybackPeriod)}</span>
            <span className="report_roi_label">PAYBACK PERIOD</span>
            <span className="report_roi_sub">{formatReportValue(fullReport?.roiAnalysis?.paybackSource)}</span>
          </div>
        </div>
        <h3 className="report_subheading">Comparison to Alternatives</h3>
        <div className="report_table_wrap">
          <table className="report_table">
            <thead><tr><th>Alternative</th><th>Annual Cost</th><th>ROI</th><th>Notes</th></tr></thead>
            <tbody>
              {fullReport?.roiAnalysis?.comparisonAlternatives && fullReport.roiAnalysis.comparisonAlternatives.length > 0
                ? fullReport.roiAnalysis.comparisonAlternatives.map((row, i) => (
                    <tr key={i}><td>{formatReportValue(row.alternative)}</td><td>{formatReportValue(row.annualCost)}</td><td>{formatReportValue(row.roi)}</td><td>{formatReportValue(row.notes)}</td></tr>
                  ))
                : <tr><td colSpan={4} className="report_table_empty">No comparison data.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Risk Assessment – all 5 risks by domain, then Security Posture block */}
      <section className="report_section_card">
        <h2 className="report_section_heading">
          <Shield size={20} aria-hidden /> Risk Assessment
        </h2>
        <p className="report_overall_risk">Overall Risk: <span className={`report_risk_badge ${riskLevelClass(overallLevel)}`}>{overallLevel}</span> (Score: {overallScore}/100)</p>
        {top5Risks.length === 0 ? (
          <p className="report_no_risks">No risk categories identified.</p>
        ) : (
          RISK_SCOPE_SECTIONS.map(({ scope, label, tagClass }) => {
            const scopeRisks = risksByScope[scope]
            if (scopeRisks.length === 0) return null
            return (
              <div key={scope} className="report_risk_scope_group">
                <div className="report_risk_scope_banner">
                  <span className={`report_risk_scope_tag ${tagClass}`}>{label}</span>
                </div>
                {renderDomainRiskBlocks(scopeRisks)}
              </div>
            )
          })
        )}
        {/* Security Posture – same block style, after risk category blocks */}
        <div className="report_risk_category_block">
          <div className="report_risk_category_header">
            <h3 className="report_risk_category_title">Security Posture</h3>
            <span className={`report_risk_badge ${riskLevelClass((fullReport?.securityPosture?.level ?? fullReport?.securityPosture?.initialRisk) ?? "Very Low")}`}>{formatReportValue(fullReport?.securityPosture?.level ?? fullReport?.securityPosture?.initialRisk) !== "—" ? formatReportValue(fullReport?.securityPosture?.level ?? fullReport?.securityPosture?.initialRisk) : "Very Low"}</span>
            <span className="report_risk_category_score">{formatReportValue(fullReport?.securityPosture?.score) !== "—" ? formatReportValue(fullReport?.securityPosture?.score) : "8/100"}</span>
          </div>
          <div className="report_risks_list">
            <h4>RISKS</h4>
            <ul className="report_risk_summary_list">
              {(() => {
                const raw = (fullReport?.securityPosture?.risks ?? []).map((r) =>
                  formatReportValue(r),
                );
                const pts = stringsToSummaryPoints(raw);
                if (pts.length === 0) {
                  return (
                    <li>
                      <AlertTriangle size={14} className="report_icon_warn" /> —
                    </li>
                  );
                }
                return pts.map((t, i) => (
                  <li key={i}>
                    <AlertTriangle size={14} className="report_icon_warn" /> {t}
                  </li>
                ));
              })()}
            </ul>
          </div>
          <div className="report_mitigations_list">
            <h4>MITIGATIONS</h4>
            <ul>
              {(fullReport?.securityPosture?.mitigations?.length ? fullReport.securityPosture.mitigations : ["—"]).map((m, i) => (
                <li key={i}><CheckCircle2 size={14} className="report_icon_ok" /> {formatReportValue(m)}</li>
              ))}
            </ul>
          </div>
          <p className="report_residual_risk">Residual Risk: <span className={`report_risk_badge ${riskLevelClass(fullReport?.securityPosture?.residualRisk ?? "Very Low")}`}>{formatReportValue(fullReport?.securityPosture?.residualRisk) !== "—" ? formatReportValue(fullReport?.securityPosture?.residualRisk) : "Very Low"}</span></p>
        </div>
      </section>

      {/* Compliance Alignment */}
      <section className="report_section_card">
        <h2 className="report_section_heading"><Shield size={18} aria-hidden /> Compliance Alignment</h2>
        <p className="report_compliance_summary">{formatReportValue(fullReport?.complianceAlignment?.summary)}</p>
        <div className="report_compliance_list">
          {fullReport?.complianceAlignment?.requirements && fullReport.complianceAlignment.requirements.length > 0
            ? fullReport.complianceAlignment.requirements.map((req, i) => (
                <div key={i} className="report_compliance_row">
                  <span><strong>{formatReportValue(req.name)}</strong> — {formatReportValue(req.description)}</span>
                  <span className={`report_pill report_pill_${req.status === "Met" ? "met" : req.status === "Deferred" ? "deferred" : "pending"}`}>{req.status}</span>
                </div>
              ))
            : <div className="report_compliance_row"><span>—</span><span className="report_pill report_pill_pending">—</span></div>}
        </div>
      </section>

      {!hideFrameworkMapping && (
        <section className="report_section_card report_framework_section">
          <h2 className="report_section_heading">
            <Layers size={20} aria-hidden />
            Framework mapping
          </h2>
          <p className="report_framework_lead">
            Frameworks and control themes for this engagement. Product attestation evidence is shown when linked and parsed.
          </p>
          {frameworkAttestationBannerContent ? (
            <div
              className={
                frameworkAttestationBannerContent.variant === "warn"
                  ? "report_framework_notice report_framework_notice_warn"
                  : "report_framework_notice report_framework_notice_info"
              }
              role="status"
            >
              {frameworkAttestationBannerContent.variant === "warn" ? (
                <AlertCircle size={18} className="report_framework_notice_icon" aria-hidden />
              ) : (
                <Info size={18} className="report_framework_notice_icon" aria-hidden />
              )}
              <p className="report_framework_notice_text">{frameworkAttestationBannerContent.text}</p>
            </div>
          ) : null}
          {frameworkRows.length > 0 ? (
            <div className="report_framework_table_shell">
              <div className="report_table_wrap report_framework_table_wrap">
                <table className="report_table report_framework_table">
                  <thead>
                    <tr>
                      <th scope="col">Framework</th>
                      <th scope="col">Coverage</th>
                      <th scope="col">Controls</th>
                      <th scope="col">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {frameworkRows.map((row, i) => (
                      <tr key={i}>
                        <td className="report_framework_td_name">
                          {formatFrameworkMappingFrameworkForDisplay(row.framework)}
                        </td>
                        <td className="report_framework_td_coverage">{formatReportValue(row.coverage)}</td>
                        <td className="report_framework_td_controls">
                          {(() => {
                            const lines = frameworkControlsDisplayLinesTopRanked(
                              row.controls,
                              FRAMEWORK_MAPPING_TOP_CONTROLS_MAX,
                            )
                            if (lines.length === 0) return formatReportValue(row.controls)
                            return (
                              <div className="report_framework_controls_stack">
                                {lines.map((line, li) => (
                                  <div key={li} className="report_framework_control_line">
                                    {stripMarkdownBold(line)}
                                  </div>
                                ))}
                              </div>
                            )
                          })()}
                        </td>
                        <td className="report_framework_td_notes">
                          {formatReportValue(sanitizeFrameworkMappingNotesForDisplay(row.notes))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="report_framework_empty_state">
              <Layers size={28} className="report_framework_empty_icon" aria-hidden />
              <p className="report_framework_empty_title">No framework rows</p>
              <p className="report_framework_empty_desc">
                There is no framework mapping data to display for this report.
              </p>
            </div>
          )}
        </section>
      )}

      {/* Implementation Plan */}
      <section className="report_section_card">
        <h2 className="report_section_heading"><List size={20} aria-hidden /> Implementation Plan</h2>
        <div className="report_phase_list">
          {fullReport?.implementationPlan?.phases && fullReport.implementationPlan.phases.length > 0
            ? fullReport.implementationPlan.phases.map((phase, i) => (
                <div key={i} className="report_phase_card">
                  <div className="report_phase_header">
                    <h3>{formatReportValue(phase.title)}</h3><span className="report_phase_timeline">{formatReportValue(phase.timeline)}</span>
                    <span className={`report_pill report_pill_${phase.status === "Complete" ? "complete" : phase.status === "In Progress" ? "progress" : "planned"}`}>{phase.status}</span>
                  </div>
                  <h4>ACTIVITIES</h4><ul>{phase.activities?.length ? phase.activities.map((a, j) => <li key={j}>{formatReportValue(a)}</li>) : <li>—</li>}</ul>
                  <h4>DELIVERABLES</h4><div className="report_tags">{phase.deliverables?.length ? phase.deliverables.map((d, j) => formatReportValue(d)).join(", ") : "—"}</div>
                </div>
              ))
            : (
              <>
                <div className="report_phase_card">
                  <div className="report_phase_header"><h3>Phase 1: Pilot</h3><span className="report_phase_timeline">Weeks 1-6</span><span className="report_pill report_pill_complete">Complete</span></div>
                  <h4>ACTIVITIES</h4><ul><li>—</li></ul><h4>DELIVERABLES</h4><div className="report_tags">—</div>
                </div>
                <div className="report_phase_card">
                  <div className="report_phase_header"><h3>Phase 2: Expansion</h3><span className="report_phase_timeline">Weeks 7-16</span><span className="report_pill report_pill_progress">In Progress</span></div>
                  <h4>ACTIVITIES</h4><ul><li>—</li></ul><h4>DELIVERABLES</h4><div className="report_tags">—</div>
                </div>
                <div className="report_phase_card">
                  <div className="report_phase_header"><h3>Phase 3: Statewide</h3><span className="report_phase_timeline">Months 5-12</span><span className="report_pill report_pill_planned">Planned</span></div>
                  <h4>ACTIVITIES</h4><ul><li>—</li></ul><h4>DELIVERABLES</h4><div className="report_tags">—</div>
                </div>
              </>
            )}
        </div>
      </section>

      {/* Competitive Positioning */}
      <section className="report_section_card">
        <h2 className="report_section_heading"><BarChart3 size={20} aria-hidden /> Competitive Positioning</h2>
        <p className="report_summary_body">{fullReport?.competitivePositioning ? formatReportValue(fullReport.competitivePositioning) : (formatReportValue(data.keyAdvantages) !== "—" ? formatReportValue(data.keyAdvantages) : "No competitive positioning data.")}</p>
      </section>

      {/* Recommendations */}
      <section className="report_section_card">
        <h2 className="report_section_heading"><Eye size={20} aria-hidden /> Recommendations</h2>
        {recsWithPriority.length > 0 ? (
          <ul className="report_recommendations_list">
            {recsWithPriority.map((r, i) => (
              <li key={i} className="report_rec_item">
                <span className={`report_pill report_pill_priority_${r.priority.toLowerCase()}`}>{r.priority}</span>
                <div>
                  <strong>{formatReportValue(r.title)}</strong>
                  <p>{formatReportValue(r.description)}</p>
                  <span className="report_rec_timeline">Timeline: {formatReportValue(r.timeline)}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : recsSimple.length > 0 ? (
          <ul className="report_policy_list">
            {recsSimple.map((rec, i) => (
              <li key={i}>{formatReportValue(rec)}</li>
            ))}
          </ul>
        ) : (
          <p className="report_attachment_empty">No recommendations.</p>
        )}
      </section>

      {/* Appendix — glossary-style: bold term, definition on the next line */}
      <section className="report_section_card report_appendix">
        <h2 className="report_section_heading">Appendix</h2>
        <ul className="report_appendix_glossary">
          <li>
            <strong className="report_appendix_term">Methodology</strong>
            <p className="report_appendix_def">
              {formatReportValue(fullReport?.appendix?.methodology) !== "—"
                ? formatReportValue(fullReport?.appendix?.methodology)
                : "AI EVAL 3-Layer Risk Assessment Framework v2.1 — Customer-Specific Analysis"}
            </p>
          </li>
          <li>
            <strong className="report_appendix_term">Prepared By</strong>
            <p className="report_appendix_def">
              {formatReportValue(fullReport?.appendix?.preparedBy) !== "—"
                ? formatReportValue(fullReport?.appendix?.preparedBy)
                : "AI EVAL Platform — Automated Analysis Report Engine"}
            </p>
          </li>
          <li>
            <strong className="report_appendix_term">Reviewed By</strong>
            <p className="report_appendix_def">
              {formatReportValue(fullReport?.appendix?.reviewedBy)}
            </p>
          </li>
          <li>
            <strong className="report_appendix_term">Confidentiality</strong>
            <p className="report_appendix_def">
              {formatReportValue(fullReport?.appendix?.confidentiality) !== "—"
                ? formatReportValue(fullReport?.appendix?.confidentiality)
                : "Confidential — For internal sales team use only"}
            </p>
          </li>
          <li>
            <strong className="report_appendix_term">Data Sources</strong>
            <ul className="report_appendix_sublist">
              {(fullReport?.appendix?.dataSources && fullReport.appendix.dataSources.length > 0)
                ? fullReport.appendix.dataSources.map((s, i) => (
                    <li key={i}>{formatReportValue(s)}</li>
                  ))
                : (
                    <>
                      <li>Vendor COTS assessment submission data</li>
                      <li>Risk mappings database (assessment context match)</li>
                    </>
                  )}
            </ul>
          </li>
        </ul>
        {appendixRiskTableRows.length > 0 ? (
          <>
            <h3 className="report_appendix_table_heading">Risk catalog</h3>
            <div className="report_table_wrap report_appendix_table_wrap">
              <table className="report_table report_appendix_risk_table">
                <thead>
                  <tr>
                    <th scope="col">Risk Id</th>
                    <th scope="col">Domain</th>
                    <th scope="col">Mitigation Name</th>
                  </tr>
                </thead>
                <tbody>
                  {appendixRiskTableRows.map((row, i) => (
                    <tr key={`appendix-risk-${i}`}>
                      <td>{row.riskId}</td>
                      <td>{row.riskDomain}</td>
                      <td>{row.mitigationRef}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </section>
    </div>
  )
}
