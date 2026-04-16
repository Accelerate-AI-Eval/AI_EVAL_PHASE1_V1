/**
 * Full-page assessment details when viewing from Organizations (view action → Assessments tab → View).
 * Shows breadcrumbs, assessment content, and report cards for this assessment.
 */
import React, { useState, useEffect } from "react";
import { useParams, useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { FileText, ChevronRight } from "lucide-react";
import Breadcrumbs from "../../UI/Breadcrumbs";
import AssessmentPreviewModalContent from "../Assessments/AssessmentPreviewModalContent";
import LoadingMessage from "../../UI/LoadingMessage";
import { formatDateDDMMMYYYY } from "../../../utils/formatDate.js";
import CompleteReportsCards from "../Reports/CompleteReportsCards";
import type { CustomerRiskReportItem } from "../Reports/Reports";
import "../UserManagement/user_management.css";
import "../Assessments/assessments.css";
import "../VendorAttestationDetails/vendor_attestation_details.css";
import "../VendorDirectory/VendorDirectory.css";
import "../Reports/general_reports.css";
import "../Reports/reports.css";
import {
  OrgPortalFrameworkGapSectionVendor,
  OrgPortalFrameworkGapSectionBuyer,
  type VendorOrganizationalPortal,
  type BuyerOrganizationalPortal,
} from "./OrgPortalFrameworkGapSection";

const BASE_URL = import.meta.env.VITE_BASE_URL || "";

interface CompleteReportItem {
  id: string;
  assessmentId: string;
  title?: string;
  createdAt?: string;
  expiryAt?: string | null;
  attestationExpiryAt?: string | null;
  /** Full stored report JSON (includes generatedAnalysis.overallRiskScore for grade/readiness). */
  report?: Record<string, unknown>;
}

interface GeneralReportItem {
  id: string;
  assessmentId: string;
  reportType: string;
  generatedAt?: string;
  assessmentLabel?: string;
  expiryAt?: string | null;
  attestationExpiryAt?: string | null;
}

function getReportCardTitle(fullTitle: string): string {
  if (!fullTitle || typeof fullTitle !== "string") return fullTitle || "—";
  return fullTitle.replace(/^Analysis Report:\s*/i, "").trim() || fullTitle;
}

function isCompleteReportArchived(r: CompleteReportItem): boolean {
  const expiryAt = r.expiryAt ?? r.attestationExpiryAt;
  if (expiryAt == null || String(expiryAt).trim() === "") return false;
  try {
    const d = new Date(expiryAt);
    if (Number.isNaN(d.getTime())) return false;
    return d.setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
  } catch {
    return false;
  }
}

function isGeneralReportArchived(r: GeneralReportItem): boolean {
  const expiryAt = r.expiryAt ?? r.attestationExpiryAt;
  if (expiryAt == null || String(expiryAt).trim() === "") return false;
  try {
    const d = new Date(expiryAt);
    if (Number.isNaN(d.getTime())) return false;
    return d.setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
  } catch {
    return false;
  }
}

function getCompleteReportExpiry(r: CompleteReportItem): string {
  const raw = r.expiryAt ?? r.attestationExpiryAt;
  if (raw == null || String(raw).trim() === "") return "—";
  return formatDateDDMMMYYYY(raw);
}

function getGeneralReportExpiry(r: GeneralReportItem): string {
  const raw = r.expiryAt ?? r.attestationExpiryAt;
  if (raw == null || String(raw).trim() === "") return "—";
  return formatDateDDMMMYYYY(raw);
}

function getReportTypeLabel(reportType: string): string {
  const labels: Record<string, string> = {
    executive_stakeholder_brief: "Executive Stakeholder Brief",
    implementation_roadmap: "Implementation Roadmap Proposal",
    sales_brief: "Sales Brief",
  };
  return labels[reportType] ?? reportType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function OrganizationAssessmentView() {
  const { assessmentId } = useParams<{ assessmentId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as {
    organizationName?: string;
    organizationId?: string;
    type?: string;
    row?: Record<string, unknown>;
  } | null;

  const typeParam = searchParams.get("type") ?? state?.type ?? "";
  const type = (typeParam || "").toLowerCase().trim();

  const [previewRow, setPreviewRow] = useState<Record<string, unknown> | null>(state?.row ?? null);
  const [vendorDetail, setVendorDetail] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(!state?.row);
  const [error, setError] = useState<string | null>(null);
  const [organizationName, setOrganizationName] = useState(state?.organizationName ?? "Organization");
  const [organizationId, setOrganizationId] = useState<string | null>(state?.organizationId ?? null);
  const [completeReports, setCompleteReports] = useState<CompleteReportItem[]>([]);
  const [generalReports, setGeneralReports] = useState<GeneralReportItem[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);

  useEffect(() => {
    if (!assessmentId || !type) {
      setLoading(false);
      if (!assessmentId) setError("Assessment ID missing.");
      else if (!type) setError("Assessment type missing.");
      return;
    }

    const token = sessionStorage.getItem("bearerToken");
    if (!token) {
      setLoading(false);
      setError("Please log in to view this assessment.");
      return;
    }

    const isVendor = type === "cots_vendor";

    if (state?.row) {
      setPreviewRow(state.row);
      setOrganizationName(state.organizationName ?? "Organization");
      setOrganizationId(state.organizationId ?? null);
      if (isVendor) {
        setVendorDetail(null);
        setLoading(true);
        fetch(`${BASE_URL.replace(/\/$/, "")}/vendorCotsAssessment/${encodeURIComponent(assessmentId)}`, {
          method: "GET",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        })
          .then((res) => res.json())
          .then((result) => {
            if (result?.success && result?.data) setVendorDetail(result.data);
          })
          .catch(() => {})
          .finally(() => setLoading(false));
      } else {
        setLoading(true);
        fetch(`${BASE_URL.replace(/\/$/, "")}/buyerCotsAssessment/${encodeURIComponent(assessmentId)}`, {
          method: "GET",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        })
          .then((res) => res.json())
          .then((result) => {
            if (result?.success && result?.data) {
              const data = result.data as Record<string, unknown>;
              setPreviewRow({
                ...(state.row as Record<string, unknown>),
                ...data,
              });
              if (data.organizationName != null) {
                setOrganizationName(String(data.organizationName));
              }
            }
          })
          .catch(() => {})
          .finally(() => setLoading(false));
      }
      return;
    }

    setLoading(true);
    setError(null);
    const url = isVendor
      ? `${BASE_URL.replace(/\/$/, "")}/vendorCotsAssessment/${encodeURIComponent(assessmentId)}`
      : `${BASE_URL.replace(/\/$/, "")}/buyerCotsAssessment/${encodeURIComponent(assessmentId)}`;

    fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((result) => {
        if (!result?.success || !result?.data) {
          setError("Assessment not found.");
          setPreviewRow(null);
          return;
        }
        const data = result.data as Record<string, unknown>;
        const row: Record<string, unknown> = {
          assessmentId: data.assessmentId,
          type: data.type ?? (isVendor ? "cots_vendor" : "cots_buyer"),
          status: data.status,
          organizationId: data.organizationId,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
          expiryAt: data.expiryAt,
          ...data,
        };
        setPreviewRow(row);
        if (data.organizationId != null) {
          setOrganizationId(String(data.organizationId));
        }
        if (isVendor) {
          setVendorDetail(data);
        }
        if (!isVendor && data.organizationName) {
          setOrganizationName(String(data.organizationName));
        }
      })
      .catch(() => {
        setError("Failed to load assessment.");
        setPreviewRow(null);
      })
      .finally(() => setLoading(false));
  }, [assessmentId, type, state?.row, state?.organizationName]);

  // Fetch report cards for this assessment (Complete + General reports)
  useEffect(() => {
    if (!assessmentId || !(previewRow && (previewRow.type as string)?.toLowerCase() === "cots_vendor")) {
      setCompleteReports([]);
      setGeneralReports([]);
      return;
    }
    const token = sessionStorage.getItem("bearerToken");
    if (!token) return;

    setReportsLoading(true);
    const base = BASE_URL.replace(/\/$/, "");
    Promise.all([
      fetch(`${base}/customerRiskReports?assessmentId=${encodeURIComponent(assessmentId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => res.json()),
      fetch(`${base}/generalReports?assessmentId=${encodeURIComponent(assessmentId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then((res) => res.json()),
    ])
      .then(([custRes, genRes]) => {
        if (custRes?.success && Array.isArray(custRes?.data?.reports)) {
          setCompleteReports(custRes.data.reports);
        } else {
          setCompleteReports([]);
        }
        if (genRes?.success && Array.isArray(genRes?.data?.reports)) {
          setGeneralReports(genRes.data.reports);
        } else {
          setGeneralReports([]);
        }
      })
      .catch(() => {
        setCompleteReports([]);
        setGeneralReports([]);
      })
      .finally(() => setReportsLoading(false));
  }, [assessmentId, previewRow?.type]);

  const handleOrgClick = () => {
    if (organizationId) {
      navigate("/organizations", {
        state: {
          openOrganization: {
            id: organizationId,
            organizationId,
            organizationName,
          },
        },
      });
    }
  };

  const breadcrumbItems = [
    { label: "Organizations", path: "/organizations" },
    organizationId
      ? { label: organizationName, onClick: handleOrgClick }
      : organizationName,
    "Assessment details",
  ];

  if (error) {
    return (
      <div className="sec_user_page org_settings_page" style={{ padding: "1.5rem" }}>
        <Breadcrumbs items={breadcrumbItems} />
        <p role="alert" style={{ marginTop: "1rem", color: "var(--color-error, #dc2626)" }}>
          {error}
        </p>
        <button
          type="button"
          className="product_profile_btn_view_attestation"
          onClick={() => navigate("/organizations")}
          style={{ marginTop: "1rem" }}
        >
          Back to Organizations
        </button>
      </div>
    );
  }

  if (loading && !previewRow) {
    return (
      <div className="sec_user_page org_settings_page" style={{ padding: "1.5rem" }}>
        <Breadcrumbs items={breadcrumbItems} />
        <LoadingMessage message="Loading assessment…" />
      </div>
    );
  }

  if (!previewRow) {
    return null;
  }

  return (
    <div className="sec_user_page org_settings_page product_profile_page" style={{ padding: "1.5rem" }}>
      <Breadcrumbs items={breadcrumbItems} />
      <div className="vendor_attestation_preview_modal_body" style={{ marginTop: "1.5rem", maxWidth: "900px" }}>
        <AssessmentPreviewModalContent
          previewRow={previewRow}
          vendorDetail={vendorDetail}
          vendorLoading={loading && (previewRow.type as string)?.toLowerCase() === "cots_vendor"}
        />
      </div>

      {(previewRow.type as string)?.toLowerCase() === "cots_vendor" &&
        vendorDetail?.organizationalPortal != null &&
        typeof vendorDetail.organizationalPortal === "object" && (
          <OrgPortalFrameworkGapSectionVendor
            portal={vendorDetail.organizationalPortal as VendorOrganizationalPortal}
            frameworkMappingAssessmentLabel={
              typeof previewRow?.title === "string" && previewRow.title.trim()
                ? previewRow.title.trim()
                : typeof previewRow?.name === "string" && previewRow.name.trim()
                  ? previewRow.name.trim()
                  : undefined
            }
          />
        )}

      {(previewRow.type as string)?.toLowerCase() === "cots_buyer" &&
        previewRow.organizationalPortal != null &&
        typeof previewRow.organizationalPortal === "object" && (
          <OrgPortalFrameworkGapSectionBuyer
            portal={previewRow.organizationalPortal as BuyerOrganizationalPortal}
          />
        )}

      {(previewRow.type as string)?.toLowerCase() === "cots_vendor" && (
        <section className="assessment_details_reports_section" style={{ marginTop: "2rem", maxWidth: "900px" }}>
          <h2 className="assessment_details_reports_heading" style={{ fontSize: "1.125rem", fontWeight: 600, marginBottom: "1rem" }}>
            Reports
          </h2>
          {reportsLoading ? (
            <LoadingMessage message="Loading reports…" />
          ) : completeReports.length === 0 && generalReports.length === 0 ? (
            <p className="assessment_details_no_reports" style={{ color: "#6b7280", fontSize: "0.9375rem" }}>
              No reports have been generated for this assessment yet.
            </p>
          ) : (
            <div className="general_rpr_cards_sec vendor_directory_grid complete_rpr_cards_grid">
              <CompleteReportsCards
                reports={completeReports as CustomerRiskReportItem[]}
                getTitle={(r) => getReportCardTitle(r.title ?? "")}
                isArchived={isCompleteReportArchived}
                getExpiryDate={getCompleteReportExpiry}
                onViewReport={(report) =>
                  navigate(`/reports/${report.id}`, {
                    state: { reportTitle: getReportCardTitle(report.title ?? "") },
                  })
                }
                singleCard
              />
              {generalReports.map((report) => {
                const archived = isGeneralReportArchived(report);
                return (
                  <article
                    key={`general-${report.id}`}
                    className={`vendor_directory_card general_rpr_card${archived ? " general_rpr_card_archived" : ""}`}
                  >
                    <div className="general_report_card_header">
                      <p className="vendor_directory_card_products general_rpr_card_report_type">
                        <span className="general_rpr_card_report_type_icon" aria-hidden>
                          <FileText size={16} />
                        </span>
                        {getReportTypeLabel(report.reportType)}
                      </p>
                    </div>
                    <div className="general_rpr_title">
                      <div className="vendor_directory_card_header_text">
                        <h2 className="vendor_directory_card_name general_rpr_card_title_clamp">
                          {report.assessmentLabel ?? `Report ${report.id}`}
                        </h2>
                      </div>
                    </div>
                    <div className="general_rpr_card_footer">
                      <div className="general_rpr_card_dates">
                        <div className="general_rpr_card_date_row">
                          {archived ? (
                            <span className="general_rpr_card_status general_rpr_card_status_archived">Archived</span>
                          ) : (
                            <>
                              <span className="general_rpr_card_date_label_expiry">Expires on:</span>
                              <span className="general_rpr_card_date_value_expiry">{getGeneralReportExpiry(report)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="view_rpr_btn vendor_directory_card_action_btn"
                        onClick={() => navigate(`/reports/general/${report.id}`)}
                        aria-label={`View ${getReportTypeLabel(report.reportType)}`}
                      >
                        View Report
                        <ChevronRight size={16} aria-hidden />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
