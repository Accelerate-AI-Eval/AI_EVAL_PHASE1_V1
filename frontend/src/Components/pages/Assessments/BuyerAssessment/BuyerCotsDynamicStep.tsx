import { useEffect } from "react";
import HeaderForBuyer from "../../BuyerOnboarding/HeaderForBuyer";
import FormField from "../../../UI/FormField";
import FileUpload from "../../../UI/FileUpload";
import FieldError from "../../../UI/FieldError";
import ChipMultiSelect from "../../../UI/ChipMultiSelect";
import { MAX_FILE_SIZE_BYTES } from "../../../../constants/vendorAttestationDocumentConstants";
import type { BuyerCotsFieldConfig, BuyerCotsSectionConfig } from "../../../../constants/buyerCotsFormSchema";
import {
  getBuyerCotsExclusiveValue,
  getBuyerCotsFieldOptions,
  INTEGRATION_ACCESS_LEVEL_OPTIONS,
} from "../../../../constants/buyerCotsOptions";
import { toast } from "react-toastify";
import {
  applyBuyerCotsDerivedFields,
  parseEvidenceFilesByCategory,
  pruneEvidenceFilesByCategory,
} from "../../../../constants/buyerCotsDerived";
import { flattenOnboardingSectorIndustries } from "../../../../constants/buyerCotsOnboardingMapping";
import {
  BUYER_COTS_ATTESTATION_PREFILL_KEYS,
  isBuyerCotsAttestationLockedField,
} from "../../../../constants/buyerCotsAttestationMapping";
import BuyerCotsField from "./BuyerCotsField";
import BuyerVendorProductFields from "./BuyerVendorProductFields";
import "../../VendorAttestations/tabs/TabComplianceCertifications.css";

function parseList(value: unknown): string[] {
  if (value == null || value === "") return [];
  if (Array.isArray(value)) return value.map(String);
  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function parseAccessLevels(value: unknown): Record<string, string> {
  if (value == null || value === "") return {};
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed as Record<string, unknown>).map(([k, v]) => [k, String(v ?? "")]),
      );
    }
  } catch {
    /* ignore */
  }
  return {};
}

function isFieldVisible(field: BuyerCotsFieldConfig, formData: Record<string, string>): boolean {
  if (!field.showWhen) return true;
  const raw = String(formData[field.showWhen.key] ?? "");
  if (raw.includes(field.showWhen.includes)) return true;
  return parseList(raw).some((v) => v.includes(field.showWhen!.includes));
}

function parseFileNames(value: string | undefined): string[] {
  if (value == null || String(value).trim() === "") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

interface BuyerCotsDynamicStepProps {
  section: BuyerCotsSectionConfig;
  formData: Record<string, string>;
  setFormData: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  fieldErrors?: Record<string, string>;
  title?: string;
  subTitle?: string;
  icon?: React.ReactNode;
}

export default function BuyerCotsDynamicStep({
  section,
  formData,
  setFormData,
  fieldErrors = {},
  title,
  subTitle,
  icon,
}: BuyerCotsDynamicStepProps) {
  function commit(patch: Record<string, string>) {
    setFormData((prev) => applyBuyerCotsDerivedFields(prev, patch));
  }

  useEffect(() => {
    const patch: Record<string, string> = {};
    for (const field of section.fields) {
      if (!(BUYER_COTS_ATTESTATION_PREFILL_KEYS as readonly string[]).includes(field.key)) continue;
      const attested = String(formData[`${field.key}Attested`] ?? "").trim();
      if (!attested && field.inputType !== "confirmDispute") continue;
      const current = String(formData[field.key] ?? "").trim();
      if (attested && current !== attested) {
        patch[field.key] = attested;
      }
    }
    if (Object.keys(patch).length) {
      setFormData((prev) => applyBuyerCotsDerivedFields(prev, patch));
    }
  }, [section.fields, formData, setFormData]);

  return (
    <>
      <HeaderForBuyer
        className="header_for_vendor"
        title_vendor={title ?? section.label}
        sub_title_vendor={subTitle ?? section.subTitle}
        icon={icon}
      />
      <div>
        {section.fields.map((field) => {
          if (!isFieldVisible(field, formData)) return null;
          const options = getBuyerCotsFieldOptions(field.optionsKey);
          const exclusive = field.exclusiveValue ?? getBuyerCotsExclusiveValue(field.optionsKey);
          const error = fieldErrors[field.key];

          if (field.inputType === "industrySector") {
            const labels = flattenOnboardingSectorIndustries(formData.industrySector);
            return (
              <div key={field.key} className="form_fields_vendor buyer_cots_field">
                <FormField
                  label={field.label}
                  mandatory={field.required}
                  tooltipText={field.placeholder}
                >
                  <textarea
                    id="buyer-cots-industry-sector"
                    readOnly
                    className="input_readonly"
                    rows={labels.length > 3 ? 4 : 2}
                    style={{ width: "100%", height: "auto", resize: "none" }}
                    value={labels.join(", ")}
                    placeholder={field.placeholder}
                    aria-label={field.label}
                  />
                </FormField>
                {error && <FieldError message={error} />}
              </div>
            );
          }

          if (field.inputType === "evidenceHold") {
            const noneValue = exclusive ?? "Nothing yet";
            const selected = parseList(formData[field.key]);
            const byCategory = parseEvidenceFilesByCategory(formData.vendorComplianceDocumentation);
            const uploadCategories = selected.filter((cat) => cat !== noneValue);
            const nothingSelected = selected.includes(noneValue);
            return (
              <div key={field.key} className="form_fields_vendor buyer_cots_field">
                <FormField
                  label={field.label}
                  mandatory={field.required}
                  tooltipText={field.placeholder}
                >
                  <p style={{ fontSize: "0.875rem", color: "#6b7280", marginBottom: "0.5rem" }}>
                    Select the regulatory documents you currently hold. Optionally upload a copy of each. Max 10MB per file.
                  </p>
                  <ChipMultiSelect
                    id={field.key}
                    labelName=""
                    options={options}
                    value={selected}
                    onChange={(selectedValues) => {
                      const nextFiles = pruneEvidenceFilesByCategory(
                        selectedValues,
                        byCategory,
                        noneValue,
                      );
                      commit({
                        [field.key]: JSON.stringify(selectedValues),
                        vendorComplianceDocumentation: JSON.stringify(nextFiles),
                      });
                    }}
                    globalExclusiveValue={noneValue}
                  />
                  {error && <FieldError message={error} />}
                </FormField>
                {nothingSelected && (
                  <p style={{ marginTop: "0.75rem", fontSize: "0.875rem", color: "#6b7280" }}>
                    No artefacts selected. File upload is not required.
                  </p>
                )}
                {uploadCategories.length > 0 && (
                  <div style={{ marginTop: "1rem" }} className="compliance_cert_categories">
                    {uploadCategories.map((category) => {
                      const docs = byCategory[category] ?? [];
                      return (
                        <div
                          key={category}
                          className="form_fields_vendor compliance_cert_category_block"
                          style={{ marginBottom: "1rem" }}
                        >
                          <FormField
                            label={category}
                            mandatory={false}
                            tooltipText={`Upload one file for ${category}. Max 10MB.`}
                          >
                            <FileUpload
                              accept=".pdf,.doc,.docx,.ppt,.pptx"
                              maxSizeBytes={MAX_FILE_SIZE_BYTES}
                              maxFiles={1}
                              value={docs}
                              onFilesChange={(fileNames) => {
                                commit({
                                  vendorComplianceDocumentation: JSON.stringify({
                                    ...byCategory,
                                    [category]: fileNames,
                                  }),
                                });
                              }}
                              onValidationError={(msg) => msg && toast.error(msg)}
                              disabled={docs.length >= 1}
                            />
                          </FormField>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          if (field.inputType === "vendorProduct") {
            return (
              <BuyerVendorProductFields
                key={field.key}
                formData={formData}
                setFormData={setFormData}
                fieldErrors={fieldErrors}
                required={field.required}
              />
            );
          }

          if (field.inputType === "targetOutcome") {
            return (
              <div key={field.key} className="form_fields_vendor buyer_cots_field">
                <FormField
                  label={field.label}
                  mandatory={field.required}
                  tooltipText={field.placeholder}
                >
                  <div className="vendor_incident_card buyer_cots_subfields">
                    <div className="buyer_cots_subfield">
                      <label className="labelSection" htmlFor="targetOutcomeMetric">
                        Metric name
                      </label>
                      <input
                        id="targetOutcomeMetric"
                        type="text"
                        className="input_field"
                        style={{ width: "100%" }}
                        maxLength={field.maxLength ?? 120}
                        value={formData.targetOutcomeMetric ?? ""}
                        onChange={(e) => commit({ targetOutcomeMetric: e.target.value })}
                        placeholder="Example: average claims cycle time (days)"
                      />
                      {fieldErrors.targetOutcomeMetric && (
                        <FieldError message={fieldErrors.targetOutcomeMetric} />
                      )}
                    </div>
                    <div className="buyer_cots_subfield">
                      <label className="labelSection" htmlFor="targetOutcomeBaseline">
                        Today's number
                      </label>
                      <input
                        id="targetOutcomeBaseline"
                        type="text"
                        className="input_field"
                        style={{ width: "100%" }}
                        value={formData.targetOutcomeBaseline ?? ""}
                        onChange={(e) => commit({ targetOutcomeBaseline: e.target.value })}
                        placeholder="Example: 45"
                      />
                      {fieldErrors.targetOutcomeBaseline && (
                        <FieldError message={fieldErrors.targetOutcomeBaseline} />
                      )}
                    </div>
                    <div className="buyer_cots_subfield">
                      <label className="labelSection" htmlFor="targetOutcomeTarget">
                        Year-one target
                      </label>
                      <input
                        id="targetOutcomeTarget"
                        type="text"
                        className="input_field"
                        style={{ width: "100%" }}
                        value={formData.targetOutcomeTarget ?? ""}
                        onChange={(e) => commit({ targetOutcomeTarget: e.target.value })}
                        placeholder="Example: 10"
                      />
                      {fieldErrors.targetOutcomeTarget && (
                        <FieldError message={fieldErrors.targetOutcomeTarget} />
                      )}
                    </div>
                  </div>
                </FormField>
              </div>
            );
          }

          if (field.inputType === "accountableOwner") {
            return (
              <div key={field.key} className="form_fields_vendor buyer_cots_field">
                <FormField
                  label={field.label}
                  mandatory={field.required}
                  tooltipText={field.placeholder}
                >
                  <div className="vendor_incident_card buyer_cots_subfields">
                    <div className="buyer_cots_subfield">
                      <BuyerCotsField
                        fieldKey="owningDepartment"
                        label="Department"
                        placeholder="Select the owning department"
                        required="true"
                        options={getBuyerCotsFieldOptions("owningDepartment")}
                        value={formData.owningDepartment}
                        onChange={(val) => commit({ owningDepartment: val })}
                        errorMessage={fieldErrors.owningDepartment}
                      />
                    </div>
                    <div className="buyer_cots_subfield">
                      <label className="labelSection" htmlFor="accountableOwnerName">
                        Named owner
                      </label>
                      <input
                        id="accountableOwnerName"
                        type="text"
                        className="input_field"
                        style={{ width: "100%" }}
                        value={formData.accountableOwnerName ?? ""}
                        onChange={(e) => commit({ accountableOwnerName: e.target.value })}
                        placeholder="Full name of the accountable owner"
                      />
                      {fieldErrors.accountableOwnerName && (
                        <FieldError message={fieldErrors.accountableOwnerName} />
                      )}
                    </div>
                    <div className="buyer_cots_subfield">
                      <BuyerCotsField
                        fieldKey="accountableOwnerRole"
                        label="Role"
                        placeholder="Select the owner's role"
                        required="true"
                        options={getBuyerCotsFieldOptions("accountableOwnerRole")}
                        value={formData.accountableOwnerRole}
                        onChange={(val) => commit({ accountableOwnerRole: val })}
                        errorMessage={fieldErrors.accountableOwnerRole}
                      />
                    </div>
                  </div>
                </FormField>
              </div>
            );
          }

          if (field.inputType === "assessor") {
            return (
              <div key={field.key} className="form_fields_vendor buyer_cots_field">
                <FormField
                  label={field.label}
                  mandatory={field.required}
                  tooltipText={field.placeholder}
                >
                  <div className="vendor_incident_card buyer_cots_subfields">
                    <div className="buyer_cots_subfield">
                      <label className="labelSection" htmlFor="assessorName">
                        Name
                      </label>
                      <input
                        id="assessorName"
                        type="text"
                        className="input_field"
                        style={{ width: "100%" }}
                        value={formData.assessorName ?? ""}
                        onChange={(e) => commit({ assessorName: e.target.value })}
                        placeholder="Name of the person completing this assessment"
                      />
                      {fieldErrors.assessorName && <FieldError message={fieldErrors.assessorName} />}
                    </div>
                    <div className="buyer_cots_subfield">
                      <BuyerCotsField
                        fieldKey="assessorRole"
                        label="Role"
                        placeholder="Select the assessor role"
                        required="true"
                        options={getBuyerCotsFieldOptions("assessorRole")}
                        value={formData.assessorRole}
                        onChange={(val) => commit({ assessorRole: val })}
                        errorMessage={fieldErrors.assessorRole}
                      />
                    </div>
                  </div>
                </FormField>
                {error && <FieldError message={error} />}
              </div>
            );
          }

          if (field.inputType === "integrationAccess") {
            const selected = parseList(formData.integrationSystems);
            const levels = parseAccessLevels(formData.integrationAccessLevels);
            const showOther = selected.includes("Other (Specify Below)");
            return (
              <div key={field.key} className="form_fields_vendor buyer_cots_field">
                <BuyerCotsField
                  fieldKey={field.key}
                  label={field.label}
                  placeholder={field.placeholder}
                  required={field.required ? "true" : "false"}
                  options={options}
                  multiselect
                  exclusiveValue={exclusive}
                  value={formData.integrationSystems}
                  onChange={(val) => commit({ integrationSystems: val })}
                  errorMessage={error}
                />
                {selected
                  .filter((sys) => sys !== "No Integrations Required" && sys !== "Other (Specify Below)")
                  .map((sys) => (
                    <div key={sys} className="form_fields_vendor buyer_cots_field" style={{ marginTop: "0.5rem" }}>
                      <BuyerCotsField
                        fieldKey={`access-${sys}`}
                        label={`Access needed for ${sys}`}
                        placeholder="Select the highest access this system needs"
                        required="true"
                        options={INTEGRATION_ACCESS_LEVEL_OPTIONS}
                        value={levels[sys] ?? ""}
                        onChange={(val) =>
                          commit({
                            integrationAccessLevels: JSON.stringify({ ...levels, [sys]: val }),
                          })
                        }
                      />
                    </div>
                  ))}
                <div className="form_fields_vendor buyer_cots_field" style={{ marginTop: "0.75rem" }}>
                  <FormField
                    label="Other systems"
                    tooltipText="Specify systems not listed above"
                    mandatory={showOther}
                  >
                    <input
                      type="text"
                      className="select_input"
                      style={{ width: "100%" }}
                      maxLength={300}
                      value={formData.integrationSystemsOther ?? ""}
                      onChange={(e) => commit({ integrationSystemsOther: e.target.value.slice(0, 300) })}
                      placeholder="Optional: other systems (max 300 characters)"
                    />
                  </FormField>
                </div>
              </div>
            );
          }

          if (field.inputType === "confirmDispute") {
            const attestedValue = String(formData[`${field.key}Attested`] || "").trim();
            const currentValue = String(formData[field.key] || "").trim();
            const displayValue = attestedValue || currentValue;
            return (
              <div key={field.key} className="form_fields_vendor buyer_cots_field">
                <BuyerCotsField
                  fieldKey={field.key}
                  label={field.label}
                  placeholder="Prefilled from the selected vendor attestation"
                  required={field.required ? "true" : "false"}
                  value={displayValue}
                  onChange={() => undefined}
                  readOnly
                  errorMessage={error}
                />
              </div>
            );
          }

          if (field.inputType === "file") {
            return (
              <div key={field.key} className="form_fields_vendor buyer_cots_field">
                <FormField
                  label={field.label}
                  mandatory={field.required}
                  tooltipText={field.placeholder}
                >
                  <FileUpload
                    accept=".pdf,.doc,.docx,.ppt,.pptx"
                    maxSizeBytes={MAX_FILE_SIZE_BYTES}
                    value={parseFileNames(formData[field.key])}
                    onFilesChange={(names) => commit({ [field.key]: JSON.stringify(names) })}
                  />
                </FormField>
                {error && <FieldError message={error} />}
              </div>
            );
          }

          if (field.inputType === "date") {
            return (
              <div key={field.key} className="form_fields_vendor buyer_cots_field">
                <FormField
                  label={field.label}
                  mandatory={field.required}
                  tooltipText={field.placeholder}
                >
                  <input
                    type="date"
                    className="input_field"
                    style={{ width: "100%" }}
                    value={formData[field.key] ?? ""}
                    onChange={(e) => commit({ [field.key]: e.target.value })}
                  />
                </FormField>
              </div>
            );
          }

          return (
            <div key={field.key} className="form_fields_vendor buyer_cots_field">
              <BuyerCotsField
                fieldKey={field.key}
                label={field.label}
                placeholder={field.placeholder}
                required={field.required ? "true" : "false"}
                options={
                  isBuyerCotsAttestationLockedField(formData, field.key) || field.readOnly
                    ? undefined
                    : options.length
                      ? options
                      : undefined
                }
                multiselect={field.inputType === "multiselect"}
                textarea={field.inputType === "textarea"}
                exclusiveValue={exclusive}
                value={formData[field.key]}
                onChange={(val) => {
                  if (field.readOnly || isBuyerCotsAttestationLockedField(formData, field.key)) return;
                  commit({ [field.key]: val });
                }}
                readOnly={!!field.readOnly || isBuyerCotsAttestationLockedField(formData, field.key)}
                errorMessage={error}
              />
            </div>
          );
        })}
      </div>
    </>
  );
}
