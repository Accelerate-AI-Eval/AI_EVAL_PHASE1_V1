/**
 * Merge the stored summary (from generated_profile_reports.summary) into the report JSON
 * when report.trustScore.summary is missing or empty. Used when returning generated_profile_report
 * so the UI always has the summary for product details.
 */
export function mergeSummaryIntoReport(report, summaryFromDb) {
    if (report == null || typeof report !== "object")
        return report;
    const r = report;
    const summary = typeof summaryFromDb === "string" && summaryFromDb.trim() ? summaryFromDb.trim() : null;
    if (!summary)
        return report;
    const ts = r.trustScore;
    if (ts == null || typeof ts !== "object")
        return report;
    const tsObj = ts;
    const existing = typeof tsObj.summary === "string" && tsObj.summary.trim() ? tsObj.summary : null;
    if (existing)
        return report;
    return {
        ...r,
        trustScore: { ...tsObj, summary },
    };
}
