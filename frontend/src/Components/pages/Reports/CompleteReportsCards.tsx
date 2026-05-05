import { ChevronRight, Download, FileText } from "lucide-react";
import React, { useCallback, useState } from "react";
import ClickTooltip from "../../UI/ClickTooltip";
import type { CustomerRiskReportItem } from "./Reports";
import {
  completeReportRiskMeterColor,
  implementationRiskScoreFromReportPayload,
  reportContextScoreFromListPayload,
  resolveScoreSubtitleForCompleteReport,
  type CompleteReportRiskMeterGrading,
} from "../../../utils/completeReportGrade";
import {
  isReportTimeExpired,
  reportArchivedStatusText,
  reportArchivedStatusBadge,
} from "../../../utils/reportArchiveStatusLabel";
import { mixSrgbHex } from "../../../utils/mixSrgbHex";
import "../VendorDirectory/VendorDirectory.css";
import "./general_reports.css";

const BASE_URL = import.meta.env.VITE_BASE_URL ?? "http://localhost:5003/api/v1";

// const DEFAULT_MODEL_DISPLAY_NAME = "Claude Sonnet 3";

function isVendorPortalSession(): boolean {
  return (sessionStorage.getItem("systemRole") ?? "").toLowerCase().trim() === "vendor";
}

/** Vendor COTS complete reports are `source: "customer"` but carry IRS; buyer org portal passes `buyer_cots_irs`. */
function riskMeterGradingForReport(
  report: CustomerRiskReportItem,
  riskMeterGrading: CompleteReportRiskMeterGrading,
): CompleteReportRiskMeterGrading {
  if (riskMeterGrading === "buyer_cots_irs") return "buyer_cots_irs";
  if (report.source === "buyer_vendor_risk") return "vendor_cots_irs";
  if (isVendorPortalSession() && implementationRiskScoreFromReportPayload(report) != null) {
    return "vendor_cots_irs";
  }
  return "default";
}

// function modelNameFromReport(report: CustomerRiskReportItem): string {
//   const raw = report.report;
//   if (raw == null || typeof raw !== "object") return DEFAULT_MODEL_DISPLAY_NAME;
//   const o = raw as Record<string, unknown>;
//   const gen = o.generatedAnalysis ?? o.generated_analysis;
//   if (gen != null && typeof gen === "object") {
//     const g = gen as Record<string, unknown>;
//     const fromGen = g.modelName ?? g.model_name ?? g.aiModel ?? g.ai_model;
//     if (typeof fromGen === "string" && fromGen.trim()) return fromGen.trim();
//   }
//   const top = o.modelName ?? o.model_name ?? o.aiModel;
//   if (typeof top === "string" && top.trim()) return top.trim();
//   return DEFAULT_MODEL_DISPLAY_NAME;
// }

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
  // /** Shown directly under the card title; defaults from report JSON when present, else Claude Sonnet 3. */
  // getModelName?: (report: CustomerRiskReportItem) => string;
  /**
   * Organizational portal vendor COTS: show implementation risk score and buyer COTS grade colors (IRS high = red).
   * Default: alignment gradient for customer reports; inverted IRS bands for `buyer_vendor_risk`.
   */
  riskMeterGrading?: CompleteReportRiskMeterGrading;
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
  riskMeterGrading = "default",
}: CompleteReportsCardsProps) {
  const [scoreByReportId, setScoreByReportId] = useState<Record<string, number | null>>({});
  const [reportDetailById, setReportDetailById] = useState<Record<string, Record<string, unknown>>>({});
  const [fetchingReportId, setFetchingReportId] = useState<string | null>(null);

  const rowWithFetchedReport = useCallback(
    (report: CustomerRiskReportItem): CustomerRiskReportItem => {
      const fetched = reportDetailById[report.id];
      if (fetched == null) return report;
      return { ...report, report: fetched };
    },
    [reportDetailById],
  );

  const resolveDisplayScore = useCallback(
    (report: CustomerRiskReportItem): number | null => {
      const row = rowWithFetchedReport(report);
      if (Object.prototype.hasOwnProperty.call(scoreByReportId, report.id)) {
        return scoreByReportId[report.id] ?? null;
      }
      if (riskMeterGrading === "buyer_cots_irs") {
        return implementationRiskScoreFromReportPayload(row);
      }
      if (report.source === "buyer_vendor_risk") {
        return reportContextScoreFromListPayload(row);
      }
      if (isVendorPortalSession() && implementationRiskScoreFromReportPayload(row) != null) {
        return implementationRiskScoreFromReportPayload(row);
      }
      return reportContextScoreFromListPayload(row);
    },
    [scoreByReportId, riskMeterGrading, rowWithFetchedReport],
  );

  const handleViewReport = useCallback(
    async (report: CustomerRiskReportItem) => {
      const archived = isArchived(report);
      if (archived && !viewEnabledWhenArchived) return;

      if (report.source === "buyer_vendor_risk") {
        const report_context_score = reportContextScoreFromListPayload(report);
        setScoreByReportId((prev) => ({ ...prev, [report.id]: report_context_score }));
        onViewReport(report);
        return;
      }

      setFetchingReportId(report.id);
      try {
        const token = sessionStorage.getItem("bearerToken");
        if (token) {
          const res = await fetch(
            `${BASE_URL}/customerRiskReports/${encodeURIComponent(report.id)}`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const data = await res.json().catch(() => ({}));
          if (data?.success && data?.data?.report && typeof data.data.report === "object") {
            const rep = data.data.report as Record<string, unknown>;
            setReportDetailById((prev) => ({ ...prev, [report.id]: rep }));
            const payload = { report: rep, source: "customer" as const };
            const irs = implementationRiskScoreFromReportPayload(payload);
            const report_context_score =
              riskMeterGrading === "buyer_cots_irs"
                ? irs
                : isVendorPortalSession() && irs != null
                  ? irs
                  : reportContextScoreFromListPayload(payload);
            setScoreByReportId((prev) => ({ ...prev, [report.id]: report_context_score }));
          }
        }
      } catch {
        // keep list-derived score from resolveDisplayScore
      } finally {
        setFetchingReportId(null);
      }
      onViewReport(report);
    },
    [isArchived, onViewReport, viewEnabledWhenArchived, riskMeterGrading],
  );

  const cards = reports.map((report) => {
    const archived = isArchived(report);
    const rowForMeter = rowWithFetchedReport(report);
    const report_context_score = resolveDisplayScore(report);
    const isFetching = fetchingReportId === report.id;
    const statusLabel = archived
      ? reportArchivedStatusBadge(report)
      : "COMPLETED";
    const meterGrading = riskMeterGradingForReport(report, riskMeterGrading);
    const meterColor =
      !archived && report_context_score != null
        ? completeReportRiskMeterColor(rowForMeter, report_context_score, meterGrading)
        : undefined;
    const scoreSubtitle =
      !archived && report_context_score != null
        ? resolveScoreSubtitleForCompleteReport(rowForMeter, meterGrading)
        : null;

    const cardAccentStyle =
      !archived && meterColor != null
        ? ({ borderBottom: `3px solid ${meterColor}` } as React.CSSProperties)
        : undefined;

    const statusBadgeStyle: React.CSSProperties | undefined = archived
      ? undefined
      : meterColor != null
        ? {
            color: meterColor,
            backgroundColor: mixSrgbHex(meterColor, "#ffffff", 0.16),
          }
        : undefined;

    return (
      <article
        key={report.id}
        className={`vendor_directory_card general_rpr_card complete_rpr_card_design${archived ? " general_rpr_card_archived" : ""}`}
        data-accent="risk"
        style={cardAccentStyle}
      >
        <div className="general_report_card_header complete_rpr_card_top">
          <span
            className={
              archived
                ? isReportTimeExpired(report)
                  ? "complete_rpr_card_status_badge complete_rpr_card_status_badge_expired"
                  : "complete_rpr_card_status_badge complete_rpr_card_status_badge_archived"
                : "complete_rpr_card_status_badge"
            }
            style={archived ? undefined : statusBadgeStyle}
          >
            {statusLabel}
          </span>
          <div className="complete_rpr_card_header_actions">
           
            <span className="complete_rpr_card_header_doc_icon" aria-hidden>
              <FileText size={18} />
            </span>
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
        </div>
        <div className="general_rpr_title complete_rpr_card_title_block">
          <div className="vendor_directory_card_header_text complete_rpr_card_title_model_group">
            <ClickTooltip content={getTitle(report)} position="top" showOn="hover">
              <span className="general_rpr_card_title_wrap">
                <h2 className="vendor_directory_card_name general_rpr_card_title_clamp">
                  {getTitle(report)}
                </h2>
              </span>
            </ClickTooltip>
            {/* <p className="complete_rpr_card_model">
              Model: {getModelName ? getModelName(report) : modelNameFromReport(report)}
            </p> */}
          </div>
        </div>

        <div className="complete_rpr_card_risk_block">
          <div className="complete_rpr_card_risk_row">
            <span className="complete_rpr_card_risk_label">RISK SCORE</span>
            <span className="complete_rpr_card_risk_value_wrap">
              {scoreSubtitle != null && scoreSubtitle !== "" ? (
                <span className="complete_rpr_card_risk_subtitle" style={meterColor ? { color: meterColor } : undefined}>
                  {scoreSubtitle}
                </span>
              ) : null}
              <span
                className="complete_rpr_card_risk_value"
                style={meterColor ? { color: meterColor } : undefined}
              >
                {isFetching ? "…" : report_context_score != null ? `(${report_context_score}/100)` : "—"}
              </span>
              
            </span>
          </div>
          <div className="complete_rpr_card_risk_track" aria-hidden>
            <div
              className="complete_rpr_card_risk_fill"
              style={{
                width: report_context_score != null ? `${Math.min(100, Math.max(0, report_context_score))}%` : "0%",
                ...(meterColor ? { backgroundColor: meterColor } : {}),
              }}
            />
          </div>
        </div>

        <div className="general_rpr_card_footer complete_rpr_card_footer">
          <div className="general_rpr_card_dates complete_rpr_card_expiry_col">
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
                <span className="complete_rpr_card_expiry_label">EXPIRY DATE</span>
                <span className="complete_rpr_card_expiry_value">{getExpiryDate(report)}</span>
              </>
            )}
          </div>
          <button
            type="button"
            className="view_rpr_btn vendor_directory_card_action_btn complete_rpr_card_view_btn"
            onClick={() => void handleViewReport(report)}
            aria-label={`View report: ${getTitle(report)}`}
            disabled={(archived && !viewEnabledWhenArchived) || isFetching}
          >
            View Report
            <ChevronRight size={16} aria-hidden />
          </button>
        </div>
      </article>
    );
  });
  if (singleCard) return <>{cards}</>;
  return (
    <div className="general_rpr_cards_sec vendor_directory_grid complete_rpr_cards_grid">{cards}</div>
  );
}

export default CompleteReportsCards;
