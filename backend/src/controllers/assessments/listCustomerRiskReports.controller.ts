import type { Request, Response } from "express";
import { eq, desc, or } from "drizzle-orm";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { customerRiskAssessmentReports } from "../../schema/assessments/customerRiskAssessmentReports.js";
import { assessments } from "../../schema/assessments/assessments.js";
import { cotsVendorAssessments } from "../../schema/assessments/cotsVendorAssessments.js";
import { vendorSelfAttestations } from "../../schema/assessments/vendorSelfAttestations.js";
import { vendorCotsFrameworkMappingRowsForListView } from "../../services/frameworkMappingFromCompliance.js";

/**
 * GET /customerRiskReports
 * Returns Analysis Report records for the current user's organization, newest first.
 * System Manager and System Viewer: use user's organization_id, or optional query param organizationId when user's org is not set.
 */
const listCustomerRiskReports = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = req.user as { id?: number; userId?: string | number; organization_id?: string } | undefined;
    let rawId = payload?.id ?? payload?.userId;
    let userId = rawId != null ? Number(rawId) : NaN;

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
    const isSystemManagerOrViewer =
      platformRole === "system manager" || platformRole === "system viewer";
    if (!orgId && isSystemManagerOrViewer) {
      const fromQuery =
        typeof req.query?.organizationId === "string" ? req.query.organizationId.trim() || "" : "";
      if (fromQuery) orgId = fromQuery;
    }
    const assessmentIdFromQuery =
      typeof req.query?.assessmentId === "string" ? req.query.assessmentId.trim() || null : null;

    const whereClause = assessmentIdFromQuery
      ? eq(customerRiskAssessmentReports.assessment_id, assessmentIdFromQuery)
      : orgId
        ? eq(customerRiskAssessmentReports.organization_id, orgId)
        : null;

    if (!whereClause) {
      res.status(200).json({ success: true, data: { reports: [] } });
      return;
    }

    const rows = await db
      .select({
        id: customerRiskAssessmentReports.id,
        assessmentId: customerRiskAssessmentReports.assessment_id,
        title: customerRiskAssessmentReports.title,
        report: customerRiskAssessmentReports.report,
        createdAt: customerRiskAssessmentReports.created_at,
        expiryAt: assessments.expiry_at,
        attestationExpiryAt: vendorSelfAttestations.expiry_at,
        framework_mapping_rows: vendorSelfAttestations.framework_mapping_rows,
        compliance_document_expiries: vendorSelfAttestations.compliance_document_expiries,
      })
      .from(customerRiskAssessmentReports)
      .innerJoin(assessments, eq(customerRiskAssessmentReports.assessment_id, assessments.id))
      .leftJoin(cotsVendorAssessments, eq(assessments.id, cotsVendorAssessments.assessment_id))
      .leftJoin(
        vendorSelfAttestations,
        or(
          eq(cotsVendorAssessments.vendor_attestation_id, vendorSelfAttestations.id),
          eq(cotsVendorAssessments.vendor_attestation_id, vendorSelfAttestations.vendor_self_attestation_id),
        ),
      )
      .where(whereClause)
      .orderBy(desc(customerRiskAssessmentReports.created_at))
      .limit(100);

    const reports = rows.map((r) => {
      const frameworkMappingRows = vendorCotsFrameworkMappingRowsForListView(
        {
          framework_mapping_rows: r.framework_mapping_rows,
          compliance_document_expiries: r.compliance_document_expiries,
        } as Record<string, unknown>,
        r.report,
      );
      return {
        id: r.id,
        assessmentId: r.assessmentId,
        title: r.title,
        report: r.report,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        expiryAt: r.expiryAt instanceof Date ? r.expiryAt.toISOString() : (r.expiryAt != null ? String(r.expiryAt) : null),
        attestationExpiryAt:
          r.attestationExpiryAt instanceof Date
            ? r.attestationExpiryAt.toISOString()
            : r.attestationExpiryAt != null
              ? String(r.attestationExpiryAt)
              : null,
        frameworkMappingRows,
      };
    });

    res.status(200).json({
      success: true,
      data: { reports },
    });
  } catch (error) {
    console.error("listCustomerRiskReports error:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to list customer risk reports",
    });
  }
};

export default listCustomerRiskReports;
