import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  AlertTriangle,
  BarChart2,
  Boxes,
  Briefcase,
  Building2,
  CalendarCheck,
  CheckCircle2,
  CircleChevronLeft,
  Download,
  FileCheck,
  Layers,
  ListChecks,
  PieChart,
  Rocket,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  Users2,
  Workflow,
} from "lucide-react";
import LoadingMessage from "../../UI/LoadingMessage";
import { getReportTypeDisplayLabel } from "./reportTypes";
import VendorComparisonMatrixReportBody, {
  parseVendorComparisonMatrixJson,
} from "./VendorComparisonMatrixReportBody";
import ComplianceRiskSummaryReportBody, {
  parseComplianceRiskSummaryJson,
} from "./ComplianceRiskSummaryReportBody";
import ImplementationRiskAssessmentReportBody, {
  parseImplementationRiskAssessmentJson,
} from "./ImplementationRiskAssessmentReportBody";
import MitigationActionPlanReportBody, {
  parseMitigationActionPlanJson,
} from "./MitigationActionPlanReportBody";
import "../UserManagement/user_management.css";
import "./reports.css";

const BASE_URL = import.meta.env.VITE_BASE_URL ?? "http://localhost:5003/api/v1";

interface GeneratedReportItem {
  id: string;
  assessmentId: string;
  assessmentLabel: string;
  reportType: string;
  generatedAt: string;
  /** Stored general report body: markdown for most types, or JSON (string or parsed) for Vendor Comparison Matrix. */
  briefContent?: string | Record<string, unknown>;
  expiryAt?: string | null;
  attestationExpiryAt?: string | null;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/\s+/g, "-");
  } catch {
    return "—";
  }
}

function sanitizeFileName(s: string): string {
  return s.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, "-").slice(0, 80);
}

/** Parsed section of the Executive Stakeholder Brief (e.g. "16. 3-sentence business case"). */
interface BriefSection {
  title: string;
  body: string;
}

/** Executive brief + Sales report section: match by number prefix or by heading text so icons apply even if LLM drops numbers. */
const BRIEF_SECTION_DISPLAY: Array<{ pattern: RegExp | string; displayTitle: string; Icon: React.ComponentType<{ size?: number; className?: string }> }> = [
  /* Sales Qualification Report (11–15) – content-only headings from LLM */
  { pattern: /^qualification\s*(?:decision|\+\s*rationale)/i, displayTitle: "Qualification", Icon: CheckCircle2 },
  { pattern: /^qualification\b/i, displayTitle: "Qualification", Icon: CheckCircle2 },
  { pattern: /^score\s+summary\b/i, displayTitle: "Score summary", Icon: BarChart2 },
  { pattern: /^score\s+breakdown\b/i, displayTitle: "Score breakdown", Icon: PieChart },
  { pattern: /^top\s+blockers\b/i, displayTitle: "Top blockers", Icon: AlertTriangle },
  { pattern: /^recommended\s+actions\b/i, displayTitle: "Recommended actions", Icon: ListChecks },
  /* Executive Stakeholder Brief (16–21) – content-only headings from LLM */
  { pattern: /^3-sentence\s+business\s+case\b/i, displayTitle: "Business Use Case", Icon: Briefcase },
  { pattern: /^risk\s+snapshot\b/i, displayTitle: "Risk snapshot", Icon: ShieldAlert },
  { pattern: /^compliance\s+snapshot\b/i, displayTitle: "Compliance snapshot", Icon: FileCheck },
  { pattern: /^deployment\s+approach\b/i, displayTitle: "Deployment approach", Icon: Rocket },
  { pattern: /^roi\/value\s+assumptions\b/i, displayTitle: "ROI/value assumptions", Icon: TrendingUp },
  { pattern: /^decision\s+request\b/i, displayTitle: "Decision request + suggested timeline", Icon: CalendarCheck },
  /* Customer Risk Mitigation Plan (22–27) – content-only headings from LLM */
  { pattern: /^customer\s+context\b/i, displayTitle: "Customer context", Icon: Building2 },
  { pattern: /^top\s+risks\b/i, displayTitle: "Top risks", Icon: ShieldAlert },
  { pattern: /^mitigations\s+per\s+risk\b/i, displayTitle: "Mitigations per risk", Icon: ShieldCheck },
  { pattern: /^ownership\s+matrix\b/i, displayTitle: "Ownership matrix", Icon: Users2 },
  { pattern: /^phasing\b/i, displayTitle: "Phasing", Icon: Layers },
  { pattern: /^validation\s+criteria\s+per\s+mitigation\b|^validation\s+criteria\b/i, displayTitle: "Validation criteria per mitigation", Icon: CheckCircle2 },
  /* Implementation Roadmap Proposal (28–33) – icons match section headings */
  { pattern: /^28\.\s*(.+)?$/i, displayTitle: "Target deployment model + high-level architecture summary", Icon: Boxes },
  { pattern: /^target\s+deployment\s+model\b|high-level\s+architecture\b/i, displayTitle: "Target deployment model + high-level architecture summary", Icon: Boxes },
  { pattern: /^29\.\s*(.+)?$/i, displayTitle: "Phases with goals", Icon: Layers },
  { pattern: /^phases\b|pilot.*production/i, displayTitle: "Phases with goals", Icon: Layers },
  { pattern: /^30\.\s*(.+)?$/i, displayTitle: "Integrations & data flow", Icon: Workflow },
  { pattern: /^integrations\s+checklist\b|data\s+flow\b/i, displayTitle: "Integrations & data flow", Icon: Workflow },
  { pattern: /^31\.\s*(.+)?$/i, displayTitle: "Resources", Icon: Users2 },
  { pattern: /^resources\b|vendor.*customer\s+roles\b/i, displayTitle: "Resources", Icon: Users2 },
  { pattern: /^32\.\s*(.+)?$/i, displayTitle: "Risk gates", Icon: ShieldCheck },
  { pattern: /^risk\s+gates\b/i, displayTitle: "Risk gates", Icon: ShieldCheck },
  { pattern: /^33\.\s*(.+)?$/i, displayTitle: "Timeline", Icon: CalendarCheck },
  { pattern: /^timeline\s+estimate\b|assumptions\b/i, displayTitle: "Timeline", Icon: CalendarCheck },
];

/** Strip leading "1." "2." "11." etc. from section heading text. */
function stripSectionNumber(title: string): string {
  return title.replace(/^\s*\d+\.\s*/, "").trim() || title;
}

function getBriefSectionDisplay(title: string): { displayTitle: string; Icon: React.ComponentType<{ size?: number; className?: string }> } {
  const trimmed = title.trim();
  /** Also match with leading "N. " stripped so "1. Qualification..." matches content patterns. */
  const titleNoNumber = stripSectionNumber(trimmed) || trimmed;
  for (const { pattern, displayTitle, Icon } of BRIEF_SECTION_DISPLAY) {
    const matched =
      typeof pattern === "string"
        ? trimmed === pattern || titleNoNumber === pattern
        : pattern.test(trimmed) || pattern.test(titleNoNumber);
    if (matched) return { displayTitle, Icon };
  }
  return { displayTitle: titleNoNumber || trimmed, Icon: FileCheck };
}

/** Parse brief content into sections by ## headings. */
function parseBriefContent(briefContent: string): BriefSection[] {
  const sections: BriefSection[] = [];
  const lines = briefContent.split(/\r?\n/);
  let currentTitle = "";
  let currentBody: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      if (currentTitle) {
        sections.push({
          title: currentTitle,
          body: currentBody.join("\n").trim(),
        });
      }
      currentTitle = headingMatch[1].trim();
      currentBody = [];
    } else {
      currentBody.push(line);
    }
  }
  if (currentTitle) {
    sections.push({
      title: currentTitle,
      body: currentBody.join("\n").trim(),
    });
  }
  return sections.length > 0 ? sections : [{ title: "Brief", body: briefContent }];
}

/** Remove "[Assumption]" from executive brief body text for display. */
function stripAssumptionLabel(text: string): string {
  return text.replace(/\s*\[Assumption\]\s*/gi, " ").replace(/\s*\[assumption\]\s*/gi, " ").trim();
}

/** Remove leading "1. " "2. " etc. from Sales Qualification Report body lines. */
function stripNumberedPrefix(text: string): string {
  return text.replace(/^\s*\d+\.\s*/, "").trim();
}

function isTopBlockersSectionTitle(title: string): boolean {
  return /^top\s+blockers\b/i.test(stripSectionNumber(title));
}

function isTopRisksSectionTitle(title: string): boolean {
  return /^top\s+risks\b/i.test(stripSectionNumber(title));
}

function severityClassName(sev: string): string {
  const s = String(sev ?? "").trim().toLowerCase();
  if (s.startsWith("high")) return "report_severity_high";
  if (s.startsWith("medium")) return "report_severity_medium";
  if (s.startsWith("low")) return "report_severity_low";
  return "report_severity_unknown";
}

function parseTopBlockerLine(
  line: string,
): { main: string; severity?: string; likelihood?: string; impact?: string; evidence?: string } {
  const bulletless = stripAssumptionLabel(line.trim().replace(/^\s*[-*]\s+/, "")).replace(/\*\*/g, "");
  const severityMatch = bulletless.match(/(?:^|\s)Severity:\s*([^|]+?)(?=\s+[|–—-]\s+(?:Likelihood:|Impact:|Evidence:)|\s+Evidence:|$)/i);
  const likelihoodMatch = bulletless.match(/(?:^|\s)Likelihood:\s*([^|–—-]+?)(?=\s+[|–—-]\s+Impact:|\s+Evidence:|$)/i);
  const impactMatch = bulletless.match(/(?:^|\s)Impact:\s*([^|]+?)(?=\s+[|–—-]\s+Severity:|\s+Evidence:|$)/i);
  const evidenceMatch = bulletless.match(/(?:^|\s)Evidence:\s*(.+)$/i);
  const severity = severityMatch?.[1]?.trim().replace(/\s*[|–—-]\s*$/, "");
  const likelihood = likelihoodMatch?.[1]?.trim().replace(/\s*[|–—-]\s*$/, "");
  const impact = impactMatch?.[1]?.trim().replace(/\s*[|–—-]\s*$/, "");
  const evidence = evidenceMatch?.[1]?.trim();

  let main = bulletless;
  main = main.replace(/\s*Severity:\s*[^|]+?(?=\s+Evidence:|$)/i, "").trim();
  main = main.replace(/\s*[|–—-]\s*Severity:\s*[^|]+?(?=\s+Evidence:|$)/i, "").trim();
  main = main.replace(/\s*Likelihood:\s*[^|–—-]+?(?=\s+[|–—-]\s+Impact:|\s+Evidence:|$)/i, "").trim();
  main = main.replace(/\s*[|–—-]\s*Impact:\s*[^|]+?(?=\s+Evidence:|$)/i, "").trim();
  main = main.replace(/\s*Impact:\s*[^|]+?(?=\s+Evidence:|$)/i, "").trim();
  main = main.replace(/\s*[|–—-]\s*Severity:\s*[^|]+?(?=\s+Evidence:|$)/i, "").trim();
  main = main.replace(/\s*Evidence:\s*.+$/i, "").trim();
  main = main.replace(/\s*[|–—-]\s*$/, "").trim();
  return { main: main || bulletless, severity, likelihood, impact, evidence };
}

/** Render a line of body: support **bold** and bullet lines. */
function renderBriefLine(
  line: string,
  key: string,
  stripNumbers = false,
  sectionTitle = "",
): React.ReactNode {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const bullet = /^\s*[-*]\s+/.test(line);
  if (bullet && (isTopBlockersSectionTitle(sectionTitle) || isTopRisksSectionTitle(sectionTitle))) {
    const { main, severity, likelihood, impact, evidence } = parseTopBlockerLine(line);
    const isBlocker = isTopBlockersSectionTitle(sectionTitle);
    const labelRegex = isBlocker ? /^blocker:\s*/i : /^risk:\s*/i;
    const prefixMatch = main.match(labelRegex);
    const label = prefixMatch?.[0]?.trim() ?? "";
    const body = prefixMatch ? main.slice(prefixMatch[0].length).trim() : main;
    return (
      <li key={key} className="report_exec_brief_bullet report_blocker_item report_risk_like_item">
        <div className="report_blocker_main">
          {prefixMatch ? (
            <>
              <strong>{label}</strong>{body ? ` ${body}` : ""}
            </>
          ) : (
            main
          )}
        </div>
        {(severity || likelihood || impact || evidence) ? (
          <div className="report_blocker_meta">
            {severity ? (
              <span className="report_blocker_metric">
                Severity: <span className={`report_blocker_metric_value ${severityClassName(severity)}`}>{severity}</span>
              </span>
            ) : null}
            {likelihood ? (
              <span className="report_blocker_metric">
                Likelihood: <span className={`report_blocker_metric_value ${severityClassName(likelihood)}`}>{likelihood}</span>
              </span>
            ) : null}
            {impact ? (
              <span className="report_blocker_metric">
                Impact: <span className={`report_blocker_metric_value ${severityClassName(impact)}`}>{impact}</span>
              </span>
            ) : null}
            {evidence ? (
              <span className="report_blocker_evidence">Evidence: {evidence}</span>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  }
  const parts: React.ReactNode[] = [];
  let remaining = trimmed.replace(/^\s*[-*]\s+/, "");
  remaining = stripAssumptionLabel(remaining);
  if (stripNumbers) remaining = stripNumberedPrefix(remaining);
  const boldRegex = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = boldRegex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      parts.push(remaining.slice(lastIndex, match.index));
    }
    parts.push(<strong key={`${key}-b-${match.index}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < remaining.length) {
    parts.push(remaining.slice(lastIndex));
  }
  const content = parts.length > 0 ? parts : remaining;
  if (bullet) {
    return <li key={key} className="report_exec_brief_bullet">{content}</li>;
  }
  return <p key={key} className="report_exec_brief_para">{content}</p>;
}

function renderBriefBody(
  body: string,
  sectionKey: string,
  stripNumbers = false,
  sectionTitle = "",
): React.ReactNode {
  const lines = body.split(/\r?\n/).filter((l) => l.trim() !== "" || l.includes("\n"));
  const items: React.ReactNode[] = [];
  const listItems: React.ReactNode[] = [];
  let inList = false;

  lines.forEach((line, i) => {
    const key = `${sectionKey}-${i}`;
    const isBullet = /^\s*[-*]\s+/.test(line);
    if (isBullet) {
      if (!inList && listItems.length > 0) {
        const listClass = (isTopBlockersSectionTitle(sectionTitle) || isTopRisksSectionTitle(sectionTitle))
          ? "report_exec_brief_list report_blocker_list"
          : "report_exec_brief_list";
        items.push(<ul key={`${key}-ul`} className={listClass}>{listItems.slice()}</ul>);
        listItems.length = 0;
      }
      inList = true;
      listItems.push(renderBriefLine(line, key, stripNumbers, sectionTitle));
    } else {
      if (inList && listItems.length > 0) {
        const listClass = (isTopBlockersSectionTitle(sectionTitle) || isTopRisksSectionTitle(sectionTitle))
          ? "report_exec_brief_list report_blocker_list"
          : "report_exec_brief_list";
        items.push(<ul key={`${key}-ul`} className={listClass}>{listItems.slice()}</ul>);
        listItems.length = 0;
        inList = false;
      }
      const node = renderBriefLine(line, key, stripNumbers, sectionTitle);
      if (node) items.push(node);
    }
  });
  if (listItems.length > 0) {
    const listClass = (isTopBlockersSectionTitle(sectionTitle) || isTopRisksSectionTitle(sectionTitle))
      ? "report_exec_brief_list report_blocker_list"
      : "report_exec_brief_list";
    items.push(<ul key={`${sectionKey}-ul-end`} className={listClass}>{listItems.slice()}</ul>);
  }
  return items.length > 0 ? <>{items}</> : <p className="report_exec_brief_para">{body}</p>;
}

const LOADER_MIN_MS = 2500;

function isSystemUserRole(): boolean {
  const role = (sessionStorage.getItem("systemRole") ?? "").toLowerCase().trim().replace(/_/g, " ");
  return role === "system admin" || role === "system manager" || role === "system viewer";
}

function generalReportTabTitle(report: Pick<GeneratedReportItem, "assessmentLabel" | "reportType">): string {
  const typeLabel = getReportTypeDisplayLabel(String(report.reportType ?? "").trim());
  return typeLabel || "Report";
}

function GeneralReportDetail() {
  const { reportId } = useParams<{ reportId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const reportTitleFromNavState =
    ((location.state as { reportTitle?: string } | null)?.reportTitle ?? "").trim();
  const cachedTitleKey = reportId ? `generalReportTitle:${reportId}` : "";
  const cachedReportTitle =
    cachedTitleKey ? (sessionStorage.getItem(cachedTitleKey) ?? "").trim() : "";
  const showDownload = !isSystemUserRole();
  const [report, setReport] = useState<GeneratedReportItem | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = reportId?.trim();
    if (!id) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const token = sessionStorage.getItem("bearerToken");
    if (!token) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const loadStart = Date.now();
    const finishLoading = () => {
      const elapsed = Date.now() - loadStart;
      const remaining = Math.max(0, LOADER_MIN_MS - elapsed);
      setTimeout(() => setLoading(false), remaining);
    };
    fetch(`${BASE_URL}/generalReports/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) {
          setReport(null);
          setNotFound(true);
          finishLoading();
          return;
        }
        return res.json();
      })
      .then((data) => {
        if (data?.success && data?.data) {
          const d = data.data;
          setReport({
            id: d.id,
            assessmentId: d.assessmentId,
            assessmentLabel: d.assessmentLabel ?? "",
            reportType: d.reportType,
            generatedAt: d.generatedAt,
            briefContent: d.briefContent,
            expiryAt: d.expiryAt ?? null,
            attestationExpiryAt: d.attestationExpiryAt ?? null,
          });
          setNotFound(false);
        } else {
          setReport(null);
          setNotFound(true);
        }
        finishLoading();
      })
      .catch(() => {
        setReport(null);
        setNotFound(true);
        finishLoading();
      });
  }, [reportId]);

  useEffect(() => {
    if (loading) {
      const loadingTitle = cachedReportTitle || "Report";
      document.title = `AI-Q | ${loadingTitle}`;
      return () => { document.title = "AI-Q"; };
    }
    if (notFound || !report) {
      document.title = "AI-Q | Report not found";
      return () => { document.title = "AI-Q"; };
    }
    const resolvedTitle = generalReportTabTitle(report);
    document.title = `AI-Q | ${resolvedTitle}`;
    if (cachedTitleKey) {
      sessionStorage.setItem(cachedTitleKey, resolvedTitle);
    }
    return () => { document.title = "AI-Q"; };
  }, [loading, notFound, report, reportTitleFromNavState, cachedReportTitle, cachedTitleKey]);

  const handleBack = (e: React.MouseEvent) => {
    e.preventDefault();
    navigate("/reports", { state: { tab: "general" } });
  };

  const handleDownload = () => {
    if (!report) return;
    const dateStr = formatDate(report.generatedAt);
    const vcm =
      report.reportType === "Vendor Comparison Matrix"
        ? parseVendorComparisonMatrixJson(report.briefContent)
        : null;
    const ira =
      report.reportType === "Implementation Risk Assessment"
        ? parseImplementationRiskAssessmentJson(report.briefContent)
        : null;
    const map =
      report.reportType === "Mitigation Action Plan"
        ? parseMitigationActionPlanJson(report.briefContent)
        : null;
    const crs =
      report.reportType === "Compliance & Risk Summary"
        ? parseComplianceRiskSummaryJson(report.briefContent)
        : null;
    const bodyContent =
      ira != null
        ? JSON.stringify(ira, null, 2)
        : map != null
        ? JSON.stringify(map, null, 2)
        : crs != null
        ? JSON.stringify(crs, null, 2)
        : vcm != null
        ? JSON.stringify(vcm, null, 2)
        : typeof report.briefContent === "string"
          ? report.briefContent
          : report.briefContent != null
            ? JSON.stringify(report.briefContent, null, 2)
            : "This report was generated from the Reports Library. Full report content can be viewed in the application.";
    const reportTypeLabel = getReportTypeDisplayLabel(report.reportType);
    const content = [
      "General Report",
      "—",
      `Assessment: ${report.assessmentLabel}`,
      `Report type: ${reportTypeLabel}`,
      `Generated: ${dateStr}`,
      "",
      bodyContent,
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeFileName(report.assessmentLabel)}-${sanitizeFileName(reportTypeLabel)}-${dateStr.replace(/\//g, "-")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="sec_user_page org_settings_page reports_page report_detail_page report_detail_type_general">
        <LoadingMessage message="Loading report…" />
      </div>
    );
  }

  if (notFound || !report) {
    return (
      <div className="sec_user_page org_settings_page reports_page report_detail_page report_detail_type_general">
        <div className="report_detail_empty">
          <h2 className="report_detail_empty_title">Report not found</h2>
          <p className="report_detail_empty_text">
            This report does not exist or may have been cleared. Return to the
            Reports Library to generate a new report.
          </p>
          <a
            href="/reports"
            className="report_assessment_back report_detail_empty_back"
            onClick={(e) => {
              e.preventDefault();
              navigate("/reports", { state: { tab: "general" } });
            }}
          >
            <CircleChevronLeft size={20} />
            Back to Reports
          </a>
        </div>
      </div>
    );
  }

  const generatedDate = formatDate(report.generatedAt);

  const isAssessmentExpired =
    report.expiryAt != null &&
    String(report.expiryAt).trim() !== "" &&
    !Number.isNaN(new Date(report.expiryAt).getTime()) &&
    new Date(report.expiryAt).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
  const isAttestationExpired =
    report.attestationExpiryAt != null &&
    String(report.attestationExpiryAt).trim() !== "" &&
    !Number.isNaN(new Date(report.attestationExpiryAt).getTime()) &&
    new Date(report.attestationExpiryAt).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
  const isArchived = isAssessmentExpired || isAttestationExpired;

  const vendorComparisonMatrixData =
    report.reportType === "Vendor Comparison Matrix"
      ? parseVendorComparisonMatrixJson(report.briefContent)
      : null;

  const complianceRiskSummaryData =
    report.reportType === "Compliance & Risk Summary"
      ? parseComplianceRiskSummaryJson(report.briefContent)
      : null;

  const implementationRiskAssessmentData =
    report.reportType === "Implementation Risk Assessment"
      ? parseImplementationRiskAssessmentJson(report.briefContent)
      : null;

  const mitigationActionPlanData =
    report.reportType === "Mitigation Action Plan"
      ? parseMitigationActionPlanJson(report.briefContent)
      : null;

  return (
    <div className="sec_user_page org_settings_page reports_page report_detail_page report_detail_full report_detail_type_general">
      <header className="report_assessment_header">
        <a
          href="/reports"
          className="report_assessment_back"
          onClick={handleBack}
        >
          <CircleChevronLeft size={20} />
          Back to Reports
        </a>
        <div className="report_assessment_title_row">
          <h1 className="report_detail_title report_assessment_title">{getReportTypeDisplayLabel(report.reportType)}</h1>
          {!isArchived && showDownload && (
            <button
              type="button"
              className="report_detail_export_btn"
              onClick={handleDownload}
              aria-label="Download report"
            >
              <Download size={18} aria-hidden />
              Download
            </button>
          )}
        </div>
        <p className="report_assessment_subtitle report_detail_subtitle">
          {report.assessmentLabel} • {generatedDate}
        </p>
        {isArchived && report.reportType === "Vendor Comparison Matrix" ? (
          <p
            className="report_assessment_subtitle"
            style={{ color: "#92400e", marginTop: "0.5rem" }}
            role="status"
          >
            This assessment is archived; this matrix snapshot is read-only.
          </p>
        ) : null}
        {isArchived && report.reportType === "Compliance & Risk Summary" ? (
          <p
            className="report_assessment_subtitle"
            style={{ color: "#92400e", marginTop: "0.5rem" }}
            role="status"
          >
            This assessment is archived; this summary snapshot is read-only.
          </p>
        ) : null}
        {isArchived && report.reportType === "Implementation Risk Assessment" ? (
          <p
            className="report_assessment_subtitle"
            style={{ color: "#92400e", marginTop: "0.5rem" }}
            role="status"
          >
            This assessment is archived; this assessment snapshot is read-only.
          </p>
        ) : null}
        {isArchived && report.reportType === "Mitigation Action Plan" ? (
          <p
            className="report_assessment_subtitle"
            style={{ color: "#92400e", marginTop: "0.5rem" }}
            role="status"
          >
            This assessment is archived; this plan snapshot is read-only.
          </p>
        ) : null}
      </header>
{/* 
      <section className="report_section_card general_report_info_card">
        <h2 className="report_section_heading">Report information</h2>
        <dl className="report_detail_dl report_detail_info_grid">
          <div className="report_detail_row">
            <dt className="report_detail_dt">Vendor assessment</dt>
            <dd className="report_detail_dd">{report.assessmentLabel}</dd>
          </div>
          <div className="report_detail_row">
            <dt className="report_detail_dt">Report type</dt>
            <dd className="report_detail_dd">{report.reportType}</dd>
          </div>
          <div className="report_detail_row">
            <dt className="report_detail_dt">Generated date</dt>
            <dd className="report_detail_dd">{generatedDate}</dd>
          </div>
          <div className="report_detail_row">
            <dt className="report_detail_dt">Status</dt>
            <dd className="report_detail_dd">
              <span className="report_status_badge report_status_completed">
                Generated
              </span>
            </dd>
          </div>
        </dl>
      </section> */}

      <section className="">
        {/* <h2 className="report_section_heading">
          {implementationRiskAssessmentData
            ? "Implementation Risk Assessment"
            : mitigationActionPlanData
              ? "Mitigation Action Plan"
              : complianceRiskSummaryData
                ? "Compliance & Risk Summary"
                : vendorComparisonMatrixData
                  ? "Vendor Comparison Matrix"
                  : report.briefContent
                    ? getReportTypeDisplayLabel(report.reportType)
                    : "Summary"}
        </h2> */}
        {implementationRiskAssessmentData ? (
          <div className="report_summary_body">
            <ImplementationRiskAssessmentReportBody data={implementationRiskAssessmentData} />
          </div>
        ) : report.reportType === "Implementation Risk Assessment" ? (
          <p className="report_summary_body">
            Implementation Risk Assessment data is missing or could not be read. Try generating the report
            again from Assessment Analysis.
          </p>
        ) : mitigationActionPlanData ? (
          <div className="report_summary_body">
            <MitigationActionPlanReportBody data={mitigationActionPlanData} />
          </div>
        ) : report.reportType === "Mitigation Action Plan" ? (
          <p className="report_summary_body">
            Mitigation Action Plan data is missing or could not be read. Try generating the report again from
            Assessment Analysis.
          </p>
        ) : complianceRiskSummaryData ? (
          <div className="report_summary_body">
            <ComplianceRiskSummaryReportBody data={complianceRiskSummaryData} />
          </div>
        ) : report.reportType === "Compliance & Risk Summary" ? (
          <p className="report_summary_body">
            Compliance &amp; Risk Summary data is missing or could not be read. Try generating the report
            again from Assessment Analysis.
          </p>
        ) : vendorComparisonMatrixData ? (
          <div className="report_summary_body">
            <VendorComparisonMatrixReportBody data={vendorComparisonMatrixData} />
          </div>
        ) : report.reportType === "Vendor Comparison Matrix" ? (
          <p className="report_summary_body">
            Vendor Comparison Matrix data is missing or could not be read. Try generating the report
            again from Assessment Analysis.
          </p>
        ) : typeof report.briefContent === "string" && report.briefContent.trim() !== "" ? (
          <div className="report_summary_body report_exec_brief_body">
            {parseBriefContent(report.briefContent).map((section, idx) => {
              const { displayTitle, Icon } = getBriefSectionDisplay(section.title);
              return (
                <div key={idx} className="report_exec_brief_section report_section_card">
                  <h3 className="report_exec_brief_section_title">
                    <Icon size={20} className="report_exec_brief_section_icon" aria-hidden />
                    {displayTitle}
                  </h3>
                  <div className="report_exec_brief_section_body">
                    {renderBriefBody(
                      section.body,
                      `sec-${idx}`,
                      report.reportType === "Sales Qualification Report" ||
                        report.reportType === "Qualification" ||
                        report.reportType === "Customer Risk Mitigation Plan" ||
                        report.reportType === "Implementation Roadmap Proposal",
                      section.title,
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="report_summary_body">
            This is a general report generated for the selected vendor
            assessment. Use the Download button above to save a copy. For
            assessment-specific risk reports, use the Assessment Analysis tab in
            the Reports Library.
          </p>
        )}
      </section>
    </div>
  );
}

export default GeneralReportDetail;
