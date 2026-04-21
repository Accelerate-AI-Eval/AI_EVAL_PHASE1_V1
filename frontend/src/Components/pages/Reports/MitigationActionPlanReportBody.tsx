import { ArrowUpDown, CalendarClock, Download, ListChecks, Search, Table2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import "../Assessments/BuyerAssessment/buyer_vendor_risk_report.css";

export type MitigationActionPlanRow = {
  rank: number;
  title: string;
  score: number;
  phase: string;
  responsible: string;
  accountable: string;
  consulted: string;
  informed: string;
  successCriteria: string;
  verification: string;
};

export type MitigationActionPlanParsed = {
  version?: number;
  generatedAt?: string;
  assessmentId?: string;
  vendorName?: string;
  productName?: string;
  actions: MitigationActionPlanRow[];
  reassessmentTriggers: string[];
  reassessmentCadence: string;
  csvExport: {
    fieldDefinitions: { fieldName: string; description: string }[];
    formatNotes: string;
  };
};

function escapeCsvCell(s: string): string {
  const t = String(s ?? "");
  if (/[",\r\n]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

const CSV_COLUMNS: (keyof MitigationActionPlanRow)[] = [
  "rank",
  "title",
  "score",
  "phase",
  "responsible",
  "accountable",
  "consulted",
  "informed",
  "successCriteria",
  "verification",
];

export function actionsToCsv(actions: MitigationActionPlanRow[]): string {
  const header = CSV_COLUMNS.join(",");
  const lines = actions.map((row) =>
    CSV_COLUMNS.map((k) => escapeCsvCell(String(row[k] ?? ""))).join(","),
  );
  return [header, ...lines].join("\r\n");
}

export function parseMitigationActionPlanJson(
  raw: string | Record<string, unknown> | undefined | null,
): MitigationActionPlanParsed | null {
  if (raw == null) return null;
  let j: Record<string, unknown> | null = null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    j = raw as Record<string, unknown>;
  } else if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;
    try {
      j = JSON.parse(s) as Record<string, unknown>;
    } catch {
      return null;
    }
  } else {
    return null;
  }
  if (!j || typeof j !== "object") return null;
  const actions = j.actions;
  if (!Array.isArray(actions) || actions.length === 0) return null;
  const triggers = j.reassessmentTriggers;
  const csvExport = j.csvExport as Record<string, unknown> | undefined;
  return {
    version: typeof j.version === "number" ? j.version : undefined,
    generatedAt: typeof j.generatedAt === "string" ? j.generatedAt : undefined,
    assessmentId: typeof j.assessmentId === "string" ? j.assessmentId : undefined,
    vendorName: typeof j.vendorName === "string" ? j.vendorName : undefined,
    productName: typeof j.productName === "string" ? j.productName : undefined,
    actions: actions as MitigationActionPlanRow[],
    reassessmentTriggers: Array.isArray(triggers)
      ? (triggers as unknown[]).map((x) => String(x))
      : [],
    reassessmentCadence: typeof j.reassessmentCadence === "string" ? j.reassessmentCadence : "",
    csvExport: {
      fieldDefinitions: Array.isArray(csvExport?.fieldDefinitions)
        ? (csvExport.fieldDefinitions as { fieldName: string; description: string }[])
        : [],
      formatNotes: typeof csvExport?.formatNotes === "string" ? csvExport.formatNotes : "",
    },
  };
}

export default function MitigationActionPlanReportBody({ data }: { data: MitigationActionPlanParsed }) {
  const { actions, reassessmentTriggers, reassessmentCadence, csvExport } = data;
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<"rank" | "score" | "title" | "phase">("rank");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const toggleSort = (field: "rank" | "score" | "title" | "phase") => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection("asc");
  };

  const visibleActions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const filtered =
      q.length === 0
        ? actions
        : actions.filter((row) =>
            [
              row.rank,
              row.score,
              row.title,
              row.phase,
              row.responsible,
              row.accountable,
              row.consulted,
              row.informed,
              row.successCriteria,
              row.verification,
            ]
              .map((v) => String(v ?? "").toLowerCase())
              .join(" ")
              .includes(q),
          );

    const sorted = [...filtered].sort((a, b) => {
      if (sortField === "rank" || sortField === "score") {
        const delta = Number(a[sortField]) - Number(b[sortField]);
        return sortDirection === "asc" ? delta : -delta;
      }
      const delta = String(a[sortField] ?? "").localeCompare(String(b[sortField] ?? ""), undefined, {
        sensitivity: "base",
        numeric: true,
      });
      return sortDirection === "asc" ? delta : -delta;
    });

    return sorted;
  }, [actions, searchTerm, sortDirection, sortField]);

  const downloadCsv = () => {
    const csv = actionsToCsv(actions);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mitigation-action-plan.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadExcel = () => {
    const sheetRows = visibleActions.map((row) => ({
      Rank: row.rank,
      Score: row.score,
      Title: row.title,
      Phase: row.phase,
      "R - Responsible": row.responsible,
      "A - Accountable": row.accountable,
      "C - Consulted": row.consulted,
      "I - Informed": row.informed,
      "Success criteria": row.successCriteria,
      Verification: row.verification,
    }));
    const sheet = XLSX.utils.json_to_sheet(sheetRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Mitigation Action Plan");
    XLSX.writeFile(workbook, "mitigation-action-plan.xlsx");
  };

  return (
    <div className="report_vcm_wrap map_report_root">
      <section className="bvr_card">
        <h2 className="bvr_section_title bvr_title_with_icon" style={{ marginTop: 0 }}>
          <ListChecks className="bvr_title_icon" size={22} strokeWidth={2} aria-hidden />
          <span>Prioritized action list (with score)</span>
        </h2>
        <p className="bvr_exec_text" style={{ marginBottom: "0.75rem" }}>
          Actions are ranked by priority score (0–100, higher = more urgent). Ownership (RACI), phase, success
          criteria, and verification are shown in the table below.
        </p>
        <div className="map_action_toolbar">
          <div className="assessment_search_wrap map_action_search_wrap">
            <Search size={18} className="assessment_search_icon" aria-hidden />
            <input
              type="search"
              className="assessment_search_input"
              placeholder="Search actions..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search mitigation actions"
            />
          </div>
          <button type="button" className="bvr_export_btn map_action_export_btn" onClick={downloadExcel}>
            <Download size={16} aria-hidden />
            Export to Excel
          </button>
        </div>
        <div className="map_action_table_wrap" role="region" aria-label="Mitigation actions table">
          <table className="bvr_matrix_table map_action_table">
            <thead>
              <tr>
                <th scope="col" aria-sort={sortField === "rank" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className="map_action_sort_btn" onClick={() => toggleSort("rank")}>
                    <span>Rank</span>
                    <ArrowUpDown size={14} aria-hidden />
                  </button>
                </th>
                <th scope="col" aria-sort={sortField === "score" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className="map_action_sort_btn" onClick={() => toggleSort("score")}>
                    <span>Score</span>
                    <ArrowUpDown size={14} aria-hidden />
                  </button>
                </th>
                <th scope="col" aria-sort={sortField === "title" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className="map_action_sort_btn" onClick={() => toggleSort("title")}>
                    <span>Title</span>
                    <ArrowUpDown size={14} aria-hidden />
                  </button>
                </th>
                <th scope="col" aria-sort={sortField === "phase" ? (sortDirection === "asc" ? "ascending" : "descending") : "none"}>
                  <button type="button" className="map_action_sort_btn" onClick={() => toggleSort("phase")}>
                    <span>Phase</span>
                    <ArrowUpDown size={14} aria-hidden />
                  </button>
                </th>
                <th scope="col">R — Responsible</th>
                <th scope="col">A — Accountable</th>
                <th scope="col">C — Consulted</th>
                <th scope="col">I — Informed</th>
                <th scope="col">Success criteria</th>
                <th scope="col">Verification</th>
              </tr>
            </thead>
            <tbody>
              {visibleActions.map((row, i) => (
                <tr key={`${row.rank}-${row.title}-${i}`}>
                  <td>{row.rank}</td>
                  <td>{row.score}</td>
                  <td>{row.title}</td>
                  <td>{row.phase}</td>
                  <td>{row.responsible}</td>
                  <td>{row.accountable}</td>
                  <td>{row.consulted}</td>
                  <td>{row.informed}</td>
                  <td>{row.successCriteria}</td>
                  <td>{row.verification}</td>
                </tr>
              ))}
              {visibleActions.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ textAlign: "center" }}>
                    No actions match your search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <div className="bvr_mid_row">
        <section className="bvr_card">
          <h2 className="bvr_section_title bvr_title_with_icon">
            <Users className="bvr_title_icon" size={22} strokeWidth={2} aria-hidden />
            <span>Ownership (RACI) and phase</span>
          </h2>
          <p className="bvr_exec_text">
            RACI and phase for each action are listed in the prioritized actions table above (columns Phase, R/A/C/I).
          </p>
        </section>

        <section className="bvr_card">
          <h2 className="bvr_section_title bvr_title_with_icon">
            <Table2 className="bvr_title_icon" size={22} strokeWidth={2} aria-hidden />
            <span>Success criteria and verification</span>
          </h2>
          <p className="bvr_exec_text">
            Per-action success criteria and verification methods are in the prioritized actions table above (columns
            Success criteria and Verification).
          </p>
        </section>
      </div>

      <section className="bvr_card">
        <h2 className="bvr_section_title bvr_title_with_icon">
          <CalendarClock className="bvr_title_icon" size={22} strokeWidth={2} aria-hidden />
          <span>Reassessment triggers and cadence</span>
        </h2>
        <h3 className="ira_subheading" style={{ marginTop: "0.5rem" }}>
          Triggers
        </h3>
        <ul className="ira_gap_list">
          {reassessmentTriggers.length > 0 ? (
            reassessmentTriggers.map((t, i) => <li key={i}>{t}</li>)
          ) : (
            <li className="ira_gap_empty">None listed</li>
          )}
        </ul>
        <h3 className="ira_subheading" style={{ marginTop: "1rem" }}>
          Cadence
        </h3>
        <p className="bvr_exec_text">{reassessmentCadence || "—"}</p>
      </section>

      <section className="bvr_card">
        <h2 className="bvr_section_title bvr_title_with_icon">
          <Download className="bvr_title_icon" size={22} strokeWidth={2} aria-hidden />
          <span>Export (CSV) and field definitions</span>
        </h2>
        <p className="bvr_exec_text">{csvExport.formatNotes || "UTF-8 CSV with header row; quote fields that contain commas."}</p>
        <button type="button" className="bvr_export_btn" onClick={downloadCsv} style={{ marginTop: "0.75rem" }}>
          <Download size={16} aria-hidden style={{ marginRight: 6, verticalAlign: "middle" }} />
          Download actions as CSV
        </button>
        <h3 className="ira_subheading" style={{ marginTop: "1.25rem" }}>
          Field definitions
        </h3>
        <div style={{ overflowX: "auto" }}>
          <table className="bvr_matrix_table">
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              {(csvExport.fieldDefinitions.length > 0 ? csvExport.fieldDefinitions : []).map((fd, i) => (
                <tr key={`${fd.fieldName}-${i}`}>
                  <td>
                    <code style={{ fontSize: "0.9em" }}>{fd.fieldName}</code>
                  </td>
                  <td>{fd.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {csvExport.fieldDefinitions.length === 0 ? (
          <p className="bvr_exec_text" style={{ marginTop: "0.5rem" }}>
            Default columns: rank, title, score, phase, responsible, accountable, consulted, informed,
            successCriteria, verification.
          </p>
        ) : null}
      </section>
    </div>
  );
}
