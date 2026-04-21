import { useState, useEffect, useRef, useCallback } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { toast } from "react-toastify"
import {
  CircleChevronLeft,
  Download,
  FileText,
  Building2,
  TrendingUp,
  DollarSign,
  Clock3,
  Shield,
  BarChart3,
  List,
  User,
  Layers,
  AlertCircle,
  Info,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react"
import { formatDateDDMMMYYYY } from "../../../utils/formatDate.js"
import {
  customerRiskReportApprovalHeading,
  alignmentScoreFromRiskScore,
  gradeFromOverallRiskScore,
  completeReportRiskMeterColor,
} from "../../../utils/completeReportGrade"
import { mixSrgbHex } from "../../../utils/mixSrgbHex"
import { riskScopeFromRow, type ReportRiskScope } from "../../../utils/reportRiskScope"
import {
  parseFrameworkMappingControlsDetail,
  type FrameworkMappingControlDetail,
} from "../../../utils/frameworkMappingControlsDisplay"
import type {
  FrameworkMappingDetailLocationState,
  FrameworkMappingRiskMappingContextPayload,
} from "../../frameworkMapping/FrameworkMappingCardGrid"
import { sanitizeFrameworkMappingNotesForDisplay } from "../../../utils/frameworkMappingNotesDisplay"
import { formatFrameworkMappingFrameworkForDisplay } from "../../../utils/frameworkMappingFrameworkDisplay"
import { riskRowsToSummaryPoints, stringsToSummaryPoints } from "../../../utils/summarizeRiskPoints"
import LoadingMessage from "../../UI/LoadingMessage"
import {
  buildReportPdfFilename,
  downloadElementAsPdf,
  splitCompleteReportTitle,
} from "../../../utils/reportPdfExport"
import "../UserManagement/user_management.css"
import "./reports.css"
import "../Assessments/BuyerAssessment/buyer_vendor_risk_report.css"

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
  /** Optional fields from API (snake or camel). */
  residual_risk?: string | null
  risk_score?: number | null
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

function partitionRecommendationsByPriority(recs: RecommendationWithPriority[]): {
  high: RecommendationWithPriority[]
  medium: RecommendationWithPriority[]
  low: RecommendationWithPriority[]
} {
  const high: RecommendationWithPriority[] = []
  const medium: RecommendationWithPriority[] = []
  const low: RecommendationWithPriority[] = []
  for (const r of recs) {
    const p = String(r.priority ?? "")
      .trim()
      .toLowerCase()
    if (p === "high") high.push(r)
    else if (p === "medium") medium.push(r)
    else low.push(r)
  }
  return { high, medium, low }
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

const DEFAULT_IMPLEMENTATION_PHASES: ImplementationPhase[] = [
  { title: "Pilot", timeline: "Weeks 1-6", status: "Planned", activities: [], deliverables: [] },
  { title: "Expansion", timeline: "Weeks 7-16", status: "In Progress", activities: [], deliverables: [] },
  { title: "Statewide", timeline: "Months 5-12", status: "Complete", activities: [], deliverables: [] },
]

/** Column headers already say Phase 1 / 2 / 3 — drop redundant "Phase N:" from titles. */
function implementationPhaseTitleForDisplay(title: string, phaseIndex: number): string {
  const t = String(title ?? "").trim()
  if (!t || t === "—") return t
  const n = phaseIndex + 1
  const re = new RegExp(`^phase\\s*${n}\\s*[:.\\-–—]\\s*`, "i")
  const stripped = t.replace(re, "").trim()
  return stripped.length > 0 ? stripped : t
}

function defaultImplementationPhaseAtIndex(i: number): ImplementationPhase {
  if (i >= 0 && i < DEFAULT_IMPLEMENTATION_PHASES.length) return DEFAULT_IMPLEMENTATION_PHASES[i]
  return {
    title: `Phase ${i + 1}`,
    timeline: "—",
    status: "In Progress",
    activities: [],
    deliverables: [],
  }
}

/**
 * All phases from the API (or three defaults). First phase status Planned, last Complete;
 * middle phases use API status or default In Progress.
 */
function implementationPhasesForUi(phases: ImplementationPhase[] | undefined | null): ImplementationPhase[] {
  if (!phases?.length) return DEFAULT_IMPLEMENTATION_PHASES
  const n = phases.length
  return phases.map((p, i) => {
    const d = defaultImplementationPhaseAtIndex(i)
    if (!p) return d
    const title = formatReportValue(p.title)
    const timeline = formatReportValue(p.timeline)
    const activities =
      Array.isArray(p.activities) && p.activities.length > 0 ? p.activities : d.activities
    const deliverables =
      Array.isArray(p.deliverables) && p.deliverables.length > 0 ? p.deliverables : d.deliverables
    const rawStatus = formatReportValue(p.status)
    let status: string
    if (i === 0) status = "Planned"
    else if (i === n - 1) status = "Complete"
    else status = rawStatus !== "—" ? String(p.status).trim() : d.status

    return {
      title: title !== "—" ? title : d.title,
      timeline: timeline !== "—" ? timeline : d.timeline,
      status,
      activities,
      deliverables,
    }
  })
}

const IMPL_PLAN_HEADER_PRI_CLASSES = ["bvr_pri_high", "bvr_pri_med", "bvr_pri_low"] as const

function chunkImplementationPhases(phases: ImplementationPhase[]): ImplementationPhase[][] {
  const chunks: ImplementationPhase[][] = []
  for (let i = 0; i < phases.length; i += 3) chunks.push(phases.slice(i, i + 3))
  return chunks
}

function padImplementationPhaseChunk(chunk: ImplementationPhase[]): (ImplementationPhase | null)[] {
  const row: (ImplementationPhase | null)[] = [...chunk]
  while (row.length < 3) row.push(null)
  return row.slice(0, 3)
}

function implementationPlanStatusPillClass(status: string): string {
  const s = status.trim().toLowerCase()
  if (s.includes("complete")) return "report_pill_complete"
  if (s.includes("progress")) return "report_pill_progress"
  return "report_pill_planned"
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

/** ROI time-saved source line: show as "Source: …" unless already prefixed. */
function formatRoiTimeSavedSourceLine(val: unknown): string {
  const s = formatReportValue(val)
  if (s === "—") return "—"
  if (/^\s*source\s*:/i.test(s)) return s
  return `Source: ${s}`
}

/** Remove markdown bold markers (**) from report text so they are not shown in the UI. */
function stripMarkdownBold(s: string): string {
  return String(s).replace(/\*\*/g, "")
}

function partitionComplianceRequirements(
  requirements: ComplianceRequirement[] | undefined | null,
): {
  met: ComplianceRequirement[]
  pending: ComplianceRequirement[]
} {
  const met: ComplianceRequirement[] = []
  const pending: ComplianceRequirement[] = []
  if (!requirements?.length) return { met, pending }
  for (const r of requirements) {
    const s = String(r.status ?? "")
      .trim()
      .toLowerCase()
    if (s === "met") met.push(r)
    else pending.push(r)
  }
  return { met, pending }
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
  const l = normalizeResidualRiskLabel(level).toLowerCase()
  if (l.includes("high")) return "risk_high"
  if (l.includes("medium") || l.includes("moderate")) return "risk_medium"
  if (l.includes("low") || l.includes("very")) return "risk_low"
  return "risk_low"
}

function overallRiskBadgeVariantClass(level: string): string {
  const normalized = normalizeResidualRiskLabel(level).toLowerCase()
  if (normalized === "critical") return "report_overall_risk_badge_critical"
  if (normalized === "high") return "report_overall_risk_badge_high"
  if (normalized === "moderate") return "report_overall_risk_badge_moderate"
  if (normalized === "medium") return "report_overall_risk_badge_medium"
  if (normalized === "very low") return "report_overall_risk_badge_very_low"
  if (normalized === "low") return "report_overall_risk_badge_low"
  return "report_overall_risk_badge_low"
}

function riskScopeSortOrder(scope: ReportRiskScope): number {
  if (scope === "vendor") return 0
  if (scope === "buyer") return 1
  return 2
}

/** Strip trailing "Risk" / "Risks" from one domain fragment (e.g. "Technical Risks" → "Technical"). */
function compactOneRiskCategoryFragment(fragment: string): string {
  const t = fragment.trim().replace(/\s+/g, " ")
  if (!t) return fragment
  const plural = t.match(/^(.+?)\s+risks$/i)
  if (plural?.[1]) return plural[1].trim()
  const singular = t.match(/^(.+?)\s+risk$/i)
  if (singular?.[1]) return singular[1].trim()
  return t
}

/**
 * Domain-style labels often end with " … Risks" (e.g. "Technical Risks").
 * Risk Type column shows the short headword (e.g. "Technical") to match report cards.
 * Comma-separated lists are compacted per segment.
 */
function compactRiskTypeLabelFromCategory(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ")
  if (!t) return raw
  if (t.includes(",")) {
    return t
      .split(",")
      .map((s) => compactOneRiskCategoryFragment(s.trim()))
      .filter((s) => s.length > 0)
      .join(", ")
  }
  return compactOneRiskCategoryFragment(t)
}

/** Map free-text domain / detected type to standard risk category chips (Technical, Business, …). */
const RISK_CATEGORY_RULES: { test: RegExp; label: string }[] = [
  { test: /technical|technology|engineering|\bit\b|software|hardware|infrastructure/i, label: "Technical" },
  { test: /\bsecurity|cyber|infosec|vulnerability|threat|zero\s*trust\b/i, label: "Security" },
  { test: /\bcompliance|regulatory|legal|audit|governance|policy\b/i, label: "Compliance" },
  { test: /\boperational|operations|process|workflow|service\s+delivery|continuity\b/i, label: "Operational" },
  { test: /\bbusiness|commercial|financial|contract|market|revenue|procurement\b/i, label: "Business" },
  { test: /\bstrategic|strategy|enterprise\b/i, label: "Strategic" },
  { test: /\bhuman|personnel|\bhr\b|training|workforce|organizational\b/i, label: "Human" },
  { test: /\breputational|reputation|brand\b/i, label: "Reputational" },
  { test: /\bdata|privacy|confidentiality|pii\b/i, label: "Data" },
]

function titleCaseWords(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(" ")
}

function canonicalRiskCategoryLabel(fragment: string): string {
  const trimmed = fragment.trim()
  if (!trimmed) return ""
  const compact = compactOneRiskCategoryFragment(trimmed)
  const blob = `${trimmed} ${compact}`.toLowerCase()
  for (const { test, label } of RISK_CATEGORY_RULES) {
    if (test.test(blob)) return label
  }
  return titleCaseWords(compact)
}

function mapRiskTypePhrase(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ")
  if (!t || t === "—") return "—"
  if (t.includes(",")) {
    const labels = t
      .split(",")
      .map((s) => canonicalRiskCategoryLabel(s.trim()))
      .filter((s) => s.length > 0)
    const uniq = [...new Set(labels)]
    return uniq.length > 0 ? uniq.join(", ") : compactRiskTypeLabelFromCategory(t)
  }
  return canonicalRiskCategoryLabel(t)
}

/** Title-case domain labels from the catalog (e.g. "Business Risks", "Technical Risks"). */
function formatRiskTypeDomainForDisplay(raw: string): string {
  const t = raw.trim().replace(/\s+/g, " ")
  if (!t || t === "—") return t
  return t
    .split(",")
    .map((seg) =>
      seg
        .trim()
        .split(/\s+/)
        .map((w) => (w.length === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
        .join(" "),
    )
    .filter((s) => s.length > 0)
    .join(", ")
}

/**
 * Risk type pill: show catalog `domains` as stored (e.g. "Business Risks"); map free-text
 * `risk_type_detected` to short categories when domain is absent; then scope.
 */
function riskTypeDisplayForRow(r: DbRisk): string {
  const domain = formatReportValue(r.domains)
  if (domain !== "—") return formatRiskTypeDomainForDisplay(domain)
  const raw = formatReportValue(r.risk_type_detected)
  if (raw !== "—") return mapRiskTypePhrase(raw)
  const s = riskScopeFromRow(r)
  if (s === "vendor") return "Vendor"
  if (s === "buyer") return "Business"
  return "Shared"
}

/** Long generic catalog title — hide from Risk Name and fall back to other fields. */
const EXCLUDED_RISK_NAME_NORMALIZED =
  "inadequate ai governance frameworks expose high-stakes domains to systemic harms"

function normalizedRiskNameCandidate(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase()
}

function isExcludedRiskNameLabel(val: unknown): boolean {
  const t = formatReportValue(val)
  if (t === "—") return false
  return normalizedRiskNameCandidate(t) === EXCLUDED_RISK_NAME_NORMALIZED
}

/** Risk Type column: catalog `primary_risk` (formatted); fall back to domain / detected / scope. */
function riskTypeColumnPrimaryRiskForRow(r: DbRisk): string {
  if (!isExcludedRiskNameLabel(r.primary_risk)) {
    const t = formatReportValue(r.primary_risk)
    if (t !== "—") return formatRiskNameForDisplay(t)
  }
  return riskTypeDisplayForRow(r)
}

/** Readable risk title: normalize "Ai" → "AI", title-case words, preserve comma-separated clauses. */
function formatRiskNameForDisplay(s: string): string {
  const t = s.trim().replace(/\s+/g, " ")
  if (!t || t === "—") return t
  const withAcronym = t.replace(/\bai\b/gi, "AI")
  return withAcronym
    .split(", ")
    .map((segment) =>
      segment
        .trim()
        .split(/\s+/)
        .map((w) => {
          if (/^ai$/i.test(w)) return "AI"
          const lower = w.toLowerCase()
          return lower.length === 0 ? w : lower.charAt(0).toUpperCase() + lower.slice(1)
        })
        .join(" "),
    )
    .join(", ")
}

/** Risk Name column: show domain names first; fall back to title/primary/id if absent. */
function riskNameForRow(r: DbRisk): string {
  const domain = formatReportValue(r.domains)
  if (domain !== "—") return formatRiskTypeDomainForDisplay(domain)
  for (const raw of [r.risk_title, r.primary_risk, r.risk_id]) {
    if (isExcludedRiskNameLabel(raw)) continue
    const t = formatReportValue(raw)
    if (t !== "—") return formatRiskNameForDisplay(t)
  }
  return "—"
}

function identifiedRiskLinesForRow(r: DbRisk): string[] {
  return riskRowsToSummaryPoints([r])
}

function mitigationLinesForRow(
  r: DbRisk,
  mitigationsByRiskId: Record<string, Mitigation[]>,
): string[] {
  const lines: string[] = []
  const rid = String(r.risk_id ?? "").trim()
  if (!rid || !mitigationsByRiskId[rid]) return lines
  for (const m of mitigationsByRiskId[rid]) {
    const bot = m.mitigation_summary_points
    if (Array.isArray(bot) && bot.length > 0) {
      for (const pt of bot) {
        const line = String(pt ?? "").trim()
        if (line.length > 1) lines.push(line)
      }
      continue
    }
    lines.push(
      m.mitigation_action_name +
        (m.mitigation_definition ? ` — ${String(m.mitigation_definition).trim()}` : ""),
    )
  }
  return lines
}

function residualRiskForRow(r: DbRisk): string {
  const o = r as Record<string, unknown>
  const v = o.residual_risk ?? o.residualRisk ?? r.residual_risk
  const s = formatReportValue(v)
  if (s === "—") return "Very Low"
  return normalizeResidualRiskLabel(s)
}

/** Per-domain fallback score derived from that row's residual risk label. */
function derivedScoreFromResidualRisk(level: string): number | null {
  const l = String(level ?? "").trim().toLowerCase()
  if (!l) return null
  if (l.includes("very low")) return 10
  if (l.includes("low")) return 25
  if (l.includes("medium")) return 55
  if (l.includes("high")) return 80
  if (l.includes("critical")) return 95
  return null
}

function scoreDisplayForRow(r: DbRisk, fallbackScore?: number): string {
  const o = r as Record<string, unknown>
  const candidates = [
    o.risk_score,
    o.riskScore,
    r.risk_score,
    o.alignment_score,
    o.alignmentScore,
    o.score,
    (r as unknown as Record<string, unknown>).score,
    o.overall_risk_score,
    o.overallRiskScore,
    o.report_context_score,
    o.reportContextScore,
  ]
  for (const n of candidates) {
    if (typeof n === "number" && !Number.isNaN(n)) return `${Math.round(n)}/100`
    if (typeof n === "string") {
      const t = n.trim()
      if (!t) continue
      if (/^-?\d/.test(t)) {
        const clean = t.replace(/%$/, "")
        return clean.includes("/") ? clean : `${clean}/100`
      }
      // Handle decorated strings like "Risk score: 10/100" or "Score 10%".
      const embedded = t.match(/(-?\d+(?:\.\d+)?)\s*(?:\/\s*100|%|(?:\b|$))/i)
      if (embedded?.[1]) {
        const parsed = Number(embedded[1])
        if (!Number.isNaN(parsed)) return `${Math.round(parsed)}/100`
      }
    }
    if (n && typeof n === "object") {
      const obj = n as Record<string, unknown>
      const nested = [obj.score, obj.risk_score, obj.riskScore, obj.value]
      for (const v of nested) {
        if (typeof v === "number" && !Number.isNaN(v)) return `${Math.round(v)}/100`
        if (typeof v === "string" && /^-?\d/.test(v.trim())) {
          const clean = v.trim().replace(/%$/, "")
          return clean.includes("/") ? clean : `${clean}/100`
        }
      }
    }
  }
  const derived = derivedScoreFromResidualRisk(residualRiskForRow(r))
  if (typeof derived === "number" && !Number.isNaN(derived)) return `${derived}/100`
  if (typeof fallbackScore === "number" && !Number.isNaN(fallbackScore)) {
    return `${Math.round(fallbackScore)}/100`
  }
  return "—"
}

/** Parse score display (e.g. "65/100", "65%") to a 0..100 percent value. */
function scorePercentValueFromDisplay(display: string): number | null {
  const t = String(display ?? "").trim()
  if (!t || t === "—") return null
  const m = t.match(/-?\d+(?:\.\d+)?/)
  if (!m?.[0]) return null
  const n = Number(m[0])
  if (Number.isNaN(n)) return null
  return Math.max(0, Math.min(100, Math.round(n)))
}

function scoreFractionLabelFromDisplay(display: string): string {
  const v = scorePercentValueFromDisplay(display)
  if (v == null) return "—"
  return `${v}/100`
}

function renderRiskScoreCircle(
  display: string,
  options?: { color?: string; labelFormat?: "percent" | "fraction"; className?: string },
): React.ReactNode {
  const value = scorePercentValueFromDisplay(display)
  if (value == null) return "—"
  const style = {
    "--score": String(value),
    ...(options?.color ? { "--score-color": options.color } : {}),
  } as React.CSSProperties
  const label =
    options?.labelFormat === "fraction" ? scoreFractionLabelFromDisplay(display) : `${value}%`
  return (
    <span className={`report_risk_score_circle${options?.className ? ` ${options.className}` : ""}`} style={style}>
      <span className="report_risk_score_circle_inner">{label}</span>
    </span>
  )
}

const SECURITY_POSTURE_DEFAULT_RISK_NAME = "Security Posture"
const SECURITY_POSTURE_DEFAULT_PRIMARY_RISK = "Technical Risk"
const SECURITY_POSTURE_DEFAULT_IDENTIFIED_LINES = [
  "Integration challenges with legacy systems",
  "Regulatory compliance gaps (FERPA, SOC 2)",
  "Anthropomorphization of LLM conversational agent",
  "Inadequate AI governance frameworks",
  "Socioeconomic risks from automation",
  "Misinformation risks in sensitive contexts",
]
const SECURITY_POSTURE_DEFAULT_MITIGATION_LINES = [
  "Robust integration testing",
  "Regulatory compliance audit",
  "User training and expectation setting",
  "Enhance AI governance framework",
  "Workforce transition planning",
  "Misinformation risk monitoring",
]
const SECURITY_POSTURE_DEFAULT_RESIDUAL =
  "Moderate residual risk after implementing recommended mitigations."
const SECURITY_POSTURE_DEFAULT_SCORE = "65/100"

/** Narrative shown with Security Posture residual risk in the risk assessment table. */
const SECURITY_POSTURE_RESIDUAL_EXPECTATION_NOTE =
  "With proper implementation of recommended mitigations, the residual risk is expected to be low to moderate."

function securityPostureRiskName(sp: RiskCategoryBlock | undefined): string {
  const n = formatReportValue(sp?.name)
  if (n === "—") return SECURITY_POSTURE_DEFAULT_RISK_NAME
  const norm = n.trim().toLowerCase()
  if (norm === "risk" || /\b(residual|moderate|medium|low|high|critical)\b/.test(norm)) {
    return SECURITY_POSTURE_DEFAULT_RISK_NAME
  }
  return formatRiskNameForDisplay(n)
}

/** Security row Risk Type should be its primary risk, not a hardcoded label. */
function securityPosturePrimaryRiskDisplay(sp: RiskCategoryBlock | undefined): string {
  const p = formatReportValue(sp?.initialRisk)
  if (p !== "—") {
    const norm = p.trim().toLowerCase()
    if (!/\b(residual|moderate|medium|low|high|critical)\b/.test(norm)) {
      return formatRiskNameForDisplay(p)
    }
  }
  return SECURITY_POSTURE_DEFAULT_PRIMARY_RISK
}

function securityPostureIdentifiedLines(sp: RiskCategoryBlock | undefined): string[] {
  const lines = stringsToSummaryPoints((sp?.risks ?? []).map((r) => formatReportValue(r)))
  return lines.length > 0 ? lines : SECURITY_POSTURE_DEFAULT_IDENTIFIED_LINES
}

function securityPostureMitigationLines(sp: RiskCategoryBlock | undefined): string[] {
  const m = sp?.mitigations
  if (!m || m.length === 0) return SECURITY_POSTURE_DEFAULT_MITIGATION_LINES
  const lines = m.map((x) => formatReportValue(x)).filter((s) => s !== "—" && s.length > 0)
  return lines.length > 0 ? lines : SECURITY_POSTURE_DEFAULT_MITIGATION_LINES
}

function securityPostureResidualDisplay(sp: RiskCategoryBlock | undefined): string {
  const s = formatReportValue(sp?.residualRisk)
  if (s === "—") return normalizeResidualRiskLabel(SECURITY_POSTURE_DEFAULT_RESIDUAL)
  return normalizeResidualRiskLabel(s)
}

/** Residual risk badge should display only the level label, not narrative text. */
function normalizeResidualRiskLabel(raw: string): string {
  const t = String(raw ?? "").trim()
  if (!t) return "Very Low"
  if (/very\s*low/i.test(t)) return "Very Low"
  if (/\bmod(?:erate|rate|reate)\b/i.test(t)) return "Moderate"
  if (/\bmoderate\b/i.test(t)) return "Moderate"
  if (/\bmedium\b/i.test(t)) return "Medium"
  if (/\blow\b/i.test(t)) return "Low"
  if (/\bhigh\b/i.test(t)) return "High"
  if (/\bcritical\b/i.test(t)) return "Critical"
  return t
}

function securityPostureScoreDisplay(sp: RiskCategoryBlock | undefined): string {
  const s = formatReportValue(sp?.score)
  return s !== "—" ? s : SECURITY_POSTURE_DEFAULT_SCORE
}

function renderIdentifiedRiskTableCell(lines: string[]) {
  if (lines.length === 0) return "—"
  if (lines.length === 1) {
    return (
      <span className="report_risk_assessment_icon_line">
        <AlertTriangle size={14} className="report_icon_warn" aria-hidden />
        {lines[0]}
      </span>
    )
  }
  return (
    <ul className="report_table_cell_list report_risk_assessment_icon_list">
      {lines.map((t, j) => (
        <li key={j}>
          <AlertTriangle size={14} className="report_icon_warn" aria-hidden />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  )
}

function renderMitigationsTableCell(lines: string[]) {
  if (lines.length === 0) return "—"
  if (lines.length === 1) {
    return (
      <span className="report_risk_assessment_icon_line">
        <CheckCircle2 size={14} className="report_icon_ok" aria-hidden />
        {lines[0]}
      </span>
    )
  }
  return (
    <ul className="report_table_cell_list report_risk_assessment_icon_list">
      {lines.map((t, j) => (
        <li key={j}>
          <CheckCircle2 size={14} className="report_icon_ok" aria-hidden />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  )
}

/** One chip per distinct control id (for framework mapping table links). */
function uniqueFrameworkControlDetailsForLinks(
  details: FrameworkMappingControlDetail[],
): FrameworkMappingControlDetail[] {
  const seen = new Set<string>()
  const out: FrameworkMappingControlDetail[] = []
  for (const d of details) {
    const id = String(d.controlId ?? "").trim()
    if (!id || id === "—") continue
    const k = id.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(d)
  }
  return out
}

function isSystemUserRole(): boolean {
  const role = (sessionStorage.getItem("systemRole") ?? "").toLowerCase().trim().replace(/_/g, " ")
  return role === "system admin" || role === "system manager" || role === "system viewer"
}

function isVendorViewer(): boolean {
  const role = (sessionStorage.getItem("systemRole") ?? "").toLowerCase().trim().replace(/_/g, " ")
  return role === "vendor"
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
  const hideFrameworkMapping = reportNavState?.hideFrameworkMapping === true || isSystemUserRole()
  const usePortalStyleUi = isVendorViewer() || isSystemUserRole()
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
  const pdfBodyRef = useRef<HTMLDivElement>(null)
  const [pdfExporting, setPdfExporting] = useState(false)

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

  const handleExportPdf = useCallback(async () => {
    if (!report || !pdfBodyRef.current) return
    const d = report.report as Record<string, unknown>
    const orgFromField = formatReportValue(d.customerOrganizationName)
    const { org: orgFromTitle, product: productFromTitle } = splitCompleteReportTitle(
      report.title || "Analysis Report",
    )
    const orgName =
      orgFromField !== "—" && String(orgFromField).trim() !== ""
        ? String(orgFromField).trim()
        : orgFromTitle.trim() || "Organization"
    const productName = productFromTitle.trim() || "Product"
    const filename = buildReportPdfFilename({
      reportName: "Analysis-Report",
      orgName,
      productName,
    })
    try {
      setPdfExporting(true)
      await downloadElementAsPdf(pdfBodyRef.current, filename)
    } catch (err) {
      console.error(err)
      toast.error("Could not export PDF. Try again in a moment.")
    } finally {
      setPdfExporting(false)
    }
  }, [report])

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
  const roiAnalysisHeadingText =
    fullReport?.roiAnalysis?.roiMultiple && formatReportValue(fullReport.roiAnalysis.roiMultiple) !== "—"
      ? `Projected ${formatReportValue(fullReport.roiAnalysis.roiMultiple)} Return on Investment`
      : "Projected Return on Investment"
  const appendixRiskTableRows = buildAppendixRiskTableRows(
    fullReport?.appendix,
    domainByRiskId,
  )

  const deployment = data.deploymentOverview as DeploymentOverview | undefined
  const overallScore = generated?.overallRiskScore ?? 0
  const overallLevel = normalizeResidualRiskLabel(formatReportValue(generated?.riskLevel ?? "Low"))
  const alignmentScoreDisplay = alignmentScoreFromRiskScore(overallScore)
  const contextSummaryPreview = (() => {
    const raw = generated?.executiveSummary ?? generated?.summary
    if (raw == null || String(raw).trim() === "") return ""
    return stripMarkdownBold(String(raw)).replace(/\s*---+\s*/g, " ").replace(/\s+/g, " ").trim()
  })()

  const recsWithPriority = generated?.recommendationsWithPriority ?? []
  const recsSimple = generated?.recommendations ?? []
  const { high: highRecommendations, medium: mediumRecommendations, low: lowRecommendations } =
    partitionRecommendationsByPriority(recsWithPriority)
  const competitivePositioningDisplay =
    fullReport?.competitivePositioning
      ? formatReportValue(fullReport.competitivePositioning)
      : formatReportValue(data.keyAdvantages) !== "—"
        ? formatReportValue(data.keyAdvantages)
        : "No competitive positioning data."
  const implPhases = implementationPhasesForUi(fullReport?.implementationPlan?.phases)
  const implPhaseChunks = chunkImplementationPhases(implPhases)
  const frameworkRows = collectFrameworkRowsFromReportPayload(data)
  const frameworkMappingAttestationStatus =
    data.frameworkMappingAttestationStatus ?? data.framework_mapping_attestation_status
  const frameworkAttestationBannerContent =
    frameworkAttestationBanner(frameworkMappingAttestationStatus)

  function navigateToFrameworkControlDetail(row: FrameworkRow, control: FrameworkMappingControlDetail) {
    const id = String(control.controlId ?? "").trim()
    if (!id || id === "—") return
    const assessmentLabel = String(title ?? "")
      .replace(/^Analysis Report:\s*/i, "")
      .trim()
    const riskMappingContext: FrameworkMappingRiskMappingContextPayload = {
      top5Risks: top5Risks as unknown[],
      mitigationsByRiskId: mitigationsByRiskId as unknown as Record<string, unknown[]>,
      assessmentDetail: null,
    }
    const parentFrameworkDetail: FrameworkMappingDetailLocationState = {
      row: {
        framework: row.framework,
        coverage: row.coverage,
        controls: row.controls,
        notes: row.notes,
      },
      assessmentLabel: assessmentLabel || undefined,
      riskMappingContext,
    }
    navigate("/riskMappings/control-detail", {
      state: { control, parentFrameworkDetail },
    })
  }

  type RiskAssessmentTableRow =
    | { kind: "catalog"; risk: DbRisk; index: number }
    | { kind: "security_posture"; block: RiskCategoryBlock | undefined }

  const riskAssessmentRows: RiskAssessmentTableRow[] = (() => {
    const sorted = [...top5Risks].sort((a, b) => {
      const d =
        riskScopeSortOrder(riskScopeFromRow(a)) - riskScopeSortOrder(riskScopeFromRow(b))
      if (d !== 0) return d
      const dom = String(a.domains ?? "").localeCompare(String(b.domains ?? ""), undefined, {
        sensitivity: "base",
      })
      if (dom !== 0) return dom
      return String(a.risk_title ?? "").localeCompare(String(b.risk_title ?? ""), undefined, {
        sensitivity: "base",
      })
    })
    const catalog: RiskAssessmentTableRow[] = sorted.map((risk, index) => ({
      kind: "catalog",
      risk,
      index,
    }))
    return [...catalog, { kind: "security_posture", block: fullReport?.securityPosture }]
  })()

  const complianceRequirements = fullReport?.complianceAlignment?.requirements
  const complianceBuckets = partitionComplianceRequirements(complianceRequirements)
  const contextMeterColor = completeReportRiskMeterColor(data as never, alignmentScoreDisplay)
  const vendorNameDisplay = (() => {
    const reportObj = report as Record<string, unknown>
    const candidates: unknown[] = [
      // Preferred explicit vendor/company owner fields
      reportObj.vendorName,
      reportObj.vendor_name,
      reportObj.vendorCompanyName,
      reportObj.vendor_company_name,
      reportObj.vendorOrganizationName,
      reportObj.vendor_organization_name,
      reportObj.productOwnerVendorName,
      reportObj.product_owner_vendor_name,
      reportObj.createdByVendorName,
      reportObj.created_by_vendor_name,
      reportObj.createdByCompanyName,
      reportObj.created_by_company_name,
      data.vendorName,
      data.vendor_name,
      data.vendorCompanyName,
      data.vendor_company_name,
      data.vendorOrganizationName,
      data.vendor_organization_name,
      data.productOwnerVendorName,
      data.product_owner_vendor_name,
      data.createdByVendorName,
      data.created_by_vendor_name,
      data.createdByCompanyName,
      data.created_by_company_name,
      data.companyName,
      data.company_name,
    ]
    for (const c of candidates) {
      const v = formatReportValue(c)
      if (v !== "—") return v
    }
    // Safe fallback in vendor portal: signed-in org name (vendor org).
    const sessionOrg = formatReportValue(sessionStorage.getItem("organizationName"))
    if (sessionOrg !== "—") return sessionOrg
    // Do not fall back to title parsing: that can show product name instead of vendor name.
    return "—"
  })()
  const contextRatingStyle: React.CSSProperties | undefined = contextMeterColor
    ? {
        borderColor: contextMeterColor,
      }
    : undefined
  const reportLayoutClass = `sec_user_page org_settings_page reports_page report_detail_page report_assessment_layout${
    usePortalStyleUi ? " report_assessment_layout_vendor" : ""
  }`

  return (
    <div className={reportLayoutClass}>
      {/* Header */}
      <header className="report_assessment_header">
        <div className="report_assessment_title_row report_assessment_actions_row">
          <a href="/reports" className="report_assessment_back" onClick={handleBack}>
            <CircleChevronLeft size={20} aria-hidden /> Back to Reports
          </a>
          {!isArchived && showExportPdf && (
            <button
              type="button"
              className="report_detail_export_btn"
              onClick={() => void handleExportPdf()}
              disabled={pdfExporting}
              aria-busy={pdfExporting}
            >
              <Download size={18} aria-hidden /> {pdfExporting ? "Exporting…" : "Export PDF"}
            </button>
          )}
        </div>
      </header>

      <div ref={pdfBodyRef} className="report_detail_body_shell">
        <header className="report_assessment_doc_header">
          <h1 className="report_assessment_title">{title}</h1>
          <p className="report_assessment_subtitle">Analysis Report • {assessmentDate} • AI Generated</p>
        </header>
        {/* Vendor-Side Assessment Context Panel — vendors: score box + short context line (full narrative in Executive Summary only); buyers: preview + approval banner below */}
        <section
          className={`report_context_panel${usePortalStyleUi ? " report_context_panel_vendor_portal" : ""}`}
        >
          <span className="report_context_pill">Customer-Specific Risk Assessment (Vendor-Side)</span>
          <span className="report_context_grade_label">Grade:</span>{" "}
          <div className="report_context_inner">
            <div className="report_context_left">
              <h2 className="report_context_entity">{orgName !== "—" ? orgName : "Customer"}</h2>
              {sector !== "—" ? <p className="report_context_meta">{sector}</p> : null}
              <p className="report_context_vendor">
                <span className="report_context_vendor_pill">Vendor:</span>{" "}
                <span className="report_context_vendor_name">{vendorNameDisplay}</span>
              </p>
              <p className="report_context_desc">
                {usePortalStyleUi
                  ? "Assessment context and risk evaluation for this customer engagement."
                  : contextSummaryPreview.length > 0
                    ? contextSummaryPreview
                    : "Assessment context and risk evaluation for this customer engagement."}
              </p>
            </div>
            <div className="report_context_right">

              {usePortalStyleUi ? (
                <div
                  className="report_context_rating"
                  style={contextRatingStyle}
                  aria-label="Overall assessment grade and alignment score"
                >
                  <span className="report_context_grade" style={{ color: contextMeterColor }}>
                    <span className="report_context_grade_value">{gradeFromOverallRiskScore(overallScore)}</span>
                  </span>
                  <span className="report_context_score">
                    {renderRiskScoreCircle(`${alignmentScoreDisplay}/100`, {
                      color: contextMeterColor,
                      labelFormat: "percent",
                      className: "report_context_score_circle",
                    })}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </section>

      {!usePortalStyleUi && (
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

      <div className="report_deployment_roi_row">
        {/* Deployment Overview — six field cards, single column within this column */}
        <section className="report_section_card">
          <h2 className="report_section_heading">
            <Building2 size={20} aria-hidden /> Deployment Overview
          </h2>
          <div className="report_deployment_grid">
            <div className="report_deployment_item"><span className="report_deployment_label report_deployment_label_use_case"><FileText size={12} className="report_metric_label_icon" aria-hidden />USE CASE</span><span className="report_deployment_value">{formatReportValue(deployment?.useCase || data.expectedOutcomes || data.primaryPainPoint)}</span></div>
            <div className="report_deployment_item"><span className="report_deployment_label report_deployment_label_product_tier"><Layers size={12} className="report_metric_label_icon" aria-hidden />PRODUCT TIER</span><span className="report_deployment_value">{formatReportValue(deployment?.productTier)}</span></div>
            <div className="report_deployment_item"><span className="report_deployment_label report_deployment_label_target_users"><User size={12} className="report_metric_label_icon" aria-hidden />TARGET USERS</span><span className="report_deployment_value">{formatReportValue(deployment?.targetUsers)}</span></div>
            <div className="report_deployment_item"><span className="report_deployment_label report_deployment_label_infra"><Shield size={12} className="report_metric_label_icon" aria-hidden />INFRASTRUCTURE</span><span className="report_deployment_value">{formatReportValue(deployment?.infrastructure || data.integrationComplexity)}</span></div>
            <div className="report_deployment_item"><span className="report_deployment_label report_deployment_label_timeline"><List size={12} className="report_metric_label_icon" aria-hidden />DEPLOYMENT TIMELINE</span><span className="report_deployment_value">{formatReportValue(deployment?.deploymentTimeline || data.implementationTimeline)}</span></div>
            <div className="report_deployment_item"><span className="report_deployment_label report_deployment_label_contract"><TrendingUp size={12} className="report_metric_label_icon" aria-hidden />ANNUAL CONTRACT VALUE</span><span className="report_deployment_value">{formatReportValue(deployment?.annualContractValue || data.customerBudgetRange)}</span></div>
          </div>
        </section>

        {/* ROI Analysis — six metric cards, single column (comparison table is a separate section below) */}
        <section className="report_section_card">
          <h2 className="report_section_heading">
            <TrendingUp size={20} aria-hidden /> ROI Analysis
          </h2>
          {/* <p className="report_roi_heading">{roiAnalysisHeadingText}</p> */}
          <div className="report_roi_grid">
            <div className="report_roi_card">
              <span className="report_roi_label report_roi_label_time_saved"><User size={12} className="report_metric_label_icon" aria-hidden />TIME SAVED PER EMPLOYEE</span>
              <span className="report_roi_value">{formatReportValue(fullReport?.roiAnalysis?.timeSavedPerEmployee)}</span>
              <span className="report_roi_sub">{formatRoiTimeSavedSourceLine(fullReport?.roiAnalysis?.timeSavedSource)}</span>
            </div>
            <div className="report_roi_card">
              <span className="report_roi_label report_roi_label_hours_recovered"><Clock3 size={12} className="report_metric_label_icon" aria-hidden />ANNUAL HOURS RECOVERED</span>
              <span className="report_roi_value">{formatReportValue(fullReport?.roiAnalysis?.annualHoursRecovered)}</span>
              <span className="report_roi_sub">{formatReportValue(fullReport?.roiAnalysis?.annualHoursRecoveredCalculation)}</span>
            </div>
            <div className="report_roi_card">
              <span className="report_roi_label report_roi_label_productivity"><TrendingUp size={12} className="report_metric_label_icon" aria-hidden />PRODUCTIVITY VALUE</span>
              <span className="report_roi_value">{formatReportValue(fullReport?.roiAnalysis?.productivityValue)}</span>
              <span className="report_roi_sub">{formatReportValue(fullReport?.roiAnalysis?.productivityValueCalculation)}</span>
            </div>
            <div className="report_roi_card">
              <span className="report_roi_label report_roi_label_cost"><DollarSign size={12} className="report_metric_label_icon" aria-hidden />ANNUAL COST</span>
              <span className="report_roi_value">
                {formatReportValue(fullReport?.roiAnalysis?.annualCost || deployment?.annualContractValue || data.customerBudgetRange)}
              </span>
              <span className="report_roi_sub">{formatReportValue(fullReport?.roiAnalysis?.annualCostCalculation)}</span>
            </div>
            <div className="report_roi_card">
              <span className="report_roi_label report_roi_label_multiple"><BarChart3 size={12} className="report_metric_label_icon" aria-hidden />ROI MULTIPLE</span>
              <span className="report_roi_value">{formatReportValue(fullReport?.roiAnalysis?.roiMultiple)}</span>
              <span className="report_roi_sub">{formatReportValue(fullReport?.roiAnalysis?.roiMultipleCalculation)}</span>
            </div>
            <div className="report_roi_card">
              <span className="report_roi_label report_roi_label_payback"><Clock3 size={12} className="report_metric_label_icon" aria-hidden />PAYBACK PERIOD</span>
              <span className="report_roi_value">{formatReportValue(fullReport?.roiAnalysis?.paybackPeriod)}</span>
              <span className="report_roi_sub">{formatRoiTimeSavedSourceLine(fullReport?.roiAnalysis?.paybackSource)}</span>
            </div>
          </div>
        </section>
      </div>

      {/* Comparison to Alternatives — same data as ROI appendix, own section (not inside ROI Analysis) */}
      <section className="report_section_card">
        <h2 className="report_section_heading">
          <BarChart3 size={20} aria-hidden /> Comparison to Alternatives
        </h2>
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

      {/* Risk Assessment — catalog risks plus Security Posture as the last table row */}
      <section className="report_section_card">
        <div className="report_risk_assessment_header_row">
          <h2 className="report_section_heading">
            <Shield size={20} aria-hidden /> Risk Assessment
          </h2>
          <span className="report_overall_risk_right">
            <span className="report_overall_risk_score_row">
              <span className="report_overall_risk_score_label">Overall Risk Score</span>
              <span className="report_overall_risk_score_wrap">{renderRiskScoreCircle(`${overallScore}/100`)}</span>
            </span>
            <span
              className={`report_risk_badge ${riskLevelClass(overallLevel)} ${overallRiskBadgeVariantClass(overallLevel)}`}
            >
              {overallLevel}
            </span>
          </span>
        </div>
        <div className="report_table_wrap">
          <table className="report_table report_risk_assessment_table">
            <thead>
              <tr>
                <th scope="col">Risk Type</th>
                <th scope="col">Risk Name</th>
                <th scope="col">Identified Risk</th>
                <th scope="col">Mitigations</th>
                <th scope="col">Residual Risk</th>
                <th scope="col">Risk Score</th>
              </tr>
            </thead>
            <tbody>
              {riskAssessmentRows.map((row) => {
                if (row.kind === "catalog") {
                  const r = row.risk
                  const identified = identifiedRiskLinesForRow(r)
                  const mits = mitigationLinesForRow(r, mitigationsByRiskId)
                  const rowKey = `${r.risk_mapping_id}-${String(r.risk_id ?? "").trim() || row.index}`
                  return (
                    <tr key={rowKey}>
                      <td className="report_risk_assessment_type_cell">
                        <span className="report_risk_assessment_type_text">{riskTypeColumnPrimaryRiskForRow(r)}</span>
                      </td>
                      <td className="report_risk_assessment_name_cell">{riskNameForRow(r)}</td>
                      <td>{renderIdentifiedRiskTableCell(identified)}</td>
                      <td>{renderMitigationsTableCell(mits)}</td>
                      <td>
                        <span className={`report_risk_badge ${riskLevelClass(residualRiskForRow(r))}`}>
                          {residualRiskForRow(r)}
                        </span>
                      </td>
                      <td className="report_risk_assessment_score_cell">
                        {renderRiskScoreCircle(scoreDisplayForRow(r))}
                      </td>
                    </tr>
                  )
                }
                const sp = row.block
                const identifiedSp = securityPostureIdentifiedLines(sp)
                const mitsSp = securityPostureMitigationLines(sp)
                return (
                  <tr key="security-posture">
                    <td className="report_risk_assessment_type_cell">
                      <span className="report_risk_assessment_type_text">{securityPosturePrimaryRiskDisplay(sp)}</span>
                    </td>
                    <td className="report_risk_assessment_name_cell">{securityPostureRiskName(sp)}</td>
                    <td>{renderIdentifiedRiskTableCell(identifiedSp)}</td>
                    <td>{renderMitigationsTableCell(mitsSp)}</td>
                    <td className="report_risk_assessment_security_residual_cell">
                      <span className={`report_risk_badge ${riskLevelClass(securityPostureResidualDisplay(sp))}`}>
                        {securityPostureResidualDisplay(sp)}
                      </span>
                      {/* <p className="report_security_posture_residual_note" role="note">
                        {SECURITY_POSTURE_RESIDUAL_EXPECTATION_NOTE}
                      </p> */}
                    </td>
                    <td className="report_risk_assessment_score_cell">
                      {renderRiskScoreCircle(securityPostureScoreDisplay(sp))}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Compliance Alignment — Met | Pending (same layout as buyer portal recommendations) */}
      <section className="report_section_card report_compliance_recommendations_shell">
        <h2 className="report_section_heading"><Shield size={18} aria-hidden /> Compliance Alignment</h2>
        <p className="report_compliance_summary">{formatReportValue(fullReport?.complianceAlignment?.summary)}</p>
        <div
          className="bvr_reco_priority_table report_compliance_priority_table"
          role="table"
          aria-label="Compliance requirements by status"
        >
          <div className="bvr_reco_priority_head" role="rowgroup">
            <div className="bvr_reco_priority_cell" role="columnheader">
              <span className="bvr_risk_scope_tag bvr_compliance_met_tag">Met</span>
            </div>
            <div className="bvr_reco_priority_cell" role="columnheader">
              <span className="bvr_risk_scope_tag bvr_compliance_pending_tag">Pending</span>
            </div>
          </div>
          <div className="bvr_reco_priority_body" role="rowgroup">
            <div className="bvr_reco_priority_col" role="cell">
              {complianceBuckets.met.length === 0 ? (
                <p className="bvr_reco_empty">No met requirements.</p>
              ) : (
                complianceBuckets.met.map((req, i) => (
                  <article key={`met-${i}`} className="bvr_reco_priority_item">
                    <h3 className="bvr_reco_title">{formatReportValue(req.name)}</h3>
                    <p className="bvr_reco_desc">{formatReportValue(req.description)}</p>
                  </article>
                ))
              )}
            </div>
            <div className="bvr_reco_priority_col" role="cell">
              {complianceBuckets.pending.length === 0 ? (
                <p className="bvr_reco_empty">No pending requirements.</p>
              ) : (
                complianceBuckets.pending.map((req, i) => (
                  <article key={`pending-${i}`} className="bvr_reco_priority_item">
                    <h3 className="bvr_reco_title">{formatReportValue(req.name)}</h3>
                    <p className="bvr_reco_desc">{formatReportValue(req.description)}</p>
                  </article>
                ))
              )}
            </div>
          </div>
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
                            const details = uniqueFrameworkControlDetailsForLinks(
                              parseFrameworkMappingControlsDetail(row.controls),
                            )
                            if (details.length === 0) {
                              return formatReportValue(row.controls)
                            }
                            return (
                              <div className="report_framework_control_ids" role="list">
                                {details.map((c) => (
                                  <button
                                    key={`${String(row.framework)}-${c.controlId}`}
                                    type="button"
                                    className="report_framework_control_id_btn"
                                    role="listitem"
                                    onClick={() => navigateToFrameworkControlDetail(row, c)}
                                    title={`Open control ${c.controlId} in Risk Mapping`}
                                  >
                                    {stripMarkdownBold(c.controlId)}
                                  </button>
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

      {/* Implementation Plan — same 3-column layout as buyer recommendations */}
      <section className="report_section_card bvr_recommendations_card">
        <h2 className="bvr_section_title bvr_title_with_icon">
          <List size={22} className="bvr_title_icon" aria-hidden />
          Implementation Plan
        </h2>
        <p className="bvr_reco_intro">Phased rollout with timelines, activities, and deliverables per phase.</p>
        <div
          className="bvr_reco_priority_table report_impl_plan_table"
          role="table"
          aria-label="Implementation plan by phase"
        >
          <div className="report_impl_plan_chunks">
            {implPhaseChunks.map((chunk, chunkIdx) => {
              const padded = padImplementationPhaseChunk(chunk)
              return (
                <div key={`impl-chunk-${chunkIdx}`} className="report_impl_plan_chunk">
                  <div className="bvr_reco_priority_head report_impl_plan_chunk_head" role="rowgroup">
                    {padded.map((phase, colIdx) => {
                      const globalIdx = chunkIdx * 3 + colIdx
                      const priClass = IMPL_PLAN_HEADER_PRI_CLASSES[colIdx]
                      return (
                        <div
                          key={`impl-h-${chunkIdx}-${colIdx}`}
                          className="bvr_reco_priority_cell"
                          role="columnheader"
                        >
                          {phase ? (
                            <span className={`bvr_risk_scope_tag ${priClass}`}>Phase {globalIdx + 1}</span>
                          ) : null}
                        </div>
                      )
                    })}
                  </div>
                  <div className="report_impl_plan_rows" role="rowgroup">
                    <div className="report_impl_plan_row" role="row">
                      {padded.map((phase, colIdx) => {
                        const globalIdx = chunkIdx * 3 + colIdx
                        return (
                          <div
                            key={`impl-title-${chunkIdx}-${colIdx}`}
                            className={`report_impl_plan_cell${phase ? "" : " report_impl_plan_cell_empty"}`}
                            role="cell"
                          >
                            {phase ? (
                              <h3 className="bvr_reco_title report_impl_plan_title">
                                {formatReportValue(implementationPhaseTitleForDisplay(phase.title, globalIdx))}
                              </h3>
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                    <div className="report_impl_plan_row" role="row">
                      {padded.map((phase, colIdx) => (
                        <div
                          key={`impl-tl-${chunkIdx}-${colIdx}`}
                          className={`report_impl_plan_cell${phase ? "" : " report_impl_plan_cell_empty"}`}
                          role="cell"
                        >
                          {phase ? (
                            <p className="bvr_reco_time report_impl_plan_slot">
                              <strong>Timeline:</strong> {formatReportValue(phase.timeline)}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="report_impl_plan_row" role="row">
                      {padded.map((phase, colIdx) => (
                        <div
                          key={`impl-st-${chunkIdx}-${colIdx}`}
                          className={`report_impl_plan_cell${phase ? "" : " report_impl_plan_cell_empty"}`}
                          role="cell"
                        >
                          {phase ? (
                            <p className="bvr_reco_time report_impl_plan_slot">
                              <strong>Status:</strong>{" "}
                              <span className={`report_pill ${implementationPlanStatusPillClass(phase.status)}`}>
                                {phase.status}
                              </span>
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="report_impl_plan_row report_impl_plan_row_activities" role="row">
                      {padded.map((phase, colIdx) => (
                        <div
                          key={`impl-act-${chunkIdx}-${colIdx}`}
                          className={`report_impl_plan_cell${phase ? "" : " report_impl_plan_cell_empty"}`}
                          role="cell"
                        >
                          {phase ? (
                            <>
                              <p className="bvr_reco_desc report_impl_plan_activities_label">
                                <strong>Activities</strong>
                              </p>
                              <ul className="report_impl_phase_list">
                                {phase.activities?.length ? (
                                  phase.activities.map((a, j) => <li key={j}>{formatReportValue(a)}</li>)
                                ) : (
                                  <li>—</li>
                                )}
                              </ul>
                            </>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="report_impl_plan_row" role="row">
                      {padded.map((phase, colIdx) => (
                        <div
                          key={`impl-del-${chunkIdx}-${colIdx}`}
                          className={`report_impl_plan_cell${phase ? "" : " report_impl_plan_cell_empty"}`}
                          role="cell"
                        >
                          {phase ? (
                            <p className="bvr_reco_desc report_impl_plan_slot">
                              <strong>Deliverables:</strong>{" "}
                              {phase.deliverables?.length
                                ? phase.deliverables.map((d) => formatReportValue(d)).join(", ")
                                : "—"}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* Competitive positioning narrative, then recommendations (buyer-style priority columns) */}
      <section className="report_section_card bvr_recommendations_card">
        <h2 className="bvr_section_title bvr_title_with_icon">
          <BarChart3 size={22} className="bvr_title_icon" aria-hidden />
          Competitive Positioning and Recommendations
        </h2>
        <div className="report_competitive_positioning_block">
          <p className="bvr_exec_text">{competitivePositioningDisplay}</p>
        </div>
        <h3 className="report_recommendations_subheading bvr_title_with_icon">
          <User size={20} className="bvr_title_icon" aria-hidden />
          Recommendations
        </h3>
        {recsWithPriority.length > 0 ? (
          <>
            <p className="bvr_reco_intro">
              Prioritized actions for your organization, grounded in this assessment and the generated complete report
              {orgName !== "—" ? ` (${orgName})` : ""}.
            </p>
            <div className="bvr_reco_priority_table" role="table" aria-label="Recommendations by priority">
              <div className="bvr_reco_priority_head" role="rowgroup">
                <div className="bvr_reco_priority_cell" role="columnheader">
                  <span className="bvr_risk_scope_tag bvr_pri_high">High</span>
                </div>
                <div className="bvr_reco_priority_cell" role="columnheader">
                  <span className="bvr_risk_scope_tag bvr_pri_med">Medium</span>
                </div>
                <div className="bvr_reco_priority_cell" role="columnheader">
                  <span className="bvr_risk_scope_tag bvr_pri_low">Low</span>
                </div>
              </div>
              <div className="bvr_reco_priority_body" role="rowgroup">
                <div className="bvr_reco_priority_col" role="cell">
                  {highRecommendations.length > 0 ? (
                    highRecommendations.map((rec, i) => (
                      <article key={`high-${i}`} className="bvr_reco_priority_item">
                        <h3 className="bvr_reco_title">{formatReportValue(rec.title)}</h3>
                        <p className="bvr_reco_desc">{formatReportValue(rec.description)}</p>
                        <p className="bvr_reco_time">
                          <strong>Timeline:</strong> {formatReportValue(rec.timeline)}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="bvr_reco_empty">—</p>
                  )}
                </div>
                <div className="bvr_reco_priority_col" role="cell">
                  {mediumRecommendations.length > 0 ? (
                    mediumRecommendations.map((rec, i) => (
                      <article key={`medium-${i}`} className="bvr_reco_priority_item">
                        <h3 className="bvr_reco_title">{formatReportValue(rec.title)}</h3>
                        <p className="bvr_reco_desc">{formatReportValue(rec.description)}</p>
                        <p className="bvr_reco_time">
                          <strong>Timeline:</strong> {formatReportValue(rec.timeline)}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="bvr_reco_empty">—</p>
                  )}
                </div>
                <div className="bvr_reco_priority_col" role="cell">
                  {lowRecommendations.length > 0 ? (
                    lowRecommendations.map((rec, i) => (
                      <article key={`low-${i}`} className="bvr_reco_priority_item">
                        <h3 className="bvr_reco_title">{formatReportValue(rec.title)}</h3>
                        <p className="bvr_reco_desc">{formatReportValue(rec.description)}</p>
                        <p className="bvr_reco_time">
                          <strong>Timeline:</strong> {formatReportValue(rec.timeline)}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p className="bvr_reco_empty">—</p>
                  )}
                </div>
              </div>
            </div>
          </>
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

      {/* Risk catalog (when present) + appendix reference cards */}
      <section
        className={`report_section_card report_appendix${appendixRiskTableRows.length > 0 ? " report_appendix_has_risk_catalog" : ""}`}
      >
        <h2 className="report_section_heading">
          {appendixRiskTableRows.length > 0 ? (
            <>
              <FileText size={20} aria-hidden />
              Risk catalog and Appendix
            </>
          ) : (
            <>
              <FileText size={20} aria-hidden />
              Appendix
            </>
          )}
        </h2>
        {appendixRiskTableRows.length > 0 ? (
          <>
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
        {appendixRiskTableRows.length > 0 ? (
          <h3 className="report_appendix_appendix_heading">
            <FileText size={18} aria-hidden />
            Appendix
          </h3>
        ) : null}
        <div className="report_appendix_cards">
          <article className="report_appendix_card">
            <h4 className="report_appendix_card_title report_appendix_card_title_methodology">
              <Layers size={14} aria-hidden />
              Methodology
            </h4>
            <div className="report_appendix_card_body">
              {formatReportValue(fullReport?.appendix?.methodology) !== "—"
                ? formatReportValue(fullReport?.appendix?.methodology)
                : "AI EVAL 3-Layer Risk Assessment Framework v2.1 — Customer-Specific Analysis"}
            </div>
          </article>
          <article className="report_appendix_card">
            <h4 className="report_appendix_card_title report_appendix_card_title_prepared">
              <User size={14} aria-hidden />
              Prepared By
            </h4>
            <div className="report_appendix_card_body">
              {formatReportValue(fullReport?.appendix?.preparedBy) !== "—"
                ? formatReportValue(fullReport?.appendix?.preparedBy)
                : "AI EVAL Platform — Automated Analysis Report Engine"}
            </div>
          </article>
          <article className="report_appendix_card">
            <h4 className="report_appendix_card_title report_appendix_card_title_reviewed">
              <CheckCircle2 size={14} aria-hidden />
              Reviewed By
            </h4>
            <div className="report_appendix_card_body">{formatReportValue(fullReport?.appendix?.reviewedBy)}</div>
          </article>
          <article className="report_appendix_card">
            <h4 className="report_appendix_card_title report_appendix_card_title_confidentiality">
              <Shield size={14} aria-hidden />
              Confidentiality
            </h4>
            <div className="report_appendix_card_body">
              {formatReportValue(fullReport?.appendix?.confidentiality) !== "—"
                ? formatReportValue(fullReport?.appendix?.confidentiality)
                : "Confidential — For internal sales team use only"}
            </div>
          </article>
          <article className="report_appendix_card report_appendix_card_wide">
            <h4 className="report_appendix_card_title report_appendix_card_title_sources">
              <BarChart3 size={14} aria-hidden />
              Data Sources
            </h4>
            <div className="report_appendix_card_body">
              <ul className="report_appendix_card_list">
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
            </div>
          </article>
        </div>
      </section>
      </div>
    </div>
  )
}
