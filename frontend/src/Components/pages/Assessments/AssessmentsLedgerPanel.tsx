import { useEffect, useState } from "react";
import {
  Search,
  Landmark,
  FileClock,
  CheckCircle2,
  Plus,
  Clipboard,
  ClipboardList,
  Eye,
  FileText,
  SquarePen,
  Archive,
  RotateCcw,
  Award,
  SearchX,
  ChevronDown,
  Filter,
  FolderKanban,
  ArchiveRestore,
} from "lucide-react";
import { ReportsPagination } from "../Reports/ReportsPagination";
import Button from "../../UI/Button";
import DashboardStatCard from "../../UI/DashboardStatCard";
import "../VendorDirectory/VendorDirectory.css";
import "../UserManagement/user_management.css";
import "../Dashboard/dashboard.css";
import "./assessments.css";

import {
  gradeFromOverallRiskScore,
  normalizeDisplayLetterGrade,
} from "../../../utils/completeReportGrade";
import { formatScore2 } from "../../../utils/scoreFormat";

export type AssessmentStatusScope = "all" | "completed" | "in_progress";

export type LedgerRowVM = {
  key: string | number;
  title: string;
  /** Under title: draft = drafted date; completed/expired = expiry label (completed styled in tomato). */
  expiryLine: string;
  statusKind: "completed" | "draft" | "expired" | "archived";
  progressPct: number | null;
  leadName: string;
  /** Stored formula score used for letter grade (type 2 SRS / type 3 IRS). */
  riskScore: number | null;
  /** Score shown in the ledger: type 2 sales confidence, type 3 implementation readiness. */
  displayScore: number | null;
  /** Fallback label when no numeric score (Pending / Generate report / —). */
  riskDisplay: string;
  /** Buyer vs vendor grading profile for letter grade. */
  riskGradeProfile: "buyer" | "vendor";
  dateLine1: string;
  dateLine2: string;
  icon: "building" | "chip";
  /** Current tab, completed: show Archive (moves to user archive). */
  canArchive?: boolean;
  /** Archived tab, user-archived (still in date): show Reactivate. */
  canUnarchive?: boolean;
  /** Submitted/complete: report exists in list (risk score present); hide report action if false. */
  hasReport?: boolean;
};

export type AssessmentsLedgerPanelProps = {
  inProgressCount: number;
  completedCount: number;
  currentCount: number;
  archivedCount: number;
  showArchived: boolean;
  onShowArchivedChange: (archived: boolean) => void;
  statusScope: AssessmentStatusScope;
  onStatusScopeChange: (scope: AssessmentStatusScope) => void;
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
  onRowArchiveAction?: (key: string | number) => void;
  onRowUnarchiveAction?: (key: string | number) => void;
  /** When true, draft rows show a disabled edit control (cannot continue the assessment). */
  assessmentViewOnly?: boolean;
  showNewAssessment?: boolean;
  onNewAssessment?: () => void;
  newAssessmentLabel?: string;
  /** Column header for the score badge (vendor: Readiness, buyer: Implementation readiness). */
  scoreColumnLabel?: string;
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

function riskGradeBadgeClass(letter: string): string {
  const L = normalizeDisplayLetterGrade(letter).toUpperCase();
  if (L === "A") return "vd_premium_grade_a";
  if (L === "B") return "vd_premium_grade_b";
  if (L === "C") return "vd_premium_grade_c";
  return "vd_premium_grade_c";
}

function RiskScoreGradeBadge({
  riskScore,
  displayScore,
  riskDisplay,
  riskGradeProfile,
}: {
  riskScore: number | null;
  displayScore: number | null;
  riskDisplay: string;
  riskGradeProfile: "buyer" | "vendor";
}) {
  const shown = displayScore ?? (riskScore != null ? Math.max(0, Math.min(100, 100 - riskScore)) : null);
  if (shown == null || !Number.isFinite(shown)) {
    return (
      <span
        className="vd_list_grade_badge vd_premium_grade_na"
        title={riskDisplay || "Score not available"}
      >
        <Award size={12} className="vd_list_grade_badge_icon" aria-hidden />
        <span className="vd_list_grade_badge_score">
          {riskDisplay === "Pending" ? "…" : "N/A"}
        </span>
      </span>
    );
  }
  const letter = normalizeDisplayLetterGrade(
    gradeFromOverallRiskScore(
      riskGradeProfile === "buyer" ? shown : (riskScore ?? shown),
      riskGradeProfile,
    ),
  );
  const gradeClass = riskGradeBadgeClass(letter);
  const scoreText = formatScore2(shown);
  const titlePrefix = riskGradeProfile === "buyer" ? "Implementation readiness" : "Readiness";
  return (
    <span
      className={`vd_list_grade_badge ${gradeClass}`}
      title={`${titlePrefix} ${scoreText}`}
    >
      <Award size={12} className="vd_list_grade_badge_icon" aria-hidden />
      <span className="vd_list_grade_badge_score">{scoreText}</span>
    </span>
  );
}

const STATUS_FILTERS: { id: AssessmentStatusScope; label: string }[] = [
  { id: "all", label: "All statuses" },
  { id: "completed", label: "Completed" },
  { id: "in_progress", label: "In progress" },
];

export default function AssessmentsLedgerPanel({
  inProgressCount,
  completedCount,
  currentCount,
  archivedCount,
  showArchived,
  onShowArchivedChange,
  statusScope,
  onStatusScopeChange,
  search,
  onSearchChange,
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
  onRowArchiveAction,
  onRowUnarchiveAction,
  assessmentViewOnly = false,
  showNewAssessment,
  onNewAssessment,
  newAssessmentLabel = "New assessment",
  scoreColumnLabel = "Readiness",
}: AssessmentsLedgerPanelProps) {
  const [listingExpanded, setListingExpanded] = useState(true);
  const [statusExpanded, setStatusExpanded] = useState(true);
  const [openToolbarMenu, setOpenToolbarMenu] = useState<"status" | null>(null);

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

  const listingSidebarTotal = currentCount + archivedCount;
  const statusFilterLabel =
    STATUS_FILTERS.find((f) => f.id === statusScope)?.label ?? "Status";

  useEffect(() => {
    if (!openToolbarMenu) return;
    const onDoc = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(".vd_list_toolbar_dropdown")) return;
      setOpenToolbarMenu(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openToolbarMenu]);

  const renderStatusCell = (row: LedgerRowVM) => {
    if (row.statusKind === "completed") {
      return (
        <span className="pill pill_status pill_status_active pill_status_with_dot">
          <span className="pill_status_dot" aria-hidden />
          Completed
        </span>
      );
    }
    if (row.statusKind === "archived") {
      return (
        <span className="assessments_vd_badge assessments_vd_badge--archived">
          Archived
        </span>
      );
    }
    if (row.statusKind === "expired") {
      return (
        <span className="pill pill_status pill_status_inactive pill_status_with_dot">
          <span className="pill_status_dot" aria-hidden />
          Expired
        </span>
      );
    }
    return (
      <div className="assessments_vd_progress">
        <div className="assessments_vd_progress_track">
          <div
            className="assessments_vd_progress_fill"
            style={{
              width: `${Math.min(100, Math.max(6, row.progressPct ?? 20))}%`,
            }}
          />
        </div>
        <span className="assessments_vd_progress_label">
          {Math.round(row.progressPct ?? 0)}% complete
        </span>
      </div>
    );
  };

  return (
    <div className="assessments_ledger">
      <header className="assessments_ledger_header page_header_align org_settings_header">
        <div className="assessments_ledger_header_titles org_settings_headers page_header_row">
          <span className="icon_size_header" aria-hidden>
            <ClipboardList size={24} className="header_icon_svg" />
          </span>
          <div className="page_header_title_block">
            <h1 className="assessments_ledger_title org_settings_title page_header_title">
              Assessments
            </h1>
            <p className="org_settings_subtitle page_header_subtitle">
              View and manage vendor and buyer assessments.
            </p>
          </div>
        </div>
        <div className="assessments_ledger_header_actions btn_user_page">
          {showNewAssessment && onNewAssessment && (
            <Button className="invite_user_btn" onClick={onNewAssessment}>
              <Plus size={24} aria-hidden />
              {newAssessmentLabel}
            </Button>
          )}
        </div>
      </header>

      <div className="assessments_ledger_summary dash_stat_grid assessments_ledger_summary_stats">
        <DashboardStatCard
          label="Completed assessments"
          value={completedCount}
          description="Total finalized risk records"
          progress={progressGreenPct}
          icon={<CheckCircle2 size={18} />}
          accent="green"
        />
        <DashboardStatCard
          label="Assessments in progress"
          value={inProgressCount}
          description="Drafting or under active review"
          progress={progressBluePct}
          icon={<FileClock size={18} />}
          accent="blue"
        />
      </div>

      {fetchError && (
        <p className="assessments_ledger_error" role="alert">
          {fetchError}
        </p>
      )}

      {!fetchError && (
        <div className="vd_list_workspace assessments_vd_workspace">
          <div className="vd_list_card vd_list_card--filters">
            <div className="vd_list_toolbar">
              <div className="vd_list_toolbar_filters">
                <div className="vd_list_toolbar_dropdown">
                  <button
                    type="button"
                    className={`vd_list_filter_btn${statusScope !== "all" ? " vd_list_filter_btn--active" : ""}`}
                    aria-haspopup="listbox"
                    aria-expanded={openToolbarMenu === "status"}
                    disabled={showArchived}
                    onClick={() =>
                      setOpenToolbarMenu((m) =>
                        m === "status" ? null : "status",
                      )
                    }
                  >
                    {showArchived
                      ? "Status"
                      : statusScope === "all"
                        ? "Status"
                        : statusFilterLabel}
                    <ChevronDown size={14} aria-hidden />
                  </button>
                  {openToolbarMenu === "status" && !showArchived && (
                    <ul className="vd_list_filter_menu" role="listbox">
                      {STATUS_FILTERS.map(({ id, label }) => (
                        <li
                          key={id}
                          role="option"
                          aria-selected={statusScope === id}
                        >
                          <button
                            type="button"
                            className={
                              statusScope === id
                                ? "vd_list_filter_option vd_list_filter_option--active"
                                : "vd_list_filter_option"
                            }
                            onClick={() => {
                              onStatusScopeChange(id);
                              setOpenToolbarMenu(null);
                            }}
                          >
                            <span>{label}</span>
                            <span className="vd_list_filter_option_count">
                              {id === "all"
                                ? currentCount
                                : id === "completed"
                                  ? completedCount
                                  : inProgressCount}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <div className="vd_list_toolbar_search_wrap">
                <div className="vd_list_search">
                  <Search
                    size={16}
                    className="vd_list_search_icon"
                    aria-hidden
                  />
                  <input
                    type="search"
                    className="vd_list_search_input"
                    placeholder="Search assessments..."
                    value={search}
                    onChange={(e) => onSearchChange(e.target.value)}
                    aria-label="Search assessments"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="vd_list_layout">
            <aside className="vd_list_sidebar" aria-label="Assessment filters">
              <div className="vd_list_card vd_list_sidebar_panel">
                <section
                  className={`vd_list_sidebar_group${listingExpanded ? " vd_list_sidebar_group--open" : ""}`}
                >
                  <button
                    type="button"
                    className="vd_list_sidebar_group_header"
                    aria-expanded={listingExpanded}
                    onClick={() => setListingExpanded((v) => !v)}
                  >
                    <span className="vd_list_sidebar_group_left">
                      <FolderKanban
                        size={16}
                        className="vd_list_sidebar_group_icon"
                        aria-hidden
                      />
                      <span className="vd_list_sidebar_group_title">
                        Listing
                      </span>
                    </span>
                    <span className="vd_list_sidebar_group_right">
                      <span className="vd_list_sidebar_group_count">
                        {listingSidebarTotal}
                      </span>
                      <ChevronDown
                        size={14}
                        className="vd_list_sidebar_chevron"
                        aria-hidden
                      />
                    </span>
                  </button>
                  {listingExpanded ? (
                    <ul className="vd_list_sidebar_sublist">
                      <li>
                        <button
                          type="button"
                          className={`vd_list_sidebar_subitem${!showArchived ? " vd_list_sidebar_subitem--active" : ""}`}
                          onClick={() => onShowArchivedChange(false)}
                          id="assessments-tab-current"
                        >
                          <span className="vd_list_sidebar_subitem_label">
                            <FileText size={14} aria-hidden />
                            Current
                          </span>
                          <span className="vd_list_sidebar_subcount">
                            {currentCount}
                          </span>
                        </button>
                      </li>
                      <li>
                        <button
                          type="button"
                          className={`vd_list_sidebar_subitem${showArchived ? " vd_list_sidebar_subitem--active" : ""}`}
                          onClick={() => onShowArchivedChange(true)}
                          id="assessments-tab-archived"
                        >
                          <span className="vd_list_sidebar_subitem_label">
                            <ArchiveRestore size={14} aria-hidden />
                            Archived
                          </span>
                          <span className="vd_list_sidebar_subcount">
                            {archivedCount}
                          </span>
                        </button>
                      </li>
                    </ul>
                  ) : (
                    <p className="vd_list_sidebar_collapsed_hint">2 scopes</p>
                  )}
                </section>

                <section
                  className={`vd_list_sidebar_group${statusExpanded ? " vd_list_sidebar_group--open" : ""}`}
                >
                  <button
                    type="button"
                    className="vd_list_sidebar_group_header"
                    aria-expanded={statusExpanded}
                    onClick={() => setStatusExpanded((v) => !v)}
                  >
                    <span className="vd_list_sidebar_group_left">
                      <Filter
                        size={16}
                        className="vd_list_sidebar_group_icon"
                        aria-hidden
                      />
                      <span className="vd_list_sidebar_group_title">Status</span>
                    </span>
                    <span className="vd_list_sidebar_group_right">
                      <span className="vd_list_sidebar_group_count">
                        {currentCount}
                      </span>
                      <ChevronDown
                        size={14}
                        className="vd_list_sidebar_chevron"
                        aria-hidden
                      />
                    </span>
                  </button>
                  {statusExpanded ? (
                    showArchived ? (
                      <p className="vd_list_sidebar_collapsed_hint">
                        Status filters apply to Current
                      </p>
                    ) : (
                      <ul className="vd_list_sidebar_sublist">
                        <li>
                          <button
                            type="button"
                            className={`vd_list_sidebar_subitem${statusScope === "completed" ? " vd_list_sidebar_subitem--active" : ""}`}
                            onClick={() => onStatusScopeChange("completed")}
                          >
                            <span>Completed</span>
                            <span className="vd_list_sidebar_subcount">
                              {completedCount}
                            </span>
                          </button>
                        </li>
                        <li>
                          <button
                            type="button"
                            className={`vd_list_sidebar_subitem${statusScope === "in_progress" ? " vd_list_sidebar_subitem--active" : ""}`}
                            onClick={() => onStatusScopeChange("in_progress")}
                          >
                            <span>In progress</span>
                            <span className="vd_list_sidebar_subcount">
                              {inProgressCount}
                            </span>
                          </button>
                        </li>
                        <li>
                          <button
                            type="button"
                            className={`vd_list_sidebar_subitem${statusScope === "all" ? " vd_list_sidebar_subitem--active" : ""}`}
                            onClick={() => onStatusScopeChange("all")}
                          >
                            <span>All statuses</span>
                            <span className="vd_list_sidebar_subcount">
                              {currentCount}
                            </span>
                          </button>
                        </li>
                      </ul>
                    )
                  ) : (
                    <p className="vd_list_sidebar_collapsed_hint">
                      3 status filters
                    </p>
                  )}
                </section>
              </div>
            </aside>

            <div
              className="vd_list_card vd_list_card--products vd_list_main assessments_vd_products_panel"
              id={
                showArchived
                  ? "assessments-panel-archived"
                  : "assessments-panel-current"
              }
              role="tabpanel"
              aria-labelledby={
                showArchived
                  ? "assessments-tab-archived"
                  : "assessments-tab-current"
              }
            >
              {rows.length === 0 ? (
                <div
                  className="vd_empty_state vd_premium_directory_empty_fill assessments_vd_empty"
                  role="status"
                >
                  <span className="vd_empty_state__icon" aria-hidden>
                    <SearchX size={28} />
                  </span>
                  <h3 className="vd_empty_state__title">
                    {showArchived
                      ? "No archived assessments"
                      : statusScope === "completed"
                        ? "No completed assessments"
                        : statusScope === "in_progress"
                          ? "No assessments in progress"
                          : "No assessments yet"}
                  </h3>
                  <p className="vd_empty_state__desc">{emptyMessage}</p>
                  {!showArchived && statusScope !== "all" && (
                    <button
                      type="button"
                      className="vd_empty_state__action"
                      onClick={() => onStatusScopeChange("all")}
                    >
                      Clear status filter
                    </button>
                  )}
                </div>
              ) : (
                <>
                  <div
                    className={`vd_list_ledger assessments_vd_ledger${
                      String(scoreColumnLabel).length > 12
                        ? " assessments_vd_ledger--wide-score"
                        : ""
                    }`}
                  >
                    <div
                      className="vd_list_colhead assessments_vd_colhead"
                      aria-hidden
                    >
                      <span className="vd_list_colhead_cell">Assessment</span>
                      <span className="vd_list_colhead_cell">Status</span>
                      <span className="vd_list_colhead_cell">Assigned lead</span>
                      <span className="vd_list_colhead_cell assessments_vd_colhead_score">
                        {scoreColumnLabel}
                      </span>
                      <span className="vd_list_colhead_cell">
                        {showArchived ? "Expired date" : "Completion date"}
                      </span>
                      <span className="vd_list_colhead_cell">Actions</span>
                    </div>
                    <ul className="vd_list_rows" role="list">
                      {rows.map((row) => (
                        <li key={String(row.key)}>
                          <div className="vd_list_row assessments_vd_row">
                            <span className="vd_list_cell vd_list_cell--product">
                              <span className="vd_list_row_icon" aria-hidden>
                                {row.icon === "building" ? (
                                  <Landmark size={18} />
                                ) : (
                                  <Clipboard size={18} />
                                )}
                              </span>
                              <span className="vd_list_name_block">
                                <span
                                  className="vd_list_row_title"
                                  title={row.title}
                                >
                                  {row.title}
                                </span>
                                <span
                                  className={`vd_list_row_labels assessments_vd_expiry${
                                    showArchived &&
                                    row.statusKind === "expired"
                                      ? " assessments_vd_expiry--archived"
                                      : row.statusKind === "completed" ||
                                          row.statusKind === "archived"
                                        ? " assessments_vd_expiry--completed"
                                        : ""
                                  }`}
                                >
                                  <span className="vd_list_row_labels_text">
                                    {row.expiryLine}
                                  </span>
                                </span>
                              </span>
                            </span>

                            <span className="vd_list_cell assessments_vd_cell--status">
                              {renderStatusCell(row)}
                            </span>

                            <span className="vd_list_cell assessments_vd_cell--lead">
                              <span
                                className="assessments_vd_avatar"
                                title={row.leadName}
                                aria-hidden
                              >
                                {initialsFromName(row.leadName)}
                              </span>
                              <span
                                className="vd_list_cell_text"
                                title={row.leadName}
                              >
                                {row.leadName}
                              </span>
                            </span>

                            <span className="vd_list_cell assessments_vd_cell--risk">
                              <RiskScoreGradeBadge
                                riskScore={row.riskScore}
                                displayScore={row.displayScore}
                                riskDisplay={row.riskDisplay}
                                riskGradeProfile={row.riskGradeProfile}
                              />
                            </span>

                            <span className="vd_list_cell assessments_vd_cell--date">
                              <span className="assessments_vd_date_block">
                                <span className="vd_list_cell_text">
                                  {row.dateLine1}
                                </span>
                                <span className="assessments_vd_date_secondary">
                                  {row.dateLine2}
                                </span>
                              </span>
                            </span>

                            <span className="vd_list_cell assessments_vd_cell--actions">
                              <div className="user_table_actions">
                                <button
                                  type="button"
                                  className="user_table_action_btn user_table_action_btn_icon"
                                  onClick={() => onRowViewAction(row.key)}
                                  title="View"
                                  aria-label="View"
                                >
                                  <Eye size={14} />
                                </button>
                                {row.statusKind === "draft" ? (
                                  <button
                                    type="button"
                                    className="user_table_action_btn user_table_action_btn_icon"
                                    disabled={assessmentViewOnly}
                                    onClick={() => onRowReportAction(row.key)}
                                    title={
                                      assessmentViewOnly
                                        ? "You cannot edit assessments with your current access"
                                        : "Continue assessment"
                                    }
                                    aria-label={
                                      assessmentViewOnly
                                        ? "Continue assessment (not available)"
                                        : "Continue assessment"
                                    }
                                  >
                                    <SquarePen size={14} />
                                  </button>
                                ) : row.hasReport ? (
                                  <button
                                    type="button"
                                    className="user_table_action_btn user_table_action_btn_icon"
                                    onClick={() => onRowReportAction(row.key)}
                                    title="View report"
                                    aria-label="View report"
                                  >
                                    <FileText size={14} />
                                  </button>
                                ) : null}
                                {row.statusKind === "completed" &&
                                  row.canArchive &&
                                  onRowArchiveAction && (
                                    <button
                                      type="button"
                                      className="user_table_action_btn user_table_action_btn_icon"
                                      onClick={() =>
                                        onRowArchiveAction(row.key)
                                      }
                                      title="Archive"
                                      aria-label="Archive"
                                    >
                                      <Archive size={14} />
                                    </button>
                                  )}
                                {(row.statusKind === "completed" ||
                                  row.statusKind === "archived") &&
                                  row.canUnarchive &&
                                  onRowUnarchiveAction && (
                                    <button
                                      type="button"
                                      className="user_table_action_btn user_table_action_btn_icon"
                                      onClick={() =>
                                        onRowUnarchiveAction(row.key)
                                      }
                                      title="Reactive"
                                      aria-label="Reactive: return assessment to the Current list"
                                    >
                                      <RotateCcw size={14} />
                                    </button>
                                  )}
                              </div>
                            </span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <footer className="vd_premium_index_footer assessments_vd_panel_footer">
                    <ReportsPagination
                      totalItems={totalFiltered}
                      currentPage={currentPage}
                      pageSize={pageSize}
                      onPageChange={onPageChange}
                      onPageSizeChange={onPageSizeChange}
                    />
                  </footer>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
