import { eq } from "drizzle-orm";
import { db } from "../../database/db.js";
import { usersTable, generatedProfileReports } from "../../schema/schema.js";
import { generateVendorAttestationReport, buildReportPayloadAndSummary } from "../agents/vendorAttestation.js";
/**
 * POST /vendorSelfAttestation/generate-profile
 * Body: { vendorData: string, attestationId?: string }
 * Returns structured product profile report (trust score + sections) for display in UI cards.
 * Stores the report in generated_profile_reports (user_id, organization_id, optional attestation_id, trust_score, report).
 */
const generateProductProfile = async (req, res) => {
    try {
        const vendorData = typeof req.body?.vendorData === "string" ? req.body.vendorData : "";
        if (!vendorData.trim()) {
            res.status(400).json({
                success: false,
                message: "vendorData is required and must be a non-empty string",
            });
            return;
        }
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
        const [userRow] = await db
            .select({ organization_id: usersTable.organization_id })
            .from(usersTable)
            .where(eq(usersTable.id, userId))
            .limit(1);
        const organizationIdStr = userRow?.organization_id != null ? String(userRow.organization_id) : null;
        const formulaPayload = req.body?.formData && typeof req.body.formData === "object"
            ? req.body.formData
            : undefined;
        const report = await generateVendorAttestationReport(vendorData, formulaPayload);
        const { reportPayload, trustScoreNum, summaryToStore } = buildReportPayloadAndSummary(report);
        const attestationIdRaw = req.body?.attestationId ?? req.body?.attestation_id;
        const attestationId = typeof attestationIdRaw === "string" && attestationIdRaw.trim() ? attestationIdRaw.trim() : null;
        const summaryForDb = summaryToStore && summaryToStore.length > 0 ? summaryToStore : null;
        console.log("[Summary] Step: generateProductProfile (controller) — before DB insert | summaryToStore:", summaryToStore == null ? "undefined" : "length " + summaryToStore.length, "| summary column value:", summaryForDb == null ? "null" : "length " + summaryForDb.length);
        if (summaryForDb)
            console.log("[Summary] Step: generateProductProfile — complete summary being stored:", summaryForDb);
        const trustScoreForDb = Number.isFinite(trustScoreNum) ? Math.round(trustScoreNum) : 0;
        await db.insert(generatedProfileReports).values({
            user_id: userId,
            organization_id: organizationIdStr,
            attestation_id: attestationId ?? undefined,
            trust_score: trustScoreForDb,
            summary: summaryForDb,
            report: reportPayload,
        });
        console.log("[Summary] Step: generateProductProfile (controller) — inserted into generated_profile_reports | attestation_id:", attestationId ?? "(none)", "| summary stored:", summaryForDb != null);
        res.status(200).json({
            success: true,
            data: {
                trustScore: reportPayload.trustScore,
                sections: report.sections,
            },
        });
    }
    catch (error) {
        console.error("generateProductProfile error:", error);
        res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : "Failed to generate product profile",
        });
    }
};
export default generateProductProfile;
