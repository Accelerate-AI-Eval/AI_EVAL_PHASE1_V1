/**
 * Organizations portal: regulatory framework mapping (vendor COTS / buyer report) + certification gap vs buyer industry segment.
 */
import React from "react";
import { Layers, ListChecks } from "lucide-react";
import {
  frameworkControlsDisplayLines,
  frameworkControlsDisplayLinesTopRanked,
  FRAMEWORK_MAPPING_TOP_CONTROLS_MAX,
} from "../../../utils/frameworkMappingControlsDisplay";
import { sanitizeFrameworkMappingNotesForDisplay } from "../../../utils/frameworkMappingNotesDisplay";
import { formatFrameworkMappingFrameworkForDisplay } from "../../../utils/frameworkMappingFrameworkDisplay";
import { FrameworkMappingCardGrid } from "../../frameworkMapping/FrameworkMappingCardGrid";

export type FrameworkMappingRow = {
  framework: string;
  coverage?: string;
  controls?: string;
  notes?: string;
};

export type CertificationGapRow = {
  framework: string;
  status: "met" | "gap";
  points?: number;
  detail?: string;
};

export type VendorOrganizationalPortal = {
  frameworkMappingRows: FrameworkMappingRow[];
  attestationFrameworkRows: FrameworkMappingRow[];
  regulatoryRequirementsDocumentProvided?: boolean;
  buyerIndustrySegment: string;
  relevantFrameworks: string[];
  certificationGapAnalysis: CertificationGapRow[];
  allDetectedCertifications: { framework: string; points?: number; detail?: string }[];
};

export type BuyerOrganizationalPortal = {
  reportFrameworkMappingRows: FrameworkMappingRow[];
  buyerIndustrySegment: string;
  relevantFrameworks: string[];
  certificationGapAnalysis: CertificationGapRow[];
  allDetectedCertifications: { framework: string; points?: number; detail?: string }[];
};

function formatCell(v: string | undefined): string {
  if (v == null || String(v).trim() === "") return "—";
  return String(v);
}

function FrameworkControlsCell({
  value,
  topRankedMax,
}: {
  value: string | undefined;
  /** Top-N lines with bullet prefix (• controlId: …). Omit to show all parsed lines without prefix. */
  topRankedMax?: number;
}) {
  if (topRankedMax != null && topRankedMax > 0) {
    const ranked = frameworkControlsDisplayLinesTopRanked(value, topRankedMax);
    if (ranked.length === 0) return <>{formatCell(value)}</>;
    return (
      <div className="report_framework_controls_stack">
        {ranked.map((line, i) => (
          <div key={i} className="report_framework_control_line">
            {line}
          </div>
        ))}
      </div>
    );
  }
  const lines = frameworkControlsDisplayLines(value);
  if (lines.length === 0) return <>{formatCell(value)}</>;
  return (
    <div className="report_framework_controls_stack">
      {lines.map((line, i) => (
        <div key={i} className="report_framework_control_line">
          {line}
        </div>
      ))}
    </div>
  );
}

function FrameworkTable({
  rows,
  emptyMessage,
  controlsTopRankedMax,
}: {
  rows: FrameworkMappingRow[];
  emptyMessage: string;
  /** When set, controls column shows only the first N entries, each with a bullet prefix. */
  controlsTopRankedMax?: number;
}) {
  if (!rows.length) {
    return <p className="org_portal_compliance_empty">{emptyMessage}</p>;
  }
  return (
    <div className="report_framework_table_shell">
      <div className="report_table_wrap report_framework_table_wrap">
        <table className="report_table report_framework_table">
          <thead>
            <tr>
              <th scope="col">Framework</th>
              <th scope="col">Coverage</th>
              <th scope="col">Controls</th>
              <th scope="col">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.framework}-${i}`}>
                <td className="report_framework_td_name">
                  {formatFrameworkMappingFrameworkForDisplay(row.framework)}
                </td>
                <td>{formatCell(row.coverage)}</td>
                <td className="report_framework_td_controls">
                  <FrameworkControlsCell value={row.controls} topRankedMax={controlsTopRankedMax} />
                </td>
                <td>{formatCell(sanitizeFrameworkMappingNotesForDisplay(row.notes))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function OrgPortalFrameworkGapSectionVendor({
  portal,
  frameworkMappingAssessmentLabel,
}: {
  portal: VendorOrganizationalPortal;
  /** Shown on Know More detail (e.g. assessment title from Organizations view). */
  frameworkMappingAssessmentLabel?: string;
}) {
  const segmentLabel =
    portal.buyerIndustrySegment && portal.buyerIndustrySegment !== "other"
      ? portal.buyerIndustrySegment
      : "Other (default relevance set)";
  return (
    <section className="org_portal_compliance_section assessment_details_reports_section" style={{ marginTop: "2rem", maxWidth: "900px" }}>
      <h2 className="assessment_details_reports_heading org_portal_compliance_main_title" style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
        <span className="org_portal_compliance_icon" aria-hidden>
          <Layers size={20} />
        </span>
        Framework mapping & gap analysis
      </h2>
      <p className="org_portal_compliance_lead" style={{ color: "#6b7280", fontSize: "0.9375rem", marginBottom: "1.25rem" }}>
        Framework mapping comes only from the linked product attestation (compliance evidence). Certification gap analysis uses the buyer segment{" "}
        <strong style={{ color: "#374151" }}>({segmentLabel})</strong>. Gaps are informational only; irrelevant certifications are not scored.
      </p>

      <div className="org_portal_compliance_subsection">
        <h3 className="org_portal_compliance_subtitle">Framework mapping (product attestation)</h3>
        <p className="org_portal_compliance_hint">
          Rows reflect frameworks from the vendor&apos;s linked self-attestation compliance mapping, filtered by regulatory requirements selected on this Vendor COTS assessment. Any selected framework missing from the attestation shows &quot;Not provided&quot; for coverage and controls. At most three controls are stored and shown per row, listed with bullet markers and control identifiers.
        </p>
        <FrameworkMappingCardGrid
          rows={portal.frameworkMappingRows}
          emptyMessage="Not provided."
          assessmentLabel={frameworkMappingAssessmentLabel}
          certificationGaps={portal.certificationGapAnalysis}
          detailSource="organizational_portal"
        />
      </div>

      <div className="org_portal_compliance_subsection" style={{ marginTop: "1.5rem" }}>
        <h3 className="org_portal_compliance_subtitle">
          <span className="org_portal_compliance_icon" aria-hidden>
            <ListChecks size={18} />
          </span>
          Certification gap analysis (buyer segment relevance)
        </h3>
        <p className="org_portal_compliance_hint">
          “Met” = detected in linked product attestation (certificates/uploads/text). “Gap” = relevant to your industry segment but not detected in attestation data.
        </p>
        <div className="report_framework_table_shell">
          <div className="report_table_wrap report_framework_table_wrap">
            <table className="report_table report_framework_table">
              <thead>
                <tr>
                  <th scope="col">Framework</th>
                  <th scope="col">Status</th>
                  <th scope="col">Points (matrix)</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {portal.certificationGapAnalysis.map((row) => (
                  <tr key={row.framework}>
                    <td className="report_framework_td_name">
                      {formatFrameworkMappingFrameworkForDisplay(row.framework)}
                    </td>
                    <td>
                      <span className={row.status === "met" ? "org_portal_gap_met" : "org_portal_gap_gap"}>
                        {row.status === "met" ? "Met" : "Gap"}
                      </span>
                    </td>
                    <td>{row.points != null && Number.isFinite(row.points) ? row.points : "—"}</td>
                    <td>{formatCell(row.detail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

export function OrgPortalFrameworkGapSectionBuyer({ portal }: { portal: BuyerOrganizationalPortal }) {
  const segmentLabel =
    portal.buyerIndustrySegment && portal.buyerIndustrySegment !== "other"
      ? portal.buyerIndustrySegment
      : "Other (default relevance set)";
  return (
    <section className="org_portal_compliance_section assessment_details_reports_section" style={{ marginTop: "2rem", maxWidth: "900px" }}>
      <h2 className="assessment_details_reports_heading org_portal_compliance_main_title" style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "0.5rem" }}>
        <span className="org_portal_compliance_icon" aria-hidden>
          <Layers size={20} />
        </span>
        Framework mapping & gap analysis
      </h2>
      <p className="org_portal_compliance_lead" style={{ color: "#6b7280", fontSize: "0.9375rem", marginBottom: "1.25rem" }}>
        Vendor risk report framework mapping (when present) and certification gap vs buyer industry segment{" "}
        <strong style={{ color: "#374151" }}>({segmentLabel})</strong>, using buyer-stated vendor certifications.
      </p>

      <div className="org_portal_compliance_subsection">
        <h3 className="org_portal_compliance_subtitle">Framework mapping (vendor risk report)</h3>
        <FrameworkTable
          rows={portal.reportFrameworkMappingRows}
          emptyMessage="No framework mapping rows are present on the vendor risk report yet."
          controlsTopRankedMax={FRAMEWORK_MAPPING_TOP_CONTROLS_MAX}
        />
      </div>

      <div className="org_portal_compliance_subsection" style={{ marginTop: "1.5rem" }}>
        <h3 className="org_portal_compliance_subtitle">
          <span className="org_portal_compliance_icon" aria-hidden>
            <ListChecks size={18} />
          </span>
          Certification gap analysis
        </h3>
        <p className="org_portal_compliance_hint">“Met” / “Gap” vs segment-relevant trust frameworks from stated vendor certifications on this assessment.</p>
        <div className="report_framework_table_shell">
          <div className="report_table_wrap report_framework_table_wrap">
            <table className="report_table report_framework_table">
              <thead>
                <tr>
                  <th scope="col">Framework</th>
                  <th scope="col">Status</th>
                  <th scope="col">Points (matrix)</th>
                  <th scope="col">Detail</th>
                </tr>
              </thead>
              <tbody>
                {portal.certificationGapAnalysis.map((row) => (
                  <tr key={row.framework}>
                    <td className="report_framework_td_name">
                      {formatFrameworkMappingFrameworkForDisplay(row.framework)}
                    </td>
                    <td>
                      <span className={row.status === "met" ? "org_portal_gap_met" : "org_portal_gap_gap"}>
                        {row.status === "met" ? "Met" : "Gap"}
                      </span>
                    </td>
                    <td>{row.points != null && Number.isFinite(row.points) ? row.points : "—"}</td>
                    <td>{formatCell(row.detail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
