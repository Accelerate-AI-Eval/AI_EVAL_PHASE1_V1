import { ChevronRight, Download, FileText } from "lucide-react";
import React from "react";
import ClickTooltip from "../../UI/ClickTooltip";
import type { CustomerRiskReportItem } from "./Reports";
import {
  overallRiskScoreFromReportJson,
  riskLevelFromReportJson,
  customerRiskReportApprovalHeading,
  alignmentScoreFromRiskScore,
} from "../../../utils/completeReportGrade";
import "../VendorDirectory/VendorDirectory.css";
import "./general_reports.css";

interface CompleteReportsCardsProps {
  reports: CustomerRiskReportItem[];
  getTitle: (report: CustomerRiskReportItem) => string;
  isArchived: (report: CustomerRiskReportItem) => boolean;
  getExpiryDate: (report: CustomerRiskReportItem) => string;
  onViewReport: (report: CustomerRiskReportItem) => void;
  onDownload?: (report: CustomerRiskReportItem, e: React.MouseEvent) => void;
  /** When true, View Report button is enabled even when report is archived (e.g. on Archived tab). */
  viewEnabledWhenArchived?: boolean;
  /** When true, render only the card(s) in a fragment (no wrapper div) for use inside a parent grid. */
  singleCard?: boolean;
}

function CompleteReportsCards({
  reports,
  getTitle,
  isArchived,
  getExpiryDate,
  onViewReport,
  onDownload,
  viewEnabledWhenArchived = false,
  singleCard = false,
}: CompleteReportsCardsProps) {
  const cards = reports.map((report) => {
        const archived = isArchived(report);
        const vendorRiskScore = overallRiskScoreFromReportJson(report.report);
        const vendorRiskLevel =
          riskLevelFromReportJson(report.report) ?? "Low";
        const approvalTitle =
          vendorRiskScore != null
            ? customerRiskReportApprovalHeading(vendorRiskScore, vendorRiskLevel)
            : null;
        const alignmentScore =
          vendorRiskScore != null
            ? alignmentScoreFromRiskScore(vendorRiskScore)
            : null;
        return (
          <article
            key={report.id}
            className={`vendor_directory_card general_rpr_card${archived ? " general_rpr_card_archived" : ""}`}
            data-accent="risk"
          >
            <div className="general_report_card_header">
              <p className="vendor_directory_card_products general_rpr_card_report_type">
                <span className="general_rpr_card_report_type_icon" aria-hidden>
                  <FileText size={16} />
                </span>
                Complete Report
              </p>
              {onDownload && !archived && (
                <span className="general_rpr_card_download_wrap">
                  <button
                    type="button"
                    className="general_rpr_card_download_btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload(report, e);
                    }}
                    aria-label="Download report"
                  >
                    <Download size={14} aria-hidden />
                  </button>
                </span>
              )}
            </div>
            <div className="general_rpr_title">
              <div className="vendor_directory_card_header_text">
                <ClickTooltip
                  content={getTitle(report)}
                  position="top"
                  showOn="hover"
                >
                  <span className="general_rpr_card_title_wrap">
                    <h2 className="vendor_directory_card_name general_rpr_card_title_clamp">
                      {getTitle(report)}
                    </h2>
                  </span>
                </ClickTooltip>
              </div>
            </div>
            {/* {approvalTitle != null && alignmentScore != null ? (
              <div className="general_rpr_approval_banner">
                <h3 className="general_rpr_approval_banner_title">{approvalTitle}</h3>
                <p className="general_rpr_approval_banner_sub">
                  Overall alignment score: {alignmentScore}/100 (higher indicates stronger
                  alignment / lower residual risk)
                </p>
              </div>
            ) : null} */}
            <div className="general_rpr_card_footer">
              <div className="general_rpr_card_dates">
                <div className="general_rpr_card_date_row">
                  {archived ? (
                    <span className="general_rpr_card_status general_rpr_card_status_archived">
                      Archived
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
                aria-label={`View report: ${getTitle(report)}`}
                disabled={archived && !viewEnabledWhenArchived}
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

export default CompleteReportsCards;
