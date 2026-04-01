import type { ReactNode } from "react";
import { formatDateDDMMMYYYY } from "./formatDate.js";

/** Format sector object to readable string for preview */
function formatSectorForPreview(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const sectorMap: Record<string, unknown> = {
    "Public Sector": v.public_sector,
    "Private Sector": v.private_sector,
    "Non-Profit Sector": v.non_profit_sector,
  };
  const parts: string[] = [];
  Object.entries(sectorMap).forEach(([label, values]) => {
    if (Array.isArray(values) && values.length > 0) {
      parts.push(`${label}: ${values.join(", ")}`);
    }
  });
  return parts.length > 0 ? parts.join("; ") : null;
}

export function formatPreviewValue(value: unknown, label?: string): ReactNode {
  if (value === null || value === undefined || value === "") {
    return <span className="vendor_preview_na">—</span>;
  }
  if (Array.isArray(value)) {
    return value.length ? (
      value.join(", ")
    ) : (
      <span className="vendor_preview_na">—</span>
    );
  }
  if (typeof value === "object") {
    const sectorText = formatSectorForPreview(value);
    if (sectorText !== null) {
      return sectorText;
    }
    return (
      <ul className="vendor_preview_nested_list">
        {Object.entries(value as Record<string, unknown>).map(([k, vals]) => (
          <li key={k}>
            <span className="vendor_preview_nested_label">{k}:</span>{" "}
            {Array.isArray(vals) ? vals.join(", ") : String(vals)}
          </li>
        ))}
      </ul>
    );
  }
  let str = String(value);
  if (str === "[object Object]") {
    return <span className="vendor_preview_na">—</span>;
  }
  if (label?.toLowerCase().includes("sector") && str.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(str) as unknown;
      const sectorText = formatSectorForPreview(parsed);
      if (sectorText !== null) return sectorText;
    } catch {
      /* use str as-is */
    }
  }
  if (label?.toLowerCase().includes("email")) {
    return (
      <a href={`mailto:${str}`} className="vendor_preview_link">
        {str}
      </a>
    );
  }
  if (label?.toLowerCase().includes("website")) {
    const href = str.startsWith("http") ? str : `https://${str}`;
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="vendor_preview_link"
      >
        {str}
      </a>
    );
  }
  return str;
}

export function formatOnboardingDate(isoString: unknown): string | null {
  if (!isoString) return null;
  const s = formatDateDDMMMYYYY(isoString);
  return s === "—" ? null : s;
}

const SKIP_ONBOARDING_KEYS = [
  "id",
  "createdAt",
  "updatedAt",
  "userId",
  "organizationId",
  "completedBy",
  "completedAt",
];

function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .replace(/_/g, " ")
    .trim();
}

export type OnboardingField = {
  label: string;
  value: (obj: Record<string, unknown>) => unknown;
};

export function buildOnboardingFields(
  data: Record<string, unknown> | null | undefined,
): OnboardingField[] {
  if (!data || typeof data !== "object") return [];
  return Object.keys(data)
    .filter((k) => !SKIP_ONBOARDING_KEYS.includes(k))
    .map((key) => ({
      label: formatLabel(key),
      value: (obj: Record<string, unknown>) => obj[key],
    }));
}
