import { eq, desc, or } from "drizzle-orm";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { generalReports } from "../../schema/assessments/generalReports.js";
import { assessments } from "../../schema/assessments/assessments.js";
import { cotsVendorAssessments } from "../../schema/assessments/cotsVendorAssessments.js";
import { vendorSelfAttestations } from "../../schema/assessments/vendorSelfAttestations.js";
/**
 * GET /generalReports
 * Returns general reports (e.g. Executive Stakeholder Brief) for the current user's organization, newest first.
 * System Manager and System Viewer: use user's organization_id, or optional query param organizationId when user's org is not set.
 */
const listGeneralReports = async (req, res) => {
    try {
        const payload = req.user;
        const rawId = payload?.id ?? payload?.userId;
        const userId = rawId != null ? Number(rawId) : NaN;
        if (!Number.isInteger(userId) || userId < 1) {
            res.status(401).json({
                success: false,
                message: "User not authenticated or invalid user identifier",
            });
            return;
        }
        const [user] = await db
            .select({
            organization_id: usersTable.organization_id,
            user_platform_role: usersTable.user_platform_role,
        })
            .from(usersTable)
            .where(eq(usersTable.id, userId))
            .limit(1);
        let orgId = user?.organization_id != null ? String(user.organization_id).trim() : "";
        const platformRole = (user?.user_platform_role ?? "").toString().trim().toLowerCase().replace(/_/g, " ");
        const isSystemManagerOrViewer = platformRole === "system manager" || platformRole === "system viewer";
        if (!orgId && isSystemManagerOrViewer) {
            const fromQuery = typeof req.query?.organizationId === "string" ? req.query.organizationId.trim() || "" : "";
            if (fromQuery)
                orgId = fromQuery;
        }
        const assessmentIdFromQuery = typeof req.query?.assessmentId === "string" ? req.query.assessmentId.trim() || null : null;
        const whereCondition = assessmentIdFromQuery
            ? eq(generalReports.assessment_id, assessmentIdFromQuery)
            : orgId
                ? eq(generalReports.organization_id, orgId)
                : null;
        if (!whereCondition) {
            res.status(200).json({ success: true, data: { reports: [] } });
            return;
        }
        const rows = await db
            .select({
            id: generalReports.id,
            assessment_id: generalReports.assessment_id,
            assessment_label: generalReports.assessment_label,
            report_type: generalReports.report_type,
            content: generalReports.content,
            created_at: generalReports.created_at,
            created_by: generalReports.created_by,
            expiryAt: assessments.expiry_at,
            attestationExpiryAt: vendorSelfAttestations.expiry_at,
        })
            .from(generalReports)
            .innerJoin(assessments, eq(generalReports.assessment_id, assessments.id))
            .leftJoin(cotsVendorAssessments, eq(assessments.id, cotsVendorAssessments.assessment_id))
            .leftJoin(vendorSelfAttestations, or(eq(cotsVendorAssessments.vendor_attestation_id, vendorSelfAttestations.id), eq(cotsVendorAssessments.vendor_attestation_id, vendorSelfAttestations.vendor_self_attestation_id)))
            .where(whereCondition)
            .orderBy(desc(generalReports.created_at))
            .limit(200);
        const seen = new Set();
        const reports = rows
            .filter((r) => {
            const id = String(r.id);
            if (seen.has(id))
                return false;
            seen.add(id);
            return true;
        })
            .map((r) => {
            const contentRaw = r.content;
            const briefContent = contentRaw == null
                ? undefined
                : typeof contentRaw === "string"
                    ? contentRaw
                    : JSON.stringify(contentRaw);
            return {
                id: String(r.id),
                assessmentId: String(r.assessment_id),
                assessmentLabel: r.assessment_label ?? undefined,
                reportType: r.report_type,
                generatedAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
                briefContent,
                createdBy: r.created_by,
                expiryAt: r.expiryAt instanceof Date ? r.expiryAt.toISOString() : (r.expiryAt != null ? String(r.expiryAt) : null),
                attestationExpiryAt: r.attestationExpiryAt instanceof Date ? r.attestationExpiryAt.toISOString() : (r.attestationExpiryAt != null ? String(r.attestationExpiryAt) : null),
            };
        });
        res.status(200).json({
            success: true,
            data: { reports },
        });
    }
    catch (error) {
        console.error("listGeneralReports error:", error);
        res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : "Failed to list general reports",
        });
    }
};
export default listGeneralReports;
