/**
 * Shared assessment preview modal body: same content as Assessments page view popup.
 * Used by Assessments page and Organizations (org view → Assessments tab → View).
 */
import React from "react";
import { formatDateDDMMMYYYY } from "../../../utils/formatDate.js";
import { formatPreviewValue } from "../../../utils/formatPreviewValue";
import { BUYER_COTS_FIELD_KEYS } from "../../../constants/buyerCotsAssessmentKeys";
import { BUYER_COTS_ASSESSMENT } from "../../../constants/buyerCOTSData 1";
import {
  VENDOR_COTS_FORM_SECTIONS,
  type VendorCotsFieldConfig,
} from "../../../constants/vendorCotsFormSchema";
import LoadingMessage from "../../UI/LoadingMessage";
import FileUpload from "../../UI/FileUpload";
import { normalizeDisplayLetterGrade } from "../../../utils/completeReportGrade.js";
import { formatScore2 } from "../../../utils/scoreFormat";

function getRowPreviewValue(
  row: Record<string, unknown> | null | undefined,
  key: string,
) {
  if (row == null) return undefined;
  const v = row[key];
  if (v == null || (typeof v === "string" && v.trim() === "")) return undefined;
  if (key === "createdAt" || key === "cotsUpdatedAt" || key === "expiryAt" || key === "researchDate")
    return formatDateDDMMMYYYY(v);
  return v;
}

function isAssessmentExpired(row: Record<string, unknown> | null | undefined) {
  const expiryStr = row?.expiryAt;
  if (expiryStr == null || String(expiryStr).trim() === "") return false;
  try {
    const expiry = new Date(String(expiryStr));
    if (Number.isNaN(expiry.getTime())) return false;
    const today = new Date();
    expiry.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return expiry.getTime() < today.getTime();
  } catch {
    return false;
  }
}

function isAttestationExpiredForAssessment(row: Record<string, unknown> | null | undefined) {
  const expiryStr = row?.attestationExpiryAt;
  if (expiryStr == null || String(expiryStr).trim() === "") return false;
  try {
    const expiry = new Date(String(expiryStr));
    if (Number.isNaN(expiry.getTime())) return false;
    const today = new Date();
    expiry.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return expiry.getTime() < today.getTime();
  } catch {
    return false;
  }
}

function isAssessmentArchived(row: Record<string, unknown> | null | undefined) {
  return isAssessmentExpired(row) || isAttestationExpiredForAssessment(row);
}

function getAssessmentStatusLabel(row: Record<string, unknown> | null | undefined) {
  if (!row) return "—";
  const s = String(row.status ?? "").toLowerCase();
  if (s === "draft") return "Draft";
  if (s === "expired") return "Expired";
  if (s === "submitted" || s === "completed") {
    return isAssessmentArchived(row) ? "Expired" : "Completed";
  }
  return String(row.status ?? "—");
}

function parseListValue(value: unknown): unknown[] {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    const s = value.trim();
    if (s.startsWith("[") || s.startsWith("{")) {
      try {
        const parsed = JSON.parse(s) as unknown;
        if (Array.isArray(parsed)) return parsed;
      } catch {
        /* ignore */
      }
    }
    return s ? [s] : [];
  }
  return [];
}

function valueIncludesToken(src: Record<string, unknown>, key: string, token: string): boolean {
  const raw = src[key];
  const list = parseListValue(raw);
  if (list.length > 0) {
    return list.some((item) => String(item) === token || String(item).includes(token));
  }
  return String(raw ?? "").includes(token);
}

function fieldHasValue(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

function parseFileNamesValue(value: unknown): string[] {
  if (value == null || String(value).trim() === "") return [];
  if (Array.isArray(value)) {
    return value.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  }
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string" && x.trim() !== "")
      : [];
  } catch {
    const s = String(value).trim();
    return s ? [s] : [];
  }
}

function isUploadField(config: { label?: string; placeholder?: string; options?: unknown } | undefined): boolean {
  if (!config) return false;
  const label = (config.label ?? "").toLowerCase();
  const placeholder = (config.placeholder ?? "").toLowerCase();
  return !config.options && (label.includes("upload") || placeholder.includes("upload"));
}

const BUYER_SECTION_ORDER: (keyof typeof BUYER_COTS_FIELD_KEYS)[] = [
  "context",
  "purchase",
  "dataLegal",
  "oversight",
  "environment",
  "vendorTrust",
  "exit",
  "provenance",
];

const BUYER_SECTION_TITLES: Record<string, string> = {
  context: "Context",
  purchase: "What we are buying",
  dataLegal: "Data and legal",
  oversight: "Oversight",
  environment: "Environment",
  vendorTrust: "Vendor trust",
  exit: "If it goes away",
  provenance: "Provenance",
};

function camelToLabel(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());
}

function shouldShowVendorField(
  field: VendorCotsFieldConfig,
  src: Record<string, unknown>,
): boolean {
  if (field.showWhen) {
    return valueIncludesToken(src, field.showWhen.key, field.showWhen.includes);
  }
  return true;
}

function vendorFieldDisplayValue(
  field: VendorCotsFieldConfig,
  src: Record<string, unknown>,
): unknown {
  if (field.key === "selectedProductId") {
    const name = src.attestationProductName;
    if (name != null && String(name).trim() !== "") return String(name).trim();
  }
  return getRowPreviewValue(src, field.key);
}

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
  /** Organizations system-admin view: hide inline readiness; show in Reports section instead. */
  hideBuyerReadinessFormula?: boolean;
}

function buyerFormulaReadinessRows(merged: Record<string, unknown>): React.ReactNode {
  const status = String(merged.status ?? "").toLowerCase();
  if (status === "draft") return null;
  const gradeRaw = merged.implementationReadinessGrade;
  const gradeStr =
    gradeRaw != null && String(gradeRaw).trim() !== ""
      ? normalizeDisplayLetterGrade(String(gradeRaw).trim())
      : "";
  const irsRaw = merged.implementationRiskScore;
  const irsNum = typeof irsRaw === "number" ? irsRaw : Number(irsRaw);
  const hasIrs = Number.isFinite(irsNum);
  if (!gradeStr && !hasIrs) return null;
  return (
    <section className="vendor_preview_card">
      <h3 className="vendor_preview_card_title">Readiness score</h3>
      <dl className="vendor_preview_list">
        {gradeStr ? (
          <div className="vendor_preview_row">
            <dt className="vendor_preview_label">Grade</dt>
            <dd className="vendor_preview_value">{gradeStr}</dd>
          </div>
        ) : null}
        {hasIrs ? (
          <div className="vendor_preview_row">
            <dt className="vendor_preview_label">Implementation readiness score</dt>
            <dd className="vendor_preview_value">{formatScore2(irsNum)}/100</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function AssessmentMetaFields({
  src,
  typeLabel,
  isDraft,
}: {
  src: Record<string, unknown>;
  typeLabel: string;
  isDraft: boolean;
}) {
  return (
    <section className="vendor_preview_card">
      <h3 className="vendor_preview_card_title">Assessment</h3>
      <dl className="vendor_preview_list">
        <div className="vendor_preview_row">
          <dt className="vendor_preview_label">Type</dt>
          <dd className="vendor_preview_value">{typeLabel}</dd>
        </div>
        <div className="vendor_preview_row">
          <dt className="vendor_preview_label">Status</dt>
          <dd className="vendor_preview_value">{getAssessmentStatusLabel(src)}</dd>
        </div>
        <div className="vendor_preview_row">
          <dt className="vendor_preview_label">{isDraft ? "Drafted on" : "Created on"}</dt>
          <dd className="vendor_preview_value">
            {formatDateDDMMMYYYY(
              isDraft ? (src.updatedAt ?? src.createdAt) : src.createdAt,
            )}
          </dd>
        </div>
        {!isDraft && (
          <div className="vendor_preview_row">
            <dt className="vendor_preview_label">Expires on</dt>
            <dd className="vendor_preview_value vendor_preview_value_expiry">
              {formatDateDDMMMYYYY(src.expiryAt)}
            </dd>
          </div>
        )}
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
  hideBuyerReadinessFormula = false,
}: AssessmentPreviewModalContentProps) {
  const isVendor = (previewRow?.type ?? "").toLowerCase() === "cots_vendor";
  const isDraft = (previewRow?.status ?? "").toLowerCase() === "draft";
  const vendorSrc: Record<string, unknown> = {
    ...previewRow,
    ...(vendorDetail ?? {}),
  };
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
            <AssessmentMetaFields src={vendorSrc} typeLabel="COTS Vendor" isDraft={isDraft} />
            {vendorLoading ? (
              <section className="vendor_preview_card">
                <LoadingMessage message="Loading assessment details…" />
              </section>
            ) : (
              VENDOR_COTS_FORM_SECTIONS.map((section) => {
                const fields = section.fields.filter((f) => shouldShowVendorField(f, vendorSrc));
                if (!fields.length) return null;
                return (
                  <section key={section.id} className="vendor_preview_card">
                    <h3 className="vendor_preview_card_title">{section.label}</h3>
                    <dl className="vendor_preview_list">
                      {fields.map((field) => {
                        const val = vendorFieldDisplayValue(field, vendorSrc);
                        if (!field.required && !fieldHasValue(val)) return null;
                        return (
                          <div key={field.key} className="vendor_preview_row">
                            <dt className="vendor_preview_label">{field.label}</dt>
                            <dd className="vendor_preview_value">
                              {formatPreviewValue(val, field.label)}
                            </dd>
                          </div>
                        );
                      })}
                    </dl>
                  </section>
                );
              })
            )}
          </>
        ) : (
          <>
            <AssessmentMetaFields
              src={buyerMerged}
              typeLabel="COTS Assessment"
              isDraft={isDraft}
            />
            {buyerLoading ? (
              <section className="vendor_preview_card">
                <LoadingMessage message="Loading assessment details…" />
              </section>
            ) : (
              <>
                {BUYER_SECTION_ORDER.map((sectionKey) => {
                  const keys = BUYER_COTS_FIELD_KEYS[sectionKey];
                  const sectionData = BUYER_COTS_ASSESSMENT[sectionKey] as
                    | Record<
                        number,
                        {
                          label?: string;
                          placeholder?: string;
                          options?: unknown;
                        }
                      >
                    | undefined;
                  const title = BUYER_SECTION_TITLES[sectionKey] ?? sectionKey;
                  if (!keys?.length) return null;
                  return (
                    <section key={sectionKey} className="vendor_preview_card">
                      <h3 className="vendor_preview_card_title">{title}</h3>
                      <dl className="vendor_preview_list">
                        {keys.map((key, i) => {
                          const config = sectionData?.[i];
                          const label = config?.label ?? camelToLabel(key);
                          if (isUploadField(config)) {
                            const fileNames = parseFileNamesValue(buyerMerged[key]);
                            return (
                              <div key={key} className="vendor_preview_row">
                                <dt className="vendor_preview_label">{label}</dt>
                                <dd className="vendor_preview_value">
                                  {fileNames.length > 0 ? (
                                    <FileUpload value={fileNames} readOnly />
                                  ) : (
                                    formatPreviewValue(undefined, label)
                                  )}
                                </dd>
                              </div>
                            );
                          }
                          const value = getRowPreviewValue(buyerMerged, key);
                          return (
                            <div key={key} className="vendor_preview_row">
                              <dt className="vendor_preview_label">{label}</dt>
                              <dd className="vendor_preview_value">
                                {formatPreviewValue(value, label)}
                              </dd>
                            </div>
                          );
                        })}
                        {sectionKey === "environment" &&
                        fieldHasValue(buyerMerged.integrationSystemsOther) ? (
                          <div key="integrationSystemsOther" className="vendor_preview_row">
                            <dt className="vendor_preview_label">
                              Integration systems (other details)
                            </dt>
                            <dd className="vendor_preview_value">
                              {formatPreviewValue(
                                buyerMerged.integrationSystemsOther,
                                "Integration systems (other details)",
                              )}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                    </section>
                  );
                })}
                {!hideBuyerReadinessFormula ? buyerFormulaReadinessRows(buyerMerged) : null}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
