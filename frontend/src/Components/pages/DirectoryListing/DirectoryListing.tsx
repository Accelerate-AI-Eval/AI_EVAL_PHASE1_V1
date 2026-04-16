import { useEffect, useState, useCallback } from "react";
import ProductProfileView from "../ProductProfile/ProductProfileView";
import LoadingMessage from "../../UI/LoadingMessage";
import { buildFormStateFromApi } from "../../../utils/vendorAttestationState";
import { buildVendorDataFromFormState } from "../../../utils/buildVendorDataFromFormState";
import type { VendorSelfAttestationFormState } from "../../../types/vendorSelfAttestation";
import type { GeneratedProductProfileReport } from "../../../types/generatedProductProfile";
import "../ProductProfile/product_profile.css";

const BASE_URL = import.meta.env.VITE_BASE_URL ?? "http://localhost:5003/api/v1";

/** Clear auth session and navigate to login. Call only when user explicitly chooses to log in again. */
function clearAuthAndGoToLogin() {
  sessionStorage.removeItem("bearerToken");
  sessionStorage.removeItem("userEmail");
  sessionStorage.removeItem("userRole");
  sessionStorage.removeItem("userId");
  sessionStorage.removeItem("organizationId");
  sessionStorage.removeItem("organizationName");
  sessionStorage.removeItem("userName");
  sessionStorage.removeItem("systemRole");
  sessionStorage.removeItem("userFirstName");
  sessionStorage.removeItem("userLastName");
  sessionStorage.removeItem("user_signup_completed");
  sessionStorage.removeItem("user_onboarding_completed");
  window.location.href = "/login";
}

export interface ProductProfileProduct {
  id: string;
  productName: string;
  status: "Draft" | "Completed" | "Rejected";
  updated_at: string | null;
  /** When true, this product is visible to buyers when they view the vendor. Only applicable when status is Completed. */
  visibleToBuyer?: boolean;
  /** Attestation expiry date (ISO string); when in the past, product is archived. */
  attestationExpiryAt?: string | null;
  /** Generated product profile report (trust score + sections) after attestation submit. */
  generated_profile_report?: { trustScore: unknown; sections: unknown[] };
  /** Product target sectors (public_sector, private_sector, non_profit_sector) for display. */
  sector?: string | Record<string, unknown> | null;
}

/** One item from GET /vendorSelfAttestation/generated-reports */
export interface StoredGeneratedReport {
  id: string;
  attestationId?: string;
  trustScore: number;
  report: { trustScore?: unknown; sections?: unknown[] };
  createdAt: string;
}

export const DirectoryListing = () => {
  const systemRole = (sessionStorage.getItem("systemRole") ?? "").toLowerCase().trim();
  const userRole = (sessionStorage.getItem("userRole") ?? "").toLowerCase().trim();
  const isProductProfileViewOnlyRole =
    systemRole === "system manager" ||
    systemRole === "system_manager" ||
    systemRole === "system viewer" ||
    systemRole === "system_viewer" ||
    (systemRole === "vendor" && (userRole === "engineer" || userRole === "viewer"));
  const viewOnly = isProductProfileViewOnlyRole;
  const [formState, setFormState] = useState<VendorSelfAttestationFormState | null>(null);
  const [products, setProducts] = useState<ProductProfileProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [publicListing, setPublicListing] = useState(false);
  const [publicListingUpdating, setPublicListingUpdating] = useState(false);
  const [publicListingError, setPublicListingError] = useState<string | null>(null);
  const [generatedReport, setGeneratedReport] = useState<GeneratedProductProfileReport | null>(null);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [vendorDataInput, setVendorDataInput] = useState("");
  const [sessionExpired, setSessionExpired] = useState(false);
  /** Stored generated reports (user + org); loaded from GET generated-reports */
  const [storedReports, setStoredReports] = useState<StoredGeneratedReport[]>([]);
  /** Selected stored report to display (when user clicks one in the list) */
  const [selectedStoredReport, setSelectedStoredReport] = useState<GeneratedProductProfileReport | null>(null);
  const [selectedStoredReportId, setSelectedStoredReportId] = useState<string | null>(null);
  /** Product list tab: current (non-expired attestation) vs archived (expired attestation) */
  const [productTab, setProductTab] = useState<"current" | "archived">("current");

  const fetchVendorPublicListing = useCallback(async () => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token) return;
    try {
      const res = await fetch(`${BASE_URL}/vendorOnboarding`, {
        method: "GET",
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      let data: { data?: { publicDirectoryListing?: boolean }; success?: boolean } = {};
      try {
        if (text) data = JSON.parse(text);
      } catch {
        setPublicListing(false);
        return;
      }
      setPublicListing(Boolean(res.ok && data?.data?.publicDirectoryListing === true));
    } catch {
      setPublicListing(false);
    }
  }, []);

  const fetchGeneratedReports = useCallback(async () => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token) return;
    try {
      const res = await fetch(`${BASE_URL}/vendorSelfAttestation/generated-reports`, {
        method: "GET",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success && Array.isArray(data?.data?.reports)) {
        setStoredReports(data.data.reports);
      }
    } catch {
      // leave storedReports unchanged
    }
  }, []);

  const LOADER_MIN_MS = 2500; // same as Assessments page

  const fetchProductProfileData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = options?.silent === true;
    const token = sessionStorage.getItem("bearerToken");
    if (!token) {
      if (!silent) setLoading(false);
      return;
    }
    setSessionExpired(false);
    if (!silent) setLoading(true);
    const loadStart = Date.now();
    const finishLoading = () => {
      const elapsed = Date.now() - loadStart;
      const remaining = Math.max(0, LOADER_MIN_MS - elapsed);
      setTimeout(() => setLoading(false), remaining);
    };
    try {
      const organizationId = sessionStorage.getItem("organizationId") ?? "";
      const query = organizationId ? `?organizationId=${encodeURIComponent(organizationId)}` : "";
      const response = await fetch(`${BASE_URL}/vendorSelfAttestation${query}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const text = await response.text();
      let result: {
        success?: boolean;
        attestation?: { id?: string; status?: string; product_name?: string; created_at?: string; updated_at?: string; visible_to_buyer?: boolean; expiry_at?: string | null; generated_profile_report?: unknown; sector?: unknown };
        attestations?: { id?: string; status?: string; product_name?: string; created_at?: string; updated_at?: string; visible_to_buyer?: boolean; expiry_at?: string | null; generated_profile_report?: unknown; sector?: unknown }[];
        companyProfile?: Record<string, unknown>;
        message?: string;
      } = {};
      try {
        result = text ? JSON.parse(text) : {};
      } catch {
        if (!silent) finishLoading();
        return;
      }
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          setSessionExpired(true);
          if (!silent) finishLoading();
          return;
        }
        if (!silent) finishLoading();
        return;
      }

      const items = Array.isArray(result.attestations)
        ? result.attestations
        : result.attestation
          ? [result.attestation]
          : [];
      const sorted = [...items].sort((a, b) => {
        const tA = a?.updated_at ?? a?.created_at ?? "";
        const tB = b?.updated_at ?? b?.created_at ?? "";
        return new Date(tB).getTime() - new Date(tA).getTime();
      });

      const productList: ProductProfileProduct[] = sorted
        .filter((a): a is typeof a & { id: string } => !!a?.id)
        .map((a) => {
          const apiStatus = (a.status ?? "").toUpperCase();
          const status: ProductProfileProduct["status"] =
            apiStatus === "COMPLETED" || apiStatus === "EXPIRED"
              ? "Completed"
              : apiStatus === "REJECTED"
                ? "Rejected"
                : "Draft";
          const productName = (a.product_name ?? "").trim() || "Draft";
          return {
            id: a.id,
            productName,
            status,
            updated_at: a.updated_at ?? a.created_at ?? null,
            visibleToBuyer: a.visible_to_buyer === true,
            attestationExpiryAt: a.expiry_at ?? null,
            generated_profile_report: a.generated_profile_report,
            sector: a.sector ?? undefined,
          };
        })
        .filter((p) => p.status !== "Draft");
      setProducts(productList);

      const latest = sorted[0];
      if (latest?.id) {
        const detailQuery = organizationId
          ? `?organizationId=${encodeURIComponent(organizationId)}&id=${encodeURIComponent(latest.id)}`
          : `?id=${encodeURIComponent(latest.id)}`;
        const detailRes = await fetch(`${BASE_URL}/vendorSelfAttestation${detailQuery}`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        const detailText = await detailRes.text();
        let detailResult: { success?: boolean; attestation?: Record<string, unknown>; companyProfile?: Record<string, unknown> } = {};
        try {
          detailResult = detailText ? JSON.parse(detailText) : {};
        } catch {
          if (!silent) finishLoading();
          return;
        }
        if (detailRes.ok && detailResult.success && (detailResult.attestation || detailResult.companyProfile)) {
          setFormState(buildFormStateFromApi({
            companyProfile: detailResult.companyProfile,
            attestation: detailResult.attestation,
          }));
        }
      }
    } catch {
      // leave formState null
    } finally {
      if (!silent) finishLoading();
    }
  }, []);

  const fetchProductDetail = useCallback(async (id: string): Promise<VendorSelfAttestationFormState | null> => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token) return null;
    const organizationId = sessionStorage.getItem("organizationId") ?? "";
    const query = organizationId
      ? `?organizationId=${encodeURIComponent(organizationId)}&id=${encodeURIComponent(id)}`
      : `?id=${encodeURIComponent(id)}`;
    try {
      const res = await fetch(`${BASE_URL}/vendorSelfAttestation${query}`, {
        method: "GET",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok || !data.success) return null;
      return buildFormStateFromApi({
        companyProfile: data.companyProfile,
        attestation: data.attestation,
      });
    } catch {
      return null;
    }
  }, []);

  const handlePublicListingToggle = useCallback(async () => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token) {
      setPublicListingError("Please log in to change this setting.");
      return;
    }
    const next = !publicListing;
    setPublicListingError(null);
    setPublicListingUpdating(true);
    try {
      const res = await fetch(`${BASE_URL}/vendorOnboarding/public-directory-listing`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ enabled: next }),
      });
      const text = await res.text();
      let data: { success?: boolean; message?: string } = {};
      try {
        if (text) data = JSON.parse(text);
      } catch {
        setPublicListingError(res.ok ? "Invalid response from server." : "Could not update. Try again.");
        setPublicListingUpdating(false);
        return;
      }
      if (res.ok && data?.success) {
        setPublicListing(next);
      } else {
        const message =
          res.status === 404
            ? "Complete vendor onboarding first to enable Public Directory Listing."
            : res.status === 401
              ? "Session expired. Please log in again."
              : (data?.message as string) || "Could not update. Try again.";
        setPublicListingError(message);
      }
    } catch {
      setPublicListingError("Network error. Check that the server is running and try again.");
    } finally {
      setPublicListingUpdating(false);
    }
  }, [publicListing]);

  const handleUseAttestationData = useCallback(() => {
    setGenerateError(null);
    setVendorDataInput(buildVendorDataFromFormState(formState));
  }, [formState]);

  const handleGenerateProfile = useCallback(async () => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token) {
      setGenerateError("Please log in to generate profile.");
      return;
    }
    const vendorData = vendorDataInput.trim();
    if (!vendorData) {
      setGenerateError("Enter vendor data or use \"Use my attestation data\" first.");
      return;
    }
    setGenerateError(null);
    setGenerateLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/vendorSelfAttestation/generate-profile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ vendorData, formData: formState }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.success && data?.data) {
        setGeneratedReport({
          trustScore: data.data.trustScore,
          sections: data.data.sections ?? [],
        });
        setSelectedStoredReport(null);
        setSelectedStoredReportId(null);
        fetchGeneratedReports();
      } else {
        setGenerateError((data?.message as string) || "Failed to generate profile.");
      }
    } catch {
      setGenerateError("Network error. Try again.");
    } finally {
      setGenerateLoading(false);
    }
  }, [vendorDataInput, formState, fetchGeneratedReports]);

  const handleProductVisibilityToggle = useCallback(
    async (productId: string, visible: boolean) => {
      const token = sessionStorage.getItem("bearerToken");
      if (!token) return;
      try {
        const res = await fetch(`${BASE_URL}/vendorSelfAttestation/visibility`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ attestationId: productId, visible }),
        });
        const data = res.ok ? await res.json().catch(() => ({})) : {};
        if (res.ok && data?.success) {
          await fetchProductProfileData();
        }
      } catch {
        await fetchProductProfileData();
      }
    },
    [fetchProductProfileData]
  );

  const handleSectionVisibilityChange = useCallback(
    async (
      attestationId: string,
      sectionKey:
        | "visible_ai_governance"
        | "visible_security_posture"
        | "visible_data_privacy"
        | "visible_compliance"
        | "visible_model_risk"
        | "visible_data_practices"
        | "visible_compliance_certifications"
        | "visible_operations_support"
        | "visible_vendor_management",
      value: boolean
    ) => {
      const token = sessionStorage.getItem("bearerToken");
      if (!token) return;
      await fetch(`${BASE_URL}/vendorSelfAttestation/section-visibility`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ attestationId, [sectionKey]: value }),
      });
    },
    []
  );

  useEffect(() => {
    fetchProductProfileData();
    fetchVendorPublicListing();
    fetchGeneratedReports();
  }, [fetchProductProfileData, fetchVendorPublicListing, fetchGeneratedReports]);

  /** Refetch products after a short delay so that when user lands from attestation submit,
   *  we pick up the newly generated profile and the average trust score updates without refresh. */
  useEffect(() => {
    const t = setTimeout(() => {
      fetchProductProfileData({ silent: true });
      fetchGeneratedReports();
    }, 2500);
    return () => clearTimeout(t);
  }, [fetchProductProfileData, fetchGeneratedReports]);

  /** Refetch when user returns to this tab so the average updates if a profile was generated elsewhere. */
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        fetchProductProfileData({ silent: true });
        fetchGeneratedReports();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [fetchProductProfileData, fetchGeneratedReports]);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = "AI-Q | Product Profile";
    return () => {
      document.title = prevTitle;
    };
  }, []);

  if (loading) {
    return <LoadingMessage message="Loading product profile…" />;
  }

  if (sessionExpired) {
    return (
      <div className="sec_user_page attestation_page org_settings_page product_profile_page" style={{ padding: "2rem" }}>
        <div
          className="product_profile_detail_card"
          style={{ maxWidth: "28rem", margin: "2rem auto", textAlign: "center" }}
        >
          <h2 className="product_profile_detail_title" style={{ marginBottom: "0.5rem" }}>
            Session expired
          </h2>
          <p className="product_profile_detail_subtitle" style={{ marginBottom: "1.25rem" }}>
            Your session has expired or the token is invalid. Log in again to view the Product Profile.
          </p>
          <button
            type="button"
            className="product_profile_btn_view_attestation"
            onClick={clearAuthAndGoToLogin}
          >
            Log in again
          </button>
        </div>
      </div>
    );
  }

  const reportToShow = generatedReport ?? selectedStoredReport;

  return (
    <ProductProfileView
      formState={formState}
      products={products}
      productTab={productTab}
      onProductTabChange={setProductTab}
      fetchProductDetail={fetchProductDetail}
      trustScore="A+"
      compliancePercent="92%"
      publicListing={publicListing}
      onPublicListingToggle={viewOnly ? undefined : handlePublicListingToggle}
      publicListingUpdating={publicListingUpdating}
      publicListingError={publicListingError}
      onProductVisibilityToggle={viewOnly ? undefined : handleProductVisibilityToggle}
      onSectionVisibilityChange={viewOnly ? undefined : handleSectionVisibilityChange}
      generatedReport={reportToShow}
      storedReports={storedReports}
      selectedStoredReportId={selectedStoredReportId}
      onSelectStoredReport={(report, id) => {
        setSelectedStoredReport(report);
        setSelectedStoredReportId(id);
      }}
      generateLoading={generateLoading}
      generateError={generateError}
      vendorDataInput={vendorDataInput}
      onVendorDataInputChange={setVendorDataInput}
      onUseAttestationData={handleUseAttestationData}
      onGenerateProfile={viewOnly ? undefined : handleGenerateProfile}
      viewOnly={viewOnly}
    />
  );
};
