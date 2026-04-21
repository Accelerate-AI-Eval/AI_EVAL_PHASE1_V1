/**
 * Renders a step of the Vendor Self Attestation form with dynamic inputs.
 * Uses Options/Validation from Sheet 1: Select or ChipMultiSelect when options exist.
 * Each field is bound to attestation state via ATTESTATION_SECTION_FIELDS.
 */
import type { ChangeEvent } from "react";
import type { ReactNode } from "react";
import HeaderForVendor from "../VendorOnboarding/HeaderForVendor";
import FormField from "../../UI/FormField";
import Input from "../../UI/Input";
import Select from "../../UI/Select";
import ChipMultiSelect from "../../UI/ChipMultiSelect";
import {
  ATTESTATION_SECTION_FIELDS,
  type AttestationFieldMapping,
} from "../../../constants/vendorAttestationFields";
import { getAttestationFieldOptions } from "../../../constants/vendorAttestationOptions";
import type { VendorSelfAttestationPayload } from "../../../types/vendorSelfAttestation";
import { personalizeAttestationFieldLabel } from "../../../utils/attestationFieldLabel";

export interface AttestationDynamicStepProps {
  title: string;
  subTitle?: string;
  icon?: ReactNode;
  sectionKey: string;
  /** Section config: array of { label, placeholder, required } */
  data: Record<string, { label: string; placeholder?: string; required?: boolean }>;
  attestation: VendorSelfAttestationPayload;
  setAttestation: React.Dispatch<React.SetStateAction<VendorSelfAttestationPayload>>;
  fieldErrors?: Record<string, string>;
}

function getValue(
  attestation: VendorSelfAttestationPayload,
  mapping: AttestationFieldMapping
): string | string[] {
  const v = attestation[mapping.key];
  if (v == null) return mapping.type === "array" ? [] : "";
  if (Array.isArray(v)) return v;
  return String(v);
}

function setValue(
  mapping: AttestationFieldMapping,
  value: string | string[],
  prev: VendorSelfAttestationPayload
): VendorSelfAttestationPayload {
  const next = { ...prev };
  if (mapping.type === "array") {
    (next as Record<string, unknown>)[mapping.key] = Array.isArray(value) ? value : value ? [value] : [];
  } else {
    (next as Record<string, unknown>)[mapping.key] = typeof value === "string" ? value || null : null;
  }
  return next;
}

const AttestationDynamicStep = ({
  title,
  subTitle,
  icon,
  sectionKey,
  data,
  attestation,
  setAttestation,
  fieldErrors = {},
}: AttestationDynamicStepProps) => {
  const sectionFields = ATTESTATION_SECTION_FIELDS[sectionKey];
  if (!sectionFields) return null;

  const dataEntries = Object.entries(data).filter(
    ([k]) => k !== "length" && Object.prototype.hasOwnProperty.call(data, k)
  );
  const sortedEntries = dataEntries.sort(
    (a, b) => Number(a[0]) - Number(b[0])
  );

  return (
    <>
      <HeaderForVendor
        className="header_for_vendor"
        title_vendor={title}
        sub_title_vendor={subTitle}
        icon={icon}
      />
      <div className="step_form_body">
        {sortedEntries.map(([dataIndexStr, fieldConfig]) => {
          const dataIndex = Number(dataIndexStr);
          const mapping = sectionFields[dataIndex] ?? null;
          if (mapping == null) return null;
          const value = getValue(attestation, mapping);
          const options = getAttestationFieldOptions(mapping.key);
          const isArray = mapping.type === "array";
          const fieldLabel = personalizeAttestationFieldLabel(
            fieldConfig.label,
            attestation.product_name,
          );

          if (options && isArray) {
            const arrValue = Array.isArray(value) ? value : [];
            return (
              <div key={dataIndex} className="form_fields_vendor">
                <FormField
                  label={fieldLabel}
                  mandatory={fieldConfig.required ?? false}
                  tooltipText={fieldConfig.placeholder}
                  errorText={fieldErrors[mapping.key]}
                >
                  <ChipMultiSelect
                    id={`attestation-${sectionKey}-${dataIndex}`}
                    labelName=""
                    options={options}
                    value={arrValue}
                    onChange={(selected) =>
                      setAttestation((prev) => setValue(mapping, selected, prev))
                    }
                  />
                </FormField>
              </div>
            );
          }

          if (options && !isArray) {
            const strValue = typeof value === "string" ? value : "";
            return (
              <div key={dataIndex} className="form_fields_vendor">
                <FormField
                  label={fieldLabel}
                  mandatory={fieldConfig.required ?? false}
                  tooltipText={fieldConfig.placeholder}
                  errorText={fieldErrors[mapping.key]}
                >
                  <Select
                    labelName=""
                    id={`attestation-${sectionKey}-${dataIndex}`}
                    name={mapping.key}
                    value={strValue}
                    default_option={fieldConfig.placeholder ?? "Select..."}
                    options={options}
                    required={fieldConfig.required ?? false}
                    onChange={(e) =>
                      setAttestation((prev) =>
                        setValue(mapping, e.target.value, prev)
                      )}
                  />
                </FormField>
              </div>
            );
          }

          const strValue = typeof value === "string" ? value : "";
          const inputType = mapping.key === "product_name" ? "text" : "textarea";
          return (
            <div key={dataIndex} className="form_fields_vendor">
              <FormField
                label={fieldLabel}
                mandatory={fieldConfig.required ?? false}
                tooltipText={fieldConfig.placeholder}
                errorText={fieldErrors[mapping.key]}
              >
                <Input
                  labelName=""
                  type={inputType}
                  id={`attestation-${sectionKey}-${dataIndex}`}
                  name={mapping.key}
                  value={strValue}
                  onChange={(e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                    setAttestation((prev) =>
                      setValue(mapping, e.target.value, prev)
                    );
                  }}
                />
              </FormField>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default AttestationDynamicStep;
