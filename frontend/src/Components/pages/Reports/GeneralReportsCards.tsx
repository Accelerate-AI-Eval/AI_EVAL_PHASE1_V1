import { ChevronRight, Download, FileText } from "lucide-react";
import React from "react";
import ClickTooltip from "../../UI/ClickTooltip";
import type { GeneratedReportItem } from "./GeneralReports";
import { getReportTypeAccent, getReportTypeDisplayLabel, getReportTypeIcon } from "./reportTypes";
import {
  isReportTimeExpired,
  reportArchivedStatusText,
} from "../../../utils/reportArchiveStatusLabel";
import "../VendorDirectory/VendorDirectory.css";

interface GeneralReportsCardsProps {
  reports: GeneratedReportItem[];
  onViewReport: (report: GeneratedReportItem) => void;
  onDownload?: (report: GeneratedReportItem) => void;
  /** When true, render only the card(s) in a fragment (no wrapper div) for use inside a parent grid. */
  singleCard?: boolean;
}

function formatReportDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .replace(/\s+/g, "-");
  } catch {
    return "—";
  }
}

/** Expiry: 1 year from generated date, or use API expiry when available. */
function getExpiryDate(report: GeneratedReportItem): string {
  const expiryAt = report.expiryAt ?? report.attestationExpiryAt;
  if (expiryAt != null && String(expiryAt).trim() !== "") {
    try {
      const d = new Date(expiryAt);
      if (!Number.isNaN(d.getTime())) {
        return d
          .toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric",
          })
          .replace(/\s+/g, "-");
      }
    } catch {
      // fall through to generatedAt + 1 year
    }
  }
  try {
    const d = new Date(report.generatedAt);
    if (Number.isNaN(d.getTime())) return "—";
    d.setFullYear(d.getFullYear() + 1);
    return d
      .toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .replace(/\s+/g, "-");
  } catch {
    return "—";
  }
}

/** Report is archived when assessment is user-archived, or assessment/attestation expiry is in the past. */
function isReportArchived(report: GeneratedReportItem): boolean {
  if (
    report.assessmentUserArchivedAt != null &&
    String(report.assessmentUserArchivedAt).trim() !== ""
  ) {
    return true;
  }
  const expiryAt = report.expiryAt;
  const attestationExpiryAt = report.attestationExpiryAt;
  const isAssessmentExpired =
    expiryAt != null &&
    String(expiryAt).trim() !== "" &&
    !Number.isNaN(new Date(expiryAt).getTime()) &&
    new Date(expiryAt).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
  const isAttestationExpired =
    attestationExpiryAt != null &&
    String(attestationExpiryAt).trim() !== "" &&
    !Number.isNaN(new Date(attestationExpiryAt).getTime()) &&
    new Date(attestationExpiryAt).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
  return isAssessmentExpired || isAttestationExpired;
}

function GeneralReportsCards({
  reports,
  onViewReport,
  onDownload,
  singleCard = false,
}: GeneralReportsCardsProps) {
  const cards = reports.map((report) => {
    const archived = isReportArchived(report);
    return (
        <article
          key={report.id}
          className={`vendor_directory_card general_rpr_card${archived ? " general_rpr_card_archived" : ""}`}
          data-accent={getReportTypeAccent(report.reportType) ?? undefined}
        >
          <div className="general_report_card_header">
            <p className="vendor_directory_card_products general_rpr_card_report_type">

              <span className="general_rpr_card_report_type_icon" aria-hidden>
                {(() => {
                  const TypeIcon = getReportTypeIcon(report.reportType);
                  return <TypeIcon size={16} />;
                })()}
              </span>
              {getReportTypeDisplayLabel(report.reportType)}
            </p>
            
            {onDownload && !archived && (
              <span className="general_rpr_card_download_wrap">
                <button
                  type="button"
                  className="general_rpr_card_download_btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownload(report);
                  }}
                  aria-label={`Download ${getReportTypeDisplayLabel(report.reportType)}`}
                >
                  <Download size={14} aria-hidden />
                </button>
              </span>
            )}
          </div>
          <div className="general_rpr_title">
            {/* <div className="report_card_icon general_rpr_card_type_icon">
              <FileText size={20} aria-hidden />
            </div> */}
            <div className="vendor_directory_card_header_text">
              <ClickTooltip
                content={report.assessmentLabel}
                position="top"
                showOn="hover"
              >
                <span className="general_rpr_card_title_wrap">
                  <h2 className="vendor_directory_card_name general_rpr_card_title_clamp">
                    {report.assessmentLabel}
                  </h2>
                </span>
              </ClickTooltip>
            </div>

          </div>
          <div className="general_rpr_card_footer">
            <div className="general_rpr_card_dates">
              {/* <div className="general_rpr_card_date_row">
                <span className="general_rpr_card_date_label">Generated:</span>
                <span className="general_rpr_card_date_value">
                  {formatReportDate(report.generatedAt)}
                </span>
              </div> */}
              <div className="general_rpr_card_date_row">
                {archived ? (
                  <span
                    className={
                      isReportTimeExpired(report)
                        ? "general_rpr_card_status general_rpr_card_status_expired"
                        : "general_rpr_card_status general_rpr_card_status_archived"
                    }
                  >
                    {reportArchivedStatusText(report)}
                  </span>
                ) : (
                  <>
                    <span className="general_rpr_card_date_label_expiry">
                      Expires on:
                    </span>
                    <span className="general_rpr_card_date_value_expiry">
                      {getExpiryDate(report)}
                    </span>
                  </>
                )}
              </div>
            </div>
            <button
              type="button"
              className="view_rpr_btn vendor_directory_card_action_btn"
              onClick={() => onViewReport(report)}
              aria-label={`View report: ${getReportTypeDisplayLabel(report.reportType)}`}
            >
              View Report
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
        </article>
        );
  });
  if (singleCard) return <>{cards}</>;
  return <div className="general_rpr_cards_sec vendor_directory_grid">{cards}</div>;
}

export default GeneralReportsCards;
