import { ShieldAlert } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import Select from "../../UI/Select";
import "./MyVendors.css";

const BASE_URL = import.meta.env.VITE_BASE_URL ?? "http://localhost:5003/api/v1";

type AssessmentRow = {
  assessmentId: number | string;
  status?: string | null;
  type?: string | null;
  expiryAt?: string | null;
  customerOrganizationName?: string | null;
  product_in_scope?: string | null;
  productInScope?: string | null;
  vendorName?: string | null;
  productName?: string | null;
};

type RiskTab = "risk_register" | "framework_mappings" | "gap_analysis";

type AssessmentDetail = {
  assessmentId?: string | number;
  assessmentLabel?: string;
  vendorName?: string;
  productName?: string;
  identifiedRisks?: unknown;
  riskMitigation?: unknown;
  riskDomainScores?: unknown;
  updatedAt?: string;
};

type RiskItem = {
  id: string;
  severity: "low" | "medium" | "critical/high";
  status: "open" | "mitigated";
  title: string;
  description: string;
  owner: string;
  progressPercent: number;
  date: string;
};

type CompleteReportRiskDomain = {
  domain?: string;
  riskScore?: number;
  summary?: string;
  riskScope?: "vendor" | "buyer" | "both";
};

type DbMatchedRisk = {
  risk_mapping_id?: number;
  risk_id?: string | null;
  risk_title?: string | null;
  description?: string | null;
  domains?: string | null;
};

type DbMitigation = {
  mitigation_action_name?: string;
  mitigation_definition?: string | null;
  mitigation_category?: string;
  mitigation_action_id?: string;
  mitigation_summary_points?: string[];
};

type FrameworkMappingRow = {
  framework?: unknown;
  coverage?: unknown;
  controls?: unknown;
  notes?: unknown;
};

function readIsVendorPortal(): boolean {
  return (sessionStorage.getItem("systemRole") ?? "").trim().toLowerCase() === "vendor";
}

/** Vendor complete report: merge catalog appendix into dbTop5 rows for titles/descriptions. */
function vendorReportToRiskMappings(storedReport: Record<string, unknown>): {
  top5Risks: DbMatchedRisk[];
  mitigationsByRiskId: Record<string, DbMitigation[]>;
} {
  const dbTop = storedReport.dbTop5Risks as
    | { top5Risks?: DbMatchedRisk[]; mitigationsByRiskId?: Record<string, DbMitigation[]> }
    | undefined;
  const rawTop = Array.isArray(dbTop?.top5Risks) ? dbTop!.top5Risks! : [];
  const mitigationsByRiskId =
    dbTop?.mitigationsByRiskId && typeof dbTop.mitigationsByRiskId === "object"
      ? { ...dbTop.mitigationsByRiskId }
      : {};

  const generated = storedReport.generatedAnalysis as { fullReport?: Record<string, unknown> } | undefined;
  const appendix = generated?.fullReport?.appendix as Record<string, unknown> | undefined;
  const catalog = Array.isArray(appendix?.catalogRisksAndMitigations)
    ? (appendix.catalogRisksAndMitigations as Array<{
        risk_id?: string;
        risk_title?: string;
        risk_domain?: string;
        mitigation_action_names?: string[];
      }>)
    : [];
  const byRiskId = new Map(
    catalog.map((c) => [String(c.risk_id ?? "").trim(), c] as const).filter(([id]) => id !== ""),
  );

  const top5Risks = rawTop.map((r) => {
    const rid = String(r.risk_id ?? "").trim();
    const cat = rid ? byRiskId.get(rid) : undefined;
    const summaryPts = Array.isArray((r as { summary_points?: unknown }).summary_points)
      ? ((r as { summary_points: string[] }).summary_points ?? []).filter((s) => String(s).trim())
      : [];
    const title =
      String(r.risk_title ?? cat?.risk_title ?? "").trim() ||
      (summaryPts[0] ? String(summaryPts[0]) : "") ||
      rid ||
      "";
    const descFromSummary = summaryPts.length > 1 ? summaryPts.slice(1).join(" ") : summaryPts[0] ?? "";
    const description =
      String(r.description ?? "").trim() ||
      descFromSummary ||
      (cat?.risk_domain ? `Domain: ${cat.risk_domain}` : "");
    return {
      ...r,
      risk_id: rid || r.risk_id,
      risk_title: title || r.risk_title,
      description: description || r.description,
      domains: (r as { domains?: string }).domains ?? cat?.risk_domain,
    } as DbMatchedRisk;
  });

  return { top5Risks, mitigationsByRiskId };
}

function vendorReportFrameworkRows(storedReport: Record<string, unknown>): FrameworkMappingRow[] {
  const generated = storedReport.generatedAnalysis as { fullReport?: Record<string, unknown> } | undefined;
  const rows = generated?.fullReport?.frameworkMapping as { rows?: FrameworkMappingRow[] } | undefined;
  return Array.isArray(rows?.rows) ? rows.rows : [];
}

function formatFrameworkCell(v: unknown): string {
  if (v == null) return "—";
  const s = String(v).trim();
  return s || "—";
}

function isAssessmentExpired(row: AssessmentRow): boolean {
  const expiryAt = row.expiryAt;
  if (expiryAt == null || String(expiryAt).trim() === "") return false;
  const expiry = new Date(expiryAt);
  if (Number.isNaN(expiry.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return expiry.getTime() < today.getTime();
}

function getAssessmentLabel(a: AssessmentRow): string {
  const org = (a.customerOrganizationName ?? "").toString().trim();
  const productInScope = (a.product_in_scope ?? a.productInScope ?? "").toString().trim();
  if (org && productInScope) return `${org} and ${productInScope}`;
  if (org) return org;
  if (productInScope) return productInScope;
  const product = (a.productName ?? "").toString().trim();
  const vendor = (a.vendorName ?? "").toString().trim();
  if (product && vendor) return `${product} - ${vendor}`;
  if (product) return product;
  if (vendor) return vendor;
  return `Assessment #${String(a.assessmentId)}`;
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((x) => String(x).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return [];
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x).trim()).filter(Boolean);
    } catch {
      // Ignore parse errors and use delimiter-based split fallback.
    }
    return s
      .split(/\r?\n|;|,/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

function severityFromDomainScores(raw: unknown, idx: number): RiskItem["severity"] {
  const values = parseList(raw);
  const maybeNum = Number(values[idx]?.match(/\d+(\.\d+)?/)?.[0] ?? "");
  if (Number.isFinite(maybeNum)) {
    if (maybeNum >= 8) return "critical/high";
    if (maybeNum >= 5) return "medium";
    return "low";
  }
  return idx % 3 === 0 ? "critical/high" : idx % 3 === 1 ? "medium" : "low";
}

function toDateLabel(iso: string | undefined): string {
  if (!iso) return new Date().toISOString().slice(0, 10);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function buildRiskItems(
  detail: AssessmentDetail | null,
  completeReportRiskAnalysis: CompleteReportRiskDomain[],
  dbTop5Risks: DbMatchedRisk[],
  dbMitigationsByRiskId: Record<string, DbMitigation[]>,
): RiskItem[] {
  if (completeReportRiskAnalysis.length > 0) {
    const today = toDateLabel(undefined);
    return completeReportRiskAnalysis.map((risk, idx) => {
      const score = Number(risk.riskScore ?? 0);
      const severity: RiskItem["severity"] =
        score >= 7 ? "critical/high" : score >= 4 ? "medium" : "low";
      return {
        id: `RA${String(idx + 1).padStart(3, "0")}`,
        severity,
        status: score <= 3 ? "mitigated" : "open",
        title: String(risk.domain ?? `Risk Domain ${idx + 1}`),
        description: String(risk.summary ?? "No summary available."),
        owner: "Risk Team",
        progressPercent: score <= 3 ? 100 : score <= 5 ? 75 : 50,
        date: today,
      };
    });
  }
  if (dbTop5Risks.length > 0) {
    const today = toDateLabel(undefined);
    return dbTop5Risks.map((risk, idx) => {
      const rid = String(risk.risk_id ?? "").trim();
      const mitigations = rid ? dbMitigationsByRiskId[rid] ?? [] : [];
      const mitigationText =
        mitigations.length > 0
          ? mitigations
              .map((m) => {
                const pts = Array.isArray(m.mitigation_summary_points)
                  ? m.mitigation_summary_points!.map((p) => String(p).trim()).filter(Boolean).join("; ")
                  : "";
                const name = String(m.mitigation_action_name ?? "").trim();
                const def = String(m.mitigation_definition ?? "").trim();
                const base = `${name}${def ? ` - ${def}` : ""}`.trim();
                return pts || base;
              })
              .filter(Boolean)
              .join("; ")
          : "Mitigation action pending refinement.";
      const mitigated = mitigations.length > 0;
      return {
        id: rid || `AI${String(idx + 1).padStart(3, "0")}`,
        severity: severityFromDomainScores(detail?.riskDomainScores, idx),
        status: mitigated ? "mitigated" : "open",
        title: String(risk.risk_title ?? `Risk ${idx + 1}`).trim(),
        description: String(risk.description ?? mitigationText).trim() || mitigationText,
        owner: "Risk Team",
        progressPercent: mitigated ? 75 : 50,
        date: today,
      };
    });
  }
  if (!detail) return [];
  const identified = parseList(detail.identifiedRisks);
  const mitigations = parseList(detail.riskMitigation);
  const date = toDateLabel(detail.updatedAt);
  return identified.map((title, idx) => {
    const mitigation = mitigations[idx] ?? "Mitigation action pending refinement.";
    const mitigated = /complete|closed|done|mitigated/i.test(mitigation);
    return {
      id: `AI${String(idx + 1).padStart(3, "0")}`,
      severity: severityFromDomainScores(detail.riskDomainScores, idx),
      status: mitigated ? "mitigated" : "open",
      title,
      description: mitigation,
      owner: "Risk Team",
      progressPercent: mitigated ? 100 : 50,
      date,
    };
  });
}

const MyVendors = () => {
  const [isVendorPortal, setIsVendorPortal] = useState(() => readIsVendorPortal());
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);
  const [vendorAssessmentIdsWithReport, setVendorAssessmentIdsWithReport] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedAssessmentId, setSelectedAssessmentId] = useState("");
  const [activeTab, setActiveTab] = useState<RiskTab>("risk_register");
  const [assessmentDetail, setAssessmentDetail] = useState<AssessmentDetail | null>(null);
  const [completeReportRiskAnalysis, setCompleteReportRiskAnalysis] = useState<CompleteReportRiskDomain[]>([]);
  const [dbTop5Risks, setDbTop5Risks] = useState<DbMatchedRisk[]>([]);
  const [dbMitigationsByRiskId, setDbMitigationsByRiskId] = useState<Record<string, DbMitigation[]>>({});
  const [vendorFrameworkRows, setVendorFrameworkRows] = useState<FrameworkMappingRow[]>([]);

  useEffect(() => {
    setIsVendorPortal(readIsVendorPortal());
  }, []);

  useEffect(() => {
    document.title = "AI Eval | Risk Mapping";
    return () => {
      document.title = "AI Eval";
    };
  }, []);

  const completedActiveAssessmentOptions = useMemo(() => {
    if (isVendorPortal) {
      const rows = assessments.filter((a) => {
        const status = String(a.status ?? "").toLowerCase().trim();
        const type = String(a.type ?? "").toLowerCase().trim();
        const id = String(a.assessmentId);
        return (
          type === "cots_vendor" &&
          status !== "draft" &&
          !isAssessmentExpired(a) &&
          vendorAssessmentIdsWithReport.has(id)
        );
      });
      return rows.map((a) => ({
        value: String(a.assessmentId),
        label: getAssessmentLabel(a),
      }));
    }
    const rows = assessments.filter((a) => {
      const status = String(a.status ?? "").toLowerCase().trim();
      const type = String(a.type ?? "").toLowerCase().trim();
      return type === "cots_buyer" && status !== "draft" && !isAssessmentExpired(a);
    });
    return rows.map((a) => ({
      value: String(a.assessmentId),
      label: getAssessmentLabel(a),
    }));
  }, [assessments, isVendorPortal, vendorAssessmentIdsWithReport]);

  useEffect(() => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token) return;
    fetch(`${BASE_URL}/assessments?all=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const list = Array.isArray(data?.data?.assessments) ? (data.data.assessments as AssessmentRow[]) : [];
        setAssessments(list);
      })
      .catch(() => setAssessments([]));
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token || !isVendorPortal) {
      setVendorAssessmentIdsWithReport(new Set());
      return;
    }
    const controller = new AbortController();
    fetch(`${BASE_URL}/customerRiskReports`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (controller.signal.aborted) return;
        const reports = Array.isArray(data?.data?.reports) ? data.data.reports : [];
        const ids = new Set<string>();
        for (const r of reports) {
          const aid = r?.assessmentId != null ? String(r.assessmentId).trim() : "";
          if (aid) ids.add(aid);
        }
        setVendorAssessmentIdsWithReport(ids);
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setVendorAssessmentIdsWithReport(new Set());
      });
    return () => controller.abort();
  }, [isVendorPortal]);

  useEffect(() => {
    if (isVendorPortal && activeTab === "gap_analysis") {
      setActiveTab("risk_register");
    }
  }, [isVendorPortal, activeTab]);

  useEffect(() => {
    if (completedActiveAssessmentOptions.length === 0) {
      setSelectedAssessmentId("");
      return;
    }
    const valid = completedActiveAssessmentOptions.some((o) => o.value === selectedAssessmentId);
    if (!selectedAssessmentId || !valid) {
      setSelectedAssessmentId(completedActiveAssessmentOptions[0].value);
    }
  }, [selectedAssessmentId, completedActiveAssessmentOptions]);

  useEffect(() => {
    if (!isVendorPortal) return;
    const token = sessionStorage.getItem("bearerToken");
    if (!token || !selectedAssessmentId) {
      setAssessmentDetail(null);
      setCompleteReportRiskAnalysis([]);
      setDbTop5Risks([]);
      setDbMitigationsByRiskId({});
      setVendorFrameworkRows([]);
      return;
    }
    const currentAssessmentId = selectedAssessmentId;
    const controller = new AbortController();
    fetch(
      `${BASE_URL}/customerRiskReports?assessmentId=${encodeURIComponent(currentAssessmentId)}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      },
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (controller.signal.aborted) return;
        const reports = Array.isArray(data?.data?.reports) ? data.data.reports : [];
        const first = reports[0];
        const blob = first?.report != null && typeof first.report === "object" ? (first.report as Record<string, unknown>) : null;
        if (!blob) {
          setAssessmentDetail({
            assessmentId: currentAssessmentId,
            assessmentLabel: completedActiveAssessmentOptions.find((o) => o.value === currentAssessmentId)?.label,
          });
          setCompleteReportRiskAnalysis([]);
          setDbTop5Risks([]);
          setDbMitigationsByRiskId({});
          setVendorFrameworkRows([]);
          return;
        }
        const { top5Risks, mitigationsByRiskId } = vendorReportToRiskMappings(blob);
        setCompleteReportRiskAnalysis([]);
        setDbTop5Risks(top5Risks);
        setDbMitigationsByRiskId(mitigationsByRiskId);
        setVendorFrameworkRows(vendorReportFrameworkRows(blob));
        const createdAt = first?.createdAt != null ? String(first.createdAt) : undefined;
        setAssessmentDetail({
          assessmentId: currentAssessmentId,
          assessmentLabel: completedActiveAssessmentOptions.find((o) => o.value === currentAssessmentId)?.label,
          vendorName: String(blob.customerOrganizationName ?? "").trim() || undefined,
          productName: undefined,
          identifiedRisks: blob.identifiedRisks,
          riskMitigation: blob.riskMitigation,
          riskDomainScores: blob.riskDomainScores,
          updatedAt: createdAt,
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setAssessmentDetail(null);
        setCompleteReportRiskAnalysis([]);
        setDbTop5Risks([]);
        setDbMitigationsByRiskId({});
        setVendorFrameworkRows([]);
      });
    return () => controller.abort();
  }, [selectedAssessmentId, isVendorPortal, completedActiveAssessmentOptions]);

  useEffect(() => {
    if (isVendorPortal) return;
    const token = sessionStorage.getItem("bearerToken");
    if (!token || !selectedAssessmentId) {
      setAssessmentDetail(null);
      setCompleteReportRiskAnalysis([]);
      return;
    }
    const currentAssessmentId = selectedAssessmentId;
    const controller = new AbortController();
    fetch(`${BASE_URL}/buyerCotsAssessment/${encodeURIComponent(currentAssessmentId)}/vendor-risk-report`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data?.success && data?.report && typeof data.report === "object") {
          const d = data.report as Record<string, unknown>;
          const reportRiskAnalysis = Array.isArray(d.riskAnalysis)
            ? (d.riskAnalysis as CompleteReportRiskDomain[]).filter((r) => {
                const s = String(r.riskScope ?? "").toLowerCase();
                return s !== "vendor";
              })
            : [];
          setCompleteReportRiskAnalysis(reportRiskAnalysis);
          setAssessmentDetail({
            assessmentId: currentAssessmentId,
            assessmentLabel: completedActiveAssessmentOptions.find((o) => o.value === currentAssessmentId)?.label,
            vendorName: (data.vendorName as string | undefined) ?? "",
            productName: (data.productName as string | undefined) ?? "",
            identifiedRisks: d.riskAnalysis,
            riskMitigation: d.recommendations,
            riskDomainScores: d.riskAnalysis,
            updatedAt: (d.generatedAt as string | undefined) ?? undefined,
          });
        } else {
          setAssessmentDetail(null);
          setCompleteReportRiskAnalysis([]);
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setAssessmentDetail(null);
        setCompleteReportRiskAnalysis([]);
      });
    return () => controller.abort();
  }, [selectedAssessmentId, completedActiveAssessmentOptions, isVendorPortal]);

  useEffect(() => {
    if (isVendorPortal) return;
    const token = sessionStorage.getItem("bearerToken");
    if (!token || !selectedAssessmentId) {
      setDbTop5Risks([]);
      setDbMitigationsByRiskId({});
      return;
    }
    const currentAssessmentId = selectedAssessmentId;
    const controller = new AbortController();
    fetch(`${BASE_URL}/buyerCotsAssessment/${encodeURIComponent(currentAssessmentId)}/risk-mappings`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data?.success && data?.data) {
          const top5 = Array.isArray(data.data.top5Risks) ? (data.data.top5Risks as DbMatchedRisk[]) : [];
          const mitigations =
            data.data.mitigationsByRiskId && typeof data.data.mitigationsByRiskId === "object"
              ? (data.data.mitigationsByRiskId as Record<string, DbMitigation[]>)
              : {};
          setDbTop5Risks(top5);
          setDbMitigationsByRiskId(mitigations);
        } else {
          setDbTop5Risks([]);
          setDbMitigationsByRiskId({});
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setDbTop5Risks([]);
        setDbMitigationsByRiskId({});
      });
    return () => controller.abort();
  }, [selectedAssessmentId, isVendorPortal]);

  const riskItems = useMemo(
    () => buildRiskItems(assessmentDetail, completeReportRiskAnalysis, dbTop5Risks, dbMitigationsByRiskId),
    [assessmentDetail, completeReportRiskAnalysis, dbTop5Risks, dbMitigationsByRiskId],
  );
  const riskStats = useMemo(() => {
    const total = riskItems.length;
    const criticalHigh = riskItems.filter((r) => r.severity === "critical/high").length;
    const mitigated = riskItems.filter((r) => r.status === "mitigated").length;
    const open = riskItems.filter((r) => r.status === "open").length;
    return { total, criticalHigh, mitigated, open };
  }, [riskItems]);

  return (
    <div className="sec_user_page org_settings_page">
      <div className="org_settings_header page_header_align">
        <div className="risk_mapping_header_row">
          <div className="org_settings_headers page_header_row risk_mapping_header_left">
            <span className="icon_size_header" aria-hidden>
              <ShieldAlert size={24} className="header_icon_svg" />
            </span>
            <div className="page_header_title_block">
              <h1 className="org_settings_title page_header_title">Risk & Controls</h1>
              <p className="org_settings_subtitle page_header_subtitle">
                {isVendorPortal
                  ? "Risk register and framework mapping from your generated analysis reports"
                  : "Risk register, framework mappings, and gap analysis per assessment"}
              </p>
            </div>
          </div>
          <div className="risk_mapping_header_select">
            <Select
              id="risk_mapping_assessment"
              name="risk_mapping_assessment"
              ariaLabel="Assessment"
              value={selectedAssessmentId}
              default_option={
                isVendorPortal
                  ? "Select assessment with a complete report"
                  : "Select completed active assessment"
              }
              options={completedActiveAssessmentOptions}
              onChange={(e) => setSelectedAssessmentId(e.target.value)}
            />
          </div>
        </div>
      </div>
      <div className="page_tabs" role="tablist" aria-label="Risk mapping views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "risk_register"}
          onClick={() => setActiveTab("risk_register")}
          className={`page_tab ${activeTab === "risk_register" ? "page_tab_active" : ""}`}
        >
          Risk Register
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "framework_mappings"}
          onClick={() => setActiveTab("framework_mappings")}
          className={`page_tab ${activeTab === "framework_mappings" ? "page_tab_active" : ""}`}
        >
          Framework Mappings
        </button>
        {!isVendorPortal ? (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "gap_analysis"}
            onClick={() => setActiveTab("gap_analysis")}
            className={`page_tab ${activeTab === "gap_analysis" ? "page_tab_active" : ""}`}
          >
            Gap Analysis
          </button>
        ) : null}
      </div>
      {activeTab === "risk_register" ? (
        <>
            <section className="risk_mapping_stats_grid">
              <div className="risk_mapping_stat_card">
                <p className="risk_mapping_stat_label">Total Risks</p>
                <p className="risk_mapping_stat_value">{riskStats.total}</p>
              </div>
              <div className="risk_mapping_stat_card">
                <p className="risk_mapping_stat_label risk_mapping_stat_label_critical">Critical/High</p>
                <p className="risk_mapping_stat_value risk_mapping_stat_value_critical">{riskStats.criticalHigh}</p>
              </div>
              <div className="risk_mapping_stat_card">
                <p className="risk_mapping_stat_label risk_mapping_stat_label_mitigated">Mitigated</p>
                <p className="risk_mapping_stat_value risk_mapping_stat_value_mitigated">{riskStats.mitigated}</p>
              </div>
              <div className="risk_mapping_stat_card">
                <p className="risk_mapping_stat_label risk_mapping_stat_label_open">Open</p>
                <p className="risk_mapping_stat_value risk_mapping_stat_value_open">{riskStats.open}</p>
              </div>
            </section>
            <section className="risk_mapping_panel risk_mapping_panel_compact">
              <h3 className="risk_mapping_panel_title">
                Risk Register - {assessmentDetail?.assessmentLabel ?? "Selected Assessment"}
              </h3>
              <p className="risk_mapping_panel_subtitle">
                Identified risks, owners, and mitigation status.
              </p>
              {riskItems.length === 0 ? (
                <p className="risk_mapping_empty_text">No identified risks were found for this assessment.</p>
              ) : (
                <div className="risk_mapping_risk_list">
                  {riskItems.map((risk) => (
                    <div key={risk.id} className="risk_mapping_risk_card">
                      <div className="risk_mapping_risk_top">
                        <div className="risk_mapping_chip_row">
                          <span className="risk_mapping_chip risk_mapping_chip_id">{risk.id}</span>
                          <span
                            className={`risk_mapping_chip ${
                              risk.severity === "critical/high"
                                ? "risk_mapping_chip_critical"
                                : risk.severity === "medium"
                                  ? "risk_mapping_chip_medium"
                                  : "risk_mapping_chip_low"
                            }`}
                          >
                            {risk.severity}
                          </span>
                          <span
                            className={`risk_mapping_chip ${
                              risk.status === "open" ? "risk_mapping_chip_open" : "risk_mapping_chip_mitigated"
                            }`}
                          >
                            {risk.status}
                          </span>
                        </div>
                        <span className="risk_mapping_meta">{risk.date}</span>
                      </div>
                      <h4 className="risk_mapping_risk_title">{risk.title}</h4>
                      <p className="risk_mapping_risk_desc">{risk.description}</p>
                      <div className="risk_mapping_risk_footer">
                        <span className="risk_mapping_owner">{risk.owner}</span>
                        <div className="risk_mapping_progress_wrap">
                          <div className="risk_mapping_progress_track">
                            <div className="risk_mapping_progress_fill" style={{ width: `${risk.progressPercent}%` }} />
                          </div>
                          <span className="risk_mapping_progress_label">{risk.progressPercent}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : activeTab === "framework_mappings" ? (
          <section className="risk_mapping_panel">
            {isVendorPortal ? (
              <>
                <h3 className="risk_mapping_panel_title" style={{ marginBottom: "0.75rem" }}>
                  Framework mapping — {assessmentDetail?.assessmentLabel ?? "Selected assessment"}
                </h3>
                <div className="risk_mapping_table_wrap">
                  <table className="risk_mapping_table">
                    <thead>
                      <tr>
                        <th>Framework</th>
                        <th>Coverage</th>
                        <th>Controls</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendorFrameworkRows.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="risk_mapping_empty_text">
                            No framework mapping rows in the complete report for this assessment.
                          </td>
                        </tr>
                      ) : (
                        vendorFrameworkRows.map((row, i) => (
                          <tr key={i}>
                            <td>{formatFrameworkCell(row.framework)}</td>
                            <td>{formatFrameworkCell(row.coverage)}</td>
                            <td>{formatFrameworkCell(row.controls)}</td>
                            <td>{formatFrameworkCell(row.notes)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="risk_mapping_empty_text">
                Framework Mappings view for the selected assessment.
              </p>
            )}
          </section>
        ) : (
          <section className="risk_mapping_panel">
            <p className="risk_mapping_empty_text">
              Gap Analysis view for the selected assessment.
            </p>
          </section>
        )}
    </div>
  );
};

export default MyVendors;
