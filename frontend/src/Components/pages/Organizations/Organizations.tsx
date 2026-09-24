import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import "../../../styles/page_tabs.css";
import "../../../styles/popovers.css";
import "./organization.css";
import "../UserManagement/user_management.css";
import "../VendorOnboarding/StepVendorOnboardingPreview.css";
import "../VendorAttestationDetails/vendor_attestation_details.css";
import "../Assessments/assessments.css";
import CreateOrganization from "./CreateOrganization";
import OrganizationDataTable from "./OrganizationDataTable";
import OrgUsersTable from "./OrgUsersTable";
import StepVendorSelfAttestationPrev, {
  type ComplianceDocumentExpiryMeta,
} from "../VendorAttestations/StepVendorSelfAttestationPrev";
import LoadingMessage from "../../UI/LoadingMessage";
import OrgNameWithLogo from "../../UI/OrgNameWithLogo";
import { ReportsPagination } from "../Reports/ReportsPagination";
// import { buildFormStateFromApi } from "../../utils/vendorAttestationState";
import { buildFormStateFromApi } from "../../../utils/vendorAttestationState";
import { formatDateDDMMMYYYY } from "../../../utils/formatDate.js";
import {
  buildOnboardingFields,
  formatOnboardingDate,
  formatPreviewValue,
} from "../../../utils/orgOnboardingDisplay";
import { getOrganizationTypeDisplay } from "../../../utils/organizationTypeDisplay";
import { Landmark, Plus, User, Users, FileCheck, ClipboardList, Eye, CircleX, Search, FileText, Info, Building2, BadgeCheck, Activity, Calendar } from "lucide-react";
import Button from "../../UI/Button";
import Breadcrumbs from "../../UI/Breadcrumbs";
import ScoreTracePanel from "./ScoreTracePanel";
import "./score_trace_panel.css";
import { resolveStoredLlmModelId } from "../../UI/AdminLlmModelInfo";
import { formatScore2 } from "../../../utils/scoreFormat";

/** Helpers for org assessment cards (same logic as Assessments page). */
function isOrgAssessmentExpired(row) {
  const expiryStr = row?.expiryAt ?? row?.attestationExpiryAt;
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

function getOrgAssessmentStatusLabel(row) {
  if (!row) return "—";
  const s = (row.status ?? "").toLowerCase();
  if (s === "draft") return "Draft";
  if (s === "expired") return "Expired";
  if (s === "submitted" || s === "completed") return isOrgAssessmentExpired(row) ? "Expired" : "Completed";
  return row.status ?? "—";
}

function getOrgAssessmentDisplayTitle(row) {
  const isBuyer = (row.type ?? "").toLowerCase().includes("buyer");
  const org = isBuyer ? (row.organizationName ?? "") : (row.customerOrganizationName ?? "");
  const product = row.productName ?? "";
  const o = String(org).trim();
  const p = String(product).trim();
  if (o === "" && p === "") return "Draft";
  return `${o || "—"} - ${p || "—"}`;
}

function getOrgAssessmentCompletedBy(row) {
  if (!row) return "";
  const userName = (row.completedByUserName ?? "").toString().trim();
  if (userName) return userName;
  const first = (row.completedByUserFirstName ?? "").toString().trim();
  const last = (row.completedByUserLastName ?? "").toString().trim();
  const fullName = [first, last].filter(Boolean).join(" ");
  if (fullName) return fullName;
  const email = (row.completedByUserEmail ?? "").toString().trim();
  if (email) return email;
  const userId = row.completedByUserId;
  if (userId != null && userId !== "") return `User #${userId}`;
  return "";
}

const TAB_ONBOARDING = "onboarding";
const TAB_ATTESTATION = "attestation";
const TAB_ASSESSMENTS = "assessments";
const TAB_USERS = "users";

const Organizations = () => {
  document.title = "AI-Q | Organizations";
  const navigate = useNavigate();
  const location = useLocation();
  const systemRole = (sessionStorage.getItem("systemRole") ?? "").toLowerCase().trim();
  const isSystemAdmin =
    systemRole === "system admin" || systemRole === "system_admin";
  const isViewOnly =
    systemRole === "system manager" ||
    systemRole === "system_manager" ||
    systemRole === "system viewer" ||
    systemRole === "system_viewer";
  const [isOrganization, setIsOrganization] = useState(false);
  const [isPreview, setIsPreview] = useState(true);
  const [previewOrg, setPreviewOrg] = useState(null);
  const [activeTab, setActiveTab] = useState(TAB_ONBOARDING);
  const [isOnboardingData, setIsOnboardingData] = useState({ buyer: null, vendor: null });
  const [onboardingLoading, setOnboardingLoading] = useState(false);
  const [onboardingError, setOnboardingError] = useState(null);
  const [attestations, setAttestations] = useState([]);
  const [attestationsLoading, setAttestationsLoading] = useState(false);
  const [attestationsError, setAttestationsError] = useState(null);
  const [attestationSearch, setAttestationSearch] = useState("");
  const [orgAttestationScope, setOrgAttestationScope] = useState<"current" | "archived">("current");
  const [orgAttestationCardPage, setOrgAttestationCardPage] = useState(1);
  const [orgAttestationCardPageSize, setOrgAttestationCardPageSize] = useState(10);
  const [orgAssessments, setOrgAssessments] = useState([]);
  const [orgAssessmentsLoading, setOrgAssessmentsLoading] = useState(false);
  const [orgAssessmentsError, setOrgAssessmentsError] = useState(null);
  const [orgAssessmentSearch, setOrgAssessmentSearch] = useState("");
  const [orgAssessmentScope, setOrgAssessmentScope] = useState<"current" | "archived">("current");
  const [orgAssessmentCardPage, setOrgAssessmentCardPage] = useState(1);
  const [orgAssessmentCardPageSize, setOrgAssessmentCardPageSize] = useState(10);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFormState, setPreviewFormState] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewAttestationId, setPreviewAttestationId] = useState(null);
  const [previewComplianceExpiries, setPreviewComplianceExpiries] = useState<
    Record<string, ComplianceDocumentExpiryMeta> | null
  >(null);
  const [scoreTraceOpen, setScoreTraceOpen] = useState(false);
  const [scoreTraceTarget, setScoreTraceTarget] = useState<{
    id: string;
    title: string;
    reportId?: string | null;
    traceType: "vts" | "scs" | "irs";
    llmModelName?: string | null;
    cardScore?: number | null;
  } | null>(null);
  const BASE_URL = import.meta.env.VITE_BASE_URL || "http://localhost:5003/api/v1";

  const handleOpenDocument = useCallback(async (fileName) => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token || !previewAttestationId) return;
    const url = `${BASE_URL.replace(/\/$/, "")}/vendorSelfAttestation/document/${encodeURIComponent(previewAttestationId)}/${encodeURIComponent(fileName)}`;
    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const w = window.open(blobUrl, "_blank", "noopener,noreferrer");
      if (w) setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
      else URL.revokeObjectURL(blobUrl);
    } catch {
      // ignore
    }
  }, [previewAttestationId, BASE_URL]);

  const createOrganization = () => {
    setIsOrganization(true);
  };

  const openPreview = async (org) => {
    if (!org) return;
    setPreviewOrg(org);
    setIsPreview(false);
    setActiveTab(TAB_ONBOARDING);
    setOnboardingError(null);
    setAttestationsError(null);
    setAttestations([]);
    setOrgAssessments([]);
    setAttestationSearch("");
    setOrgAssessmentSearch("");
    setOrgAttestationScope("current");
    setOrgAssessmentScope("current");
    setOrgAttestationCardPage(1);
    setOrgAssessmentCardPage(1);
    setOnboardingLoading(true);
    setIsOnboardingData({ buyer: null, vendor: null });
    const orgId = String(org.id ?? org.organizationId ?? "").trim();
    if (!orgId) {
      setOnboardingError("Organization ID is missing.");
      setOnboardingLoading(false);
      return;
    }
    const onboardingData = await fetchOnboardingData(orgId);
    setOnboardingLoading(false);
    setIsOnboardingData(onboardingData || { buyer: null, vendor: null });
  };

  const closePreview = () => {
    setPreviewOrg(null);
    setIsPreview(true);
  };

  const fetchOnboardingData = async (orgId) => {
    const token = sessionStorage.getItem("bearerToken");
    try {
      const url = `${BASE_URL.replace(/\/$/, "")}/orgOnboarding/${encodeURIComponent(orgId)}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to fetch onboarding data");
      }

      return result.data ?? { buyer: null, vendor: null };
    } catch (error) {
      console.error("Onboarding fetch error:", error);
      setOnboardingError(error.message || "Failed to load onboarding data");
      return { buyer: null, vendor: null };
    }
  };

  const fetchAttestations = async (orgId) => {
    const token = sessionStorage.getItem("bearerToken");
    setAttestationsError(null);
    setAttestationsLoading(true);
    try {
      const url = `${BASE_URL.replace(/\/$/, "")}/orgAttestations/${encodeURIComponent(orgId)}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.message || "Failed to fetch attestations");
      }
      setAttestations(result.data ?? []);
    } catch (error) {
      console.error("Attestations fetch error:", error);
      setAttestationsError(error.message || "Failed to load attestations");
      setAttestations([]);
    } finally {
      setAttestationsLoading(false);
    }
  };

  const orgIdForFetch = previewOrg ? String(previewOrg.id ?? previewOrg.organizationId ?? "").trim() : "";

  const fetchOrgAssessments = async (orgId) => {
    const token = sessionStorage.getItem("bearerToken");
    setOrgAssessmentsError(null);
    setOrgAssessmentsLoading(true);
    try {
      const url = `${BASE_URL.replace(/\/$/, "")}/assessments?organizationId=${encodeURIComponent(orgId)}`;
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.message || "Failed to fetch assessments");
      setOrgAssessments(Array.isArray(result?.data?.assessments) ? result.data.assessments : []);
    } catch (err) {
      setOrgAssessmentsError(err?.message || "Failed to load assessments");
      setOrgAssessments([]);
    } finally {
      setOrgAssessmentsLoading(false);
    }
  };

  const organizationsList = useSelector((state: { organizations?: { data?: Array<{ id?: number | string; organizationId?: string; organizationName?: string; organizationStatus?: string }> } }) => state?.organizations?.data ?? []);

  useEffect(() => {
    const openOrg = (location.state as { openOrganization?: { id?: string; organizationId?: string; organizationName?: string } } | null)?.openOrganization;
    if (!openOrg || !(openOrg.id || openOrg.organizationId)) return;
    const orgId = String(openOrg.id ?? openOrg.organizationId ?? "").trim();
    const fullOrg = organizationsList.find(
      (o) => String(o.id ?? o.organizationId ?? "").trim() === orgId
    );
    openPreview(fullOrg ?? openOrg);
    navigate("/organizations", { replace: true, state: {} });
  }, [location.state, organizationsList]);

  // When organizations list loads after opening from breadcrumb, refresh preview with full org (including organizationStatus)
  useEffect(() => {
    if (!previewOrg || organizationsList.length === 0) return;
    if (previewOrg.organizationStatus != null) return;
    const orgId = String(previewOrg.id ?? previewOrg.organizationId ?? "").trim();
    if (!orgId) return;
    const fullOrg = organizationsList.find(
      (o) => String(o.id ?? o.organizationId ?? "").trim() === orgId
    );
    if (fullOrg) setPreviewOrg(fullOrg);
  }, [organizationsList, previewOrg?.id, previewOrg?.organizationId, previewOrg?.organizationStatus]);

  useEffect(() => {
    if (activeTab === TAB_ATTESTATION && orgIdForFetch) {
      fetchAttestations(orgIdForFetch);
    }
  }, [activeTab, orgIdForFetch]);

  useEffect(() => {
    if (activeTab === TAB_ASSESSMENTS && orgIdForFetch) {
      fetchOrgAssessments(orgIdForFetch);
    }
  }, [activeTab, orgIdForFetch]);

  useEffect(() => {
    setOrgAttestationCardPage(1);
  }, [attestationSearch, orgAttestationScope]);

  useEffect(() => {
    setOrgAssessmentCardPage(1);
  }, [orgAssessmentSearch, orgAssessmentScope]);

  const handleViewAttestation = useCallback(
    async (attestationId) => {
      if (!orgIdForFetch || !attestationId) return;
      setPreviewAttestationId(attestationId);
      setPreviewOpen(true);
      setPreviewLoading(true);
      setPreviewFormState(null);
      setPreviewComplianceExpiries(null);
      try {
        const token = sessionStorage.getItem("bearerToken");
        const url = `${BASE_URL.replace(/\/$/, "")}/orgAttestationPreview/${encodeURIComponent(orgIdForFetch)}/${encodeURIComponent(attestationId)}`;
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        const result = await response.json();
        if (response.ok && result.success && (result.attestation || result.companyProfile)) {
          const rawExp = result.attestation?.compliance_document_expiries;
          setPreviewComplianceExpiries(
            rawExp != null && typeof rawExp === "object" && !Array.isArray(rawExp)
              ? (rawExp as Record<string, ComplianceDocumentExpiryMeta>)
              : null
          );
          setPreviewFormState(
            buildFormStateFromApi(
              {
                companyProfile: result.companyProfile,
                attestation: result.attestation,
              },
              previewOrg?.organizationName ?? null,
            )
          );
        }
      } catch (err) {
        console.error("Attestation preview fetch error:", err);
      } finally {
        setPreviewLoading(false);
      }
    },
    [orgIdForFetch, BASE_URL, previewOrg?.organizationName]
  );

  const formatAttestationDate = formatDateDDMMMYYYY;

  return (
    <>
      {isPreview ? (
        <div className="organizationPage sec_user_page org_settings_page org_admin_page">
          <div className="org_settings_header page_header_align">
            <div className="org_settings_headers page_header_row">
              <span className="icon_size_header" aria-hidden>
                <Landmark size={24} className="header_icon_svg"/>
              </span>
              <div className="page_header_title_block">
                <h1 className="org_settings_title page_header_title">Organizations</h1>
                <p className="org_settings_subtitle page_header_subtitle">
                  Browse organizations, onboarding status, and team access.
                </p>
              </div>
            </div>
          </div>

          {isOrganization && !isViewOnly && (
            <CreateOrganization setIsOrganization={setIsOrganization} />
          )}

          <div className="org_settings_card team_members_card org_admin_ledger_card">
            <div className="team_members_card_header">
              <div>
                <h2 className="org_settings_card_title">All Organizations</h2>
                <p className="org_settings_card_subtitle">
                  {isViewOnly
                    ? "View organizations, status, and onboarding."
                    : "Create, review, and open organization details."}
                </p>
              </div>
              {!isViewOnly && (
                <Button
                  className="invite_user_btn org_invite_btn"
                  onClick={createOrganization}
                >
                  <Plus size={18} />
                  Add Organization
                </Button>
              )}
            </div>
            <div className="team_members_table_wrapper org_admin_table_shell">
              <OrganizationDataTable openPreview={openPreview} viewOnly={isViewOnly} />
            </div>
          </div>
        </div>
      ) : (
        <div className="organizationPreview organizationPage sec_user_page org_settings_page org_admin_page">
          {/* <h1 className="screenHeading">
            <span>
              <Landmark width={26} height={26} />
            </span>
            Organizations
          </h1> */}
          <Breadcrumbs
            items={[
              { label: "Organizations", onClick: closePreview },
              previewOrg?.organizationName ?? "Organization details",
            ]}
          />

          {onboardingLoading && (
            <LoadingMessage message="Loading organization…" compact />
          )}
          {onboardingError && (
            <p className="organizationPreviewError">{onboardingError}</p>
          )}

          {!onboardingLoading && !onboardingError && (
            <div className="vendor_preview">
              <p className="vendor_preview_intro">
                Organization details for{" "}
                <strong>{previewOrg?.organizationName ?? "this organization"}</strong>.
              </p>
              <div className="org_summary_cards" aria-label="Organization details">
                <article className="org_summary_card">
                  <div className="org_summary_card_top">
                    <div>
                      <p className="org_summary_card_label">Organization name</p>
                      <div className="org_summary_card_value">
                        <OrgNameWithLogo
                          name={previewOrg?.organizationName}
                          id={previewOrg?.id}
                        />
                      </div>
                    </div>
                    <div className="org_summary_card_icon org_summary_card_icon--blue">
                      <Building2 size={20} aria-hidden />
                    </div>
                  </div>
                </article>
                <article className="org_summary_card">
                  <div className="org_summary_card_top">
                    <div>
                      <p className="org_summary_card_label">Type</p>
                      <p className="org_summary_card_value">
                        {getOrganizationTypeDisplay(previewOrg)}
                      </p>
                    </div>
                    <div className="org_summary_card_icon org_summary_card_icon--teal">
                      <BadgeCheck size={20} aria-hidden />
                    </div>
                  </div>
                </article>
                <article className="org_summary_card">
                  <div className="org_summary_card_top">
                    <div>
                      <p className="org_summary_card_label">Status</p>
                      <div className="org_summary_card_value">
                        <span
                          className={
                            previewOrg?.organizationStatus === "active"
                              ? "activeStatus"
                              : previewOrg?.organizationStatus === "archived"
                                ? "archivedStatus"
                                : "inactiveStatus"
                          }
                        >
                          {previewOrg?.organizationStatus
                            ? previewOrg.organizationStatus.charAt(0).toUpperCase() +
                              previewOrg.organizationStatus.slice(1).toLowerCase()
                            : "—"}
                        </span>
                      </div>
                    </div>
                    <div className="org_summary_card_icon org_summary_card_icon--green">
                      <Activity size={20} aria-hidden />
                    </div>
                  </div>
                </article>
              </div>

              {/* Tabs: Onboarding | Attestation | Assessments | Users */}
              <div className="org_preview_tabs_wrap">
                <div className="page_tabs org_preview_tabs">
                  <button
                    type="button"
                    className={`page_tab ${activeTab === TAB_ONBOARDING ? "page_tab_active" : ""}`}
                    onClick={() => setActiveTab(TAB_ONBOARDING)}
                  >
                    <ClipboardList size={18} />
                    Onboarding
                  </button>
                  <button
                    type="button"
                    className={`page_tab ${activeTab === TAB_ATTESTATION ? "page_tab_active" : ""}`}
                    onClick={() => setActiveTab(TAB_ATTESTATION)}
                  >
                    <FileCheck size={18} />
                    Attestation
                  </button>
                  <button
                    type="button"
                    className={`page_tab ${activeTab === TAB_ASSESSMENTS ? "page_tab_active" : ""}`}
                    onClick={() => setActiveTab(TAB_ASSESSMENTS)}
                  >
                    <FileText size={18} />
                    Assessments
                  </button>
                  <button
                    type="button"
                    className={`page_tab ${activeTab === TAB_USERS ? "page_tab_active" : ""}`}
                    onClick={() => setActiveTab(TAB_USERS)}
                  >
                    <Users size={18} />
                    Users
                  </button>
                </div>

                {activeTab === TAB_ONBOARDING && (
                  <div className="vendor_preview_sections org_preview_tab_content org_preview_onboarding_tab">
                    <section className="vendor_preview_card">
                      <h3 className="vendor_preview_card_title">Buyer Onboarding</h3>
                      {isOnboardingData?.buyer ? (
                        <>
                          <div className="org_preview_completed_by">
                            <User size={16} />
                            <span>
                              Completed by{" "}
                              <strong>
                                {isOnboardingData.buyer.completedBy?.name ||
                                  isOnboardingData.buyer.completedBy?.email ||
                                  "—"}
                              </strong>
                              {isOnboardingData.buyer.completedAt &&
                                formatOnboardingDate(isOnboardingData.buyer.completedAt) && (
                                  <> on {formatOnboardingDate(isOnboardingData.buyer.completedAt)}</>
                                )}
                            </span>
                          </div>
                          <dl className="vendor_preview_list">
                            {buildOnboardingFields(isOnboardingData.buyer).map((field) => (
                              <div key={field.label} className="vendor_preview_row">
                                <dt className="vendor_preview_label">{field.label}</dt>
                                <dd className="vendor_preview_value">
                                  {formatPreviewValue(
                                    field.value(isOnboardingData.buyer),
                                    field.label,
                                  )}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </>
                      ) : (
                        <p className="vendor_preview_not_done">Not completed for this organization.</p>
                      )}
                    </section>

                    <section className="vendor_preview_card">
                      <h3 className="vendor_preview_card_title">Vendor Onboarding</h3>
                      {isOnboardingData?.vendor ? (
                        <>
                          <div className="org_preview_completed_by">
                            <User size={16} />
                            <span>
                              Completed by{" "}
                              <strong>
                                {isOnboardingData.vendor.completedBy?.name ||
                                  isOnboardingData.vendor.completedBy?.email ||
                                  "—"}
                              </strong>
                              {isOnboardingData.vendor.completedAt &&
                                formatOnboardingDate(isOnboardingData.vendor.completedAt) && (
                                  <> on {formatOnboardingDate(isOnboardingData.vendor.completedAt)}</>
                                )}
                            </span>
                          </div>
                          <dl className="vendor_preview_list">
                            {buildOnboardingFields(isOnboardingData.vendor).map((field) => (
                              <div key={field.label} className="vendor_preview_row">
                                <dt className="vendor_preview_label">{field.label}</dt>
                                <dd className="vendor_preview_value">
                                  {formatPreviewValue(
                                    field.value(isOnboardingData.vendor),
                                    field.label,
                                  )}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </>
                      ) : (
                        <p className="vendor_preview_not_done">Not completed for this organization.</p>
                      )}
                    </section>

                    {!isOnboardingData?.buyer && !isOnboardingData?.vendor && (
                      <p className="organizationPreviewEmpty">
                        No onboarding data for this organization yet.
                      </p>
                    )}
                  </div>
                )}

                {activeTab === TAB_ATTESTATION && (
                  <div className="org_preview_tab_content">
                    <div className="ai_assessments_section">
                      <div className="assessment_list_header_stack">
                        <p className="your_assessments_title">YOUR ATTESTATIONS</p>
                        <div className="assessments_ledger_toolbar attestation_ledger_toolbar">
                          <div
                            className="assessments_ledger_segmented assessments_ledger_segmented_inline"
                            role="group"
                            aria-label="Attestations scope"
                          >
                            <button
                              type="button"
                              className={
                                orgAttestationScope === "current"
                                  ? "assessments_ledger_segment active"
                                  : "assessments_ledger_segment"
                              }
                              onClick={() => setOrgAttestationScope("current")}
                            >
                              Current
                            </button>
                            <button
                              type="button"
                              className={
                                orgAttestationScope === "archived"
                                  ? "assessments_ledger_segment active"
                                  : "assessments_ledger_segment"
                              }
                              onClick={() => setOrgAttestationScope("archived")}
                            >
                              Archived
                            </button>
                          </div>
                          <div className="assessments_ledger_search">
                            <Search
                              size={18}
                              className="assessments_ledger_search_icon"
                              aria-hidden
                            />
                            <input
                              type="search"
                              placeholder="Search attestations…"
                              value={attestationSearch}
                              onChange={(e) => setAttestationSearch(e.target.value)}
                              className="assessments_ledger_search_input"
                              aria-label="Search attestations by name"
                            />
                          </div>
                        </div>
                      </div>
                      {attestationsLoading && (
                        <LoadingMessage message="Loading attestations…" />
                      )}
                      {attestationsError && (
                        <div className="vendor_attestation_error">{attestationsError}</div>
                      )}
                      {!attestationsLoading && !attestationsError && attestations.length === 0 && (
                        <p className="assessment_search_no_results">
                          No attestations for this organization.
                        </p>
                      )}
                      {!attestationsLoading && !attestationsError && attestations.length > 0 && (() => {
                        const withStatus = attestations.map((a) => {
                          const statusUpper = (a.status || "").toUpperCase();
                          const isCompleted = statusUpper === "COMPLETED";
                          const rawExpiry = a.expiry_at ?? a.expiryAt;
                          const expiryStr = rawExpiry != null ? (typeof rawExpiry === "string" ? rawExpiry : rawExpiry?.toISOString?.()) : "";
                          let isExpiredByDate = false;
                          if (expiryStr && String(expiryStr).trim() !== "") {
                            try {
                              const expiry = new Date(expiryStr);
                              if (!Number.isNaN(expiry.getTime())) {
                                const today = new Date();
                                expiry.setHours(0, 0, 0, 0);
                                today.setHours(0, 0, 0, 0);
                                isExpiredByDate = expiry.getTime() < today.getTime();
                              }
                            } catch {
                              isExpiredByDate = false;
                            }
                          }
                          const isExpired = statusUpper === "EXPIRED" || (isCompleted && isExpiredByDate);
                          return { a, isCompleted, isExpired, expiryStr };
                        });
                        const scoped = withStatus.filter(({ isExpired }) =>
                          orgAttestationScope === "archived" ? isExpired : !isExpired,
                        );
                        const q = (attestationSearch || "").trim().toLowerCase();
                        const filtered = q === ""
                          ? scoped
                          : scoped.filter(({ a }) =>
                              (a.product_name || "").toLowerCase().includes(q)
                            );
                        if (filtered.length === 0) {
                          return (
                            <p className="assessment_search_no_results">
                              {orgAttestationScope === "archived"
                                ? "No archived attestations match your search."
                                : "No attestations match your search."}
                            </p>
                          );
                        }
                        const start = (orgAttestationCardPage - 1) * orgAttestationCardPageSize;
                        const paginated = filtered.slice(start, start + orgAttestationCardPageSize);
                        return (
                          <>
                            <div className="attestation_list_rows assessment_list_rows">
                              <div className="general_rpr_cards_sec vendor_directory_grid">
                                {paginated.map(({ a, isCompleted, isExpired, expiryStr }) => {
                                const statusDisplay = isExpired ? "EXPIRED" : isCompleted ? "COMPLETED" : "Draft";
                                const statusHeaderClass = isExpired
                                  ? "assessment_card_status_expired"
                                  : isCompleted
                                    ? "assessment_card_status_completed"
                                    : "assessment_card_status_draft";
                                const title = a.product_name?.trim() || "Vendor Self-Attestation";
                                const completedBy = a.completedBy?.name?.trim() || a.completedBy?.email?.trim() || "—";
                                const isDraft = !isCompleted && !isExpired;
                                const trustScoreRaw =
                                  a.trust_score != null && Number.isFinite(Number(a.trust_score))
                                    ? Number(a.trust_score)
                                    : null;
                                const trustScore =
                                  trustScoreRaw != null ? formatScore2(trustScoreRaw) : null;
                                const profileReportId =
                                  typeof a.profile_report_id === "string" && a.profile_report_id.trim()
                                    ? a.profile_report_id.trim()
                                    : typeof a.id === "string"
                                      ? a.id
                                      : null;
                                return (
                                  <article
                                    key={a.id}
                                    className={`vendor_directory_card general_rpr_card${isExpired ? " general_rpr_card_archived" : isDraft ? " assessment_card--draft" : isCompleted ? " assessment_card--completed" : ""}`}
                                    data-accent="sales"
                                  >
                                    <div className="general_report_card_header">
                                      <div className="assessment_card_header_left">
                                        <p
                                          className={`vendor_directory_card_products general_rpr_card_report_type ${statusHeaderClass}`}
                                        >
                                          <span className="general_rpr_card_report_type_icon" aria-hidden>
                                            <FileText size={16} />
                                          </span>
                                          <span>
                                            <span>{statusDisplay}</span>
                                            {(isCompleted || isExpired) && expiryStr && (
                                              <span className="assessment_card_header_expiry">
                                                {" "}Expires on: {formatDateDDMMMYYYY(expiryStr)}
                                              </span>
                                            )}
                                          </span>
                                        </p>
                                      </div>
                                      <span className="general_rpr_card_download_wrap org_attestation_card_actions">
                                        <button
                                          type="button"
                                          className="general_rpr_card_download_btn assessment_card_header_action_btn"
                                          onClick={() => handleViewAttestation(a.id)}
                                          aria-label={`View attestation: ${title}`}
                                          title="View"
                                        >
                                          <Eye size={14} aria-hidden />
                                        </button>
                                        {isSystemAdmin && trustScore != null && (
                                          <button
                                            type="button"
                                            className="general_rpr_card_download_btn assessment_card_header_action_btn org_attestation_vts_info_btn"
                                            onClick={() => {
                                              setScoreTraceTarget({
                                                id: String(a.id),
                                                title,
                                                reportId: profileReportId,
                                                traceType: "vts",
                                                cardScore: trustScoreRaw,
                                                llmModelName: resolveStoredLlmModelId({
                                                  llmModelId:
                                                    (typeof a.llm_model_id === "string" &&
                                                    a.llm_model_id.trim()
                                                      ? a.llm_model_id.trim()
                                                      : null) ||
                                                    (typeof a.llmModelId === "string" &&
                                                    a.llmModelId.trim()
                                                      ? a.llmModelId.trim()
                                                      : null),
                                                  report: a.generated_profile_report ?? a.report,
                                                }),
                                              });
                                              setScoreTraceOpen(true);
                                            }}
                                            aria-label={`Vendor score explainability for ${title}`}
                                            title="Vendor Score Explainability"
                                          >
                                            <Info size={14} aria-hidden />
                                          </button>
                                        )}
                                      </span>
                                    </div>
                                    <div className="general_rpr_title">
                                      <div className="vendor_directory_card_header_text org_attestation_card_title_block">
                                        <span className="general_rpr_card_title_wrap">
                                          <h2 className="vendor_directory_card_name general_rpr_card_title_clamp">
                                            {title}
                                          </h2>
                                        </span>
                                        {isSystemAdmin && trustScore != null && (
                                          <p
                                            className="org_attestation_card_trust_score"
                                            aria-label={`Trust score ${trustScore} out of 100`}
                                          >
                                            <span className="org_attestation_card_trust_label">Trust score</span>
                                            <span className="org_attestation_card_trust_value">{trustScore}</span>
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                    <div className="general_rpr_card_footer">
                                      <div className="general_rpr_card_dates attestation_card_meta">
                                        <div className="attestation_card_meta_col">
                                          <span className="general_rpr_card_date_label_expiry attestation_card_meta_label">
                                            <User size={14} className="attestation_card_meta_icon" aria-hidden />
                                            {isDraft ? "Updated by" : "Completed by"}
                                          </span>
                                          <span className="general_rpr_card_date_value_expiry attestation_card_meta_value">
                                            {completedBy}
                                          </span>
                                        </div>
                                        <div className="attestation_card_meta_col attestation_card_meta_col--right">
                                          <span className="general_rpr_card_date_label_expiry attestation_card_meta_label">
                                            <Calendar size={14} className="attestation_card_meta_icon" aria-hidden />
                                            {isDraft ? "Drafted on" : "Created on"}
                                          </span>
                                          <span className="general_rpr_card_date_value_expiry attestation_card_meta_value">
                                            {formatAttestationDate(
                                              isDraft
                                                ? a.updated_at || a.created_at
                                                : a.created_at,
                                            )}
                                          </span>
                                        </div>
                                      </div>
                                    </div>
                                  </article>
                                );
                                })}
                              </div>
                            </div>
                            <ReportsPagination
                              totalItems={filtered.length}
                              currentPage={orgAttestationCardPage}
                              pageSize={orgAttestationCardPageSize}
                              onPageChange={setOrgAttestationCardPage}
                              onPageSizeChange={(size) => {
                                setOrgAttestationCardPageSize(size);
                                setOrgAttestationCardPage(1);
                              }}
                            />
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {activeTab === TAB_ASSESSMENTS && (
                  <div className="org_preview_tab_content">
                    <div className="ai_assessments_section">
                      <div className="assessment_list_header_stack">
                        <p className="your_assessments_title">YOUR ASSESSMENTS</p>
                        <div className="assessments_ledger_toolbar attestation_ledger_toolbar">
                          <div
                            className="assessments_ledger_segmented assessments_ledger_segmented_inline"
                            role="group"
                            aria-label="Assessments scope"
                          >
                            <button
                              type="button"
                              className={
                                orgAssessmentScope === "current"
                                  ? "assessments_ledger_segment active"
                                  : "assessments_ledger_segment"
                              }
                              onClick={() => setOrgAssessmentScope("current")}
                            >
                              Current
                            </button>
                            <button
                              type="button"
                              className={
                                orgAssessmentScope === "archived"
                                  ? "assessments_ledger_segment active"
                                  : "assessments_ledger_segment"
                              }
                              onClick={() => setOrgAssessmentScope("archived")}
                            >
                              Archived
                            </button>
                          </div>
                          <div className="assessments_ledger_search">
                            <Search size={18} className="assessments_ledger_search_icon" aria-hidden />
                            <input
                              type="search"
                              placeholder="Search assessments…"
                              value={orgAssessmentSearch}
                              onChange={(e) => setOrgAssessmentSearch(e.target.value)}
                              className="assessments_ledger_search_input"
                              aria-label="Search assessments by name"
                            />
                          </div>
                        </div>
                      </div>
                      {orgAssessmentsLoading && (
                        <LoadingMessage message="Loading assessments…" />
                      )}
                      {orgAssessmentsError && (
                        <div className="vendor_attestation_error">{orgAssessmentsError}</div>
                      )}
                      {!orgAssessmentsLoading && !orgAssessmentsError && orgAssessments.length === 0 && (
                        <p className="assessment_search_no_results">
                          No assessments for this organization.
                        </p>
                      )}
                      {!orgAssessmentsLoading && !orgAssessmentsError && orgAssessments.length > 0 && (() => {
                        const scoped = orgAssessments.filter((row) => {
                          const archived = getOrgAssessmentStatusLabel(row) === "Expired";
                          return orgAssessmentScope === "archived" ? archived : !archived;
                        });
                        const q = (orgAssessmentSearch || "").trim().toLowerCase();
                        const filtered = q === ""
                          ? scoped
                          : scoped.filter((row) =>
                              getOrgAssessmentDisplayTitle(row).toLowerCase().includes(q)
                            );
                        if (filtered.length === 0) {
                          return (
                            <p className="assessment_search_no_results">
                              {orgAssessmentScope === "archived"
                                ? "No archived assessments match your search."
                                : "No assessments match your search."}
                            </p>
                          );
                        }
                        const start = (orgAssessmentCardPage - 1) * orgAssessmentCardPageSize;
                        const paginated = filtered.slice(start, start + orgAssessmentCardPageSize);
                        return (
                          <>
                            <div className="attestation_list_rows assessment_list_rows">
                              <div className="general_rpr_cards_sec vendor_directory_grid">
                                {paginated.map((row) => {
                                  const statusLabel = getOrgAssessmentStatusLabel(row);
                                  const isDraft = (row.status ?? "").toLowerCase() === "draft";
                                  const archived = statusLabel === "Expired";
                                  const statusDisplay = (statusLabel || "").toUpperCase();
                                  const statusHeaderClass =
                                    statusLabel === "Completed"
                                      ? "assessment_card_status_completed"
                                      : statusLabel === "Expired"
                                        ? "assessment_card_status_expired"
                                        : "assessment_card_status_draft";
                                  const title = getOrgAssessmentDisplayTitle(row);
                                  const completedBy = getOrgAssessmentCompletedBy(row) || "—";
                                  const assessmentType = (row.type ?? "").toLowerCase();
                                  const isVendorCots = assessmentType === "cots_vendor";
                                  const isBuyerCots = assessmentType === "cots_buyer";
                                  const rawScore =
                                    row.reportRiskScore != null &&
                                    Number.isFinite(Number(row.reportRiskScore))
                                      ? Number(row.reportRiskScore)
                                      : null;
                                  const reportScoreExact =
                                    rawScore == null
                                      ? null
                                      : Math.max(
                                          0,
                                          Math.min(
                                            100,
                                            // Type 2 stores sales risk; readiness = 100 − SRS.
                                            // Type 3 stores IRS as implementation readiness; show as stored.
                                            isBuyerCots ? rawScore : 100 - rawScore,
                                          ),
                                        );
                                  const reportScore =
                                    reportScoreExact == null ? null : formatScore2(reportScoreExact);
                                  const scoreRationale =
                                    typeof row.scoreRationale === "string" &&
                                    row.scoreRationale.trim()
                                      ? row.scoreRationale.trim()
                                      : null;
                                  const scoreLabel = isVendorCots
                                    ? "Readiness"
                                    : isBuyerCots
                                      ? "Implementation Readiness"
                                      : "Score";
                                  const showAdminScoreBlock =
                                    isSystemAdmin &&
                                    (isVendorCots || isBuyerCots) &&
                                    statusLabel === "Completed";
                                  const showAdminRationaleBtn =
                                    showAdminScoreBlock &&
                                    (scoreRationale || reportScore != null);
                                  return (
                                    <article
                                      key={row.assessmentId}
                                      className={`vendor_directory_card general_rpr_card${archived ? " general_rpr_card_archived" : isDraft ? " assessment_card--draft" : statusLabel === "Completed" ? " assessment_card--completed" : ""}`}
                                      data-accent="risk"
                                    >
                                      <div className="general_report_card_header">
                                        <div className="assessment_card_header_left">
                                          <p
                                            className={`vendor_directory_card_products general_rpr_card_report_type ${statusHeaderClass}`}
                                          >
                                            <span className="general_rpr_card_report_type_icon" aria-hidden>
                                              <FileText size={16} />
                                            </span>
                                            <span>
                                              <span>{statusDisplay}</span>
                                              {(statusLabel === "Completed" || statusLabel === "Expired") &&
                                                row.expiryAt && (
                                                <span className="assessment_card_header_expiry">
                                                  {" "}Expires on: {formatDateDDMMMYYYY(row.expiryAt)}
                                                </span>
                                              )}
                                            </span>
                                          </p>
                                        </div>
                                        <span className="general_rpr_card_download_wrap org_attestation_card_actions">
                                          <button
                                            type="button"
                                            className="general_rpr_card_download_btn assessment_card_header_action_btn"
                                            onClick={() =>
                                              navigate(
                                                `/organizations/assessment/${row.assessmentId}?type=${encodeURIComponent(row.type ?? "")}`,
                                                {
                                                  state: {
                                                    organizationName: previewOrg?.organizationName ?? "Organization",
                                                    organizationId: orgIdForFetch,
                                                    type: row.type,
                                                    row,
                                                  },
                                                }
                                              )
                                            }
                                            aria-label={`View assessment: ${title}`}
                                            title="View"
                                          >
                                            <Eye size={14} aria-hidden />
                                          </button>
                                          {showAdminRationaleBtn ? (
                                            <button
                                              type="button"
                                              className="general_rpr_card_download_btn assessment_card_header_action_btn org_attestation_vts_info_btn"
                                              onClick={() => {
                                                setScoreTraceTarget({
                                                  id: String(row.assessmentId ?? ""),
                                                  title,
                                                  traceType: isBuyerCots ? "irs" : "scs",
                                                  cardScore: reportScoreExact,
                                                  llmModelName: resolveStoredLlmModelId({
                                                    llmModelId:
                                                      (typeof row.llmModelId === "string" &&
                                                      row.llmModelId.trim()
                                                        ? row.llmModelId.trim()
                                                        : null) ||
                                                      (typeof row.llm_model_id === "string" &&
                                                      row.llm_model_id.trim()
                                                        ? row.llm_model_id.trim()
                                                        : null),
                                                    report: row.report ?? row.vendor_risk_assessment_report,
                                                  }),
                                                });
                                                setScoreTraceOpen(true);
                                              }}
                                              aria-label={`${isBuyerCots ? "Implementation readiness" : "Readiness"} explainability for ${title}`}
                                              title={
                                                isBuyerCots
                                                  ? "Implementation Readiness Explainability"
                                                  : "Readiness Explainability"
                                              }
                                            >
                                              <Info size={14} aria-hidden />
                                            </button>
                                          ) : null}
                                        </span>
                                      </div>
                                      <div className="general_rpr_title">
                                        <div className="vendor_directory_card_header_text org_attestation_card_title_block">
                                          <span className="general_rpr_card_title_wrap">
                                            <h2 className="vendor_directory_card_name general_rpr_card_title_clamp">
                                              {title}
                                            </h2>
                                          </span>
                                          {showAdminScoreBlock && reportScore != null ? (
                                            <p
                                              className="org_attestation_card_trust_score"
                                              aria-label={`${scoreLabel} ${reportScore} out of 100`}
                                            >
                                              <span className="org_attestation_card_trust_label">
                                                {scoreLabel}
                                              </span>
                                              <span className="org_attestation_card_trust_value">
                                                {reportScore}
                                              </span>
                                            </p>
                                          ) : null}
                                        </div>
                                      </div>
                                      <div className="general_rpr_card_footer">
                                        <div className="general_rpr_card_dates attestation_card_meta">
                                          <div className="attestation_card_meta_col">
                                            <span className="general_rpr_card_date_label_expiry attestation_card_meta_label">
                                              <User size={14} className="attestation_card_meta_icon" aria-hidden />
                                              {isDraft ? "Updated by" : "Completed by"}
                                            </span>
                                            <span className="general_rpr_card_date_value_expiry attestation_card_meta_value">
                                              {completedBy}
                                            </span>
                                          </div>
                                          <div className="attestation_card_meta_col attestation_card_meta_col--right">
                                            <span className="general_rpr_card_date_label_expiry attestation_card_meta_label">
                                              <Calendar size={14} className="attestation_card_meta_icon" aria-hidden />
                                              {isDraft ? "Drafted on" : "Created on"}
                                            </span>
                                            <span className="general_rpr_card_date_value_expiry attestation_card_meta_value">
                                              {formatDateDDMMMYYYY(
                                                isDraft
                                                  ? row.updatedAt ?? row.createdAt
                                                  : row.createdAt,
                                              )}
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    </article>
                                  );
                                })}
                              </div>
                            </div>
                            <ReportsPagination
                              totalItems={filtered.length}
                              currentPage={orgAssessmentCardPage}
                              pageSize={orgAssessmentCardPageSize}
                              onPageChange={setOrgAssessmentCardPage}
                              onPageSizeChange={(size) => {
                                setOrgAssessmentCardPageSize(size);
                                setOrgAssessmentCardPage(1);
                              }}
                            />
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}

                {activeTab === TAB_USERS && orgIdForFetch && (
                  <div className="org_preview_tab_content">
                    <OrgUsersTable
                      organizationId={orgIdForFetch}
                      organizationName={previewOrg?.organizationName}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {previewOpen && (
            <div
              className="vendor_attestation_preview_modal_overlay"
              onClick={() => setPreviewOpen(false)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === "Escape" && setPreviewOpen(false)}
              aria-label="Close modal"
            >
              <div
                className="vendor_attestation_preview_modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="vendor_attestation_preview_modal_header">
                  <h2>Attestation Preview</h2>
                  <button
                    type="button"
                    className="modal_close_btn"
                    onClick={() => setPreviewOpen(false)}
                    aria-label="Close"
                  >
                    <CircleX size={20} />
                  </button>
                </div>
                <div className="vendor_attestation_preview_modal_body">
                  {previewLoading && (
                    <LoadingMessage message="Loading preview…" compact />
                  )}
                  {!previewLoading && previewFormState && (
                    <StepVendorSelfAttestationPrev
                      formState={previewFormState}
                      attestationId={previewAttestationId}
                      onOpenDocument={handleOpenDocument}
                      complianceDocumentExpiries={previewComplianceExpiries}
                      vendorNameFallback={previewOrg?.organizationName ?? null}
                    />
                  )}
                </div>
                
              </div>
            </div>
          )}

          {isSystemAdmin && (
            <ScoreTracePanel
              isOpen={scoreTraceOpen}
              onClose={() => {
                setScoreTraceOpen(false);
                setScoreTraceTarget(null);
              }}
              assessmentId={scoreTraceTarget?.id ?? ""}
              assessmentTitle={scoreTraceTarget?.title ?? ""}
              traceType={scoreTraceTarget?.traceType ?? "vts"}
              reportId={
                scoreTraceTarget?.reportId ||
                (scoreTraceTarget?.traceType === "vts" ? scoreTraceTarget?.id : undefined) ||
                undefined
              }
              llmModelName={scoreTraceTarget?.llmModelName}
              cardScore={scoreTraceTarget?.cardScore ?? null}
            />
          )}
          
        </div>
        
      )}

    </>
  );
};

export default Organizations;
