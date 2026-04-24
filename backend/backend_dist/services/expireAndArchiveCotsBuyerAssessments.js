import { hasCotsBuyerArchivedReportColumn, resetCotsBuyerArchivedColumnCache } from "./cotsBuyerArchivedColumn.js";
/**
 * Marks submitted assessments past expiry_at as expired, then moves live buyer vendor
 * risk JSON to archived_vendor_risk_assessment_report so active report endpoints stay empty
 * while preserving an audit snapshot (requires migration 0056 column).
 */
export async function expireSubmittedAssessmentsAndArchiveBuyerReports(pool) {
    await pool.query(`
    UPDATE assessments
    SET status = 'expired', updated_at = now()
    WHERE expiry_at IS NOT NULL
      AND expiry_at < now()
      AND status = 'submitted'
  `);
    const hasArchive = await hasCotsBuyerArchivedReportColumn(pool);
    if (!hasArchive)
        return;
    try {
        await pool.query(`
      UPDATE cots_buyer_assessments c
      SET
        archived_vendor_risk_assessment_report = COALESCE(
          c.archived_vendor_risk_assessment_report,
          c.vendor_risk_assessment_report
        ),
        vendor_risk_assessment_report = NULL,
        updated_at = now()
      FROM assessments a
      WHERE c.assessment_id = a.id
        AND a.type = 'cots_buyer'
        AND a.status = 'expired'
        AND c.vendor_risk_assessment_report IS NOT NULL
    `);
    }
    catch (e) {
        const code = e && typeof e === "object" && "code" in e ? String(e.code) : "";
        if (code === "42703") {
            resetCotsBuyerArchivedColumnCache();
            return;
        }
        throw e;
    }
}
