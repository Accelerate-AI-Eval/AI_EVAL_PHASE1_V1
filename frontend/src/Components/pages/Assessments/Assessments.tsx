import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  Plus,
  Ban,
  ClipboardList,
  Eye,
  CircleX,
  Check,
  Loader2,
  SquarePen,
  CheckCircle,
  CircleCheck,
  Target,
  Calendar,
  FileText,
  CheckCircle2,
  Search,
  Trash2,
  ChevronRight,
  Landmark,
} from "lucide-react";
import DataTable from "react-data-table-component";
import Button from "../../UI/Button";
import Modal from "../../UI/Modal";
import LoadingMessage from "../../UI/LoadingMessage";
import ClickTooltip from "../../UI/ClickTooltip";
import PreviewTable from "../../preview/PreviewTable";
import type { PreviewField } from "../../../types/preview";
import { BUYER_COTS_FIELD_KEYS } from "../../../constants/buyerCotsAssessmentKeys";
import { formatPreviewValue } from "../../../utils/formatPreviewValue";
import { formatDateDDMMMYYYY } from "../../../utils/formatDate.js";
import "../../../styles/page_tabs.css";
import "../../../styles/popovers.css";
import "../Organizations/organization.css";
import "../UserManagement/user_management.css";
import "../UserProfile/user_profile.css";
import "../VendorDirectory/VendorDirectory.css";
import "../Reports/general_reports.css";
import "../../preview/preview_table.css";
import "./assessments.css";
import { ReportsPagination } from "../Reports/ReportsPagination";
import AssessmentPreviewModalContent from "./AssessmentPreviewModalContent";
import AssessmentsLedgerPanel, {
  type LedgerRowVM,
} from "./AssessmentsLedgerPanel";

const BASE_URL = import.meta.env.VITE_BASE_URL;

/** Keys from list API that count toward progress (cots_buyer fields) */
const BUYER_COTS_PROGRESS_KEYS = [
  "businessPainPoint",
  "expectedOutcomes",
  "owningDepartment",
  "budgetRange",
  "targetTimeline",
  "criticality",
  "vendorName",
  "productName",
  "requirementGaps",
  "integrationSystems",
  "techStack",
  "digitalMaturityLevel",
  "dataGovernanceMaturity",
  "aiGovernanceBoard",
  "aiEthicsPolicy",
  "implementationTeamComposition",
  "dataSensitivity",
  "regulatoryRequirements",
  "riskAppetite",
  "decisionStakes",
  "impactedStakeholders",
  "vendorValidationApproach",
  "vendorSecurityPosture",
  "vendorCertifications",
  "pilotRolloutPlan",
  "rollbackCapability",
  "changeManagementPlan",
  "monitoringDataAvailable",
  "auditLogsAvailable",
  "testingResultsAvailable",
  "identifiedRisks",
  "riskDomainScores",
  "contextualMultipliers",
  "riskMitigation",
];

function getBuyerAssessmentProgress(row) {
  if (!row || row.type !== "cots_buyer") return 0;
  let filled = 0;
  for (const key of BUYER_COTS_PROGRESS_KEYS) {
    const v = row[key];
    if (v != null && v !== "") {
      if (typeof v === "string" && v.trim() !== "") filled++;
      else if (Array.isArray(v) && v.length > 0) filled++;
      else if (typeof v === "object") filled++;
    }
  }
  return Math.round((filled / BUYER_COTS_PROGRESS_KEYS.length) * 100);
}

const truncate = (str, max = 40) => {
  if (str == null || str === "") return "—";
  const s = String(str);
  return s.length <= max ? s : `${s.slice(0, max)}…`;
};

/** Display name of user who completed/drafted the assessment: prefer username, then first+last, then email (from list API completedBy*). */
function getCompletedByDisplay(row) {
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

/** True when assessment has an expiry date and it has passed (expiry date is before today). */
function isAssessmentExpired(row) {
  const expiryStr = row?.expiryAt;
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

/** True when the linked attestation (vendor) has an expiry date and it has passed. */
function isAttestationExpiredForAssessment(row) {
  const expiryStr = row?.attestationExpiryAt;
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

/** True when assessment is archived: either assessment expiry or linked attestation expiry has passed. */
function isAssessmentArchived(row) {
  return isAssessmentExpired(row) || isAttestationExpiredForAssessment(row);
}

/** Display status: Draft, Expired (when past expiryAt or attestation expired or DB status expired), Completed, or raw status. */
function getAssessmentStatusLabel(row) {
  if (!row) return "—";
  const s = (row.status ?? "").toLowerCase();
  if (s === "draft") return "Draft";
  if (s === "expired") return "Expired";
  if (s === "submitted" || s === "completed") {
    return isAssessmentArchived(row) ? "Expired" : "Completed";
  }
  return row.status ?? "—";
}

/** Title for assessment row (used for search filter). Uses organization name and product name. */
function getAssessmentTitle(row, isBuyerRow) {
  const org = isBuyerRow
    ? row.organizationName != null && String(row.organizationName).trim() !== ""
      ? String(row.organizationName).trim()
      : null
    : row.customerOrganizationName != null &&
        String(row.customerOrganizationName).trim() !== ""
      ? String(row.customerOrganizationName).trim()
      : null;
  const product =
    row.productName != null && String(row.productName).trim() !== ""
      ? String(row.productName).trim()
      : null;
  const parts = [org, product].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Draft";
}

/** Organization and product name from that assessment form (buyer: org = organizationName; vendor: org = customerOrganizationName). */
function getAssessmentOrgAndProduct(row, isBuyerRow) {
  const org = isBuyerRow
    ? (row.organizationName ?? "")
    : (row.customerOrganizationName ?? "");
  const product = row.productName ?? "";
  return { orgName: String(org).trim(), productName: String(product).trim() };
}

/** Single-line card title: "Organization Name - Product Name" from that assessment form, or "Draft" if both empty. */
function getAssessmentDisplayTitle(row, isBuyerRow) {
  const { orgName, productName } = getAssessmentOrgAndProduct(row, isBuyerRow);
  if (orgName === "" && productName === "") return "Draft";
  return `${orgName || "—"} - ${productName || "—"}`;
}

function formatLedgerDateLong(dateStr) {
  if (dateStr == null || String(dateStr).trim() === "") return "—";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatLedgerTime(dateStr) {
  if (dateStr == null || String(dateStr).trim() === "") return "";
  try {
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return "";
    return d
      .toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
      .replace(/\s/g, " ");
  } catch {
    return "";
  }
}

function formatExpiryDateLabel(dateStr) {
  const formatted = formatLedgerDateLong(dateStr);
  return formatted === "—" ? "Expires: —" : `Expires: ${formatted}`;
}

/** Risk score from stored assessment report (list API `reportRiskScore`). */
function getReportRiskScoreFromRow(row) {
  const raw = row?.reportRiskScore;
  if (raw == null || raw === "") return null;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Map API assessment row to ledger row view model */
function mapRowToLedgerVM(row, isBuyerRow): LedgerRowVM {
  const isDraft = (row.status || "").toLowerCase() === "draft";
  const statusLabel = getAssessmentStatusLabel(row);
  const statusKind =
    statusLabel === "Expired"
      ? "expired"
      : statusLabel === "Completed"
        ? "completed"
        : "draft";
  let progressPct = null;
  if (isDraft) {
    progressPct = isBuyerRow ? getBuyerAssessmentProgress(row) : 40;
  }
  const leadName = getCompletedByDisplay(row) || "—";
  const reportScore = getReportRiskScoreFromRow(row);
  const riskDisplay =
    isDraft || reportScore == null
      ? "Pending"
      : `${reportScore} /100`;
  const title = getAssessmentDisplayTitle(row, isBuyerRow);
  const ts = row.updatedAt ?? row.createdAt;
  const dateLine1 =
    statusKind === "expired"
      ? formatLedgerDateLong(row.expiryAt)
      : formatLedgerDateLong(ts);
  const completionLine = isDraft
    ? "In progress"
    : statusKind === "expired"
      ? formatLedgerTime(row.expiryAt) || "—"
      : formatLedgerTime(ts) || "—";
  const dateLine2 = completionLine;
  const icon = isBuyerRow ? "building" : "chip";
  let nameSubtitleLine: string;
  if (isDraft) {
    const draftTs = row.updatedAt ?? row.createdAt;
    const drafted = formatLedgerDateLong(draftTs);
    nameSubtitleLine = `Drafted on: ${drafted}`;
  } else if (statusKind === "expired") {
    nameSubtitleLine = `Completed on: ${formatLedgerDateLong(row.createdAt ?? row.updatedAt)}`;
  } else {
    nameSubtitleLine = formatExpiryDateLabel(row.expiryAt);
  }
  return {
    key: row.assessmentId,
    title,
    expiryLine: nameSubtitleLine,
    statusKind,
    progressPct,
    leadName,
    riskDisplay,
    dateLine1,
    dateLine2,
    icon,
  };
}

/** Get display value from assessment row (API shape: camelCase, arrays for jsonb) */
function getRowPreviewValue(row, key) {
  if (row == null) return undefined;
  const v = row[key];
  if (v == null || (typeof v === "string" && v.trim() === "")) return undefined;
  if (key === "createdAt" || key === "cotsUpdatedAt" || key === "expiryAt")
    return formatDateDDMMMYYYY(v);
  return v;
}

/** Format sector for preview: object -> readable string; "[object Object]" -> N/A */
function formatSectorForPreview(value) {
  if (value == null || value === "") return undefined;
  if (typeof value === "string") {
    if (value === "[object Object]") return "N/A";
    return value;
  }
  if (typeof value !== "object" || Array.isArray(value)) return value;
  const sectorMap = {
    "Public Sector": value.public_sector,
    "Private Sector": value.private_sector,
    "Non-Profit Sector": value.non_profit_sector,
  };
  const parts = [];
  Object.entries(sectorMap).forEach(([label, values]) => {
    if (Array.isArray(values) && values.length > 0) {
      parts.push(`${label}: ${values.join(", ")}`);
    }
  });
  return parts.length > 0 ? parts.join("; ") : "N/A";
}

/** Sectioned preview config for assessment row - same structure as COTS form preview */
const ASSESSMENT_PREVIEW_SECTIONS = [
  {
    title: "Assessment",
    fields: [
      {
        label: "Type",
        value: (r) =>
          r.type === "cots_buyer"
            ? "COTS Assessment"
            : r.type === "cots_vendor"
              ? "COTS Vendor"
              : (r.type ?? undefined),
      },
      { label: "Status", value: (r) => getAssessmentStatusLabel(r) },
      {
        label: "Created on",
        value: (r) =>
          formatDateDDMMMYYYY(
            (r?.status ?? "").toLowerCase() === "draft"
              ? (r.updatedAt ?? r.createdAt)
              : r.createdAt,
          ),
      },
      { label: "Expires on", value: (r) => formatDateDDMMMYYYY(r.expiryAt) },
    ],
  },
  {
    title: "Use Case",
    fields: BUYER_COTS_FIELD_KEYS.useCase.map((key) => ({
      label: key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase()),
      value: (r) => getRowPreviewValue(r, key),
    })),
  },
  {
    title: "Vendor Evaluation",
    fields: BUYER_COTS_FIELD_KEYS.vendorEvaluation.map((key) => ({
      label: key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase()),
      value: (r) => getRowPreviewValue(r, key),
    })),
  },
  {
    title: "Readiness",
    fields: BUYER_COTS_FIELD_KEYS.readiness.map((key) => ({
      label: key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase()),
      value: (r) => getRowPreviewValue(r, key),
    })),
  },
  {
    title: "Risk Profile",
    fields: BUYER_COTS_FIELD_KEYS.riskProfile.map((key) => ({
      label: key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase()),
      value: (r) => getRowPreviewValue(r, key),
    })),
  },
  {
    title: "Vendor Risk",
    fields: BUYER_COTS_FIELD_KEYS.vendorRisk.map((key) => ({
      label: key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase()),
      value: (r) => getRowPreviewValue(r, key),
    })),
  },
  {
    title: "Implementation",
    fields: BUYER_COTS_FIELD_KEYS.implementation.map((key) => ({
      label: key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase()),
      value: (r) => getRowPreviewValue(r, key),
    })),
  },
  {
    title: "Evidence",
    fields: BUYER_COTS_FIELD_KEYS.evidence.map((key) => ({
      label: key
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (s) => s.toUpperCase()),
      value: (r) => getRowPreviewValue(r, key),
    })),
  },
];

const SYSTEM_ROLES = [
  "system admin",
  "system manager",
  "system viewer",
  "system user",
];

const Assessments = () => {
  const navigate = useNavigate();
  const systemRole = (sessionStorage.getItem("systemRole") ?? "")
    .toLowerCase()
    .trim();
  const isBuyer = systemRole === "buyer";
  const isVendor = systemRole === "vendor";
  const userRole = (sessionStorage.getItem("userRole") ?? "").toLowerCase().trim();
  const isSystemUser = SYSTEM_ROLES.some((r) => r === systemRole);
  const isSystemViewer = systemRole === "system viewer" || systemRole === "system_viewer";
  const isVendorViewer = isVendor && userRole === "viewer";
  const isAssessmentViewOnly = isSystemViewer || isVendorViewer;
  const [activeTab, setActiveTab] = useState<
    "vendor" | "buyer" | "my" | "archived"
  >("vendor");
  // const titlesForPage = [
  //   vendor""{
  //    "system"
  //   }
  // ]

  useEffect(() => {
    document.title = "AI-Q | Assessments";
  }, []);

  const [assessmentsList, setAssessmentsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [previewRow, setPreviewRow] = useState(null);
  const [vendorCotsPreviewDetail, setVendorCotsPreviewDetail] = useState(null);
  const [vendorCotsPreviewLoading, setVendorCotsPreviewLoading] =
    useState(false);
  const [buyerCotsPreviewDetail, setBuyerCotsPreviewDetail] = useState(null);
  const [buyerCotsPreviewLoading, setBuyerCotsPreviewLoading] =
    useState(false);
  const [assessmentSearch, setAssessmentSearch] = useState("");
  const [showArchivedBuyer, setShowArchivedBuyer] = useState(false);
  const [showArchivedVendor, setShowArchivedVendor] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{
    assessmentId: string | number | null;
    type: "draft" | "expired" | null;
  }>({ assessmentId: null, type: null });
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  /** Pagination for assessment cards (Vendor / Buyer / My tabs). */
  const [vendorCardPage, setVendorCardPage] = useState(1);
  const [buyerCardPage, setBuyerCardPage] = useState(1);
  const [myCardPage, setMyCardPage] = useState(1);
  const [buyerArchivedCardPage, setBuyerArchivedCardPage] = useState(1);
  const [vendorArchivedCardPage, setVendorArchivedCardPage] = useState(1);
  const [assessmentCardPageSize, setAssessmentCardPageSize] = useState(10);

  const LOADER_MIN_MS = 2500; // show loader at least 2–3 seconds

  useEffect(() => {
    setVendorCardPage(1);
    setBuyerCardPage(1);
    setMyCardPage(1);
    setBuyerArchivedCardPage(1);
    setVendorArchivedCardPage(1);
  }, [assessmentSearch]);

  useEffect(() => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token) {
      setLoading(false);
      return;
    }
    const startTime = Date.now();
    const organizationId = sessionStorage.getItem("organizationId");
    const query = organizationId
      ? `?organizationId=${encodeURIComponent(organizationId)}`
      : "";
    fetch(`${BASE_URL}/assessments${query}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => {
        return res.json().then((result) => {
          if (!res.ok) {
            setFetchError(result?.message || "Failed to load assessments.");
            setAssessmentsList([]);
            return;
          }
          if (result?.data?.assessments != null) {
            setAssessmentsList(result.data.assessments);
          } else {
            setAssessmentsList([]);
          }
        });
      })
      .catch(() => {
        setFetchError("Failed to load assessments.");
        setAssessmentsList([]);
      })
      .finally(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, LOADER_MIN_MS - elapsed);
        setTimeout(() => setLoading(false), remaining);
      });
  }, []);

  const loadAssessments = () => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token) return;
    const organizationId = sessionStorage.getItem("organizationId");
    const query = organizationId
      ? `?organizationId=${encodeURIComponent(organizationId)}`
      : "";
    fetch(`${BASE_URL}/assessments${query}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.json())
      .then((result) => {
        if (result?.data?.assessments != null)
          setAssessmentsList(result.data.assessments);
        else setAssessmentsList([]);
      })
      .catch(() => setAssessmentsList([]));
  };

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") loadAssessments();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, []);

  const handleNewAssessment = () => {
    if (isBuyer) navigate("/buyerAssessment");
    else if (isVendor) navigate("/vendorcots");
  };

  // When View is opened for a vendor COTS assessment, fetch full details by ID so modal shows all fields.
  useEffect(() => {
    if (
      !previewRow ||
      previewRow.type !== "cots_vendor" ||
      !previewRow.assessmentId
    ) {
      setVendorCotsPreviewDetail(null);
      setVendorCotsPreviewLoading(false);
      return;
    }
    setVendorCotsPreviewDetail(null);
    setVendorCotsPreviewLoading(true);
    const token = sessionStorage.getItem("bearerToken");
    if (!token) {
      setVendorCotsPreviewLoading(false);
      return;
    }
    fetch(`${BASE_URL}/vendorCotsAssessment/${previewRow.assessmentId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.json())
      .then((result) => {
        if (result?.success && result?.data)
          setVendorCotsPreviewDetail(result.data);
      })
      .catch(() => {})
      .finally(() => setVendorCotsPreviewLoading(false));
  }, [previewRow?.assessmentId, previewRow?.type]);

  // Buyer COTS: fetch by ID so formula grade / IRS appear in assessment preview after submit.
  useEffect(() => {
    if (
      !previewRow ||
      previewRow.type !== "cots_buyer" ||
      !previewRow.assessmentId
    ) {
      setBuyerCotsPreviewDetail(null);
      setBuyerCotsPreviewLoading(false);
      return;
    }
    setBuyerCotsPreviewDetail(null);
    setBuyerCotsPreviewLoading(true);
    const token = sessionStorage.getItem("bearerToken");
    if (!token) {
      setBuyerCotsPreviewLoading(false);
      return;
    }
    fetch(`${BASE_URL}/buyerCotsAssessment/${previewRow.assessmentId}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.json())
      .then((result) => {
        if (result?.success && result?.data)
          setBuyerCotsPreviewDetail(result.data);
      })
      .catch(() => {})
      .finally(() => setBuyerCotsPreviewLoading(false));
  }, [previewRow?.assessmentId, previewRow?.type]);

  const handleDeleteDraft = (assessmentId: string | number) => {
    setDeleteModal({ assessmentId, type: "draft" });
    setDeleteReason("");
  };

  const handleDeleteExpired = (assessmentId: string | number) => {
    setDeleteModal({ assessmentId, type: "expired" });
    setDeleteReason("");
  };

  const closeDeleteModal = () => {
    if (!deleteSubmitting) {
      setDeleteModal({ assessmentId: null, type: null });
      setDeleteReason("");
    }
  };

  const confirmDeleteAssessment = async () => {
    const reason = (deleteReason ?? "").trim();
    if (!reason) {
      alert("Please provide a reason for deletion.");
      return;
    }
    if (deleteModal.assessmentId == null) return;
    setDeleteSubmitting(true);
    try {
      await doDeleteAssessment(deleteModal.assessmentId);
      closeDeleteModal();
    } finally {
      setDeleteSubmitting(false);
    }
  };

  async function doDeleteAssessment(assessmentId: string | number) {
    const token = sessionStorage.getItem("bearerToken");
    if (!token) return;
    try {
      const res = await fetch(`${BASE_URL}/assessments/${assessmentId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        loadAssessments();
      } else {
        alert(data.message || "Failed to delete");
      }
    } catch {
      alert("Failed to delete assessment");
    }
  }

  const showNewAssessment = isBuyer || isVendor;
  const organizationId = sessionStorage.getItem("organizationId") ?? "";
  const orgScopedList =
    isBuyer && organizationId
      ? assessmentsList.filter(
          (a) => String(a.organizationId ?? "") === String(organizationId),
        )
      : assessmentsList;
  const buyerAssessments = orgScopedList.filter((a) => a.type === "cots_buyer");
  const vendorAssessments = orgScopedList.filter(
    (a) => a.type === "cots_vendor",
  );
  const myOrgId = sessionStorage.getItem("organizationId") ?? "";
  const myAssessments = myOrgId
    ? assessmentsList.filter(
        (a) => String(a.organizationId ?? "") === String(myOrgId),
      )
    : [];

  const archivedAssessments = (
    isSystemUser ? myAssessments : orgScopedList
  ).filter((row) => isAssessmentArchived(row));
  const archivedBuyerAssessments = buyerAssessments.filter((row) =>
    isAssessmentArchived(row),
  );
  const archivedVendorAssessments = vendorAssessments.filter((row) =>
    isAssessmentArchived(row),
  );
  const nonExpiredVendor = vendorAssessments.filter(
    (row) => !isAssessmentArchived(row),
  );
  const nonExpiredBuyer = buyerAssessments.filter(
    (row) => !isAssessmentArchived(row),
  );
  const nonExpiredMy = myAssessments.filter(
    (row) => !isAssessmentArchived(row),
  );

  const buyerLedgerInProgress = buyerAssessments.filter(
    (r) =>
      !isAssessmentArchived(r) &&
      String(r.status || "").toLowerCase() === "draft",
  ).length;
  const buyerLedgerCompleted = buyerAssessments.filter(
    (r) =>
      !isAssessmentArchived(r) &&
      getAssessmentStatusLabel(r) === "Completed",
  ).length;

  const vendorLedgerInProgress = vendorAssessments.filter(
    (r) =>
      !isAssessmentArchived(r) &&
      String(r.status || "").toLowerCase() === "draft",
  ).length;
  const vendorLedgerCompleted = vendorAssessments.filter(
    (r) =>
      !isAssessmentArchived(r) &&
      getAssessmentStatusLabel(r) === "Completed",
  ).length;

  const handleBuyerLedgerView = (key: string | number) => {
    const row = buyerAssessments.find(
      (a) => String(a.assessmentId) === String(key),
    );
    if (!row) return;
    setPreviewRow(row);
  };

  const handleBuyerLedgerReport = (key: string | number) => {
    const row = buyerAssessments.find(
      (a) => String(a.assessmentId) === String(key),
    );
    if (!row) return;
    const isDraft = String(row.status || "").toLowerCase() === "draft";
    if (isDraft && !isAssessmentViewOnly) {
      navigate(`/buyerAssessment/${row.assessmentId}`);
      return;
    }
    navigate(`/buyer-vendor-risk-report/${encodeURIComponent(String(row.assessmentId))}`);
  };

  const handleVendorLedgerView = (key: string | number) => {
    const row = vendorAssessments.find(
      (a) => String(a.assessmentId) === String(key),
    );
    if (!row) return;
    setPreviewRow(row);
  };

  const handleVendorLedgerReport = async (key: string | number) => {
    const row = vendorAssessments.find(
      (a) => String(a.assessmentId) === String(key),
    );
    if (!row) return;
    const isDraft = String(row.status || "").toLowerCase() === "draft";
    if (isDraft && !isAssessmentViewOnly) {
      navigate(`/vendorcots/${row.assessmentId}`);
      return;
    }
    const token = sessionStorage.getItem("bearerToken");
    if (!token) {
      alert("Session expired. Please sign in again.");
      return;
    }
    try {
      const res = await fetch(
        `${BASE_URL}/customerRiskReports?assessmentId=${encodeURIComponent(String(row.assessmentId))}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const result = await res.json();
      const firstReportId = result?.data?.reports?.[0]?.id;
      if (firstReportId != null && String(firstReportId).trim() !== "") {
        navigate(`/reports/${encodeURIComponent(String(firstReportId))}`);
        return;
      }
      alert("Report is not available yet for this assessment.");
    } catch {
      alert("Failed to open report.");
    }
  };

  const customStyles = {
    table: {
      style: {
        width: "100%",
        backgroundColor: "#f8f8f8",
        border: "1px solid lightgray",
      },
    },
    cells: {
      style: {
        "&:last-of-type": {
          paddingRight: "12px",
        },
      },
    },
  };

  const columns = [
    {
      name: <div className="tableHeader">S.No</div>,
      selector: (row, index) => index + 1,
      sortable: true,
      width: "70px",
    },
    {
      name: <div className="tableHeader">Type</div>,
      selector: (row) =>
        row.type === "cots_buyer"
          ? "COTS Assessment"
          : row.type === "cots_vendor"
            ? "COTS Vendor"
            : (row.type ?? "—"),
      sortable: true,
    },
    {
      name: <div className="tableHeader">Status</div>,
      selector: (row) => getAssessmentStatusLabel(row),
      sortable: true,
    },
    {
      name: <div className="tableHeader">Vendor</div>,
      selector: (row) => truncate(row.vendorName, 20),
      sortable: true,
    },
    {
      name: <div className="tableHeader">Product</div>,
      selector: (row) => truncate(row.productName, 20),
      sortable: true,
    },
    {
      name: <div className="tableHeader">Use case</div>,
      selector: (row) => truncate(row.businessPainPoint, 30),
      sortable: true,
    },
    {
      name: <div className="tableHeader">Criticality</div>,
      selector: (row) => truncate(row.criticality, 15),
      sortable: true,
    },
    {
      name: <div className="tableHeader">Timeline</div>,
      selector: (row) => truncate(row.targetTimeline, 15),
      sortable: true,
    },
    {
      name: <div className="tableHeader">Budget</div>,
      selector: (row) => truncate(row.budgetRange, 15),
      sortable: true,
    },
    {
      name: <div className="tableHeader">Created on</div>,
      selector: (row) => formatDateDDMMMYYYY(row.createdAt),
      sortable: true,
    },
    {
      name: <div className="tableHeader">Expires on</div>,
      selector: (row) => formatDateDDMMMYYYY(row.expiryAt),
      cell: (row) => (
        <span className="vendor_overview_attestation_date_expiry">
          {formatDateDDMMMYYYY(row.expiryAt)}
        </span>
      ),
      sortable: true,
    },
    {
      name: <div className="tableHeader">Action</div>,
      cell: (row) => (
        <div className="actionButtons assessment_action_cell">
          <p
            className="editOrgImg assessment_view_btn"
            onClick={() => setPreviewRow(row)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && setPreviewRow(row)}
          >
            <span>
              <Eye width={16} />
            </span>
            View
          </p>
        </div>
      ),
      ignoreRowClick: true,
      width: "100px",
      minWidth: "100px",
    },
  ];

  return (
    <div className="sec_user_page org_settings_page">
      {!isBuyer && !isVendor && !isSystemUser && (
        <div
          className="org_settings_header page_header_align heading_user_page"
        >
          <div className="org_settings_headers page_header_row">
            <span className="icon_size_header" aria-hidden>
              <ClipboardList size={24} className="header_icon_svg" />
            </span>
            <div className="page_header_title_block">
              <h1 className="org_settings_title page_header_title">
                Assessments
              </h1>
              <p className="org_settings_subtitle page_header_subtitle">
                View and manage vendor and buyer assessments.
              </p>
            </div>
          </div>
        </div>
      )}

      {false && (isVendor || isSystemUser) && (
            <div className="ai_assessments_section">
              <h2>My Assessments</h2>
              <p className="section_desc">Assessments for your organization.</p>
              <div className="assessment_list_header_row">
                <p className="your_assessments_title">YOUR ASSESSMENTS</p>
                <div className="assessment_search_wrap">
                  <Search
                    size={18}
                    className="assessment_search_icon"
                    aria-hidden
                  />
                  <input
                    type="search"
                    placeholder="Search assessments…"
                    value={assessmentSearch}
                    onChange={(e) => setAssessmentSearch(e.target.value)}
                    className="assessment_search_input"
                    aria-label="Search assessments by name"
                  />
                </div>
              </div>
              {loading && <LoadingMessage message="Loading assessments…" />}
              {fetchError && (
                <p style={{ color: "#dc2626", fontSize: "0.875rem" }}>
                  {fetchError}
                </p>
              )}
              {!loading && !fetchError && (
                <div className="assessment_list_rows">
                  {(() => {
                    const q = assessmentSearch.trim().toLowerCase();
                    const filtered =
                      q === ""
                        ? nonExpiredMy
                        : nonExpiredMy.filter((row) => {
                            const isBuyerRow =
                              (row.type || "").toLowerCase() === "cots_buyer";
                            return getAssessmentTitle(row, isBuyerRow)
                              .toLowerCase()
                              .includes(q);
                          });
                    if (filtered.length === 0) {
                      return (
                        <p className="assessment_search_no_results">
                          {nonExpiredMy.length === 0
                            ? "No assessments yet."
                            : "No assessments match your search."}
                        </p>
                      );
                    }
                    const start = (myCardPage - 1) * assessmentCardPageSize;
                    const paginated = filtered.slice(
                      start,
                      start + assessmentCardPageSize,
                    );
                    return (
                      <>
                        <div className="general_rpr_cards_sec vendor_directory_grid">
                          {paginated.map((row) => {
                            const isBuyerRow =
                              (row.type || "").toLowerCase() === "cots_buyer";
                            const isDraft =
                              (row.status || "").toLowerCase() === "draft";
                            const statusLabel = getAssessmentStatusLabel(row);
                            const archived = statusLabel === "Expired";
                            const title = getAssessmentDisplayTitle(
                              row,
                              isBuyerRow,
                            );
                            const accent = isBuyerRow ? "sales" : "risk";
                            const statusDisplay =
                              (statusLabel || "").toUpperCase();
                            const statusHeaderClass =
                              statusLabel === "Completed"
                                ? "assessment_card_status_completed"
                                : statusLabel === "Expired"
                                  ? "assessment_card_status_expired"
                                  : "assessment_card_status_draft";
                            return (
                              <article
                                key={row.assessmentId}
                                className={`vendor_directory_card general_rpr_card${archived ? " general_rpr_card_archived" : ""}`}
                                data-accent={accent}
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
                                        {statusLabel === "Completed" && (
                                          <span className="assessment_card_header_expiry">
                                            Expires on:{" "}
                                            {formatDateDDMMMYYYY(row.expiryAt)}
                                          </span>
                                        )}
                                      </span>
                                    </p>
                                  </div>
                                  <span className="general_rpr_card_download_wrap">
                                    {isDraft && !isAssessmentViewOnly ? (
                                      <button
                                        type="button"
                                        className="general_rpr_card_download_btn assessment_card_header_action_btn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          navigate(
                                            isBuyerRow
                                              ? `/buyerAssessment/${row.assessmentId}`
                                              : `/vendorcots/${row.assessmentId}`,
                                          );
                                        }}
                                        aria-label={`Edit assessment: ${title}`}
                                        title="Edit"
                                      >
                                        <SquarePen size={14} aria-hidden />
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className="general_rpr_card_download_btn assessment_card_header_action_btn"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPreviewRow(row);
                                        }}
                                        aria-label={`View assessment: ${title}`}
                                        title="View"
                                      >
                                        <Eye size={14} aria-hidden />
                                      </button>
                                    )}
                                  </span>
                                </div>
                                <div className="general_rpr_title">
                                  <div className="vendor_directory_card_header_text">
                                    <ClickTooltip
                                      content={title}
                                      position="top"
                                      showOn="hover"
                                    >
                                      <span className="general_rpr_card_title_wrap">
                                        <h2 className="vendor_directory_card_name general_rpr_card_title_clamp">
                                          {title}
                                        </h2>
                                      </span>
                                    </ClickTooltip>
                                  </div>
                                </div>
                                <div className="general_rpr_card_footer">
                                  <div className="general_rpr_card_dates">
                                    <div className="general_rpr_card_date_row">
                                      <span className="general_rpr_card_date_label_expiry">
                                        {isDraft
                                          ? "Drafted by:"
                                          : "Completed by:"}
                                      </span>
                                      <span className="general_rpr_card_date_value_expiry">
                                        {getCompletedByDisplay(row) || "—"}
                                      </span>
                                    </div>
                                    {!isDraft && (
                                      <div className="general_rpr_card_date_row">
                                        <span className="general_rpr_card_date_label_expiry">
                                          Created on:
                                        </span>
                                        <span className="general_rpr_card_date_value_expiry">
                                          {formatDateDDMMMYYYY(row.createdAt)}
                                        </span>
                                      </div>
                                    )}
                                    {(archived || isDraft) && (
                                      <div className="general_rpr_card_date_row">
                                        {archived ? (
                                          <span className="general_rpr_card_status general_rpr_card_status_archived">
                                            Archived
                                          </span>
                                        ) : (
                                          <>
                                            <span className="general_rpr_card_date_label_expiry">
                                              Drafted on:
                                            </span>
                                            <span className="general_rpr_card_date_value_expiry">
                                              {formatDateDDMMMYYYY(
                                                row.updatedAt ?? row.createdAt,
                                              )}
                                            </span>
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                        <ReportsPagination
                          totalItems={filtered.length}
                          currentPage={myCardPage}
                          pageSize={assessmentCardPageSize}
                          onPageChange={setMyCardPage}
                          onPageSizeChange={(size) => {
                            setAssessmentCardPageSize(size);
                            setMyCardPage(1);
                          }}
                        />
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
          {false && activeTab === "archived" && (
            <div className="ai_assessments_section">
              <h2>Archived</h2>
              <p className="section_desc">
                Expired assessments. You can delete them permanently.
              </p>
              <div className="assessment_list_header_row">
                <p className="your_assessments_title">YOUR ASSESSMENTS</p>
                <div className="assessment_search_wrap">
                  <Search
                    size={18}
                    className="assessment_search_icon"
                    aria-hidden
                  />
                  <input
                    type="search"
                    placeholder="Search archived…"
                    value={assessmentSearch}
                    onChange={(e) => setAssessmentSearch(e.target.value)}
                    className="assessment_search_input"
                    aria-label="Search archived assessments"
                  />
                </div>
              </div>
              {loading && <LoadingMessage message="Loading assessments…" />}
              {fetchError && (
                <p style={{ color: "#dc2626", fontSize: "0.875rem" }}>
                  {fetchError}
                </p>
              )}
              {!loading && !fetchError && (
                <div className="assessment_list_rows">
                  {(() => {
                    const q = assessmentSearch.trim().toLowerCase();
                    const filtered =
                      q === ""
                        ? archivedAssessments
                        : archivedAssessments.filter((row) => {
                            const isBuyerRow =
                              (row.type || "").toLowerCase() === "cots_buyer";
                            return getAssessmentTitle(row, isBuyerRow)
                              .toLowerCase()
                              .includes(q);
                          });
                    if (filtered.length === 0)
                      return (
                        <p className="assessment_search_no_results">
                          {archivedAssessments.length === 0
                            ? "No archived assessments."
                            : "No archived assessments match your search."}
                        </p>
                      );
                    return filtered.map((row) => {
                      const isBuyerRow =
                        (row.type || "").toLowerCase() === "cots_buyer";
                      const completedBy = getCompletedByDisplay(row) || "—";
                      return (
                        <div
                          key={row.assessmentId}
                          className="vendor_overview_attestation_row"
                        >
                          <FileText
                            size={24}
                            className="vendor_overview_attestation_icon vendor_overview_attestation_icon_expired"
                            aria-hidden
                          />
                          <div className="vendor_overview_attestation_content">
                            <p className="vendor_overview_attestation_name">
                              {truncate(
                                getAssessmentDisplayTitle(row, isBuyerRow),
                                60,
                              )}
                            </p>
                            <p className="vendor_overview_attestation_status_label vendor_overview_attestation_status_label_expired">
                              Expired
                            </p>
                            <p className="vendor_overview_attestation_by">
                              Completed by: {completedBy}
                            </p>
                            <div className="vendor_overview_attestation_date_row">
                              <p className="vendor_overview_attestation_date">
                                Created on: {formatDateDDMMMYYYY(row.createdAt)}
                              </p>
                              <p className="vendor_overview_attestation_date vendor_overview_attestation_date_expiry">
                                Expires on: {formatDateDDMMMYYYY(row.expiryAt)}
                              </p>
                            </div>
                          </div>

                          {/* <div className="vendor_overview_attestation_actions">
                            <button
                              type="button"
                              className="vendor_overview_btn_view vendor_overview_btn_danger"
                              // onClick={() => handleDeleteExpired(row.assessmentId)}
                              aria-label="Delete assessment"
                            >
                              <Trash2 size={16} aria-hidden />
                              Delete
                            </button>
                          </div> */}
                        </div>
                      );
                    });
                  })()}
                </div>
              )}
            </div>
          )}

      {isBuyer && (
        <div className="ai_assessments_page">
          {(() => {
            const q = assessmentSearch.trim().toLowerCase();
            const base = showArchivedBuyer
              ? archivedBuyerAssessments
              : nonExpiredBuyer;
            const filtered =
              q === ""
                ? base
                : base.filter((row) =>
                    getAssessmentTitle(row, true).toLowerCase().includes(q),
                  );
            const emptyMessage = showArchivedBuyer
              ? archivedBuyerAssessments.length === 0
                ? "No archived assessments."
                : "No archived assessments match your search."
              : nonExpiredBuyer.length === 0
                ? "No assessments yet."
                : "No assessments match your search.";
            const currentPage = showArchivedBuyer
              ? buyerArchivedCardPage
              : buyerCardPage;
            const setPage = showArchivedBuyer
              ? setBuyerArchivedCardPage
              : setBuyerCardPage;
            const start = (currentPage - 1) * assessmentCardPageSize;
            const paginated = filtered.slice(
              start,
              start + assessmentCardPageSize,
            );
            const ledgerRows = paginated.map((row) =>
              mapRowToLedgerVM(row, true),
            );
            return (
              <AssessmentsLedgerPanel
                inProgressCount={buyerLedgerInProgress}
                completedCount={buyerLedgerCompleted}
                showArchived={showArchivedBuyer}
                onShowArchivedChange={setShowArchivedBuyer}
                search={assessmentSearch}
                onSearchChange={setAssessmentSearch}
                loading={loading}
                fetchError={fetchError}
                emptyMessage={emptyMessage}
                rows={ledgerRows}
                totalFiltered={filtered.length}
                currentPage={currentPage}
                pageSize={assessmentCardPageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setAssessmentCardPageSize(size);
                  setPage(1);
                }}
                onRowViewAction={handleBuyerLedgerView}
                onRowReportAction={handleBuyerLedgerReport}
                showNewAssessment={!isAssessmentViewOnly}
                onNewAssessment={handleNewAssessment}
                newAssessmentLabel="Assessment"
              />
            );
          })()}
        </div>
      )}

      {(isVendor || isSystemUser) && (
        <div className="ai_assessments_page">
          {(() => {
            const q = assessmentSearch.trim().toLowerCase();
            const base = showArchivedVendor
              ? archivedVendorAssessments
              : nonExpiredVendor;
            const filtered =
              q === ""
                ? base
                : base.filter((row) =>
                    getAssessmentTitle(row, false).toLowerCase().includes(q),
                  );
            const emptyMessage = showArchivedVendor
              ? archivedVendorAssessments.length === 0
                ? "No archived assessments."
                : "No archived assessments match your search."
              : nonExpiredVendor.length === 0
                ? "No vendor assessments yet."
                : "No assessments match your search.";
            const currentPage = showArchivedVendor
              ? vendorArchivedCardPage
              : vendorCardPage;
            const setPage = showArchivedVendor
              ? setVendorArchivedCardPage
              : setVendorCardPage;
            const start = (currentPage - 1) * assessmentCardPageSize;
            const paginated = filtered.slice(
              start,
              start + assessmentCardPageSize,
            );
            const ledgerRows = paginated.map((row) =>
              mapRowToLedgerVM(row, false),
            );
            return (
              <AssessmentsLedgerPanel
                inProgressCount={vendorLedgerInProgress}
                completedCount={vendorLedgerCompleted}
                showArchived={showArchivedVendor}
                onShowArchivedChange={setShowArchivedVendor}
                search={assessmentSearch}
                onSearchChange={setAssessmentSearch}
                loading={loading}
                fetchError={fetchError}
                emptyMessage={emptyMessage}
                rows={ledgerRows}
                totalFiltered={filtered.length}
                currentPage={currentPage}
                pageSize={assessmentCardPageSize}
                onPageChange={setPage}
                onPageSizeChange={(size) => {
                  setAssessmentCardPageSize(size);
                  setPage(1);
                }}
                onRowViewAction={handleVendorLedgerView}
                onRowReportAction={handleVendorLedgerReport}
                showNewAssessment={!isAssessmentViewOnly}
                onNewAssessment={() => navigate("/vendorcots")}
                newAssessmentLabel="Customer Assessment"
              />
            );
          })()}
        </div>
      )}

      {!isBuyer && !isVendor && !isSystemUser && (
        <div className="table_user_page">
          <div className="orgDataTable">
            {loading && <LoadingMessage message="Loading assessments…" />}
            {fetchError && (
              <p style={{ color: "#dc2626", padding: "1rem 0" }}>
                {fetchError}
              </p>
            )}
            {!loading && !fetchError && assessmentsList.length === 0 && (
              <p style={{ color: "#64748b", padding: "1rem 0" }}>
                No assessments yet. Create one using the button above.
              </p>
            )}
            {!loading && assessmentsList.length > 0 && (
              <DataTable
                customStyles={customStyles}
                columns={columns}
                data={assessmentsList}
                pagination
                persistTableHead
              />
            )}
          </div>
        </div>
      )}

      {previewRow && (
        <div
          className="vendor_attestation_preview_modal_overlay"
          onClick={() => {
            setPreviewRow(null);
            setVendorCotsPreviewDetail(null);
            setBuyerCotsPreviewDetail(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="assessment_preview_modal_title"
        >
          <div
            className="vendor_attestation_preview_modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="vendor_attestation_preview_modal_header">
              <h2 id="assessment_preview_modal_title">Assessment details</h2>
              <button
                type="button"
                className="modal_close_btn"
                onClick={() => {
                  setPreviewRow(null);
                  setVendorCotsPreviewDetail(null);
                  setBuyerCotsPreviewDetail(null);
                }}
                aria-label="Close"
              >
                <CircleX size={20} />
              </button>
            </div>
            <div className="vendor_attestation_preview_modal_body">
              <AssessmentPreviewModalContent
                previewRow={previewRow}
                vendorDetail={vendorCotsPreviewDetail}
                vendorLoading={vendorCotsPreviewLoading}
                buyerDetail={buyerCotsPreviewDetail}
                buyerLoading={buyerCotsPreviewLoading}
              />
            </div>
          </div>
        </div>
      )}

      <Modal
        isOpen={deleteModal.assessmentId != null}
        onClose={closeDeleteModal}
        overlayClassName="profile_modal_overlay"
        popupClassName=""
      >
        <div className="profile_modal_content settings_modal_content assessment_delete_modal_content">
          <div className="profile_modal_header">
            <h2
              id="assessment_delete_modal_title"
              className="profile_modal_title"
            >
              Delete assessment
            </h2>
            <button
              type="button"
              className="modal_close_btn"
              onClick={closeDeleteModal}
              disabled={deleteSubmitting}
              aria-label="Close"
            >
              <CircleX size={20} />
            </button>
          </div>
          <div className="profile_modal_body">
            <p className="assessment_delete_modal_subtitle">
              {deleteModal.assessmentId != null
                ? (() => {
                    const row = assessmentsList.find(
                      (a) =>
                        String(a.assessmentId) ===
                        String(deleteModal.assessmentId),
                    );
                    return row
                      ? getAssessmentDisplayTitle(
                          row,
                          row.type === "cots_buyer",
                        )
                      : "Assessment";
                  })()
                : ""}
            </p>
            <p className="assessment_delete_modal_message">
              {deleteModal.type === "draft"
                ? "Permanently delete this draft assessment? This cannot be undone."
                : "Permanently delete this expired assessment? This cannot be undone."}
            </p>
            <div className="settings_form_row">
              <div className="settings_form_group" style={{ flex: "1 1 100%" }}>
                <label htmlFor="assessment_delete_reason">
                  Reason for deletion{" "}
                  <span className="assessment_delete_required">*</span>
                </label>
                <textarea
                  id="assessment_delete_reason"
                  className="settings_input"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Please provide a reason..."
                  rows={3}
                  disabled={deleteSubmitting}
                  style={{ resize: "none", minHeight: "4em" }}
                />
              </div>
            </div>
            <div className="settings_form_actions">
              <Button
                type="button"
                className="orgCancelBtn"
                onClick={closeDeleteModal}
                disabled={deleteSubmitting}
              >
                <Ban size={16} aria-hidden />
                Cancel
              </Button>
              <Button
                type="button"
                className="assessment_delete_confirm_btn orgCreateBtn"
                onClick={confirmDeleteAssessment}
                disabled={deleteSubmitting || !deleteReason.trim()}
              >
                {deleteSubmitting ? (
                  <>
                    Deleting…
                    <Loader2 size={18} className="auth_spinner" aria-hidden />
                  </>
                ) : (
                  <>
                    <Trash2 size={16} aria-hidden />
                    Delete
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

export { Assessments as default };

