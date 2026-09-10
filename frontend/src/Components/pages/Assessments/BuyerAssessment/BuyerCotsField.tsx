import React from "react";
import FormField from "../../../UI/FormField";
import ChipMultiSelect from "../../../UI/ChipMultiSelect";
import FieldError from "../../../UI/FieldError";

const defaultOption = "Select";

/** Parse multiselect form value: JSON array, plain array, or comma-separated string (draft DB format). */
function parseMultiselectValue(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean);
  }
  const s = String(raw).trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    if (Array.isArray(parsed)) {
      return parsed.map((x) => String(x).trim()).filter(Boolean);
    }
  } catch {
    /* comma-separated draft storage */
  }
  return s
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

type BuyerCotsFieldProps = {
  fieldKey: string;
  label: string;
  placeholder?: string;
  required?: boolean | string;
  options?: { label: string; value: string }[];
  multiselect?: boolean;
  value?: unknown;
  onChange: (val: string) => void;
  readOnly?: boolean;
  errorMessage?: string;
  exclusiveValue?: string;
  textarea?: boolean;
};

/** Renders input, single select, or multiselect based on field config. Multiselect values stored as JSON array string. */
const BuyerCotsField = ({
  fieldKey,
  label,
  placeholder,
  required,
  options,
  multiselect = false,
  value,
  onChange,
  readOnly = false,
  errorMessage,
  exclusiveValue,
  textarea = false,
}: BuyerCotsFieldProps) => {
  const safeValue =
    value == null
      ? ""
      : Array.isArray(value)
        ? value.map(String).join(", ")
        : typeof value === "string"
          ? value
          : String(value);
  const isRequired = required === true || required === "true";

  if (readOnly) {
    if (options && multiselect) {
      const selected = parseMultiselectValue(value);
      return (
        <>
          <FormField label={label} mandatory={isRequired} tooltipText={placeholder}>
            <ChipMultiSelect
              id={fieldKey}
              labelName=""
              options={options}
              value={selected}
              onChange={() => undefined}
              globalExclusiveValue={exclusiveValue}
              disabled
            />
          </FormField>
          {errorMessage && <FieldError message={errorMessage} />}
        </>
      );
    }
    if (options && !multiselect) {
      const strValue = typeof safeValue === "string" ? safeValue : String(safeValue);
      const matched = options.find((o) => o.value === strValue || o.label === strValue);
      const displayLabel = matched?.label ?? strValue;
      return (
        <>
          <FormField label={label} mandatory={isRequired} tooltipText={placeholder}>
            <input
              type="text"
              id={fieldKey}
              value={displayLabel}
              readOnly
              className="input_readonly"
              aria-label={label}
              aria-readonly="true"
            />
          </FormField>
          {errorMessage && <FieldError message={errorMessage} />}
        </>
      );
    }
    return (
      <>
        <FormField label={label} mandatory={isRequired} tooltipText={placeholder}>
          <input
            type="text"
            value={safeValue}
            readOnly
            className="input_readonly"
            aria-label={label}
          />
        </FormField>
        {errorMessage && <FieldError message={errorMessage} />}
      </>
    );
  }

  if (options && multiselect) {
    const selected = parseMultiselectValue(safeValue);
    return (
      <>
        <FormField label={label} mandatory={isRequired} tooltipText={placeholder}>
          <ChipMultiSelect
            id={fieldKey}
            labelName=""
            options={options}
            value={selected}
            onChange={(selectedValues) => onChange(JSON.stringify(selectedValues))}
            globalExclusiveValue={exclusiveValue}
          />
        </FormField>
        {errorMessage && <FieldError message={errorMessage} />}
      </>
    );
  }

  if (options && !multiselect) {
    return (
      <>
        <FormField label={label} mandatory={isRequired} tooltipText={placeholder}>
          <select
            value={safeValue}
            onChange={(e) => onChange(e.target.value)}
            className={`select_input ${!safeValue ? "select_input--placeholder" : ""}`}
            aria-label={label}
          >
            <option value="">{placeholder || defaultOption}</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </FormField>
        {errorMessage && <FieldError message={errorMessage} />}
      </>
    );
  }

  if (textarea) {
    return (
      <>
        <FormField label={label} mandatory={isRequired} tooltipText={placeholder}>
          <textarea
            value={safeValue}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="input_field"
            rows={4}
            style={{ width: "100%" }}
            aria-label={label}
          />
        </FormField>
        {errorMessage && <FieldError message={errorMessage} />}
      </>
    );
  }

  return (
    <>
      <FormField label={label} mandatory={isRequired} tooltipText={placeholder}>
        <input
          type="text"
          value={safeValue}
          onChange={(e) => onChange(e.target.value)}
        />
      </FormField>
      {errorMessage && <FieldError message={errorMessage} />}
    </>
  );
};

export default BuyerCotsField;
