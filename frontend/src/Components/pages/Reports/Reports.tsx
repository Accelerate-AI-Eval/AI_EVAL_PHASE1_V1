import { useState, useEffect, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { FileText, Search, CircleX, Ban, Trash2 } from "lucide-react";
import { formatDateDDMMMYYYY } from "../../../utils/formatDate.js";
import Modal from "../../UI/Modal";
import Button from "../../UI/Button";
import LoadingMessage from "../../UI/LoadingMessage";
import "../../../styles/page_tabs.css";
import "../../../styles/popovers.css";
import "../UserManagement/user_management.css";
import "../UserProfile/user_profile.css";
import "./reports.css";
import GeneralReports, { type GeneratedReportItem } from "./GeneralReports";
import GeneralReportsCards from "./GeneralReportsCards";
import CompleteReportsCards from "./CompleteReportsCards";
import { ReportsPagination } from "./ReportsPagination";

const BASE_URL =
  import.meta.env.VITE_BASE_URL ?? "http://localhost:5003/api/v1";

export interface CustomerRiskReportItem {
  id: string;
  assessmentId: string;
  title: string;
  report?: Record<string, unknown>;
  createdAt: string;
  expiryAt?: string | null;
  /** When set and in the past, report is archived (linked attestation expired). */
  attestationExpiryAt?: string | null;
  /** Buyer vendor risk reports use buyer-vendor-risk-report route. */
  source?: "customer" | "buyer_vendor_risk";
  /** Buyer complete report: IRS from assess-3 formula. */
  implementationRiskScore?: number | null;
}

type TabId = "assessment" | "general" | "archived";

/** True when report is archived: assessment expiry or attestation expiry has passed. */
function isCustomerReportArchived(report: CustomerRiskReportItem): boolean {
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

/** Report cards: display only org name and product name (strip "Analysis Report: " prefix) */
function getReportCardTitle(fullTitle: string): string {
  if (!fullTitle || typeof fullTitle !== "string") return fullTitle || "—";
  const stripped = fullTitle.replace(/^Analysis Report:\s*/i, "").trim();
  return stripped || fullTitle;
}

function formatReportMeta(createdAt: string): string {
  if (!createdAt) return "Analysis Report";
  const dateStr = formatDateDDMMMYYYY(createdAt);
  return dateStr === "—" ? "Analysis Report" : `Analysis Report • ${dateStr}`;
}

/** Formatted expiry for Complete Report card footer (expiryAt or attestationExpiryAt). */
function getCompleteReportExpiryDate(report: CustomerRiskReportItem): string {
  const raw = report.expiryAt ?? report.attestationExpiryAt;
  if (raw == null || String(raw).trim() === "") return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return formatDateDDMMMYYYY(raw);
}

function Reports() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<TabId>("assessment");
  const [reports, setReports] = useState<CustomerRiskReportItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [completeReportsPage, setCompleteReportsPage] = useState(1);
  const [completeReportsPageSize, setCompleteReportsPageSize] = useState(10);
  const [archivedCompletePage, setArchivedCompletePage] = useState(1);
  const [archivedGeneralReports, setArchivedGeneralReports] = useState<GeneratedReportItem[]>([]);
  const [archivedPage, setArchivedPage] = useState(1);
  const [archivedPageSize, setArchivedPageSize] = useState(10);
  const [deleteReportId, setDeleteReportId] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  const systemRoleForAccess = (sessionStorage.getItem("systemRole") ?? "").toLowerCase().trim().replace(/_/g, " ");
  const userRoleForAccess = (sessionStorage.getItem("userRole") ?? "").toLowerCase().trim();
  const isAssessmentAnalysisViewOnly =
    systemRoleForAccess === "system manager" || systemRoleForAccess === "system viewer";
  // T&SA Manager / Lead / Engineer / Viewer (vendor): view-only on Reports (no generate, no delete).
  // Buyer Engineer: can generate reports (dropdown shows their assessments only).
  // Buyer Viewer: view-only for Dashboard, AI Vendor Directory, and Reports.
  const isReportsViewOnly =
    isAssessmentAnalysisViewOnly ||
    (systemRoleForAccess === "vendor" && (userRoleForAccess === "manager" || userRoleForAccess === "lead" || userRoleForAccess === "engineer" || userRoleForAccess === "viewer")) ||
    (systemRoleForAccess === "buyer" && userRoleForAccess === "viewer");

  useEffect(() => {
    setCompleteReportsPage(1);
    if (activeTab === "archived") {
      setArchivedCompletePage(1);
      setArchivedPage(1);
    }
  }, [activeTab, searchQuery]);

  useEffect(() => {
    document.title = "AI Eval | Reports";
    return () => {
      document.title = "AI Eval";
    };
  }, []);

  /** Open the correct tab when returning from a report detail (complete vs general). */
  useEffect(() => {
    const tab = (location.state as { tab?: TabId } | null)?.tab;
    if (tab === "assessment" || tab === "general" || tab === "archived") {
      setActiveTab(tab);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  const LOADER_MIN_MS = 2500; // same as Assessments page

  useEffect(() => {
    if (activeTab !== "assessment" && activeTab !== "archived") return;
    const token = sessionStorage.getItem("bearerToken");
    if (!token) {
      setLoading(false);
      setReports([]);
      return;
    }
    setLoading(true);
    setError(null);
    const loadStart = Date.now();
    const finishLoading = () => {
      const elapsed = Date.now() - loadStart;
      const remaining = Math.max(0, LOADER_MIN_MS - elapsed);
      setTimeout(() => setLoading(false), remaining);
    };
    const systemRole = (sessionStorage.getItem("systemRole") ?? "").toLowerCase().trim().replace(/_/g, " ");
    const organizationId = (sessionStorage.getItem("organizationId") ?? "").trim();
    const isSystemManagerOrViewer = systemRole === "system manager" || systemRole === "system viewer";
    const query = isSystemManagerOrViewer && organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
    Promise.all([
      fetch(`${BASE_URL}/customerRiskReports${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => res.json()),
      fetch(`${BASE_URL}/buyerVendorRiskReports${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => res.json()),
    ])
      .then(([customerData, buyerData]) => {
        const customerList: CustomerRiskReportItem[] = Array.isArray(
          customerData?.data?.reports,
        )
          ? customerData.data.reports.map((r: CustomerRiskReportItem) => ({
              ...r,
              source: "customer" as const,
            }))
          : [];
        const buyerList: CustomerRiskReportItem[] = Array.isArray(
          buyerData?.data?.reports,
        )
          ? buyerData.data.reports.map(
              (r: {
                id: string;
                assessmentId: string;
                title: string;
                createdAt: string;
                expiryAt?: string | null;
                attestationExpiryAt?: string | null;
                source: string;
                implementationRiskScore?: number | null;
              }) => ({
                id: r.id,
                assessmentId: r.assessmentId,
                title: r.title,
                createdAt: r.createdAt,
                expiryAt: r.expiryAt ?? null,
                attestationExpiryAt: r.attestationExpiryAt ?? null,
                source: "buyer_vendor_risk" as const,
                implementationRiskScore:
                  r.implementationRiskScore != null && Number.isFinite(Number(r.implementationRiskScore))
                    ? Number(r.implementationRiskScore)
                    : null,
              }),
            )
          : [];
        const merged = [...customerList, ...buyerList].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
        setReports(merged);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load reports");
        setReports([]);
      })
      .finally(() => finishLoading());
  }, [activeTab]);

  const handleSelectReport = (report: CustomerRiskReportItem) => {
    if (report.source === "buyer_vendor_risk" && report.assessmentId) {
      navigate(
        `/buyer-vendor-risk-report/${encodeURIComponent(report.assessmentId)}`,
      );
    } else {
      navigate(`/reports/${report.id}`, {
        state: { reportTitle: getReportCardTitle(report.title ?? "") },
      });
    }
  };

  const handleViewGeneralReport = (report: GeneratedReportItem) => {
    const reportTitle = `${report.assessmentLabel ?? ""} — ${report.reportType ?? ""}`.trim();
    navigate(`/reports/general/${encodeURIComponent(report.id)}`, {
      state: { reportTitle },
    });
  };

  const handleDownload = (reportId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // TODO: trigger PDF download
  };

  const openDeleteReportModal = (reportId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDeleteReportId(reportId);
  };

  const closeDeleteReportModal = () => {
    if (!deleteSubmitting) setDeleteReportId(null);
  };

  const confirmDeleteReport = async () => {
    if (!deleteReportId) return;
    const token = sessionStorage.getItem("bearerToken");
    if (!token) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(
        `${BASE_URL}/customerRiskReports/${encodeURIComponent(deleteReportId)}`,
        { method: "DELETE", headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (data?.success) {
        setReports((prev) => prev.filter((r) => r.id !== deleteReportId));
        setDeleteReportId(null);
      }
    } catch {
      // ignore
    } finally {
      setDeleteSubmitting(false);
    }
  };

  /** Current (non-archived) and archived Complete Reports for tab split. */
  const currentAssessmentReports = reports.filter((r) => !isCustomerReportArchived(r));
  const archivedAssessmentReports = reports.filter((r) => isCustomerReportArchived(r));
  /** For Complete Reports tab: only current reports; filter by search. */
  const assessmentReportsRaw =
    activeTab === "assessment" ? currentAssessmentReports : activeTab === "archived" ? archivedAssessmentReports : [];
  /** Filter Complete Reports by search: org name / product name (title), or "published" / "archived". */
  const assessmentReports =
    activeTab === "assessment" || activeTab === "archived"
      ? (() => {
          const q = searchQuery.trim().toLowerCase();
          if (!q) return assessmentReportsRaw;
          if (q === "published") {
            return assessmentReportsRaw.filter((r) => !isCustomerReportArchived(r));
          }
          if (q === "archived") {
            return assessmentReportsRaw.filter((r) => isCustomerReportArchived(r));
          }
          return assessmentReportsRaw.filter((r) => {
            const title = getReportCardTitle(r.title ?? "");
            return title.toLowerCase().includes(q);
          });
        })()
      : [];

  /** Combined archived list (complete + general) for single pagination on Archived tab. */
  const combinedArchivedList = useMemo(() => {
    const complete = assessmentReports.map((r) => ({ type: "complete" as const, data: r, sortKey: r.createdAt }));
    const general = archivedGeneralReports.map((r) => ({ type: "general" as const, data: r, sortKey: r.generatedAt }));
    return [...complete, ...general].sort(
      (a, b) => new Date(b.sortKey).getTime() - new Date(a.sortKey).getTime()
    );
  }, [assessmentReports, archivedGeneralReports]);

  const paginatedArchivedList = combinedArchivedList.slice(
    (archivedPage - 1) * archivedPageSize,
    archivedPage * archivedPageSize
  );

  return (
    <div className="sec_user_page org_settings_page reports_page">
      <div className="org_settings_header page_header_align">
        <div className="org_settings_headers page_header_row">
          <span className="icon_size_header" aria-hidden>
            <FileText size={24} className="header_icon_svg" />
          </span>
          <div className="page_header_title_block">
            <h1 className="org_settings_title page_header_title">Reports Library</h1>
            <p className="org_settings_subtitle page_header_subtitle">
              Access completed reports and past assessment analyses.
            </p>
          </div>
        </div>
      </div>
      <div className="reports_tabs_section">
        <div className="page_tabs">
          <button
            type="button"
            className={`page_tab ${activeTab === "assessment" ? "page_tab_active" : ""}`}
            onClick={() => setActiveTab("assessment")}
          >
            Complete Reports
          </button>
          <button
            type="button"
            className={`page_tab ${activeTab === "general" ? "page_tab_active" : ""}`}
            onClick={() => setActiveTab("general")}
          >
            Assessment Analysis
          </button>
          <button
            type="button"
            className={`page_tab ${activeTab === "archived" ? "page_tab_active" : ""}`}
            onClick={() => setActiveTab("archived")}
          >
            Archived
          </button>
        </div>
        <div className="reports_search_wrap reports_search_input">
          <Search size={18} className="reports_search_icon" aria-hidden />
          <input
            type="search"
            placeholder="Search by org name, product name, published or archived…"
            className="reports_search_input"
            aria-label="Search reports"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="reports_list">
        {(activeTab === "assessment" || activeTab === "archived") && loading && (
          <LoadingMessage message="Loading reports…" />
        )}
        {(activeTab === "assessment" || activeTab === "archived") && !loading && error && (
          <div className="report_detail_empty">
            <h2 className="report_detail_empty_title">Error loading reports</h2>
            <p className="report_detail_empty_text">{error}</p>
          </div>
        )}
        {activeTab === "assessment" &&
          !loading &&
          !error &&
          assessmentReports.length > 0 && (
            <>
              <CompleteReportsCards
                reports={assessmentReports.slice(
                  (completeReportsPage - 1) * completeReportsPageSize,
                  completeReportsPage * completeReportsPageSize
                )}
                getTitle={(r) => getReportCardTitle(r.title ?? "")}
                isArchived={isCustomerReportArchived}
                getExpiryDate={getCompleteReportExpiryDate}
                onViewReport={handleSelectReport}
                onDownload={(r, e) => handleDownload(r.id, e)}
              />
              <ReportsPagination
                totalItems={assessmentReports.length}
                currentPage={completeReportsPage}
                pageSize={completeReportsPageSize}
                onPageChange={setCompleteReportsPage}
                onPageSizeChange={(size) => {
                  setCompleteReportsPageSize(size);
                  setCompleteReportsPage(1);
                }}
              />
            </>
          )}
        {activeTab === "assessment" &&
          !loading &&
          !error &&
          assessmentReports.length === 0 && (
            <div className="report_detail_empty">
              <h2 className="report_detail_empty_title">
                {searchQuery.trim() ? "No reports match your search" : "No reports yet"}
              </h2>
              <p className="report_detail_empty_text">
                {searchQuery.trim()
                  ? "Try a different search (org name, product name, published or archived)."
                  : "There are no completed assessment reports to display. Reports will appear here once assessments are completed and published."}
              </p>
            </div>
          )}
        {activeTab === "general" && (
          <GeneralReports
            searchQuery={searchQuery}
            showArchivedOnly={false}
            canGenerateReports={!isReportsViewOnly}
          />
        )}
        {activeTab === "archived" && !loading && !error && (
          <>
            <GeneralReports
              searchQuery={searchQuery}
              showArchivedOnly
              hideDropdown
              renderArchivedListOnly
              onArchivedReportsChange={setArchivedGeneralReports}
            />
            {combinedArchivedList.length > 0 ? (
              <>
                <div className="general_rpr_cards_sec vendor_directory_grid">
                  {paginatedArchivedList.map((item) =>
                    item.type === "complete" ? (
                      <CompleteReportsCards
                        key={`complete-${item.data.id}`}
                        reports={[item.data]}
                        getTitle={(r) => getReportCardTitle(r.title ?? "")}
                        isArchived={() => true}
                        getExpiryDate={getCompleteReportExpiryDate}
                        onViewReport={handleSelectReport}
                        viewEnabledWhenArchived
                        singleCard
                      />
                    ) : (
                      <GeneralReportsCards
                        key={`general-${item.data.id}`}
                        reports={[item.data]}
                        onViewReport={handleViewGeneralReport}
                        singleCard
                      />
                    )
                  )}
                </div>
                <ReportsPagination
                  totalItems={combinedArchivedList.length}
                  currentPage={archivedPage}
                  pageSize={archivedPageSize}
                  onPageChange={setArchivedPage}
                  onPageSizeChange={(size) => {
                    setArchivedPageSize(size);
                    setArchivedPage(1);
                  }}
                />
              </>
            ) : (
              <div className="report_detail_empty">
                <h2 className="report_detail_empty_title">No archived reports</h2>
                <p className="report_detail_empty_text">
                  Archived reports from Complete Reports and Assessment Analysis will appear here.
                </p>
              </div>
            )}
          </>
        )}

        {!isReportsViewOnly && (
        <Modal
          isOpen={deleteReportId != null}
          onClose={closeDeleteReportModal}
          overlayClassName="profile_modal_overlay"
          popupClassName=""
        >
          <div className="profile_modal_content settings_modal_content report_delete_modal_content">
            <div className="profile_modal_header">
              <h2 className="profile_modal_title">Delete report</h2>
              <button
                type="button"
                className="modal_close_btn"
                onClick={closeDeleteReportModal}
                disabled={deleteSubmitting}
                aria-label="Close"
              >
                <CircleX size={20} />
              </button>
            </div>
            <div className="profile_modal_body">
              {deleteReportId && (
                <>
                  <p className="report_delete_modal_subtitle">
                    {getReportCardTitle(
                      reports.find((r) => r.id === deleteReportId)?.title ?? ""
                    )}
                  </p>
                  <p className="report_delete_modal_message">
                    Permanently delete this report? This cannot be undone.
                  </p>
                </>
              )}
              <div className="settings_form_actions">
                <Button
                  type="button"
                  className="orgCancelBtn"
                  onClick={closeDeleteReportModal}
                  disabled={deleteSubmitting}
                >
                  <Ban size={16} aria-hidden />
                  Cancel
                </Button>
                <Button
                  type="button"
                  className="report_delete_confirm_btn orgCreateBtn"
                  onClick={confirmDeleteReport}
                  disabled={deleteSubmitting}
                >
                  <Trash2 size={16} aria-hidden />
                  {deleteSubmitting ? "Deleting…" : "Delete"}
                </Button>
              </div>
            </div>
          </div>
        </Modal>
        )}

        {/* <div className="report_detail_empty">
            <h2 className="report_detail_empty_title">
              No general reports yet
            </h2>
            <p className="report_detail_empty_text">
              General reports will appear here when available.
            </p>
          </div> */}
        
      </div>
    </div>
  );
}

export default Reports;
