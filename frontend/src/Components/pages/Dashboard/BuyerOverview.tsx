import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FileText,
  FileCheck,
  ClipboardCheck,
  Building2,
  ChevronDown,
  ChevronRight,
  Eye,
  Sparkles,
  Workflow,
} from "lucide-react";
import LoadingMessage from "../../UI/LoadingMessage";
import DashboardFeatureCard from "../../UI/DashboardFeatureCard";
import DashboardStatCard from "../../UI/DashboardStatCard";
import type { AssessmentRow } from "./types";
import { BASE_URL, formatGovDate, getAssessmentLabel } from "./utils";
import { formatFrameworkMappingFrameworkForDisplay } from "../../../utils/frameworkMappingFrameworkDisplay";
import { frameworkControlsDisplayLines } from "../../../utils/frameworkMappingControlsDisplay";
import DashboardTypewriterGreeting from "../../UI/DashboardTypewriterGreeting";
import "./dashboard.css";
import "../UserManagement/user_management.css";

type RiskFrequency = { label: string; count: number; riskIds: string[] };
type DomainShare = { primaryRisk: string; domainName: string; percentage: number };
type AssessmentReportMeta = {
  reportId: string;
  /** Overall / headline risk score from complete report JSON (0–100). */
  score: number | null;
  /** Buyer vendor risk report (assess-3) implementation risk score (0–100). */
  implementationRiskScore: number | null;
  summary: string | null;
};
type SelectedAssessmentSnapshot = {
  implementationRiskScore: number | null;
  overallRiskScore: number | null;
  executiveSummary: string | null;
};
type FrameworkMappingRow = {
  riskId: string;
  riskCategory: string;
  frameworkControl: string;
  mitigationIds: string[];
};

function getStaticFrameworkControl(riskCategory: string): string {
  const c = riskCategory.toLowerCase();
  if (c.includes("privacy") || c.includes("leak")) {
    return "NIST PR.DS-1, EU Art. 10 (Data governance)";
  }
  if (c.includes("bias") || c.includes("fairness")) {
    return "NIST MEASURE 2.1, EU Art. 13 (Transparency)";
  }
  if (c.includes("cyber") || c.includes("security") || c.includes("resilience")) {
    return "NIST MAP 1.5, EU Art. 15 (Cybersecurity)";
  }
  return "Framework mapping available in risk register";
}

/** Join distinct framework names from buyer risk-mappings `frameworkMappingRows` (same as org portal / report). */
function frameworkTypesFromBuyerMappingRows(rows: unknown): string {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const names = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const label = formatFrameworkMappingFrameworkForDisplay((row as Record<string, unknown>).framework);
    if (label && label !== "—") names.add(label);
  }
  return [...names].join(", ");
}

function controlIdFromControlLine(raw: string): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const left = s.includes(":") ? s.split(":")[0].trim() : s;
  const m = left.match(/[A-Za-z]{1,6}[A-Za-z0-9._-]{0,12}/);
  return m ? m[0] : "";
}

/** Control IDs from buyer `frameworkMappingRows.controls` (e.g. PR.DS-1, Art. 10). */
function frameworkControlIdsFromBuyerMappingRows(rows: unknown): string {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const ids = new Set<string>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const controls = frameworkControlsDisplayLines((row as Record<string, unknown>).controls);
    for (const line of controls) {
      const id = controlIdFromControlLine(line);
      if (id) ids.add(id);
    }
  }
  return [...ids].join(", ");
}

function toMitigationId(raw: unknown): string {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const n = value.match(/\d+/)?.[0];
  if (n) return `M-${n.padStart(3, "0")}`;
  if (/^MIT-/i.test(value)) return value.replace(/^MIT-/i, "M-");
  return value;
}

function toTopRiskCategory(raw: string): string {
  const s = raw.toLowerCase();
  if (
    s.includes("privacy") ||
    s.includes("pii") ||
    s.includes("phi") ||
    s.includes("data leak") ||
    s.includes("data protection")
  ) {
    return "Data Privacy & Protection";
  }
  if (
    s.includes("bias") ||
    s.includes("fairness") ||
    s.includes("discrimination") ||
    s.includes("model")
  ) {
    return "Model Bias & Fairness";
  }
  if (
    s.includes("security") ||
    s.includes("cyber") ||
    s.includes("vulnerability") ||
    s.includes("attack")
  ) {
    return "Cybersecurity & Resilience";
  }
  if (s.includes("compliance") || s.includes("regulatory") || s.includes("governance")) {
    return "Compliance & Governance";
  }
  if (s.includes("operational") || s.includes("integration") || s.includes("deployment")) {
    return "Operational & Integration";
  }
  return raw.trim() || "Other Risk";
}

function splitPrimaryRisk(raw: unknown): string[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  return text
    .split(/,|;|\||\/|&/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitDomainNames(raw: unknown): string[] {
  const text = String(raw ?? "").trim();
  if (!text) return [];
  return text
    .split(/,|;|\||\/|&/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractOverallRiskScoreFromCompleteReport(report: unknown): number | null {
  if (!report || typeof report !== "object" || Array.isArray(report)) return null;
  const r = report as Record<string, unknown>;
  const generated =
    r.generatedAnalysis && typeof r.generatedAnalysis === "object" && !Array.isArray(r.generatedAnalysis)
      ? (r.generatedAnalysis as Record<string, unknown>)
      : undefined;
  const raw = generated?.overallRiskScore ?? r.overallRiskScore;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function extractOverallRiskScoreFromReportItem(item: unknown): number | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const r = item as Record<string, unknown>;
  const direct = Number(r.overallRiskScore ?? r.overall_risk_score ?? r.score);
  if (Number.isFinite(direct)) return Math.max(0, Math.min(100, Math.round(direct)));
  return extractOverallRiskScoreFromCompleteReport(r.report);
}

function extractImplementationRiskScoreFromCompleteReport(report: unknown): number | null {
  if (!report || typeof report !== "object" || Array.isArray(report)) return null;
  const r = report as Record<string, unknown>;
  const generated =
    r.generatedAnalysis && typeof r.generatedAnalysis === "object" && !Array.isArray(r.generatedAnalysis)
      ? (r.generatedAnalysis as Record<string, unknown>)
      : undefined;
  const raw = generated?.implementationRiskScore ?? r.implementationRiskScore;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function extractImplementationRiskScoreFromReportItem(item: unknown): number | null {
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  const r = item as Record<string, unknown>;
  const direct = Number(r.implementationRiskScore ?? r.implementation_risk_score);
  if (Number.isFinite(direct)) return Math.max(0, Math.min(100, Math.round(direct)));
  return extractImplementationRiskScoreFromCompleteReport(r.report);
}

function extractExecutiveSummaryFromCompleteReport(report: unknown): string | null {
  if (!report || typeof report !== "object" || Array.isArray(report)) return null;
  const r = report as Record<string, unknown>;
  const generated =
    r.generatedAnalysis && typeof r.generatedAnalysis === "object" && !Array.isArray(r.generatedAnalysis)
      ? (r.generatedAnalysis as Record<string, unknown>)
      : undefined;
  const text = String(generated?.executiveSummary ?? generated?.summary ?? "").trim();
  return text || null;
}

function deriveBuyerMappingStats(data: unknown): {
  riskCount: number;
  mitigationCount: number;
  topRisks: RiskFrequency[];
  topDomains: DomainShare[];
  frameworkRows: FrameworkMappingRow[];
} {
  const top5 = Array.isArray((data as { data?: { top5Risks?: unknown } })?.data?.top5Risks)
    ? ((data as { data: { top5Risks: Array<Record<string, unknown>> } }).data.top5Risks)
    : [];
  const mitByRisk =
    (data as { data?: { mitigationsByRiskId?: unknown } })?.data?.mitigationsByRiskId &&
    typeof (data as { data: { mitigationsByRiskId: unknown } }).data.mitigationsByRiskId === "object"
      ? ((data as { data: { mitigationsByRiskId: Record<string, unknown> } }).data.mitigationsByRiskId)
      : {};
  const frameworkTypesForAssessment = frameworkTypesFromBuyerMappingRows(
    (data as { data?: { frameworkMappingRows?: unknown } })?.data?.frameworkMappingRows,
  );
  const frameworkControlIdsForAssessment = frameworkControlIdsFromBuyerMappingRows(
    (data as { data?: { frameworkMappingRows?: unknown } })?.data?.frameworkMappingRows,
  );
  const riskIds = new Set<string>();
  const mitigationIds = new Set<string>();
  const riskFreq = new Map<string, { label: string; count: number; riskIds: Set<string> }>();
  const domainFreq = new Map<string, number>();
  const domainNameByPrimary = new Map<string, Map<string, number>>();
  const frameworkRows: FrameworkMappingRow[] = [];

  for (const risk of top5) {
    const rid = String(risk?.risk_id ?? "").trim();
    if (!rid) continue;
    const labelRaw = String(risk?.risk_title ?? rid).trim();
    const label = toTopRiskCategory(labelRaw);
    riskIds.add(rid);
    const prev = riskFreq.get(label);
    const nextIds = prev?.riskIds ?? new Set<string>();
    nextIds.add(rid);
    riskFreq.set(label, { label, count: (prev?.count ?? 0) + 1, riskIds: nextIds });

    const primaryRisks = splitPrimaryRisk(risk.primary_risk);
    const targetPrimaryRisks = primaryRisks.length > 0 ? primaryRisks : ["Unspecified"];
    const domains = splitDomainNames(risk.domains);
    const domainName = domains[0] ?? "Unspecified";
    for (const primary of targetPrimaryRisks) {
      domainFreq.set(primary, (domainFreq.get(primary) ?? 0) + 1);
      if (!domainNameByPrimary.has(primary)) domainNameByPrimary.set(primary, new Map<string, number>());
      const nameMap = domainNameByPrimary.get(primary)!;
      nameMap.set(domainName, (nameMap.get(domainName) ?? 0) + 1);
    }

    const frameworkControl =
      frameworkControlIdsForAssessment.trim() !== ""
        ? frameworkControlIdsForAssessment
        : frameworkTypesForAssessment.trim() !== ""
          ? frameworkTypesForAssessment
          : getStaticFrameworkControl(labelRaw);
    const mids = Array.isArray(mitByRisk[rid])
      ? (mitByRisk[rid] as Array<Record<string, unknown>>)
          .map((m) => toMitigationId(m?.mitigation_id ?? m?.mitigation_action_id))
          .filter(Boolean)
      : [];
    frameworkRows.push({
      riskId: rid,
      riskCategory: labelRaw,
      frameworkControl,
      mitigationIds: [...new Set(mids)],
    });
  }

  for (const arr of Object.values(mitByRisk)) {
    if (!Array.isArray(arr)) continue;
    for (const m of arr) {
      if (!m || typeof m !== "object") continue;
      const mid = toMitigationId(
        (m as Record<string, unknown>).mitigation_id ?? (m as Record<string, unknown>).mitigation_action_id,
      );
      if (mid) mitigationIds.add(mid);
    }
  }

  const totalDomainCount = [...domainFreq.values()].reduce((sum, n) => sum + n, 0);
  return {
    riskCount: riskIds.size,
    mitigationCount: mitigationIds.size,
    topRisks: [...riskFreq.values()]
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
      .slice(0, 3)
      .map((x) => ({ label: x.label, count: x.count, riskIds: [...x.riskIds] })),
    topDomains: [...domainFreq.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 3)
      .map(([primaryRisk, count]) => {
        const nameCounts = domainNameByPrimary.get(primaryRisk);
        const domainName = nameCounts
          ? [...nameCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Unspecified"
          : "Unspecified";
        return {
          primaryRisk,
          domainName,
          percentage: totalDomainCount > 0 ? Math.round((count / totalDomainCount) * 100) : 0,
        };
      }),
    frameworkRows,
  };
}

const BuyerOverview = () => {
  const navigate = useNavigate();
  const [assessmentsList, setAssessmentsList] = useState<AssessmentRow[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState<string>("");
  const [buyerRiskCount, setBuyerRiskCount] = useState<number>(0);
  const [buyerMitigationCount, setBuyerMitigationCount] = useState<number>(0);
  const [riskCountByAssessment, setRiskCountByAssessment] = useState<Record<string, number>>({});
  const [mitigationCountByAssessment, setMitigationCountByAssessment] = useState<Record<string, number>>({});
  const [topRiskFrequency, setTopRiskFrequency] = useState<RiskFrequency[]>([]);
  const [topRiskFrequencyByAssessment, setTopRiskFrequencyByAssessment] = useState<Record<string, RiskFrequency[]>>({});
  const [topDomainShares, setTopDomainShares] = useState<DomainShare[]>([]);
  const [topDomainSharesByAssessment, setTopDomainSharesByAssessment] = useState<Record<string, DomainShare[]>>({});
  const [reportsByAssessmentId, setReportsByAssessmentId] = useState<Record<string, AssessmentReportMeta>>({});
  const [selectedAssessmentSnapshot, setSelectedAssessmentSnapshot] = useState<SelectedAssessmentSnapshot | null>(null);
  const [frameworkRowsAll, setFrameworkRowsAll] = useState<FrameworkMappingRow[]>([]);
  const [frameworkRowsByAssessment, setFrameworkRowsByAssessment] = useState<Record<string, FrameworkMappingRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // const [aiSearchQuery, setAiSearchQuery] = useState("");

  const fetchAssessments = useCallback(async () => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token) {
      setLoading(false);
      return;
    }
    setFetchError(null);
    setLoading(true);
    const organizationId = sessionStorage.getItem("organizationId");
    const query = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    try {
      const assessmentsRes = await fetch(`${BASE_URL}/assessments${query}`, { method: "GET", headers });
      const assessmentsResult = await assessmentsRes.json().catch(() => ({}));
      const list: AssessmentRow[] =
        assessmentsResult?.data?.assessments != null
          ? (assessmentsResult.data.assessments as AssessmentRow[])
          : [];
      setAssessmentsList(list);
      const buyer = list.filter((a) => (a.type ?? "").toLowerCase() === "cots_buyer");
      const completed = buyer.filter((a) => (a.status ?? "").toLowerCase() !== "draft");
      setSelectedAssessmentId((prev) => {
        if (prev && completed.some((a) => String(a.assessmentId) === prev)) return prev;
        return "";
      });
      const orgFromList = String(
        buyer.find((a) => String(a.organizationId ?? "").trim())?.organizationId ?? "",
      ).trim();
      if (orgFromList && !String(organizationId ?? "").trim()) {
        try {
          sessionStorage.setItem("organizationId", orgFromList);
        } catch {
          // ignore storage failures
        }
      }
    } catch {
      setFetchError("Failed to load assessments.");
      setAssessmentsList([]);
      setReportsByAssessmentId({});
    } finally {
      setLoading(false);
    }

    try {
      const bvrRes = await fetch(`${BASE_URL}/buyerVendorRiskReports${query}`, { method: "GET", headers });
      const bvrData = await bvrRes.json().catch(() => ({}));
      const bvrRows = Array.isArray(bvrData?.data?.reports)
        ? (bvrData.data.reports as Array<Record<string, unknown>>)
        : [];
      const reportsByAssessment: Record<string, AssessmentReportMeta> = {};
      for (const row of bvrRows) {
        const bvrAid = String(row?.assessmentId ?? "").trim();
        if (!bvrAid) continue;
        const n = Number(row?.implementationRiskScore);
        reportsByAssessment[bvrAid] = {
          reportId: String(row?.id ?? "").trim(),
          score: extractOverallRiskScoreFromReportItem(row),
          implementationRiskScore: Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null,
          summary: null,
        };
      }
      setReportsByAssessmentId(reportsByAssessment);
    } catch {
      setReportsByAssessmentId({});
    }
  }, []);

  useEffect(() => {
    fetchAssessments();
  }, [fetchAssessments]);

  useEffect(() => {
    const token = sessionStorage.getItem("bearerToken");
    if (!selectedAssessmentId || !token) {
      setSelectedAssessmentSnapshot(null);
      return;
    }
    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };
    const aid = selectedAssessmentId;
    (async () => {
      const [bvrRes, mapRes] = await Promise.allSettled([
        fetch(
          `${BASE_URL.replace(/\/$/, "")}/buyerCotsAssessment/${encodeURIComponent(aid)}/vendor-risk-report`,
          { headers },
        ),
        fetch(
          `${BASE_URL}/buyerCotsAssessment/${encodeURIComponent(aid)}/risk-mappings`,
          { headers },
        ),
      ]);

      if (cancelled) return;

      if (bvrRes.status === "fulfilled") {
        try {
          const bvrData = await bvrRes.value.json().catch(() => ({}));
          if (cancelled) return;
          if (bvrRes.value.ok && bvrData?.report && typeof bvrData.report === "object") {
            const rep = bvrData.report as Record<string, unknown>;
            const irsN = Number(rep.implementationRiskScore);
            const n = Number(rep.overallRiskScore);
            setSelectedAssessmentSnapshot({
              implementationRiskScore: Number.isFinite(irsN)
                ? Math.max(0, Math.min(100, Math.round(irsN)))
                : null,
              overallRiskScore: Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null,
              executiveSummary: String(rep.executiveSummary ?? "").trim() || null,
            });
          } else {
            setSelectedAssessmentSnapshot(null);
          }
        } catch {
          setSelectedAssessmentSnapshot(null);
        }
      }

      if (mapRes.status === "fulfilled" && mapRes.value.ok) {
        try {
          const mapData = await mapRes.value.json().catch(() => ({}));
          if (cancelled) return;
          const stats = deriveBuyerMappingStats(mapData);
          setRiskCountByAssessment((prev) => ({ ...prev, [aid]: stats.riskCount }));
          setMitigationCountByAssessment((prev) => ({ ...prev, [aid]: stats.mitigationCount }));
          setTopRiskFrequencyByAssessment((prev) => ({ ...prev, [aid]: stats.topRisks }));
          setTopDomainSharesByAssessment((prev) => ({ ...prev, [aid]: stats.topDomains }));
          setFrameworkRowsByAssessment((prev) => ({ ...prev, [aid]: stats.frameworkRows }));
          setBuyerRiskCount(stats.riskCount);
          setBuyerMitigationCount(stats.mitigationCount);
          setTopRiskFrequency(stats.topRisks);
          setTopDomainShares(stats.topDomains);
          setFrameworkRowsAll(stats.frameworkRows);
        } catch {
          // keep existing mapping stats
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedAssessmentId]);

  const systemRole = (sessionStorage.getItem("systemRole") ?? "").toLowerCase().trim().replace(/_/g, " ");
  const userRole = (sessionStorage.getItem("userRole") ?? "").toLowerCase().trim();
  const isViewOnlyRole =
    systemRole === "system viewer" || (systemRole === "buyer" && userRole === "viewer");

  const organizationId = sessionStorage.getItem("organizationId") ?? "";
  const orgScopedList = organizationId
    ? assessmentsList.filter((a) => String(a.organizationId ?? "") === String(organizationId))
    : assessmentsList;
  const listForBuyerCards =
    orgScopedList.some((a) => (a.type ?? "").toLowerCase() === "cots_buyer")
      ? orgScopedList
      : assessmentsList;
  const buyerAssessments = listForBuyerCards.filter((a) => (a.type ?? "").toLowerCase() === "cots_buyer");
  const completedBuyerAssessments = buyerAssessments.filter((a) => (a.status ?? "").toLowerCase() !== "draft");
  const completedCount = completedBuyerAssessments.length;
  const selectedAssessment = completedBuyerAssessments.find((a) => String(a.assessmentId) === selectedAssessmentId);
  const displayedRiskCount = selectedAssessmentId
    ? (riskCountByAssessment[selectedAssessmentId] ?? 0)
    : buyerRiskCount;
  const displayedMitigationCount = selectedAssessmentId
    ? (mitigationCountByAssessment[selectedAssessmentId] ?? 0)
    : buyerMitigationCount;
  const displayedTopRisks = selectedAssessmentId
    ? (topRiskFrequencyByAssessment[selectedAssessmentId] ?? [])
    : topRiskFrequency;
  const displayedTopDomains = selectedAssessmentId
    ? (topDomainSharesByAssessment[selectedAssessmentId] ?? [])
    : topDomainShares;
  const displayedFrameworkRows = selectedAssessmentId
    ? (frameworkRowsByAssessment[selectedAssessmentId] ?? [])
    : frameworkRowsAll;
  const displayedFrameworkRowsTop3 = displayedFrameworkRows.slice(0, 3);
  const displayedTopDomainsForGraph = (displayedTopDomains.length > 0
    ? displayedTopDomains
    : [
        { primaryRisk: "Unspecified", domainName: "Unspecified", percentage: 0 },
        { primaryRisk: "Unspecified", domainName: "Unspecified", percentage: 0 },
        { primaryRisk: "Unspecified", domainName: "Unspecified", percentage: 0 },
      ]).slice(0, 3);
  const selectedAssessmentDashboardScore = selectedAssessmentId
    ? (selectedAssessmentSnapshot?.implementationRiskScore ??
        reportsByAssessmentId[selectedAssessmentId]?.implementationRiskScore ??
        selectedAssessmentSnapshot?.overallRiskScore ??
        reportsByAssessmentId[selectedAssessmentId]?.score ??
        null)
    : null;
  const assessmentMetricTitle = selectedAssessmentId ? "Implementation readiness score" : "Assessments";
  const assessmentMetricValue = selectedAssessmentId
    ? (selectedAssessmentDashboardScore != null ? selectedAssessmentDashboardScore : "")
    : buyerAssessments.length;

  if (loading) {
    return (
      <div className="vendor_overview_page sec_user_page org_settings_page governance_overview">
        <LoadingMessage
          message="Loading dashboard…"
          className="loading_message_wrapper--page"
        />
      </div>
    );
  }

  return (
    <div className="vendor_overview_page sec_user_page org_settings_page governance_overview">
      <section className="dash_hero" aria-label="Buyer dashboard overview">
        <div className="dash_hero_bg" aria-hidden>
          <span className="dash_hero_pill dash_hero_pill--1" />
          <span className="dash_hero_pill dash_hero_pill--2" />
          <span className="dash_hero_pill dash_hero_pill--3" />
          <span className="dash_hero_pill dash_hero_pill--4" />
          <span className="dash_hero_pill dash_hero_pill--5" />
        </div>

        <div className="dash_greeting_row dash_greeting_row--centered dash_hero_greeting">
          <div className="page_header_row dash_greeting_heading dash_greeting_heading--pa">
            <DashboardTypewriterGreeting
              role="buyer"
              className="dash_greeting_title dash_hero_title"
            />
            <p className="dash_greeting_subtitle dash_hero_subtitle">
              Start an assessment or explore vendors to evaluate AI trust end to end.
            </p>
          </div>
        </div>

        {fetchError && <div className="vendor_overview_error">{fetchError}</div>}

        <div
          className="dash_feature_grid dash_feature_grid--pa_hero"
          aria-label="Quick actions"
        >
          {isViewOnlyRole ? (
            <>
              <DashboardFeatureCard
                variant="pa"
                to="/vendor-directory"
                accent="violet"
                title="AI Directory"
                description="Browse and discover AI vendors in your directory to compare trust."
                icon={<Building2 size={14} strokeWidth={2.25} />}
              />
              <DashboardFeatureCard
                variant="pa"
                to="/riskMappings"
                accent="sky"
                title="Risk mapping"
                description="Review identified risks mapped to controls and frameworks."
                icon={<Workflow size={14} strokeWidth={2.25} />}
              />
              <DashboardFeatureCard
                variant="pa"
                to="/reports"
                accent="amber"
                title="View reports"
                description="Open finished assessments and published risk reports."
                icon={<FileText size={14} strokeWidth={2.25} />}
              />
            </>
          ) : (
            <>
              <DashboardFeatureCard
                variant="pa"
                to="/buyerAssessment"
                accent="violet"
                title="Create an assessment"
                description="Start a new buyer assessment for vendor AI products with full control."
                icon={<ClipboardCheck size={14} strokeWidth={2.25} />}
              />
              <DashboardFeatureCard
                variant="pa"
                to="/vendor-directory"
                accent="sky"
                title="AI Directory"
                description="Browse and discover AI vendors in your directory to compare trust."
                icon={<Building2 size={14} strokeWidth={2.25} />}
              />
              <DashboardFeatureCard
                variant="pa"
                to="/riskMappings"
                accent="amber"
                title="Risk mapping"
                description="Map identified risks to controls and frameworks across assessments."
                icon={<Workflow size={14} strokeWidth={2.25} />}
              />
            </>
          )}
        </div>
      </section>

      <section
        className="dash_section"
        aria-labelledby="buyer-quick-glance-heading"
      >
        <header className="dash_section_header dash_section_header--with_action">
          <div className="dash_section_header_copy">
            <h2 id="buyer-quick-glance-heading" className="dash_section_title">
              Quick Glance
            </h2>
            <p className="dash_section_lead">
              Key risk, mitigation, and assessment metrics at a glance.
            </p>
          </div>
          <div className="dash_section_header_action">
            <div className="governance_overview_select_wrap">
              <select
                className="governance_overview_select"
                value={selectedAssessmentId}
                onChange={(e) => setSelectedAssessmentId(e.target.value)}
                aria-label="Select assessment"
              >
                <option value="">All Assessments</option>
                {completedBuyerAssessments.map((a) => (
                  <option key={a.assessmentId} value={a.assessmentId}>
                    {getAssessmentLabel(a)}
                  </option>
                ))}
              </select>
              <ChevronDown
                size={18}
                className="governance_overview_chevron governance_overview_chevron_select"
                aria-hidden
              />
            </div>
          </div>
        </header>
        <div className="dash_stat_grid" aria-label="Dashboard metrics">
          <DashboardStatCard
            to="/riskMappings"
            label="Identified risks"
            value={displayedRiskCount.toLocaleString()}
            description="Across active assessments"
            icon={<Workflow size={18} />}
            accent="green"
          />
          <DashboardStatCard
            to="/riskMappings"
            label="Mitigations"
            value={displayedMitigationCount.toLocaleString()}
            description="Mapped to identified risks"
            icon={<FileCheck size={18} />}
            accent="orange"
          />
          <DashboardStatCard
            to="/buyerAssessment"
            label={assessmentMetricTitle}
            value={assessmentMetricValue === "" ? "—" : assessmentMetricValue}
            description={
              selectedAssessmentId
                ? "Selected assessment score"
                : "Started in your organization"
            }
            icon={<ClipboardCheck size={18} />}
            accent="rose"
          />
          <DashboardStatCard
            to="/reports"
            label="Completed"
            value={completedCount}
            description="With published reports"
            icon={<FileText size={18} />}
            accent="teal"
          />
        </div>
      </section>

      {selectedAssessmentId && (
            <section className="governance_panel">
              <div className="governance_section_title_row">
                <h3 className="governance_bottom_card_title">Assessment Summary</h3>
              </div>
              <div className="governance_summary_block">
                <p className="governance_bottom_card_subtitle">
                  {getAssessmentLabel(
                    completedBuyerAssessments.find((a) => String(a.assessmentId) === selectedAssessmentId) ??
                      ({ assessmentId: selectedAssessmentId } as AssessmentRow),
                  )}
                </p>
                <p className="governance_summary_text">
                  {selectedAssessmentSnapshot?.executiveSummary ??
                    reportsByAssessmentId[selectedAssessmentId]?.summary ??
                    "No summary available for this assessment yet. Please open the report for details."}
                </p>
                {/* <div className="governance_summary_actions">
                  <span className="governance_summary_actions_label">Actions</span>
                  <div className="governance_summary_actions_value">
                    {reportsByAssessmentId[selectedAssessmentId]?.reportId ? (
                      <Link
                        to={`/reports/${reportsByAssessmentId[selectedAssessmentId].reportId}`}
                        className="governance_assessment_link"
                        title="Open complete assessment report"
                      >
                        <FileText size={18} className="governance_assessment_link_icon" aria-hidden />
                        View report
                      </Link>
                    ) : (
                      <span className="governance_recent_empty">—</span>
                    )}
                  </div>
                </div> */}
              </div>
            </section>
          )}


          <div className="governance_top_risk_grid">
            <section className="governance_panel">
              <h3 className="governance_bottom_card_title">Top Identified Risks</h3>
              <p className="governance_bottom_card_subtitle">Most frequently referenced across all active assessments</p>
              <div className="governance_table_wrap">
                <table className="governance_table">
                  <thead>
                    <tr>
                      <th>Risk IDs</th>
                      <th>Risk</th>
                      <th>Appearance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(displayedTopRisks.length > 0 ? displayedTopRisks : [{ label: "No identified risks", count: 0, riskIds: [] }]).map((item) => (
                      <tr key={item.label}>
                        <td>{item.riskIds.length > 0 ? item.riskIds.join(", ") : "—"}</td>
                        <td>{item.label}</td>
                        <td>{item.count} {item.count === 1 ? "time" : "times"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="governance_panel governance_domain_panel">
              <h3 className="governance_bottom_card_title">Risk Domains</h3>
              <p className="governance_bottom_card_subtitle">Aggregate compliance health</p>
              <div className="governance_domain_rings" aria-hidden>
                <svg viewBox="0 0 220 220" className="governance_domain_rings_svg" aria-hidden>
                  {[
                    { r: 86, w: 14, color: "#0049C4", pct: displayedTopDomainsForGraph[0]?.percentage ?? 0 },
                    { r: 62, w: 11, color: "#00298F", pct: displayedTopDomainsForGraph[1]?.percentage ?? 0 },
                    { r: 40, w: 10, color: "#C9D3E0", pct: displayedTopDomainsForGraph[2]?.percentage ?? 0 },
                  ].map((ring, idx) => {
                    const circumference = 2 * Math.PI * ring.r;
                    const clampedPct = Math.max(0, Math.min(100, ring.pct));
                    const dash = (clampedPct / 100) * circumference;
                    return (
                      <g key={idx}>
                        <circle
                          cx="110"
                          cy="110"
                          r={ring.r}
                          fill="none"
                          stroke="#EDEEF0"
                          strokeWidth={ring.w}
                        />
                        <circle
                          cx="110"
                          cy="110"
                          r={ring.r}
                          fill="none"
                          stroke={ring.color}
                          strokeWidth={ring.w}
                          strokeLinecap="round"
                          strokeDasharray={`${dash} ${Math.max(0, circumference - dash)}`}
                          transform="rotate(-90 110 110)"
                        />
                      </g>
                    );
                  })}
                </svg>
              </div>
              <div className="governance_domain_tiles">
                {displayedTopDomainsForGraph.map((d, idx) => (
                  <div className="governance_domain_tile" key={`${d.primaryRisk}-${idx}`}>
                    <div>
                      <p className="tile_label">{d.primaryRisk.toUpperCase()}</p>
                      <p className="tile_text">{d.domainName}</p>
                    </div>
                    <p className="tile_value">{d.percentage}%</p>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="governance_panel">
            <div className="governance_section_title_row">
              <div>
                <h3 className="governance_bottom_card_title">Compliance Framework Mapping</h3>
                <p className="governance_bottom_card_subtitle">Alignment of identified risks to global regulatory frameworks</p>
              </div>
              <div className="governance_chip_row">
                <span className="governance_chip">NIST AI RMF</span>
                <span className="governance_chip">EU AI ACT</span>
              </div>
            </div>
            <div className="governance_table_wrap">
              <table className="governance_table">
                <thead>
                  <tr>
                    <th>Risk ID</th>
                    <th className="governance_table_col_risk_category">Risk Category</th>
                    <th>Framework Control</th>
                    <th>Mitigation IDs</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedFrameworkRowsTop3.length > 0 ? (
                    displayedFrameworkRowsTop3.map((row) => (
                      <tr key={row.riskId}>
                        <td>{row.riskId}</td>
                        <td className="governance_table_col_risk_category">{row.riskCategory}</td>
                        <td>{row.frameworkControl}</td>
                        <td>
                          <div className="governance_mit_chip_list">
                            {row.mitigationIds.length > 0 ? row.mitigationIds.map((mid) => (
                              <span className="governance_mit_chip" key={`${row.riskId}-${mid}`}>
                                {mid.replace(/^MIT-/i, "M-")}
                              </span>
                            )) : <span className="governance_recent_empty">—</span>}
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="governance_recent_empty">
                        {selectedAssessmentId
                          ? "No framework mapping rows found for this assessment."
                          : "No framework mapping rows found."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {!selectedAssessmentId && (
            <section className="governance_panel">
              <div className="governance_section_title_row">
                <h3 className="governance_bottom_card_title">Top Risk Implementations</h3>
                <Link to="/reports" className="dash_view_all_btn governance_view_link">
                  View All <ChevronRight size={15} strokeWidth={2.25} aria-hidden />
                </Link>
              </div>
              <div className="governance_table_wrap">
                <table className="governance_table">
                  <thead>
                    <tr>
                      <th>Vendor</th>
                      <th>Product</th>
                      <th>Implementation readiness</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...completedBuyerAssessments]
                      .sort((a, b) => {
                        const da = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
                        const db = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
                        return db - da;
                      })
                      .slice(0, 3)
                      .map((a) => {
                        const reportMeta = reportsByAssessmentId[String(a.assessmentId)];
                        return (
                          <tr key={a.assessmentId}>
                            <td>{String(a.vendorName ?? "—")}</td>
                            <td>{String(a.productName ?? a.product_in_scope ?? a.productInScope ?? "—")}</td>
                            <td>
                              {reportMeta?.implementationRiskScore != null
                                ? `${Math.round(reportMeta.implementationRiskScore)}/100`
                                : "—"}
                            </td>
                            <td>
                              {reportMeta?.reportId ? (
                                <Link
                                  to={`/reports/${reportMeta.reportId}`}
                                  className="user_table_action_btn user_table_action_btn_icon"
                                  title="View"
                                  aria-label="View report"
                                >
                                  <Eye size={14} />
                                </Link>
                              ) : (
                                <Link
                                  to={`/buyer-vendor-risk-report/${encodeURIComponent(String(a.assessmentId ?? ""))}`}
                                  className="user_table_action_btn user_table_action_btn_icon"
                                  title="View"
                                  aria-label="View report"
                                >
                                  <Eye size={14} />
                                </Link>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    {completedBuyerAssessments.length === 0 && (
                      <tr><td colSpan={4} className="governance_recent_empty">No completed assessments yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Ask Governance Insight — temporarily disabled
          {!isViewOnlyRole && (
            <div className="governance_risk_search">
              <h3 className="governance_risk_search_title">
                <Sparkles size={20} aria-hidden />
                Ask Governance Insight
              </h3>
              <p className="governance_risk_search_subtitle">
                Searching risks for: {selectedAssessment ? getAssessmentLabel(selectedAssessment) : "Select an assessment"} …
              </p>
              <div className="governance_risk_search_suggestions">
                {[
                  "What are the privacy risks for AI chatbots?",
                  "Show me bias risks in hiring AI",
                  "What security vulnerabilities affect LLMs?",
                  "Risks of AI in healthcare decisions",
                  "Data leakage risks in generative AI",
                ].map((q) => (
                  <button key={q} type="button" className="governance_risk_search_pill" onClick={() => setAiSearchQuery(q)}>
                    {q}
                  </button>
                ))}
              </div>
              <div className="governance_risk_search_input_row">
                <input
                  type="text"
                  className="governance_risk_search_input"
                  placeholder="Ask about AI risks..."
                  value={aiSearchQuery}
                  onChange={(e) => setAiSearchQuery(e.target.value)}
                  aria-label="Ask about AI risks"
                />
                <button type="button" className="governance_risk_search_send" aria-label="Send">
                  <Send size={20} />
                </button>
              </div>
            </div>
          )}
          */}
    </div>
  );
};

export default BuyerOverview;
