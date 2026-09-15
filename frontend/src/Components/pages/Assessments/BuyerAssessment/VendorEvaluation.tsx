import { useEffect, useState, useCallback, useMemo } from "react";
import HeaderForBuyer from "../../BuyerOnboarding/HeaderForBuyer";
import { BUYER_COTS_FIELD_KEYS } from "../../../../constants/buyerCotsAssessmentKeys";
import BuyerCotsField from "./BuyerCotsField";
import FormField from "../../../UI/FormField";
import LoadingMessage from "../../../UI/LoadingMessage";
import FieldError from "../../../UI/FieldError";

const BASE_URL =
  import.meta.env.VITE_BASE_URL ?? "http://localhost:5003/api/v1";

const OTHER_SPECIFY_BELOW = "Other (Specify Below)";

type DirectoryVendor = {
  id: string;
  organizationName?: string | null;
  companyWebsite?: string | null;
};

type DirectoryProduct = {
  id: string;
  productName: string;
};

function vendorDisplayLabel(v: DirectoryVendor): string {
  const org = (v.organizationName ?? "").trim();
  if (org) return org;
  const web = (v.companyWebsite ?? "").trim();
  if (web) return web;
  return "Vendor";
}

function parseIntegrationSystemsValue(value: unknown): string[] {
  if (value == null || value === "") return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

const VendorEvaluation = ({
  data,
  formData,
  setFormData,
  readOnlyKeys = [],
  fieldErrors,
  title,
  subTitle,
  icon,
}) => {
  const keys = BUYER_COTS_FIELD_KEYS.vendorEvaluation;
  const isReadOnly = (key) => readOnlyKeys.includes(key);
  const integrationSystemsSelected = parseIntegrationSystemsValue(
    formData.integrationSystems,
  );
  const selectedOtherSpecifyBelow = integrationSystemsSelected.includes(
    OTHER_SPECIFY_BELOW,
  );

  const [directoryVendors, setDirectoryVendors] = useState<DirectoryVendor[]>(
    [],
  );
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [selectedVendorId, setSelectedVendorId] = useState<string>("");
  const [products, setProducts] = useState<DirectoryProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string>(
    () => String(formData.vendorAttestationId ?? formData.selectedProductId ?? ""),
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
        list.map((v: Record<string, unknown>) => ({
          id: String(v.id ?? ""),
          organizationName: v.organizationName as string | null,
          companyWebsite: v.companyWebsite as string | null,
        })).filter((v) => v.id),
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

  /** Match saved vendor name to a directory vendor after vendors or draft name changes */
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
    const found = directoryVendors.find(
      (v) => vendorDisplayLabel(v) === name,
    );
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
        list.map((p: Record<string, unknown>) => ({
          id: String(p.id ?? ""),
          productName: String(p.productName ?? "Product").trim() || "Product",
        })).filter((p) => p.id),
      );
    } catch {
      setProducts([]);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedVendorId) loadProducts(selectedVendorId);
    else {
      setProducts([]);
      setSelectedProductId("");
    }
  }, [selectedVendorId, loadProducts]);

  /** Match saved product name to a directory product */
  useEffect(() => {
    const name = (formData.productName ?? "").trim();
    if (!name || products.length === 0) {
      setSelectedProductId("");
      return;
    }
    const found = products.find((p) => p.productName === name);
    setSelectedProductId(found?.id ?? "");
  }, [products, formData.productName]);

  const useDirectoryPickers =
    directoryVendors.length > 0 && !isReadOnly("vendorName");

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
      setFormData((prev) => ({ ...prev, vendorName: "", productName: "" }));
      setSelectedProductId("");
      return;
    }
    const v = directoryVendors.find((x) => String(x.id) === vendorId);
    const label = v ? vendorDisplayLabel(v) : "";
    setFormData((prev) => ({
      ...prev,
      vendorName: label,
      productName: "",
    }));
    setSelectedProductId("");
  };

  const onProductSelect = (attestationId: string) => {
    setSelectedProductId(attestationId);
    const p = products.find((x) => x.id === attestationId);
    setFormData((prev) => ({
      ...prev,
      productName: p ? p.productName : "",
      vendorAttestationId: attestationId,
      selectedProductId: attestationId,
    }));
  };

  return (
    <>
      <HeaderForBuyer
        className="header_for_vendor"
        title_vendor={title ?? "Vendor Evaluation"}
        sub_title_vendor={subTitle}
        icon={icon}
      />
      <div>
        {keys.map((key, i) => {
          const config = data[i];

          if (key === "vendorName" && useDirectoryPickers) {
            return (
              <div key={key} className="form_fields_vendor buyer_cots_field">
                <FormField
                  label={config.label}
                  mandatory={config.required === "true"}
                  tooltipText={config.placeholder}
                >
                  {directoryLoading ? (
                    <LoadingMessage message="Loading AI Vendor Directory…" />
                  ) : (
                    <select
                      className={`select_input ${!selectedVendorId ? "select_input--placeholder" : ""}`}
                      value={selectedVendorId}
                      onChange={(e) => onVendorSelect(e.target.value)}
                      aria-label={config.label}
                    >
                      <option value="">
                        Select a vendor from the AI Vendor Directory
                      </option>
                      {vendorOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>
                {!selectedVendorId &&
                  (formData.vendorName ?? "").trim() !== "" && (
                    <p
                      className="buyer_cots_directory_hint"
                      style={{
                        fontSize: "0.8125rem",
                        color: "#6b7280",
                        marginTop: "0.5rem",
                      }}
                    >
                      Previously entered vendor does not match the directory.
                      Choose a vendor above or clear the name below.
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
                            productName: selectedVendorId
                              ? prev.productName
                              : "",
                          }))
                        }
                        placeholder={config.placeholder}
                        aria-label="Vendor name manual entry"
                      />
                    </FormField>
                  </div>
                )}
                {fieldErrors?.[key] && (
                  <FieldError message={fieldErrors[key]} />
                )}
              </div>
            );
          }

          if (key === "productName" && useDirectoryPickers) {
            return (
              <div key={key} className="form_fields_vendor buyer_cots_field">
                <FormField
                  label={config.label}
                  mandatory={config.required === "true"}
                  tooltipText={config.placeholder}
                >
                  {!selectedVendorId ? (
                    (formData.vendorName ?? "").trim() ? (
                      <input
                        type="text"
                        className="select_input"
                        value={formData.productName ?? ""}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            productName: e.target.value,
                          }))
                        }
                        placeholder={config.placeholder}
                        aria-label={config.label}
                      />
                    ) : (
                      <select
                        className="select_input select_input--placeholder"
                        value=""
                        disabled
                        aria-label={config.label}
                      >
                        <option value="">Select a vendor first</option>
                      </select>
                    )
                  ) : productsLoading ? (
                    <LoadingMessage message="Loading products…" />
                  ) : (
                    <select
                      className={`select_input ${!selectedProductId ? "select_input--placeholder" : ""}`}
                      value={selectedProductId}
                      onChange={(e) => onProductSelect(e.target.value)}
                      disabled={productOptions.length === 0}
                      aria-label={config.label}
                    >
                      <option value="">
                        {productOptions.length > 0
                          ? "Select the product or solution for this vendor"
                          : "No products listed for this vendor"}
                      </option>
                      {productOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                </FormField>
                {fieldErrors?.[key] && (
                  <FieldError message={fieldErrors[key]} />
                )}
              </div>
            );
          }

          return (
            <div key={key} className="form_fields_vendor buyer_cots_field">
              <BuyerCotsField
                fieldKey={key}
                label={config.label}
                placeholder={config.placeholder}
                required={config.required}
                options={config.options}
                multiselect={config.multiselect}
                value={formData[key]}
                onChange={(val) =>
                  setFormData((prev) => ({ ...prev, [key]: val }))
                }
                readOnly={isReadOnly(key)}
                errorMessage={fieldErrors?.[key]}
              />
              {key === "integrationSystems" && (
                <div
                  className="form_fields_vendor buyer_cots_field integration_systems_other_wrapper"
                  style={{ marginTop: "0.75rem" }}
                  role="group"
                  aria-labelledby="integration-systems-other-label"
                >
                  <p
                    id="integration-systems-other-label"
                    className="integration_systems_other_context"
                    style={{
                      marginBottom: "0.5rem",
                      fontSize: "0.875rem",
                      color: "#6b7280",
                    }}
                  >
                    {selectedOtherSpecifyBelow
                      ? 'If you selected "Other (Specify Below)" above:'
                      : "Optional: specify other systems not listed above"}
                  </p>
                  <FormField
                    label="Please specify other systems"
                    tooltipText="Specify other systems to integrate with"
                  >
                    <input
                      type="text"
                      value={formData.integrationSystemsOther ?? ""}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          integrationSystemsOther: e.target.value.slice(0, 300),
                        }))
                      }
                      maxLength={300}
                      placeholder="Enter other systems (max 300 characters)"
                      className="select_input"
                      style={{ width: "100%" }}
                      aria-label="Other integration systems details"
                      readOnly={isReadOnly(key)}
                    />
                  </FormField>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
};

export default VendorEvaluation;
