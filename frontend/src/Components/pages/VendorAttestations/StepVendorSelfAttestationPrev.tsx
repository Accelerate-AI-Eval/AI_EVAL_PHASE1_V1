/**
 * Preview step for Vendor Self Attestation: shows Company Profile, Document Uploads, and all attestation data.
 * Uses the same UI as Vendor Onboarding preview (vendor_preview cards). Document rows keep View/Edit actions.
 */
import React from "react";
import { Eye, ShieldCheck, CircleArrowUp } from "lucide-react";
import type { VendorSelfAttestationFormState } from "../../../types/vendorSelfAttestation";
import { VENDOR_SELF_ATTESTATION } from "../../../constants/vendorAttestionData";
import { ATTESTATION_SECTION_FIELDS } from "../../../constants/vendorAttestationFields";
import { formatPreviewValueAsString } from "../../../utils/formatPreviewValue";
import { formatDateDDMMMYYYY } from "../../../utils/formatDate.js";
import "../VendorOnboarding/StepVendorOnboardingPreview.css";
import "./vendor_attestation_preview.css";

/** Step index for Document Upload section; Compliance & Certifications (Regulatory upload); Evidence & Supporting Documentation (Testing and Policy upload). */
const STEP_DOCUMENT_UPLOAD = 1;
const STEP_COMPLIANCE_CERTIFICATIONS = 4;
const STEP_EVIDENCE = 9;

export type ComplianceDocumentExpiryMeta = {
  category?: string;
  expiryAt?: string | null;
  error?: string;
};

export type FrameworkMappingPreviewRow = {
  framework?: unknown;
  coverage?: unknown;
  controls?: unknown;
  notes?: unknown;
};

interface StepVendorSelfAttestationPrevProps {
  formState: VendorSelfAttestationFormState;
  /** When provided, edit icon navigates to the given step (Document Upload = 1, Evidence = 9). */
  onNavigateToStep?: (step: number) => void;
  /** When provided, document names in Document Uploads are clickable and open the document. */
  attestationId?: string | null;
  /** Called when user clicks a document name; receives file name. Use to fetch with auth and open in new tab. */
  onOpenDocument?: (fileName: string) => void;
  /** Parsed PDF expiry metadata keyed by file name (from compliance_document_expiries). */
  complianceDocumentExpiries?: Record<string, ComplianceDocumentExpiryMeta> | null;
  /** Stored or derived framework/control mapping rows for this attestation. */
  frameworkMappingRows?: FrameworkMappingPreviewRow[] | null;
}

function formatFrameworkCell(v: unknown): string {
  if (v == null) return "—";
  const s = String(v).trim();
  return s || "—";
}

function lookupComplianceExpiry(
  fileName: string,
  map: Record<string, ComplianceDocumentExpiryMeta> | undefined | null,
): ComplianceDocumentExpiryMeta | null {
  if (!map || typeof map !== "object" || !fileName?.trim()) return null;
  const key = fileName.trim();
  const base = /[/\\]/.test(key) ? (key.split(/[/\\]/).pop() ?? key) : key;
  const meta = map[key] ?? map[base];
  return meta && typeof meta === "object" ? meta : null;
}

function ComplianceExpiryBesideView({ fileName, expiries }: { fileName: string; expiries?: Record<string, ComplianceDocumentExpiryMeta> | null }) {
  const meta = lookupComplianceExpiry(fileName, expiries);
  if (!meta) return null;
  const exp = meta.expiryAt?.trim();
  if (exp && !Number.isNaN(new Date(exp).getTime())) {
    const d = new Date(exp);
    const today = new Date();
    d.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const past = d.getTime() < today.getTime();
    return (
      <span
        className={`preview_regulatory_doc_expiry ${past ? "preview_regulatory_doc_expiry_past" : ""}`}
        title="Certificate expiry from document"
      >
        Expires: {formatDateDDMMMYYYY(exp)}
      </span>
    );
  }
  const err = (meta.error ?? "").trim();
  return (
    <span className="preview_regulatory_doc_expiry preview_regulatory_doc_expiry_na" title={err || undefined}>
      {err.toLowerCase().includes("not detected") ? "Expiry not detected" : err || "—"}
    </span>
  );
}

/** User-friendly preview: multi-select/industry/dependent dropdown as readable text, never raw array or JSON. */
function formatValue(val: unknown): string {
  return formatPreviewValueAsString(val);
}

function StepVendorSelfAttestationPrev({
  formState,
  onNavigateToStep,
  attestationId,
  onOpenDocument,
  complianceDocumentExpiries,
  frameworkMappingRows,
}: StepVendorSelfAttestationPrevProps) {
  const { companyProfile, attestation, documentUpload } = formState;

  const canOpenDocument = Boolean(attestationId && onOpenDocument);

  /** Returns display value and whether this row has documents (not N/A). */
  const renderDocumentValue = (names: string[]) => {
    if (!names?.length) return { content: "N/A", isNa: true };
    if (canOpenDocument) {
      return {
        isNa: false,
        content: (
          <>
            <span className="vendor_preview_doc_uploaded_label">Document uploaded: </span>
            {names.map((name, idx) => (
              <span key={`${name}-${idx}`}>
                {idx > 0 && ", "}
                <button
                  type="button"
                  className="preview-doc-link"
                  onClick={() => onOpenDocument?.(name)}
                >
                  {name}
                </button>
              </span>
            ))}
          </>
        ),
      };
    }
    return {
      isNa: false,
      content: (
        <>
          <span className="vendor_preview_doc_uploaded_label">Document uploaded: </span>
          {names.join(", ")}
        </>
      ),
    };
  };

  /** Actions for a document row: View opens document(s) when onOpenDocument is provided (no navigation); otherwise navigates to section. */
  const DocumentRowActions = ({
    step,
    show,
    documentNames = [],
    showUpdate = false,
    onUpdate,
  }: {
    step: number;
    show: boolean;
    documentNames?: string[];
    showUpdate?: boolean;
    onUpdate?: () => void;
  }) => {
    const canOpenDocs = documentNames.length > 0 && Boolean(attestationId && onOpenDocument);
    const showView = show && (canOpenDocs || onNavigateToStep);
    const showUpdateBtn = showUpdate && onUpdate;
    if (!showView && !showUpdateBtn) return null;
    const handleViewClick = () => {
      if (canOpenDocs) {
        documentNames.forEach((name) => onOpenDocument?.(name));
      } else if (onNavigateToStep) {
        onNavigateToStep(step);
      }
    };
    return (
      <span className="preview-doc-actions">
        {showView && (
          <button
            type="button"
            className="preview-view-btn"
            onClick={handleViewClick}
            title={canOpenDocs ? "Open document" : "View section"}
          >
            <Eye size={14} aria-hidden />
            <span style={{ marginLeft: "0.25rem" }}>View</span>
          </button>
        )}
        {showUpdateBtn && (
          <button
            type="button"
            className="preview-update-btn"
            onClick={onUpdate}
            title="Replace document"
          >
            <CircleArrowUp size={16} aria-hidden />
            <span style={{ marginLeft: "0.25rem" }}>Update</span>
          </button>
        )}
      </span>
    );
  };

  const companyProfileRows: { label: string; value: string }[] = [
    { label: "Vendor Name", value: formatValue(companyProfile.vendorName) },
    { label: "Vendor Type", value: formatValue(companyProfile.vendorType) },
    { label: "Vendor Maturity", value: formatValue(companyProfile.vendorMaturity) },
    { label: "Company Website", value: formatValue(companyProfile.companyWebsite) },
    { label: "Company Description", value: formatValue(companyProfile.companyDescription) },
    { label: "Employee Count", value: formatValue(companyProfile.employeeCount) },
    { label: "Year Founded", value: formatValue(companyProfile.yearFounded) },
    { label: "Headquarters", value: formatValue(companyProfile.headquartersLocation) },
    { label: "Operating Regions", value: formatValue(companyProfile.operatingRegions) },
  ];

  /** Regulatory and Compliance Certification Material — one heading, then list: "1. SOC2 Type 2 document uploaded  verified view update" */
  const categoriesWithDocs =
    documentUpload?.["2"]?.categories?.filter(
      (category) => (documentUpload["2"]?.byCategory?.[category] ?? []).length > 0
    ) ?? [];
  const regulatoryRows = (
    <div className="vendor_preview_row vendor_preview_row_regulatory">
      <dt className="vendor_preview_label">
        <span className="vendor_preview_doc_label">
          <span>Regulatory and Compliance Certification Material</span>
          {categoriesWithDocs.length === 0 && onNavigateToStep && (
            <span className="preview-doc-actions">
              <button
                type="button"
                className="preview-update-btn"
                onClick={() => onNavigateToStep(STEP_COMPLIANCE_CERTIFICATIONS)}
                title="Add documents"
              >
                <CircleArrowUp size={16} aria-hidden />
                <span style={{ marginLeft: "0.25rem" }}>Update</span>
              </button>
            </span>
          )}
        </span>
      </dt>
      <dd className="vendor_preview_value vendor_preview_value_regulatory_list">
        {categoriesWithDocs.length > 0 ? (
          <ol className="preview_regulatory_doc_list">
            {categoriesWithDocs.map((category) => {
              const names = documentUpload!["2"]!.byCategory![category] ?? [];
              const fileName = names[0];
              return (
                <li key={category} className="preview_regulatory_doc_item">
                  <span className="preview_regulatory_doc_line">
                    <span className="preview_regulatory_doc_category">{category}</span>
                    <span className="preview_regulatory_doc_uploaded"> {fileName}</span>
                  </span>
                  <span className="preview-doc-actions">
                    <span className="preview-regulatory-verified" title="Verified">
                      <ShieldCheck size={14} aria-hidden />
                      <span>Verified</span>
                    </span>
                    {fileName ? (
                      <ComplianceExpiryBesideView fileName={fileName} expiries={complianceDocumentExpiries} />
                    ) : null}
                    {canOpenDocument && fileName && (
                      <button
                        type="button"
                        className="preview-view-btn"
                        onClick={() => onOpenDocument?.(fileName)}
                        aria-label={`View ${fileName}`}
                      >
                        <Eye size={14} aria-hidden />
                        <span style={{ marginLeft: "0.25rem" }}>View</span>
                      </button>
                    )}
                    {onNavigateToStep && (
                      <button
                        type="button"
                        className="preview-update-btn"
                        onClick={() => onNavigateToStep(STEP_COMPLIANCE_CERTIFICATIONS)}
                        title="Upload document"
                      >
                        <CircleArrowUp size={16} aria-hidden />
                        <span style={{ marginLeft: "0.25rem" }}>Update</span>
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        ) : (
          <>N/A</>
        )}
      </dd>
    </div>
  );

  return (
    <div className="vendor_preview vendor-attestation-preview">
      <p className="vendor_preview_intro">
        Review your attestation below.
      </p>
      <div className="vendor_preview_sections">
        {/* Company Profile */}
        <section className="vendor_preview_card">
          <h3 className="vendor_preview_card_title">Company Profile</h3>
          <dl className="vendor_preview_list">
            {companyProfileRows.map((row) => (
              <div key={row.label} className="vendor_preview_row">
                <dt className="vendor_preview_label">{row.label}</dt>
                <dd className="vendor_preview_value">{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* Document Uploads: same UI as Company Profile (dl list) */}
        <section className="vendor_preview_card">
          <h3 className="vendor_preview_card_title">Document Uploads</h3>
          <dl className="vendor_preview_list">
            {(() => {
              const names0 = documentUpload?.["0"] ?? [];
              const doc0 = renderDocumentValue(names0);
              return (
                <div key="doc0" className="vendor_preview_row">
                  <dt className="vendor_preview_label">
                    <span className="vendor_preview_doc_label">
                      <span>{VENDOR_SELF_ATTESTATION.document_upload["0"]?.label ?? "Marketing and Product Material"}</span>
                      <DocumentRowActions step={STEP_DOCUMENT_UPLOAD} show={!doc0.isNa} documentNames={names0} />
                    </span>
                  </dt>
                  <dd className="vendor_preview_value">{doc0.content}</dd>
                </div>
              );
            })()}
            {(() => {
              const names1 = documentUpload?.["1"] ?? [];
              const doc1 = renderDocumentValue(names1);
              return (
                <div key="doc1" className="vendor_preview_row">
                  <dt className="vendor_preview_label">
                    <span className="vendor_preview_doc_label">
                      <span>{VENDOR_SELF_ATTESTATION.document_upload["1"]?.label ?? "Technical Product Specifications Material"}</span>
                      <DocumentRowActions step={STEP_DOCUMENT_UPLOAD} show={!doc1.isNa} documentNames={names1} />
                    </span>
                  </dt>
                  <dd className="vendor_preview_value">{doc1.content}</dd>
                </div>
              );
            })()}
            {(() => {
              const evidenceNames = documentUpload?.evidenceTestingPolicy ?? [];
              const evidenceDoc = renderDocumentValue(evidenceNames);
              return (
                <div key="evidence" className="vendor_preview_row">
                  <dt className="vendor_preview_label">
                    <span className="vendor_preview_doc_label">
                      <span>Testing and Policy Documentation</span>
                      <DocumentRowActions step={STEP_EVIDENCE} show={!evidenceDoc.isNa} documentNames={evidenceNames} />
                    </span>
                  </dt>
                  <dd className="vendor_preview_value">{evidenceDoc.content}</dd>
                </div>
              );
            })()}
          </dl>
        </section>

        {/* Attestation sections (dynamic fields) */}
        {Object.entries(ATTESTATION_SECTION_FIELDS).map(([sectionKey, mappings]) => {
          const sectionData = (VENDOR_SELF_ATTESTATION as Record<string, Record<string, { label: string }>>)[sectionKey];
          if (!sectionData || !mappings.length) return null;
          const title = sectionKey.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          const entries = Object.entries(sectionData)
            .filter(([k]) => k !== "length" && Object.prototype.hasOwnProperty.call(sectionData, k))
            .sort((a, b) => Number(a[0]) - Number(b[0]));
          const isComplianceCertifications = sectionKey === "compliance_certifications";
          return (
            <section key={sectionKey} className="vendor_preview_card">
              <h3 className="vendor_preview_card_title">{title}</h3>
              <dl className="vendor_preview_list">
                {entries.map(([dataIndexStr, fieldConfig]) => {
                  const dataIndex = Number(dataIndexStr);
                  const mapping = mappings[dataIndex];
                  if (!mapping) return null;
                  const val = attestation[mapping.key];
                  return (
                    <div key={mapping.key} className="vendor_preview_row">
                      <dt className="vendor_preview_label">{fieldConfig.label}</dt>
                      <dd className="vendor_preview_value">{formatValue(val)}</dd>
                    </div>
                  );
                })}
                {isComplianceCertifications && regulatoryRows}
              </dl>
            </section>
          );
        })}

        {frameworkMappingRows != null && frameworkMappingRows.length > 0 && (
          <section className="vendor_preview_card vendor_preview_framework_mapping">
            <h3 className="vendor_preview_card_title">Framework mapping</h3>
            <div className="vendor_preview_framework_table_wrap">
              <table className="vendor_preview_framework_table">
                <thead>
                  <tr>
                    <th scope="col">Framework</th>
                    <th scope="col">Coverage</th>
                    <th scope="col">Controls</th>
                    <th scope="col">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {frameworkMappingRows.map((row, i) => (
                    <tr key={i}>
                      <td>{formatFrameworkCell(row.framework)}</td>
                      <td>{formatFrameworkCell(row.coverage)}</td>
                      <td>{formatFrameworkCell(row.controls)}</td>
                      <td>{formatFrameworkCell(row.notes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default StepVendorSelfAttestationPrev;
