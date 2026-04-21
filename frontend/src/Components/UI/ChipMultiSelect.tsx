import "../../styles/chip_multi_select.css";

export interface ChipOption {
  label: string;
  value: string;
}

interface ChipMultiSelectProps {
  id?: string;
  labelName?: React.ReactNode;
  description?: string;
  options: ChipOption[];
  value: string[];
  onChange: (selected: string[]) => void;
  /**
   * When set, this option cannot be combined with any other selection:
   * if it is selected, all other chips are disabled; if anything else is selected, this chip is disabled.
   * Selecting this option replaces the current selection with only this value.
   */
  globalExclusiveValue?: string;
}

function ChipMultiSelect({
  id,
  labelName,
  description,
  options,
  value,
  onChange,
  globalExclusiveValue,
}: ChipMultiSelectProps) {
  function isChipDisabled(optionValue: string): boolean {
    if (!globalExclusiveValue) return false;
    const hasGlobal = value.includes(globalExclusiveValue);
    const hasNonGlobal = value.some((v) => v !== globalExclusiveValue);
    if (hasGlobal && hasNonGlobal) return false;
    if (hasGlobal && optionValue !== globalExclusiveValue) return true;
    if (hasNonGlobal && optionValue === globalExclusiveValue) return true;
    return false;
  }

  function toggle(optionValue: string) {
    if (globalExclusiveValue) {
      if (isChipDisabled(optionValue)) return;

      if (optionValue === globalExclusiveValue) {
        if (value.includes(globalExclusiveValue)) {
          onChange(value.filter((v) => v !== globalExclusiveValue));
        } else {
          onChange([globalExclusiveValue]);
        }
        return;
      }

      const withoutGlobal = value.filter((v) => v !== globalExclusiveValue);
      const next = withoutGlobal.includes(optionValue)
        ? withoutGlobal.filter((v) => v !== optionValue)
        : [...withoutGlobal, optionValue];
      onChange(next);
      return;
    }

    const next = value.includes(optionValue)
      ? value.filter((v) => v !== optionValue)
      : [...value, optionValue];
    onChange(next);
  }

  return (
    <div className="chip-multi-select" id={id}>
      {labelName != null && <label>{labelName}</label>}
      {description != null && description !== "" && (
        <p className="chip-multi-select-description">{description}</p>
      )}
      <div className="chip-multi-select-grid" role="group">
        {options.map((opt) => {
          const selected = value.includes(opt.value);
          const disabled = isChipDisabled(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              className={`chip-multi-select-chip ${selected ? "chip-multi-select-chip--selected" : ""}${disabled ? " chip-multi-select-chip--disabled" : ""}`}
              onClick={() => toggle(opt.value)}
              aria-pressed={selected}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ChipMultiSelect;
