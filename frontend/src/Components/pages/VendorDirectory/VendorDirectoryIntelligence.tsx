import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Building2, CircleChevronLeft, Sparkles } from "lucide-react";
import type { GeneratedProductProfileReport } from "../../../types/generatedProductProfile";
import GeneratedProductProfileCards from "../ProductProfile/GeneratedProductProfileCards";
import "../../../styles/card.css";
import "./VendorDirectory.css";

const BASE_URL = import.meta.env.VITE_BASE_URL ?? "http://localhost:5003/api/v1";

type SectionVisibility = {
  aiGovernance: boolean;
  securityPosture: boolean;
  dataPrivacy: boolean;
  compliance: boolean;
  modelRisk: boolean;
  dataPractices: boolean;
  complianceCertifications: boolean;
  operationsSupport: boolean;
  vendorManagement: boolean;
};

const SECTION_ID_TO_VIS_KEY: Record<number, keyof SectionVisibility> = {
  1: "aiGovernance",
  2: "securityPosture",
  3: "dataPrivacy",
  4: "compliance",
  5: "modelRisk",
  6: "dataPractices",
  7: "complianceCertifications",
  8: "operationsSupport",
  9: "vendorManagement",
};

function parseGeneratedReport(raw: unknown): GeneratedProductProfileReport | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!obj.trustScore || typeof obj.trustScore !== "object" || !Array.isArray(obj.sections)) return null;
  const ts = obj.trustScore as Record<string, unknown>;
  if (typeof ts.overallScore !== "number" || typeof ts.summary !== "string") return null;
  return {
    trustScore: {
      overallScore: ts.overallScore,
      label: typeof ts.label === "string" ? ts.label : "",
      summary: ts.summary,
      scoreByCategory: ts.scoreByCategory as Record<string, string | number> | undefined,
    },
    sections: obj.sections as GeneratedProductProfileReport["sections"],
  };
}

const VendorDirectoryIntelligence = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { vendorId = "", productId = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<GeneratedProductProfileReport | null>(null);
  const [sectionVisibility, setSectionVisibility] = useState<SectionVisibility | null>(null);
  const [productName, setProductName] = useState<string>(
    ((location.state as { productName?: string } | null)?.productName ?? "").trim(),
  );
  useEffect(() => {
    document.title = "AI Eval | Vendor Intelligence";
  }, []);

  useEffect(() => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token || !vendorId || !productId) {
      setError("Unable to load product intelligence.");
      setLoading(false);
      return;
    }

    let cancelled = false;
    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `${BASE_URL}/vendorDirectory/${encodeURIComponent(vendorId)}/products/${encodeURIComponent(productId)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = await res.json();
        if (!res.ok || !data?.attestation) {
          if (!cancelled) setError(data?.message ?? "Unable to load product intelligence.");
          return;
        }
        const att = data.attestation as Record<string, unknown>;
        const parsed = parseGeneratedReport(att.generated_profile_report);
        if (!cancelled) {
          if (!productName) setProductName(String(att.product_name ?? "Product"));
          setReport(parsed);
          const vis = data.sectionVisibility as Record<string, unknown> | undefined;
          setSectionVisibility(
            vis
              ? {
                  aiGovernance: vis.aiGovernance === true,
                  securityPosture: vis.securityPosture === true,
                  dataPrivacy: vis.dataPrivacy === true,
                  compliance: vis.compliance === true,
                  modelRisk: vis.modelRisk === true,
                  dataPractices: vis.dataPractices === true,
                  complianceCertifications: vis.complianceCertifications === true,
                  operationsSupport: vis.operationsSupport === true,
                  vendorManagement: vis.vendorManagement === true,
                }
              : null,
          );
        }
      } catch {
        if (!cancelled) setError("Network or server error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchDetail();
    return () => {
      cancelled = true;
    };
  }, [vendorId, productId, productName]);

  const visibleReport = useMemo(() => {
    if (!report || !sectionVisibility) return report;
    const visibleSectionIds = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((id) => {
        const key = SECTION_ID_TO_VIS_KEY[id];
        return key != null && sectionVisibility[key] === true;
      }),
    );
    return {
      ...report,
      sections: report.sections.filter((sec) => visibleSectionIds.has(sec.id)),
    };
  }, [report, sectionVisibility]);

  return (
    <div className="vendor_directory_page vendor_directory_page--premium sec_user_page">
      <div className="vendor_directory_header page_header_align">
        <div className="page_header_row">
          <span className="icon_size_header" aria-hidden>
            <Building2 size={24} className="header_icon_svg" />
          </span>
          <div className="page_header_title_block">
            <h1 className="page_header_title">Product Intelligence</h1>
          </div>
        </div>
      </div>

      <button
        type="button"
        className="vendor_intel_back_link"
        onClick={() => navigate("/vendor-directory")}
        aria-label="Back to AI Vendor Directory"
      >
        <CircleChevronLeft size={18} aria-hidden />
        Back to AI Vendor Directory
      </button>

      {loading && <div className="vendor_directory_loading">Loading product intelligence...</div>}
      {error && !loading && <div className="vendor_directory_error">{error}</div>}
      {!loading && !error && !visibleReport && (
        <div className="vendor_directory_empty">No intelligence report is available for this product.</div>
      )}
      {!loading && !error && visibleReport && (
        <>
          <section className="vendor_intel_hero" aria-label="Product intelligence overview">
            <div className="vendor_intel_hero_identity">
              <span className="vendor_intel_hero_logo" aria-hidden>
                <Sparkles size={22} />
              </span>
              <div className="vendor_intel_hero_title_block">
                <h2 className="vendor_intel_hero_product">{productName || "Product"}</h2>
              </div>
            </div>
            <div className="vendor_intel_hero_score" aria-label={`Trust score ${visibleReport.trustScore.overallScore} out of 100`}>
              <span className="vendor_intel_hero_score_label">Trust Score</span>
              <div className="vendor_intel_hero_score_value_wrap">
                <span className="vendor_intel_hero_score_value">{visibleReport.trustScore.overallScore}</span>
                <span className="vendor_intel_hero_score_scale">/100</span>
              </div>
            </div>
          </section>

          <div className="generated_profile_wrap">
            <GeneratedProductProfileCards report={visibleReport} showAtAGlance />
          </div>
        </>
      )}
      {!loading && !error && visibleReport && visibleReport.sections.length === 0 && (
        <div className="vendor_directory_empty">No detail sections are currently visible for this product.</div>
      )}
    </div>
  );
};

export default VendorDirectoryIntelligence;
