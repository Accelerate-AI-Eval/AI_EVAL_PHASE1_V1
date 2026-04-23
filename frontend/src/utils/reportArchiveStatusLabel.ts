/**
 * Distinguish report "archived" state for UI:
 * - Time-based (assessment or attestation past expiry) → "Expired"
 * - User archived the assessment (ledger) without time expiry → "Archived"
 * When both apply, "Expired" wins.
 */

export type ReportArchiveStatusFields = {
  expiryAt?: string | null;
  attestationExpiryAt?: string | null;
  assessmentUserArchivedAt?: string | null;
};

function isDateInPast(iso: string | null | undefined): boolean {
  if (iso == null || String(iso).trim() === "") return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const t = new Date();
  d.setHours(0, 0, 0, 0);
  t.setHours(0, 0, 0, 0);
  return d.getTime() < t.getTime();
}

/** True when the parent assessment/attestation dates put the report in the expired (time) bucket. */
export function isReportTimeExpired(r: ReportArchiveStatusFields): boolean {
  return isDateInPast(r.expiryAt) || isDateInPast(r.attestationExpiryAt);
}

export function isUserAssessmentArchivedOnReport(
  r: ReportArchiveStatusFields,
): boolean {
  return (
    r.assessmentUserArchivedAt != null &&
    String(r.assessmentUserArchivedAt).trim() !== ""
  );
}

/** Card/footer label for any non-current report row. */
export function reportArchivedStatusText(
  r: ReportArchiveStatusFields,
): "Expired" | "Archived" {
  if (isReportTimeExpired(r)) return "Expired";
  if (isUserAssessmentArchivedOnReport(r)) return "Archived";
  return "Archived";
}

export function reportArchivedStatusBadge(
  r: ReportArchiveStatusFields,
): "EXPIRED" | "ARCHIVED" {
  if (isReportTimeExpired(r)) return "EXPIRED";
  return "ARCHIVED";
}
