import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Bot,
  BotIcon,
  ChevronRight,
  ClipboardCheck,
  Download,
  Eye,
  FileCheck,
  FileText,
  Info,
  Shield,
} from "lucide-react";
import LoadingMessage from "../../UI/LoadingMessage";
import DashboardFeatureCard from "../../UI/DashboardFeatureCard";
import DashboardStatCard from "../../UI/DashboardStatCard";
import type {
  AttestationItem,
  CertificateItem,
  VendorAssessmentItem,
} from "./types";
import { BASE_URL, formatDisplayDate } from "./utils";
import { formatDateDDMMMYYYY } from "../../../utils/formatDate";
import {
  gradeFromOverallRiskScore,
  normalizeDisplayLetterGrade,
  type CompleteReportLetterGrade,
} from "../../../utils/completeReportGrade";
import { formatScore2 } from "../../../utils/scoreFormat";
import "./dashboard.css";
import "../UserManagement/user_management.css";
import ClickTooltip from "../../UI/ClickTooltip";
import DashboardTypewriterGreeting from "../../UI/DashboardTypewriterGreeting";

/** Compliance carousel: how many certificate cards show beside each attestation. */
const COMPLIANCE_CARDS_PER_VIEW = 3;

type ComplianceDocRow = {
  key: string;
  attestationId: string;
  fileName: string;
  title: string;
  /** Compliance certification category (e.g. SOC 2 Type 2), not file format */
  complianceTypeLabel: string;
  /** Parsed expiry for footer (Complete Reports style); null → "Expiry not specified" */
  expiryDateDisplay: string | null;
  productLabel: string;
};

function complianceTypeDisplay(
  complianceType: string | null | undefined,
): string {
  const t = (complianceType ?? "").trim();
  return t || "—";
}

function buildComplianceRowsForAttestation(
  att: AttestationItem,
): ComplianceDocRow[] {
  const rows: ComplianceDocRow[] = [];
  const product = (att.productName ?? "").trim() || "Vendor Self-Attestation";
  const certs = att.certificates ?? [];
  certs.forEach((c, idx) => {
    const name = (c.name ?? "").trim();
    if (!name) return;
    const exp = c.expiryDate;
    const hasExpiry =
      exp != null &&
      String(exp).trim() !== "" &&
      formatDisplayDate(exp) !== "—";
    const expiryDateDisplay = hasExpiry
      ? formatDateDDMMMYYYY(String(exp))
      : null;
    rows.push({
      key: `${att.id}-${name}-${idx}`,
      attestationId: att.id,
      fileName: name,
      title: name,
      complianceTypeLabel: complianceTypeDisplay(
        c.certificateType ?? c.complianceType,
      ),
      expiryDateDisplay,
      productLabel: product,
    });
  });
  return rows;
}

function normalizeCertificatesFromApi(
  rows: Array<{
    name: string;
    expiryDate: string | null;
    certificateType?: string | null;
    complianceType?: string | null;
    documentType?: string | null;
  }>,
): CertificateItem[] {
  return rows.map((row) => {
    const certificateType =
      row.certificateType ?? row.complianceType ?? row.documentType ?? null;
    return {
      name: row.name,
      expiryDate: row.expiryDate,
      certificateType,
      complianceType: certificateType,
    };
  });
}

function findCertificateTypesForAssessment(
  assessment: VendorAssessmentItem,
  attestations: AttestationItem[],
): string[] {
  const vid = (assessment.vendorAttestationId ?? "").toString().trim();
  const assessmentProduct = (assessment.productName ?? "").toString().trim().toLowerCase();
  const matches: AttestationItem[] = [];

  if (vid) {
    for (const att of attestations) {
      const idMatch = String(att.id) === vid;
      const alt =
        att.vendor_self_attestation_id != null &&
        String(att.vendor_self_attestation_id).trim() === vid;
      if (idMatch || alt) matches.push(att);
    }
  }

  if (matches.length === 0 && assessmentProduct) {
    for (const att of attestations) {
      const product = (att.productName ?? "").toString().trim().toLowerCase();
      if (product && product === assessmentProduct) matches.push(att);
    }
  }

  const types = new Set<string>();
  for (const att of matches) {
    for (const cert of att.certificates ?? []) {
      const type = (
        cert.certificateType ??
        cert.complianceType ??
        cert.name ??
        ""
      )
        .toString()
        .trim();
      if (type) types.add(type);
    }
  }
  return [...types];
}

type AssessmentReportMeta = {
  reportId: string;
  vendorGrade: CompleteReportLetterGrade | null;
};

function extractOverallRiskScoreFromCompleteReport(
  report: unknown,
): number | null {
  if (!report || typeof report !== "object" || Array.isArray(report))
    return null;
  const r = report as Record<string, unknown>;
  const fromGenerated =
    r.generatedAnalysis &&
    typeof r.generatedAnalysis === "object" &&
    !Array.isArray(r.generatedAnalysis)
      ? (r.generatedAnalysis as Record<string, unknown>).overallRiskScore
      : undefined;
  const raw = fromGenerated ?? r.overallRiskScore;
  if (raw == null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const VendorOverview = () => {
  document.title = "AI-Q | Dashboard"
  const [attestations, setAttestations] = useState<AttestationItem[]>([]);
  const [assessments, setAssessments] = useState<VendorAssessmentItem[]>([]);
  const [reportsByAssessmentId, setReportsByAssessmentId] = useState<
    Record<string, AssessmentReportMeta>
  >({});
  const [loading, setLoading] = useState(true);
  const [assessmentsLoading, setAssessmentsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const LOADER_MIN_MS = 2000;

  const fetchAttestations = useCallback(async () => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token) {
      setError("Please log in to view attestations.");
      setLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    const loadStart = Date.now();
    const finishLoading = () => {
      const remaining = Math.max(0, LOADER_MIN_MS - (Date.now() - loadStart));
      setTimeout(() => setLoading(false), remaining);
    };
    try {
      const response = await fetch(`${BASE_URL}/vendorSelfAttestation`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const text = await response.text();
      type AttestationRow = {
        id?: string;
        vendor_self_attestation_id?: string | null;
        status?: string;
        created_at?: string;
        updated_at?: string;
        expiry_at?: string | null;
        product_name?: string | null;
        certificates?: Array<{
          name: string;
          expiryDate: string | null;
          certificateType?: string | null;
          complianceType?: string | null;
          documentType?: string | null;
        }>;
        generated_profile_report?: {
          trustScore?: {
            overallScore?: number;
            summary?: string;
            label?: string;
          };
          sections?: unknown[];
        };
      };
      let result: {
        success?: boolean;
        attestation?: AttestationRow;
        attestations?: AttestationRow[];
        message?: string;
      } = {};
      try {
        result = text ? JSON.parse(text) : {};
      } catch {
        setError("Invalid response from server");
        finishLoading();
        return;
      }
      if (!response.ok) {
        setError((result.message as string) || "Failed to load attestations");
        finishLoading();
        return;
      }
      const list: AttestationItem[] = [];
      if (result.success && Array.isArray(result.attestations)) {
        result.attestations.forEach((a) => {
          if (a?.id) {
            // console.log("Attestation Data:",result.attestations)
            list.push({
              id: String(a.id),
              vendor_self_attestation_id:
                a.vendor_self_attestation_id != null
                  ? String(a.vendor_self_attestation_id)
                  : undefined,
              status: (a.status ?? "").toUpperCase(),
              createdAt: a.created_at,
              updatedAt: a.updated_at,
              expiryDate: a.expiry_at ?? null,
              productName: a.product_name ?? undefined,
              certificates: Array.isArray(a.certificates)
                ? normalizeCertificatesFromApi(a.certificates)
                : undefined,
              generated_profile_report: a.generated_profile_report,
            });
          }
        });
      } else if (result.success && result.attestation?.id) {
        const a = result.attestation;
        list.push({
          id: String(a.id),
          vendor_self_attestation_id:
            a.vendor_self_attestation_id != null
              ? String(a.vendor_self_attestation_id)
              : undefined,
          status: (a.status ?? "").toUpperCase(),
          createdAt: a.created_at,
          updatedAt: a.updated_at,
          expiryDate: a.expiry_at ?? null,
          productName: a.product_name ?? undefined,
          certificates: Array.isArray(a.certificates)
            ? normalizeCertificatesFromApi(a.certificates)
            : undefined,
          generated_profile_report: a.generated_profile_report,
        });
      }
      setAttestations(list);
    } catch {
      setError("Network or server error");
    } finally {
      finishLoading();
    }
  }, []);

  const fetchAssessmentsAndReports = useCallback(async () => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token) return;
    setAssessmentsLoading(true);
    const loadStart = Date.now();
    const finishLoading = () => {
      const remaining = Math.max(0, LOADER_MIN_MS - (Date.now() - loadStart));
      setTimeout(() => setAssessmentsLoading(false), remaining);
    };
    try {
      const [assessmentsRes, reportsRes] = await Promise.all([
        fetch(`${BASE_URL}/assessments`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${BASE_URL}/customerRiskReports`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);
      const assessmentsData = await assessmentsRes.json().catch(() => ({}));
      const reportsData = await reportsRes.json().catch(() => ({}));
      const list: VendorAssessmentItem[] = Array.isArray(
        assessmentsData?.data?.assessments,
      )
        ? assessmentsData.data.assessments
        : [];
      setAssessments(list);
      const byAssessmentId: Record<string, AssessmentReportMeta> = {};
      if (reportsData?.success && Array.isArray(reportsData?.data?.reports)) {
        reportsData.data.reports.forEach(
          (r: {
            id: string;
            assessmentId?: string;
            report?: unknown;
          }): void => {
            const aid = r.assessmentId != null ? String(r.assessmentId) : "";
            if (!aid || !r.id) return;
            // API returns newest first; keep first per assessment as the source of truth.
            if (byAssessmentId[aid]) return;
            const riskScore = extractOverallRiskScoreFromCompleteReport(
              r.report,
            );
            byAssessmentId[aid] = {
              reportId: String(r.id),
              vendorGrade:
                riskScore != null ? gradeFromOverallRiskScore(riskScore) : null,
            };
          },
        );
      }
      setReportsByAssessmentId(byAssessmentId);
    } catch {
      setAssessments([]);
      setReportsByAssessmentId({});
    } finally {
      finishLoading();
    }
  }, []);

  useEffect(() => {
    fetchAttestations();
  }, [fetchAttestations]);

  useEffect(() => {
    fetchAssessmentsAndReports();
  }, [fetchAssessmentsAndReports]);

  const isAttestationExpired = (item: AttestationItem): boolean => {
    if ((item.status ?? "").toUpperCase() !== "COMPLETED") return false;
    const exp = item.expiryDate;
    if (exp == null || String(exp).trim() === "") return false;
    const expiry = new Date(exp);
    if (Number.isNaN(expiry.getTime())) return false;
    const today = new Date();
    expiry.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return expiry.getTime() < today.getTime();
  };

  const completedAttestations = useMemo(
    () =>
      attestations.filter(
        (a) =>
          (a.status ?? "").toUpperCase() === "COMPLETED" &&
          !isAttestationExpired(a),
      ),
    [attestations],
  );

  const completedAttestationsSorted = useMemo(
    () =>
      [...completedAttestations].sort((a, b) => {
        const aDate = a.createdAt ?? "";
        const bDate = b.createdAt ?? "";
        return new Date(bDate).getTime() - new Date(aDate).getTime();
      }),
    [completedAttestations],
  );

  const currentAttestationCards = useMemo(
    () => completedAttestationsSorted.slice(0, 3),
    [completedAttestationsSorted],
  );

  const complianceDocsByAttestationId = useMemo(() => {
    const m: Record<string, ComplianceDocRow[]> = {};
    for (const att of currentAttestationCards) {
      m[att.id] = buildComplianceRowsForAttestation(att);
    }
    return m;
  }, [currentAttestationCards]);

  const vendorCotsAssessments = useMemo(() => {
    const list = assessments.filter((a) => a.type === "cots_vendor");
    return [...list].sort((a, b) => {
      const da = new Date(a.createdAt ?? 0).getTime();
      const db = new Date(b.createdAt ?? 0).getTime();
      return db - da;
    });
  }, [assessments]);

  const recentAssessmentsTable = vendorCotsAssessments.slice(0, 3);

  const openComplianceDocumentInNewTab = useCallback(
    async (attestationId: string, fileName: string) => {
      const token = sessionStorage.getItem("bearerToken");
      if (!token || !attestationId || !fileName?.trim()) return;
      const base = (BASE_URL ?? "").toString().replace(/\/$/, "");
      const url = `${base}/vendorSelfAttestation/document/${encodeURIComponent(attestationId)}/${encodeURIComponent(fileName.trim())}`;
      let blobUrl: string | null = null;
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const blob = await res.blob();
        blobUrl = URL.createObjectURL(blob);
        const w = window.open(blobUrl, "_blank", "noopener,noreferrer");
        if (!w) {
          URL.revokeObjectURL(blobUrl);
          window.alert(
            "Could not open a new tab. Allow pop-ups for this site, then try again.",
          );
          return;
        }
        const revokeLater = () => {
          if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
            blobUrl = null;
          }
        };
        try {
          w.addEventListener("beforeunload", revokeLater);
        } catch {
          /* ignore */
        }
        setTimeout(revokeLater, 60 * 60 * 1000);
      } catch {
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      }
    },
    [],
  );

  const draftAttestationCount = attestations.filter(
    (a) => (a.status ?? "").toUpperCase() === "DRAFT",
  ).length;
  const assessmentCount = vendorCotsAssessments.length;

  if (loading) {
    return (
      <div className="vendor_overview_page vendor_portal_dashboard sec_user_page org_settings_page">
        <LoadingMessage
          message="Loading dashboard…"
          className="loading_message_wrapper--page"
        />
      </div>
    );
  }

  return (
    <div className="vendor_overview_page vendor_portal_dashboard sec_user_page org_settings_page">
      <section className="dash_hero" aria-label="Vendor dashboard overview">
        <div className="dash_hero_bg" aria-hidden>
          <span className="dash_hero_pill dash_hero_pill--1" />
          <span className="dash_hero_pill dash_hero_pill--2" />
          <span className="dash_hero_pill dash_hero_pill--3" />
          <span className="dash_hero_pill dash_hero_pill--4" />
          <span className="dash_hero_pill dash_hero_pill--5" />
        </div>

        <div className="dash_greeting_row dash_greeting_row--centered dash_hero_greeting">
          <div className="page_header_row dash_greeting_heading dash_greeting_heading--pa">
            <DashboardTypewriterGreeting
              role="vendor"
              className="dash_greeting_title dash_hero_title"
            />
            <p className="dash_greeting_subtitle dash_hero_subtitle">
              Create an attestation or assessment to showcase your AI trust posture.
            </p>
          </div>
        </div>

        <div
          className="dash_feature_grid dash_feature_grid--pa_hero"
          aria-label="Quick actions"
        >
          <DashboardFeatureCard
            variant="pa"
            to="/vendorSelfAttestation"
            accent="violet"
            title="Create an attestation"
            description="Start a new vendor self-attestation for your AI product with full control."
            icon={<FileCheck size={14} strokeWidth={2.25} />}
          />
          <DashboardFeatureCard
            variant="pa"
            to="/vendorcots"
            accent="sky"
            title="Create assessment"
            description="Run a product assessment to measure trust and risk posture end to end."
            icon={<ClipboardCheck size={14} strokeWidth={2.25} />}
          />
          <DashboardFeatureCard
            variant="pa"
            to="/salesEnablement"
            accent="amber"
            title="Sales agent"
            description="Use AI-powered enablement to support buyer conversations and deals."
            icon={<BotIcon size={14} strokeWidth={2.25} />}
          />
        </div>
      </section>

      <section
        className="dash_section"
        aria-labelledby="vendor-quick-glance-heading"
      >
        <header className="dash_section_header">
          <h2 id="vendor-quick-glance-heading" className="dash_section_title">
            Quick Glance
          </h2>
          <p className="dash_section_lead">
            A snapshot of your attestation, assessment, and report activity.
          </p>
        </header>
        <div className="dash_stat_grid" aria-label="Dashboard metrics">
          <DashboardStatCard
            to="/attestation_details"
            label="Attestations"
            value={completedAttestations.length}
            description="Completed and live"
            icon={<FileCheck size={18} />}
            accent="green"
          />
          <DashboardStatCard
            to="/vendorcots"
            label="Assessments"
            value={assessmentCount}
            description="Product assessments"
            icon={<ClipboardCheck size={18} />}
            accent="orange"
          />
          <DashboardStatCard
            to="/vendorSelfAttestation"
            label="Drafts"
            value={draftAttestationCount}
            description="Ready to continue"
            icon={<FileCheck size={18} />}
            accent="rose"
          />
          <DashboardStatCard
            to="/reports"
            label="Reports"
            value={Object.keys(reportsByAssessmentId).length}
            description="Available to share"
            icon={<FileText size={18} />}
            accent="teal"
          />
        </div>
      </section>

      <div className="vendor_portal_two_column">
        <section
          className="vendor_portal_column_card"
          aria-labelledby="current-attestations-heading"
        >
          <h2
            id="current-attestations-heading"
            className="vendor_portal_column_title"
          >
            Current Attestations
          </h2>
          <p className="vendor_portal_column_subtitle">
            Active products and trust posture
          </p>
          {error && <div className="vendor_overview_error">{error}</div>}
          {!error && currentAttestationCards.length === 0 && (
            <div className="vendor_overview_empty">
              No completed attestations yet.
            </div>
          )}
          {!error &&
            currentAttestationCards.map((att) => {
              const product =
                (att.productName ?? "").trim() || "Vendor Self-Attestation";
              const score =
                att.generated_profile_report?.trustScore?.overallScore;
              const label = att.generated_profile_report?.trustScore?.label;
              const scoreNum =
                score != null && !Number.isNaN(Number(score))
                  ? Number(score)
                  : null;
              const labelUpper =
                label &&
                String(label).trim() &&
                String(label).trim().toLowerCase() !== "not specified"
                  ? String(label).trim().toUpperCase()
                  : "EXCELLENT";
              const trustSubtitle =
                scoreNum != null ? `TRUST SCORE` : "";
              const subtitle =
                att.generated_profile_report?.trustScore?.summary != null &&
                String(att.generated_profile_report.trustScore.summary).trim()
                  ? String(att.generated_profile_report.trustScore.summary)
                      .trim()
                      .slice(0, 120)
                  : "Infrastructure AI component";
              return (
                <div
                  key={att.id}
                  className="vendor_portal_attestation_wide_card"
                >
                  <div className="vendor_portal_attestation_wide_left">
                    <Shield
                      size={22}
                      className="vendor_portal_attestation_wide_icon"
                      aria-hidden
                    />
                    <div>
                      <p className="vendor_portal_attestation_wide_name">
                        {product}
                      </p>
                      <p className="vendor_portal_attestation_wide_desc">
                        {subtitle}
                      </p>
                    </div>
                  </div>
                  <div
                    className="vendor_portal_attestation_wide_score"
                    aria-label="Trust score"
                  >
                    {scoreNum != null ? (
                      <>
                        <span className="vendor_portal_attestation_score_num">
                          {formatScore2(scoreNum)}
                        </span>
                        <span className="vendor_portal_attestation_score_label">
                          {trustSubtitle}
                          <ClickTooltip content="Trust Score is displayed out of 100">
                            <Info size={14} />
                          </ClickTooltip>
                        </span>
                      </>
                    ) : (
                      <span className="vendor_portal_attestation_score_pending">
                        Pending score
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
        </section>

        <section
          className="vendor_portal_column_card"
          aria-labelledby="compliance-repo-heading"
        >
          <h2
            id="compliance-repo-heading"
            className="vendor_portal_column_title"
          >
            Compliance Repository
          </h2>
          <p className="vendor_portal_column_subtitle">
            Certificates grouped by the attestations shown in the other panel
          </p>
          {!error && currentAttestationCards.length === 0 && (
            <div className="vendor_overview_empty" role="status">
              No attestations — no compliance to show
            </div>
          )}
          {!error &&
            currentAttestationCards.map((att) => {
              const product =
                (att.productName ?? "").trim() || "Vendor Self-Attestation";
              const docs = complianceDocsByAttestationId[att.id] ?? [];
              const visibleDocs = docs.slice(0, COMPLIANCE_CARDS_PER_VIEW);
              return (
                <div
                  key={att.id}
                  className="vendor_portal_compliance_attestation_block"
                >
                  {docs.length === 0 ? (
                    <div
                      className="vendor_overview_empty vendor_portal_compliance_empty_beside"
                      role="status"
                    >
                      No compliance certificates
                    </div>
                  ) : (
                    <div className="vendor_portal_compliance_carousel">
                      <div
                        className="vendor_portal_compliance_track"
                        role="list"
                        aria-label={`Compliance certificates for ${product}`}
                      >
                        {visibleDocs.map((doc) => {
                          const typeHeading =
                            doc.complianceTypeLabel !== "—"
                              ? doc.complianceTypeLabel
                              : "Compliance certificate";
                          const openDoc = () =>
                            openComplianceDocumentInNewTab(
                              doc.attestationId,
                              doc.fileName,
                            );
                          return (
                            <div
                              key={doc.key}
                              className="vendor_portal_compliance_cell"
                              role="listitem"
                            >
                              <article className="vendor_portal_compliance_repo_card">
                                <div className="vendor_portal_compliance_repo_card_header">
                                  <p className="vendor_portal_compliance_repo_card_type">
                                    <FileText size={10} aria-hidden />
                                    <span>{typeHeading}</span>
                                  </p>
                                  <button
                                    type="button"
                                    className="vendor_portal_compliance_repo_card_download"
                                    aria-label={`Download ${doc.title}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openDoc();
                                    }}
                                  >
                                    <Download size={10} aria-hidden />
                                  </button>
                                </div>
                                <div className="vendor_portal_compliance_repo_card_body">
                                  <h3 className="vendor_portal_compliance_repo_card_title">
                                    {doc.title}
                                  </h3>
                                </div>
                                <div className="vendor_portal_compliance_repo_card_footer">
                                  <span className="vendor_portal_compliance_repo_card_expiry">
                                    {doc.expiryDateDisplay
                                      ? `Expires on: ${doc.expiryDateDisplay}`
                                      : "Expiry not specified"}
                                  </span>
                                  <button
                                    type="button"
                                    className="vendor_portal_compliance_repo_card_view"
                                    onClick={openDoc}
                                    aria-label={`View report: ${doc.title}`}
                                  >
                                    View
                                    <ChevronRight size={10} aria-hidden />
                                  </button>
                                </div>
                              </article>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </section>
        <div className="vendor_portal_two_column_footer">
          <Link to="/attestation_details" className="dash_view_all_btn vendor_portal_view_all_bottom">
            View All <ChevronRight size={15} strokeWidth={2.25} aria-hidden />
          </Link>
        </div>
      </div>

      <section
        className="vendor_portal_table_section"
        aria-labelledby="recent-assessments-heading"
      >
        <div className="vendor_portal_table_header_row">
          <h2
            id="recent-assessments-heading"
            className="vendor_portal_section_heading vendor_portal_section_heading_inline"
          >
            Recent Product Assessments
          </h2>
          <Link to="/reports" className="dash_view_all_btn vendor_portal_view_history">
            View All <ChevronRight size={15} strokeWidth={2.25} aria-hidden />
          </Link>
        </div>
        {assessmentsLoading && (
          <LoadingMessage message="Loading assessments…" compact />
        )}
        {!assessmentsLoading && recentAssessmentsTable.length === 0 && (
          <div className="vendor_overview_empty">
            No product assessments yet.
          </div>
        )}
        {!assessmentsLoading && recentAssessmentsTable.length > 0 && (
          <div className="vendor_portal_table_wrap">
            <table className="vendor_portal_table">
              <thead>
                <tr>
                  <th scope="col">Product Entity</th>
                  <th scope="col">Customer</th>
                  <th scope="col">Vendor Grade</th>
                  <th scope="col">Compliance Cerificates</th>
                  <th scope="col">Expiry Date</th>
                  <th scope="col" className="vendor_portal_th_actions">
                    Report
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentAssessmentsTable.map((item) => {
                  const reportMeta =
                    reportsByAssessmentId[String(item.assessmentId)];
                  const product =
                    (item.productName ?? "").toString().trim() || "—";
                  const org = (item.customerOrganizationName ?? "")
                    .toString()
                    .trim();
                  const lastVerified = formatDateDDMMMYYYY(
                    item.expiryAt ??
                      item.cotsUpdatedAt ??
                      item.updatedAt ??
                      item.createdAt,
                  );
                  const reportId = reportMeta?.reportId;
                  const vendorGrade = reportMeta?.vendorGrade ?? null;
                  const gradeLabel =
                    vendorGrade != null
                      ? normalizeDisplayLetterGrade(vendorGrade)
                      : null;
                  const gradeVariantClass =
                    vendorGrade === "A"
                      ? "vendor_portal_grade_shield_a"
                      : vendorGrade === "B" || vendorGrade === "C"
                        ? "vendor_portal_grade_shield_b"
                        : vendorGrade === "D"
                          ? "vendor_portal_grade_shield_d"
                          : String(vendorGrade) === "E" || String(vendorGrade) === "F"
                            ? "vendor_portal_grade_shield_ef"
                            : "";
                  const complianceCertificates = findCertificateTypesForAssessment(
                    item,
                    attestations,
                  );
                  return (
                    <tr key={String(item.assessmentId)}>
                      <td>
                        <div className="vendor_portal_cell_product">
                          <Bot
                            size={18}
                            className="vendor_portal_cell_product_icon"
                            aria-hidden
                          />
                          <span>{product}</span>
                        </div>
                      </td>
                      <td>{org}</td>
                      <td>
                        {gradeLabel ? (
                          <span
                            className={`vendor_portal_grade_shield ${gradeVariantClass}`.trim()}
                            title={`Vendor grade ${gradeLabel} (from complete report)`}
                          >
                            <Shield size={14} aria-hidden />
                            {gradeLabel}
                          </span>
                        ) : (
                          <span className="vendor_portal_grade_na">—</span>
                        )}
                      </td>
                      <td>
                        {complianceCertificates.length > 0 ? (
                          <div className="vendor_portal_compliance_names">
                            {complianceCertificates.map((docType) => (
                              <span
                                key={docType}
                                className="vendor_portal_compliance_pill"
                                title={docType}
                              >
                                {docType}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="vendor_portal_grade_na">—</span>
                        )}
                      </td>
                      <td>{lastVerified}</td>
                      <td>
                        {reportId ? (
                          <Link
                            to={`/reports/${reportId}`}
                            className="user_table_action_btn user_table_action_btn_icon"
                            title="View"
                            aria-label="View report"
                          >
                            <Eye size={14} />
                          </Link>
                        ) : (
                          <span className="vendor_portal_grade_na">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};

export default VendorOverview;
