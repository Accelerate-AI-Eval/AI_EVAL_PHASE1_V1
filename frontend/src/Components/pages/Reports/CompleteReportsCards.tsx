import { Calendar, ChevronRight, Download, FileText, Info } from "lucide-react";
import React, { useCallback, useState } from "react";
import { resolveStoredLlmModelId } from "../../UI/AdminLlmModelInfo";
import ScoreTracePanel from "../Organizations/ScoreTracePanel";
import type { CustomerRiskReportItem } from "./Reports";
import {
  completeReportRiskMeterColor,
  implementationRiskScoreFromReportPayload,
  overallRiskScoreFromReportJson,
  reportContextScoreFromListPayload,
  resolveScoreRationaleForCompleteReport,
  resolveScoreSubtitleForCompleteReport,
  type CompleteReportRiskMeterGrading,
} from "../../../utils/completeReportGrade";
import {
  isReportTimeExpired,
  reportArchivedStatusText,
} from "../../../utils/reportArchiveStatusLabel";
import "../../../styles/popovers.css";
import "../UserManagement/user_management.css";
import "../Assessments/assessments.css";
import "../Dashboard/dashboard.css";
import "../VendorDirectory/VendorDirectory.css";
import "./general_reports.css";

const BASE_URL = import.meta.env.VITE_BASE_URL ?? "http://localhost:5003/api/v1";

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

function scoreTraceTypeForReport(
  report: CustomerRiskReportItem,
  riskMeterGrading: CompleteReportRiskMeterGrading,
): "irs" | "scs" {
  const grading = riskMeterGradingForReport(report, riskMeterGrading);
  if (grading === "buyer_cots_irs" || grading === "vendor_cots_irs" || report.source === "buyer_vendor_risk") {
    return "irs";
  }
  return "scs";
}

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
  /**
   * Organizational portal vendor COTS: show implementation risk score and buyer COTS grade colors (IRS high = red).
   * Default: alignment gradient for customer reports; inverted IRS bands for `buyer_vendor_risk`.
   */
  riskMeterGrading?: CompleteReportRiskMeterGrading;
  /** System admin: open score tracing (with LLM model in stp_header) from the risk Info button. */
  showScoreRationaleInfo?: boolean;
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
  showScoreRationaleInfo = false,
}: CompleteReportsCardsProps) {
  const [scoreByReportId, setScoreByReportId] = useState<Record<string, number | null>>({});
  const [reportDetailById, setReportDetailById] = useState<Record<string, Record<string, unknown>>>({});
  const [fetchingReportId, setFetchingReportId] = useState<string | null>(null);
  const [scoreTraceTarget, setScoreTraceTarget] = useState<{
    assessmentId: string;
    reportId: string;
    title: string;
    traceType: "irs" | "scs";
    llmModelName: string | null;
    cardScore: number | null;
  } | null>(null);

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
        const irs = implementationRiskScoreFromReportPayload(row);
        if (irs != null) return irs;
        // Vendor COTS analysis reports store SRS as overallRiskScore (not IRS).
        const listSrs =
          row.overallRiskScore != null && Number.isFinite(Number(row.overallRiskScore))
            ? Math.round(Number(row.overallRiskScore))
            : null;
        const srs = listSrs ?? overallRiskScoreFromReportJson(row.report);
        return srs != null ? Math.round(srs) : null;
      }
      if (report.source === "buyer_vendor_risk") {
        const irs = reportContextScoreFromListPayload(row);
        if (irs == null) return null;
        return irs;
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
        const irs = reportContextScoreFromListPayload(report);
        const report_context_score = irs == null ? null : irs;
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
            const payload = { report: rep, source: "customer" as const, overallRiskScore: report.overallRiskScore };
            const irs = implementationRiskScoreFromReportPayload(payload);
            const listSrs =
              report.overallRiskScore != null && Number.isFinite(Number(report.overallRiskScore))
                ? Math.round(Number(report.overallRiskScore))
                : null;
            const srs = listSrs ?? overallRiskScoreFromReportJson(rep);
            const report_context_score =
              riskMeterGrading === "buyer_cots_irs"
                ? (irs ?? (srs != null ? Math.round(srs) : null))
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
    const meterGrading = riskMeterGradingForReport(report, riskMeterGrading);
    const meterInputScore =
      report_context_score == null
        ? null
        : !isVendorPortalSession() &&
            (report.source === "buyer_vendor_risk" || meterGrading === "vendor_cots_irs")
          ? Math.max(0, Math.min(100, 100 - report_context_score))
          : report_context_score;
    const meterColor =
      !archived && meterInputScore != null
        ? completeReportRiskMeterColor(rowForMeter, meterInputScore, meterGrading)
        : undefined;
    const scoreSubtitle =
      !archived && report_context_score != null
        ? resolveScoreSubtitleForCompleteReport(rowForMeter, meterGrading)
        : null;
    const scoreRationale = showScoreRationaleInfo
      ? resolveScoreRationaleForCompleteReport(rowForMeter, meterGrading)
      : null;
    const showRationaleInfo =
      showScoreRationaleInfo &&
      !archived &&
      (report_context_score != null || scoreRationale?.rationale != null);

    const cardAccentStyle =
      !archived && meterColor != null
        ? ({ borderBottom: `3px solid ${meterColor}` } as React.CSSProperties)
        : undefined;

    const isExpiredStatus = archived && isReportTimeExpired(report);

    return (
      <article
        key={report.id}
        className={`vendor_directory_card general_rpr_card complete_rpr_card_design${archived ? " general_rpr_card_archived" : ""}`}
        data-accent="risk"
        style={cardAccentStyle}
      >
        <div className="general_report_card_header complete_rpr_card_top">
          {archived ? (
            isExpiredStatus ? (
              <span className="pill pill_status pill_status_inactive pill_status_with_dot">
                <span className="pill_status_dot" aria-hidden />
                Expired
              </span>
            ) : (
              <span className="assessments_vd_badge assessments_vd_badge--archived">
                Archived
              </span>
            )
          ) : (
            <span className="pill pill_status pill_status_active pill_status_with_dot">
              <span className="pill_status_dot" aria-hidden />
              Completed
            </span>
          )}
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
            <span className="general_rpr_card_title_wrap">
              <h2 className="vendor_directory_card_name general_rpr_card_title_clamp">
                {getTitle(report)}
              </h2>
            </span>
            {scoreSubtitle != null && scoreSubtitle !== "" ? (
              <span
                className="complete_rpr_card_risk_subtitle"
                style={meterColor ? { color: meterColor } : undefined}
              >
                {scoreSubtitle}
              </span>
            ) : null}
          </div>
        </div>

        <div className="complete_rpr_card_risk_block">
          <div className="complete_rpr_card_risk_row">
            <span className="complete_rpr_card_risk_label">
              {isVendorPortalSession()
                ? "READINESS SCORE"
                : report.source === "buyer_vendor_risk" || meterGrading === "vendor_cots_irs"
                  ? "RISK SCORE"
                  : "READINESS SCORE"}
            </span>
            <span className="complete_rpr_card_risk_value_wrap">
              <span className="complete_rpr_card_risk_value_row">
                <span
                  className="complete_rpr_card_risk_value"
                  style={meterColor ? { color: meterColor } : undefined}
                >
                  {isFetching ? "…" : report_context_score != null ? `(${report_context_score}/100)` : "—"}
                </span>
                {showRationaleInfo && scoreRationale ? (
                  <button
                    type="button"
                    className="general_rpr_card_download_btn complete_rpr_card_risk_info_btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      const assessmentId = String(report.assessmentId ?? "").trim();
                      if (!assessmentId) return;
                      setScoreTraceTarget({
                        assessmentId,
                        reportId: String(report.id ?? ""),
                        title: getTitle(report),
                        traceType: scoreTraceTypeForReport(report, riskMeterGrading),
                        cardScore: report_context_score,
                        llmModelName: resolveStoredLlmModelId({
                          llmModelId: report.llmModelId,
                          report: rowForMeter.report,
                        }),
                      });
                    }}
                    aria-label={`${scoreRationale.title} for ${getTitle(report)}`}
                    title={scoreRationale.title}
                  >
                    <Info size={14} aria-hidden />
                  </button>
                ) : null}
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
                <span className="complete_rpr_card_expiry_label">
                  <Calendar
                    size={14}
                    className="complete_rpr_card_expiry_icon"
                    aria-hidden
                  />
                  Expires on
                </span>
                <span className="complete_rpr_card_expiry_value">{getExpiryDate(report)}</span>
              </>
            )}
          </div>
          <button
            type="button"
            className="dash_view_all_btn complete_rpr_card_view_btn"
            onClick={() => void handleViewReport(report)}
            aria-label={`View report: ${getTitle(report)}`}
            disabled={(archived && !viewEnabledWhenArchived) || isFetching}
          >
            View Report
            <ChevronRight size={15} strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      </article>
    );
  });
  const scoreTracePanel = showScoreRationaleInfo ? (
    <ScoreTracePanel
      isOpen={scoreTraceTarget != null}
      onClose={() => setScoreTraceTarget(null)}
      assessmentId={scoreTraceTarget?.assessmentId ?? ""}
      assessmentTitle={scoreTraceTarget?.title ?? ""}
      traceType={scoreTraceTarget?.traceType ?? "scs"}
      reportId={scoreTraceTarget?.reportId || undefined}
      llmModelName={scoreTraceTarget?.llmModelName}
      cardScore={scoreTraceTarget?.cardScore ?? null}
    />
  ) : null;

  if (singleCard) {
    return (
      <>
        {cards}
        {scoreTracePanel}
      </>
    );
  }
  return (
    <>
      <div className="general_rpr_cards_sec vendor_directory_grid complete_rpr_cards_grid">{cards}</div>
      {scoreTracePanel}
    </>
  );
}

export default CompleteReportsCards;
