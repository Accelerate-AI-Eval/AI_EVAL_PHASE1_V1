import { Banknote, CalendarClock, Gauge, Layers, ListTree } from "lucide-react";
import "../Assessments/BuyerAssessment/buyer_vendor_risk_report.css";

export type IraPayload = {
  version?: number;
  generatedAt?: string;
  assessmentId?: string;
  vendorName?: string;
  productName?: string;
  scoreAndRecommendation?: {
    overallScore?: number;
    recommendation?: string;
    rationale?: string;
  };
  breakdown?: {
    vendorFit?: { score?: number; summary?: string };
    orgReadinessGap?: { score?: number; summary?: string };
    integrationRisk?: { score?: number; summary?: string };
  };
  readinessGaps?: {
    technical?: string[];
    governance?: string[];
    talent?: string[];
  };
  timelineImpact?: {
    drivers?: string[];
    assumptions?: string[];
    narrative?: string;
  };
  budgetImpactMvp?: {
    roughOrderOfMagnitude?: string;
    notes?: string;
  };
};

export function parseImplementationRiskAssessmentJson(
  raw: string | Record<string, unknown> | undefined | null,
): IraPayload | null {
  if (raw == null) return null;
  let j: IraPayload | null = null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    j = raw as IraPayload;
  } else if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;
    try {
      j = JSON.parse(s) as IraPayload;
    } catch {
      return null;
    }
  } else {
    return null;
  }
  if (!j || typeof j !== "object") return null;
  if (!j.scoreAndRecommendation && !j.breakdown) return null;
  return j;
}

function RecBadge({ value }: { value: string }) {
  const v = (value ?? "").trim();
  const cls =
    v === "Proceed"
      ? "ira_rec_proceed"
      : v === "Defer"
        ? "ira_rec_defer"
        : "ira_rec_conditions";
  return <span className={`ira_rec_badge ${cls}`}>{v || "—"}</span>;
}

export default function ImplementationRiskAssessmentReportBody({ data }: { data: IraPayload }) {
  const sr = data.scoreAndRecommendation ?? {};
  const bd = data.breakdown ?? {};
  const rg = data.readinessGaps ?? {};
  const ti = data.timelineImpact ?? {};
  const bi = data.budgetImpactMvp ?? {};

  return (
    <div className="report_vcm_wrap">
      <section className="bvr_card">
        <h2 className="bvr_section_title bvr_title_with_icon" style={{ marginTop: 0 }}>
          <Gauge className="bvr_title_icon" size={22} strokeWidth={2} aria-hidden />
          <span>Score + recommendation</span>
        </h2>
        <div className="ira_score_row">
          <span className="ira_score_label">Score</span>
          <span className="ira_score_value">{sr.overallScore ?? "—"}</span>
          <span className="ira_score_out_of">/ 100</span>
          <span className="ira_score_label">Recommendation</span>
          <RecBadge value={sr.recommendation ?? ""} />
        </div>
        <p className="bvr_exec_text" style={{ marginTop: "0.75rem" }}>
          {sr.rationale ?? "—"}
        </p>
      </section>

      <section className="bvr_card">
        <h2 className="bvr_section_title bvr_title_with_icon">
          <Layers className="bvr_title_icon" size={22} strokeWidth={2} aria-hidden />
          <span>Breakdown</span>
        </h2>
        <div className="bvr_reco_priority_table" role="table" aria-label="Breakdown details">
          <div className="bvr_reco_priority_head" role="rowgroup">
            <div className="bvr_reco_priority_cell" role="columnheader">
              <span className="bvr_risk_scope_tag bvr_pri_high">Vendor fit</span>
            </div>
            <div className="bvr_reco_priority_cell" role="columnheader">
              <span className="bvr_risk_scope_tag bvr_pri_med">Org readiness gap</span>
            </div>
            <div className="bvr_reco_priority_cell" role="columnheader">
              <span className="bvr_risk_scope_tag bvr_pri_low">Integration risk</span>
            </div>
          </div>
          <div className="bvr_reco_priority_body" role="row">
            <div className="bvr_reco_priority_col" role="cell">
              <div className="bvr_reco_priority_item">
                <p className="ira_breakdown_score">{bd.vendorFit?.score ?? "—"}/100</p>
                <p className="bvr_exec_text">{bd.vendorFit?.summary ?? "—"}</p>
              </div>
            </div>
            <div className="bvr_reco_priority_col" role="cell">
              <div className="bvr_reco_priority_item">
                <p className="ira_breakdown_score">{bd.orgReadinessGap?.score ?? "—"}/100</p>
                <p className="bvr_exec_text">{bd.orgReadinessGap?.summary ?? "—"}</p>
              </div>
            </div>
            <div className="bvr_reco_priority_col" role="cell">
              <div className="bvr_reco_priority_item">
                <p className="ira_breakdown_score">{bd.integrationRisk?.score ?? "—"}/100</p>
                <p className="bvr_exec_text">{bd.integrationRisk?.summary ?? "—"}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bvr_card">
        <h2 className="bvr_section_title bvr_title_with_icon">
          <ListTree className="bvr_title_icon" size={22} strokeWidth={2} aria-hidden />
          <span>Readiness gaps</span>
        </h2>
        <div className="bvr_reco_priority_table" role="table" aria-label="Readiness gaps details">
          <div className="bvr_reco_priority_head" role="rowgroup">
            <div className="bvr_reco_priority_cell" role="columnheader">
              <span className="bvr_risk_scope_tag bvr_pri_high">Technical</span>
            </div>
            <div className="bvr_reco_priority_cell" role="columnheader">
              <span className="bvr_risk_scope_tag bvr_pri_med">Governance</span>
            </div>
            <div className="bvr_reco_priority_cell" role="columnheader">
              <span className="bvr_risk_scope_tag bvr_pri_low">Talent</span>
            </div>
          </div>
          <div className="bvr_reco_priority_body" role="row">
            <div className="bvr_reco_priority_col" role="cell">
              <ul className="ira_gap_list">
                {(rg.technical ?? []).length > 0
                  ? (rg.technical ?? []).map((x, i) => <li key={i}>{x}</li>)
                  : <li className="ira_gap_empty">None listed</li>}
              </ul>
            </div>
            <div className="bvr_reco_priority_col" role="cell">
              <ul className="ira_gap_list">
                {(rg.governance ?? []).length > 0
                  ? (rg.governance ?? []).map((x, i) => <li key={i}>{x}</li>)
                  : <li className="ira_gap_empty">None listed</li>}
              </ul>
            </div>
            <div className="bvr_reco_priority_col" role="cell">
              <ul className="ira_gap_list">
                {(rg.talent ?? []).length > 0
                  ? (rg.talent ?? []).map((x, i) => <li key={i}>{x}</li>)
                  : <li className="ira_gap_empty">None listed</li>}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <section className="bvr_card">
        <h2 className="bvr_section_title bvr_title_with_icon">
          <CalendarClock className="bvr_title_icon" size={22} strokeWidth={2} aria-hidden />
          <span>Timeline estimate impact</span>
        </h2>
        <div
          className="bvr_reco_priority_table ira_timeline_table"
          role="table"
          aria-label="Timeline estimate impact details"
        >
          <div className="bvr_reco_priority_head" role="rowgroup">
            <div className="bvr_reco_priority_cell" role="columnheader">
              <span className="bvr_risk_scope_tag bvr_pri_high">Drivers</span>
            </div>
            <div className="bvr_reco_priority_cell" role="columnheader">
              <span className="bvr_risk_scope_tag bvr_pri_med">Assumptions</span>
            </div>
          </div>
          <div className="bvr_reco_priority_body" role="row">
            <div className="bvr_reco_priority_col" role="cell">
              <ul className="ira_gap_list">
                {(ti.drivers ?? []).length > 0
                  ? (ti.drivers ?? []).map((x, i) => <li key={i}>{x}</li>)
                  : <li className="ira_gap_empty">—</li>}
              </ul>
            </div>
            <div className="bvr_reco_priority_col" role="cell">
              <ul className="ira_gap_list">
                {(ti.assumptions ?? []).length > 0
                  ? (ti.assumptions ?? []).map((x, i) => <li key={i}>{x}</li>)
                  : <li className="ira_gap_empty">—</li>}
              </ul>
            </div>
          </div>
        </div>
        <p className="bvr_exec_text" style={{ marginTop: "1rem" }}>
          {ti.narrative ?? "—"}
        </p>
      </section>

      <section className="bvr_card bvr_impl_card">
        <h2 className="bvr_section_title bvr_title_with_icon">
          <Banknote className="bvr_title_icon" size={22} strokeWidth={2} aria-hidden />
          <span>Budget impact</span>
        </h2>
        <p className="ira_rom">{bi.roughOrderOfMagnitude ?? "—"}</p>
        <p className="bvr_impl_text">{bi.notes ?? "—"}</p>
      </section>
    </div>
  );
}
