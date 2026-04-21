import React from "react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Select from "../../UI/Select";
import { CircleX, Loader2 } from "lucide-react";
import Modal from "../../UI/Modal";
import LoadingMessage from "../../UI/LoadingMessage";
import './general_reports.css'
import GeneralReportsTypesPopup, {
  REPORT_TYPE_ERROR,
} from "./GeneralReportsTypesPopup";
import Button from "../../UI/Button";
import GeneralReportsCards from "./GeneralReportsCards";
import { ReportsPagination } from "./ReportsPagination";
import "../VendorAttestations/vendor_attestation_preview.css";

const BASE_URL =
  import.meta.env.VITE_BASE_URL ?? "http://localhost:5003/api/v1";

/** Same minimum loader duration as Complete Reports on `Reports.tsx`. */
const LOADER_MIN_MS = 2500;

interface AssessmentRow {
  assessmentId: number;
  type: string;
  status: string;
  organizationId?: string | null;
  vendorAttestationId?: string | null;
  vendorProductName?: string | null;
  productName?: string | null;
  vendorName?: string | null;
  customerOrganizationName?: string | null;
  customerSector?: string | null;
  product_in_scope?: string | null;
  productInScope?: string | null;
  expiryAt?: string | null;
  /** When in the past, linked attestation is expired (exclude from dropdown). */
  attestationExpiryAt?: string | null;
  /** User who completed this assessment (buyer: b.user_id; vendor: v.user_id). Used to filter "only his assessments" for buyer engineer. */
  completedByUserId?: string | number | null;
  organizationName?: string | null;
  [key: string]: unknown;
}

function isAssessmentExpired(row: AssessmentRow): boolean {
  const expiryAt = row.expiryAt;
  if (expiryAt == null || String(expiryAt).trim() === "") return false;
  const expiry = new Date(expiryAt);
  if (Number.isNaN(expiry.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return expiry.getTime() < today.getTime();
}

function isAttestationExpired(row: AssessmentRow): boolean {
  const attestationExpiryAt = row.attestationExpiryAt;
  if (attestationExpiryAt == null || String(attestationExpiryAt).trim() === "") return false;
  const expiry = new Date(attestationExpiryAt);
  if (Number.isNaN(expiry.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return expiry.getTime() < today.getTime();
}

export interface GeneratedReportItem {
  id: string;
  assessmentId: string;
  assessmentLabel: string;
  reportType: string;
  generatedAt: string;
  /** Markdown for most types; JSON string or object for Vendor Comparison Matrix. */
  briefContent?: string | Record<string, unknown>;
  /** When in the past, report is archived (assessment expired). */
  expiryAt?: string | null;
  /** When in the past, report is archived (linked attestation expired). */
  attestationExpiryAt?: string | null;
}

function isGeneralReportArchived(report: GeneratedReportItem): boolean {
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

/** Minimal shape for a complete (customer risk) report – used for buyer engineer dropdown. */
interface CompleteReportItem {
  id: string;
  assessmentId: string;
  title: string;
  createdAt: string;
  expiryAt?: string | null;
  attestationExpiryAt?: string | null;
}

function isCompleteReportArchived(report: CompleteReportItem): boolean {
  const expiryAt = report.expiryAt;
  const attestationExpiryAt = report.attestationExpiryAt;
  const assessmentExpired =
    expiryAt != null &&
    String(expiryAt).trim() !== "" &&
    !Number.isNaN(new Date(expiryAt).getTime()) &&
    new Date(expiryAt).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
  const attestationExpired =
    attestationExpiryAt != null &&
    String(attestationExpiryAt).trim() !== "" &&
    !Number.isNaN(new Date(attestationExpiryAt).getTime()) &&
    new Date(attestationExpiryAt).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
  return assessmentExpired || attestationExpired;
}

function getCompleteReportDropdownTitle(fullTitle: string): string {
  if (!fullTitle || typeof fullTitle !== "string") return fullTitle || "—";
  return fullTitle.replace(/^Analysis Report:\s*/i, "").trim() || fullTitle;
}

interface GeneralReportsProps {
  /** Search filter from Reports page (org name, product name, published, archived). */
  searchQuery?: string;
  /** When true, show only archived reports; when false, only current; when undefined, show all (filter by search). */
  showArchivedOnly?: boolean;
  /** When true, hide the "Select a vendor assessment" dropdown (e.g. on Archived tab). */
  hideDropdown?: boolean;
  /** When set (e.g. on Archived tab), use this page size and show pagination for archived list. */
  archivedPageSize?: number;
  /** When true and showArchivedOnly, do not render list/pagination here; parent renders combined list. */
  renderArchivedListOnly?: boolean;
  /** When showArchivedOnly and renderArchivedListOnly, called with the archived general reports list for parent to combine. */
  onArchivedReportsChange?: (reports: GeneratedReportItem[]) => void;
  /** When false, hide the assessment dropdown and report generation (e.g. System Manager / System Viewer view-only). */
  canGenerateReports?: boolean;
}

const GeneralReports = ({ searchQuery = "", showArchivedOnly, hideDropdown, archivedPageSize, renderArchivedListOnly, onArchivedReportsChange, canGenerateReports = true }: GeneralReportsProps) => {
  /** Full-page style loader only on Assessment Analysis tab (`showArchivedOnly` false), not on Archived helper instance. */
  const [loading, setLoading] = useState(() => showArchivedOnly !== true);
  const [assessmentsList, setAssessmentsList] = useState<AssessmentRow[]>([]);
  /** For buyer engineer: list of complete reports (customerRiskReports) so dropdown shows "completed reports" not assessments. */
  const [completeReports, setCompleteReports] = useState<CompleteReportItem[]>([]);
  const [selectedAssessmentId, setSelectedAssessmentId] = useState("");
  const [isTypeReportPopupOpen, setIsTypeReportPopupOpen] = useState(false);
  const [selectedReportType, setSelectedReportType] = useState("");
  const [reportError, setReportError] = useState("");
  const [assessmentIdForReport, setAssessmentIdForReport] = useState("");
  const [alreadyGeneratedError, setAlreadyGeneratedError] = useState("");
  const [generatedReports, setGeneratedReports] = useState<
    GeneratedReportItem[]
  >([]);
  const [briefGenerating, setBriefGenerating] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [generalReportsPage, setGeneralReportsPage] = useState(1);
  const [generalReportsPageSize, setGeneralReportsPageSize] = useState(10);
  const navigate = useNavigate();

  const archivedGeneralList = React.useMemo(() => {
    if (!showArchivedOnly) return [];
    let list = generatedReports.filter((r) => isGeneralReportArchived(r));
    const q = searchQuery.trim().toLowerCase();
    if (q === "published") list = list.filter((r) => !isGeneralReportArchived(r));
    else if (q === "archived") list = list.filter((r) => isGeneralReportArchived(r));
    else if (q) {
      list = list.filter((r) => {
        const label = (r.assessmentLabel ?? "").toLowerCase();
        const reportType = (r.reportType ?? "").toLowerCase();
        return label.includes(q) || reportType.includes(q);
      });
    }
    return list;
  }, [showArchivedOnly, generatedReports, searchQuery]);

  useEffect(() => {
    if (showArchivedOnly && onArchivedReportsChange) {
      onArchivedReportsChange(archivedGeneralList);
    }
  }, [showArchivedOnly, onArchivedReportsChange, archivedGeneralList]);

  useEffect(() => {
    setGeneralReportsPage(1);
  }, [searchQuery, showArchivedOnly]);

  function getVendorAssessmentLabel(a: AssessmentRow): string {
    const org = (a.customerOrganizationName ?? "").toString().trim();
    const productInScope = (a.product_in_scope ?? a.productInScope ?? "")
      .toString()
      .trim();
    if (org && productInScope) return `${org} and ${productInScope}`;
    if (org) return org;
    if (productInScope) return productInScope;
    const product = (a.productName ?? "").toString().trim();
    const vendor = (a.vendorName ?? "").toString().trim();
    if (product && vendor) return `${product} – ${vendor}`;
    if (product) return product;
    if (vendor) return vendor;
    return `Vendor assessment #${a.assessmentId}`;
  }

  function getBuyerAssessmentLabel(a: AssessmentRow): string {
    const org = (a.organizationName ?? "").toString().trim();
    const product = (a.productName ?? "").toString().trim();
    const vendor = (a.vendorName ?? "").toString().trim();
    if (org && product) return `${org} - ${product}`;
    if (org && vendor) return `${org} - ${vendor}`;
    if (org) return org;
    if (product) return product;
    if (vendor) return vendor;
    return `Buyer assessment #${a.assessmentId}`;
  }

  /** Assessments, general reports, and (buyer engineer) complete reports in parallel; tab loader matches Complete Reports. */
  useEffect(() => {
    let cancelled = false;
    let loadEndTimeoutId: ReturnType<typeof window.setTimeout> | undefined;
    const tabUsesFullLoader = showArchivedOnly !== true;

    const token = sessionStorage.getItem("bearerToken");
    const systemRole = (sessionStorage.getItem("systemRole") ?? "").toLowerCase().trim().replace(/_/g, " ");
    const userRole = (sessionStorage.getItem("userRole") ?? "").toLowerCase().trim();
    const organizationId = (sessionStorage.getItem("organizationId") ?? "").trim();
    const isSystemManagerOrViewer = systemRole === "system manager" || systemRole === "system viewer";
    const grQuery = isSystemManagerOrViewer && organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
    const assessmentsQuery = organizationId
      ? `?organizationId=${encodeURIComponent(organizationId)}`
      : "";

    if (!token) {
      setAssessmentsList([]);
      setGeneratedReports([]);
      setCompleteReports([]);
      if (tabUsesFullLoader) setLoading(false);
      return;
    }

    if (tabUsesFullLoader) setLoading(true);
    const loadStart = Date.now();

    const finishTabLoading = () => {
      if (!tabUsesFullLoader || cancelled) return;
      const elapsed = Date.now() - loadStart;
      const remaining = Math.max(0, LOADER_MIN_MS - elapsed);
      loadEndTimeoutId = window.setTimeout(() => {
        if (!cancelled) setLoading(false);
      }, remaining);
    };

    const assessmentsPromise = fetch(`${BASE_URL}/assessments${assessmentsQuery}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    })
      .then((res) => res.json())
      .then((result) => {
        if (result?.data?.assessments != null) {
          setAssessmentsList(result.data.assessments as AssessmentRow[]);
        } else {
          setAssessmentsList([]);
        }
      })
      .catch(() => setAssessmentsList([]));

    const generalReportsPromise = fetch(`${BASE_URL}/generalReports${grQuery}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && Array.isArray(data?.data?.reports)) {
          const list = data.data.reports.map(
            (r: {
              id: string;
              assessmentId: string;
              assessmentLabel?: string;
              reportType: string;
              generatedAt: string;
              briefContent?: string;
              expiryAt?: string | null;
              attestationExpiryAt?: string | null;
            }) => ({
              id: r.id,
              assessmentId: r.assessmentId,
              assessmentLabel: r.assessmentLabel ?? "",
              reportType: r.reportType,
              generatedAt: r.generatedAt,
              briefContent: r.briefContent,
              expiryAt: r.expiryAt ?? null,
              attestationExpiryAt: r.attestationExpiryAt ?? null,
            }),
          );
          setGeneratedReports(list);
        } else {
          setGeneratedReports([]);
        }
      })
      .catch(() => setGeneratedReports([]));

    const completeReportsPromise =
      systemRole === "buyer" && userRole === "engineer"
        ? fetch(`${BASE_URL}/customerRiskReports`, {
            headers: { Authorization: `Bearer ${token}` },
          })
            .then((res) => res.json())
            .then((data) => {
              if (data?.success && Array.isArray(data?.data?.reports)) {
                const list = data.data.reports.map(
                  (r: {
                    id: string;
                    assessmentId: string;
                    title?: string;
                    createdAt?: string;
                    expiryAt?: string | null;
                    attestationExpiryAt?: string | null;
                  }) => ({
                    id: r.id,
                    assessmentId: String(r.assessmentId),
                    title: r.title ?? "",
                    createdAt: r.createdAt ?? "",
                    expiryAt: r.expiryAt ?? null,
                    attestationExpiryAt: r.attestationExpiryAt ?? null,
                  }),
                );
                setCompleteReports(list);
              } else {
                setCompleteReports([]);
              }
            })
            .catch(() => setCompleteReports([]))
        : Promise.resolve().then(() => {
            setCompleteReports([]);
          });

    Promise.all([assessmentsPromise, generalReportsPromise, completeReportsPromise]).finally(() => {
      finishTabLoading();
    });

    return () => {
      cancelled = true;
      if (loadEndTimeoutId != null) window.clearTimeout(loadEndTimeoutId);
    };
  }, [showArchivedOnly]);

  const systemRole = (sessionStorage.getItem("systemRole") ?? "").toLowerCase().trim().replace(/_/g, " ");
  const userRole = (sessionStorage.getItem("userRole") ?? "").toLowerCase().trim();
  const currentUserId = (sessionStorage.getItem("userId") ?? "").toString().trim();

  const completedVendorAssessments = assessmentsList.filter(
    (a) =>
      (a.type ?? "").toLowerCase() === "cots_vendor" &&
      (a.status ?? "").toLowerCase() !== "draft" &&
      !isAssessmentExpired(a) &&
      !isAttestationExpired(a),
  );

  const completedBuyerAssessments = assessmentsList.filter(
    (a) =>
      (a.type ?? "").toLowerCase() === "cots_buyer" &&
      (a.status ?? "").toLowerCase() !== "draft" &&
      !isAssessmentExpired(a) &&
      !isAttestationExpired(a),
  );

  // Buyer engineer: show only assessments completed by this user (user-scoped dropdown).
  const isBuyerEngineer = systemRole === "buyer" && userRole === "engineer";
  const assessmentsForDropdown =
    systemRole === "buyer"
      ? isBuyerEngineer
        ? completedBuyerAssessments.filter((a) => {
            const by = a.completedByUserId;
            if (by == null) return false;
            return String(by).trim() === currentUserId;
          })
        : completedBuyerAssessments
      : completedVendorAssessments;

  const engineerAssessmentIds = new Set(
    assessmentsForDropdown.map((a) => String(a.assessmentId))
  );

  // Buyer engineer: only assessments that have a complete report and were created by this user; dropdown shows that user's assessments (assessment labels).
  const completedReportsForEngineer = isBuyerEngineer
    ? completeReports.filter(
        (r) =>
          engineerAssessmentIds.has(String(r.assessmentId)) &&
          !isCompleteReportArchived(r)
      )
    : [];

  const engineerAssessmentIdToOption = React.useMemo(() => {
    if (!isBuyerEngineer || assessmentsForDropdown.length === 0) return new Map<string, { value: string; label: string }>();
    const map = new Map<string, { value: string; label: string }>();
    const seenIds = new Set<string>();
    for (const r of completedReportsForEngineer) {
      const id = String(r.assessmentId);
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      const assessment = assessmentsForDropdown.find((a) => String(a.assessmentId) === id);
      const label = assessment ? getBuyerAssessmentLabel(assessment) : getCompleteReportDropdownTitle(r.title) || `Assessment ${id}`;
      map.set(id, { value: id, label });
    }
    return map;
  }, [isBuyerEngineer, completedReportsForEngineer, assessmentsForDropdown]);

  // Dropdown: for buyer engineer show that user's assessments (only those with a complete report); otherwise use assessments.
  const selectOptions = isBuyerEngineer
    ? Array.from(engineerAssessmentIdToOption.values())
    : assessmentsForDropdown.map((a) => {
        if ((a.type ?? "").toLowerCase() === "cots_buyer") {
          const label = getBuyerAssessmentLabel(a);
          return { value: String(a.assessmentId), label };
        }
        const orgName = (a.customerOrganizationName ?? "").toString().trim();
        const productName = (a.vendorProductName ?? a.productName ?? "").toString().trim();
        const label =
          orgName && productName
            ? `${orgName} - ${productName}`
            : productName || orgName || getVendorAssessmentLabel(a);
        return {
          value: String(a.assessmentId),
          label,
        };
      });

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setAssessmentIdForReport(value);
    setSelectedAssessmentId("");
    setReportError("");
    setIsTypeReportPopupOpen(true);
  };

  const handleCloseModal = () => {
    if (!selectedReportType.trim()) {
      setReportError(REPORT_TYPE_ERROR);
    }
    setSelectedReportType("");
    setAssessmentIdForReport("");
    setAlreadyGeneratedError("");
    setIsTypeReportPopupOpen(false);
  };

  /** Same "already generated" message used for all report types. */
  const ALREADY_GENERATED_MSG =
    "This report is already generated. You can generate another type of report.";

  /** For already-exists check: "Qualification" is legacy for "Sales Qualification Report". */
  const reportTypeMatches = (stored: string, selected: string): boolean => {
    if (stored === selected) return true;
    if (
      (stored === "Qualification" || stored === "Sales Qualification Report") &&
      (selected === "Qualification" || selected === "Sales Qualification Report")
    )
      return true;
    return false;
  };

  const handleGenerateReport = async (reportType: string) => {
    const assessmentId = assessmentIdForReport.trim();
    if (reportType === "Executive Stakeholder Brief") {
      const alreadyExists = generatedReports.some(
        (r) => r.assessmentId === assessmentId && r.reportType === reportType,
      );
      if (alreadyExists) {
        setAlreadyGeneratedError(ALREADY_GENERATED_MSG);
        return;
      }
      setReportError("");
      setAlreadyGeneratedError("");
      setBriefError(null);
      setSelectedReportType("");
      setIsTypeReportPopupOpen(false);
      setBriefGenerating(true);
      const token = sessionStorage.getItem("bearerToken");
      if (!token) {
        setBriefError("Please log in to generate the brief.");
        setBriefGenerating(false);
        return;
      }
      const option = selectOptions.find((o) => o.value === assessmentId);
      const assessmentLabel = option?.label ?? `Assessment ${assessmentId}`;
      try {
        const res = await fetch(`${BASE_URL}/executiveStakeholderBrief`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ assessmentId, assessmentLabel }),
        });
        const data = await res.json();
        if (data?.success && data?.data?.report) {
          const report = data.data.report;
          const newReport: GeneratedReportItem = {
            id: report.id,
            assessmentId: report.assessmentId,
            assessmentLabel: report.assessmentLabel ?? assessmentLabel,
            reportType: report.reportType,
            generatedAt: report.generatedAt,
            briefContent: report.briefContent,
          };
          setGeneratedReports((prev) => [...prev, newReport]);
        } else {
          setBriefError(data?.message ?? "Failed to generate Executive Stakeholder Brief.");
        }
      } catch {
        setBriefError("Failed to generate Executive Stakeholder Brief. Please try again.");
      } finally {
        setBriefGenerating(false);
        setAssessmentIdForReport("");
      }
      return;
    }
    if (reportType === "Sales Qualification Report") {
      const alreadyExists = generatedReports.some(
        (r) =>
          r.assessmentId === assessmentId &&
          reportTypeMatches(r.reportType, reportType),
      );
      if (alreadyExists) {
        setAlreadyGeneratedError(ALREADY_GENERATED_MSG);
        return;
      }
      setReportError("");
      setAlreadyGeneratedError("");
      setSelectedReportType("");
      setIsTypeReportPopupOpen(false);
      setBriefGenerating(true);
      const token = sessionStorage.getItem("bearerToken");
      if (!token) {
        setBriefError("Please log in to generate the report.");
        setBriefGenerating(false);
        return;
      }
      const option = selectOptions.find((o) => o.value === assessmentId);
      const assessmentLabel = option?.label ?? `Assessment ${assessmentId}`;
      try {
        const res = await fetch(`${BASE_URL}/salesQualificationReport`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ assessmentId, assessmentLabel }),
        });
        const data = await res.json();
        if (data?.success && data?.data?.report) {
          const report = data.data.report;
          const newReport: GeneratedReportItem = {
            id: report.id,
            assessmentId: report.assessmentId,
            assessmentLabel: report.assessmentLabel ?? assessmentLabel,
            reportType: report.reportType,
            generatedAt: report.generatedAt,
            briefContent: report.briefContent,
          };
          setGeneratedReports((prev) => [...prev, newReport]);
        } else {
          const msg = data?.message ?? "";
          const isAlreadyGenerated =
            typeof msg === "string" &&
            /already\s+(generated|exists?)/i.test(msg.trim());
          if (isAlreadyGenerated) {
            setAlreadyGeneratedError(ALREADY_GENERATED_MSG);
            setIsTypeReportPopupOpen(true);
          } else {
            setBriefError(msg || "Failed to generate Sales Qualification Report.");
          }
        }
      } catch {
        setBriefError("Failed to generate Sales Qualification Report. Please try again.");
      } finally {
        setBriefGenerating(false);
        setAssessmentIdForReport("");
      }
      return;
    }
    if (reportType === "Customer Risk Mitigation Plan") {
      const alreadyExists = generatedReports.some(
        (r) => r.assessmentId === assessmentId && r.reportType === reportType,
      );
      if (alreadyExists) {
        setAlreadyGeneratedError(ALREADY_GENERATED_MSG);
        return;
      }
      setReportError("");
      setAlreadyGeneratedError("");
      setSelectedReportType("");
      setIsTypeReportPopupOpen(false);
      setBriefGenerating(true);
      const token = sessionStorage.getItem("bearerToken");
      if (!token) {
        setBriefError("Please log in to generate the report.");
        setBriefGenerating(false);
        return;
      }
      const option = selectOptions.find((o) => o.value === assessmentId);
      const assessmentLabel = option?.label ?? `Assessment ${assessmentId}`;
      try {
        const res = await fetch(`${BASE_URL}/customerRiskMitigationPlan`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ assessmentId, assessmentLabel }),
        });
        const data = await res.json();
        if (data?.success && data?.data?.report) {
          const report = data.data.report;
          const newReport: GeneratedReportItem = {
            id: report.id,
            assessmentId: report.assessmentId,
            assessmentLabel: report.assessmentLabel ?? assessmentLabel,
            reportType: report.reportType,
            generatedAt: report.generatedAt,
            briefContent: report.briefContent,
          };
          setGeneratedReports((prev) => [...prev, newReport]);
        } else {
          setBriefError(data?.message ?? "Failed to generate Customer Risk Mitigation Plan.");
        }
      } catch {
        setBriefError("Failed to generate Customer Risk Mitigation Plan. Please try again.");
      } finally {
        setBriefGenerating(false);
        setAssessmentIdForReport("");
      }
      return;
    }
    if (reportType === "Implementation Roadmap Proposal") {
      const alreadyExists = generatedReports.some(
        (r) => r.assessmentId === assessmentId && r.reportType === reportType,
      );
      if (alreadyExists) {
        setAlreadyGeneratedError(ALREADY_GENERATED_MSG);
        return;
      }
      setReportError("");
      setAlreadyGeneratedError("");
      setSelectedReportType("");
      setIsTypeReportPopupOpen(false);
      setBriefGenerating(true);
      const token = sessionStorage.getItem("bearerToken");
      if (!token) {
        setBriefError("Please log in to generate the report.");
        setBriefGenerating(false);
        return;
      }
      const option = selectOptions.find((o) => o.value === assessmentId);
      const assessmentLabel = option?.label ?? `Assessment ${assessmentId}`;
      try {
        const res = await fetch(`${BASE_URL}/implementationRoadmapProposal`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ assessmentId, assessmentLabel }),
        });
        const data = await res.json();
        if (data?.success && data?.data?.report) {
          const report = data.data.report;
          const newReport: GeneratedReportItem = {
            id: report.id,
            assessmentId: report.assessmentId,
            assessmentLabel: report.assessmentLabel ?? assessmentLabel,
            reportType: report.reportType,
            generatedAt: report.generatedAt,
            briefContent: report.briefContent,
          };
          setGeneratedReports((prev) => [...prev, newReport]);
        } else {
          setBriefError(data?.message ?? "Failed to generate Implementation Roadmap Proposal.");
        }
      } catch {
        setBriefError("Failed to generate Implementation Roadmap Proposal. Please try again.");
      } finally {
        setBriefGenerating(false);
        setAssessmentIdForReport("");
      }
      return;
    }
    if (reportType === "Vendor Comparison Matrix") {
      const alreadyExistsVcm = generatedReports.some(
        (r) => r.assessmentId === assessmentId && r.reportType === reportType,
      );
      if (alreadyExistsVcm) {
        setAlreadyGeneratedError(ALREADY_GENERATED_MSG);
        return;
      }
      setReportError("");
      setAlreadyGeneratedError("");
      setSelectedReportType("");
      setIsTypeReportPopupOpen(false);
      setBriefError(null);
      setBriefGenerating(true);
      const token = sessionStorage.getItem("bearerToken");
      if (!token) {
        setBriefError("Please log in to generate the report.");
        setBriefGenerating(false);
        return;
      }
      const option = selectOptions.find((o) => o.value === assessmentId);
      const assessmentLabel = option?.label ?? `Assessment ${assessmentId}`;
      try {
        const res = await fetch(`${BASE_URL}/vendorComparisonMatrixReport`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ assessmentId, assessmentLabel }),
        });
        const data = await res.json();
        if (data?.success && data?.data?.report) {
          const report = data.data.report;
          const newReport: GeneratedReportItem = {
            id: report.id,
            assessmentId: report.assessmentId,
            assessmentLabel: report.assessmentLabel ?? assessmentLabel,
            reportType: report.reportType,
            generatedAt: report.generatedAt,
            briefContent: report.briefContent,
          };
          setGeneratedReports((prev) => [...prev, newReport]);
        } else {
          setBriefError(
            data?.message ??
              "Failed to generate Vendor Comparison Matrix. Ensure the complete report exists in Complete Reports.",
          );
        }
      } catch {
        setBriefError("Failed to generate Vendor Comparison Matrix. Please try again.");
      } finally {
        setBriefGenerating(false);
        setAssessmentIdForReport("");
      }
      return;
    }
    if (reportType === "Compliance & Risk Summary") {
      const alreadyExistsCrs = generatedReports.some(
        (r) => r.assessmentId === assessmentId && r.reportType === reportType,
      );
      if (alreadyExistsCrs) {
        setAlreadyGeneratedError(ALREADY_GENERATED_MSG);
        return;
      }
      setReportError("");
      setAlreadyGeneratedError("");
      setSelectedReportType("");
      setIsTypeReportPopupOpen(false);
      setBriefError(null);
      setBriefGenerating(true);
      const token = sessionStorage.getItem("bearerToken");
      if (!token) {
        setBriefError("Please log in to generate the report.");
        setBriefGenerating(false);
        return;
      }
      const option = selectOptions.find((o) => o.value === assessmentId);
      const assessmentLabel = option?.label ?? `Assessment ${assessmentId}`;
      try {
        const res = await fetch(`${BASE_URL}/complianceRiskSummaryReport`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ assessmentId, assessmentLabel }),
        });
        const data = await res.json();
        if (data?.success && data?.data?.report) {
          const report = data.data.report;
          const newReport: GeneratedReportItem = {
            id: report.id,
            assessmentId: report.assessmentId,
            assessmentLabel: report.assessmentLabel ?? assessmentLabel,
            reportType: report.reportType,
            generatedAt: report.generatedAt,
            briefContent: report.briefContent,
          };
          setGeneratedReports((prev) => [...prev, newReport]);
        } else {
          setBriefError(
            data?.message ??
              "Failed to generate Compliance & Risk Summary. Ensure the complete report exists in Complete Reports.",
          );
        }
      } catch {
        setBriefError("Failed to generate Compliance & Risk Summary. Please try again.");
      } finally {
        setBriefGenerating(false);
        setAssessmentIdForReport("");
      }
      return;
    }
    if (reportType === "Implementation Risk Assessment") {
      const alreadyExistsIra = generatedReports.some(
        (r) => r.assessmentId === assessmentId && r.reportType === reportType,
      );
      if (alreadyExistsIra) {
        setAlreadyGeneratedError(ALREADY_GENERATED_MSG);
        return;
      }
      setReportError("");
      setAlreadyGeneratedError("");
      setSelectedReportType("");
      setIsTypeReportPopupOpen(false);
      setBriefError(null);
      setBriefGenerating(true);
      const token = sessionStorage.getItem("bearerToken");
      if (!token) {
        setBriefError("Please log in to generate the report.");
        setBriefGenerating(false);
        return;
      }
      const option = selectOptions.find((o) => o.value === assessmentId);
      const assessmentLabel = option?.label ?? `Assessment ${assessmentId}`;
      try {
        const res = await fetch(`${BASE_URL}/implementationRiskAssessmentReport`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ assessmentId, assessmentLabel }),
        });
        const data = await res.json();
        if (data?.success && data?.data?.report) {
          const report = data.data.report;
          const newReport: GeneratedReportItem = {
            id: report.id,
            assessmentId: report.assessmentId,
            assessmentLabel: report.assessmentLabel ?? assessmentLabel,
            reportType: report.reportType,
            generatedAt: report.generatedAt,
            briefContent: report.briefContent,
          };
          setGeneratedReports((prev) => [...prev, newReport]);
        } else {
          setBriefError(
            data?.message ??
              "Failed to generate Implementation Risk Assessment. Ensure the complete report exists in Complete Reports.",
          );
        }
      } catch {
        setBriefError("Failed to generate Implementation Risk Assessment. Please try again.");
      } finally {
        setBriefGenerating(false);
        setAssessmentIdForReport("");
      }
      return;
    }
    if (reportType === "Mitigation Action Plan") {
      const alreadyExistsMap = generatedReports.some(
        (r) => r.assessmentId === assessmentId && r.reportType === reportType,
      );
      if (alreadyExistsMap) {
        setAlreadyGeneratedError(ALREADY_GENERATED_MSG);
        return;
      }
      setReportError("");
      setAlreadyGeneratedError("");
      setSelectedReportType("");
      setIsTypeReportPopupOpen(false);
      setBriefError(null);
      setBriefGenerating(true);
      const token = sessionStorage.getItem("bearerToken");
      if (!token) {
        setBriefError("Please log in to generate the report.");
        setBriefGenerating(false);
        return;
      }
      const option = selectOptions.find((o) => o.value === assessmentId);
      const assessmentLabel = option?.label ?? `Assessment ${assessmentId}`;
      try {
        const res = await fetch(`${BASE_URL}/mitigationActionPlanReport`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ assessmentId, assessmentLabel }),
        });
        const data = await res.json();
        if (data?.success && data?.data?.report) {
          const report = data.data.report;
          const newReport: GeneratedReportItem = {
            id: report.id,
            assessmentId: report.assessmentId,
            assessmentLabel: report.assessmentLabel ?? assessmentLabel,
            reportType: report.reportType,
            generatedAt: report.generatedAt,
            briefContent: report.briefContent,
          };
          setGeneratedReports((prev) => [...prev, newReport]);
        } else {
          setBriefError(
            data?.message ??
              "Failed to generate Mitigation Action Plan. Ensure the complete report exists in Complete Reports.",
          );
        }
      } catch {
        setBriefError("Failed to generate Mitigation Action Plan. Please try again.");
      } finally {
        setBriefGenerating(false);
        setAssessmentIdForReport("");
      }
      return;
    }
    const alreadyExists = generatedReports.some(
      (r) => r.assessmentId === assessmentId && r.reportType === reportType,
    );
    if (alreadyExists) {
      setAlreadyGeneratedError(ALREADY_GENERATED_MSG);
      return;
    }
    setReportError("");
    setAlreadyGeneratedError("");
    setSelectedReportType("");
    setIsTypeReportPopupOpen(false);
    const option = selectOptions.find((o) => o.value === assessmentId);
    const assessmentLabel = option?.label ?? `Assessment ${assessmentId}`;
    const newReport: GeneratedReportItem = {
      id: `gr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      assessmentId,
      assessmentLabel,
      reportType,
      generatedAt: new Date().toISOString(),
    };
    setGeneratedReports((prev) => [...prev, newReport]);
    setAssessmentIdForReport("");
  };

  const handleViewReport = (report: GeneratedReportItem) => {
    navigate(`/reports/general/${encodeURIComponent(report.id)}`);
  };

  const handleDownloadReport = (report: GeneratedReportItem) => {
    const formatDate = (iso: string) => {
      try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return "—";
        return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).replace(/\s+/g, "-");
      } catch {
        return "—";
      }
    };
    const sanitize = (s: string) =>
      s.replace(/[<>:"/\\|?*]/g, "").replace(/\s+/g, "-").slice(0, 80);
    const dateStr = formatDate(report.generatedAt);
    const bodyContent =
      typeof report.briefContent === "string"
        ? report.briefContent
        : report.briefContent != null
          ? JSON.stringify(report.briefContent, null, 2)
          : "This report was generated from the Reports Library. Full report content can be viewed in the application.";
    const content = [
      "General Report",
      "—",
      `Assessment: ${report.assessmentLabel}`,
      `Report type: ${report.reportType}`,
      `Generated: ${dateStr}`,
      "",
      bodyContent,
    ].join("\n");
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitize(report.assessmentLabel)}-${sanitize(report.reportType)}-${dateStr.replace(/\//g, "-")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (showArchivedOnly !== true && loading) {
    return <LoadingMessage message="Loading reports…" />;
  }

  return (
    <>
      {!hideDropdown && canGenerateReports && (
        <section className="general_reports_section_one">
          <div className="gen_reports_assessment_select">
            <Select
              id="vendor_assessment"
              name="vendor_assessment"
              labelName=""
              value={selectedAssessmentId}
              default_option={
                isBuyerEngineer
                  ? "Select your assessment"
                  : systemRole === "buyer"
                    ? "Select a buyer assessment"
                    : "Select a vendor assessment"
              }
              options={selectOptions}
              onChange={handleSelectChange}
            />
          </div>
          {/* <div className="search_align_right">
          <div className="gen_reports_search_wrap">
            <Search size={18} className="reports_search_icon" aria-hidden />
            <input
              type="search"
              placeholder="Search reports…"
              className="reports_search_input"
              aria-label="Search reports"
            />
          </div>
        </div> */}
        </section>
      )}
      {/* {reportError && (
        <p className="general_reports_page_error" role="alert">
          {reportError}
        </p>
      )} */}
      <Modal isOpen={isTypeReportPopupOpen} onClose={handleCloseModal} modalPopupClassName="reports_type_popup">
        <div className="header_modal">
          <div>
            <h2 className="modal_popup_title">Report Type</h2>
            <p className="modal_sub_title">
              Select a report type for the chosen assessment.
            </p>
          </div>
          <div className="cancel">
            <button
              type="button"
              className="modal_close_btn"
              onClick={handleCloseModal}
              aria-label="Close"
            >
              <CircleX size={20} />
            </button>
          </div>
        </div>
        <GeneralReportsTypesPopup
          selectedReport={selectedReportType}
          onReportTypeChange={(value) => {
            setSelectedReportType(value);
            setAlreadyGeneratedError("");
          }}
          onClose={() => {
            setReportError("");
            setSelectedReportType("");
            setAlreadyGeneratedError("");
            setIsTypeReportPopupOpen(false);
          }}
          onGenerateReport={canGenerateReports ? handleGenerateReport : undefined}
          alreadyGeneratedError={alreadyGeneratedError}
          portal={systemRole === "buyer" ? "buyer" : "vendor"}
        />
      </Modal>
      {briefError && (
        <p className="general_reports_page_error" role="alert">
          {briefError}
        </p>
      )}
      {briefGenerating && (
        <div
          className="vendor_attestation_submit_overlay"
          role="status"
          aria-live="polite"
          aria-label="Generating report"
        >
          <div className="vendor_attestation_submit_overlay_content">
            <Loader2 size={32} className="vendor_attestation_submit_overlay_loader" aria-hidden />
            <p>Generating report…</p>
            <p className="vendor_attestation_submit_overlay_hint">Please wait. Do not close or refresh.</p>
          </div>
        </div>
      )}
      <section>
        {showArchivedOnly && renderArchivedListOnly ? null : (() => {
          /** Apply tab filter: only current, only archived, or all (when undefined). */
          let filteredList = generatedReports;
          if (showArchivedOnly === true) {
            filteredList = filteredList.filter((r) => isGeneralReportArchived(r));
          } else if (showArchivedOnly === false) {
            filteredList = filteredList.filter((r) => !isGeneralReportArchived(r));
          }
          const q = searchQuery.trim().toLowerCase();
          if (q === "published") {
            filteredList = filteredList.filter((r) => !isGeneralReportArchived(r));
          } else if (q === "archived") {
            filteredList = filteredList.filter((r) => isGeneralReportArchived(r));
          } else if (q) {
            filteredList = filteredList.filter((r) => {
              const label = (r.assessmentLabel ?? "").toLowerCase();
              const reportType = (r.reportType ?? "").toLowerCase();
              return label.includes(q) || reportType.includes(q);
            });
          }
          const pageSize = showArchivedOnly && archivedPageSize != null ? archivedPageSize : generalReportsPageSize;
          const start = (generalReportsPage - 1) * pageSize;
          const paginatedList = filteredList.slice(start, start + pageSize);
          const isEmpty = filteredList.length === 0;
          return (
            <>
              {isEmpty && !showArchivedOnly ? (
                <div className="report_detail_empty" role="status">
                  <h2 className="report_detail_empty_title">No reports</h2>
                  {canGenerateReports && (
                    <p className="report_detail_empty_text">
                      Choose an assessment above to generate a report.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <GeneralReportsCards
                    reports={paginatedList}
                    onViewReport={handleViewReport}
                    onDownload={showArchivedOnly ? undefined : handleDownloadReport}
                  />
                  <ReportsPagination
                    totalItems={filteredList.length}
                    currentPage={generalReportsPage}
                    pageSize={pageSize}
                    onPageChange={setGeneralReportsPage}
                    onPageSizeChange={
                      showArchivedOnly && archivedPageSize != null
                        ? undefined
                        : (size) => {
                            setGeneralReportsPageSize(size);
                            setGeneralReportsPage(1);
                          }
                    }
                  />
                </>
              )}
            </>
          );
        })()}
      </section>
    </>
  );
};

export default GeneralReports;
