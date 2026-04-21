import {
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
  ListOrdered,
  Puzzle,
  SlidersHorizontal,
  Table2,
} from "lucide-react";
import "../Assessments/BuyerAssessment/buyer_vendor_risk_report.css";

export type VcmPayload = {
  version?: number;
  generatedAt?: string;
  assessmentId?: string;
  vendorName?: string;
  productName?: string;
  buyerPrioritiesAndWeights?: Array<{
    priority: string;
    weightPercent: number;
    notes?: string;
  }>;
  rankedEligibleVendors?: Array<{
    rank: number;
    vendorName: string;
    productName: string;
    eligible?: boolean;
    overallScore?: number;
    notes?: string;
  }>;
  comparisonMatrix?: Array<{
    dimension: string;
    cells: { vendorLabel: string; highlight: string }[];
  }>;
  capabilityGapsByVendor?: Array<{ vendorLabel: string; gaps: string[] }>;
  recommendationSummary?: string[];
};

export function parseVendorComparisonMatrixJson(
  raw: string | Record<string, unknown> | undefined | null,
): VcmPayload | null {
  if (raw == null) return null;
  let j: VcmPayload | null = null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    j = raw as VcmPayload;
  } else if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;
    try {
      j = JSON.parse(s) as VcmPayload;
    } catch {
      return null;
    }
  } else {
    return null;
  }
  if (!j || typeof j !== "object") return null;
  if (!Array.isArray(j.buyerPrioritiesAndWeights)) return null;
  return j;
}

const VCM_RING_R = 20;
const VCM_RING_STROKE = 3.5;
const VCM_RING_C = 2 * Math.PI * VCM_RING_R;

function VcmPriorityWeightRing({ percent }: { percent: number }) {
  const raw = Number(percent);
  const p = Number.isFinite(raw)
    ? Math.min(100, Math.max(0, Math.round(raw)))
    : 0;
  const offset = VCM_RING_C * (1 - p / 100);
  const vb = 56;
  const c = vb / 2;

  return (
    <div
      className="bvr_vcm_priority_ring_wrap"
      role="img"
      aria-label={`${p} percent weight`}
    >
      <svg className="bvr_vcm_priority_ring_svg" viewBox={`0 0 ${vb} ${vb}`} width={vb} height={vb}>
        <circle
          className="bvr_vcm_ring_track"
          cx={c}
          cy={c}
          r={VCM_RING_R}
          fill="none"
          strokeWidth={VCM_RING_STROKE}
        />
        <circle
          className="bvr_vcm_ring_progress"
          cx={c}
          cy={c}
          r={VCM_RING_R}
          fill="none"
          strokeWidth={VCM_RING_STROKE}
          strokeDasharray={VCM_RING_C}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${c} ${c})`}
        />
      </svg>
      <span className="bvr_vcm_ring_pct">{p}%</span>
    </div>
  );
}

export default function VendorComparisonMatrixReportBody({ data }: { data: VcmPayload }) {
  const priorities = data.buyerPrioritiesAndWeights ?? [];
  const ranked = data.rankedEligibleVendors ?? [];
  const matrix = data.comparisonMatrix ?? [];
  const gaps = data.capabilityGapsByVendor ?? [];
  const summary = data.recommendationSummary ?? [];

  return (
    <div className="report_vcm_wrap">
      <section className="bvr_card">
        <h2
          className="bvr_section_title bvr_title_with_icon report_exec_brief_section_title"
          style={{ marginTop: 0 }}
        >
          <SlidersHorizontal className="bvr_title_icon" size={22} strokeWidth={2} aria-hidden />
          <span>Buyer priorities &amp; weights</span>
        </h2>
        <p className="bvr_reco_intro">
          Criteria and weights derived from the complete assessment report.
        </p>
        <ul
          className="bvr_warnings_list bvr_buyer_priorities_grid_2col"
          style={{ listStyle: "none", padding: 0 }}
        >
          {priorities.map((p, i) => (
            <li key={i} className="bvr_priority_item bvr_vcm_priority_item">
              <div className="bvr_vcm_priority_row">
                <VcmPriorityWeightRing percent={p.weightPercent} />
                <div className="bvr_vcm_priority_text">
                  <strong className="bvr_vcm_priority_title">{p.priority}</strong>
                  {p.notes ? <p className="bvr_vcm_priority_note">{p.notes}</p> : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="bvr_card">
        <h2 className="bvr_section_title bvr_title_with_icon">
          <ListOrdered className="bvr_title_icon" size={22} strokeWidth={2} aria-hidden />
          <span>Ranked vendor list</span>
        </h2>
        <p className="bvr_reco_intro">Shortlist-ready vendors in rank order.</p>
        {ranked.length > 0 ? (
          <ul className="bvr_recommendations_list">
            {ranked.map((v, i) => (
              <li key={i} className="bvr_recommendation_row">
                <span className="bvr_rank_badge">{v.rank}</span>
                <div className="bvr_reco_body">
                  <h3 className="bvr_reco_title">
                    {v.vendorName} — {v.productName}
                  </h3>
                  {v.overallScore != null ? (
                    <p className="bvr_reco_time">
                      <strong>Score:</strong> {v.overallScore}/100
                    </p>
                  ) : null}
                  {v.notes ? <p className="bvr_reco_desc">{v.notes}</p> : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="bvr_reco_intro" style={{ marginTop: 0 }}>
            No vendors met eligibility for this shortlist in the generated matrix.
          </p>
        )}
      </section>

      <section className="bvr_card">
        <h2 className="bvr_section_title bvr_title_with_icon">
          <Table2 className="bvr_title_icon" size={22} strokeWidth={2} aria-hidden />
          <span>Side-by-side matrix</span>
        </h2>
        {(matrix ?? []).map((row, ri) => {
          const cells = Array.isArray(row.cells) ? row.cells : [];
          return (
            <div key={ri} style={{ marginTop: ri === 0 ? 0 : "1.25rem" }}>
              <h3 className="bvr_reco_title" style={{ fontSize: "1rem", marginBottom: "0.5rem" }}>
                {row.dimension ?? "—"}
              </h3>
              {cells.length > 0 ? (
                <table className="bvr_matrix_table">
                  <thead>
                    <tr>
                      <th scope="col">Vendor</th>
                      <th scope="col">Highlight</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cells.map((c, ci) => (
                      <tr key={ci}>
                        <td>{c.vendorLabel ?? "—"}</td>
                        <td>{c.highlight ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
          );
        })}
      </section>

      <section className="bvr_card bvr_warnings_card">
        <h2 className="bvr_section_title bvr_title_with_icon">
          <Puzzle className="bvr_title_icon" size={22} strokeWidth={2} aria-hidden />
          <span>Capability gaps per vendor</span>
        </h2>
        {(gaps ?? []).map((g, i) => {
          const gapList = Array.isArray(g.gaps) ? g.gaps : [];
          return (
            <div key={i} style={{ marginTop: i === 0 ? 0 : "1rem" }}>
              <h3 className="bvr_reco_title" style={{ fontSize: "1rem" }}>
                {g.vendorLabel ?? "—"}
              </h3>
              <ul className="bvr_warnings_list">
                {gapList.map((gap, j) => (
                  <li key={j} className="bvr_warning_item">
                    <AlertTriangle className="bvr_warning_icon" size={20} aria-hidden />
                    <span>{gap}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="bvr_card">
        <h2 className="bvr_section_title bvr_title_with_icon">
          <Lightbulb className="bvr_title_icon" size={22} strokeWidth={2} aria-hidden />
          <span>Recommendation summary</span>
        </h2>
        <p className="bvr_reco_intro">Synthesized from the complete report used for generation.</p>
        <ul className="bvr_warnings_list">
          {summary.map((line, i) => (
            <li key={i} className="bvr_warning_item">
              <CheckCircle2 className="bvr_strength_icon" size={20} aria-hidden />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
