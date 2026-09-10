import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import FormField from "../../../UI/FormField";
import LoadingMessage from "../../../UI/LoadingMessage";
import FieldError from "../../../UI/FieldError";
import { applyBuyerCotsDerivedFields } from "../../../../constants/buyerCotsDerived";
import {
  clearBuyerCotsAttestationPrefill,
  mapAttestationToBuyerCotsPrefill,
  mergeAttestationPrefill,
} from "../../../../constants/buyerCotsAttestationMapping";

const BASE_URL =
  import.meta.env.VITE_BASE_URL ?? "http://localhost:5003/api/v1";

type DirectoryVendor = {
  id: string;
  organizationName?: string | null;
  companyWebsite?: string | null;
};

type DirectoryProduct = {
  id: string;
  productName: string;
  available_usage_data?: unknown;
  production_model_monitoring?: unknown;
  audit_logs?: unknown;
  training_data_document?: unknown;
  data_subject_rights?: unknown;
  hosting_deployment?: unknown;
  solution_hosted?: unknown;
};

function vendorDisplayLabel(v: DirectoryVendor): string {
  const org = (v.organizationName ?? "").trim();
  if (org) return org;
  const web = (v.companyWebsite ?? "").trim();
  if (web) return web;
  return "Vendor";
}

interface BuyerVendorProductFieldsProps {
  formData: Record<string, string>;
  setFormData: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  fieldErrors?: Record<string, string>;
  required?: boolean;
}

export default function BuyerVendorProductFields({
  formData,
  setFormData,
  fieldErrors = {},
  required = true,
}: BuyerVendorProductFieldsProps) {
  const [directoryVendors, setDirectoryVendors] = useState<DirectoryVendor[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [products, setProducts] = useState<DirectoryProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>(
    () => String(formData.vendorAttestationId ?? formData.selectedProductId ?? ""),
  );
  const appliedAttestationRef = useRef<string>("");

  const applyAttestationPrefill = useCallback(
    async (attestationId: string, overwrite = true, product?: DirectoryProduct) => {
      if (!attestationId) return;
      if (!overwrite && appliedAttestationRef.current === attestationId) return;
      if (product) {
        const mapped = mapAttestationToBuyerCotsPrefill(product as Record<string, unknown>);
        if (Object.values(mapped).some((v) => String(v ?? "").trim())) {
          appliedAttestationRef.current = attestationId;
          setFormData((prev) => mergeAttestationPrefill(prev, mapped, overwrite));
        }
      }
      const token = sessionStorage.getItem("bearerToken");
      if (!token) return;
      try {
        const res = await fetch(
          `${BASE_URL.replace(/\/$/, "")}/buyerCotsAssessment/attestation-prefill/${encodeURIComponent(attestationId)}`,
          {
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok || !json.success || !json.prefill) return;
        appliedAttestationRef.current = attestationId;
        setFormData((prev) =>
          mergeAttestationPrefill(prev, json.prefill as Record<string, string>, overwrite),
        );
      } catch {
        /* keep existing answers */
      }
    },
    [setFormData],
  );

  useEffect(() => {
    const id = String(formData.vendorAttestationId ?? formData.selectedProductId ?? "").trim();
    if (id && id !== selectedProductId) setSelectedProductId(id);
  }, [formData.vendorAttestationId, formData.selectedProductId, selectedProductId]);

  const fetchDirectoryVendors = useCallback(async () => {
    const token = sessionStorage.getItem("bearerToken");
    if (!token) {
      setDirectoryVendors([]);
      setDirectoryLoading(false);
      return;
    }
    setDirectoryLoading(true);
    try {
      const res = await fetch(`${BASE_URL.replace(/\/$/, "")}/vendorDirectory`, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDirectoryVendors([]);
        return;
      }
      const list = Array.isArray(json.vendors) ? json.vendors : [];
      setDirectoryVendors(
        list
          .map((v: Record<string, unknown>) => ({
            id: String(v.id ?? ""),
            organizationName: v.organizationName as string | null,
            companyWebsite: v.companyWebsite as string | null,
          }))
          .filter((v) => v.id),
      );
    } catch {
      setDirectoryVendors([]);
    } finally {
      setDirectoryLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDirectoryVendors();
  }, [fetchDirectoryVendors]);

  useEffect(() => {
    if (directoryVendors.length === 0) {
      setSelectedVendorId("");
      return;
    }
    const name = (formData.vendorName ?? "").trim();
    if (!name) {
      setSelectedVendorId("");
      return;
    }
    const found = directoryVendors.find((v) => vendorDisplayLabel(v) === name);
    setSelectedVendorId(found ? String(found.id) : "");
  }, [directoryVendors, formData.vendorName]);

  const loadProducts = useCallback(async (vendorId: string) => {
    if (!vendorId) {
      setProducts([]);
      return;
    }
    const token = sessionStorage.getItem("bearerToken");
    if (!token) {
      setProducts([]);
      return;
    }
    setProductsLoading(true);
    try {
      const res = await fetch(
        `${BASE_URL.replace(/\/$/, "")}/vendorDirectory/${encodeURIComponent(vendorId)}/products`,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setProducts([]);
        return;
      }
      const list = Array.isArray(json.products) ? json.products : [];
      setProducts(
        list
          .map((p: Record<string, unknown>) => ({
            id: String(p.id ?? ""),
            productName: String(p.productName ?? "Product").trim() || "Product",
            available_usage_data: p.available_usage_data,
            production_model_monitoring: p.production_model_monitoring,
            audit_logs: p.audit_logs,
            training_data_document: p.training_data_document,
            data_subject_rights: p.data_subject_rights,
            hosting_deployment: p.hosting_deployment ?? p.solution_hosted,
            solution_hosted: p.solution_hosted ?? p.hosting_deployment,
          }))
          .filter((p) => p.id),
      );
    } catch {
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedVendorId) loadProducts(selectedVendorId);
    else setProducts([]);
  }, [selectedVendorId, loadProducts]);

  useEffect(() => {
    const attestationId = String(
      formData.vendorAttestationId ?? formData.selectedProductId ?? selectedProductId ?? "",
    ).trim();
    if (!attestationId) return;
    const product = products.find((p) => p.id === attestationId);
    void applyAttestationPrefill(attestationId, true, product);
  }, [
    products,
    selectedProductId,
    formData.vendorAttestationId,
    formData.selectedProductId,
    applyAttestationPrefill,
  ]);

  useEffect(() => {
    const name = (formData.productName ?? "").trim();
    if (!name || products.length === 0) return;
    const found = products.find((p) => p.productName === name);
    if (found) setSelectedProductId(found.id);
  }, [products, formData.productName]);

  const vendorOptions = useMemo(
    () =>
      directoryVendors.map((v) => ({
        value: String(v.id),
        label: vendorDisplayLabel(v),
      })),
    [directoryVendors],
  );

  const productOptions = useMemo(() => {
    const nameCount = new Map<string, number>();
    for (const p of products) {
      nameCount.set(p.productName, (nameCount.get(p.productName) ?? 0) + 1);
    }
    return products.map((p) => ({
      value: p.id,
      label:
        (nameCount.get(p.productName) ?? 0) > 1
          ? `${p.productName} (${p.id.slice(0, 8)}…)`
          : p.productName,
    }));
  }, [products]);

  const onVendorSelect = (vendorId: string) => {
    setSelectedVendorId(vendorId);
    if (!vendorId) {
      appliedAttestationRef.current = "";
      setFormData((prev) =>
        applyBuyerCotsDerivedFields(prev, {
          vendorName: "",
          productName: "",
          vendorAttestationId: "",
          selectedProductId: "",
          unlinkedVendor: "",
          ...clearBuyerCotsAttestationPrefill(),
        }),
      );
      setSelectedProductId("");
      return;
    }
    const v = directoryVendors.find((x) => String(x.id) === vendorId);
    appliedAttestationRef.current = "";
    setFormData((prev) =>
      applyBuyerCotsDerivedFields(prev, {
        vendorName: v ? vendorDisplayLabel(v) : "",
        productName: "",
        vendorAttestationId: "",
        selectedProductId: "",
        unlinkedVendor: "false",
        ...clearBuyerCotsAttestationPrefill(),
      }),
    );
    setSelectedProductId("");
  };

  const onProductSelect = (attestationId: string) => {
    setSelectedProductId(attestationId);
    const p = products.find((x) => x.id === attestationId);
    appliedAttestationRef.current = "";
    setFormData((prev) =>
      applyBuyerCotsDerivedFields(prev, {
        productName: p ? p.productName : "",
        vendorAttestationId: attestationId,
        selectedProductId: attestationId,
        unlinkedVendor: attestationId ? "false" : "true",
        ...(attestationId ? {} : clearBuyerCotsAttestationPrefill()),
      }),
    );
    if (attestationId) {
      void applyAttestationPrefill(attestationId, true, p);
    }
  };

  return (
    <>
      <div className="form_fields_vendor buyer_cots_field">
        <FormField
          label="Which vendor are you evaluating?"
          mandatory={required}
          tooltipText="Choose from the AI Vendor Directory, or type a name if not listed"
        >
          {directoryLoading ? (
            <LoadingMessage message="Loading AI Vendor Directory…" />
          ) : (
            <select
              className={`select_input ${!selectedVendorId ? "select_input--placeholder" : ""}`}
              value={selectedVendorId}
              onChange={(e) => onVendorSelect(e.target.value)}
              aria-label="Vendor"
            >
              <option value="">Select a vendor from the AI Vendor Directory</option>
              {vendorOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
        </FormField>
        {!selectedVendorId && (formData.vendorName ?? "").trim() !== "" && (
          <p className="buyer_cots_directory_hint">
            Previously entered vendor does not match the directory. Choose a vendor
            above or keep the manual name below. The vendor-risk half will be marked
            unverified.
          </p>
        )}
        {!selectedVendorId && (
          <div style={{ marginTop: "0.75rem" }}>
            <FormField
              label="Or enter vendor name manually"
              tooltipText="If the vendor is not listed in the directory"
            >
              <input
                type="text"
                className="select_input"
                value={formData.vendorName ?? ""}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    vendorName: e.target.value,
                    unlinkedVendor: e.target.value.trim() ? "true" : "",
                    vendorAttestationId: "",
                    selectedProductId: "",
                  }))
                }
                placeholder="Type the vendor name"
                aria-label="Vendor name manual entry"
              />
            </FormField>
          </div>
        )}
        {fieldErrors.vendorName && <FieldError message={fieldErrors.vendorName} />}
      </div>

      <div className="form_fields_vendor buyer_cots_field">
        <FormField
          label="What is the specific product or solution name?"
          mandatory={required}
          tooltipText="Select a product after choosing a directory vendor, or type the product name"
        >
          {!selectedVendorId ? (
            <input
              type="text"
              className="select_input"
              value={formData.productName ?? ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  productName: e.target.value,
                  unlinkedVendor: prev.vendorName?.trim() ? "true" : prev.unlinkedVendor,
                }))
              }
              placeholder="Enter the product name"
              aria-label="Product name"
            />
          ) : productsLoading ? (
            <LoadingMessage message="Loading products…" />
          ) : productOptions.length > 0 ? (
            <select
              className={`select_input ${!selectedProductId ? "select_input--placeholder" : ""}`}
              value={selectedProductId}
              onChange={(e) => onProductSelect(e.target.value)}
              aria-label="Product"
            >
              <option value="">Select the product or solution for this vendor</option>
              {productOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              value={formData.productName ?? ""}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  productName: e.target.value,
                }))
              }
              placeholder="No public products listed for this vendor. Enter product name."
              className="select_input"
              aria-label="Product name"
            />
          )}
        </FormField>
        {fieldErrors.productName && <FieldError message={fieldErrors.productName} />}
      </div>
    </>
  );
}
