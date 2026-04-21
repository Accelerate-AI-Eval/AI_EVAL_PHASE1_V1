import { eq, desc } from "drizzle-orm";
import { db } from "../../database/db.js";
import { usersTable, generatedProfileReports } from "../../schema/schema.js";
import { mergeSummaryIntoReport } from "../../utils/mergeProfileReportSummary.js";
/**
 * GET /vendorSelfAttestation/generated-reports
 * Returns stored generated profile reports for the current user (and org), newest first.
 * Each item includes id, attestationId, trustScore, report, createdAt.
 */
const listGeneratedReports = async (req, res) => {
    try {
        const payload = req.user;
        let rawId = payload?.id ?? payload?.userId;
        let userId = rawId != null ? Number(rawId) : NaN;
        if ((!Number.isInteger(userId) || userId < 1) && payload?.email) {
            const email = String(payload.email).trim();
            if (email) {
                const users = await db
                    .select({ id: usersTable.id })
                    .from(usersTable)
                    .where(eq(usersTable.email, email))
                    .limit(1);
                if (users[0])
                    userId = users[0].id;
            }
        }
        if (!Number.isInteger(userId) || userId < 1) {
            res.status(401).json({
                success: false,
                message: "User not authenticated or invalid user identifier",
            });
            return;
        }
        const rows = await db
            .select({
            id: generatedProfileReports.id,
            attestation_id: generatedProfileReports.attestation_id,
            trust_score: generatedProfileReports.trust_score,
            report: generatedProfileReports.report,
            summary: generatedProfileReports.summary,
            created_at: generatedProfileReports.created_at,
        })
            .from(generatedProfileReports)
            .where(eq(generatedProfileReports.user_id, userId))
            .orderBy(desc(generatedProfileReports.created_at))
            .limit(100);
        const reports = rows.map((r) => ({
            id: r.id,
            attestationId: r.attestation_id ?? undefined,
            trustScore: r.trust_score,
            report: mergeSummaryIntoReport(r.report, r.summary),
            createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        }));
        res.status(200).json({
            success: true,
            data: { reports },
        });
    }
    catch (error) {
        console.error("listGeneratedReports error:", error);
        res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : "Failed to list generated reports",
        });
    }
};
export default listGeneratedReports;
