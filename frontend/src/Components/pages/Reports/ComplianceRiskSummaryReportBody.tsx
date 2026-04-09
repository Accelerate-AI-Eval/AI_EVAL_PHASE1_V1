import { FileCheck, Gavel, ListOrdered, Scale, ShieldAlert } from "lucide-react";
import { formatFrameworkMappingFrameworkForDisplay } from "../../../utils/frameworkMappingFrameworkDisplay";
import "../Assessments/BuyerAssessment/buyer_vendor_risk_report.css";

export type CrsPayload = {
  version?: number;
  generatedAt?: string;
  assessmentId?: string;
  vendorName?: string;
  productName?: string;
  executiveRiskSummary?: {
    inherentRag?: string;
    residualRag?: string;
    summary?: string;
  };
  topRisks?: Array<{
    rank: number;
    title: string;
    likelihood: number;
    impact: number;
    lxi: number;
    drivers: string[];
  }>;
  complianceMapping?: Array<{
    framework: string;
    requirement: string;
    vendorControlOrEvidence: string;
  }>;
  vendorValidationNotes?: string;
  methodologyEvidenceTrail?: string;
};

export function parseComplianceRiskSummaryJson(
  raw: string | Record<string, unknown> | undefined | null,
): CrsPayload | null {
  if (raw == null) return null;
  let j: CrsPayload | null = null;
  if (typeof raw === "object" && !Array.isArray(raw)) {
    j = raw as CrsPayload;
  } else if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return null;
    try {
      j = JSON.parse(s) as CrsPayload;
    } catch {
      return null;
    }
  } else {
    return null;
  }
  if (!j || typeof j !== "object") return null;
  if (!j.executiveRiskSummary && !j.topRisks?.length) return null;
  return j;
}

function RagBadge({ level }: { level: string }) {
  const l = (level ?? "").trim();
  const cls =
    l === "Red"
      ? "crs_rag_red"
      : l === "Green"
        ? "crs_rag_green"
        : "crs_rag_amber";
  return <span className={`crs_rag_badge ${cls}`}>{l || "—"}</span>;
}

export default function ComplianceRiskSummaryReportBody({ data }: { data: CrsPayload }) {
  const exec = data.executiveRiskSummary ?? {};
  const topRisks = Array.isArray(data.topRisks) ? data.topRisks : [];
  const mapping = Array.isArray(data.complianceMapping) ? data.complianceMapping : [];

  return (
    <div className="report_vcm_wrap">
      <section className="bvr_card">
        <h2 className="bvr_section_title bvr_title_with_icon" style={{ marginTop: 0 }}>
          <Scale className="bvr_title_icon" size={22} strokeWidth={2} aria-hidden />
          <span>Executive risk summary (inherent → residual) + RAG</span>
        </h2>
        <div className="crs_rag_row" role="group" aria-label="Risk assessment grades">
          <span className="crs_rag_label">Inherent</span>
          <RagBadge level={exec.inherentRag ?? ""} />
          <span className="crs_rag_arrow" aria-hidden>
            →
          </span>
          <span className="crs_rag_label">Residual</span>
          <RagBadge level={exec.residualRag ?? ""} />
        </div>
        <p className="bvr_exec_text" style={{ marginTop: "0.75rem" }}>
          {exec.summary ?? "—"}
        </p>
      </section>

      <section className="bvr_card">
        <h2 className="bvr_section_title bvr_title_with_icon">
          <ListOrdered className="bvr_title_icon" size={22} strokeWidth={2} aria-hidden />
          <span>Top risks list (ranked) with L×I and drivers</span>
        </h2>
        {topRisks.length > 0 ? (
          <div className="crs_table_wrap">
            <table className="bvr_matrix_table crs_risks_table">
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Risk</th>
                  <th scope="col">L</th>
                  <th scope="col">I</th>
                  <th scope="col">L×I</th>
                  <th scope="col">Drivers</th>
                </tr>
              </thead>
              <tbody>
                {topRisks.map((r, i) => (
                  <tr key={i}>
                    <td>{r.rank}</td>
                    <td>{r.title ?? "—"}</td>
                    <td>{r.likelihood ?? "—"}</td>
                    <td>{r.impact ?? "—"}</td>
                    <td>{r.lxi ?? "—"}</td>
                    <td>
                      {(Array.isArray(r.drivers) ? r.drivers : []).length > 0 ? (
                        <ul className="crs_drivers_list">
                          {r.drivers.map((d, di) => (
                            <li key={di}>{d}</li>
                          ))}
                        </ul>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="bvr_reco_intro">No ranked risks in this report.</p>
        )}
      </section>

      <section className="bvr_card">
        <h2 className="bvr_section_title bvr_title_with_icon">
          <FileCheck className="bvr_title_icon" size={22} strokeWidth={2} aria-hidden />
          <span>Compliance mapping (framework → requirement → vendor control / evidence)</span>
        </h2>
        {mapping.length > 0 ? (
          <div className="crs_table_wrap">
            <table className="bvr_matrix_table crs_mapping_table">
              <thead>
                <tr>
                  <th scope="col">Framework</th>
                  <th scope="col">Requirement</th>
                  <th scope="col">Vendor control / evidence</th>
                </tr>
              </thead>
              <tbody>
                {mapping.map((row, i) => (
                  <tr key={i}>
                    <td>{formatFrameworkMappingFrameworkForDisplay(row.framework)}</td>
                    <td>{row.requirement ?? "—"}</td>
                    <td>{row.vendorControlOrEvidence ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="bvr_reco_intro">No compliance mapping rows.</p>
        )}
      </section>

      <section className="bvr_card bvr_warnings_card">
        <h2 className="bvr_section_title bvr_title_with_icon">
          <ShieldAlert className="bvr_title_icon" size={22} strokeWidth={2} aria-hidden />
          <span>Vendor validation notes (buyer-entered findings, if present)</span>
        </h2>
        <p className="bvr_exec_text" style={{ margin: 0 }}>
          {data.vendorValidationNotes?.trim() ? data.vendorValidationNotes : "No buyer validation notes were captured for this assessment."}
        </p>
      </section>

      <section className="bvr_card bvr_impl_card">
        <h2 className="bvr_section_title bvr_title_with_icon">
          <Gavel className="bvr_title_icon" size={22} strokeWidth={2} aria-hidden />
          <span>Methodology &amp; evidence trail</span>
        </h2>
        <p className="bvr_impl_text">{data.methodologyEvidenceTrail ?? "—"}</p>
      </section>
    </div>
  );
}
