/** Only `true` is cached so adding migration 0056 without restarting the server is detected. */
let cachedHasArchivedColumn = null;
/** Avoid repeating the probe on every request when the column is still missing (migration not applied). */
let lastNegativeProbeMs = 0;
const NEGATIVE_PROBE_TTL_MS = 60_000;
function pgCode(e) {
    return e && typeof e === "object" && "code" in e ? String(e.code) : "";
}
/**
 * True if the archive column exists on the same relation the archive UPDATE uses (migration 0056).
 * Uses a probe SELECT so we never rely on information_schema alone (avoids false positives vs. real errors).
 */
export async function hasCotsBuyerArchivedReportColumn(pool) {
    if (cachedHasArchivedColumn === true)
        return true;
    const now = Date.now();
    if (now - lastNegativeProbeMs < NEGATIVE_PROBE_TTL_MS)
        return false;
    try {
        await pool.query(`SELECT archived_vendor_risk_assessment_report FROM cots_buyer_assessments LIMIT 0`);
        cachedHasArchivedColumn = true;
        return true;
    }
    catch (e) {
        const code = pgCode(e);
        if (code === "42703" || code === "42P01") {
            lastNegativeProbeMs = now;
            return false;
        }
        throw e;
    }
}
/** Call after migration is applied so the next check picks up the new column. */
export function resetCotsBuyerArchivedColumnCache() {
    cachedHasArchivedColumn = null;
    lastNegativeProbeMs = 0;
}
