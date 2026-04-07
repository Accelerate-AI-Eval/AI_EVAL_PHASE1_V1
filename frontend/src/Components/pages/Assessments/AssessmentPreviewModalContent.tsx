/**
 * Shared assessment preview modal body: same content as Assessments page view popup.
 * Used by Assessments page and Organizations (org view → Assessments tab → View).
 */
import React from "react";
import { formatDateDDMMMYYYY } from "../../../utils/formatDate.js";
import { formatPreviewValue } from "../../../utils/formatPreviewValue";
import { BUYER_COTS_FIELD_KEYS } from "../../../constants/buyerCotsAssessmentKeys";
import LoadingMessage from "../../UI/LoadingMessage";

function getRowPreviewValue(row, key) {
  if (row == null) return undefined;
  const v = row[key];
  if (v == null || (typeof v === "string" && v.trim() === "")) return undefined;
  if (key === "createdAt" || key === "cotsUpdatedAt" || key === "expiryAt")
    return formatDateDDMMMYYYY(v);
  return v;
}

function formatSectorForPreview(value) {
  if (value == null || value === "") return undefined;
  if (typeof value === "string") {
    if (value === "[object Object]") return "N/A";
    return value;
  }
  if (typeof value !== "object" || Array.isArray(value)) return value;
  const sectorMap = {
    "Public Sector": value.public_sector,
    "Private Sector": value.private_sector,
    "Non-Profit Sector": value.non_profit_sector,
  };
  const parts = [];
  Object.entries(sectorMap).forEach(([label, values]) => {
    if (Array.isArray(values) && values.length > 0) {
      parts.push(`${label}: ${values.join(", ")}`);
    }
  });
  return parts.length > 0 ? parts.join("; ") : "N/A";
}

function isAssessmentExpired(row) {
  const expiryStr = row?.expiryAt;
  if (expiryStr == null || String(expiryStr).trim() === "") return false;
  try {
    const expiry = new Date(expiryStr);
    if (Number.isNaN(expiry.getTime())) return false;
    const today = new Date();
    expiry.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return expiry.getTime() < today.getTime();
  } catch {
    return false;
  }
}

function isAttestationExpiredForAssessment(row) {
  const expiryStr = row?.attestationExpiryAt;
  if (expiryStr == null || String(expiryStr).trim() === "") return false;
  try {
    const expiry = new Date(expiryStr);
    if (Number.isNaN(expiry.getTime())) return false;
    const today = new Date();
    expiry.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return expiry.getTime() < today.getTime();
  } catch {
    return false;
  }
}

function isAssessmentArchived(row) {
  return isAssessmentExpired(row) || isAttestationExpiredForAssessment(row);
}

function getAssessmentStatusLabel(row) {
  if (!row) return "—";
  const s = (row.status ?? "").toLowerCase();
  if (s === "draft") return "Draft";
  if (s === "expired") return "Expired";
  if (s === "submitted" || s === "completed") {
    return isAssessmentArchived(row) ? "Expired" : "Completed";
  }
  return row.status ?? "—";
}

const ASSESSMENT_PREVIEW_SECTIONS = [
  {
    title: "Assessment",
    fields: [
      {
        label: "Type",
        value: (r) =>
          r.type === "cots_buyer"
            ? "COTS Assessment"
            : r.type === "cots_vendor"
              ? "COTS Vendor"
              : (r.type ?? undefined),
      },
      { label: "Status", value: (r) => getAssessmentStatusLabel(r) },
      {
        label: "Created on",
        value: (r) =>
          formatDateDDMMMYYYY(
            (r?.status ?? "").toLowerCase() === "draft"
              ? (r.updatedAt ?? r.createdAt)
              : r.createdAt,
          ),
      },
      { label: "Expires on", value: (r) => formatDateDDMMMYYYY(r.expiryAt) },
    ],
  },
  {
    title: "Use Case",
    fields: BUYER_COTS_FIELD_KEYS.useCase.map((key) => ({
      label: key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase()),
      value: (r) => getRowPreviewValue(r, key),
    })),
  },
  {
    title: "Vendor Evaluation",
    fields: BUYER_COTS_FIELD_KEYS.vendorEvaluation.map((key) => ({
      label: key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase()),
      value: (r) => getRowPreviewValue(r, key),
    })),
  },
  {
    title: "Readiness",
    fields: BUYER_COTS_FIELD_KEYS.readiness.map((key) => ({
      label: key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase()),
      value: (r) => getRowPreviewValue(r, key),
    })),
  },
  {
    title: "Risk Profile",
    fields: BUYER_COTS_FIELD_KEYS.riskProfile.map((key) => ({
      label: key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase()),
      value: (r) => getRowPreviewValue(r, key),
    })),
  },
  {
    title: "Vendor Risk",
    fields: BUYER_COTS_FIELD_KEYS.vendorRisk.map((key) => ({
      label: key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase()),
      value: (r) => getRowPreviewValue(r, key),
    })),
  },
  {
    title: "Implementation",
    fields: BUYER_COTS_FIELD_KEYS.implementation.map((key) => ({
      label: key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase()),
      value: (r) => getRowPreviewValue(r, key),
    })),
  },
  {
    title: "Evidence",
    fields: BUYER_COTS_FIELD_KEYS.evidence.map((key) => ({
      label: key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase()),
      value: (r) => getRowPreviewValue(r, key),
    })),
  },
];

const VENDOR_COTS_FIELDS = [
  {
    label: "Customer organization",
    value: (row, detail) =>
      getRowPreviewValue(detail || row, "customerOrganizationName"),
  },
  {
    label: "Customer sector",
    value: (row, detail) =>
      formatSectorForPreview(
        getRowPreviewValue(detail || row, "customerSector"),
      ),
  },
  {
    label: "Primary pain point",
    value: (row, detail) =>
      getRowPreviewValue(detail || row, "primaryPainPoint"),
  },
  {
    label: "Expected outcomes",
    value: (row, detail) =>
      detail != null
        ? getRowPreviewValue(detail, "expectedOutcomes")
        : getRowPreviewValue(row, "vendorExpectedOutcomes"),
  },
  {
    label: "Budget range",
    value: (row, detail) =>
      getRowPreviewValue(detail || row, "customerBudgetRange"),
  },
  {
    label: "Timeline",
    value: (row, detail) =>
      getRowPreviewValue(detail || row, "implementationTimeline"),
  },
  {
    label: "Product name",
    value: (row, detail) => {
      const src = detail || row;
      const v = src?.attestationProductName;
      return v != null && String(v).trim() !== "" ? String(v).trim() : undefined;
    },
  },
  {
    label: "Product features",
    value: (row, detail) =>
      getRowPreviewValue(detail || row, "productFeatures"),
  },
  {
    label: "Implementation approach",
    value: (row, detail) =>
      getRowPreviewValue(detail || row, "implementationApproach"),
  },
  {
    label: "Customization level",
    value: (row, detail) =>
      getRowPreviewValue(detail || row, "customizationLevel"),
  },
  {
    label: "Integration complexity",
    value: (row, detail) =>
      getRowPreviewValue(detail || row, "integrationComplexity"),
  },
  {
    label: "Regulatory requirements",
    value: (row, detail) =>
      detail != null
        ? getRowPreviewValue(detail, "regulatoryRequirements")
        : getRowPreviewValue(row, "vendorRegulatoryRequirements"),
  },
  {
    label: "Regulatory requirements (other)",
    value: (row, detail) =>
      getRowPreviewValue(detail || row, "regulatoryRequirementsOther"),
  },
  {
    label: "Data sensitivity",
    value: (row, detail) =>
      detail != null
        ? getRowPreviewValue(detail, "dataSensitivity")
        : getRowPreviewValue(row, "vendorDataSensitivity"),
  },
  {
    label: "Customer risk tolerance",
    value: (row, detail) =>
      getRowPreviewValue(detail || row, "customerRiskTolerance"),
  },
  {
    label: "Alternatives considered",
    value: (row, detail) =>
      getRowPreviewValue(detail || row, "alternativesConsidered"),
  },
  {
    label: "Key advantages",
    value: (row, detail) =>
      getRowPreviewValue(detail || row, "keyAdvantages"),
  },
  {
    label: "Customer-specific risks",
    value: (row, detail) =>
      getRowPreviewValue(detail || row, "customerSpecificRisks"),
  },
  {
    label: "Customer-specific risks (other)",
    value: (row, detail) =>
      getRowPreviewValue(detail || row, "customerSpecificRisksOther"),
  },
];

export interface AssessmentPreviewModalContentProps {
  previewRow: {
    type?: string;
    status?: string;
    createdAt?: string;
    updatedAt?: string;
    expiryAt?: string;
    [key: string]: unknown;
  };
  vendorDetail?: Record<string, unknown> | null;
  vendorLoading?: boolean;
  /** Full buyer COTS row from GET /buyerCotsAssessment/:id (includes formula grade/score when submitted). */
  buyerDetail?: Record<string, unknown> | null;
  buyerLoading?: boolean;
}

function buyerFormulaReadinessRows(merged: Record<string, unknown>): React.ReactNode {
  const status = String(merged.status ?? "").toLowerCase();
  if (status === "draft") return null;
  const gradeRaw = merged.implementationReadinessGrade;
  const gradeStr =
    gradeRaw != null && String(gradeRaw).trim() !== ""
      ? String(gradeRaw).trim()
      : "";
  const irsRaw = merged.implementationRiskScore;
  const irsNum = typeof irsRaw === "number" ? irsRaw : Number(irsRaw);
  const hasIrs = Number.isFinite(irsNum);
  if (!gradeStr && !hasIrs) return null;
  return (
    <section className="vendor_preview_card">
      <h3 className="vendor_preview_card_title">Readiness (formula)</h3>
      <dl className="vendor_preview_list">
        {gradeStr ? (
          <div className="vendor_preview_row">
            <dt className="vendor_preview_label">Grade</dt>
            <dd className="vendor_preview_value">{gradeStr}</dd>
          </div>
        ) : null}
        {hasIrs ? (
          <div className="vendor_preview_row">
            <dt className="vendor_preview_label">Implementation risk score</dt>
            <dd className="vendor_preview_value">{Math.round(irsNum)}/100</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

export default function AssessmentPreviewModalContent({
  previewRow,
  vendorDetail,
  vendorLoading = false,
  buyerDetail = null,
  buyerLoading = false,
}: AssessmentPreviewModalContentProps) {
  const isVendor = (previewRow?.type ?? "").toLowerCase() === "cots_vendor";
  const isDraft = (previewRow?.status ?? "").toLowerCase() === "draft";
  const src = vendorDetail || previewRow;
  const buyerMerged: Record<string, unknown> = {
    ...previewRow,
    ...(buyerDetail ?? {}),
  };

  return (
    <div className="vendor_preview">
      <p className="vendor_preview_intro">
        {isVendor
          ? "Vendor COTS assessment details."
          : "Buyer COTS assessment details."}
      </p>
      <div className="vendor_preview_sections">
        {isVendor ? (
          <>
            <section className="vendor_preview_card">
              <h3 className="vendor_preview_card_title">Assessment</h3>
              <dl className="vendor_preview_list">
                <div className="vendor_preview_row">
                  <dt className="vendor_preview_label">Type</dt>
                  <dd className="vendor_preview_value">COTS Vendor</dd>
                </div>
                <div className="vendor_preview_row">
                  <dt className="vendor_preview_label">Status</dt>
                  <dd className="vendor_preview_value">
                    {getAssessmentStatusLabel(src)}
                  </dd>
                </div>
                <div className="vendor_preview_row">
                  <dt className="vendor_preview_label">
                    {isDraft ? "Drafted on" : "Created on"}
                  </dt>
                  <dd className="vendor_preview_value">
                    {formatDateDDMMMYYYY(
                      isDraft
                        ? (previewRow.updatedAt ?? previewRow.createdAt)
                        : previewRow.createdAt,
                    )}
                  </dd>
                </div>
                {!isDraft && (
                  <div className="vendor_preview_row">
                    <dt className="vendor_preview_label">Expires on</dt>
                    <dd className="vendor_preview_value vendor_preview_value_expiry">
                      {formatDateDDMMMYYYY(previewRow.expiryAt)}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
            <section className="vendor_preview_card">
              <h3 className="vendor_preview_card_title">Vendor COTS</h3>
              {vendorLoading ? (
                <LoadingMessage message="Loading assessment details…" />
              ) : (
                <dl className="vendor_preview_list">
                  {VENDOR_COTS_FIELDS.map(({ label, value }) => {
                    const val = value(previewRow, vendorDetail ?? undefined);
                    return (
                      <div key={label} className="vendor_preview_row">
                        <dt className="vendor_preview_label">{label}</dt>
                        <dd className="vendor_preview_value">
                          {formatPreviewValue(val, label)}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </section>
          </>
        ) : (
          <>
            {buyerLoading ? (
              <section className="vendor_preview_card">
                <LoadingMessage message="Loading assessment details…" />
              </section>
            ) : null}
            {ASSESSMENT_PREVIEW_SECTIONS.map((section) => (
              <section
                key={section.title}
                className="vendor_preview_card"
              >
                <h3 className="vendor_preview_card_title">{section.title}</h3>
                <dl className="vendor_preview_list">
                  {section.fields
                    .filter(
                      (field) =>
                        !(
                          field.label === "Expires on" &&
                          (previewRow?.status ?? "").toLowerCase() === "draft"
                        ),
                    )
                    .map((field) => {
                      const isDraftPreview =
                        (previewRow?.status ?? "").toLowerCase() === "draft";
                      const label =
                        field.label === "Created on" && isDraftPreview
                          ? "Drafted on"
                          : field.label;
                      const isExpiry = field.label === "Expires on";
                      return (
                        <div
                          key={field.label}
                          className="vendor_preview_row"
                        >
                          <dt className="vendor_preview_label">{label}</dt>
                          <dd
                            className={`vendor_preview_value${isExpiry ? " vendor_preview_value_expiry" : ""}`}
                          >
                            {formatPreviewValue(
                              field.value(previewRow),
                              field.label,
                            )}
                          </dd>
                        </div>
                      );
                    })}
                </dl>
              </section>
            ))}
            {!buyerLoading ? buyerFormulaReadinessRows(buyerMerged) : null}
          </>
        )}
      </div>
    </div>
  );
}
