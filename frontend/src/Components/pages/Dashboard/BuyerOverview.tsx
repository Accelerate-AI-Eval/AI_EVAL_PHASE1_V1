import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileText, LayoutDashboard, Activity, Shield, AlertTriangle, ChevronDown, ClipboardPlus, Building2, Users, ChevronRight } from "lucide-react";
import { MetricCard } from "../../UI/Card";
import LoadingMessage from "../../UI/LoadingMessage";
import type { AssessmentRow } from "./types";
import { BASE_URL, formatGovDate, getAssessmentLabel } from "./utils";
import { formatFrameworkMappingFrameworkForDisplay } from "../../../utils/frameworkMappingFrameworkDisplay";
import "./dashboard.css";

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

const LOADER_MIN_MS = 2000;

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

  const fetchAssessments = useCallback(() => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token) {
      setLoading(false);
      return;
    }
    setFetchError(null);
    setLoading(true);
    const loadStart = Date.now();
    const finishLoading = () => {
      const remaining = Math.max(0, LOADER_MIN_MS - (Date.now() - loadStart));
      setTimeout(() => setLoading(false), remaining);
    };
    const organizationId = sessionStorage.getItem("organizationId");
    const query = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
    fetch(`${BASE_URL}/assessments${query}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.json())
      .then(async (assessmentsResult) => {
        let completedBuyerIds: string[] = [];
        const list: AssessmentRow[] =
          assessmentsResult?.data?.assessments != null
            ? (assessmentsResult.data.assessments as AssessmentRow[])
            : [];
        if (list.length > 0) {
          setAssessmentsList(list);
          const buyer = list.filter((a) => (a.type ?? "").toLowerCase() === "cots_buyer");
          const completed = buyer.filter((a) => (a.status ?? "").toLowerCase() !== "draft");
          completedBuyerIds = completed.map((a) => String(a.assessmentId)).filter(Boolean);
          setSelectedAssessmentId((prev) => {
            if (prev && completed.some((a) => String(a.assessmentId) === prev)) return prev;
            return "";
          });
        } else {
          setAssessmentsList([]);
          setSelectedAssessmentId("");
        }

        /** Report list APIs require organizationId; session may be unset right after login. */
        const orgFromSession = String(sessionStorage.getItem("organizationId") ?? "").trim();
        const buyerRows = list.filter((a) => (a.type ?? "").toLowerCase() === "cots_buyer");
        const orgFromAssessment = String(
          buyerRows.find((a) => String(a.organizationId ?? "").trim())?.organizationId ?? "",
        ).trim();
        const effectiveOrgId = orgFromSession || orgFromAssessment;
        const reportsQuery = effectiveOrgId ? `?organizationId=${encodeURIComponent(effectiveOrgId)}` : "";
        if (effectiveOrgId && !orgFromSession) {
          try {
            sessionStorage.setItem("organizationId", effectiveOrgId);
          } catch {
            // ignore storage failures
          }
        }

        const reportsByAssessment: Record<string, AssessmentReportMeta> = {};
        try {
          const reportsRes = await fetch(`${BASE_URL}/customerRiskReports${reportsQuery}`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          });
          const reportsData = await reportsRes.json().catch(() => ({}));
          const reports = Array.isArray(reportsData?.data?.reports) ? reportsData.data.reports : [];
          reports.sort(
            (a: Record<string, unknown>, b: Record<string, unknown>) =>
              new Date(String(b?.createdAt ?? 0)).getTime() - new Date(String(a?.createdAt ?? 0)).getTime(),
          );
          for (const rep of reports) {
            const aid = String(rep?.assessmentId ?? "").trim();
            const rid = String(rep?.id ?? "").trim();
            if (!aid || !rid) continue;
            const score = extractOverallRiskScoreFromReportItem(rep);
            const implementationRiskScore = extractImplementationRiskScoreFromReportItem(rep);
            const nextMeta: AssessmentReportMeta = {
              reportId: rid,
              score,
              implementationRiskScore,
              summary:
                rep?.report &&
                typeof rep.report === "object" &&
                (rep.report as Record<string, unknown>).generatedAnalysis &&
                typeof (rep.report as Record<string, unknown>).generatedAnalysis === "object"
                  ? String(
                      ((rep.report as Record<string, unknown>).generatedAnalysis as Record<string, unknown>).summary ?? "",
                    ).trim() || null
                  : null,
            };
            if (!reportsByAssessment[aid]) {
              reportsByAssessment[aid] = nextMeta;
              continue;
            }
            const current = reportsByAssessment[aid];
            if (current.score == null && nextMeta.score != null) {
              reportsByAssessment[aid] = {
                ...nextMeta,
                implementationRiskScore:
                  nextMeta.implementationRiskScore ?? current.implementationRiskScore ?? null,
              };
            } else if (current.implementationRiskScore == null && nextMeta.implementationRiskScore != null) {
              reportsByAssessment[aid] = {
                ...current,
                implementationRiskScore: nextMeta.implementationRiskScore,
              };
            }
          }
          try {
            const bvrRes = await fetch(`${BASE_URL}/buyerVendorRiskReports${reportsQuery}`, {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
            });
            const bvrData = await bvrRes.json().catch(() => ({}));
            const bvrRows = Array.isArray(bvrData?.data?.reports) ? (bvrData.data.reports as Array<Record<string, unknown>>) : [];
            for (const row of bvrRows) {
              const bvrAid = String(row?.assessmentId ?? "").trim();
              const rawIrs = row?.implementationRiskScore;
              const n = Number(rawIrs);
              if (!bvrAid || !Number.isFinite(n)) continue;
              const irs = Math.max(0, Math.min(100, Math.round(n)));
              const cur = reportsByAssessment[bvrAid];
              if (cur) {
                reportsByAssessment[bvrAid] = { ...cur, implementationRiskScore: irs };
              } else {
                reportsByAssessment[bvrAid] = {
                  reportId: "",
                  score: null,
                  implementationRiskScore: irs,
                  summary: null,
                };
              }
            }
          } catch {
            // ignore buyer vendor risk list failure
          }
        } catch {
          // ignore reports fetch failure; cards still render
        }
        try {
          const orgParamEnrich = effectiveOrgId ? `&organizationId=${encodeURIComponent(effectiveOrgId)}` : "";
          for (const aid of completedBuyerIds) {
            if (reportsByAssessment[aid]?.reportId) continue;
            const res = await fetch(
              `${BASE_URL}/customerRiskReports?assessmentId=${encodeURIComponent(aid)}${orgParamEnrich}`,
              {
                method: "GET",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                },
              },
            );
            const data = await res.json().catch(() => ({}));
            const rows = Array.isArray(data?.data?.reports) ? (data.data.reports as Array<Record<string, unknown>>) : [];
            if (rows.length === 0) continue;
            const row0 = rows[0]!;
            const rid = String(row0?.id ?? "").trim();
            if (!rid) continue;
            const score = extractOverallRiskScoreFromReportItem(row0);
            const implementationRiskScore = extractImplementationRiskScoreFromReportItem(row0);
            const summary =
              row0?.report &&
              typeof row0.report === "object" &&
              (row0.report as Record<string, unknown>).generatedAnalysis &&
              typeof (row0.report as Record<string, unknown>).generatedAnalysis === "object"
                ? String(
                    ((row0.report as Record<string, unknown>).generatedAnalysis as Record<string, unknown>).summary ?? "",
                  ).trim() || null
                : null;
            const existing = reportsByAssessment[aid];
            reportsByAssessment[aid] = {
              reportId: rid,
              score: existing?.score ?? score ?? null,
              implementationRiskScore: existing?.implementationRiskScore ?? implementationRiskScore ?? null,
              summary: existing?.summary ?? summary ?? null,
            };
          }
        } catch {
          // ignore per-assessment complete report lookup failures
        }
        setReportsByAssessmentId(reportsByAssessment);

        const riskIds = new Set<string>();
        const mitigationIds = new Set<string>();
        const riskIdsByAssessment = new Map<string, Set<string>>();
        const mitigationIdsByAssessment = new Map<string, Set<string>>();
        const riskFreq = new Map<string, { label: string; count: number; riskIds: Set<string> }>();
        const riskFreqByAssessment = new Map<string, Map<string, { label: string; count: number; riskIds: Set<string> }>>();
        const domainFreq = new Map<string, number>();
        const domainFreqByAssessment = new Map<string, Map<string, number>>();
        const domainNameByPrimary = new Map<string, Map<string, number>>();
        const domainNameByPrimaryByAssessment = new Map<string, Map<string, Map<string, number>>>();
        const frameworkByAssessment = new Map<string, FrameworkMappingRow[]>();
        const frameworkMergedByRisk = new Map<string, FrameworkMappingRow & { _mitSet: Set<string> }>();
        const results = await Promise.allSettled(
          completedBuyerIds.map((aid) =>
            fetch(`${BASE_URL}/buyerCotsAssessment/${encodeURIComponent(aid)}/risk-mappings`, {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
            })
              .then((res) => (res.ok ? res.json() : null))
              .then((data) => ({ aid, data })),
          ),
        );

        for (const r of results) {
          if (r.status !== "fulfilled") continue;
          const aid = r.value.aid;
          const data = r.value.data;
          const top5 = Array.isArray(data?.data?.top5Risks) ? (data.data.top5Risks as Array<Record<string, unknown>>) : [];
          const mitByRisk =
            data?.data?.mitigationsByRiskId && typeof data.data.mitigationsByRiskId === "object"
              ? (data.data.mitigationsByRiskId as Record<string, unknown>)
              : {};
          const frameworkTypesForAssessment = frameworkTypesFromBuyerMappingRows(data?.data?.frameworkMappingRows);
          const rowsForAssessment: FrameworkMappingRow[] = [];

          if (!riskIdsByAssessment.has(aid)) {
            riskIdsByAssessment.set(aid, new Set<string>());
            mitigationIdsByAssessment.set(aid, new Set<string>());
          }
          if (!riskFreqByAssessment.has(aid)) {
            riskFreqByAssessment.set(aid, new Map<string, { label: string; count: number; riskIds: Set<string> }>());
          }
          if (!domainFreqByAssessment.has(aid)) {
            domainFreqByAssessment.set(aid, new Map<string, number>());
          }
          if (!domainNameByPrimaryByAssessment.has(aid)) {
            domainNameByPrimaryByAssessment.set(aid, new Map<string, Map<string, number>>());
          }

          for (const risk of top5) {
            const rid = String(risk?.risk_id ?? "").trim();
            const labelRaw = String(risk?.risk_title ?? (rid || "Unknown Risk")).trim();
            const label = toTopRiskCategory(labelRaw);
            if (!rid) continue;
            riskIds.add(rid);
            riskIdsByAssessment.get(aid)?.add(rid);
            const prev = riskFreq.get(label);
            const nextIds = prev?.riskIds ?? new Set<string>();
            nextIds.add(rid);
            riskFreq.set(label, { label, count: (prev?.count ?? 0) + 1, riskIds: nextIds });
            const perAid = riskFreqByAssessment.get(aid)!;
            const prevAid = perAid.get(label);
            const nextAidIds = prevAid?.riskIds ?? new Set<string>();
            nextAidIds.add(rid);
            perAid.set(label, { label, count: (prevAid?.count ?? 0) + 1, riskIds: nextAidIds });

            const primaryRisks = splitPrimaryRisk((risk as Record<string, unknown>).primary_risk);
            const targetPrimaryRisks = primaryRisks.length > 0 ? primaryRisks : ["Unspecified"];
            const domains = splitDomainNames((risk as Record<string, unknown>).domains);
            const domainName = domains[0] ?? "Unspecified";
            const aidDomainMap = domainFreqByAssessment.get(aid)!;
            const aidPrimaryDomainMap = domainNameByPrimaryByAssessment.get(aid)!;
            for (const primary of targetPrimaryRisks) {
              domainFreq.set(primary, (domainFreq.get(primary) ?? 0) + 1);
              aidDomainMap.set(primary, (aidDomainMap.get(primary) ?? 0) + 1);

              if (!domainNameByPrimary.has(primary)) {
                domainNameByPrimary.set(primary, new Map<string, number>());
              }
              const globalDomainMap = domainNameByPrimary.get(primary)!;
              globalDomainMap.set(domainName, (globalDomainMap.get(domainName) ?? 0) + 1);

              if (!aidPrimaryDomainMap.has(primary)) {
                aidPrimaryDomainMap.set(primary, new Map<string, number>());
              }
              const aidDomainNameMap = aidPrimaryDomainMap.get(primary)!;
              aidDomainNameMap.set(domainName, (aidDomainNameMap.get(domainName) ?? 0) + 1);
            }

            const riskCategory = String(risk?.risk_title ?? (rid || "Unknown Risk")).trim();
            const frameworkControl =
              frameworkTypesForAssessment.trim() !== ""
                ? frameworkTypesForAssessment
                : getStaticFrameworkControl(riskCategory);
            const mids = Array.isArray((mitByRisk as Record<string, unknown>)[rid])
              ? ((mitByRisk as Record<string, unknown>)[rid] as Array<Record<string, unknown>>)
                  .map((m) => toMitigationId(m?.mitigation_id ?? m?.mitigation_action_id))
                  .filter(Boolean)
              : [];
            rowsForAssessment.push({
              riskId: rid,
              riskCategory,
              frameworkControl,
              mitigationIds: [...new Set(mids)],
            });
          }
          for (const arr of Object.values(mitByRisk)) {
            if (!Array.isArray(arr)) continue;
            for (const m of arr) {
              if (!m || typeof m !== "object") continue;
              const mm = m as Record<string, unknown>;
              const mid = toMitigationId(mm.mitigation_id ?? mm.mitigation_action_id);
              if (!mid) continue;
              mitigationIds.add(mid);
              mitigationIdsByAssessment.get(aid)?.add(mid);
            }
          }
          frameworkByAssessment.set(aid, rowsForAssessment);
          for (const row of rowsForAssessment) {
            const prev = frameworkMergedByRisk.get(row.riskId);
            if (!prev) {
              frameworkMergedByRisk.set(row.riskId, {
                ...row,
                _mitSet: new Set(row.mitigationIds),
              });
            } else {
              row.mitigationIds.forEach((m) => prev._mitSet.add(m));
              const fwSet = new Set<string>();
              for (const part of prev.frameworkControl.split(",").map((s) => s.trim())) {
                if (part) fwSet.add(part);
              }
              for (const part of row.frameworkControl.split(",").map((s) => s.trim())) {
                if (part) fwSet.add(part);
              }
              if (fwSet.size > 0) prev.frameworkControl = [...fwSet].join(", ");
            }
          }
        }
        const riskCountMap = Object.fromEntries(
          [...riskIdsByAssessment.entries()].map(([aid, ids]) => [aid, ids.size]),
        );
        const mitigationCountMap = Object.fromEntries(
          [...mitigationIdsByAssessment.entries()].map(([aid, ids]) => [aid, ids.size]),
        );
        const topAll = [...riskFreq.values()]
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
          .slice(0, 3)
          .map((x) => ({ label: x.label, count: x.count, riskIds: [...x.riskIds] }));
        const topByAssessment = Object.fromEntries(
          [...riskFreqByAssessment.entries()].map(([aid, mp]) => [
            aid,
            [...mp.values()]
              .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
              .slice(0, 3)
              .map((x) => ({ label: x.label, count: x.count, riskIds: [...x.riskIds] })),
          ]),
        );
        const totalDomainCount = [...domainFreq.values()].reduce((sum, n) => sum + n, 0);
        const topDomainsAll = [...domainFreq.entries()]
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
          });
        const topDomainsByAssessment = Object.fromEntries(
          [...domainFreqByAssessment.entries()].map(([aid, mp]) => {
            const total = [...mp.values()].reduce((sum, n) => sum + n, 0);
            const aidPrimaryDomainMap = domainNameByPrimaryByAssessment.get(aid);
            const rows = [...mp.entries()]
              .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
              .slice(0, 3)
              .map(([primaryRisk, count]) => {
                const nameCounts = aidPrimaryDomainMap?.get(primaryRisk);
                const domainName = nameCounts
                  ? [...nameCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Unspecified"
                  : "Unspecified";
                return {
                  primaryRisk,
                  domainName,
                  percentage: total > 0 ? Math.round((count / total) * 100) : 0,
                };
              });
            return [aid, rows];
          }),
        );
        const frameworkAssessmentMap = Object.fromEntries(
          [...frameworkByAssessment.entries()].map(([aid, rows]) => [aid, rows]),
        );
        const frameworkAllRows = [...frameworkMergedByRisk.values()].map((r) => ({
          riskId: r.riskId,
          riskCategory: r.riskCategory,
          frameworkControl: r.frameworkControl,
          mitigationIds: [...r._mitSet],
        }));
        setBuyerRiskCount(riskIds.size);
        setBuyerMitigationCount(mitigationIds.size);
        setRiskCountByAssessment(riskCountMap);
        setMitigationCountByAssessment(mitigationCountMap);
        setTopRiskFrequency(topAll);
        setTopRiskFrequencyByAssessment(topByAssessment);
        setTopDomainShares(topDomainsAll);
        setTopDomainSharesByAssessment(topDomainsByAssessment);
        setFrameworkRowsByAssessment(frameworkAssessmentMap);
        setFrameworkRowsAll(frameworkAllRows);
      })
      .catch(() => {
        setFetchError("Failed to load assessments.");
        setAssessmentsList([]);
        setBuyerRiskCount(0);
        setBuyerMitigationCount(0);
        setRiskCountByAssessment({});
        setMitigationCountByAssessment({});
        setTopRiskFrequency([]);
        setTopRiskFrequencyByAssessment({});
        setTopDomainShares([]);
        setTopDomainSharesByAssessment({});
        setReportsByAssessmentId({});
        setFrameworkRowsByAssessment({});
        setFrameworkRowsAll([]);
      })
      .finally(() => finishLoading());
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
    (async () => {
      let overallRiskScore: number | null = null;
      let implementationRiskScore: number | null = null;
      let executiveSummary: string | null = null;
      try {
        const orgId = sessionStorage.getItem("organizationId");
        const orgQuery = orgId ? `&organizationId=${encodeURIComponent(orgId)}` : "";
        const res = await fetch(
          `${BASE_URL}/customerRiskReports?assessmentId=${encodeURIComponent(selectedAssessmentId)}${orgQuery}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = await res.json().catch(() => ({}));
        const rows = Array.isArray(data?.data?.reports) ? (data.data.reports as Array<Record<string, unknown>>) : [];
        if (rows.length > 0) {
          overallRiskScore = extractOverallRiskScoreFromReportItem(rows[0]);
          implementationRiskScore = extractImplementationRiskScoreFromReportItem(rows[0]);
          executiveSummary = extractExecutiveSummaryFromCompleteReport(rows[0]?.report);
        }
      } catch {
        // continue to buyer-vendor fallback
      }
      if (implementationRiskScore == null || overallRiskScore == null || !executiveSummary) {
        try {
          const bvrRes = await fetch(
            `${BASE_URL.replace(/\/$/, "")}/buyerCotsAssessment/${encodeURIComponent(selectedAssessmentId)}/vendor-risk-report`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const bvrData = await bvrRes.json().catch(() => ({}));
          if (bvrRes.ok && bvrData?.report && typeof bvrData.report === "object") {
            const rep = bvrData.report as Record<string, unknown>;
            if (implementationRiskScore == null) {
              const irsN = Number(rep.implementationRiskScore);
              implementationRiskScore = Number.isFinite(irsN)
                ? Math.max(0, Math.min(100, Math.round(irsN)))
                : implementationRiskScore;
            }
            if (overallRiskScore == null) {
              const n = Number(rep.overallRiskScore);
              overallRiskScore = Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : overallRiskScore;
            }
            if (!executiveSummary) {
              const s = String(rep.executiveSummary ?? "").trim();
              executiveSummary = s || executiveSummary;
            }
          }
        } catch {
          // ignore fallback failure
        }
      }
      if (!cancelled) {
        setSelectedAssessmentSnapshot({
          implementationRiskScore,
          overallRiskScore,
          executiveSummary,
        });
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
  const buyerAssessments = orgScopedList.filter((a) => (a.type ?? "").toLowerCase() === "cots_buyer");
  const completedBuyerAssessments = buyerAssessments.filter((a) => (a.status ?? "").toLowerCase() !== "draft");
  const draftCount = buyerAssessments.filter((a) => (a.status ?? "").toLowerCase() === "draft").length;
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
  const assessmentMetricTitle = selectedAssessmentId ? "Implementation risk score" : "Assessments";
  const assessmentMetricValue = selectedAssessmentId
    ? (selectedAssessmentDashboardScore != null ? selectedAssessmentDashboardScore : "")
    : buyerAssessments.length;
  const assessmentMetricDescription = selectedAssessmentId ? "" : `${completedCount} completed, ${draftCount} pending`;

  const handleViewReport = (assessmentId: number) => {
    navigate("/reports", { state: { assessmentId } });
  };

  return (
    <div className="vendor_overview_page sec_user_page org_settings_page governance_overview">
      <div className="vendor_overview_heading page_header_align governance_overview_header">
        <div className="vendor_overview_headers page_header_row">
          <span className="icon_size_header" aria-hidden>
            <LayoutDashboard size={24} className="header_icon_svg" />
          </span>
          <div className="page_header_title_block">
            <h1 className="page_header_title">Governance Intelligence</h1>
            <p className="sub_title page_header_subtitle">
              Strategic oversight for enterprise-wide AI risk mapping and compliance framework alignment.
            </p>
          </div>
        </div>
        <div className="vendor_overview_actions governance_overview_actions">
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
            <ChevronDown size={18} className="governance_overview_chevron governance_overview_chevron_select" aria-hidden />
          </div>
        </div>
      </div>

      {loading && <LoadingMessage message="Loading assessments…" />}
      {fetchError && <div className="vendor_overview_error">{fetchError}</div>}

      {!loading && (
        <>
          {!isViewOnlyRole && (
            <section className="vendor_portal_section" aria-labelledby="buyer-quick-actions-heading">
              <h2 id="buyer-quick-actions-heading" className="vendor_portal_section_heading">
                Quick Actions
              </h2>
              <div className="vendor_portal_action_cards">
                <Link to="/buyerAssessment" className="vendor_portal_action_card vendor_portal_action_card_primary">
                  <ClipboardPlus size={26} className="vendor_portal_action_icon_secondary" aria-hidden />
                  <span className="vendor_portal_action_label">Create Assessment</span>
                </Link>
                <Link to="/vendor-directory" className="vendor_portal_action_card vendor_portal_action_card_primary">
                  <Building2 size={26} className="vendor_portal_action_icon_secondary" aria-hidden />
                  <span className="vendor_portal_action_label">AI Directory</span>
                </Link>
                <Link to="/riskMappings" className="vendor_portal_action_card vendor_portal_action_card_primary">
                  <Users size={26} className="vendor_portal_action_icon_secondary" aria-hidden />
                  <span className="vendor_portal_action_label">Risk Mapping</span>
                </Link>
                <Link to="/reports" className="vendor_portal_action_card vendor_portal_action_card_primary">
                  <FileText size={26} className="vendor_portal_action_icon_secondary" aria-hidden />
                  <span className="vendor_portal_action_label">Access Reports</span>
                </Link>
              </div>
            </section>
          )}
          <div className="vendor_overview_metrics vendor_overview_metrics_four governance_overview_metrics governance_overview_top_cards">
            <MetricCard
              icon={<Activity size={20} />}
              title="Total Identified Risk"
              value={displayedRiskCount.toLocaleString()}
              description=""
            />
            <MetricCard
              icon={<Shield size={20} />}
              title="Total Mitigations Implemented"
              value={displayedMitigationCount.toLocaleString()}
              description=""
            />
            <MetricCard
              icon={<FileText size={20} />}
              title={assessmentMetricTitle}
              value={assessmentMetricValue}
              description={assessmentMetricDescription}
            />
            {/* <MetricCard
              icon={<AlertTriangle size={20} />}
              title="Risk Domains"
              value="6"
              description="Active categories"
            /> */}
          </div>

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
                <div className="governance_summary_actions">
                  <span className="governance_summary_actions_label">Actions</span>
                  <div className="governance_summary_actions_value">
                    {reportsByAssessmentId[selectedAssessmentId]?.reportId ? (
                      <Link
                        to={`/reports/${reportsByAssessmentId[selectedAssessmentId].reportId}`}
                        className="governance_assessment_link governance_assessment_link_table"
                        title="Open complete assessment report"
                      >
                        <FileText size={18} className="governance_assessment_link_icon" aria-hidden />
                        View report
                      </Link>
                    ) : (
                      <span className="governance_recent_empty">—</span>
                    )}
                  </div>
                </div>
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
                    <th>Risk Category</th>
                    <th>Framework Control</th>
                    <th>Mitigation IDs</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedAssessmentId ? (
                    displayedFrameworkRows.length > 0 ? (
                      displayedFrameworkRows.map((row) => (
                        <tr key={row.riskId}>
                          <td>{row.riskId}</td>
                          <td>{row.riskCategory}</td>
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
                      <tr><td colSpan={4} className="governance_recent_empty">No framework mapping rows found for this assessment.</td></tr>
                    )
                  ) : (
                    <>
                      <tr>
                        <td>RISK-001</td>
                        <td>Data Privacy & Leakage</td>
                        <td>NIST PR.DS-1, EU Art. 10 (Data governance)</td>
                        <td>
                          <div className="governance_mit_chip_list">
                            <span className="governance_mit_chip">M-001</span>
                            <span className="governance_mit_chip">M-004</span>
                            <span className="governance_mit_chip">M-009</span>
                            <span className="governance_mit_chip">M-012</span>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td>RISK-002</td>
                        <td>Algorithmic Bias</td>
                        <td>NIST MEASURE 2.1, EU Art. 13 (Transparency)</td>
                        <td>
                          <div className="governance_mit_chip_list">
                            <span className="governance_mit_chip">M-003</span>
                            <span className="governance_mit_chip">M-010</span>
                          </div>
                        </td>
                      </tr>
                      <tr>
                        <td>RISK-003</td>
                        <td>Cyber Resilience</td>
                        <td>NIST MAP 1.5, EU Art. 15 (Cybersecurity)</td>
                        <td>
                          <div className="governance_mit_chip_list">
                            <span className="governance_mit_chip">M-006</span>
                          </div>
                        </td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {!selectedAssessmentId && (
            <section className="governance_panel">
              <div className="governance_section_title_row">
                <h3 className="governance_bottom_card_title">Top Risk Implementations</h3>
                <Link to="/reports" className="governance_view_link">
                  View All <ChevronRight size={14} aria-hidden />
                </Link>
              </div>
              <div className="governance_table_wrap">
                <table className="governance_table">
                  <thead>
                    <tr>
                      <th>Vendor</th>
                      <th>Product</th>
                      <th>Implementation risk</th>
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
                                ? `${reportMeta.implementationRiskScore}/100`
                                : reportMeta?.score != null
                                  ? `${reportMeta.score}/100`
                                  : "—"}
                            </td>
                            <td>
                              {reportMeta?.reportId ? (
                                <Link
                                  to={`/reports/${reportMeta.reportId}`}
                                  className="governance_assessment_link governance_assessment_link_table"
                                  title="Open complete assessment report"
                                >
                                  <FileText size={18} className="governance_assessment_link_icon" aria-hidden />
                                  View report
                                </Link>
                              ) : (
                                <span className="governance_recent_empty">—</span>
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
        </>
      )}
    </div>
  );
};

export default BuyerOverview;
