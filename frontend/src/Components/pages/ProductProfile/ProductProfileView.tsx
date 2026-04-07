/**
 * Product Profile view for vendors: summary cards (Trust Score, No of products, Company, Regions),
 * product cards with trust score and View details; details open on the page (no modal).
 */
import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Shield,
  Building2,
  Globe,
  Package,
  CircleChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react";
import type { VendorSelfAttestationFormState } from "../../../types/vendorSelfAttestation";
import type { GeneratedProductProfileReport } from "../../../types/generatedProductProfile";
import LoadingMessage from "../../UI/LoadingMessage";
import ProductProfileSummaryCard from "./ProductProfileSummaryCard";
import GeneratedProductProfileCards from "./GeneratedProductProfileCards";
import type {
  ProductProfileProduct,
  StoredGeneratedReport,
} from "../DirectoryListing/DirectoryListing";
import { ReportsPagination } from "../Reports/ReportsPagination";
import "../UserManagement/user_management.css";
import "../MyVendors/MyVendors.css";
import "../../../styles/page_tabs.css";
import "./product_profile.css";
import { formatDateDDMMMYYYY } from "../../../utils/formatDate.js";

function formatVal(val: unknown): string {
  if (val == null || val === "") return "Not specified.";
  if (Array.isArray(val)) return val.length ? val.join(", ") : "Not specified.";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen).trim() + "...";
}

function productInitials(name: string): string {
  const s = (name || "Draft").trim();
  if (s.length >= 2) return s.slice(0, 2).toUpperCase();
  return s ? s.toUpperCase() : "Dr";
}

/** Chip accent for product status — matches Risk & Controls chip vocabulary (MyVendors.css). */
function productStatusToRiskChipClass(status: string): string {
  const s = String(status ?? "").toLowerCase().trim();
  if (s === "completed") return "risk_mapping_chip_mitigated";
  if (s === "draft") return "risk_mapping_chip_medium";
  if (s === "expired") return "risk_mapping_chip_open";
  if (s === "rejected") return "risk_mapping_chip_critical";
  if (s === "submitted" || s === "pending") return "risk_mapping_chip_low";
  return "risk_mapping_chip_low";
}

const SECTOR_KEYS_ORDER = ["public_sector", "private_sector", "non_profit_sector"] as const;

/** Format sector for display: only the values from arrays that have data (e.g. "Defense & Military"). Handles object or JSON string. */
function formatSector(sector: string | Record<string, unknown> | null | undefined): string {
  if (sector == null) return "";
  let obj: Record<string, unknown> | null = null;
  if (typeof sector === "string") {
    const t = sector.trim();
    if (!t) return "";
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        const parsed = JSON.parse(t) as Record<string, unknown>;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) obj = parsed;
      } catch {
        return "";
      }
    } else {
      return t;
    }
  } else if (typeof sector === "object" && sector !== null) {
    obj = sector;
  }
  if (obj) {
    const parts: string[] = [];
    for (const key of SECTOR_KEYS_ORDER) {
      const val = obj[key];
      if (Array.isArray(val) && val.length > 0) {
        const items = val.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
        if (items.length > 0) parts.push(items.join(", "));
      }
    }
    if (parts.length > 0) return parts.join(" • ");
    const name = (obj.name ?? obj.sectorName ?? obj.industryName) as string | undefined;
    if (typeof name === "string" && name.trim()) return name.trim();
  }
  return "";
}

/** Parse trust score 0–100 from text (e.g. "62 (Moderate)" or "Overall Trust Score: 62"). */
function parseScoreFromText(text: string): number | null {
  if (!text || typeof text !== "string") return null;
  const withParen = text.match(/(\d{1,3})\s*[(\[]/);
  const m = withParen ?? text.match(/\b(\d{1,3})\b/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isNaN(n) ? null : Math.min(100, Math.max(0, n));
}

/** Get overallScore (0–100) from report column trustScore.overallScore when full report validation fails. */
function getOverallScoreFromReport(raw: unknown): number | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const ts = o.trustScore;
  if (ts == null || typeof ts !== "object") return null;
  const t = ts as Record<string, unknown>;
  if (typeof t.overallScore === "number") return Math.min(100, Math.max(0, t.overallScore));
  return null;
}

/** Normalize API-generated report to GeneratedProductProfileReport (from attestation submit or fetch). */
function asGeneratedReport(raw: unknown): GeneratedProductProfileReport | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    o.trustScore == null ||
    typeof o.trustScore !== "object" ||
    !Array.isArray(o.sections)
  )
    return null;
  const ts = o.trustScore as Record<string, unknown>;
  const summary = typeof ts.summary === "string" ? ts.summary : "";
  let overallScore = typeof ts.overallScore === "number" ? ts.overallScore : 0;
  if (overallScore === 0) {
    const fromSummary = summary ? parseScoreFromText(summary) : null;
    const fromLabel = typeof ts.label === "string" ? parseScoreFromText(ts.label) : null;
    const parsed = fromSummary ?? fromLabel ?? null;
    if (parsed != null) overallScore = parsed;
  }
  return {
    trustScore: {
      overallScore,
      label: (typeof ts.label === "string" ? ts.label : "") || "—",
      summary,
      scoreByCategory: ts.scoreByCategory as
        | Record<string, string | number>
        | undefined,
    },
    sections: o.sections as GeneratedProductProfileReport["sections"],
  };
}

/** True when attestation expiry date is set and in the past. */
function isAttestationExpired(product: ProductProfileProduct): boolean {
  const status = String(product.status ?? "").trim().toUpperCase();
  if (status === "EXPIRED") return true;
  const exp = product.attestationExpiryAt;
  if (exp == null || String(exp).trim() === "") return false;
  const expiry = new Date(exp);
  if (Number.isNaN(expiry.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  return expiry.getTime() < today.getTime();
}

export interface ProductProfileViewProps {
  formState: VendorSelfAttestationFormState | null;
  /** List of products (attestations) for product cards */
  products?: ProductProfileProduct[];
  /** Current tab: "current" (non-expired) or "archived" (expired attestation) */
  productTab?: "current" | "archived";
  /** Called when user switches product tab */
  onProductTabChange?: (tab: "current" | "archived") => void;
  /** Fetch full attestation detail by id for View Product modal */
  fetchProductDetail?: (
    id: string,
  ) => Promise<VendorSelfAttestationFormState | null>;
  /** Trust score label e.g. "A+", compliancePercent e.g. "92%" */
  trustScore?: string;
  compliancePercent?: string;
  /** Public directory listing (moved from dashboard) */
  publicListing?: boolean;
  onPublicListingToggle?: () => void;
  publicListingUpdating?: boolean;
  publicListingError?: string | null;
  /** Toggle product visibility to buyers (only for Completed products) */
  onProductVisibilityToggle?: (productId: string, visible: boolean) => void;
  /** Toggle a detail section's visibility to buyers (only for Completed products) */
  onSectionVisibilityChange?: (
    attestationId: string,
    sectionKey: SectionVisibilityKey,
    value: boolean,
  ) => Promise<void>;
  /** Generated product profile (from agent or selected stored report); trust score shown on top in cards */
  generatedReport?: GeneratedProductProfileReport | null;
  /** Stored generated reports from GET generated-reports */
  storedReports?: StoredGeneratedReport[];
  selectedStoredReportId?: string | null;
  onSelectStoredReport?: (
    report: GeneratedProductProfileReport,
    storedReportId: string,
  ) => void;
  generateLoading?: boolean;
  generateError?: string | null;
  vendorDataInput?: string;
  onVendorDataInputChange?: (value: string) => void;
  onUseAttestationData?: () => void;
  onGenerateProfile?: () => void;
  /** When true, hide edit controls (public listing toggle, generate profile, visibility toggles). */
  viewOnly?: boolean;
}

export type SectionVisibilityKey =
  | "visible_ai_governance"
  | "visible_security_posture"
  | "visible_data_privacy"
  | "visible_compliance"
  | "visible_model_risk"
  | "visible_data_practices"
  | "visible_compliance_certifications"
  | "visible_operations_support"
  | "visible_vendor_management";

interface ProductProfileProductListCardProps {
  product: ProductProfileProduct;
  trustScoreDisplay: string;
  onView: (product: ProductProfileProduct) => void;
}

function ProductProfileProductListCard({
  product,
  trustScoreDisplay,
  onView,
}: ProductProfileProductListCardProps) {
  const statusChipClass = productStatusToRiskChipClass(product.status);
  const hasTrustScore = trustScoreDisplay !== "—";
  return (
    <div className="risk_mapping_risk_card">
      <div className="risk_mapping_risk_top product_profile_card_risk_top_with_trust">
        <div className="risk_mapping_chip_row">
          <span className="risk_mapping_chip risk_mapping_chip_id" aria-hidden>
            {productInitials(product.productName)}
          </span>
          <span className={`risk_mapping_chip ${statusChipClass}`}>{product.status}</span>
        </div>
        <div className="product_profile_card_trust_block" aria-label={`Trust score ${trustScoreDisplay}`}>
          <span className="product_profile_card_trust_label_top">Trust score</span>
          <span
            className={
              hasTrustScore
                ? "product_profile_card_trust_value_top"
                : "product_profile_card_trust_value_top product_profile_card_trust_value_top_muted"
            }
          >
            {trustScoreDisplay}
          </span>
        </div>
      </div>
      <div className="risk_mapping_risk_body">
        <h4 className="risk_mapping_risk_title">{product.productName}</h4>
        <p className="risk_mapping_risk_desc">
          Review attestation detail, trust breakdown, and buyer visibility.
        </p>
      </div>
      <div className="risk_mapping_risk_footer_product">
        {/* <span className="risk_mapping_owner">Product attestation</span> */}
        <button
          type="button"
          className="product_profile_product_card_view_btn"
          onClick={() => onView(product)}
          aria-label={`View details for ${product.productName}`}
        >
          View details
          <ChevronRight size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function ProductProfileView({
  formState,
  products = [],
  productTab = "current",
  onProductTabChange,
  fetchProductDetail,
  trustScore = "A+",
  compliancePercent = "92%",
  publicListing = false,
  onPublicListingToggle,
  publicListingUpdating = false,
  publicListingError = null,
  onProductVisibilityToggle,
  onSectionVisibilityChange,
  generatedReport = null,
  storedReports = [],
  selectedStoredReportId = null,
  onSelectStoredReport,
  generateLoading = false,
  generateError = null,
  vendorDataInput = "",
  onVendorDataInputChange,
  onUseAttestationData,
  onGenerateProfile,
  viewOnly = false,
}: ProductProfileViewProps) {
  const currentProducts = products.filter((p) => !isAttestationExpired(p));
  const archivedProducts = products.filter((p) => isAttestationExpired(p));
  const showVisibilityToggle = productTab === "current";
  const [productSearchQuery, setProductSearchQuery] = useState("");

  /** Get trust score number (0–100) for a product for search/filter. */
  const getProductTrustScore = (product: ProductProfileProduct): number | null => {
    const report = asGeneratedReport(product.generated_profile_report);
    const fromReport = report?.trustScore?.overallScore;
    const fromRaw = getOverallScoreFromReport(product.generated_profile_report);
    const n = typeof fromReport === "number" ? fromReport : fromRaw;
    return typeof n === "number" && !Number.isNaN(n) ? Math.min(100, Math.max(0, n)) : null;
  };

  const matchesProductSearch = (product: ProductProfileProduct, q: string): boolean => {
    const trim = q.trim().toLowerCase();
    if (!trim) return true;
    const nameMatch = product.productName.trim().toLowerCase().includes(trim);
    const score = getProductTrustScore(product);
    const scoreMatch = score != null && (String(score).includes(trim) || (trim === "0" && score === 0));
    return nameMatch || scoreMatch;
  };

  const filteredCurrentProducts = currentProducts.filter((p) => matchesProductSearch(p, productSearchQuery));
  const filteredArchivedProducts = archivedProducts.filter((p) => matchesProductSearch(p, productSearchQuery));

  const [currentProductPage, setCurrentProductPage] = useState(1);
  const [archivedProductPage, setArchivedProductPage] = useState(1);
  const [productPageSize, setProductPageSize] = useState(10);

  const paginatedCurrentProducts = filteredCurrentProducts.slice(
    (currentProductPage - 1) * productPageSize,
    currentProductPage * productPageSize,
  );
  const paginatedArchivedProducts = filteredArchivedProducts.slice(
    (archivedProductPage - 1) * productPageSize,
    archivedProductPage * productPageSize,
  );

  useEffect(() => {
    setCurrentProductPage(1);
    setArchivedProductPage(1);
  }, [productSearchQuery]);

  useEffect(() => {
    setProductSearchQuery("");
  }, [productTab]);

  /** When set, product details are shown on the page instead of in a modal. */
  const [selectedProductIdForDetail, setSelectedProductIdForDetail] = useState<string | null>(null);
  const [viewProductDetail, setViewProductDetail] =
    useState<VendorSelfAttestationFormState | null>(null);
  const [viewProductMeta, setViewProductMeta] = useState<{
    productName: string;
    status: string;
    completedDate: string;
    productId: string;
    visibleToBuyer: boolean;
  } | null>(null);
  const [viewProductLoading, setViewProductLoading] = useState(false);
  const LOADER_MIN_MS = 2500; // same as Assessments page

  /** Report to show on main page: from manual generate, selected stored report, or first product that has a report. */
  const reportToShow =
    generatedReport ??
    asGeneratedReport(
      products.find((p) => p.generated_profile_report)
        ?.generated_profile_report,
    );

  /** Average Trust Score = rounded average of current (non-archived) products' trust scores only. */
  const averageTrustScore = useMemo(() => {
    const scores: number[] = [];
    currentProducts.forEach((p) => {
      const report = asGeneratedReport(p.generated_profile_report);
      const score =
        report?.trustScore?.overallScore ??
        getOverallScoreFromReport(p.generated_profile_report);
      if (typeof score === "number" && !Number.isNaN(score)) {
        scores.push(Math.min(100, Math.max(0, score)));
      }
    });
    if (scores.length === 0) return null;
    const sum = scores.reduce((a, b) => a + b, 0);
    return Math.round(sum / scores.length);
  }, [currentProducts]);

  const company = formState?.companyProfile;
  const attestation = formState?.attestation ?? {};

  const vendorType = formatVal(company?.vendorType) || "SaaS Provider";
  const operatingRegions =
    Array.isArray(company?.operatingRegions) &&
    company.operatingRegions.length > 0
      ? company.operatingRegions.join(", ")
      : "Not specified.";
  const headquarters = formatVal(company?.headquartersLocation) || "—";

  const handleViewProduct = async (product: ProductProfileProduct) => {
    if (!fetchProductDetail) return;
    setSelectedProductIdForDetail(product.id);
    setViewProductDetail(null);
    setViewProductMeta({
      productName: product.productName,
      status: product.status,
      completedDate: formatDateDDMMMYYYY(product.updated_at),
      productId: product.id,
      visibleToBuyer: product.visibleToBuyer ?? false,
    });
    const loadStart = Date.now();
    setViewProductLoading(true);
    try {
      const detail = await fetchProductDetail(product.id);
      setViewProductDetail(detail);
    } finally {
      const elapsed = Date.now() - loadStart;
      const remaining = Math.max(0, LOADER_MIN_MS - elapsed);
      setTimeout(() => setViewProductLoading(false), remaining);
    }
  };

  const handleBackToProducts = () => {
    setSelectedProductIdForDetail(null);
    setViewProductDetail(null);
    setViewProductMeta(null);
  };

  const attRecord = viewProductDetail?.attestation as
    | Record<string, unknown>
    | undefined;
  /** Section id (1–9) maps to backend visibility keys. */
  const SECTION_VISIBILITY_KEYS: Record<number, SectionVisibilityKey> = {
    1: "visible_ai_governance",
    2: "visible_security_posture",
    3: "visible_data_privacy",
    4: "visible_compliance",
    5: "visible_model_risk",
    6: "visible_data_practices",
    7: "visible_compliance_certifications",
    8: "visible_operations_support",
    9: "visible_vendor_management",
  };
  const sectionVisible = (key: SectionVisibilityKey) =>
    attRecord?.[key] === true;
  const handleSectionToggle = async (
    key: SectionVisibilityKey,
    next: boolean,
  ) => {
    if (!viewProductMeta || !onSectionVisibilityChange) return;
    await onSectionVisibilityChange(viewProductMeta.productId, key, next);
    if (fetchProductDetail) {
      const detail = await fetchProductDetail(viewProductMeta.productId);
      setViewProductDetail(detail);
    }
  };
  const getSectionVisibility = (sectionId: number) => {
    const key = SECTION_VISIBILITY_KEYS[sectionId];
    if (
      !key ||
      !viewProductMeta ||
      viewProductMeta.status !== "Completed" ||
      !onSectionVisibilityChange
    )
      return null;
    return {
      visible: sectionVisible(key),
      onToggle: (next: boolean) => handleSectionToggle(key, next),
    };
  };

  return (
    <div className="sec_user_page attestation_page org_settings_page product_profile_page">
      {selectedProductIdForDetail && (
        <div className="heading_user_page page_header_align product_profile_page_header product_profile_detail_parent_header">
          <div className="headers page_header_row">
            <span className="icon_size_header" aria-hidden>
              <Globe size={24} className="header_icon_svg" />
            </span>
            <div className="page_header_title_block">
              <nav className="product_profile_breadcrumb" aria-label="Breadcrumb">
                <button
                  type="button"
                  className="product_profile_breadcrumb_root"
                  onClick={handleBackToProducts}
                  aria-label="Back to Product Profile list"
                >
                  Product Profile
                </button>
                <ChevronRight size={16} className="product_profile_breadcrumb_sep" aria-hidden />
                <h1 className="product_profile_breadcrumb_current">
                  {viewProductMeta?.productName ?? "Product details"}
                </h1>
              </nav>
              <p className="sub_title page_header_subtitle product_profile_breadcrumb_subtitle">
                Attestation status, trust breakdown, and what buyers can see.
              </p>
            </div>
          </div>
        </div>
      )}

      {!selectedProductIdForDetail && (
        <div className="heading_user_page page_header_align product_profile_page_header">
          <div className="headers page_header_row">
            <span className="icon_size_header" aria-hidden>
              <Globe size={24} className="header_icon_svg" />
            </span>
            <div className="page_header_title_block">
              <h1 className="page_header_title">Product Profile</h1>
              <p className="sub_title page_header_subtitle">
                Your AI product attestation data, trust scores, and directory visibility in one place.
              </p>
            </div>
          </div>
          <div className="btn_user_page product_profile_header_actions">
            {onPublicListingToggle != null && (
              <>
                <div className="product_profile_toggle_wrap">
                  <button
                    type="button"
                    className="product_profile_toggle"
                    aria-pressed={publicListing}
                    onClick={onPublicListingToggle}
                    disabled={publicListingUpdating}
                    aria-label="Public Directory Listing"
                  />
                  <span>Public Directory Listing</span>
                </div>
                {publicListingError != null && publicListingError !== "" && (
                  <p className="product_profile_toggle_error" role="alert">
                    {publicListingError}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Generate profile: vendor data input + generate button; generated data in cards (no file) */}
      {/* {onGenerateProfile && (
        <section className="generated_profile_form" aria-label="Generate product profile">
          <h2 className="generated_profile_form_title">Generate product profile</h2>
          <p className="product_profile_detail_subtitle" style={{ marginBottom: "0.5rem" }}>
            Paste vendor data below or use your saved attestation data, then generate a structured report. Results appear in cards with trust score on top (no file download).
          </p>
          {onVendorDataInputChange && (
            <textarea
              className="generated_profile_form_textarea"
              placeholder="Paste vendor data here, or click “Use my attestation data” to fill from your profile…"
              value={vendorDataInput}
              onChange={(e) => onVendorDataInputChange(e.target.value)}
              aria-label="Vendor data for profile generation"
            />
          )}
          <div className="generated_profile_form_actions">
            {onUseAttestationData && (
              <button
                type="button"
                className="product_profile_btn_view_attestation"
                onClick={onUseAttestationData}
              >
                Use my attestation data
              </button>
            )}
            <button
              type="button"
              className="product_profile_btn_view_attestation"
              onClick={onGenerateProfile}
              disabled={generateLoading}
            >
              {generateLoading ? "Generating…" : "Generate profile"}
            </button>
          </div>
          {generateError && (
            <p className="generated_profile_form_error" role="alert">
              {generateError}
            </p>
          )}
        </section>
      )} */}

      {!selectedProductIdForDetail && (
      <section className="product_profile_summary_cards">
        <ProductProfileSummaryCard
          title="Average Trust Score"
          icon={<Shield size={24} />}
          primary={
            averageTrustScore != null
              ? `${averageTrustScore}%`
              : reportToShow?.trustScore
                ? `${reportToShow.trustScore.overallScore}%`
                : trustScore
          }
          secondary={
            averageTrustScore != null
              ? (() => {
                  const currentOnly = products.filter((p) => !isAttestationExpired(p));
                  const withScore = currentOnly.filter(
                    (p) =>
                      asGeneratedReport(p.generated_profile_report)?.trustScore?.overallScore != null ||
                      getOverallScoreFromReport(p.generated_profile_report) != null,
                  ).length;
                  return withScore === 1 ? "1 product" : `Across ${withScore} products`;
                })()
              : reportToShow?.trustScore?.summary
                ? truncate((reportToShow.trustScore.summary || "").replace(/\s*-+\s*$/, "").trim(), 60)
                : `${compliancePercent} compliance`
          }
          iconColor="blue"
          primaryVariant="trustScore"
        />
        <ProductProfileSummaryCard
          title="No of products"
          icon={<Package size={24} />}
          primary={String(products.length)}
          secondary={products.length === 1 ? "product" : "products"}
          iconColor="blue"
        />
        <ProductProfileSummaryCard
          title="Company"
          icon={<Building2 size={24} />}
          primary={headquarters}
          secondary={vendorType}
          iconColor="blue"
        />
        <ProductProfileSummaryCard
          title="Operating Regions"
          icon={<Globe size={24} />}
          primary={operatingRegions}
          secondary=""
          iconColor="blue"
        />
      </section>
      )}

      <section className="product_profile_products_section">
          {selectedProductIdForDetail ? (
            <div
              className="product_profile_detail_on_page"
              aria-label={
                viewProductMeta?.productName
                  ? `Details for ${viewProductMeta.productName}`
                  : "Product details"
              }
            >
              <button
                type="button"
                className="product_profile_back_to_products_btn"
                onClick={handleBackToProducts}
                aria-label="Back to products"
              >
                <CircleChevronLeft size={18} aria-hidden />
                Back to products
              </button>
              <div className="product_profile_detail_on_page_body">
                {viewProductLoading && <LoadingMessage message="Loading…" />}
                {!viewProductLoading && viewProductMeta && (
                  <>
                    <div className="attestation_visible_status">
                      <div className="product_profile_modal_status_row">
                        <span className="product_profile_modal_status_label">
                          Attestation status
                        </span>
                        <span
                          className={`product_profile_product_card_status product_profile_product_card_status_${viewProductMeta.status.toLowerCase()}`}
                        >
                          {viewProductMeta.status}
                        </span>
                        <span className="product_profile_modal_status_sub">
                          {viewProductMeta.completedDate !== "—"
                            ? `Completed: ${viewProductMeta.completedDate}`
                            : "—"}
                        </span>
                      </div>
                      {viewProductMeta.status === "Completed" &&
                        onProductVisibilityToggle &&
                        showVisibilityToggle && (
                          <div className="product_profile_modal_visibility">
                            <button
                              type="button"
                              className="product_profile_toggle product_profile_product_toggle"
                              aria-pressed={viewProductMeta.visibleToBuyer}
                              onClick={() => {
                                const next = !viewProductMeta.visibleToBuyer;
                                onProductVisibilityToggle(
                                  viewProductMeta.productId,
                                  next,
                                );
                                setViewProductMeta((prev) =>
                                  prev ? { ...prev, visibleToBuyer: next } : null,
                                );
                              }}
                              aria-label={`${viewProductMeta.visibleToBuyer ? "Hide" : "Show"} this product to buyers`}
                            />
                            <span className="product_profile_modal_visibility_label">
                              Visible to buyers
                            </span>
                          </div>
                        )}
                    </div>

                    {(() => {
                      const viewedProduct = products.find(
                        (p) => p.id === viewProductMeta.productId,
                      );
                      const pageReport =
                        asGeneratedReport(
                          viewedProduct?.generated_profile_report,
                        ) ??
                        asGeneratedReport(
                          (
                            viewProductDetail?.attestation as Record<
                              string,
                              unknown
                            >
                          )?.generated_profile_report,
                        );
                      return pageReport ? (
                        <div className="product_profile_modal_generated_wrap">
                          <GeneratedProductProfileCards
                            report={pageReport}
                            sectionVisibility={showVisibilityToggle ? getSectionVisibility : undefined}
                          />
                        </div>
                      ) : null;
                    })()}
                  </>
                )}
              </div>
            </div>
          ) : products.length === 0 ? (
            <div className="product_profile_empty_hero" role="region" aria-labelledby="product_profile_empty_title">
              <div className="product_profile_empty_hero_inner">
                <span className="product_profile_empty_hero_icon" aria-hidden>
                  <Package size={40} strokeWidth={1.25} />
                </span>
                <h2 id="product_profile_empty_title" className="product_profile_empty_hero_title">
                  No product profiles yet
                </h2>
                <p className="product_profile_empty_hero_lead">
                  {viewOnly
                    ? "Completed attestations will appear here with trust scores and visibility controls."
                    : "When you complete a product attestation, it shows up here with trust scores, generated profile cards, and directory visibility."}
                </p>
                {!viewOnly && (
                  <div className="product_profile_empty_hero_actions">
                    <Link
                      to="/attestation_details"
                      className="product_profile_empty_hero_primary"
                    >
                      Go to Attestation
                      <ChevronRight size={18} aria-hidden />
                    </Link>
                    <p className="product_profile_empty_hero_hint">
                      Finish or submit your attestation to populate this page.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
          <header className="product_profile_products_intro">
            <h2 className="product_profile_products_section_title">Products</h2>
            <p className="product_profile_products_section_lead">
              Review trust scores, attestation status, and buyer visibility. Search by name or score, then open a
              product for full details.
            </p>
          </header>
             <div className="product_profile_tabs_section">
            {onProductTabChange ? (
              <div className="page_tabs" role="tablist" aria-label="Product list">
                <button
                  type="button"
                  role="tab"
                  aria-selected={productTab === "current"}
                  aria-controls="product_profile_current_panel"
                  id="product_profile_current_tab"
                  className={`page_tab ${productTab === "current" ? "page_tab_active" : ""}`}
                  onClick={() => onProductTabChange("current")}
                >
                  Current
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={productTab === "archived"}
                  aria-controls="product_profile_archived_panel"
                  id="product_profile_archived_tab"
                  className={`page_tab ${productTab === "archived" ? "page_tab_active" : ""}`}
                  onClick={() => onProductTabChange("archived")}
                >
                  Archived
                </button>
              </div>
            ) : (
              <div className="product_profile_tabs_spacer" aria-hidden />
            )}
            <div className="product_profile_products_search_wrap">
              <Search size={18} className="product_profile_products_search_icon" aria-hidden />
              <input
                type="search"
                placeholder="Search by product name or trust score…"
                className="product_profile_products_search_input"
                aria-label="Search products by name or trust score"
                value={productSearchQuery}
                onChange={(e) => setProductSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="product_profile_products_shell">
       
          <div
            id="product_profile_current_panel"
            role="tabpanel"
            aria-labelledby="product_profile_current_tab"
            hidden={productTab !== "current"}
            className="product_profile_product_cards_wrap"
          >
            {productTab === "current" && (
              <>
                {filteredCurrentProducts.length === 0 ? (
                  <p className="product_profile_no_products" role="status">
                    {currentProducts.length === 0
                      ? "No current products yet."
                      : productSearchQuery.trim()
                        ? "No products match your search."
                        : "No products."}
                  </p>
                ) : (
                <>
                <div className="product_profile_product_cards">
                  {paginatedCurrentProducts.map((product) => {
                    const productReport = asGeneratedReport(product.generated_profile_report);
                    const overallFromReport = getOverallScoreFromReport(product.generated_profile_report);
                    const trustScoreDisplay =
                      productReport?.trustScore != null
                        ? `${productReport.trustScore.overallScore}%`
                        : overallFromReport != null
                          ? `${overallFromReport}%`
                          : "—";
                    return (
                      <ProductProfileProductListCard
                        key={product.id}
                        product={product}
                        trustScoreDisplay={trustScoreDisplay}
                        onView={handleViewProduct}
                      />
                    );
                  })}
                </div>
                <ReportsPagination
                  totalItems={filteredCurrentProducts.length}
                  currentPage={currentProductPage}
                  pageSize={productPageSize}
                  onPageChange={setCurrentProductPage}
                  onPageSizeChange={(size) => {
                    setProductPageSize(size);
                    setCurrentProductPage(1);
                  }}
                />
                </>
                )}
              </>
            )}
          </div>
          <div
            id="product_profile_archived_panel"
            role="tabpanel"
            aria-labelledby="product_profile_archived_tab"
            hidden={productTab !== "archived"}
            className="product_profile_product_cards_wrap"
          >
            {productTab === "archived" && (
              <>
                {filteredArchivedProducts.length === 0 ? (
                  <p className="product_profile_no_products" role="status">
                    {archivedProducts.length === 0
                      ? "No archived products."
                      : productSearchQuery.trim()
                        ? "No products match your search."
                        : "No products."}
                  </p>
                ) : (
                <>
                <div className="product_profile_product_cards">
                  {paginatedArchivedProducts.map((product) => {
                    const productReport = asGeneratedReport(product.generated_profile_report);
                    const overallFromReport = getOverallScoreFromReport(product.generated_profile_report);
                    const trustScoreDisplay =
                      productReport?.trustScore != null
                        ? `${productReport.trustScore.overallScore}%`
                        : overallFromReport != null
                          ? `${overallFromReport}%`
                          : "—";
                    return (
                      <ProductProfileProductListCard
                        key={product.id}
                        product={product}
                        trustScoreDisplay={trustScoreDisplay}
                        onView={handleViewProduct}
                      />
                    );
                  })}
                </div>
                <ReportsPagination
                  totalItems={filteredArchivedProducts.length}
                  currentPage={archivedProductPage}
                  pageSize={productPageSize}
                  onPageChange={setArchivedProductPage}
                  onPageSizeChange={(size) => {
                    setProductPageSize(size);
                    setArchivedProductPage(1);
                  }}
                />
                </>
                )}
              </>
            )}
          </div>
          </div>
            </>
          )}
        </section>

    </div>
  );
}

export default ProductProfileView;
