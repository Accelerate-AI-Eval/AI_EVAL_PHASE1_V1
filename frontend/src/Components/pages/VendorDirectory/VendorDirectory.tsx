import {
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  ClipboardList,
  Code2,
  Cpu,
  Database,
  FileCheck,
  FileText,
  Filter,
  FlaskConical,
  FolderKanban,
  Search,
  ShieldCheck,
  CircleX,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  SearchX,
  MapPin,
  Award,
  Box,
} from "lucide-react";
import "../../../styles/page_tabs.css";
import "../Assessments/assessments.css";
import "../ProductProfile/product_profile.css";
import "./VendorDirectory.css";
import GeneratedProductProfileCards from "../ProductProfile/GeneratedProductProfileCards";
import LoadingMessage from "../../UI/LoadingMessage";
import {
  ReportsPagination,
  REPORTS_PAGE_SIZE,
} from "../Reports/ReportsPagination";
import type { GeneratedProductProfileReport } from "../../../types/generatedProductProfile";
import { mergeMissingProfileSectionsFromAttestation } from "../../../utils/mergeProductProfileReportFromAttestation";
import { vendorTrustGradeColorFromTrustScore } from "../../../utils/completeReportGrade";
import { formatScore2Percent } from "../../../utils/scoreFormat";

const BASE_URL =
  import.meta.env.VITE_BASE_URL ?? "http://localhost:5003/api/v1";

const defaultSectionVis = {
  aiGovernance: false,
  securityPosture: false,
  dataPrivacy: false,
  compliance: false,
  modelRisk: false,
  dataPractices: false,
  complianceCertifications: false,
  operationsSupport: false,
  vendorManagement: false,
  companyIdentity: false,
  companyReach: false,
};

/** Section ids map to buyer visibility flags (vendor toggles in View Product). */
const SECTION_ID_TO_VIS_KEY: Record<number, keyof typeof defaultSectionVis> = {
  1: "aiGovernance",
  2: "companyIdentity",
  3: "dataPrivacy",
  4: "compliance",
  5: "securityPosture",
  6: "dataPractices",
  7: "complianceCertifications",
  8: "operationsSupport",
  9: "vendorManagement",
  10: "dataPrivacy",
  11: "complianceCertifications",
  12: "companyReach",
};

function parseGeneratedReport(
  raw: unknown,
): GeneratedProductProfileReport | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    o.trustScore == null ||
    typeof o.trustScore !== "object" ||
    !Array.isArray(o.sections)
  )
    return null;
  const ts = o.trustScore as Record<string, unknown>;
  if (typeof ts.overallScore !== "number" || typeof ts.summary !== "string")
    return null;
  return {
    trustScore: {
      overallScore: ts.overallScore as number,
      label: (ts.label as string) ?? "",
      summary: ts.summary as string,
      scoreByCategory: ts.scoreByCategory as
        | Record<string, string | number>
        | undefined,
    },
    sections: o.sections as GeneratedProductProfileReport["sections"],
    scoringSource: String(
      o.scoring_source ?? o.scoringSource ?? (o.scoringResult as { scoring_source?: string } | undefined)?.scoring_source ?? "",
    ) || undefined,
  };
}

interface PublicVendor {
  id: string;
  organizationId: string;
  /** Organization name from org id (when provided by API). */
  organizationName?: string | null;
  /** Product names (completed, visible to buyer) from API. */
  productNames?: string[];
  vendorType: string;
  companyWebsite: string;
  companyDescription: string;
  headquartersLocation: string;
  vendorMaturity?: string;
  /** Sector/industry (string or JSON object from API). */
  sector?: string | Record<string, unknown> | null;
}

interface VendorProduct {
  id: string;
  productName: string;
  status: string;
  updated_at: string | null;
  /** True when vendor marked this product visible to buyers. */
  visibleToBuyer?: boolean;
  trustScore?: number;
  summary?: string;
  /** Prefer product-specific description on directory cards. */
  productDescription?: string;
  /** Product target sectors/industries (same format as vendor sector for formatSector). */
  sector?: string | Record<string, unknown> | null;
}

/** One product in the directory grid (product + vendor info for display). */
interface DirectoryProduct {
  productId: string;
  productName: string;
  status: string;
  vendorId: string;
  vendor: PublicVendor;
  /** True when vendor marked this product visible to buyers. */
  visibleToBuyer?: boolean;
  /** Trust score narrative summary for directory cards. */
  summary?: string;
  /** Prefer product-specific description on directory cards. */
  productDescription?: string;
  /** Product trust score 0–100 from generated profile report (optional). */
  trustScore?: number;
  /** Product target sectors/industries (optional; falls back to vendor sector when missing). */
  sector?: string | Record<string, unknown> | null;
}

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

function getProductDescription(detail: Record<string, unknown> | null): string {
  if (!detail) return "";
  const productDesc = detail.product_description;
  const companyDesc = detail.company_description;
  const valueProp = detail.unique_value_proposition;
  const str = (v: unknown) =>
    v != null && String(v).trim() !== "" ? String(v).trim() : "";
  return str(productDesc) || str(companyDesc) || str(valueProp) || "";
}

function productInitials(name: string): string {
  const s = (name || "Product").trim();
  if (s.length >= 2) return s.slice(0, 2).toUpperCase();
  return s ? s.toUpperCase() : "Pr";
}

function pickProductDescription(
  raw: Record<string, unknown>,
): string | undefined {
  const keys = [
    "productDescription",
    "product_description",
    "description",
    "summary",
    "shortDescription",
    "short_description",
    "unique_value_proposition",
  ] as const;
  for (const key of keys) {
    const val = raw[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return undefined;
}

function pickProductSummary(raw: Record<string, unknown>): string | undefined {
  const keys = ["summary", "trustSummary", "productSummary"] as const;
  for (const key of keys) {
    const val = raw[key];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  return undefined;
}

function parseVisibleToBuyer(
  raw: Record<string, unknown>,
): boolean | undefined {
  if (typeof raw.visibleToBuyer === "boolean") return raw.visibleToBuyer;
  if (typeof raw.visible_to_buyer === "boolean") return raw.visible_to_buyer;
  if (typeof raw.product_profile_modal_visibility === "boolean") {
    return raw.product_profile_modal_visibility;
  }
  if (typeof raw.product_profile_modal_visibility === "number") {
    return raw.product_profile_modal_visibility === 1;
  }
  if (typeof raw.product_profile_modal_visibility === "string") {
    const t = raw.product_profile_modal_visibility.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(t)) return true;
    if (["false", "0", "no", "off"].includes(t)) return false;
  }
  return undefined;
}

const SECTOR_KEYS_ORDER = [
  "public_sector",
  "private_sector",
  "non_profit_sector",
] as const;

const MAX_SECTORS_ON_CARD = 2;

type SectorParts =
  | { kind: "empty" }
  | { kind: "plain"; text: string }
  | { kind: "buckets"; buckets: string[][] };

function parseSectorStructure(
  sector: string | Record<string, unknown> | null | undefined,
): SectorParts {
  if (sector == null) return { kind: "empty" };
  if (typeof sector === "string") {
    const t = sector.trim();
    if (!t) return { kind: "empty" };
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        const parsed = JSON.parse(t) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return parseSectorStructure(parsed as Record<string, unknown>);
        }
      } catch {
        return { kind: "empty" };
      }
      return { kind: "empty" };
    }
    return { kind: "plain", text: t };
  }
  if (typeof sector === "object" && sector !== null) {
    const buckets: string[][] = [];
    for (const key of SECTOR_KEYS_ORDER) {
      const val = sector[key];
      if (Array.isArray(val) && val.length > 0) {
        const items = val
          .filter((x): x is string => typeof x === "string")
          .map((x) => x.trim())
          .filter(Boolean);
        if (items.length > 0) buckets.push(items);
      }
    }
    if (buckets.length > 0) return { kind: "buckets", buckets };
    const name = (sector.name ?? sector.sectorName ?? sector.industryName) as
      | string
      | undefined;
    if (typeof name === "string" && name.trim())
      return { kind: "plain", text: name.trim() };
  }
  return { kind: "empty" };
}

/** Full sector line for search matching and tooltips (bucket groups joined with " • "). */
function formatSector(
  sector: string | Record<string, unknown> | null | undefined,
): string {
  const p = parseSectorStructure(sector);
  if (p.kind === "empty") return "";
  if (p.kind === "plain") return p.text;
  return p.buckets
    .map((b) => b.join(", "))
    .filter(Boolean)
    .join(" • ");
}

/** Flat list of individual sector labels for the hover popover pills. */
function listSectorLabels(
  sector: string | Record<string, unknown> | null | undefined,
): string[] {
  const p = parseSectorStructure(sector);
  if (p.kind === "empty") return [];
  if (p.kind === "plain") {
    return p.text
      .split(/,\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return p.buckets.flat().map((s) => s.trim()).filter(Boolean);
}

const SECTOR_PILL_TONES = [
  "rose",
  "violet",
  "amber",
  "slate",
  "teal",
  "indigo",
  "zinc",
] as const;

function sectorPillTone(index: number): (typeof SECTOR_PILL_TONES)[number] {
  return SECTOR_PILL_TONES[index % SECTOR_PILL_TONES.length];
}

/** Overlapping sector avatar-stack colors — avoid pale yellow on light cards. */
const SECTOR_STACK_COLORS = [
  "#7dd3fc",
  "#5b21b6",
  "#ef4444",
  "#34d399",
  "#0284c7",
  "#818cf8",
  "#fb7185",
] as const;

const MAX_SECTOR_STACK_DOTS = 3;

function sectorStackColor(index: number): string {
  return SECTOR_STACK_COLORS[index % SECTOR_STACK_COLORS.length];
}

/** Card line: at most the first {@link MAX_SECTORS_ON_CARD} individual sectors, with "+N more" when truncated. */
function formatSectorCard(
  sector: string | Record<string, unknown> | null | undefined,
): string {
  const p = parseSectorStructure(sector);
  if (p.kind === "empty") return "";
  if (p.kind === "plain") {
    const partsList = p.text
      .split(/,\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (partsList.length === 0) return "";
    if (partsList.length <= MAX_SECTORS_ON_CARD) return partsList.join(", ");
    return `${partsList.slice(0, MAX_SECTORS_ON_CARD).join(", ")} +${partsList.length - MAX_SECTORS_ON_CARD} more`;
  }
  const flat = p.buckets.flat();
  if (flat.length === 0) return "";
  if (flat.length <= MAX_SECTORS_ON_CARD) return flat.join(", ");
  return `${flat.slice(0, MAX_SECTORS_ON_CARD).join(", ")} +${flat.length - MAX_SECTORS_ON_CARD} more`;
}

type VendorTab = "all" | "listed" | "my";

type IndustryFilterId =
  | "all"
  | "generative"
  | "healthcare"
  | "technology"
  | "finance"
  | "cybersecurity";

type CertificationFilterId = "all" | "soc2" | "hipaa" | "iso27001";

type BadgeFilterId = "all" | "verified" | "listed" | "under_review";

type ToolbarMenuId = "industry" | "certification" | "badges" | null;

const INDUSTRY_FILTERS: { id: IndustryFilterId; label: string }[] = [
  { id: "all", label: "All industries" },
  { id: "generative", label: "Generative AI" },
  { id: "healthcare", label: "Healthcare" },
  { id: "technology", label: "Technology" },
  { id: "finance", label: "Finance" },
  { id: "cybersecurity", label: "Cybersecurity" },
];

const CERTIFICATION_FILTERS: { id: CertificationFilterId; label: string }[] = [
  { id: "all", label: "All certifications" },
  { id: "soc2", label: "SOC2 Type II" },
  { id: "hipaa", label: "HIPAA Compliant" },
  { id: "iso27001", label: "ISO 27001" },
];

const BADGE_FILTERS: { id: BadgeFilterId; label: string }[] = [
  { id: "all", label: "All badges" },
  { id: "verified", label: "Verified" },
  { id: "listed", label: "Listed" },
  { id: "under_review", label: "Under review" },
];

type DirectoryStatusTone = "verified" | "listed" | "review" | "closed";

function directoryStatusForProduct(
  revealTrustScore: boolean,
  trustNumeric: number | undefined,
): { label: string; tone: DirectoryStatusTone; icon: "check" | "eye" | "x" | "circle" } {
  if (!revealTrustScore || trustNumeric == null) {
    return { label: "Under review", tone: "review", icon: "eye" };
  }
  const rounded = Math.round(trustNumeric);
  if (rounded >= 90) return { label: "Verified", tone: "verified", icon: "check" };
  if (rounded >= 80) return { label: "Listed", tone: "listed", icon: "eye" };
  return { label: "Needs info", tone: "closed", icon: "x" };
}

function matchesCertificationFilter(
  productId: string,
  id: CertificationFilterId,
): boolean {
  if (id === "all") return true;
  const badge = complianceBadgeForProduct(productId).toLowerCase();
  if (id === "soc2") return badge.includes("soc2");
  if (id === "hipaa") return badge.includes("hipaa");
  if (id === "iso27001") return badge.includes("iso");
  return true;
}

function matchesBadgeFilter(
  dp: DirectoryProduct,
  id: BadgeFilterId,
  revealTrust: boolean,
): boolean {
  if (id === "all") return true;
  const trustNumeric =
    dp.trustScore != null && Number.isFinite(Number(dp.trustScore))
      ? Number(dp.trustScore)
      : undefined;
  const status = directoryStatusForProduct(revealTrust, trustNumeric);
  if (id === "verified") return status.tone === "verified";
  if (id === "listed") return status.tone === "listed";
  if (id === "under_review")
    return status.tone === "review" || status.tone === "closed";
  return true;
}

function displayVendorName(v: PublicVendor): string {
  if (v.organizationName && String(v.organizationName).trim()) {
    return String(v.organizationName).trim();
  }
  if (v.organizationId && v.organizationId !== v.companyWebsite)
    return v.organizationId;
  try {
    if (v.companyWebsite) {
      const url = new URL(
        v.companyWebsite.startsWith("http")
          ? v.companyWebsite
          : `https://${v.companyWebsite}`,
      );
      return url.hostname.replace(/^www\./, "") || v.organizationId || "Vendor";
    }
  } catch {
    // ignore
  }
  return v.organizationId || "Vendor";
}

function trustGradeFromScore(score: number | undefined): {
  letter: string;
  scoreText: string;
  gradeClass: string;
  /** Trust score tier color for letter + number; null when score unavailable. */
  letterColor: string | null;
} {
  const PRODUCT_PROFILE_GREEN = "#16a34a";
  /** Pale yellow/neon greens wash out on #fcfcfc directory cards — use stronger hues. */
  const withVisibleDirectoryColor = (hex: string): string => {
    const h = hex.toLowerCase();
    if (h === "#ffba08" || h === "#facc15" || h === "#fbbf24" || h === "#f59e0b") {
      return "#c2410c";
    }
    if (h === "#ff8700") {
      return "#ea580c";
    }
    return hex;
  };
  if (score == null || Number.isNaN(score)) {
    return { letter: "—", scoreText: "—", gradeClass: "vd_premium_grade_na", letterColor: null };
  }
  const rounded = Math.round(score);
  const letterColor = withVisibleDirectoryColor(
    vendorTrustGradeColorFromTrustScore(rounded),
  );
  if (rounded >= 90)
    return {
      letter: "A",
      scoreText: formatScore2Percent(score),
      gradeClass: "vd_premium_grade_a",
      letterColor,
    };
  if (rounded >= 80)
    return {
      letter: "B",
      scoreText: formatScore2Percent(score),
      gradeClass: "vd_premium_grade_b",
      // AI Vendor Directory requirement: B grade should use Product Profile green.
      letterColor: PRODUCT_PROFILE_GREEN,
    };
  return {
    letter: "C",
    scoreText: formatScore2Percent(score),
    gradeClass: "vd_premium_grade_c",
    letterColor,
  };
}

function complianceBadgeForProduct(productId: string): string {
  const options = ["SOC2 TYPE II", "HIPAA COMPLIANT", "ISO 27001"];
  let h = 0;
  for (let i = 0; i < productId.length; i++) h += productId.charCodeAt(i);
  return options[h % options.length];
}

function categoryTagForCard(dp: DirectoryProduct): string {
  const s = formatSector(dp.sector ?? dp.vendor.sector);
  if (s) {
    const first =
      s
        .split(/[•,]/)
        .map((x) => x.trim())
        .filter(Boolean)[0] ?? s;
    const up = first.toUpperCase();
    return up.length > 24 ? `${up.slice(0, 22)}…` : up;
  }
  const vt = (dp.vendor.vendorType || "").trim();
  if (vt) return vt.toUpperCase().slice(0, 22);
  return "TECH & INFRA";
}

function matchesIndustryFilter(
  dp: DirectoryProduct,
  id: IndustryFilterId,
): boolean {
  if (id === "all") return true;
  const hay = [
    dp.productName,
    displayVendorName(dp.vendor),
    formatSector(dp.sector ?? dp.vendor.sector),
    dp.vendor.companyDescription,
    dp.vendor.vendorType,
  ]
    .join(" ")
    .toLowerCase();
  const keywords: Record<string, string[]> = {
    generative: [
      "generative",
      "genai",
      "llm",
      "gpt",
      "language model",
      "copilot",
      "diffusion",
    ],
    healthcare: [
      "health",
      "medical",
      "hipaa",
      "clinical",
      "patient",
      "care",
      "hospital",
    ],
    technology: [
      "tech",
      "software",
      "cloud",
      "infra",
      "saas",
      "platform",
      "data",
      "api",
    ],
    finance: [
      "finance",
      "fintech",
      "bank",
      "payment",
      "trading",
      "ledger",
      "insurance",
    ],
    cybersecurity: [
      "cyber",
      "security",
      "soc2",
      "soc 2",
      "iso 27001",
      "threat",
      "zero trust",
    ],
  };
  const keys = keywords[id];
  if (!keys) return true;
  return keys.some((k) => hay.includes(k));
}

const VendorDirectory = () => {
  const navigate = useNavigate();
  useEffect(() => {
    document.title = "AI-Q | Vendor Portal";
  });
  const systemRole = (sessionStorage.getItem("systemRole") ?? "")
    .toLowerCase()
    .trim();
  const isBuyer = systemRole === "buyer";
  const [vendorTab, setVendorTab] = useState<VendorTab>("all");
  const [vendors, setVendors] = useState<PublicVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myProductsTabLoading, setMyProductsTabLoading] = useState(false);
  const [myProductsTabError, setMyProductsTabError] = useState<string | null>(
    null,
  );
  const [selectedVendor, setSelectedVendor] = useState<PublicVendor | null>(
    null,
  );
  const [vendorProducts, setVendorProducts] = useState<VendorProduct[]>([]);
  const [vendorProductsLoading, setVendorProductsLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<{
    id: string;
    productName: string;
  } | null>(null);
  const [productDetail, setProductDetail] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [productSectionVisibility, setProductSectionVisibility] = useState<{
    aiGovernance: boolean;
    securityPosture: boolean;
    dataPrivacy: boolean;
    compliance: boolean;
    modelRisk: boolean;
    dataPractices?: boolean;
    complianceCertifications?: boolean;
    operationsSupport?: boolean;
    vendorManagement?: boolean;
    companyIdentity?: boolean;
    companyReach?: boolean;
  } | null>(null);
  const [productDetailLoading, setProductDetailLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  /** Catalog products (All / Listed tabs). */
  const [catalogDirectoryProducts, setCatalogDirectoryProducts] = useState<
    DirectoryProduct[]
  >([]);
  /** Assessment-linked products (My Products tab). Kept separate so sidebar counts stay correct. */
  const [myDirectoryProducts, setMyDirectoryProducts] = useState<
    DirectoryProduct[]
  >([]);
  const [directoryProductsLoading, setDirectoryProductsLoading] =
    useState(true);
  /** After first successful load, keep page chrome mounted to avoid open/blink remounts. */
  const [shellReady, setShellReady] = useState(false);
  const [industryFilter, setIndustryFilter] = useState<IndustryFilterId>("all");
  const [certificationFilter, setCertificationFilter] =
    useState<CertificationFilterId>("all");
  const [badgeFilter, setBadgeFilter] = useState<BadgeFilterId>("all");
  const [openToolbarMenu, setOpenToolbarMenu] = useState<ToolbarMenuId>(null);
  const [industriesExpanded, setIndustriesExpanded] = useState(true);
  const [listingExpanded, setListingExpanded] = useState(true);
  const [directoryListPage, setDirectoryListPage] = useState(1);
  const [directoryListPageSize, setDirectoryListPageSize] =
    useState(REPORTS_PAGE_SIZE);

  /** All Vendors: all vendors even if directory listing is off (backend returns all for system admin). */
  const fetchAllVendors = useCallback(async () => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token) {
      setError("Please log in to view the vendor directory.");
      setLoading(false);
      setDirectoryProductsLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    // Keep continuous loading through the products phase (avoids loader → empty → loader blink).
    setDirectoryProductsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/vendorDirectory?scope=all`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? "Failed to load vendors");
        setVendors([]);
        setCatalogDirectoryProducts([]);
        setDirectoryProductsLoading(false);
        return;
      }
      const nextVendors = data?.vendors ?? [];
      setVendors(nextVendors);
      if (!Array.isArray(nextVendors) || nextVendors.length === 0) {
        setCatalogDirectoryProducts([]);
        setDirectoryProductsLoading(false);
      }
    } catch {
      setError("Network or server error");
      setVendors([]);
      setCatalogDirectoryProducts([]);
      setDirectoryProductsLoading(false);
    } finally {
      setLoading(false);
    }
  }, []);

  /** Listed Vendors: vendors with at least one product marked Visible to buyers. */
  const fetchListedVendors = useCallback(async () => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token) {
      setError("Please log in to view the vendor directory.");
      setLoading(false);
      setDirectoryProductsLoading(false);
      return;
    }
    setError(null);
    setLoading(true);
    setDirectoryProductsLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/vendorDirectory`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.message ?? "Failed to load vendors");
        setVendors([]);
        setCatalogDirectoryProducts([]);
        setDirectoryProductsLoading(false);
        return;
      }
      const nextVendors = data?.vendors ?? [];
      setVendors(nextVendors);
      if (!Array.isArray(nextVendors) || nextVendors.length === 0) {
        setCatalogDirectoryProducts([]);
        setDirectoryProductsLoading(false);
      }
    } catch {
      setError("Network or server error");
      setVendors([]);
      setCatalogDirectoryProducts([]);
      setDirectoryProductsLoading(false);
    } finally {
      setLoading(false);
    }
  }, []);

  /** My Products tab: COTS assessments (buyer vendor+product, or vendor assessment product). */
  const fetchMyAssessmentProducts = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    const token = sessionStorage.getItem("bearerToken");
    if (!token) {
      if (!silent) {
        setMyProductsTabError("Please log in to view your assessment products.");
      }
      setMyDirectoryProducts([]);
      return;
    }
    if (!silent) {
      setMyProductsTabError(null);
      setMyProductsTabLoading(true);
    }
    try {
      const res = await fetch(
        `${BASE_URL}/vendorDirectory/assessment-products`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();
      if (!res.ok) {
        if (!silent) {
          setMyProductsTabError(
            data?.message ?? "Failed to load assessment products",
          );
        }
        setMyDirectoryProducts([]);
        return;
      }
      const raw = data?.products as unknown;
      if (!Array.isArray(raw)) {
        setMyDirectoryProducts([]);
        return;
      }
      const mapped: DirectoryProduct[] = raw.map((item: unknown) => {
        const o = item as Record<string, unknown>;
        const v = o.vendor as Record<string, unknown> | undefined;
        const vendor: PublicVendor = {
          id: String(v?.id ?? ""),
          organizationId: String(v?.organizationId ?? ""),
          organizationName:
            v?.organizationName != null ? String(v.organizationName) : null,
          vendorType: String(v?.vendorType ?? ""),
          companyWebsite: String(v?.companyWebsite ?? ""),
          companyDescription: String(v?.companyDescription ?? ""),
          headquartersLocation: String(v?.headquartersLocation ?? ""),
          vendorMaturity:
            v?.vendorMaturity != null ? String(v.vendorMaturity) : undefined,
          sector: (v?.sector as PublicVendor["sector"]) ?? undefined,
        };
        return {
          productId: String(o.productId ?? ""),
          productName: String(o.productName ?? "Product"),
          status: String(o.status ?? ""),
          vendorId: String(o.vendorId ?? vendor.id),
          vendor,
          /** Assessment-products API may omit flag; treat missing as visible for this private tab. */
          visibleToBuyer: parseVisibleToBuyer(o) ?? true,
          summary: pickProductSummary(o),
          productDescription: pickProductDescription(o),
          trustScore:
            typeof o.trustScore === "number" ? o.trustScore : undefined,
          sector: (o.sector as DirectoryProduct["sector"]) ?? undefined,
        };
      });
      const list = mapped.filter((dp) => dp.productId && dp.vendorId);
      setMyDirectoryProducts(list);
    } catch {
      if (!silent) {
        setMyProductsTabError("Network or server error");
      }
      setMyDirectoryProducts([]);
    } finally {
      if (!silent) {
        setMyProductsTabLoading(false);
      }
    }
  }, []);

  const fetchVendorProducts = useCallback(async (vendorId: string) => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token) return;
    setVendorProductsLoading(true);
    setVendorProducts([]);
    try {
      const res = await fetch(
        `${BASE_URL}/vendorDirectory/${vendorId}/products`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      const data = await res.json();
      if (res.ok && data?.products) setVendorProducts(data.products);
      else setVendorProducts([]);
    } catch {
      setVendorProducts([]);
    } finally {
      setVendorProductsLoading(false);
    }
  }, []);

  const fetchProductDetail = useCallback(
    async (vendorId: string, productId: string) => {
      const token = sessionStorage.getItem("bearerToken");
      if (!token) return;
      setProductDetailLoading(true);
      setProductDetail(null);
      setProductSectionVisibility(null);
      try {
        const res = await fetch(
          `${BASE_URL}/vendorDirectory/${vendorId}/products/${productId}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const data = await res.json();
        if (res.ok && data?.attestation) {
          setProductDetail(data.attestation as Record<string, unknown>);
          const vis = data?.sectionVisibility;
          setProductSectionVisibility(
            vis
              ? {
                  aiGovernance: vis.aiGovernance === true,
                  securityPosture: vis.securityPosture === true,
                  dataPrivacy: vis.dataPrivacy === true,
                  compliance: vis.compliance === true,
                  modelRisk: vis.modelRisk === true,
                  dataPractices: vis.dataPractices === true,
                  complianceCertifications:
                    vis.complianceCertifications === true,
                  operationsSupport: vis.operationsSupport === true,
                  vendorManagement: vis.vendorManagement === true,
                  companyIdentity: vis.companyIdentity === true,
                  companyReach: vis.companyReach === true,
                }
              : defaultSectionVis,
          );
        } else {
          setProductDetail(null);
          setProductSectionVisibility(null);
        }
      } catch {
        setProductDetail(null);
        setProductSectionVisibility(null);
      } finally {
        setProductDetailLoading(false);
      }
    },
    [],
  );

  /** Build flat list of products (one per product) from current vendor list for directory grid. */
  const fetchDirectoryProducts = useCallback(
    async (vendorList: PublicVendor[]) => {
      const token = sessionStorage.getItem("bearerToken");
      if (!token) {
        setCatalogDirectoryProducts([]);
        setDirectoryProductsLoading(false);
        return;
      }
      if (vendorList.length === 0) {
        setCatalogDirectoryProducts([]);
        setDirectoryProductsLoading(false);
        return;
      }
      setDirectoryProductsLoading(true);
      try {
        const results = await Promise.all(
          vendorList.map(async (v) => {
            const res = await fetch(
              `${BASE_URL}/vendorDirectory/${v.id}/products`,
              {
                headers: { Authorization: `Bearer ${token}` },
              },
            );
            const data = await res.json();
            const products: VendorProduct[] =
              res.ok && data?.products ? data.products : [];
            return products.map((p) => ({
              productId: p.id,
              productName: p.productName,
              status: p.status,
              vendorId: v.id,
              vendor: v,
              /**
               * GET /vendorDirectory/:vendorId/products only returns COMPLETED + visible_to_buyer rows,
               * but the JSON often omits the flag — treat missing as true so cards show trust & description.
               */
              visibleToBuyer:
                parseVisibleToBuyer(p as unknown as Record<string, unknown>) ??
                true,
              summary: pickProductSummary(
                p as unknown as Record<string, unknown>,
              ),
              productDescription: pickProductDescription(
                p as unknown as Record<string, unknown>,
              ),
              trustScore: p.trustScore,
              sector: p.sector,
            }));
          }),
        );
        const flat = results.flat();
        // Guard against duplicate cards when multiple vendor rows share ownership data.
        const seen = new Set<string>();
        const deduped = flat.filter((dp) => {
          const key = String(dp.productId ?? "").trim();
          if (!key) return true;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setCatalogDirectoryProducts(deduped);
      } catch {
        setCatalogDirectoryProducts([]);
      } finally {
        setDirectoryProductsLoading(false);
      }
    },
    [],
  );

  const handleVendorClick = (v: PublicVendor) => {
    setSelectedVendor(v);
    setSelectedProduct(null);
    setProductDetail(null);
    fetchVendorProducts(v.id);
  };

  const handleProductClick = (p: VendorProduct) => {
    if (!selectedVendor) return;
    setSelectedProduct({ id: p.id, productName: p.productName });
    fetchProductDetail(selectedVendor.id, p.id);
  };

  const handleDirectoryProductClick = (dp: DirectoryProduct) => {
    navigate(
      `/vendor-directory/intelligence/${encodeURIComponent(dp.vendorId)}/${encodeURIComponent(dp.productId)}`,
      {
        state: {
          vendorName: displayVendorName(dp.vendor),
          productName: dp.productName,
        },
      },
    );
  };

  const buildDetailItemsFromAttestation = (att: Record<string, unknown>) => ({
    aiGovernance: [
      [
        "AI Ethics Policy",
        formatVal(att.unique_value_proposition) || "Not specified.",
      ],
      ["AI Ethics Board", formatVal(att.human_oversight) || "Not specified."],
      [
        "Human Oversight",
        formatVal(att.human_oversight) ||
          formatVal(att.decision_autonomy) ||
          "Not specified.",
      ],
      [
        "Model Governance",
        formatVal(att.model_transparency) ||
          formatVal(att.training_data_documentation) ||
          "Not specified.",
      ],
    ],
    security: [
      [
        "Security Certifications",
        formatVal(att.security_certifications) || "Not specified.",
      ],
      [
        "Access Controls",
        formatVal(att.adversarial_security_testing) || "Not specified.",
      ],
      [
        "Vulnerability Management",
        formatVal(att.adversarial_security_testing) || "Not specified.",
      ],
      [
        "Incident History",
        formatVal(att.incident_response_plan) || "Not specified.",
      ],
    ],
    dataPrivacy: [
      ["Data Types Processed", formatVal(att.pii_handling) || "Not specified."],
      [
        "Data Retention Policy",
        formatVal(att.data_retention_policy) || "Not specified.",
      ],
      [
        "Encryption Standards",
        formatVal(att.data_residency_options) || "Not specified.",
      ],
    ],
    compliance: [
      [
        "Regulatory Frameworks",
        formatVal(att.security_certifications) || "Not specified.",
      ],
      [
        "Certifications",
        formatVal(att.security_certifications) ||
          formatVal(att.assessment_completion_level) ||
          "Not specified.",
      ],
      [
        "Audit History",
        formatVal(att.assessment_completion_level) || "Not specified.",
      ],
    ],
    modelRisk: [
      [
        "Training Data Sources",
        formatVal(att.training_data_documentation) || "Not specified.",
      ],
      [
        "Model Monitoring",
        formatVal(att.model_transparency) ||
          formatVal(att.rollback_capability) ||
          "Not specified.",
      ],
      [
        "Bias Testing",
        formatVal(att.bias_testing_approach) || "Not specified.",
      ],
      [
        "Explainability",
        formatVal(att.model_transparency) ||
          formatVal(att.decision_autonomy) ||
          "Not specified.",
      ],
    ],
  });

  useEffect(() => {
    if (vendorTab === "all") {
      if (isBuyer) fetchListedVendors();
      else fetchAllVendors();
    } else if (vendorTab === "listed") fetchListedVendors();
    else if (vendorTab === "my") fetchMyAssessmentProducts();
  }, [
    vendorTab,
    isBuyer,
    fetchAllVendors,
    fetchListedVendors,
    fetchMyAssessmentProducts,
  ]);

  /** Prefetch My Products so the Listing sidebar count stays accurate on All / Listed tabs. */
  useEffect(() => {
    void fetchMyAssessmentProducts({ silent: true });
  }, [fetchMyAssessmentProducts]);

  /** When vendor list tabs load, build flat product list. My Products tab loads products via assessment API. */
  useEffect(() => {
    if (vendorTab === "my") return;
    if (vendorTab === "all" || vendorTab === "listed") {
      if (vendors.length > 0) fetchDirectoryProducts(vendors);
      else if (!loading) {
        setCatalogDirectoryProducts([]);
      }
    }
  }, [vendorTab, vendors, fetchDirectoryProducts, loading]);

  /** Active tab product list for the main grid / filters. */
  const directoryProducts =
    vendorTab === "my" ? myDirectoryProducts : catalogDirectoryProducts;

  /** Product counts per industry (full current list; not narrowed by search). */
  const industryFilterCounts = useMemo(() => {
    const next = {} as Record<IndustryFilterId, number>;
    for (const { id } of INDUSTRY_FILTERS) {
      next[id] = directoryProducts.filter((dp) =>
        matchesIndustryFilter(dp, id),
      ).length;
    }
    return next;
  }, [directoryProducts]);

  const listingTabCounts = useMemo(
    () => ({
      all: catalogDirectoryProducts.length,
      listed: catalogDirectoryProducts.filter((dp) => dp.visibleToBuyer === true)
        .length,
      my: myDirectoryProducts.length,
    }),
    [catalogDirectoryProducts, myDirectoryProducts],
  );

  const filteredDirectoryProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const matchesProductSearch = (dp: DirectoryProduct): boolean => {
      if (!q) return true;
      if (dp.productName.toLowerCase().includes(q)) return true;
      if (displayVendorName(dp.vendor).toLowerCase().includes(q)) return true;
      const sectorText = formatSector(dp.sector ?? dp.vendor.sector);
      if (sectorText && sectorText.toLowerCase().includes(q)) return true;
      if ((dp.vendor.companyDescription ?? "").toLowerCase().includes(q))
        return true;
      if ((dp.vendor.headquartersLocation ?? "").toLowerCase().includes(q))
        return true;
      return false;
    };
    return directoryProducts
      .filter((dp) => matchesIndustryFilter(dp, industryFilter))
      .filter((dp) =>
        matchesCertificationFilter(dp.productId, certificationFilter),
      )
      .filter((dp) => {
        const canShowBuyerFields = dp.visibleToBuyer === true;
        const trustNumeric =
          dp.trustScore != null && Number.isFinite(Number(dp.trustScore))
            ? Number(dp.trustScore)
            : undefined;
        const revealTrustScore =
          trustNumeric != null && (vendorTab === "my" || canShowBuyerFields);
        return matchesBadgeFilter(dp, badgeFilter, revealTrustScore);
      })
      .filter(matchesProductSearch);
  }, [
    directoryProducts,
    industryFilter,
    certificationFilter,
    badgeFilter,
    searchQuery,
    vendorTab,
  ]);

  useEffect(() => {
    setDirectoryListPage(1);
  }, [vendorTab, industryFilter, certificationFilter, badgeFilter, searchQuery]);

  useEffect(() => {
    if (openToolbarMenu == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenToolbarMenu(null);
    };
    const onPointer = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest?.(".vd_list_toolbar_dropdown")) return;
      setOpenToolbarMenu(null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onPointer);
    };
  }, [openToolbarMenu]);

  const directoryTotalPages = Math.max(
    1,
    Math.ceil(filteredDirectoryProducts.length / directoryListPageSize),
  );

  useEffect(() => {
    if (directoryListPage > directoryTotalPages) {
      setDirectoryListPage(directoryTotalPages);
    }
  }, [directoryListPage, directoryTotalPages]);

  const paginatedDirectoryProducts = useMemo(() => {
    const start = (directoryListPage - 1) * directoryListPageSize;
    return filteredDirectoryProducts.slice(
      start,
      start + directoryListPageSize,
    );
  }, [filteredDirectoryProducts, directoryListPage, directoryListPageSize]);

  const industryLabel =
    INDUSTRY_FILTERS.find((f) => f.id === industryFilter)?.label ?? "Industry";
  const certificationLabel =
    CERTIFICATION_FILTERS.find((f) => f.id === certificationFilter)?.label ??
    "Certifications";
  const badgeLabel =
    BADGE_FILTERS.find((f) => f.id === badgeFilter)?.label ?? "Badges";

  const listingItems: {
    id: VendorTab;
    label: string;
    icon: "filter" | "file" | "code";
    count: number;
    hint: string;
  }[] = [
    {
      id: "all",
      label: "All Products",
      icon: "filter",
      count: listingTabCounts.all,
      hint: "Full catalog",
    },
    ...(!isBuyer
      ? [
          {
            id: "listed" as const,
            label: "Listed Products",
            icon: "file" as const,
            count: listingTabCounts.listed,
            hint: "Buyer-visible",
          },
        ]
      : []),
    {
      id: "my",
      label: "My Products",
      icon: "code",
      count: listingTabCounts.my,
      hint: "From assessments",
    },
  ];

  const listingSidebarTotal =
    listingItems.find((item) => item.id === vendorTab)?.count ??
    listingTabCounts.all;

  const isDirectoryLoading =
    vendorTab === "my"
      ? myProductsTabLoading
      : loading || directoryProductsLoading;
  const directoryError =
    vendorTab === "my" ? myProductsTabError : error;
  const showDirectoryWorkspace =
    !directoryError &&
    (vendorTab === "my" ||
      (!(vendorTab === "all" || vendorTab === "listed") || !error));

  /** Reveal page chrome once; later tab refreshes load in-panel only (no full remount blink). */
  useEffect(() => {
    if (!isDirectoryLoading && !shellReady) {
      setShellReady(true);
    }
  }, [isDirectoryLoading, shellReady]);

  const showPageLoader = isDirectoryLoading && !shellReady;

  const renderDirectoryList = (items: DirectoryProduct[]) => (
    <div className="vd_list_ledger">
      <div className="vd_list_colhead" aria-hidden>
        <span className="vd_list_colhead_cell">Product</span>
        <span className="vd_list_colhead_cell">Organization</span>
        <span className="vd_list_colhead_cell">Country</span>
        <span className="vd_list_colhead_cell">Grade - Score</span>
        <span className="vd_list_colhead_cell">Compliance</span>
      </div>
      <ul className="vd_list_rows" role="list">
        {items.map((dp) => {
          const canShowBuyerFields = dp.visibleToBuyer === true;
          const trustNumeric =
            dp.trustScore != null && Number.isFinite(Number(dp.trustScore))
              ? Number(dp.trustScore)
              : undefined;
          const revealTrustScore =
            trustNumeric != null && (vendorTab === "my" || canShowBuyerFields);
          const g = trustGradeFromScore(
            revealTrustScore ? trustNumeric : undefined,
          );
          const vendorName = displayVendorName(dp.vendor);
          const hq =
            (dp.vendor.headquartersLocation || "").trim() || "HQ not listed";
          const sectorLabels = listSectorLabels(dp.sector ?? dp.vendor.sector);
          const sectorCount = sectorLabels.length;
          const compliance = complianceBadgeForProduct(dp.productId);

          return (
            <li key={`${dp.vendorId}-${dp.productId}`}>
              <button
                type="button"
                className="vd_list_row"
                onClick={() => handleDirectoryProductClick(dp)}
                aria-label={`View intelligence for ${dp.productName}`}
              >
                <span className="vd_list_cell vd_list_cell--product">
                  <span className="vd_list_row_icon" aria-hidden>
                    <Box size={18} />
                  </span>
                  <span className="vd_list_name_block">
                    <span className="vd_list_row_title">{dp.productName}</span>
                    <span
                      className={`vd_list_row_labels${sectorCount > 0 ? " vd_list_row_labels--has_popover" : ""}`}
                    >
                      {sectorCount > 0 ? (
                        <span
                          className="vd_list_row_label_dots"
                          aria-hidden
                          title={sectorLabels.join(", ")}
                        >
                          {sectorLabels
                            .slice(0, MAX_SECTOR_STACK_DOTS)
                            .map((label, i) => (
                              <i
                                key={`${label}-dot-${i}`}
                                className="vd_list_dot"
                                style={{
                                  backgroundColor: sectorStackColor(i),
                                  zIndex: i + 1,
                                }}
                              />
                            ))}
                        </span>
                      ) : null}
                      <span className="vd_list_row_labels_text">
                        {sectorCount > 0
                          ? `${sectorCount} sector${sectorCount === 1 ? "" : "s"}`
                          : "No sectors"}
                      </span>
                      {sectorCount > 0 ? (
                        <span className="vd_list_labels_popover" role="tooltip">
                          <span className="vd_list_labels_popover_title">
                            Sectors
                          </span>
                          <span className="vd_list_labels_popover_pills">
                            {sectorLabels.map((label, i) => (
                              <span
                                key={`${label}-${i}`}
                                className={`vd_list_sector_pill vd_list_sector_pill--${sectorPillTone(i)}`}
                              >
                                {label}
                              </span>
                            ))}
                          </span>
                        </span>
                      ) : null}
                    </span>
                  </span>
                </span>

                <span className="vd_list_cell vd_list_cell--org">
                  <Building2 size={15} className="vd_list_cell_icon" aria-hidden />
                  <span className="vd_list_cell_text" title={vendorName}>
                    {vendorName}
                  </span>
                </span>

                <span className="vd_list_cell vd_list_cell--country">
                  <MapPin size={15} className="vd_list_cell_icon" aria-hidden />
                  <span className="vd_list_cell_text" title={hq}>
                    {hq}
                  </span>
                </span>

                <span className="vd_list_cell vd_list_cell--grade">
                  {revealTrustScore ? (
                    <span
                      className={`vd_list_grade_badge ${g.gradeClass}`}
                      title={`Trust grade ${g.letter} · score ${g.scoreText}`}
                    >
                      <Award size={12} className="vd_list_grade_badge_icon" aria-hidden />
                      <span className="vd_list_grade_badge_letter">{g.letter}</span>
                      <span className="vd_list_grade_badge_sep" aria-hidden>
                        -
                      </span>
                      <span className="vd_list_grade_badge_score">{g.scoreText}</span>
                    </span>
                  ) : (
                    <span className="vd_list_grade_badge vd_premium_grade_na" title="Grade not available">
                      <Award size={12} className="vd_list_grade_badge_icon" aria-hidden />
                      <span className="vd_list_grade_badge_letter">—</span>
                      <span className="vd_list_grade_badge_sep" aria-hidden>
                        -
                      </span>
                      <span className="vd_list_grade_badge_score">N/A</span>
                    </span>
                  )}
                </span>

                <span className="vd_list_cell vd_list_cell--compliance">
                  <span className="vd_list_row_compliance" title={compliance}>
                    <ShieldCheck size={13} aria-hidden />
                    {compliance}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );

  const renderDirectoryBody = () => {
    if (isDirectoryLoading) {
      return (
        <div
          className="vd_premium_directory_body_loading"
          role="status"
          aria-live="polite"
        >
          <LoadingMessage
            message={
              vendorTab === "my"
                ? "Loading your assessment products…"
                : loading
                  ? "Loading vendors…"
                  : "Loading products…"
            }
          />
        </div>
      );
    }
    if (vendorTab !== "my" && !loading && vendors.length === 0) {
      return (
        <div
          className="vd_empty_state vd_premium_directory_empty_fill"
          role="status"
        >
          <span className="vd_empty_state__icon" aria-hidden>
            <Building2 size={26} strokeWidth={1.75} />
          </span>
          <h3 className="vd_empty_state__title">No vendors yet</h3>
          <p className="vd_empty_state__desc">
            {vendorTab === "listed" || (vendorTab === "all" && isBuyer)
              ? "No vendors have products visible to buyers yet. Check back once listings are published."
              : "No vendors have completed onboarding yet. The directory will populate as vendors finish setup."}
          </p>
        </div>
      );
    }
    if (directoryProducts.length === 0) {
      if (vendorTab === "my") {
        return (
          <div
            className="vd_empty_state vd_premium_directory_empty_fill"
            role="status"
          >
            <span className="vd_empty_state__icon" aria-hidden>
              <ClipboardList size={26} strokeWidth={1.75} />
            </span>
            <h3 className="vd_empty_state__title">
              No assessment products yet
            </h3>
            <p className="vd_empty_state__desc">
              Products appear here after you use them in a buyer or vendor COTS
              assessment.
            </p>
          </div>
        );
      }
      return (
        <div
          className="vd_empty_state vd_premium_directory_empty_fill"
          role="status"
        >
          <span className="vd_empty_state__icon" aria-hidden>
            <FolderKanban size={26} strokeWidth={1.75} />
          </span>
          <h3 className="vd_empty_state__title">No products available</h3>
          <p className="vd_empty_state__desc">
            No products are currently visible from these vendors.
          </p>
        </div>
      );
    }
    if (filteredDirectoryProducts.length === 0) {
      return (
        <div
          className="vd_empty_state vd_premium_directory_empty_fill"
          role="status"
        >
          <span className="vd_empty_state__icon" aria-hidden>
            <SearchX size={26} strokeWidth={1.75} />
          </span>
          <h3 className="vd_empty_state__title">No matching products</h3>
          <p className="vd_empty_state__desc">
            Nothing matches your current search or filters. Try a different
            keyword, or clear filters to see the full directory.
          </p>
          <button
            type="button"
            className="vd_empty_state__action"
            onClick={() => {
              setIndustryFilter("all");
              setCertificationFilter("all");
              setBadgeFilter("all");
              setSearchQuery("");
            }}
          >
            Clear filters
          </button>
        </div>
      );
    }
    return (
      <>
        {renderDirectoryList(paginatedDirectoryProducts)}
        <footer className="vd_premium_index_footer">
          <ReportsPagination
            totalItems={filteredDirectoryProducts.length}
            currentPage={directoryListPage}
            pageSize={directoryListPageSize}
            onPageChange={setDirectoryListPage}
            onPageSizeChange={(size) => {
              setDirectoryListPageSize(size);
              setDirectoryListPage(1);
            }}
          />
        </footer>
      </>
    );
  };

  return (
    <div className="vendor_directory_page vendor_directory_page--list sec_user_page">
      {showPageLoader ? (
        <LoadingMessage
          message={
            vendorTab === "my"
              ? "Loading your assessment products…"
              : loading
                ? "Loading vendors…"
                : "Loading products…"
          }
          className="loading_message_wrapper--page"
        />
      ) : (
        <>
      <div className="vendor_directory_header page_header_align">
        <div className="page_header_row">
          <span className="icon_size_header" aria-hidden>
            <Building2 size={24} className="header_icon_svg" />
          </span>
          <div className="page_header_title_block">
            <h1 className="page_header_title">AI Vendor Directory</h1>
            <p className="page_header_subtitle">
              Explore AI products with trust scores, compliance signals, and
              sector intelligence — filter by industry, certification, and
              trust badges.
            </p>
          </div>
        </div>
      </div>

      {directoryError && (
        <div className="vendor_directory_error">{directoryError}</div>
      )}

      {showDirectoryWorkspace && (
        <div className="vd_list_workspace">
          <div className="vd_list_card vd_list_card--filters">
            <div className="vd_list_toolbar">
            <div className="vd_list_toolbar_filters">
              <div className="vd_list_toolbar_dropdown">
                <button
                  type="button"
                  className={`vd_list_filter_btn${industryFilter !== "all" ? " vd_list_filter_btn--active" : ""}`}
                  aria-haspopup="listbox"
                  aria-expanded={openToolbarMenu === "industry"}
                  onClick={() =>
                    setOpenToolbarMenu((m) =>
                      m === "industry" ? null : "industry",
                    )
                  }
                >
                  {industryFilter === "all" ? "Industry" : industryLabel}
                  <ChevronDown size={14} aria-hidden />
                </button>
                {openToolbarMenu === "industry" && (
                  <ul className="vd_list_filter_menu" role="listbox">
                    {INDUSTRY_FILTERS.map(({ id, label }) => (
                      <li key={id} role="option" aria-selected={industryFilter === id}>
                        <button
                          type="button"
                          className={
                            industryFilter === id
                              ? "vd_list_filter_option vd_list_filter_option--active"
                              : "vd_list_filter_option"
                          }
                          onClick={() => {
                            setIndustryFilter(id);
                            setOpenToolbarMenu(null);
                          }}
                        >
                          <span>{label}</span>
                          <span className="vd_list_filter_option_count">
                            {industryFilterCounts[id]}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="vd_list_toolbar_dropdown">
                <button
                  type="button"
                  className={`vd_list_filter_btn${certificationFilter !== "all" ? " vd_list_filter_btn--active" : ""}`}
                  aria-haspopup="listbox"
                  aria-expanded={openToolbarMenu === "certification"}
                  onClick={() =>
                    setOpenToolbarMenu((m) =>
                      m === "certification" ? null : "certification",
                    )
                  }
                >
                  {certificationFilter === "all"
                    ? "Certifications"
                    : certificationLabel}
                  <ChevronDown size={14} aria-hidden />
                </button>
                {openToolbarMenu === "certification" && (
                  <ul className="vd_list_filter_menu" role="listbox">
                    {CERTIFICATION_FILTERS.map(({ id, label }) => (
                      <li
                        key={id}
                        role="option"
                        aria-selected={certificationFilter === id}
                      >
                        <button
                          type="button"
                          className={
                            certificationFilter === id
                              ? "vd_list_filter_option vd_list_filter_option--active"
                              : "vd_list_filter_option"
                          }
                          onClick={() => {
                            setCertificationFilter(id);
                            setOpenToolbarMenu(null);
                          }}
                        >
                          {label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="vd_list_toolbar_dropdown">
                <button
                  type="button"
                  className={`vd_list_filter_btn${badgeFilter !== "all" ? " vd_list_filter_btn--active" : ""}`}
                  aria-haspopup="listbox"
                  aria-expanded={openToolbarMenu === "badges"}
                  onClick={() =>
                    setOpenToolbarMenu((m) => (m === "badges" ? null : "badges"))
                  }
                >
                  {badgeFilter === "all" ? "Badges" : badgeLabel}
                  <ChevronDown size={14} aria-hidden />
                </button>
                {openToolbarMenu === "badges" && (
                  <ul className="vd_list_filter_menu" role="listbox">
                    {BADGE_FILTERS.map(({ id, label }) => (
                      <li key={id} role="option" aria-selected={badgeFilter === id}>
                        <button
                          type="button"
                          className={
                            badgeFilter === id
                              ? "vd_list_filter_option vd_list_filter_option--active"
                              : "vd_list_filter_option"
                          }
                          onClick={() => {
                            setBadgeFilter(id);
                            setOpenToolbarMenu(null);
                          }}
                        >
                          {label}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="vd_list_toolbar_search_wrap">
              {/* <button
                type="button"
                className="vd_list_toolbar_icon_btn"
                aria-label="Clear filters"
                title="Clear filters"
                onClick={() => {
                  setIndustryFilter("all");
                  setCertificationFilter("all");
                  setBadgeFilter("all");
                  setSearchQuery("");
                }}
              >
                <SlidersHorizontal size={16} aria-hidden />
              </button> */}
              <div className="vd_list_search">
                <Search size={16} className="vd_list_search_icon" aria-hidden />
                <input
                  type="search"
                  className="vd_list_search_input"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  aria-label="Search directory products"
                />
              </div>
            </div>
          </div>
          </div>

          <div className="vd_list_layout">
            <aside className="vd_list_sidebar" aria-label="Directory filters">
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
                    <span className="vd_list_sidebar_group_title">Listing</span>
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
                    {listingItems.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          className={`vd_list_sidebar_subitem${vendorTab === item.id ? " vd_list_sidebar_subitem--active" : ""}`}
                          onClick={() => setVendorTab(item.id)}
                          id={
                            item.id === "all"
                              ? "vendor-tab-all"
                              : item.id === "listed"
                                ? "vendor-tab-listed"
                                : "vendor-tab-my"
                          }
                        >
                          <span className="vd_list_sidebar_subitem_label">
                            {item.icon === "filter" ? (
                              <Filter size={14} aria-hidden />
                            ) : item.icon === "file" ? (
                              <FileText size={14} aria-hidden />
                            ) : (
                              <Code2 size={14} aria-hidden />
                            )}
                            {item.label}
                          </span>
                          <span className="vd_list_sidebar_subcount">
                            {item.count}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="vd_list_sidebar_collapsed_hint">
                    {listingItems.length} scopes
                  </p>
                )}
              </section>

              <section
                className={`vd_list_sidebar_group${industriesExpanded ? " vd_list_sidebar_group--open" : ""}`}
              >
                <button
                  type="button"
                  className="vd_list_sidebar_group_header"
                  aria-expanded={industriesExpanded}
                  onClick={() => setIndustriesExpanded((v) => !v)}
                >
                  <span className="vd_list_sidebar_group_left">
                    <Filter size={16} className="vd_list_sidebar_group_icon" aria-hidden />
                    <span className="vd_list_sidebar_group_title">Industries</span>
                  </span>
                  <span className="vd_list_sidebar_group_right">
                    <span className="vd_list_sidebar_group_count">
                      {industryFilterCounts.all}
                    </span>
                    <ChevronDown
                      size={14}
                      className="vd_list_sidebar_chevron"
                      aria-hidden
                    />
                  </span>
                </button>
                {industriesExpanded && (
                  <ul className="vd_list_sidebar_sublist">
                    {INDUSTRY_FILTERS.filter((f) => f.id !== "all").map(
                      ({ id, label }) => (
                        <li key={id}>
                          <button
                            type="button"
                            className={`vd_list_sidebar_subitem${industryFilter === id ? " vd_list_sidebar_subitem--active" : ""}`}
                            onClick={() => setIndustryFilter(id)}
                          >
                            <span>{label}</span>
                            <span className="vd_list_sidebar_subcount">
                              {industryFilterCounts[id]}
                            </span>
                          </button>
                        </li>
                      ),
                    )}
                    <li>
                      <button
                        type="button"
                        className={`vd_list_sidebar_subitem${industryFilter === "all" ? " vd_list_sidebar_subitem--active" : ""}`}
                        onClick={() => setIndustryFilter("all")}
                      >
                        <span>All industries</span>
                        <span className="vd_list_sidebar_subcount">
                          {industryFilterCounts.all}
                        </span>
                      </button>
                    </li>
                  </ul>
                )}
              </section>
              </div>
            </aside>

            <div
              className="vd_list_card vd_list_card--products vd_list_main"
              id={
                vendorTab === "all"
                  ? "vendor-directory-panel-all"
                  : vendorTab === "listed"
                    ? "vendor-directory-panel-listed"
                    : "vendor-directory-panel-my"
              }
              role="tabpanel"
              aria-labelledby={
                vendorTab === "all"
                  ? "vendor-tab-all"
                  : vendorTab === "listed"
                    ? "vendor-tab-listed"
                    : "vendor-tab-my"
              }
            >
              {renderDirectoryBody()}
            </div>
          </div>
        </div>
      )}

      {/* Vendor detail modal: list of products (only those visible to buyers) */}
      {selectedVendor && (
        <div
          className="vendor_directory_modal_overlay"
          onClick={() => {
            setSelectedVendor(null);
            setVendorProducts([]);
            setSelectedProduct(null);
            setProductDetail(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="vendor_detail_modal_title"
        >
          <div
            className="vendor_directory_modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="vendor_directory_modal_header">
              <h2
                id="vendor_detail_modal_title"
                className="vendor_directory_modal_title"
              >
                {displayVendorName(selectedVendor)} – Products
              </h2>
              <button
                type="button"
                className="modal_close_btn"
                onClick={() => {
                  setSelectedVendor(null);
                  setVendorProducts([]);
                  setSelectedProduct(null);
                  setProductDetail(null);
                }}
                aria-label="Close"
              >
                <CircleX size={20} />
              </button>
            </div>
            <div className="vendor_directory_modal_body">
              {vendorProductsLoading && (
                <LoadingMessage message="Loading products…" compact />
              )}
              {!vendorProductsLoading && vendorProducts.length === 0 && (
                <p className="vendor_directory_empty_products">
                  No products are currently visible. The vendor can make
                  products visible from their Product Profile.
                </p>
              )}
              {!vendorProductsLoading && vendorProducts.length > 0 && (
                <div className="vendor_directory_products_grid">
                  {vendorProducts.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="vendor_directory_product_card"
                      onClick={() => handleProductClick(p)}
                      aria-label={`View details for ${p.productName}${p.trustScore != null ? `, Trust score ${formatScore2Percent(p.trustScore)}` : ""}`}
                    >
                      <span
                        className="vendor_directory_product_card_icon"
                        aria-hidden
                      >
                        {productInitials(p.productName)}
                      </span>
                      <div className="vendor_directory_product_card_content">
                        <span className="vendor_directory_product_card_name">
                          {p.productName}
                        </span>
                        <span className="vendor_directory_product_card_status">
                          <span
                            className="vendor_directory_product_card_status_dot"
                            aria-hidden
                          />
                          Completed
                        </span>
                        {formatSectorCard(p.sector) ? (
                          <span
                            className="vendor_directory_product_card_sector"
                            title={formatSector(p.sector) || undefined}
                          >
                            {formatSectorCard(p.sector)}
                          </span>
                        ) : null}
                      </div>
                      {p.trustScore != null && (
                        <div
                          className="vendor_directory_product_card_trust_badge"
                          aria-label={`Trust score ${formatScore2Percent(p.trustScore)}`}
                        >
                          <span className="vendor_directory_product_card_trust_label">
                            Trust score
                          </span>
                          <span className="vendor_directory_product_card_trust_value">
                            {formatScore2Percent(p.trustScore)}
                          </span>
                        </div>
                      )}
                      <ChevronRight
                        size={20}
                        className="vendor_directory_product_card_arrow"
                        aria-hidden
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Product detail modal: same detail cards as vendor View Product (no toggle) */}
      {selectedProduct && (
        <div
          className="vendor_directory_modal_overlay vendor_directory_modal_overlay_second"
          onClick={() => {
            setSelectedProduct(null);
            setProductDetail(null);
            setProductSectionVisibility(null);
            setSelectedVendor(null);
            setVendorProducts([]);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="product_detail_modal_title"
        >
          <div
            className="vendor_directory_modal vendor_directory_modal_large"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="vendor_directory_modal_header">
              <h2
                id="product_detail_modal_title"
                className="vendor_directory_modal_title"
              >
                {selectedProduct.productName}
              </h2>
              <button
                type="button"
                className="modal_close_btn"
                onClick={() => {
                  setSelectedProduct(null);
                  setProductDetail(null);
                  setProductSectionVisibility(null);
                  setSelectedVendor(null);
                  setVendorProducts([]);
                }}
                aria-label="Close"
              >
                <CircleX size={20} />
              </button>
            </div>
            <div className="vendor_directory_modal_body">
              {productDetailLoading && (
                <LoadingMessage message="Loading product details…" compact />
              )}
              {!productDetailLoading && productDetail && (
                <>
                  {/* {getProductDescription(productDetail) && (
                    <div className="vendor_directory_product_description">
                      <h3 className="vendor_directory_product_description_heading">Description</h3>
                      <p className="vendor_directory_product_description_text">
                        {getProductDescription(productDetail)}
                      </p>
                    </div>
                  )} */}
                  {productSectionVisibility &&
                    (() => {
                      const vis = productSectionVisibility;
                      const rawReport = productDetail.generated_profile_report;
                      const report = parseGeneratedReport(rawReport);
                      if (report) {
                        const mergedReport = mergeMissingProfileSectionsFromAttestation(
                          report,
                          productDetail,
                        );
                        // Only show sections the vendor has toggled on (visible to buyers) in Product Profile → View Product.
                        const visibleSectionIds = new Set(
                          [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((id) => {
                            const key = SECTION_ID_TO_VIS_KEY[id];
                            return key != null && vis[key] === true;
                          }),
                        );
                        const filteredSections = mergedReport.sections.filter((sec) =>
                          visibleSectionIds.has(sec.id),
                        );
                        if (filteredSections.length === 0) {
                          return (
                            <p className="vendor_directory_empty_products">
                              No detail sections are currently visible for this
                              product.
                            </p>
                          );
                        }
                        return (
                          <div className="generated_profile_wrap">
                            <GeneratedProductProfileCards
                              report={{
                                trustScore: mergedReport.trustScore,
                                sections: filteredSections,
                                scoringSource: mergedReport.scoringSource,
                              }}
                            />
                          </div>
                        );
                      }
                      const detail =
                        buildDetailItemsFromAttestation(productDetail);
                      const anyVisible =
                        vis.aiGovernance === true ||
                        vis.securityPosture === true ||
                        vis.dataPrivacy === true ||
                        vis.compliance === true ||
                        vis.modelRisk === true ||
                        vis.dataPractices === true ||
                        vis.complianceCertifications === true ||
                        vis.operationsSupport === true ||
                        vis.vendorManagement === true ||
                        vis.companyIdentity === true ||
                        vis.companyReach === true;
                      const detailItem = (label: string, value: string) => (
                        <li key={label} className="product_profile_detail_item">
                          <span className="product_profile_detail_label">
                            {label}:
                          </span>{" "}
                          <span className="product_profile_detail_value">
                            {truncate(value, 200)}
                          </span>
                        </li>
                      );
                      if (!anyVisible) {
                        return (
                          <p className="vendor_directory_empty_products">
                            No detail sections are currently visible for this
                            product.
                          </p>
                        );
                      }
                      return (
                        <div className="product_profile_detail_grid">
                          {vis.aiGovernance && (
                            <div className="product_profile_detail_card">
                              <div className="product_profile_detail_card_header">
                                <FlaskConical
                                  className="product_profile_detail_icon product_profile_icon_purple"
                                  size={24}
                                  aria-hidden
                                />
                                <div>
                                  <h3 className="product_profile_detail_title">
                                    AI Governance
                                  </h3>
                                  <p className="product_profile_detail_subtitle">
                                    Ethics, oversight, and governance practices.
                                  </p>
                                </div>
                              </div>
                              <ul className="product_profile_detail_list">
                                {detail.aiGovernance.map(([l, v]) =>
                                  detailItem(l, String(v)),
                                )}
                              </ul>
                            </div>
                          )}
                          {vis.securityPosture && (
                            <div className="product_profile_detail_card">
                              <div className="product_profile_detail_card_header">
                                <ShieldCheck
                                  className="product_profile_detail_icon product_profile_icon_blue"
                                  size={24}
                                  aria-hidden
                                />
                                <div>
                                  <h3 className="product_profile_detail_title">
                                    Security Posture
                                  </h3>
                                  <p className="product_profile_detail_subtitle">
                                    Security controls and certifications.
                                  </p>
                                </div>
                              </div>
                              <ul className="product_profile_detail_list">
                                {detail.security.map(([l, v]) =>
                                  detailItem(l, String(v)),
                                )}
                              </ul>
                            </div>
                          )}
                          {vis.dataPrivacy && (
                            <div className="product_profile_detail_card">
                              <div className="product_profile_detail_card_header">
                                <Database
                                  className="product_profile_detail_icon product_profile_icon_green"
                                  size={24}
                                  aria-hidden
                                />
                                <div>
                                  <h3 className="product_profile_detail_title">
                                    Data Privacy
                                  </h3>
                                  <p className="product_profile_detail_subtitle">
                                    Data handling and privacy practices.
                                  </p>
                                </div>
                              </div>
                              <ul className="product_profile_detail_list">
                                {detail.dataPrivacy.map(([l, v]) =>
                                  detailItem(l, String(v)),
                                )}
                              </ul>
                            </div>
                          )}
                          {vis.compliance && (
                            <div className="product_profile_detail_card">
                              <div className="product_profile_detail_card_header">
                                <FileCheck
                                  className="product_profile_detail_icon product_profile_icon_green"
                                  size={24}
                                  aria-hidden
                                />
                                <div>
                                  <h3 className="product_profile_detail_title">
                                    Compliance
                                  </h3>
                                  <p className="product_profile_detail_subtitle">
                                    Regulatory frameworks and certifications.
                                  </p>
                                </div>
                              </div>
                              <ul className="product_profile_detail_list">
                                {detail.compliance.map(([l, v]) =>
                                  detailItem(l, String(v)),
                                )}
                              </ul>
                            </div>
                          )}
                          {vis.modelRisk && (
                            <div className="product_profile_detail_card product_profile_detail_card_span_2">
                              <div className="product_profile_detail_card_header">
                                <Box
                                  className="product_profile_detail_icon product_profile_icon_purple"
                                  size={24}
                                  aria-hidden
                                />
                                <div>
                                  <h3 className="product_profile_detail_title">
                                    Model Risk Management
                                  </h3>
                                  <p className="product_profile_detail_subtitle">
                                    AI model governance and risk controls.
                                  </p>
                                </div>
                              </div>
                              <div className="product_profile_model_risk_columns">
                                <ul className="product_profile_detail_list">
                                  {detail.modelRisk
                                    .slice(0, 2)
                                    .map(([l, v]) =>
                                      detailItem(
                                        l,
                                        String(truncate(String(v), 180)),
                                      ),
                                    )}
                                </ul>
                                <ul className="product_profile_detail_list">
                                  {detail.modelRisk
                                    .slice(2, 4)
                                    .map(([l, v]) =>
                                      detailItem(
                                        l,
                                        String(truncate(String(v), 180)),
                                      ),
                                    )}
                                </ul>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                </>
              )}
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};

export default VendorDirectory;
