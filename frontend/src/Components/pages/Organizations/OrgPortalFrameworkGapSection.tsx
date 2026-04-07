/**
 * Organizations portal: regulatory framework mapping (vendor COTS / buyer report) + certification gap vs buyer industry segment.
 */
import React from "react";
import { Layers, ListChecks } from "lucide-react";
import { frameworkControlsDisplayLines } from "../../../utils/frameworkMappingControlsDisplay";

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
  /** False when Vendor COTS has no substantive regulatory requirements (None/N/A only); engagement mapping is omitted. */
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

function FrameworkControlsCell({ value }: { value: string | undefined }) {
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

function FrameworkTable({ rows, emptyMessage }: { rows: FrameworkMappingRow[]; emptyMessage: string }) {
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
                <td className="report_framework_td_name">{formatCell(row.framework)}</td>
                <td>{formatCell(row.coverage)}</td>
                <td className="report_framework_td_controls">
                  <FrameworkControlsCell value={row.controls} />
                </td>
                <td>{formatCell(row.notes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function OrgPortalFrameworkGapSectionVendor({ portal }: { portal: VendorOrganizationalPortal }) {
  const regulatoryDocMissing = portal.regulatoryRequirementsDocumentProvided === false;
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
        Regulatory context from this vendor COTS assessment and product attestation, compared to certifications relevant to the buyer segment{" "}
        <strong style={{ color: "#374151" }}>({segmentLabel})</strong>. Gaps are informational only; irrelevant certifications are not scored.
      </p>

      <div className="org_portal_compliance_subsection">
        <h3 className="org_portal_compliance_subtitle">Engagement framework mapping (Vendor COTS)</h3>
        <p className="org_portal_compliance_hint">
          {regulatoryDocMissing
            ? "No substantive regulatory requirements were specified on this Vendor COTS assessment (e.g. only None/Not applicable). Engagement mapping from the assessment is not shown."
            : "Derived from customer regulatory selections and sector (same basis as sales-risk CFR)."}
        </p>
        <FrameworkTable
          rows={portal.frameworkMappingRows}
          emptyMessage={
            regulatoryDocMissing
              ? "Document not provided."
              : "No framework mapping rows were generated for this assessment."
          }
        />
      </div>

      {portal.attestationFrameworkRows.length > 0 ? (
        <div className="org_portal_compliance_subsection" style={{ marginTop: "1.5rem" }}>
          <h3 className="org_portal_compliance_subtitle">Product attestation — compliance evidence mapping</h3>
          <p className="org_portal_compliance_hint">From parsed/stored attestation framework rows (when available).</p>
          <FrameworkTable rows={portal.attestationFrameworkRows} emptyMessage="—" />
        </div>
      ) : null}

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
                    <td className="report_framework_td_name">{row.framework}</td>
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
                    <td className="report_framework_td_name">{row.framework}</td>
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
