import React from "react";

type Option = {
  label: string;
  value: string;
};

type SelectProps = {
  labelName?: string | React.ReactNode;
  id?: string;
  icon?: React.ReactNode;
  name: string;
  value: string;
  default_option?: string;
  options: Option[];
  required?: boolean;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  /** Used when no visible label is shown (accessibility). */
  ariaLabel?: string;
};



const Select = ({
  labelName,
  id,
  icon,
  name,
  value,
  default_option,
  options,
  required,
  onChange,
  ariaLabel,
}: SelectProps) => {
  const controlId = id || name;
  const hasStringLabel =
    typeof labelName === "string" ? labelName.trim().length > 0 : labelName != null;
  const showLabel = icon != null || hasStringLabel;

  return (
    <>
      {showLabel ? (
        <label htmlFor={controlId} className="select_label">
          {icon && <span className="icon">{icon}</span>}
          {labelName}
        </label>
      ) : null}

      <select
        id={controlId}
        name={name}
        value={value}
        onChange={onChange}
        className={`select_input ${!value ? "select_input--placeholder" : ""}`}
        required={required}
        aria-label={showLabel ? undefined : ariaLabel}
      >
        <option value="" disabled>
          {default_option}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
};

export default Select;
