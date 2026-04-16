import {
  Search,
  Landmark,
  FileClock,
  CheckCircle2,
  Plus,
  Clipboard,
  Eye,
  FileText,
} from "lucide-react";
import { ReportsPagination } from "../Reports/ReportsPagination";
import Button from "../../UI/Button";

export type LedgerRowVM = {
  key: string | number;
  title: string;
  /** Under title: draft = drafted date; completed/expired = expiry label (completed styled in tomato). */
  expiryLine: string;
  statusKind: "completed" | "draft" | "expired";
  progressPct: number | null;
  leadName: string;
  riskDisplay: string;
  dateLine1: string;
  dateLine2: string;
  icon: "building" | "chip";
};

export type AssessmentsLedgerPanelProps = {
  inProgressCount: number;
  completedCount: number;
  showArchived: boolean;
  onShowArchivedChange: (archived: boolean) => void;
  search: string;
  onSearchChange: (q: string) => void;
  loading: boolean;
  fetchError: string;
  emptyMessage: string;
  rows: LedgerRowVM[];
  totalFiltered: number;
  currentPage: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onRowViewAction: (key: string | number) => void;
  onRowReportAction: (key: string | number) => void;
  showNewAssessment?: boolean;
  onNewAssessment?: () => void;
  newAssessmentLabel?: string;
};

function initialsFromName(name: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2)
    return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2)
    return parts[0].slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return "—";
}

export default function AssessmentsLedgerPanel({
  inProgressCount,
  completedCount,
  showArchived,
  onShowArchivedChange,
  search,
  onSearchChange,
  loading,
  fetchError,
  emptyMessage,
  rows,
  totalFiltered,
  currentPage,
  pageSize,
  onPageChange,
  onPageSizeChange,
  onRowViewAction,
  onRowReportAction,
  showNewAssessment,
  onNewAssessment,
  newAssessmentLabel = "New assessment",
}: AssessmentsLedgerPanelProps) {
  const totalActive = inProgressCount + completedCount;
  const progressBluePct =
    totalActive > 0
      ? Math.round((inProgressCount / totalActive) * 100)
      : inProgressCount > 0
        ? 40
        : 0;
  const progressGreenPct =
    totalActive > 0
      ? Math.round((completedCount / totalActive) * 100)
      : completedCount > 0
        ? 100
        : 0;

  const start = totalFiltered === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, totalFiltered);

  return (
    <div className="assessments_ledger">
      <header className="assessments_ledger_header">
        <div className="assessments_ledger_header_titles">
          <p className="assessments_ledger_kicker">Risk governance</p>
          <h1 className="assessments_ledger_title">Assessments ledger</h1>
        </div>
        <div className="assessments_ledger_header_actions">
          {showNewAssessment && onNewAssessment && (
            <Button className="invite_user_btn" onClick={onNewAssessment}>
              <Plus size={24} aria-hidden />
              {newAssessmentLabel}
            </Button>
          )}
        </div>
      </header>

      <div className="assessments_ledger_summary">
        <article className="assessments_ledger_stat_card">
          <div className="assessments_ledger_stat_top">
            <div>
              <p className="assessments_ledger_stat_label">
                Completed assessments
              </p>
              <p className="assessments_ledger_stat_value">{completedCount}</p>
            </div>
            <div className="assessments_ledger_stat_icon assessments_ledger_stat_icon_green">
              <CheckCircle2 size={22} aria-hidden />
            </div>
          </div>
          <div className="assessments_ledger_stat_bar_track">
            <div
              className="assessments_ledger_stat_bar_fill assessments_ledger_stat_bar_green"
              style={{
                width: `${Math.min(100, Math.max(completedCount > 0 ? 8 : 0, progressGreenPct))}%`,
              }}
            />
          </div>
          <p className="assessments_ledger_stat_caption">
            Total finalized risk records
          </p>
        </article>
        <article className="assessments_ledger_stat_card">
          <div className="assessments_ledger_stat_top">
            <div>
              <p className="assessments_ledger_stat_label">
                Assessments in progress
              </p>
              <p className="assessments_ledger_stat_value">{inProgressCount}</p>
            </div>
            <div className="assessments_ledger_stat_icon assessments_ledger_stat_icon_blue">
              <FileClock size={22} aria-hidden />
            </div>
          </div>
          <div className="assessments_ledger_stat_bar_track">
            <div
              className="assessments_ledger_stat_bar_fill assessments_ledger_stat_bar_blue"
              style={{
                width: `${Math.min(100, Math.max(4, progressBluePct))}%`,
              }}
            />
          </div>
          <p className="assessments_ledger_stat_caption">
            Drafting or under active review
          </p>
        </article>
      </div>

      <div className="assessments_ledger_toolbar">
        <div className="assessments_ledger_search">
          <Search
            size={18}
            className="assessments_ledger_search_icon"
            aria-hidden
          />
          <input
            type="search"
            placeholder="Search assessments…"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search assessments"
            className="assessments_ledger_search_input"
          />
        </div>
        <div
          className="assessments_ledger_segmented assessments_ledger_segmented_inline"
          role="group"
          aria-label="Assessment scope"
        >
          <button
            type="button"
            className={
              !showArchived
                ? "assessments_ledger_segment active"
                : "assessments_ledger_segment"
            }
            onClick={() => onShowArchivedChange(false)}
          >
            Current
          </button>
          <button
            type="button"
            className={
              showArchived
                ? "assessments_ledger_segment active"
                : "assessments_ledger_segment"
            }
            onClick={() => onShowArchivedChange(true)}
          >
            Archived
          </button>
        </div>
      </div>

      {loading && (
        <p className="assessments_ledger_loading">Loading assessments…</p>
      )}
      {fetchError && (
        <p className="assessments_ledger_error" role="alert">
          {fetchError}
        </p>
      )}

      {!loading && !fetchError && (
        <>
          <div className="assessments_ledger_table">
            <div className="assessments_ledger_colhead" aria-hidden>
              <span className="col_name">Assessment name</span>
              <span className="col_status">Status</span>
              <span className="col_lead">Assigned lead</span>
              <span className="col_risk">Risk score</span>
              <span className="col_date">
                {showArchived ? "Expired date" : "Completion date"}
              </span>
              <span className="col_actions">Actions</span>
            </div>
            {rows.length === 0 ? (
              <p className="assessments_ledger_empty">{emptyMessage}</p>
            ) : (
              rows.map((row) => (
                <article
                  key={String(row.key)}
                  className="assessments_ledger_row"
                >
                  <div className="assessments_ledger_cell col_name">
                    <div
                      className={
                        row.icon === "building"
                          ? "assessments_ledger_row_icon"
                          : "assessments_ledger_row_icon assessments_ledger_row_icon_muted"
                      }
                      aria-hidden
                    >
                      {row.icon === "building" ? (
                        <Landmark size={20} />
                      ) : (
                        <Clipboard size={20} />
                      )}
                    </div>
                    <div className="assessments_ledger_name_block">
                      <h2 className="assessments_ledger_row_title">
                        {row.title}
                      </h2>
                      <p
                        className={
                          showArchived && row.statusKind === "expired"
                            ? "assessments_ledger_row_expiry assessments_ledger_row_expiry--archived"
                            : row.statusKind === "completed"
                              ? "assessments_ledger_row_expiry assessments_ledger_row_expiry--completed"
                              : "assessments_ledger_row_expiry"
                        }
                      >
                        {row.expiryLine}
                      </p>
                    </div>
                  </div>
                  <div className="assessments_ledger_cell col_status">
                    {row.statusKind === "completed" && (
                      <span className="assessments_ledger_badge assessments_ledger_badge_done">
                        <span
                          className="assessments_ledger_badge_dot"
                          aria-hidden
                        />
                        Completed
                      </span>
                    )}
                    {row.statusKind === "expired" && (
                      <span className="assessments_ledger_badge assessments_ledger_badge_expired">
                        Expired
                      </span>
                    )}
                    {row.statusKind === "draft" && (
                      <div className="assessments_ledger_progress_block">
                        <div className="assessments_ledger_progress_track">
                          <div
                            className="assessments_ledger_progress_fill"
                            style={{
                              width: `${Math.min(100, Math.max(6, row.progressPct ?? 20))}%`,
                            }}
                          />
                        </div>
                        <span className="assessments_ledger_progress_label">
                          {Math.round(row.progressPct ?? 0)}% complete
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="assessments_ledger_cell col_lead">
                    <div
                      className="assessments_ledger_avatar"
                      title={row.leadName}
                    >
                      {initialsFromName(row.leadName)}
                    </div>
                    <span className="assessments_ledger_lead_name">
                      {row.leadName}
                    </span>
                  </div>
                  <div className="assessments_ledger_cell col_risk">
                    <span className="assessments_ledger_risk">
                      {row.riskDisplay}
                    </span>
                  </div>
                  <div className="assessments_ledger_cell col_date">
                    <span className="assessments_ledger_date_primary">
                      {row.dateLine1}
                    </span>
                    <span className="assessments_ledger_date_secondary">
                      {row.dateLine2}
                    </span>
                  </div>
                  <div className="assessments_ledger_cell col_actions">
                    <div className="assessments_ledger_action_group">
                      <button
                        type="button"
                        className="assessments_ledger_action_btn"
                        onClick={() => onRowViewAction(row.key)}
                        title="View"
                        aria-label="View"
                      >
                        <Eye size={14} aria-hidden />
                      </button>
                      <button
                        type="button"
                        className="assessments_ledger_action_btn"
                        disabled={row.statusKind === "draft"}
                        onClick={() => onRowReportAction(row.key)}
                        title={
                          row.statusKind === "draft"
                            ? "Report is available after the assessment is submitted"
                            : "View report"
                        }
                        aria-label={
                          row.statusKind === "draft"
                            ? "View report (not available for drafts)"
                            : "View report"
                        }
                      >
                        <FileText size={14} aria-hidden />
                      </button>
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>

          {rows.length > 0 && (
            <footer className="assessments_ledger_footer">
              <p className="assessments_ledger_range">
                Showing {start}-{end} of {totalFiltered} assessments
              </p>
              <ReportsPagination
                totalItems={totalFiltered}
                currentPage={currentPage}
                pageSize={pageSize}
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
              />
            </footer>
          )}
        </>
      )}
    </div>
  );
}
