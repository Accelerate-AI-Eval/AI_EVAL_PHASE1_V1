import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import {
  CheckCircle2,
  AlertTriangle,
  ClipboardList,
  User,
  Download,
  Loader2,
  CircleChevronLeft,
} from "lucide-react";
import LoadingMessage from "../../../UI/LoadingMessage";
import "../../Reports/reports.css";
import "./buyer_vendor_risk_report.css";

const BASE_URL =
  import.meta.env.VITE_BASE_URL ?? "http://localhost:5003/api/v1";

type Recommendation = {
  priority: string;
  title: string;
  description: string;
  timeline: string;
};

type RiskScope = "vendor" | "buyer" | "both";

type RiskDomain = {
  domain: string;
  riskScore: number;
  summary: string;
  /** From DB / report JSON; legacy rows omit → grouped under Shared risk */
  riskScope?: RiskScope;
};

type RiskAnalysisSectionConfig = { scope: RiskScope; title: string; tagClass: string };

/** Buyer portal: Risk Analysis shows buyer-scoped and shared domains only. */
const RISK_ANALYSIS_DISPLAY_SECTIONS_BUYER: RiskAnalysisSectionConfig[] = [
  { scope: "buyer", title: "Buyer risk", tagClass: "bvr_risk_tag_buyer" },
  { scope: "both", title: "Shared risk", tagClass: "bvr_risk_tag_shared" },
];

/** Vendor portal: buyer-, vendor-, and shared-scoped risk domains. */
const RISK_ANALYSIS_DISPLAY_SECTIONS_VENDOR: RiskAnalysisSectionConfig[] = [
  { scope: "buyer", title: "Buyer risk", tagClass: "bvr_risk_tag_buyer" },
  { scope: "vendor", title: "Vendor risk", tagClass: "bvr_risk_tag_vendor" },
  { scope: "both", title: "Shared risk", tagClass: "bvr_risk_tag_shared" },
];

function groupRiskDomainsByScope(rows: RiskDomain[]): Record<RiskScope, RiskDomain[]> {
  const buckets: Record<RiskScope, RiskDomain[]> = {
    vendor: [],
    buyer: [],
    both: [],
  };
  for (const r of rows) {
    const s = r.riskScope;
    if (s === "vendor" || s === "buyer") buckets[s].push(r);
    else buckets.both.push(r);
  }
  return buckets;
}

type ReportPayload = {
  overallRiskScore: number;
  implementationRiskScore?: number;
  implementationRiskClassification?: string;
  implementationRiskDecision?: string;
  implementationRiskRecommendedAction?: string;
  implementationRiskBreakdown?: {
    vendorRisk?: number;
    organizationalReadinessGap?: number;
    integrationRisk?: number;
    vendorTrustScore?: number;
  };
  recommendationLabel: string;
  executiveSummary: string;
  keyStrengths: string[];
  areasForImprovement: string[];
  riskAnalysis: RiskDomain[];
  recommendations: Recommendation[];
  implementationNotes: string;
  generatedAt?: string;
};

export default function BuyerVendorRiskReport() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [productName, setProductName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [report, setReport] = useState<ReportPayload | null>(null);
  const [archived, setArchived] = useState(false);

  const load = useCallback(async () => {
    if (!assessmentId) return;
    const token = sessionStorage.getItem("bearerToken");
    if (!token) {
      setError("Please log in.");
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(
        `${BASE_URL.replace(/\/$/, "")}/buyerCotsAssessment/${encodeURIComponent(assessmentId)}/vendor-risk-report`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.message || "Could not load report");
        setLoading(false);
        return;
      }
      setVendorName(String(data.vendorName ?? ""));
      setProductName(String(data.productName ?? ""));
      setOrgName(String(data.organizationName ?? ""));
      setArchived(Boolean(data.archived));
      if (data.reportUnavailable) {
        setPending(false);
        setReport(null);
        setError(
          String(
            data.message ??
              "This assessment has expired and no archived vendor comparison report is available.",
          ),
        );
      } else if (data.pending) {
        setPending(true);
        setReport(null);
      } else if (data.report && typeof data.report === "object") {
        setPending(false);
        setReport(data.report as ReportPayload);
      } else {
        setError("Report data unavailable");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!pending || !assessmentId) return;
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      if (n > 45) {
        clearInterval(t);
        setPending(false);
        setError(
          "Report is taking longer than expected. Open this page again later or from Reports.",
        );
        return;
      }
      load();
    }, 3000);
    return () => clearInterval(t);
  }, [pending, assessmentId, load]);

  const title =
    vendorName && productName
      ? `${vendorName} – ${productName}`
      : productName || vendorName || "Report";

  const formattedDate = report?.generatedAt
    ? new Date(report.generatedAt).toLocaleDateString(undefined, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : new Date().toLocaleDateString(undefined, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      });

  const handleExportPdf = () => window.print();

  const implementationRiskScore = Number(report?.implementationRiskScore ?? NaN);
  const hasImplementationScore = Number.isFinite(implementationRiskScore);
  const score = hasImplementationScore
    ? implementationRiskScore
    : report?.overallRiskScore ?? 0;
  const scoreClass = hasImplementationScore
    ? score < 50
      ? "bvr_score_high"
      : score < 75
        ? "bvr_score_mid"
        : "bvr_score_low"
    : score >= 80
      ? "bvr_score_high"
      : score >= 60
        ? "bvr_score_mid"
        : "bvr_score_low";

  if (loading && !report && !error) {
    return (
      <div className="bvr_page">
        <LoadingMessage message="Loading your report…" />
      </div>
    );
  }

  if (pending && !report) {
    return (
      <div className="bvr_page">
        <div className="bvr_pending">
          <Loader2 className="bvr_pending_icon" size={40} aria-hidden />
          <h1>Generating your report</h1>
          <p>
            Your report is being created from your answers and the vendor&apos;s
            attestation. This may take up to a minute.
          </p>
        </div>
      </div>
    );
  }

  if (error && !report) {
    return (
      <div className="bvr_page">
        <div className="bvr_error">{error}</div>
        <Link
          to="/reports"
          state={{ tab: "assessment" as const }}
          className="report_assessment_back"
        >
          <CircleChevronLeft size={20} aria-hidden /> Back to Reports
        </Link>
      </div>
    );
  }

  if (!report) return null;

  const riskByScope = groupRiskDomainsByScope(report.riskAnalysis ?? []);
  const systemRole = (sessionStorage.getItem("systemRole") ?? "")
    .toLowerCase()
    .trim()
    .replace(/_/g, " ");
  const riskAnalysisSections =
    systemRole === "vendor" ? RISK_ANALYSIS_DISPLAY_SECTIONS_VENDOR : RISK_ANALYSIS_DISPLAY_SECTIONS_BUYER;

  return (
    <div className="bvr_page">
      <header className="bvr_header no-print">
        <Link
          to="/reports"
          state={{ tab: "assessment" as const }}
          className="report_assessment_back"
        >
          <CircleChevronLeft size={20} aria-hidden /> Back to Reports
        </Link>
        <button type="button" className="bvr_export_btn" onClick={handleExportPdf}>
          <Download size={18} aria-hidden />
          Export PDF
        </button>
      </header>

      <article className="bvr_document">
        <header className="bvr_doc_header">
          <div>
            <h1 className="bvr_doc_title">{title}</h1>
            <p className="bvr_doc_meta">
              Vendor assessment
              {orgName ? ` • ${orgName}` : ""} • {formattedDate}
              <span className="bvr_ai_badge">AI Generated</span>
            </p>
          </div>
        </header>

        {archived ? (
          <div className="bvr_archived_banner no-print" role="status">
            This assessment has expired. The report below is an archived snapshot for your records.
          </div>
        ) : null}

        <section className={`bvr_card bvr_recommendation ${scoreClass}`}>
          <div className="bvr_score_circle">
            {hasImplementationScore ? Math.round(implementationRiskScore) : score}
          </div>
          <div>
            <h2 className="bvr_recommendation_title">
              {hasImplementationScore
                ? (report.implementationRiskDecision ?? "Implementation Risk")
                : report.recommendationLabel}
            </h2>
            <p className="bvr_recommendation_sub">
              {hasImplementationScore
                ? `Implementation risk score: ${Math.round(score)}/100 (lower is safer)`
                : `Overall risk score: ${score}/100 (higher indicates stronger alignment / lower residual risk)`}
            </p>
          </div>
        </section>

        <section className="bvr_card">
          <h2 className="bvr_section_title">Executive Summary</h2>
          <p className="bvr_exec_text">{report.executiveSummary}</p>
        </section>

        <section className="bvr_card">
          <h2 className="bvr_section_title">Key Strengths</h2>
          <div className="bvr_strengths_grid">
            {(report.keyStrengths ?? []).map((s, i) => (
              <div key={i} className="bvr_strength_item">
                <CheckCircle2 className="bvr_strength_icon" size={20} aria-hidden />
                <span>{s}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="bvr_card bvr_warnings_card">
          <h2 className="bvr_section_title">Areas for Improvement</h2>
          <ul className="bvr_warnings_list">
            {(report.areasForImprovement ?? []).map((w, i) => (
              <li key={i} className="bvr_warning_item">
                <AlertTriangle className="bvr_warning_icon" size={20} aria-hidden />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="bvr_card">
          <h2 className="bvr_section_title">Risk Analysis</h2>
          {riskAnalysisSections.map(({ scope, title, tagClass }) => {
            const list = riskByScope[scope];
            if (list.length === 0) return null;
            return (
              <div key={scope} className="bvr_risk_scope_block">
                <div className="bvr_risk_scope_banner">
                  <span className={`bvr_risk_scope_tag ${tagClass}`}>{title}</span>
                </div>
                <div className="bvr_risk_grid">
                  {list.map((r, i) => (
                    <div key={`${scope}-${i}-${r.domain}`} className="bvr_risk_block">
                      <div className="bvr_risk_head">
                        <h4 className="bvr_risk_domain_title">{r.domain}</h4>
                        <span className="bvr_risk_badge">Risk: {r.riskScore}/10</span>
                      </div>
                      <p className="bvr_risk_summary">{r.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        <section className="bvr_card bvr_recommendations_card">
          <h2 className="bvr_section_title bvr_title_with_icon">
            <User size={22} className="bvr_title_icon" aria-hidden />
            Buyer recommendations
          </h2>
          <p className="bvr_reco_intro">
            Prioritized actions for your organization, grounded in your assessment and the vendor
            attestation
            {vendorName ? ` (${vendorName}` : ""}
            {productName ? ` — ${productName})` : vendorName ? ")" : ""}.
          </p>
          <ul className="bvr_recommendations_list">
            {(report.recommendations ?? []).map((rec, i) => {
              const p = (rec.priority ?? "Medium").toLowerCase();
              const pc =
                p === "high" ? "bvr_pri_high" : p === "low" ? "bvr_pri_low" : "bvr_pri_med";
              return (
                <li key={i} className="bvr_recommendation_row">
                  <span className={`bvr_priority_pill ${pc}`}>{rec.priority}</span>
                  <div className="bvr_reco_body">
                    <h3 className="bvr_reco_title">{rec.title}</h3>
                    <p className="bvr_reco_desc">{rec.description}</p>
                    <p className="bvr_reco_time">
                      <strong>Timeline:</strong> {rec.timeline}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="bvr_card bvr_impl_card">
          <h2 className="bvr_section_title bvr_title_with_icon">
            <ClipboardList size={22} className="bvr_title_icon" aria-hidden />
            Implementation Notes
          </h2>
          <p className="bvr_impl_text">{report.implementationNotes}</p>
        </section>
      </article>
    </div>
  );
}
