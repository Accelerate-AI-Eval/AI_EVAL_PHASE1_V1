import type { Request, Response } from "express";
import { eq, and, or, inArray } from "drizzle-orm";
import { db } from "../../database/db.js";
import { usersTable } from "../../schema/schema.js";
import { customerRiskAssessmentReports } from "../../schema/assessments/customerRiskAssessmentReports.js";
import { assessments } from "../../schema/assessments/assessments.js";
import { cotsVendorAssessments } from "../../schema/assessments/cotsVendorAssessments.js";
import { vendorSelfAttestations } from "../../schema/assessments/vendorSelfAttestations.js";
import { riskMappings } from "../../schema/risks/riskMappings.js";
import { riskTop5Mitigations } from "../../schema/risks/riskTop5Mitigations.js";
import {
  resolveFrameworkMappingRowsForAttestation,
  mergeFrameworkMappingRows,
  extractFrameworkMappingRowsFromCustomerRiskReport,
  countSubstantiveFrameworkMappingRows,
} from "../../services/frameworkMappingFromCompliance.js";

/**
 * GET /customerRiskReports/:id
 * Returns a single Analysis Report by id; user must belong to same organization.
 */
const getCustomerRiskReportById = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = req.user as { id?: number } | undefined;
    const userId = payload?.id;
    if (userId == null) {
      res.status(401).json({ success: false, message: "User not authenticated" });
      return;
    }

    const idParam = (req.params as { id?: string }).id;
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
    const platformRole = String((user as { user_platform_role?: string })?.user_platform_role ?? "")
      .trim()
      .toLowerCase()
      .replace(/_/g, " ");
    const isSystemUser =
      platformRole === "system admin" || platformRole === "system manager" || platformRole === "system viewer";
    if (!isSystemUser && !orgId) {
      res.status(403).json({ success: false, message: "User has no organization" });
      return;
    }

    const whereClause = isSystemUser
      ? and(eq(customerRiskAssessmentReports.id, id))
      : and(
          eq(customerRiskAssessmentReports.id, id),
          eq(customerRiskAssessmentReports.organization_id, orgId),
        );

    const [row] = await db
      .select({
        id: customerRiskAssessmentReports.id,
        assessmentId: customerRiskAssessmentReports.assessment_id,
        title: customerRiskAssessmentReports.title,
        report: customerRiskAssessmentReports.report,
        createdAt: customerRiskAssessmentReports.created_at,
        expiryAt: assessments.expiry_at,
        attestationExpiryAt: vendorSelfAttestations.expiry_at,
        attestationFrameworkRows: vendorSelfAttestations.framework_mapping_rows,
        attestationComplianceExpiries: vendorSelfAttestations.compliance_document_expiries,
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
      .limit(1);

    if (!row) {
      res.status(404).json({ success: false, message: "Report not found" });
      return;
    }

    const reportObj =
      row.report && typeof row.report === "object"
        ? ({ ...(row.report as Record<string, unknown>) } as Record<string, unknown>)
        : ({} as Record<string, unknown>);

    const dbTop5Raw =
      reportObj.dbTop5Risks && typeof reportObj.dbTop5Risks === "object"
        ? (reportObj.dbTop5Risks as Record<string, unknown>)
        : null;

    if (dbTop5Raw) {
      const top5Raw = Array.isArray(dbTop5Raw.top5Risks) ? (dbTop5Raw.top5Risks as Array<Record<string, unknown>>) : [];
      const mitByRiskRaw =
        dbTop5Raw.mitigationsByRiskId && typeof dbTop5Raw.mitigationsByRiskId === "object"
          ? (dbTop5Raw.mitigationsByRiskId as Record<string, Array<Record<string, unknown>>>)
          : {};

      const riskIds = [
        ...new Set(
          top5Raw
            .map((r) => String(r.risk_id ?? "").trim())
            .filter((id) => id.length > 0),
        ),
      ];

      const mitigationActionIds = [
        ...new Set(
          Object.values(mitByRiskRaw)
            .flatMap((arr) => (Array.isArray(arr) ? arr : []))
            .map((m) => String(m.mitigation_action_id ?? "").trim())
            .filter((id) => id.length > 0),
        ),
      ];

      const riskRows =
        riskIds.length > 0
          ? await db
              .select({
                risk_mapping_id: riskMappings.risk_mapping_id,
                risk_id: riskMappings.risk_id,
                risk_title: riskMappings.risk_title,
                domains: riskMappings.domains,
                intent: riskMappings.intent,
                timing: riskMappings.timing,
                risk_type_detected: riskMappings.risk_type_detected,
                primary_risk: riskMappings.primary_risk,
                description: riskMappings.description,
                executive_summary: riskMappings.executive_summary,
              })
              .from(riskMappings)
              .where(inArray(riskMappings.risk_id, riskIds))
          : [];

      const mitigationRows =
        mitigationActionIds.length > 0
          ? await db
              .select({
                risk_id: riskTop5Mitigations.risk_id,
                mitigation_action_id: riskTop5Mitigations.mitigation_action_id,
                mitigation_action_name: riskTop5Mitigations.mitigation_action_name,
                mitigation_category: riskTop5Mitigations.mitigation_category,
                mitigation_definition: riskTop5Mitigations.mitigation_definition,
              })
              .from(riskTop5Mitigations)
              .where(inArray(riskTop5Mitigations.mitigation_action_id, mitigationActionIds))
          : [];

      const riskById = new Map(
        riskRows.map((r) => [String(r.risk_id ?? "").trim(), r] as const),
      );
      const mitigationById = new Map(
        mitigationRows.map((m) => [String(m.mitigation_action_id ?? "").trim(), m] as const),
      );

      const enrichedTop5 = top5Raw.map((r) => {
        const rid = String(r.risk_id ?? "").trim();
        const full = rid ? riskById.get(rid) : undefined;
        return {
          risk_id: rid || null,
          risk_mapping_id: full?.risk_mapping_id ?? null,
          risk_title: full?.risk_title ?? null,
          domains: full?.domains ?? null,
          intent: full?.intent ?? null,
          timing: full?.timing ?? null,
          risk_type_detected: full?.risk_type_detected ?? null,
          primary_risk: full?.primary_risk ?? null,
          description: full?.description ?? null,
          executive_summary: full?.executive_summary ?? null,
          summary_points: Array.isArray(r.summary_points) ? r.summary_points : undefined,
        };
      });

      const enrichedMitByRisk = Object.fromEntries(
        Object.entries(mitByRiskRaw).map(([rid, list]) => [
          rid,
          (Array.isArray(list) ? list : []).map((m) => {
            const mid = String(m.mitigation_action_id ?? "").trim();
            const full = mid ? mitigationById.get(mid) : undefined;
            return {
              risk_id: full?.risk_id ?? rid,
              mitigation_action_id: mid || null,
              mitigation_action_name: full?.mitigation_action_name ?? null,
              mitigation_category: full?.mitigation_category ?? null,
              mitigation_definition: full?.mitigation_definition ?? null,
              mitigation_summary_points: Array.isArray(m.mitigation_summary_points)
                ? m.mitigation_summary_points
                : undefined,
            };
          }),
        ]),
      );

      reportObj.dbTop5Risks = {
        top5Risks: enrichedTop5,
        mitigationsByRiskId: enrichedMitByRisk,
      };
    }

    /** Vendor COTS: merge frameworks from vendor_self_attestations with stored report rows. */
    let attestationSrc: Record<string, unknown> | null = null;
    if (
      row.attestationFrameworkRows != null ||
      row.attestationComplianceExpiries != null
    ) {
      attestationSrc = {
        framework_mapping_rows: row.attestationFrameworkRows,
        compliance_document_expiries: row.attestationComplianceExpiries,
      };
    }
    if (!attestationSrc) {
      const sel = String(reportObj.selectedProductId ?? "").trim();
      if (sel) {
        const [a] = await db
          .select({
            framework_mapping_rows: vendorSelfAttestations.framework_mapping_rows,
            compliance_document_expiries: vendorSelfAttestations.compliance_document_expiries,
          })
          .from(vendorSelfAttestations)
          .where(
            or(
              eq(vendorSelfAttestations.id, sel),
              eq(vendorSelfAttestations.vendor_self_attestation_id, sel),
            ),
          )
          .limit(1);
        if (a) {
          attestationSrc = {
            framework_mapping_rows: a.framework_mapping_rows,
            compliance_document_expiries: a.compliance_document_expiries,
          };
        }
      }
    }
    /** Join can leave attestation columns null; always resolve via cots row when possible (vendor portal). */
    if (!attestationSrc && row.assessmentId) {
      const [cots] = await db
        .select({
          vendor_attestation_id: cotsVendorAssessments.vendor_attestation_id,
        })
        .from(cotsVendorAssessments)
        .where(eq(cotsVendorAssessments.assessment_id, row.assessmentId))
        .limit(1);
      const vid =
        cots?.vendor_attestation_id != null ? String(cots.vendor_attestation_id).trim() : "";
      if (vid) {
        const [a] = await db
          .select({
            framework_mapping_rows: vendorSelfAttestations.framework_mapping_rows,
            compliance_document_expiries: vendorSelfAttestations.compliance_document_expiries,
          })
          .from(vendorSelfAttestations)
          .where(
            or(
              eq(vendorSelfAttestations.id, vid),
              eq(vendorSelfAttestations.vendor_self_attestation_id, vid),
            ),
          )
          .limit(1);
        if (a) {
          attestationSrc = {
            framework_mapping_rows: a.framework_mapping_rows,
            compliance_document_expiries: a.compliance_document_expiries,
          };
        }
      }
    }
    const fromAttestation = attestationSrc
      ? resolveFrameworkMappingRowsForAttestation(attestationSrc)
      : [];
    const fromStoredReport = extractFrameworkMappingRowsFromCustomerRiskReport(reportObj);
    const mergedFrameworkRows = mergeFrameworkMappingRows(fromAttestation, fromStoredReport);
    const frameworkRowsForResponse =
      mergedFrameworkRows.length > 0
        ? mergedFrameworkRows
        : fromAttestation.length > 0
          ? fromAttestation
          : fromStoredReport;
    if (frameworkRowsForResponse.length > 0) {
      const mapped = frameworkRowsForResponse.map((r) => ({
        framework: r.framework,
        coverage: r.coverage,
        controls: r.controls,
        notes: r.notes,
      }));
      reportObj.frameworkMappingRows = mapped;
      const g =
        reportObj.generatedAnalysis && typeof reportObj.generatedAnalysis === "object"
          ? ({ ...(reportObj.generatedAnalysis as object) } as Record<string, unknown>)
          : {};
      const frRaw = g.fullReport;
      const fr =
        frRaw && typeof frRaw === "object"
          ? ({ ...(frRaw as object) } as Record<string, unknown>)
          : {};
      g.fullReport = { ...fr, frameworkMapping: { rows: mapped } };
      reportObj.generatedAnalysis = g;
    }

    const storedFwStatus =
      reportObj.frameworkMappingAttestationStatus ?? reportObj.framework_mapping_attestation_status;
    if (storedFwStatus == null || String(storedFwStatus).trim() === "") {
      const subAtt = countSubstantiveFrameworkMappingRows(fromAttestation);
      if (attestationSrc) {
        reportObj.frameworkMappingAttestationStatus =
          subAtt > 0 ? "available" : "incomplete";
      } else {
        reportObj.frameworkMappingAttestationStatus = "missing";
      }
    }

    res.status(200).json({
      success: true,
      data: {
        id: row.id,
        assessmentId: row.assessmentId,
        title: row.title,
        report: reportObj,
        createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
        expiryAt: row.expiryAt instanceof Date ? row.expiryAt.toISOString() : (row.expiryAt != null ? String(row.expiryAt) : null),
        attestationExpiryAt: row.attestationExpiryAt instanceof Date ? row.attestationExpiryAt.toISOString() : (row.attestationExpiryAt != null ? String(row.attestationExpiryAt) : null),
      },
    });
  } catch (error) {
    console.error("getCustomerRiskReportById error:", error);
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Failed to get report",
    });
  }
};

export default getCustomerRiskReportById;
