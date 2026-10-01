import { clampScore2 } from "./roundScore.js";

/**
 * Merge the stored summary (from generated_profile_reports.summary) into the report JSON
 * when report.trustScore.summary is missing or empty. Also inject trust_score column into
 * trustScore.overallScore when the nested JSON is missing/incomplete so product cards can display it.
 */
export function mergeSummaryIntoReport(
  report: unknown,
  summaryFromDb: string | null | undefined,
  trustScoreFromDb?: number | null,
): unknown {
  const summary =
    typeof summaryFromDb === "string" && summaryFromDb.trim() ? summaryFromDb.trim() : null;
  const colScore =
    trustScoreFromDb != null && Number.isFinite(Number(trustScoreFromDb))
      ? clampScore2(Number(trustScoreFromDb))
      : null;

  let r: Record<string, unknown> | null =
    report != null && typeof report === "object" && !Array.isArray(report)
      ? { ...(report as Record<string, unknown>) }
      : null;

  // Normalize snake_case trust_score → trustScore (Python / mixed shapes)
  if (r && (r.trustScore == null || typeof r.trustScore !== "object") && r.trust_score != null && typeof r.trust_score === "object") {
    r = { ...r, trustScore: r.trust_score };
  }

  if (r == null) {
    if (colScore == null && !summary) return report;
    return {
      trustScore: {
        overallScore: colScore ?? 0,
        label: "Not specified",
        summary: summary ?? "",
      },
      sections: [],
    };
  }

  let ts =
    r.trustScore != null && typeof r.trustScore === "object"
      ? { ...(r.trustScore as Record<string, unknown>) }
      : ({} as Record<string, unknown>);

  const existingSummary =
    typeof ts.summary === "string" && ts.summary.trim() ? ts.summary.trim() : null;
  if (!existingSummary && summary) ts = { ...ts, summary };

  let overall =
    typeof ts.overallScore === "number" && Number.isFinite(ts.overallScore)
      ? ts.overallScore
      : typeof ts.overall_score === "number" && Number.isFinite(ts.overall_score)
        ? Number(ts.overall_score)
        : typeof ts.overallScore === "string" && Number.isFinite(Number(ts.overallScore))
          ? Number(ts.overallScore)
          : null;

  if ((overall == null || overall === 0) && colScore != null) {
    overall = colScore;
  }
  if (overall != null) {
    ts = { ...ts, overallScore: clampScore2(overall) };
  }

  if (ts.label == null || String(ts.label).trim() === "") {
    ts = { ...ts, label: "Not specified" };
  }
  if (typeof ts.summary !== "string") {
    ts = { ...ts, summary: summary ?? "" };
  }

  const sections = Array.isArray(r.sections) ? r.sections : [];

  return {
    ...r,
    trustScore: ts,
    sections,
  };
}
