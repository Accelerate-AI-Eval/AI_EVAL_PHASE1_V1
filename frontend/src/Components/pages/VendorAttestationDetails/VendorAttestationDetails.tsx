import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import {
  FileCheck,
  Eye,
  Plus,
  SquarePen,
  CircleX,
  Shield,
  AlertTriangle,
  Check,
  CircleCheck,
  CheckCircle2,
  FileText,
  Calendar,
  Search,
  Archive,
  RotateCcw,
  Ban,
  Loader2,
} from "lucide-react";
import Button from "../../UI/Button";
import LoadingMessage from "../../UI/LoadingMessage";
import Modal from "../../UI/Modal";
import ClickTooltip from "../../UI/ClickTooltip";
import StepVendorSelfAttestationPrev, {
  type ComplianceDocumentExpiryMeta,
} from "../VendorAttestations/StepVendorSelfAttestationPrev";
import { toast } from "react-toastify";
import { ReportsPagination } from "../Reports/ReportsPagination";
import type {
  VendorSelfAttestationPayload,
  VendorSelfAttestationFormState,
} from "../../types/vendorSelfAttestation";
import {
  buildFormStateFromApi,
  defaultDocumentUpload,
  mapApiCompanyProfile,
} from "../../../utils/vendorAttestationState";
import type { DocumentUploadState } from "../../types/vendorSelfAttestation";
import type { AttestationCompanyProfile } from "../../types/vendorSelfAttestation";
import "../UserManagement/user_management.css";
import "../VendorDirectory/VendorDirectory.css";
import "../Reports/general_reports.css";
import "../Assessments/assessments.css";
import "../../../styles/page_tabs.css";
import "./vendor_attestation_details.css";
import { formatDateDDMMMYYYY } from "../../../utils/formatDate.js";
import { isVendorAttestationOnlyRole } from "../../../guards/rbacConfig";

type AttestationStatus = "Draft" | "Completed" | "Rejected" | "Expired";

interface AttestationCardItem {
  id: string;
  title: string;
  status: AttestationStatus;
  submittedDate: string | null;
  expiryDate: string | null;
  recordId?: string | null;
  completedBy?: string | null;
  organizationId?: string | null;
  createdByUserId?: string | null;
  /** User archived (ledger); still COMPLETED in DB if not time-expired. */
  userArchivedAt?: string | null;
}

const BASE_URL =
  import.meta.env.VITE_BASE_URL ?? "http://localhost:5003/api/v1";

/** Build form state from GET /attestation/:id response (attestation.formData). */
function buildFormStateFromFormData(
  formData: Record<string, unknown> | null | undefined,
): VendorSelfAttestationFormState {
  if (!formData || typeof formData !== "object") {
    return {
      companyProfile: {
        vendorType: "",
        sector: {
          public_sector: [],
          private_sector: [],
          non_profit_sector: [],
        },
        vendorMaturity: "",
        companyWebsite: "",
        companyDescription: "",
        employeeCount: "",
        yearFounded: "",
        headquartersLocation: "",
        operatingRegions: [],
      },
      attestation: {},
      documentUpload: defaultDocumentUpload,
    };
  }
  const companyProfile =
    formData.companyProfile &&
    typeof formData.companyProfile === "object" &&
    Object.keys(formData.companyProfile as object).length > 0
      ? mapApiCompanyProfile(formData.companyProfile as Record<string, unknown>)
      : {
          vendorType: "",
          sector: {
            public_sector: [],
            private_sector: [],
            non_profit_sector: [],
          },
          vendorMaturity: "",
          companyWebsite: "",
          companyDescription: "",
          employeeCount: "",
          yearFounded: "",
          headquartersLocation: "",
          operatingRegions: [],
        };
  const attestation =
    formData.attestation &&
    typeof formData.attestation === "object" &&
    Object.keys(formData.attestation as object).length > 0
      ? (formData.attestation as VendorSelfAttestationPayload)
      : {};
  const docUpload = formData.documentUpload ?? formData.document_uploads;
  let documentUpload: DocumentUploadState = defaultDocumentUpload;
  if (docUpload && typeof docUpload === "object") {
    const d = docUpload as Record<string, unknown>;
    const slot2 = d["2"];
    let regulatory2: DocumentUploadState["2"] = {
      categories: [],
      byCategory: {},
    };
    if (slot2 != null && typeof slot2 === "object" && !Array.isArray(slot2)) {
      const s = slot2 as Record<string, unknown>;
      regulatory2 = {
        categories: Array.isArray(s.categories)
          ? (s.categories as string[])
          : [],
        byCategory:
          s.byCategory && typeof s.byCategory === "object"
            ? (s.byCategory as Record<string, string[]>)
            : {},
      };
    }
    documentUpload = {
      "0": Array.isArray(d["0"]) ? (d["0"] as string[]) : [],
      "1": Array.isArray(d["1"]) ? (d["1"] as string[]) : [],
      "2": regulatory2,
      evidenceTestingPolicy: Array.isArray(d.evidenceTestingPolicy)
        ? (d.evidenceTestingPolicy as string[])
        : [],
      aiGovernancePolicy: Array.isArray(d.aiGovernancePolicy)
        ? (d.aiGovernancePolicy as string[])
        : defaultDocumentUpload.aiGovernancePolicy,
    };
  }
  return { companyProfile, attestation, documentUpload };
}

/** AI Eval (system admin) organization id – system admin may only edit attestations created by this org. */
const SYSTEM_ORG_ID = "1";

const VendorAttestationDetails = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const hasOpenedFromDashboard = useRef(false);
  const [cards, setCards] = useState<AttestationCardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFormState, setPreviewFormState] =
    useState<VendorSelfAttestationFormState | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewComplianceExpiries, setPreviewComplianceExpiries] = useState<
    Record<string, ComplianceDocumentExpiryMeta> | null
  >(null);

  const systemRole = (sessionStorage.getItem("systemRole") ?? "").toLowerCase().trim();
  const userRole = sessionStorage.getItem("userRole");
  const currentUserId = (sessionStorage.getItem("userId") ?? "").toString().trim();
  const isSystemAdmin = systemRole === "system admin" || systemRole === "system_admin";
  const isSystemViewer = systemRole === "system viewer" || systemRole === "system_viewer";
  const isVendorAttestationOnly = systemRole === "vendor" && isVendorAttestationOnlyRole(userRole);
  const isViewOnly = isSystemViewer || isVendorAttestationOnly;
  const currentUserOrgId = (sessionStorage.getItem("organizationId") ?? "").toString().trim();

  /** System viewer or vendor Engineer / Viewer: view only (no edit, no add). System admin: edit only AI Eval org attestations. Owner: edit draft or rejected. Same-org non-owner: edit only draft. */
  const canEditAttestation = (item: AttestationCardItem): boolean => {
    if (isViewOnly) return false;
    const itemOrgId = (item.organizationId ?? "").toString().trim();
    const isOwner = item.createdByUserId != null && currentUserId !== "" && item.createdByUserId === currentUserId;
    const isSameOrg = currentUserOrgId !== "" && itemOrgId === currentUserOrgId;

    if (isSystemAdmin) {
      const sysOrgId = (currentUserOrgId || SYSTEM_ORG_ID).toString().trim();
      return itemOrgId === sysOrgId || itemOrgId === SYSTEM_ORG_ID;
    }
    if (isOwner) {
      return true;
    }
    if (isSameOrg && item.status === "Draft") {
      return true;
    }
    return false;
  };

  useEffect(() => {
    document.title = "AI-Q | Attestation";
  }, []);

  const LOADER_MIN_MS = 2500; // same as Assessments page

  // Fetch vendor self attestation from vendor_self_attestations (GET /vendorSelfAttestation)
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
      const elapsed = Date.now() - loadStart;
      const remaining = Math.max(0, LOADER_MIN_MS - elapsed);
      setTimeout(() => setLoading(false), remaining);
    };
    try {
      const organizationId = sessionStorage.getItem("organizationId") ?? "";
      const query = organizationId
        ? `?organizationId=${encodeURIComponent(organizationId)}`
        : "";
      const response = await fetch(
        `${BASE_URL}/vendorSelfAttestation${query}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const text = await response.text();
      let result: {
        success?: boolean;
        attestation?: {
          id?: string;
          status?: string;
          product_name?: string;
          created_at?: string;
          updated_at?: string;
        };
        attestations?: {
          id?: string;
          status?: string;
          product_name?: string;
          created_at?: string;
          updated_at?: string;
          submitted_at?: string | null;
          expiry_at?: string | null;
        }[];
        companyProfile?: Record<string, unknown>;
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

      const list: AttestationCardItem[] = [];
      if (result.success) {
        const items = Array.isArray(result.attestations)
          ? result.attestations
          : result.attestation
            ? [result.attestation]
            : [];
        for (const attestation of items) {
          if (attestation?.id) {
            const apiStatus = (attestation.status ?? "").toUpperCase();
            const statusLabel =
              apiStatus === "EXPIRED"
                ? "Expired"
                : apiStatus === "REJECTED"
                  ? "Rejected"
                  : apiStatus === "COMPLETED"
                    ? "Completed"
                    : "Draft";
            const productName = (attestation.product_name ?? "").trim();
            const completedByName =
              (attestation as { completedBy?: { name?: string } }).completedBy
                ?.name ?? null;
            // For Completed: use only submitted_at so Product Profile toggles never change "Submitted" date
            const submittedAt =
              (attestation as { submitted_at?: string | null }).submitted_at ??
              null;
            const isCompleted =
              statusLabel === "Completed" || statusLabel === "Expired";
            const submittedDate = isCompleted
              ? (submittedAt ??
                attestation.updated_at ??
                attestation.created_at ??
                null)
              : (attestation.updated_at ?? attestation.created_at ?? null);
            const expiryAt =
              (attestation as { expiry_at?: string | null }).expiry_at ?? null;
            const orgId = (attestation as { organization_id?: string | null }).organization_id ?? null;
            const createdByUserId = (attestation as { user_id?: string | number | null }).user_id;
            const userArchivedAtRaw = (attestation as { userArchivedAt?: string | null }).userArchivedAt;
            list.push({
              id: attestation.id,
              title: productName || "Draft",
              status: statusLabel as AttestationStatus,
              submittedDate,
              expiryDate: expiryAt,
              recordId: attestation.id,
              completedBy: completedByName ?? null,
              organizationId: orgId ?? null,
              createdByUserId: createdByUserId != null ? String(createdByUserId) : null,
              userArchivedAt:
                userArchivedAtRaw != null && String(userArchivedAtRaw).trim() !== ""
                  ? String(userArchivedAtRaw)
                  : null,
            });
          }
        }
      }
      setCards(list);
    } catch {
      setError("Network or server error");
    } finally {
      finishLoading();
    }
  }, []);

  useEffect(() => {
    fetchAttestations();
  }, [fetchAttestations]);

  // Refetch when user returns to this page (e.g. after saving draft on form) so card shows latest status
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") fetchAttestations();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [fetchAttestations]);

  const [previewAttestationId, setPreviewAttestationId] = useState<
    string | null
  >(null);
  const [attestationSearch, setAttestationSearch] = useState("");
  const [attestationTab, setAttestationTab] = useState<"current" | "archived">(
    "current",
  );
  const [attestationCardPage, setAttestationCardPage] = useState(1);
  const [attestationArchivedCardPage, setAttestationArchivedCardPage] =
    useState(1);
  const [attestationCardPageSize, setAttestationCardPageSize] = useState(10);
  const [userArchiveModal, setUserArchiveModal] = useState<{
    attestationId: string | null;
    mode: "archive" | "reactive" | null;
  }>({ attestationId: null, mode: null });
  const [userArchiveReason, setUserArchiveReason] = useState("");
  const [userArchiveSubmitting, setUserArchiveSubmitting] = useState(false);

  useEffect(() => {
    setAttestationCardPage(1);
    setAttestationArchivedCardPage(1);
  }, [attestationSearch, attestationTab]);

  const handleOpenDocument = useCallback(
    async (fileName: string) => {
      const token = sessionStorage.getItem("bearerToken");
      if (!token || !previewAttestationId) return;
      const base = (BASE_URL ?? "").toString().replace(/\/$/, "");
      const url = `${base}/vendorSelfAttestation/document/${encodeURIComponent(previewAttestationId)}/${encodeURIComponent(fileName)}`;
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const w = window.open(blobUrl, "_blank", "noopener,noreferrer");
        if (w) setTimeout(() => URL.revokeObjectURL(blobUrl), 3000);
        else URL.revokeObjectURL(blobUrl);
      } catch {
        // ignore
      }
    },
    [previewAttestationId, BASE_URL],
  );

  const handleViewPreview = useCallback(
    async (recordId: string | null | undefined) => {
      const token = sessionStorage.getItem("bearerToken");
      if (!token) return;
      setPreviewAttestationId(recordId ?? null);
      setPreviewOpen(true);
      setPreviewLoading(true);
      setPreviewFormState(null);
      setPreviewComplianceExpiries(null);
      try {
        const organizationId = sessionStorage.getItem("organizationId") ?? "";
        const params = new URLSearchParams();
        if (organizationId) params.set("organizationId", organizationId);
        if (recordId) params.set("id", recordId);
        const query = params.toString() ? `?${params.toString()}` : "";
        const response = await fetch(
          `${BASE_URL}/vendorSelfAttestation${query}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          },
        );
        const text = await response.text();
        let result: {
          success?: boolean;
          attestation?: Record<string, unknown>;
          companyProfile?: Record<string, unknown>;
        } = {};
        try {
          result = text ? JSON.parse(text) : {};
        } catch {
          setPreviewLoading(false);
          return;
        }
        if (
          response.ok &&
          result.success &&
          (result.attestation || result.companyProfile)
        ) {
          const rawExp = result.attestation?.compliance_document_expiries;
          setPreviewComplianceExpiries(
            rawExp != null && typeof rawExp === "object" && !Array.isArray(rawExp)
              ? (rawExp as Record<string, ComplianceDocumentExpiryMeta>)
              : null,
          );
          setPreviewFormState(
            buildFormStateFromApi({
              companyProfile: result.companyProfile,
              attestation: result.attestation,
            }),
          );
        }
      } finally {
        setPreviewLoading(false);
      }
    },
    [],
  );

  // When navigated from dashboard "View Document", open the attestation preview so the document is visible
  useEffect(() => {
    const attestationId = (location.state as { attestationId?: string } | null)
      ?.attestationId;
    if (!attestationId) {
      hasOpenedFromDashboard.current = false;
      return;
    }
    if (hasOpenedFromDashboard.current) return;
    hasOpenedFromDashboard.current = true;
    handleViewPreview(attestationId);
    navigate(location.pathname, { replace: true, state: {} });
  }, [location.state, location.pathname, navigate, handleViewPreview]);

  const sortedCards = [...cards].sort((a, b) => {
    const dateA = a.submittedDate ? new Date(a.submittedDate).getTime() : 0;
    const dateB = b.submittedDate ? new Date(b.submittedDate).getTime() : 0;
    return dateB - dateA;
  });

  /** Time-based: past expiry or DB status Expired. */
  const isAttestationTimeExpired = (item: AttestationCardItem): boolean => {
    if (item.status === "Draft") return false;
    if (item.status === "Expired") return true;
    const exp = item.expiryDate;
    if (exp == null || String(exp).trim() === "") return false;
    const expiry = new Date(exp);
    if (Number.isNaN(expiry.getTime())) return false;
    const today = new Date();
    expiry.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    return expiry.getTime() < today.getTime();
  };

  const isUserAttestationArchived = (item: AttestationCardItem): boolean =>
    item.userArchivedAt != null && String(item.userArchivedAt).trim() !== "";

  /** Archived tab: time-expired and/or user-archived (same as assessments). */
  const isInAttestationArchivedList = (item: AttestationCardItem): boolean =>
    isAttestationTimeExpired(item) || isUserAttestationArchived(item);

  const currentCards = sortedCards.filter((item) => !isInAttestationArchivedList(item));
  const archivedCards = sortedCards.filter((item) => isInAttestationArchivedList(item));
  const cardsForTab =
    attestationTab === "current" ? currentCards : archivedCards;
  const attestationSearchLower = attestationSearch.trim().toLowerCase();
  const filteredAttestations =
    attestationSearchLower === ""
      ? cardsForTab
      : cardsForTab.filter((item) =>
          (item.title ?? "").toLowerCase().includes(attestationSearchLower),
        );

  /** Match Assessments ledger empty copy: tab-specific + search miss. */
  const attestationListEmptyMessage =
    attestationTab === "archived"
      ? cardsForTab.length === 0
        ? "No archived attestations."
        : "No archived attestations match your search."
      : cardsForTab.length === 0
        ? "No attestations yet."
        : "No attestations match your search.";

  const openUserAttestationArchiveModal = (
    attestationId: string,
    mode: "archive" | "reactive",
  ) => {
    setUserArchiveModal({ attestationId, mode });
    setUserArchiveReason("");
  };

  const closeUserAttestationArchiveModal = (force = false) => {
    if (!force && userArchiveSubmitting) return;
    setUserArchiveModal({ attestationId: null, mode: null });
    setUserArchiveReason("");
  };

  const submitUserAttestationArchive = async () => {
    const r = (userArchiveReason ?? "").trim();
    if (!r) {
      alert("Please provide a reason.");
      return;
    }
    if (userArchiveModal.attestationId == null || !userArchiveModal.mode) return;
    const token = sessionStorage.getItem("bearerToken");
    if (!token) return;
    setUserArchiveSubmitting(true);
    try {
      const id = userArchiveModal.attestationId;
      const userArchived = userArchiveModal.mode === "archive";
      const res = await fetch(
        `${BASE_URL}/vendorSelfAttestation/${encodeURIComponent(id)}/user-archive`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ userArchived, reason: r }),
        },
      );
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        alert(data?.message || "Request failed");
        return;
      }
      toast.success(
        userArchived
          ? "Attestation archived."
          : "Attestation is now active (in Current).",
      );
      closeUserAttestationArchiveModal(true);
      void fetchAttestations();
    } catch {
      alert("Request failed");
    } finally {
      setUserArchiveSubmitting(false);
    }
  };

  const canUserArchiveAttestation = (item: AttestationCardItem): boolean =>
    !isViewOnly &&
    item.status === "Completed" &&
    !isUserAttestationArchived(item) &&
    !isAttestationTimeExpired(item);

  const canUserReactivateAttestation = (item: AttestationCardItem): boolean =>
    !isViewOnly &&
    isUserAttestationArchived(item) &&
    !isAttestationTimeExpired(item) &&
    item.status === "Completed";

  return (
    <div className="sec_user_page attestation_page org_settings_page">
      <div className="heading_user_page page_header_align">
        <div className="headers page_header_row">
          <span className="icon_size_header" aria-hidden>
            <FileCheck size={24} className="header_icon_svg" />
          </span>
          <div className="page_header_title_block">
            <h1 className="page_header_title">Attestation</h1>
            <p className="sub_title page_header_subtitle">
              Establish and maintain your vendor trust profile for the AI EVAL
              directory.
            </p>
          </div>
        </div>
        {!isViewOnly && (
          <div className="btn_user_page">
            <Button
              className="invite_user_btn"
              onClick={() =>
                navigate("/vendorSelfAttestation?new=1", {
                  state: { newAttestation: true },
                })
              }
            >
              <Plus size={24} />
              Attestation
            </Button>
          </div>
        )}
      </div>

      {/* Card 1: Trust Profile Attestation – shield, title, "Your self-attestation covers:", 4-column grid */}
      <div className="attestation_section attestation_trust_profile">
        <div className="attestation_section_header">
          <span>
            <Shield
              className="attestation_section_icon attestation_section_icon_primary"
              size={24}
            />
          </span>
          <div>
            <h2 className="attestation_section_title">
              Trust Profile Attestation
            </h2>
            <p className="attestation_section_subtitle">
              Complete this to appear in the approved vendor directory.
            </p>
          </div>
        </div>
        <p className="attestation_covers_heading">
          Your self-attestation covers:
        </p>
        <div className="attestation_covers_grid">
          <ul className="attestation_covers_list">
            <li>
              <CircleCheck size={16} className="attestation_check" /> Product
              profile and capabilities
            </li>
            <li>
              <CircleCheck size={16} className="attestation_check" /> AI safety
              and testing practices
            </li>
          </ul>
          <ul className="attestation_covers_list">
            <li>
              <CircleCheck size={16} className="attestation_check" /> Compliance
              certifications
            </li>
            <li>
              <CircleCheck size={16} className="attestation_check" /> Data
              handling policies
            </li>
          </ul>
          <ul className="attestation_covers_list">
            <li>
              <CircleCheck size={16} className="attestation_check" />{" "}
              Operational reliability
            </li>
            <li>
              <CircleCheck size={16} className="attestation_check" /> Deployment
              options
            </li>
          </ul>
          <ul className="attestation_covers_list">
            <li>
              <CircleCheck size={16} className="attestation_check" /> Risk
              mitigations
            </li>
            <li>
              <CircleCheck size={16} className="attestation_check" /> Evidence
              documentation
            </li>
          </ul>
        </div>
      </div>
   <div className="assessment_list_header_stack">
          <p className="your_assessments_title">YOUR ATTESTATIONS</p>
          <div className="assessments_ledger_toolbar attestation_ledger_toolbar">
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
                aria-label="Search attestations"
              />
            </div>
            <div
              className="assessments_ledger_segmented assessments_ledger_segmented_inline"
              role="group"
              aria-label="Attestations scope"
            >
              <button
                type="button"
                className={
                  attestationTab === "current"
                    ? "assessments_ledger_segment active"
                    : "assessments_ledger_segment"
                }
                onClick={() => setAttestationTab("current")}
              >
                Current
              </button>
              <button
                type="button"
                className={
                  attestationTab === "archived"
                    ? "assessments_ledger_segment active"
                    : "assessments_ledger_segment"
                }
                onClick={() => setAttestationTab("archived")}
              >
                Archived
              </button>
            </div>
          </div>
        </div>
      {/* Card 2: YOUR ATTESTATIONS – title row, then tabs (left) + search (right) */}
      <div className="ai_assessments_section">
     

        {loading && <LoadingMessage message="Loading attestations…" />}
        {error && <div className="vendor_attestation_error">{error}</div>}
        {!loading && !error && (
          <div className="attestation_list_rows assessment_list_rows">
            {filteredAttestations.length === 0 ? (
              <p className="assessment_search_no_results">
                {attestationListEmptyMessage}
              </p>
            ) : (
              <>
                <div className="general_rpr_cards_sec vendor_directory_grid">
                  {(() => {
                    const currentPage =
                      attestationTab === "current"
                        ? attestationCardPage
                        : attestationArchivedCardPage;
                    const start = (currentPage - 1) * attestationCardPageSize;
                    const paginated = filteredAttestations.slice(
                      start,
                      start + attestationCardPageSize,
                    );
                    return paginated.map((item) => {
                      const isDraft = item.status === "Draft";
                      const isUserOnlyArchived =
                        isUserAttestationArchived(item) &&
                        !isAttestationTimeExpired(item) &&
                        item.status === "Completed";
                      const cardInArchived = isInAttestationArchivedList(item);
                      const statusDisplay = isUserOnlyArchived
                        ? "ARCHIVED"
                        : item.status === "Completed"
                          ? "COMPLETED"
                          : item.status === "Expired"
                            ? "EXPIRED"
                            : item.status;
                      const statusHeaderClass = isUserOnlyArchived
                        ? "assessment_card_status_user_archived"
                        : item.status === "Completed"
                          ? "assessment_card_status_completed"
                          : item.status === "Expired"
                            ? "assessment_card_status_expired"
                            : item.status === "Rejected"
                              ? "assessment_card_status_rejected"
                              : "assessment_card_status_draft";
                      const showExpiryInHeader =
                        item.status === "Completed" ||
                        item.status === "Expired" ||
                        isUserOnlyArchived;
                      return (
                        <article
                          key={item.id}
                          className={`vendor_directory_card general_rpr_card${cardInArchived ? " general_rpr_card_archived" : ""}`}
                          data-accent="sales"
                        >
                          <div className="general_report_card_header">
                            <div className="assessment_card_header_left">
                              <p
                                className={`vendor_directory_card_products general_rpr_card_report_type ${statusHeaderClass}`}
                              >
                                <span
                                  className="general_rpr_card_report_type_icon"
                                  aria-hidden
                                >
                                  <FileText size={16} />
                                </span>
                                <span>
                                  <span>{statusDisplay}</span>
                                  {showExpiryInHeader && item.expiryDate && (
                                    <span className="assessment_card_header_expiry">
                                      Expires on:{" "}
                                      {formatDateDDMMMYYYY(item.expiryDate)}
                                    </span>
                                  )}
                                </span>
                              </p>
                            </div>
                            <span className="general_rpr_card_download_wrap">
                              {isDraft ? (
                                canEditAttestation(item) ? (
                                  <Link
                                    to={`/vendorSelfAttestation?edit=${encodeURIComponent(item.recordId ?? "")}`}
                                    state={{ editId: item.recordId }}
                                    className="general_rpr_card_download_btn assessment_card_header_action_btn"
                                    title="Edit"
                                    aria-label={`Edit attestation: ${item.title}`}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <SquarePen size={14} aria-hidden />
                                  </Link>
                                ) : (
                                  <button
                                    type="button"
                                    className="general_rpr_card_download_btn assessment_card_header_action_btn"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleViewPreview(item.recordId);
                                    }}
                                    aria-label={`View attestation: ${item.title}`}
                                    title="View"
                                  >
                                    <Eye size={14} aria-hidden />
                                  </button>
                                )
                              ) : (
                                <button
                                  type="button"
                                  className="general_rpr_card_download_btn assessment_card_header_action_btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewPreview(item.recordId);
                                  }}
                                  aria-label={`View attestation: ${item.title}`}
                                  title="View"
                                >
                                  <Eye size={14} aria-hidden />
                                </button>
                              )}
                              {item.status === "Rejected" && canEditAttestation(item) && (
                                <Link
                                  to="/vendorSelfAttestation"
                                  state={{ editId: item.recordId }}
                                  className="general_rpr_card_download_btn assessment_card_header_action_btn"
                                  title="Edit"
                                  aria-label={`Edit attestation: ${item.title}`}
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ marginLeft: "0.25rem" }}
                                >
                                  <SquarePen size={14} aria-hidden />
                                </Link>
                              )}
                              {attestationTab === "current" &&
                                canUserArchiveAttestation(item) &&
                                item.recordId && (
                                  <button
                                    type="button"
                                    className="general_rpr_card_download_btn assessment_card_header_action_btn"
                                    title="Archive"
                                    aria-label={`Archive attestation: ${item.title}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openUserAttestationArchiveModal(
                                        String(item.recordId),
                                        "archive",
                                      );
                                    }}
                                    style={{ marginLeft: "0.25rem" }}
                                  >
                                    <Archive size={14} aria-hidden />
                                  </button>
                                )}
                              {attestationTab === "archived" &&
                                canUserReactivateAttestation(item) &&
                                item.recordId && (
                                  <button
                                    type="button"
                                    className="general_rpr_card_download_btn assessment_card_header_action_btn"
                                    title="Reactive: return to Current"
                                    aria-label={`Reactive attestation: ${item.title}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openUserAttestationArchiveModal(
                                        String(item.recordId),
                                        "reactive",
                                      );
                                    }}
                                    style={{ marginLeft: "0.25rem" }}
                                  >
                                    <RotateCcw size={14} aria-hidden />
                                  </button>
                                )}
                            </span>
                          </div>
                          <div className="general_rpr_title">
                            <div className="vendor_directory_card_header_text">
                              <ClickTooltip
                                content={item.title}
                                position="top"
                                showOn="hover"
                              >
                                <span className="general_rpr_card_title_wrap">
                                  <h2 className="vendor_directory_card_name general_rpr_card_title_clamp">
                                    {item.title}
                                  </h2>
                                </span>
                              </ClickTooltip>
                            </div>
                          </div>
                          <div className="general_rpr_card_footer">
                            <div className="general_rpr_card_dates">
                              <div className="general_rpr_card_date_row">
                                <span className="general_rpr_card_date_label_expiry">
                                  {isDraft ? "Updated by:" : "Completed by:"}
                                </span>
                                <span className="general_rpr_card_date_value_expiry">
                                  {item.completedBy?.trim() || "—"}
                                </span>
                              </div>
                              {!isDraft && (
                                <div className="general_rpr_card_date_row">
                                  <span className="general_rpr_card_date_label_expiry">
                                    Created on:
                                  </span>
                                  <span className="general_rpr_card_date_value_expiry">
                                    {item.submittedDate
                                      ? formatDateDDMMMYYYY(item.submittedDate)
                                      : "—"}
                                  </span>
                                </div>
                              )}
                              {isDraft ? (
                                <div className="general_rpr_card_date_row">
                                  <span className="general_rpr_card_date_label_expiry">
                                    Drafted on:
                                  </span>
                                  <span className="general_rpr_card_date_value_expiry">
                                    {item.submittedDate
                                      ? formatDateDDMMMYYYY(item.submittedDate)
                                      : "—"}
                                  </span>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </article>
                      );
                    });
                  })()}
                </div>
                <ReportsPagination
                  totalItems={filteredAttestations.length}
                  currentPage={
                    attestationTab === "current"
                      ? attestationCardPage
                      : attestationArchivedCardPage
                  }
                  pageSize={attestationCardPageSize}
                  onPageChange={
                    attestationTab === "current"
                      ? setAttestationCardPage
                      : setAttestationArchivedCardPage
                  }
                  onPageSizeChange={(size) => {
                    setAttestationCardPageSize(size);
                    setAttestationCardPage(1);
                    setAttestationArchivedCardPage(1);
                  }}
                />
              </>
            )}
          </div>
        )}
      </div>
      {/* Directory Listing Requirements - at the top */}
      <div className="attestation_section attestation_directory_requirements">
        <div className="attestation_section_header">
          <AlertTriangle
            className="attestation_section_icon attestation_section_icon_warning"
            size={24}
          />
          <h2 className="attestation_section_title">
            Directory Listing Requirements
          </h2>
        </div>
        <div className="attestation_requirements_grid">
          <div className="attestation_requirement_item">
            <h3 className="attestation_requirement_heading">
              Public Directory
            </h3>
            <p>
              Complete your attestation and achieve a passing trust score to
              appear in the vendor directory visible to buyers.
            </p>
          </div>
          <div className="attestation_requirement_item">
            <h3 className="attestation_requirement_heading">Keep It Updated</h3>
            <p>
              You can edit your attestation at any time to reflect changes in
              your product, certifications, or practices.
            </p>
          </div>
          <div className="attestation_requirement_item">
            <h3 className="attestation_requirement_heading">
              Continuous Trust
            </h3>
            <p>
              Regular updates to your attestation help maintain your trust score
              and directory standing.
            </p>
          </div>
        </div>
      </div>

      <Modal
        isOpen={userArchiveModal.attestationId != null}
        onClose={() => closeUserAttestationArchiveModal()}
        overlayClassName="profile_modal_overlay"
        popupClassName=""
      >
        <div className="profile_modal_content settings_modal_content assessment_delete_modal_content">
          <div className="profile_modal_header">
            <h2
              id="attestation_user_archive_modal_title"
              className="profile_modal_title"
            >
              {userArchiveModal.mode === "archive"
                ? "Archive attestation"
                : "Reactive (return to Current)"}
            </h2>
            <button
              type="button"
              className="modal_close_btn"
              onClick={() => closeUserAttestationArchiveModal()}
              disabled={userArchiveSubmitting}
              aria-label="Close"
            >
              <CircleX size={20} />
            </button>
          </div>
          <div className="profile_modal_body">
            <p className="assessment_delete_modal_subtitle">
              {userArchiveModal.attestationId != null
                ? cards.find((c) => c.id === userArchiveModal.attestationId)
                    ?.title ?? "Attestation"
                : ""}
            </p>
            <p className="assessment_delete_modal_message">
              {userArchiveModal.mode === "archive"
                ? "This will move the attestation to the Archived tab."
                : "This will return the attestation to the Current list."}
            </p>
            <div className="settings_form_row">
              <div
                className="settings_form_group"
                style={{ flex: "1 1 100%" }}
              >
                <label htmlFor="attestation_user_archive_reason">
                  Reason <span className="assessment_delete_required">*</span>
                </label>
                <textarea
                  id="attestation_user_archive_reason"
                  className="settings_input"
                  value={userArchiveReason}
                  onChange={(e) => setUserArchiveReason(e.target.value)}
                  placeholder="Please provide a reason for this change…"
                  rows={3}
                  disabled={userArchiveSubmitting}
                  style={{ resize: "none", minHeight: "4em" }}
                />
              </div>
            </div>
            <div className="settings_form_actions">
              <Button
                type="button"
                className="orgCancelBtn"
                onClick={() => closeUserAttestationArchiveModal()}
                disabled={userArchiveSubmitting}
              >
                <Ban size={16} aria-hidden />
                Cancel
              </Button>
              <Button
                type="button"
                className="orgCreateBtn"
                onClick={() => {
                  void submitUserAttestationArchive();
                }}
                disabled={userArchiveSubmitting || !userArchiveReason.trim()}
              >
                {userArchiveSubmitting ? (
                  <>
                    Saving…
                    <Loader2 size={18} className="auth_spinner" aria-hidden />
                  </>
                ) : userArchiveModal.mode === "archive" ? (
                  <>
                    <Archive size={16} aria-hidden />
                    Archive
                  </>
                ) : (
                  <>
                    <RotateCcw size={16} aria-hidden />
                    Reactive
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {previewOpen && (
        <div
          className="vendor_attestation_preview_modal_overlay"
          onClick={() => setPreviewOpen(false)}
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
              {previewLoading && <LoadingMessage message="Loading preview…" />}
              {!previewLoading && previewFormState && (
                <StepVendorSelfAttestationPrev
                  formState={previewFormState}
                  attestationId={previewAttestationId}
                  onOpenDocument={handleOpenDocument}
                  complianceDocumentExpiries={previewComplianceExpiries}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VendorAttestationDetails;
