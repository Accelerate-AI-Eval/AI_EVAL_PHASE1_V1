import { eq, and, or } from "drizzle-orm";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { generalReports } from "../../schema/assessments/generalReports.js";
import { assessments } from "../../schema/assessments/assessments.js";
import { cotsVendorAssessments } from "../../schema/assessments/cotsVendorAssessments.js";
import { vendorSelfAttestations } from "../../schema/assessments/vendorSelfAttestations.js";
/**
 * GET /generalReports/:id
 * Returns a single general report by id; user must belong to same organization.
 * Includes expiryAt and attestationExpiryAt so the frontend can hide Export/Download when archived.
 */
const getGeneralReportById = async (req, res) => {
    try {
        const payload = req.user;
        const userId = payload?.id;
        if (userId == null) {
            res.status(401).json({ success: false, message: "User not authenticated" });
            return;
        }
        const idParam = req.params.id;
        const id = idParam != null && String(idParam).trim() !== "" ? String(idParam).trim() : null;
        if (!id) {
            res.status(400).json({ success: false, message: "Report ID required" });
            return;
        }
        const [user] = await db
            .select({
            organization_id: usersTable.organization_id,
            user_platform_role: usersTable.user_platform_role,
        })
            .from(usersTable)
            .where(eq(usersTable.id, Number(userId)))
            .limit(1);
        const orgId = user?.organization_id != null ? String(user.organization_id).trim() : "";
        const platformRole = String(user?.user_platform_role ?? "")
            .trim()
            .toLowerCase()
            .replace(/_/g, " ");
        const isSystemUser = platformRole === "system admin" || platformRole === "system manager" || platformRole === "system viewer";
        if (!isSystemUser && !orgId) {
            res.status(403).json({ success: false, message: "User has no organization" });
            return;
        }
        const whereClause = isSystemUser
            ? and(eq(generalReports.id, id))
            : and(eq(generalReports.id, id), eq(generalReports.organization_id, orgId));
        const [row] = await db
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
            .where(whereClause)
            .limit(1);
        if (!row) {
            res.status(404).json({ success: false, message: "Report not found" });
            return;
        }
        const contentRaw = row.content;
        const briefContent = contentRaw == null
            ? undefined
            : typeof contentRaw === "string"
                ? contentRaw
                : JSON.stringify(contentRaw);
        const generatedAt = row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at);
        const expiryAt = row.expiryAt instanceof Date ? row.expiryAt.toISOString() : (row.expiryAt != null ? String(row.expiryAt) : null);
        const attestationExpiryAt = row.attestationExpiryAt instanceof Date
            ? row.attestationExpiryAt.toISOString()
            : (row.attestationExpiryAt != null ? String(row.attestationExpiryAt) : null);
        res.status(200).json({
            success: true,
            data: {
                id: String(row.id),
                assessmentId: String(row.assessment_id),
                assessmentLabel: row.assessment_label ?? undefined,
                reportType: row.report_type,
                generatedAt,
                briefContent,
                createdBy: row.created_by,
                expiryAt,
                attestationExpiryAt,
            },
        });
    }
    catch (error) {
        console.error("getGeneralReportById error:", error);
        res.status(500).json({
            success: false,
            message: error instanceof Error ? error.message : "Failed to get report",
        });
    }
};
export default getGeneralReportById;
