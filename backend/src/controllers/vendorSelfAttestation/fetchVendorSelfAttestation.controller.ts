import type { Request, Response } from "express";
import { db } from "../../database/db.js";
import { createOrganization, vendors, vendorSelfAttestations, usersTable, generatedProfileReports } from "../../schema/schema.js";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { mergeSummaryIntoReport } from "../../utils/mergeProfileReportSummary.js";
import { clampScore2 } from "../../utils/roundScore.js";
import { attestationExtendedColumnSelect } from "../../utils/attestationExtendedFields.js";
import {
  mapAttestationRow,
  companyProfileFromAttestationRow,
  attestationHasCompanyProfile,
} from "../../utils/mapVendorSelfAttestationApi.js";
import {
  firstNonEmptyString,
  lookupOrganizationName,
} from "../../utils/lookupOrganizationName.js";

function userDisplayName(u: { user_name?: string | null; user_first_name?: string | null; user_last_name?: string | null; email?: string | null }): string {
  const name = (u.user_name ?? "").trim();
  if (name) return name;
  const first = (u.user_first_name ?? "").trim();
  const last = (u.user_last_name ?? "").trim();
  const full = [first, last].filter(Boolean).join(" ").trim();
  if (full) return full;
  return (u.email ?? "").trim() || "";
}

/**
 * GET vendor self attestation: company profile + attestation(s).
 * - companyProfile: from vendor_onboarding (by organizationId or userId).
 * - Query ?id=xxx: return single attestation (for form edit); also set attestation for backward compat.
 * - No id: return attestations[] (all for user, newest first) and attestation (latest one for backward compat).
 */
const fetchVendorSelfAttestation = async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = req.user as { id?: number; userId?: string | number; email?: string } | undefined;
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
        if (users[0]) userId = users[0].id;
      }
    }

    if (!Number.isInteger(userId) || userId < 1) {
      res.status(401).json({
        success: false,
        message: "User not authenticated or invalid user identifier",
        companyProfile: {},
        attestation: {},
        attestations: [],
      });
      return;
    }

    // Mark attestations as EXPIRED in DB when expiry_at has passed
    await db.execute(sql`
      UPDATE vendor_self_attestations
      SET status = 'EXPIRED'
      WHERE expiry_at IS NOT NULL AND expiry_at < now() AND status = 'COMPLETED'
    `);

    const [currentUserRow] = await db
      .select({
        user_platform_role: usersTable.user_platform_role,
        role: usersTable.role,
        organization_id: usersTable.organization_id,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const platformRole = String((currentUserRow as Record<string, unknown>)?.user_platform_role ?? "").trim().toLowerCase();
    const orgId = (currentUserRow as Record<string, unknown>)?.organization_id;
    const role = String((currentUserRow as Record<string, unknown>)?.role ?? "").trim().toLowerCase();
    // System admin: explicit platform role or org 1 (AI EVAL) admin
    const isSystemAdmin =
      platformRole === "system admin" ||
      platformRole === "system_admin" ||
      platformRole === "systemadmin" ||
      (Number(orgId) === 1 && role === "admin");

    // Resolve org name for filtering by organization (system admin or org admin); organization_id in vendor_self_attestations may be id or name
    let orgNameForFilter: string | null = null;
    if (orgId != null) {
      const numOrgId = Number(orgId);
      if (Number.isInteger(numOrgId) && numOrgId >= 1) {
        const [orgRow] = await db
          .select({ organizationName: createOrganization.organizationName })
          .from(createOrganization)
          .where(eq(createOrganization.id, numOrgId))
          .limit(1);
        orgNameForFilter = orgRow?.organizationName ?? null;
      }
    }
    const orgIdStr = orgId != null ? String(orgId) : "";

    const organizationId = typeof req.query?.organizationId === "string" ? req.query.organizationId.trim() : null;
    const attestationId = typeof req.query?.id === "string" ? req.query.id.trim() || null : null;

    // Explicit select (exclude public_directory_listing) so this works when that column does not exist yet
    const vendorSelect = {
      userId: vendors.userId,
      organizationId: vendors.organizationId,
      vendorName: vendors.vendorName,
      vendorType: vendors.vendorType,
      sector: vendors.sector,
      vendorMaturity: vendors.vendorMaturity,
      companyWebsite: vendors.companyWebsite,
      companyDescription: vendors.companyDescription,
      primaryContactName: vendors.primaryContactName,
      primaryContactEmail: vendors.primaryContactEmail,
      primaryContactRole: vendors.primaryContactRole,
      employeeCount: vendors.employeeCount,
      yearFounded: vendors.yearFounded,
      headquartersLocation: vendors.headquartersLocation,
      operatingRegions: vendors.operatingRegions,
      fundingStatus: vendors.fundingStatus,
      financialPosition: vendors.financialPosition,
      enterpriseCustomers: vendors.enterpriseCustomers,
      customerRetentionRate: vendors.customerRetentionRate,
      trustCentreUrl: vendors.trustCentreUrl,
      securityIncidents: vendors.securityIncidents,
    };
    const orgLookupKeys = [...new Set(
      [organizationId, orgIdStr, orgNameForFilter].filter((k): k is string => Boolean(k && String(k).trim())),
    )];
    let vendorRow: Record<string, unknown> | null = null;
    if (orgLookupKeys.length > 0) {
      const orgWhere =
        orgLookupKeys.length === 1
          ? eq(vendors.organizationId, orgLookupKeys[0])
          : or(...orgLookupKeys.map((k) => eq(vendors.organizationId, k)));
      const orgVendorRows = await db.select(vendorSelect).from(vendors).where(orgWhere).limit(1);
      vendorRow = (orgVendorRows[0] ?? null) as Record<string, unknown> | null;
    }
    if (!vendorRow) {
      const userVendorRows = await db.select(vendorSelect).from(vendors).where(eq(vendors.userId, userId)).limit(1);
      vendorRow = (userVendorRows[0] ?? null) as Record<string, unknown> | null;
    }

    /** Explicit select for attestation + user display fields (Drizzle does not accept ...table in select). */
    const attestationWithUserSelect = {
      id: vendorSelfAttestations.id,
      vendor_self_attestation_id: vendorSelfAttestations.vendor_self_attestation_id,
      user_id: vendorSelfAttestations.user_id,
      organization_id: vendorSelfAttestations.organization_id,
      vendor_type: vendorSelfAttestations.vendor_type,
      target_industries: vendorSelfAttestations.target_industries,
      company_stage: vendorSelfAttestations.company_stage,
      company_website: vendorSelfAttestations.company_website,
      company_description: vendorSelfAttestations.company_description,
      no_of_employees: vendorSelfAttestations.no_of_employees,
      year_founded: vendorSelfAttestations.year_founded,
      headquarter_location: vendorSelfAttestations.headquarter_location,
      operate_regions: vendorSelfAttestations.operate_regions,
      funding_status: vendorSelfAttestations.funding_status,
      financial_position: vendorSelfAttestations.financial_position,
      enterprise_customers: vendorSelfAttestations.enterprise_customers,
      customer_retention_rate: vendorSelfAttestations.customer_retention_rate,
      trust_centre_url: vendorSelfAttestations.trust_centre_url,
      has_public_security_incident: vendorSelfAttestations.has_public_security_incident,
      security_incidents: vendorSelfAttestations.security_incidents,
      product_name: vendorSelfAttestations.product_name,
      market_product_material: vendorSelfAttestations.market_product_material,
      tech_product_specifications: vendorSelfAttestations.tech_product_specifications,
      regulatorycompliance_cert_material: vendorSelfAttestations.regulatorycompliance_cert_material,
      purchase_decisions_by: vendorSelfAttestations.purchase_decisions_by,
      pain_points: vendorSelfAttestations.pain_points,
      alternatives_consider: vendorSelfAttestations.alternatives_consider,
      unique_solution: vendorSelfAttestations.unique_solution,
      roi_value_metrics: vendorSelfAttestations.roi_value_metrics,
      product_capabilities: vendorSelfAttestations.product_capabilities,
      ai_models_usage: vendorSelfAttestations.ai_models_usage,
      ai_model_transparency: vendorSelfAttestations.ai_model_transparency,
      ai_autonomy_level: vendorSelfAttestations.ai_autonomy_level,
      documented_ai_governance_policy: vendorSelfAttestations.documented_ai_governance_policy,
      security_compliance_certificates: vendorSelfAttestations.security_compliance_certificates,
      assessment_feedback: vendorSelfAttestations.assessment_feedback,
      audit_frequency: vendorSelfAttestations.audit_frequency,
      hipaa_baa: vendorSelfAttestations.hipaa_baa,
      fedramp_authorization: vendorSelfAttestations.fedramp_authorization,
      ...attestationExtendedColumnSelect,
      pii_information: vendorSelfAttestations.pii_information,
      data_residency_options: vendorSelfAttestations.data_residency_options,
      data_retention_policy: vendorSelfAttestations.data_retention_policy,
      bias_ai: vendorSelfAttestations.bias_ai,
      security_testing: vendorSelfAttestations.security_testing,
      human_oversight: vendorSelfAttestations.human_oversight,
      training_data_document: vendorSelfAttestations.training_data_document,
      sla_guarantee: vendorSelfAttestations.sla_guarantee,
      support_slas: vendorSelfAttestations.support_slas,
      change_management: vendorSelfAttestations.change_management,
      incident_response_plan: vendorSelfAttestations.incident_response_plan,
      rollback_deployment_issues: vendorSelfAttestations.rollback_deployment_issues,
      solution_hosted: vendorSelfAttestations.solution_hosted,
      deployment_scale: vendorSelfAttestations.deployment_scale,
      stage_product: vendorSelfAttestations.stage_product,
      test_policy_document: vendorSelfAttestations.test_policy_document,
      available_usage_data: vendorSelfAttestations.available_usage_data,
      audit_logs: vendorSelfAttestations.audit_logs,
      test_results: vendorSelfAttestations.test_results,
      assessment_id: vendorSelfAttestations.assessment_id,
      document_uploads: vendorSelfAttestations.document_uploads,
      status: vendorSelfAttestations.status,
      visible_to_buyer: vendorSelfAttestations.visible_to_buyer,
      visible_ai_governance: vendorSelfAttestations.visible_ai_governance,
      visible_security_posture: vendorSelfAttestations.visible_security_posture,
      visible_data_privacy: vendorSelfAttestations.visible_data_privacy,
      visible_compliance: vendorSelfAttestations.visible_compliance,
      visible_model_risk: vendorSelfAttestations.visible_model_risk,
      visible_data_practices: vendorSelfAttestations.visible_data_practices,
      visible_compliance_certifications: vendorSelfAttestations.visible_compliance_certifications,
      visible_operations_support: vendorSelfAttestations.visible_operations_support,
      visible_vendor_management: vendorSelfAttestations.visible_vendor_management,
      visible_company_identity: vendorSelfAttestations.visible_company_identity,
      visible_company_reach: vendorSelfAttestations.visible_company_reach,
      created_at: vendorSelfAttestations.created_at,
      updated_at: vendorSelfAttestations.updated_at,
      submitted_at: vendorSelfAttestations.submitted_at,
      expiry_at: vendorSelfAttestations.expiry_at,
      user_archived_at: vendorSelfAttestations.user_archived_at,
      compliance_document_expiries: vendorSelfAttestations.compliance_document_expiries,
      framework_mapping_rows: vendorSelfAttestations.framework_mapping_rows,
      generated_profile_report: vendorSelfAttestations.generated_profile_report,
      latest_trust_score: vendorSelfAttestations.latest_trust_score,
      latest_trust_grade: vendorSelfAttestations.latest_trust_grade,
      user_name: usersTable.user_name,
      user_first_name: usersTable.user_first_name,
      user_last_name: usersTable.user_last_name,
      user_email: usersTable.email,
    };

    let companyProfile: Record<string, unknown> = {};
    if (vendorRow) {
      const r = vendorRow as Record<string, unknown>;
      const sectorRaw = r.sector;
      let sector: Record<string, unknown> = {};
      if (typeof sectorRaw === "string") {
        try {
          const parsed = JSON.parse(sectorRaw);
          sector = typeof parsed === "object" && parsed !== null ? parsed : {};
        } catch {
          sector = {};
        }
      } else if (sectorRaw != null && typeof sectorRaw === "object") {
        sector = sectorRaw as Record<string, unknown>;
      }
      const resolvedVendorName =
        String(r.vendorName ?? "").trim() || orgNameForFilter || "";
      companyProfile = {
        userId: r.userId,
        organizationId: r.organizationId,
        vendorName: resolvedVendorName,
        vendorType: r.vendorType ?? "",
        sector,
        vendorMaturity: r.vendorMaturity ?? "",
        companyWebsite: r.companyWebsite ?? "",
        companyDescription: r.companyDescription ?? "",
        primaryContactName: r.primaryContactName ?? "",
        primaryContactEmail: r.primaryContactEmail ?? "",
        primaryContactRole: r.primaryContactRole ?? "",
        employeeCount: r.employeeCount ?? "",
        yearFounded: r.yearFounded ?? null,
        headquartersLocation: r.headquartersLocation ?? "",
        operatingRegions: Array.isArray(r.operatingRegions)
          ? r.operatingRegions
          : r.operatingRegions != null && typeof r.operatingRegions === "object"
            ? (r.operatingRegions as string[])
            : [],
        fundingStatus: r.fundingStatus ?? "",
        financialPosition: r.financialPosition ?? "",
        enterpriseCustomers: r.enterpriseCustomers ?? "",
        customerRetentionRate: r.customerRetentionRate ?? "",
        trustCentreUrl: r.trustCentreUrl ?? "",
        securityIncidents: Array.isArray(r.securityIncidents) ? r.securityIncidents : [],
      };
    }
    if (!String(companyProfile.vendorName ?? "").trim() && orgNameForFilter) {
      companyProfile = { ...companyProfile, vendorName: orgNameForFilter };
    }

    if (attestationId) {
      // System admin or any same-org user: allow access if attestation belongs to their org; otherwise require own user_id
      const orgFilter =
        orgIdStr && orgNameForFilter
          ? or(
              eq(vendorSelfAttestations.organization_id, orgIdStr),
              eq(vendorSelfAttestations.organization_id, orgNameForFilter),
            )
          : eq(vendorSelfAttestations.organization_id, orgIdStr || orgNameForFilter || "");
      const orgCondition =
        (orgIdStr || orgNameForFilter) ? orgFilter : eq(vendorSelfAttestations.user_id, userId);
      const whereSingle = and(
        eq(vendorSelfAttestations.id, attestationId),
        orgCondition,
      );
      const [one] = await db
        .select(attestationWithUserSelect)
        .from(vendorSelfAttestations)
        .leftJoin(usersTable, eq(vendorSelfAttestations.user_id, usersTable.id))
        .where(whereSingle)
        .limit(1);
      if (!one) {
        res.status(200).json({
          success: true,
          message: "Vendor self attestation data fetched successfully",
          companyProfile,
          attestation: {},
          attestations: [],
        });
        return;
      }
      const oneRow = one as Record<string, unknown>;
      const completedByName = userDisplayName({
        user_name: one.user_name ?? null,
        user_first_name: one.user_first_name ?? null,
        user_last_name: one.user_last_name ?? null,
        email: one.user_email ?? null,
      });
      const attestation = mapAttestationRow(oneRow, completedByName);
      const [reportRow] = await db
        .select({
          report: generatedProfileReports.report,
          summary: generatedProfileReports.summary,
          trust_score: generatedProfileReports.trust_score,
        })
        .from(generatedProfileReports)
        .where(eq(generatedProfileReports.attestation_id, attestationId))
        .orderBy(desc(generatedProfileReports.created_at))
        .limit(1);
      if (reportRow?.report != null || reportRow?.trust_score != null) {
        (attestation as Record<string, unknown>).generated_profile_report = mergeSummaryIntoReport(
          reportRow.report,
          reportRow.summary,
          reportRow.trust_score,
        );
        if (
          reportRow.trust_score != null &&
          Number.isFinite(Number(reportRow.trust_score)) &&
          Number(reportRow.trust_score) > 0 &&
          ((attestation as Record<string, unknown>).latest_trust_score == null ||
            !Number.isFinite(Number((attestation as Record<string, unknown>).latest_trust_score)) ||
            Number((attestation as Record<string, unknown>).latest_trust_score) <= 0)
        ) {
          (attestation as Record<string, unknown>).latest_trust_score = clampScore2(
            Number(reportRow.trust_score),
          );
        }
      } else if (
        (attestation as Record<string, unknown>).latest_trust_score != null
      ) {
        (attestation as Record<string, unknown>).generated_profile_report = mergeSummaryIntoReport(
          (attestation as Record<string, unknown>).generated_profile_report,
          null,
          Number((attestation as Record<string, unknown>).latest_trust_score),
        );
      }
      // When editing a draft: use company profile saved in the attestation (draft data), not onboarding.
      let resolvedCompanyProfile = companyProfile;
      if (attestationHasCompanyProfile(oneRow)) {
        resolvedCompanyProfile = {
          ...companyProfile,
          ...companyProfileFromAttestationRow(oneRow),
          userId: companyProfile?.userId ?? vendorRow ? (vendorRow as Record<string, unknown>).userId : oneRow.user_id,
          organizationId: companyProfile?.organizationId ?? vendorRow ? (vendorRow as Record<string, unknown>).organizationId : oneRow.organization_id,
        };
      }
      const attestationOrgId = String(oneRow.organization_id ?? "").trim();
      const attestationUserId = Number(oneRow.user_id);
      if (!String(resolvedCompanyProfile.vendorName ?? "").trim()) {
        const attestationOrgName = await lookupOrganizationName(attestationOrgId);
        const extraKeys = [...new Set([attestationOrgId, attestationOrgName].filter(Boolean))];
        for (const key of extraKeys) {
          if (orgLookupKeys.includes(key)) continue;
          const extraRows = await db.select(vendorSelect).from(vendors).where(eq(vendors.organizationId, key)).limit(1);
          const extraName = String((extraRows[0] as Record<string, unknown> | undefined)?.vendorName ?? "").trim();
          if (extraName) {
            resolvedCompanyProfile = { ...resolvedCompanyProfile, vendorName: extraName };
            break;
          }
        }
        if (
          !String(resolvedCompanyProfile.vendorName ?? "").trim() &&
          Number.isInteger(attestationUserId) &&
          attestationUserId >= 1
        ) {
          const byAttestationUser = await db
            .select(vendorSelect)
            .from(vendors)
            .where(eq(vendors.userId, attestationUserId))
            .limit(1);
          const extraName = String((byAttestationUser[0] as Record<string, unknown> | undefined)?.vendorName ?? "").trim();
          if (extraName) {
            resolvedCompanyProfile = { ...resolvedCompanyProfile, vendorName: extraName };
          }
        }
      }
      const resolvedVendorName = firstNonEmptyString(
        resolvedCompanyProfile.vendorName,
        companyProfile.vendorName,
        await lookupOrganizationName(attestationOrgId),
        orgNameForFilter,
      );
      resolvedCompanyProfile = { ...resolvedCompanyProfile, vendorName: resolvedVendorName };
      res.status(200).json({
        success: true,
        message: "Vendor self attestation data fetched successfully",
        companyProfile: resolvedCompanyProfile,
        attestation,
        attestations: [attestation],
      });
      return;
    }

    // System admin: fetch by their org; vendor/buyer with org: fetch by organization so same-org users can see and edit each other's drafts; no org: fetch by user_id
    const listWhere =
      (orgIdStr || orgNameForFilter)
        ? orgIdStr && orgNameForFilter
          ? or(
              eq(vendorSelfAttestations.organization_id, orgIdStr),
              eq(vendorSelfAttestations.organization_id, orgNameForFilter),
            )
          : eq(vendorSelfAttestations.organization_id, orgIdStr || orgNameForFilter || "")
        : eq(vendorSelfAttestations.user_id, userId);
    const attestRows = await db
      .select(attestationWithUserSelect)
      .from(vendorSelfAttestations)
      .leftJoin(usersTable, eq(vendorSelfAttestations.user_id, usersTable.id))
      .where(listWhere)
      .orderBy(desc(vendorSelfAttestations.created_at));
    const attestationIds = attestRows.map((r) => (r as Record<string, unknown>).id as string).filter(Boolean);
    const reportByAttestationId = new Map<string, unknown>();
    const trustColByAttestationId = new Map<string, number>();
    if (attestationIds.length > 0) {
      const reportRows = await db
        .select({
          attestation_id: generatedProfileReports.attestation_id,
          report: generatedProfileReports.report,
          summary: generatedProfileReports.summary,
          trust_score: generatedProfileReports.trust_score,
        })
        .from(generatedProfileReports)
        .where(inArray(generatedProfileReports.attestation_id, attestationIds))
        .orderBy(desc(generatedProfileReports.created_at));
      for (const r of reportRows) {
        const aid = r.attestation_id;
        if (aid && !reportByAttestationId.has(aid)) {
          reportByAttestationId.set(
            aid,
            mergeSummaryIntoReport(r.report, r.summary, r.trust_score),
          );
          if (r.trust_score != null && Number.isFinite(Number(r.trust_score))) {
            trustColByAttestationId.set(aid, Number(r.trust_score));
          }
        }
      }
    }
    const attestations = attestRows.map((row) => {
      const rowRecord = row as Record<string, unknown>;
      const completedByName = userDisplayName({
        user_name: row.user_name ?? null,
        user_first_name: row.user_first_name ?? null,
        user_last_name: row.user_last_name ?? null,
        email: row.user_email ?? null,
      });
      const att = mapAttestationRow(rowRecord, completedByName);
      const aid = rowRecord.id != null ? String(rowRecord.id) : "";
      const reportFromTable = aid ? reportByAttestationId.get(aid) : undefined;
      const colTrust = aid && trustColByAttestationId.has(aid) ? trustColByAttestationId.get(aid) : undefined;

      if (reportFromTable != null) {
        (att as Record<string, unknown>).generated_profile_report = reportFromTable;
      } else if ((att as Record<string, unknown>).latest_trust_score != null) {
        (att as Record<string, unknown>).generated_profile_report = mergeSummaryIntoReport(
          (att as Record<string, unknown>).generated_profile_report,
          null,
          Number((att as Record<string, unknown>).latest_trust_score),
        );
      } else if (colTrust != null) {
        (att as Record<string, unknown>).generated_profile_report = mergeSummaryIntoReport(
          (att as Record<string, unknown>).generated_profile_report,
          null,
          colTrust,
        );
      }

      // Always surface a numeric score for product cards when reports table has one
      const existingLatest = (att as Record<string, unknown>).latest_trust_score;
      if (
        (existingLatest == null || !Number.isFinite(Number(existingLatest)) || Number(existingLatest) <= 0) &&
        colTrust != null
      ) {
        (att as Record<string, unknown>).latest_trust_score = colTrust;
      } else if (
        (existingLatest == null || !Number.isFinite(Number(existingLatest)) || Number(existingLatest) <= 0) &&
        reportFromTable != null &&
        typeof reportFromTable === "object"
      ) {
        const ts = (reportFromTable as Record<string, unknown>).trustScore;
        if (ts != null && typeof ts === "object") {
          const n = Number((ts as Record<string, unknown>).overallScore);
          if (Number.isFinite(n) && n > 0) {
            (att as Record<string, unknown>).latest_trust_score = clampScore2(n);
          }
        }
      }
      return att;
    });
    const attestation = attestations[0] ?? {};

    res.status(200).json({
      success: true,
      message: "Vendor self attestation data fetched successfully",
      companyProfile,
      attestation,
      attestations,
    });
  } catch (error) {
    console.error("fetchVendorSelfAttestation error:", error);
    res.status(500).json({
      success: false,
      message: "Database or server error",
      companyProfile: {},
      attestation: {},
      attestations: [],
    });
  }
};

export default fetchVendorSelfAttestation;
