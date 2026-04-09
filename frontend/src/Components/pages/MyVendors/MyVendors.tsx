import { ChevronDown, ChevronRight, ChevronUp, CircleChevronLeft, Search, ShieldAlert } from "lucide-react";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  FrameworkMappingCardGrid,
  type FrameworkMappingDetailLocationState,
} from "../../frameworkMapping/FrameworkMappingCardGrid";
import Select from "../../UI/Select";
import { ReportsPagination, REPORTS_PAGE_SIZE } from "../Reports/ReportsPagination";
import {
  FRAMEWORK_MAPPING_TOP_CONTROLS_MAX,
  parseFrameworkMappingControlsDetail,
} from "../../../utils/frameworkMappingControlsDisplay";
import { sanitizeFrameworkMappingNotesForDisplay } from "../../../utils/frameworkMappingNotesDisplay";
import { formatFrameworkMappingFrameworkForDisplay } from "../../../utils/frameworkMappingFrameworkDisplay";
import "../../../styles/page_tabs.css";
import "./MyVendors.css";

const BASE_URL = import.meta.env.VITE_BASE_URL ?? "http://localhost:5003/api/v1";

const CONTROLS_NOT_PROVIDED_RE = /^not\s*provided\.?$/i;

function isRawControlsFieldNotProvided(value: unknown): boolean {
  const s = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  return s.length > 0 && CONTROLS_NOT_PROVIDED_RE.test(s);
}

function isParsedControlsNotProvidedOnly(
  rows: ReturnType<typeof parseFrameworkMappingControlsDetail>,
): boolean {
  if (rows.length !== 1) return false;
  const r = rows[0];
  if (!CONTROLS_NOT_PROVIDED_RE.test(r.description.trim())) return false;
  const isDash = (x: string) => {
    const t = x.trim();
    return t === "—" || t === "-" || t === "";
  };
  return isDash(r.controlId) && isDash(r.title);
}

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
  const nested = generated?.fullReport?.frameworkMapping as { rows?: FrameworkMappingRow[] } | undefined;
  if (Array.isArray(nested?.rows) && nested.rows.length > 0) return nested.rows;
  const top = storedReport.frameworkMappingRows as FrameworkMappingRow[] | undefined;
  if (Array.isArray(top) && top.length > 0) return top;
  return Array.isArray(nested?.rows) ? nested.rows : [];
}

function formatFrameworkCell(v: unknown): string {
  if (v == null) return "—";
  const s = String(v).trim();
  return s || "—";
}

function filterRiskItemsByQuery(items: RiskItem[], query: string): RiskItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter((r) =>
    [r.id, r.title, r.description, r.owner, r.severity, r.status, r.date].some((field) =>
      String(field).toLowerCase().includes(q),
    ),
  );
}

function filterFrameworkRowsByQuery(rows: FrameworkMappingRow[], query: string): FrameworkMappingRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const haystack = [
      formatFrameworkMappingFrameworkForDisplay(row.framework),
      formatFrameworkCell(row.coverage),
      String(row.controls ?? ""),
      String(row.notes ?? ""),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

interface FrameworkMultiSelectDropdownProps {
  frameworkNames: string[];
  selected: Set<string>;
  onSelectionChange: (next: Set<string>) => void;
}

function FrameworkMultiSelectDropdown({
  frameworkNames,
  selected,
  onSelectionChange,
}: FrameworkMultiSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const allSelected =
    frameworkNames.length > 0 && selected.size === frameworkNames.length;
  const noneSelected = selected.size === 0;

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate = !allSelected && !noneSelected && frameworkNames.length > 0;
  }, [allSelected, noneSelected, frameworkNames.length]);

  function toggleAll() {
    if (allSelected) onSelectionChange(new Set());
    else onSelectionChange(new Set(frameworkNames));
  }

  function toggleOne(name: string) {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onSelectionChange(next);
  }

  const summaryLabel = (() => {
    if (frameworkNames.length === 0) return "Frameworks";
    if (allSelected) return `All frameworks (${frameworkNames.length})`;
    if (noneSelected) return "Select frameworks";
    return `${selected.size} of ${frameworkNames.length} frameworks`;
  })();

  return (
    <div className="risk_mapping_fw_multiselect" ref={wrapRef}>
      <button
        type="button"
        className="risk_mapping_fw_multiselect_trigger"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="risk_mapping_fw_multiselect_trigger_label">{summaryLabel}</span>
        <ChevronDown
          size={18}
          aria-hidden
          className={`risk_mapping_fw_multiselect_chevron ${open ? "risk_mapping_fw_multiselect_chevron_open" : ""}`}
        />
      </button>
      {open ? (
        <div className="risk_mapping_fw_multiselect_panel" role="listbox" aria-label="Filter by framework">
          <label className="risk_mapping_fw_multiselect_row risk_mapping_fw_multiselect_row_all">
            <input
              ref={selectAllRef}
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
            />
            <span>Select all</span>
          </label>
          <div className="risk_mapping_fw_multiselect_divider" />
          {frameworkNames.map((name) => (
            <label key={name} className="risk_mapping_fw_multiselect_row">
              <input
                type="checkbox"
                checked={selected.has(name)}
                onChange={() => toggleOne(name)}
              />
              <span className="risk_mapping_fw_multiselect_framework_name">{name}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function FrameworkMappingControlDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [showToggle, setShowToggle] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);

  useLayoutEffect(() => {
    const el = descRef.current;
    if (!el) return;
    if (expanded) {
      setShowToggle(true);
      return;
    }
    setShowToggle(el.scrollHeight > el.clientHeight + 1);
  }, [text, expanded]);

  return (
    <div className="fw_mapping_control_detail_desc_wrap">
      <p
        ref={descRef}
        className={
          expanded
            ? "fw_mapping_control_detail_desc"
            : [
                "fw_mapping_control_detail_desc",
                "fw_mapping_control_detail_desc_clamped",
                showToggle ? "fw_mapping_control_detail_desc_clamped_trunc" : "",
              ]
                .filter(Boolean)
                .join(" ")
        }
      >
        {text}
        {expanded && showToggle ? (
          <>
            {"\u00a0"}
            <button
              type="button"
              className="fw_mapping_control_detail_desc_toggle_embed"
              onClick={() => setExpanded(false)}
              aria-expanded={true}
            >
              Shrink <ChevronUp width={18}/>
            </button>
          </>
        ) : null}
      </p>
      {!expanded && showToggle ? (
        <button
          type="button"
          className="fw_mapping_control_detail_desc_toggle_nextline"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
        >
          Know more <ChevronRight width={18}/>
        </button>
      ) : null}
    </div>
  );
}

function FrameworkMappingControlsDetailModal({ value }: { value: unknown }) {
  if (isRawControlsFieldNotProvided(value)) {
    return <p className="fw_mapping_control_detail_not_provided">Not provided</p>;
  }
  const rows = parseFrameworkMappingControlsDetail(value).slice(
    0,
    FRAMEWORK_MAPPING_TOP_CONTROLS_MAX,
  );
  if (isParsedControlsNotProvidedOnly(rows)) {
    return <p className="fw_mapping_control_detail_not_provided">Not provided</p>;
  }
  if (rows.length === 0) {
    return <p className="fw_mapping_detail_muted">—</p>;
  }
  return (
    <div className="fw_mapping_controls_detail_list fw_mapping_controls_detail_list_grid">
      {rows.map((row, idx) => (
        <div
          key={`${row.controlId}-${idx}`}
          className="fw_mapping_control_detail_card"
        >
          <div className="fw_mapping_control_detail_head">
            <span className="fw_mapping_control_detail_id_tag" title={row.controlId}>
              {row.controlId}
            </span>
            <p className="fw_mapping_control_detail_title">{row.title}</p>
          </div>
          <FrameworkMappingControlDescription text={row.description} />
        </div>
      ))}
    </div>
  );
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

const RISK_CARD_MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Display as e.g. 09-Mar-2025 (local calendar date). */
function formatRiskCardDate(d: Date): string {
  const day = String(d.getDate()).padStart(2, "0");
  const mon = RISK_CARD_MONTH_LABELS[d.getMonth()];
  const year = d.getFullYear();
  return `${day}-${mon}-${year}`;
}

function toDateLabel(iso: string | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return formatRiskCardDate(new Date());
  return formatRiskCardDate(d);
}

/** Split attestation-style notes (middle-dot or newline separated). */
function splitFrameworkNotesSegments(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  if (t.includes("·")) return t.split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean);
  return t.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Renders Category, Class (section), Expiry (DD-Mon-YYYY), then post-expiry text as pills (split on `;`).
 * Matches backend buildFrameworkMappingRowsFromComplianceExpiries notes shape.
 */
function FrameworkNotesCell({ value }: { value: unknown }) {
  const raw = sanitizeFrameworkMappingNotesForDisplay(value);
  if (!raw || raw === "—") return <span>—</span>;

  const parts = splitFrameworkNotesSegments(raw);
  let category: string | undefined;
  let sectionClass: string | undefined;
  let expiryIdx = -1;
  let expiryRaw: string | undefined;

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const mCat = p.match(/^Category:\s*(.+)$/i);
    if (mCat) {
      category = mCat[1].trim();
      continue;
    }
    const mCls = p.match(/^Class:\s*(.+)$/i);
    if (mCls) {
      sectionClass = mCls[1].trim();
      continue;
    }
    const mExp = p.match(/^Expiry:\s*(.+)$/i);
    if (mExp) {
      if (expiryIdx < 0) {
        expiryRaw = mExp[1].trim();
        expiryIdx = i;
      }
      continue;
    }
  }

  const hasExpirySegment = expiryIdx >= 0;
  const expiryFormatted =
    expiryRaw != null && expiryRaw !== ""
      ? (() => {
          const d = new Date(expiryRaw);
          return Number.isNaN(d.getTime()) ? expiryRaw : formatRiskCardDate(d);
        })()
      : undefined;

  const afterExpiryJoined = hasExpirySegment ? parts.slice(expiryIdx + 1).join(" · ") : "";
  const pills = afterExpiryJoined
    .split(/[;]\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => sanitizeFrameworkMappingNotesForDisplay(s))
    .filter((s) => s && s !== "—");

  const looksStructured = Boolean(category || sectionClass || hasExpirySegment);

  if (!looksStructured) {
    return <span className="risk_mapping_notes_plain">{raw}</span>;
  }

  return (
    <div className="risk_mapping_notes_row_card" role="group" aria-label="Notes details">
      {category ? (
        <div className="risk_mapping_notes_block risk_mapping_notes_block_category">
          <span className="risk_mapping_notes_label">Category</span>
          <span className="risk_mapping_notes_value">{category}</span>
        </div>
      ) : null}
      {sectionClass ? (
        <div className="risk_mapping_notes_block">
          <span className="risk_mapping_notes_label">Class</span>
          <span className="risk_mapping_notes_value">{sectionClass}</span>
        </div>
      ) : null}
      {expiryFormatted ? (
        <div className="risk_mapping_notes_block risk_mapping_notes_block_expiry">
          <span className="risk_mapping_notes_label">Expiry</span>
          <span className="risk_mapping_notes_expiry_value">{expiryFormatted}</span>
        </div>
      ) : null}
      {pills.length > 0 ? (
        <div className="risk_mapping_notes_pills risk_mapping_notes_pills_tail" role="list">
          {pills.map((pill, idx) => (
            <span key={idx} className="risk_mapping_notes_pill" role="listitem">
              {pill}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
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
  const location = useLocation();
  const navigate = useNavigate();
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
  const [buyerFrameworkRowsFromReport, setBuyerFrameworkRowsFromReport] = useState<
    FrameworkMappingRow[]
  >([]);
  const [buyerFrameworkRowsFromRiskMap, setBuyerFrameworkRowsFromRiskMap] = useState<
    FrameworkMappingRow[]
  >([]);
  const [riskRegisterPage, setRiskRegisterPage] = useState(1);
  const [riskRegisterPageSize, setRiskRegisterPageSize] = useState(REPORTS_PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFrameworkNames, setSelectedFrameworkNames] = useState<Set<string>>(() => new Set());

  const buyerFrameworkRows = useMemo(
    () =>
      buyerFrameworkRowsFromRiskMap.length > 0
        ? buyerFrameworkRowsFromRiskMap
        : buyerFrameworkRowsFromReport,
    [buyerFrameworkRowsFromRiskMap, buyerFrameworkRowsFromReport],
  );

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
    if (location.pathname !== "/riskMappings/framework-detail") return;
    const st = location.state as FrameworkMappingDetailLocationState | null | undefined;
    if (!st?.row) {
      navigate("/riskMappings", { replace: true });
    }
  }, [location.pathname, location.state, navigate]);

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
    if (activeTab === "gap_analysis") {
      setActiveTab(isVendorPortal ? "risk_register" : "framework_mappings");
    }
  }, [isVendorPortal, activeTab]);

  useEffect(() => {
    setSearchQuery("");
  }, [activeTab]);

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
      setBuyerFrameworkRowsFromReport([]);
      setBuyerFrameworkRowsFromRiskMap([]);
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
          setBuyerFrameworkRowsFromReport([]);
          setBuyerFrameworkRowsFromRiskMap([]);
          return;
        }
        const { top5Risks, mitigationsByRiskId } = vendorReportToRiskMappings(blob);
        setCompleteReportRiskAnalysis([]);
        setDbTop5Risks(top5Risks);
        setDbMitigationsByRiskId(mitigationsByRiskId);
        const apiFw = Array.isArray(first?.frameworkMappingRows)
          ? (first.frameworkMappingRows as FrameworkMappingRow[])
          : [];
        const blobFw = vendorReportFrameworkRows(blob);
        setVendorFrameworkRows(apiFw.length > 0 ? apiFw : blobFw);
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
          const fw = Array.isArray(data.frameworkMappingRows)
            ? (data.frameworkMappingRows as FrameworkMappingRow[])
            : [];
          setBuyerFrameworkRowsFromReport(fw);
        } else {
          setAssessmentDetail(null);
          setCompleteReportRiskAnalysis([]);
          setBuyerFrameworkRowsFromReport([]);
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setAssessmentDetail(null);
        setCompleteReportRiskAnalysis([]);
        setBuyerFrameworkRowsFromReport([]);
      });
    return () => controller.abort();
  }, [selectedAssessmentId, completedActiveAssessmentOptions, isVendorPortal]);

  useEffect(() => {
    if (isVendorPortal) return;
    const token = sessionStorage.getItem("bearerToken");
    if (!token || !selectedAssessmentId) {
      setDbTop5Risks([]);
      setDbMitigationsByRiskId({});
      setBuyerFrameworkRowsFromRiskMap([]);
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
          setBuyerFrameworkRowsFromRiskMap(
            Array.isArray(data.data.frameworkMappingRows)
              ? (data.data.frameworkMappingRows as FrameworkMappingRow[])
              : [],
          );
        } else {
          setDbTop5Risks([]);
          setDbMitigationsByRiskId({});
          setBuyerFrameworkRowsFromRiskMap([]);
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setDbTop5Risks([]);
        setDbMitigationsByRiskId({});
        setBuyerFrameworkRowsFromRiskMap([]);
      });
    return () => controller.abort();
  }, [selectedAssessmentId, isVendorPortal]);

  const riskItems = useMemo(
    () => buildRiskItems(assessmentDetail, completeReportRiskAnalysis, dbTop5Risks, dbMitigationsByRiskId),
    [assessmentDetail, completeReportRiskAnalysis, dbTop5Risks, dbMitigationsByRiskId],
  );

  const filteredRiskItems = useMemo(
    () => filterRiskItemsByQuery(riskItems, searchQuery),
    [riskItems, searchQuery],
  );

  const frameworkRowsForTab = isVendorPortal ? vendorFrameworkRows : buyerFrameworkRows;
  const filteredFrameworkRows = useMemo(
    () => filterFrameworkRowsByQuery(frameworkRowsForTab, searchQuery),
    [frameworkRowsForTab, searchQuery],
  );

  const uniqueFrameworkNames = useMemo(() => {
    const s = new Set<string>();
    frameworkRowsForTab.forEach((row) => {
      s.add(formatFrameworkMappingFrameworkForDisplay(row.framework));
    });
    return [...s].sort((a, b) => {
      if (a === "—") return 1;
      if (b === "—") return -1;
      return a.localeCompare(b);
    });
  }, [frameworkRowsForTab]);

  useLayoutEffect(() => {
    const next = new Set<string>();
    frameworkRowsForTab.forEach((row) => {
      next.add(formatFrameworkMappingFrameworkForDisplay(row.framework));
    });
    setSelectedFrameworkNames(next);
  }, [frameworkRowsForTab]);

  const frameworkGridRows = useMemo(() => {
    if (uniqueFrameworkNames.length === 0) return filteredFrameworkRows;
    if (selectedFrameworkNames.size === 0) return [];
    return filteredFrameworkRows.filter((row) =>
      selectedFrameworkNames.has(formatFrameworkMappingFrameworkForDisplay(row.framework)),
    );
  }, [filteredFrameworkRows, selectedFrameworkNames, uniqueFrameworkNames.length]);

  useEffect(() => {
    setRiskRegisterPage(1);
  }, [selectedAssessmentId, searchQuery]);

  const riskRegisterTotalPages = Math.max(1, Math.ceil(filteredRiskItems.length / riskRegisterPageSize));

  useEffect(() => {
    if (riskRegisterPage > riskRegisterTotalPages) setRiskRegisterPage(riskRegisterTotalPages);
  }, [riskRegisterPage, riskRegisterTotalPages]);

  const paginatedRiskItems = useMemo(() => {
    const start = (riskRegisterPage - 1) * riskRegisterPageSize;
    return filteredRiskItems.slice(start, start + riskRegisterPageSize);
  }, [filteredRiskItems, riskRegisterPage, riskRegisterPageSize]);

  const riskStats = useMemo(() => {
    const total = riskItems.length;
    const criticalHigh = riskItems.filter((r) => r.severity === "critical/high").length;
    const mitigated = riskItems.filter((r) => r.status === "mitigated").length;
    const open = riskItems.filter((r) => r.status === "open").length;
    return { total, criticalHigh, mitigated, open };
  }, [riskItems]);

  const frameworkDetailState =
    location.pathname === "/riskMappings/framework-detail"
      ? (location.state as FrameworkMappingDetailLocationState | null)
      : null;
  const frameworkDetailRow = frameworkDetailState?.row;

  if (location.pathname === "/riskMappings/framework-detail") {
    if (!frameworkDetailRow) {
      return null;
    }
    const detailAssessmentLabel = frameworkDetailState?.assessmentLabel?.trim();
    const certificationGap = frameworkDetailState?.certificationGap;
    const frameworkGap = frameworkDetailState?.frameworkGap;
    const showCertificationGapCard =
      frameworkDetailState?.source === "organizational_portal" && certificationGap != null;
    const showFrameworkMappingGapCard =
      frameworkDetailState?.source === "organizational_portal" && frameworkGap != null;
    return (
      <div className="sec_user_page org_settings_page fw_mapping_detail_page">
        <div className="fw_mapping_detail_page_inner">
          <button
            type="button"
            className="fw_mapping_detail_back_btn"
            onClick={() => navigate("/riskMappings")}
          >
            <CircleChevronLeft size={20} aria-hidden />
            Back to Risk &amp; Controls
          </button>
          <header className="fw_mapping_detail_page_header">
            <h1 className="fw_mapping_detail_page_title">
              {formatFrameworkMappingFrameworkForDisplay(frameworkDetailRow.framework)}
            </h1>
            <p className="fw_mapping_detail_page_sub">
              Framework mapping
              {detailAssessmentLabel ? ` · ${detailAssessmentLabel}` : ""}
            </p>
          </header>
          <div className="fw_mapping_detail_layout" role="presentation">
            <article
              className="fw_mapping_detail_surface_card"
              aria-labelledby="fw_detail_coverage_heading"
            >
              <div className="fw_mapping_detail_card_row">
                <h2 id="fw_detail_coverage_heading" className="fw_mapping_detail_card_title">
                  Coverage
                </h2>
                <p className="fw_mapping_detail_card_value">
                  {formatFrameworkCell(frameworkDetailRow.coverage)}
                </p>
              </div>
              <div className="fw_mapping_detail_card_row fw_mapping_detail_card_row_divider">
                <h2 id="fw_detail_notes_heading" className="fw_mapping_detail_card_title">
                  Notes
                </h2>
                <div className="fw_mapping_detail_card_block">
                  <FrameworkNotesCell value={frameworkDetailRow.notes} />
                </div>
              </div>
            </article>
            {showCertificationGapCard ? (
              <article
                className="fw_mapping_detail_surface_card fw_mapping_detail_gap_card"
                aria-labelledby="fw_detail_gap_heading"
              >
                <div className="fw_mapping_detail_card_row fw_mapping_detail_card_row_gap">
                  <h2 id="fw_detail_gap_heading" className="fw_mapping_detail_card_title">
                    Certification gap (buyer segment relevance)
                  </h2>
                  <div className="fw_mapping_detail_gap_card_body">
                    <div className="fw_mapping_detail_gap_status_row">
                      <span className="fw_mapping_detail_card_value fw_mapping_detail_gap_framework">
                        {certificationGap.frameworkLabel ?? "—"}
                      </span>
                      <span
                        className={
                          certificationGap.status === "met"
                            ? "fw_mapping_detail_gap_badge_met"
                            : "fw_mapping_detail_gap_badge_gap"
                        }
                      >
                        {certificationGap.status === "met" ? "Met" : "Gap"}
                      </span>
                    </div>
                    {certificationGap.points != null && Number.isFinite(certificationGap.points) ? (
                      <p className="fw_mapping_detail_gap_points">
                        Points (matrix): {certificationGap.points}
                      </p>
                    ) : null}
                    {certificationGap.detail != null && String(certificationGap.detail).trim() !== "" ? (
                      <p className="fw_mapping_detail_gap_detail">
                        {String(certificationGap.detail).trim()}
                      </p>
                    ) : null}
                  </div>
                </div>
              </article>
            ) : null}
            {showFrameworkMappingGapCard ? (
              <article
                className="fw_mapping_detail_surface_card fw_mapping_detail_gap_card"
                aria-labelledby="fw_detail_mapping_gap_heading"
              >
                <div className="fw_mapping_detail_card_row fw_mapping_detail_card_row_gap">
                  <h2 id="fw_detail_mapping_gap_heading" className="fw_mapping_detail_card_title">
                    Framework mapping gap
                  </h2>
                  <div className="fw_mapping_detail_gap_card_body">
                    <div className="fw_mapping_detail_gap_status_row">
                      <span className="fw_mapping_detail_card_value fw_mapping_detail_gap_framework">
                        {formatFrameworkMappingFrameworkForDisplay(frameworkDetailRow.framework)}
                      </span>
                      <span className="fw_mapping_detail_gap_badge_gap">Gap</span>
                    </div>
                    <p className="fw_mapping_detail_gap_detail">{frameworkGap.detail}</p>
                  </div>
                </div>
              </article>
            ) : null}
            <article className="fw_mapping_detail_surface_card" aria-labelledby="fw_detail_controls_heading">
              <div className="fw_mapping_detail_card_row fw_mapping_detail_card_row_controls">
                <h2 id="fw_detail_controls_heading" className="fw_mapping_detail_card_title">
                  Controls
                </h2>
                <div className="fw_mapping_detail_card_block">
                  <FrameworkMappingControlsDetailModal value={frameworkDetailRow.controls} />
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    );
  }

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
      <div className="risk_mapping_tabs_section">
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
          {/* Gap Analysis tab temporarily hidden
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
          */}
        </div>
        <div className="risk_mapping_search_wrap">
          <Search size={18} className="risk_mapping_search_icon" aria-hidden />
          <input
            type="search"
            placeholder="Search risk ID, title, owner, framework, controls, notes…"
            className="risk_mapping_search_input"
            aria-label="Search risk mapping"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
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
              ) : filteredRiskItems.length === 0 ? (
                <p className="risk_mapping_empty_text">No risks match your search.</p>
              ) : (
                <>
                <div className="risk_mapping_risk_list">
                  {paginatedRiskItems.map((risk) => (
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
                      <div className="risk_mapping_risk_body">
                        <h4 className="risk_mapping_risk_title">{risk.title}</h4>
                        <p className="risk_mapping_risk_desc">{risk.description}</p>
                      </div>
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
                <footer className="risk_mapping_register_footer">
                  <ReportsPagination
                    totalItems={filteredRiskItems.length}
                    currentPage={riskRegisterPage}
                    pageSize={riskRegisterPageSize}
                    onPageChange={setRiskRegisterPage}
                    onPageSizeChange={(size) => {
                      setRiskRegisterPageSize(size);
                      setRiskRegisterPage(1);
                    }}
                  />
                </footer>
                </>
              )}
            </section>
          </>
        ) : activeTab === "framework_mappings" ? (
          <section className="risk_mapping_panel">
            <div className="risk_mapping_fw_panel_head">
              <div className="risk_mapping_fw_panel_text_block">
                <h3 className="risk_mapping_panel_title">
                  Framework mapping — {assessmentDetail?.assessmentLabel ?? "Selected assessment"}
                </h3>
                {isVendorPortal ? (
                  <p className="risk_mapping_panel_subtitle risk_mapping_fw_panel_subtitle_vendor">
                    Control coverage derived from the selected product&apos;s attestation (compliance certificate
                    uploads) and stored on your complete analysis report.
                  </p>
                ) : null}
              </div>
              {uniqueFrameworkNames.length > 0 ? (
                <FrameworkMultiSelectDropdown
                  frameworkNames={uniqueFrameworkNames}
                  selected={selectedFrameworkNames}
                  onSelectionChange={setSelectedFrameworkNames}
                />
              ) : null}
            </div>
            {isVendorPortal ? (
              <>
                {vendorFrameworkRows.length === 0 ? (
                  <div className="risk_mapping_empty_text">
                    No framework mapping for this assessment yet. Upload compliance PDFs under your product
                    attestation (certifications slot), complete attestation processing, then submit the vendor
                    assessment so the complete report can include mapped controls.
                  </div>
                ) : filteredFrameworkRows.length === 0 ? (
                  <p className="risk_mapping_empty_text">No framework rows match your search.</p>
                ) : frameworkGridRows.length === 0 ? (
                  <p className="risk_mapping_empty_text">
                    Select at least one framework in the filter above to see mapped controls.
                  </p>
                ) : (
                  <FrameworkMappingCardGrid
                    rows={frameworkGridRows}
                    emptyMessage=""
                    assessmentLabel={assessmentDetail?.assessmentLabel}
                  />
                )}
              </>
            ) : (
              <>
                {buyerFrameworkRows.length === 0 ? (
                  <p className="risk_mapping_empty_text">No framework mapping rows found for this assessment.</p>
                ) : filteredFrameworkRows.length === 0 ? (
                  <p className="risk_mapping_empty_text">No framework rows match your search.</p>
                ) : frameworkGridRows.length === 0 ? (
                  <p className="risk_mapping_empty_text">
                    Select at least one framework in the filter above to see mapped controls.
                  </p>
                ) : (
                  <FrameworkMappingCardGrid
                    rows={frameworkGridRows}
                    emptyMessage=""
                    assessmentLabel={assessmentDetail?.assessmentLabel}
                  />
                )}
              </>
            )}
          </section>
        ) : null}
        {/* Gap Analysis panel temporarily hidden (tab commented above; activeTab gap_analysis redirects in useEffect)
        ) : (
          <section className="risk_mapping_panel">
            <p className="risk_mapping_empty_text">
              Gap Analysis view for the selected assessment.
            </p>
          </section>
        )}
        */}
    </div>
  );
};

export default MyVendors;
