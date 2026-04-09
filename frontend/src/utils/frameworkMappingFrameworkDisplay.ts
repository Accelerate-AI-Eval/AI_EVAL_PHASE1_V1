/**
 * User-facing label for framework-mapping "Framework" column.
 * Omits redundant SOC 2 (2017) trust-criteria year (catalog version is implied).
 */
export function formatFrameworkMappingFrameworkForDisplay(v: unknown): string {
  if (v == null) return "—";
  let s = String(v).trim().replace(/\s+/g, " ");
  if (!s) return "—";
  s = s.replace(/^SOC\s*2\s*\(\s*2017\s*\)/i, "SOC 2");
  s = s.replace(/\s+/g, " ").trim();
  return s || "—";
}
