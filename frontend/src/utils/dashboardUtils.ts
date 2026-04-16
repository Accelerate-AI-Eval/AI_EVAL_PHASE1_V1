import { formatDateDDMMMYYYY } from "./formatDate.js";
import { getApiBaseUrl } from "./apiBaseUrl.js";

export const BASE_URL = getApiBaseUrl();

/** Format date for display as DD-MMM-YYYY (e.g. 05-Mar-2026); returns "—" if invalid or missing */
export const formatDisplayDate = formatDateDDMMMYYYY;

/** Format date for display as DD-MMM-YYYY (e.g. 05-Mar-2026); returns "—" if invalid or missing */
export const formatGovDate = formatDateDDMMMYYYY;

export const formatUpdatedDate = (dateStr: string | null | undefined): string => {
  const formatted = formatGovDate(dateStr);
  return formatted === "—" ? "—" : `Updated: ${formatted}`;
};

export const formatCompletedDate = (dateStr: string | null | undefined): string => {
  const formatted = formatGovDate(dateStr);
  return formatted === "—" ? "—" : `Completed: ${formatted}`;
};

/** Minimal shape for assessment row label/display helpers (used by dashboard) */
export interface AssessmentRowLabel {
  assessmentId?: number;
  productName?: string | null;
  vendorName?: string | null;
  completedByUserFirstName?: string | null;
  completedByUserLastName?: string | null;
  completedByUserName?: string | null;
  completedByUserEmail?: string | null;
}

export const getAssessmentLabel = (a: AssessmentRowLabel): string => {
  const product = (a.productName ?? "").toString().trim();
  const vendor = (a.vendorName ?? "").toString().trim();
  if (product && vendor) return `${product} - ${vendor}`;
  if (product) return product;
  if (vendor) return vendor;
  return `Assessment #${a.assessmentId}`;
};

export const getCompletedByDisplay = (a: AssessmentRowLabel): string => {
  const first = (a.completedByUserFirstName ?? "").toString().trim();
  const last = (a.completedByUserLastName ?? "").toString().trim();
  const fullName = [first, last].filter(Boolean).join(" ");
  if (fullName) return fullName;
  const userName = (a.completedByUserName ?? "").toString().trim();
  if (userName) return userName;
  const email = (a.completedByUserEmail ?? "").toString().trim();
  if (email) return email;
  return "";
};
