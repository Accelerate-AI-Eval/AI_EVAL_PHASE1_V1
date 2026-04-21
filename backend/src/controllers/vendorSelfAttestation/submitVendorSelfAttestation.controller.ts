import type { Request, Response } from "express";
import * as path from "path";
import * as fs from "fs";
import { db } from "../../database/db.js";
import { vendorSelfAttestations, usersTable, generatedProfileReports } from "../../schema/schema.js";
import { and, eq, or, sql } from "drizzle-orm";
import { buildVendorDataFromPayload } from "../../utils/buildVendorDataFromPayload.js";
import { generateVendorAttestationReport, buildReportPayloadAndSummary } from "../agents/vendorAttestation.js";
import { parseAndStoreComplianceDocumentExpiries } from "../../services/complianceDocumentParser.js";

const UPLOADS_DIR = path.resolve(process.cwd(), "public", "uploads_vendor_attestations");

/** Allowed file extensions for document_uploads (metadata only; actual files validated on frontend). */
const ALLOWED_DOC_EXTENSIONS = [".pdf", ".doc", ".docx", ".ppt", ".pptx"];
const MAX_FILENAME_LENGTH = 255;

/**
 * Normalize and validate document_uploads from request.
 * Expected shape: "0": string[], "1": string[], "2": { categories, byCategory }, evidenceTestingPolicy?: string[], aiGovernancePolicy?: string[].
 * Slot 2 can be legacy string[] (then normalized to { categories: [], byCategory: {} }).
 * Returns { ok: true, value } or { ok: false, message }.
 * Optional keys: evidenceTestingPolicy, aiGovernancePolicy (string[] file names).
 */
function normalizeDocumentUploads(raw: unknown): { ok: true; value: Record<string, unknown> } | { ok: false; message: string } {
  if (raw == null) return { ok: true, value: {} };
  if (typeof raw !== "object") return { ok: false, message: "document_uploads must be an object" };
  const o = raw as Record<string, unknown>;
  const getExt = (name: string) => {
    const i = name.lastIndexOf(".");
    return i >= 0 ? name.slice(i).toLowerCase() : "";
  };
  const validateFileNames = (names: string[]): string | null => {
    for (const name of names) {
      if (name.length > MAX_FILENAME_LENGTH) return `File name too long: ${name.slice(0, 30)}...`;
      const ext = getExt(name);
      if (ext && !ALLOWED_DOC_EXTENSIONS.includes(ext)) return `Invalid file type for: ${name}. Accepted: PDF, DOCX, PPT.`;
    }
    return null;
  };
  const slot0 = Array.isArray(o["0"]) ? (o["0"] as unknown[]).filter((c): c is string => typeof c === "string") : [];
  const slot1 = Array.isArray(o["1"]) ? (o["1"] as unknown[]).filter((c): c is string => typeof c === "string") : [];
  let slot2: { categories: string[]; byCategory: Record<string, string[]> } = { categories: [], byCategory: {} };
  const raw2 = o["2"];
  if (raw2 != null && typeof raw2 === "object" && !Array.isArray(raw2)) {
    const s = raw2 as Record<string, unknown>;
    slot2 = {
      categories: Array.isArray(s.categories) ? (s.categories as unknown[]).filter((c): c is string => typeof c === "string") : [],
      byCategory: (() => {
        const bc: Record<string, string[]> = {};
        if (s.byCategory != null && typeof s.byCategory === "object") {
          for (const [k, v] of Object.entries(s.byCategory)) {
            if (typeof k !== "string") continue;
            bc[k] = Array.isArray(v) ? (v as unknown[]).filter((c): c is string => typeof c === "string") : [];
          }
        }
        return bc;
      })(),
    };
  }
  const evidenceTestingPolicy = Array.isArray(o.evidenceTestingPolicy)
    ? (o.evidenceTestingPolicy as unknown[]).filter((c): c is string => typeof c === "string")
    : [];
  const aiGovernancePolicy = Array.isArray(o.aiGovernancePolicy)
    ? (o.aiGovernancePolicy as unknown[]).filter((c): c is string => typeof c === "string")
    : [];
  let err = validateFileNames(slot0);
  if (err) return { ok: false, message: err };
  err = validateFileNames(slot1);
  if (err) return { ok: false, message: err };
  for (const arr of Object.values(slot2.byCategory)) {
    err = validateFileNames(arr);
    if (err) return { ok: false, message: err };
  }
  err = validateFileNames(evidenceTestingPolicy);
  if (err) return { ok: false, message: err };
  err = validateFileNames(aiGovernancePolicy);
  if (err) return { ok: false, message: err };
  return {
    ok: true,
    value: { "0": slot0, "1": slot1, "2": slot2, evidenceTestingPolicy, aiGovernancePolicy },
  };
}

/**
 * Collect all file names from normalized document_uploads (slots 0, 1, 2.byCategory, evidenceTestingPolicy).
 */
function getAllDocumentFileNames(docUpload: Record<string, unknown> | null): Set<string> {
  const names = new Set<string>();
  if (!docUpload || typeof docUpload !== "object") return names;
  const add = (arr: unknown[]) => {
    if (!Array.isArray(arr)) return;
    for (const x of arr) if (typeof x === "string" && x.trim()) names.add(x.trim());
  };
  add((docUpload["0"] as unknown[]) ?? []);
  add((docUpload["1"] as unknown[]) ?? []);
  const slot2 = docUpload["2"];
  if (slot2 != null && typeof slot2 === "object" && !Array.isArray(slot2)) {
    const byCat = (slot2 as Record<string, unknown>).byCategory;
    if (byCat != null && typeof byCat === "object")
      for (const arr of Object.values(byCat)) add((arr as unknown[]) ?? []);
  }
  add((docUpload.evidenceTestingPolicy as unknown[]) ?? []);
  add((docUpload.aiGovernancePolicy as unknown[]) ?? []);
  return names;
}

/**
 * Delete from disk any files that were removed from document_uploads (only files under attestation dir).
 */
function deleteRemovedDocumentFiles(attestationId: string, removedNames: Set<string>): void {
  if (removedNames.size === 0) return;
  const dir = path.resolve(UPLOADS_DIR, attestationId);
  const baseResolved = path.resolve(UPLOADS_DIR);
  if (!dir.startsWith(baseResolved)) return;
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
  for (const fileName of removedNames) {
    const base = path.basename(fileName);
    if (!base || base === "." || base === "..") continue;
    const filePath = path.resolve(dir, base);
    const relative = path.relative(dir, filePath);
    if (relative.startsWith("..") || path.isAbsolute(relative)) continue;
    try {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) fs.unlinkSync(filePath);
    } catch (err) {
      console.error("deleteRemovedDocumentFiles: failed to unlink", filePath, err);
    }
  }
}

type ReportPayload = { trustScore: unknown; sections: unknown[] };

/**
 * Generate product profile report from vendor data and insert into generated_profile_reports.
 * Returns the report payload for the response, or null on error.
 */
async function generateAndStoreProfileReport(
  vendorData: string,
  formulaPayload: Record<string, unknown>,
  userId: number,
  organizationIdStr: string | null,
  attestationId: string,
): Promise<ReportPayload | null> {
  try {
    const report = await generateVendorAttestationReport(vendorData, formulaPayload);
    const { reportPayload, trustScoreNum, summaryToStore } = buildReportPayloadAndSummary(report);

    const summaryForDb = summaryToStore && summaryToStore.length > 0 ? summaryToStore : null;
    // console.log("[Summary] Step: submitVendorSelfAttestation (generateAndStoreProfileReport) — before DB insert | attestation_id:", attestationId, "| summaryToStore:", summaryToStore == null ? "undefined" : "length " + summaryToStore.length, "| summary column value:", summaryForDb == null ? "null" : "length " + summaryForDb.length);
    // if (summaryForDb) console.log("[Summary] Step: submitVendorSelfAttestation — complete summary being stored:", summaryForDb);

    const trustScoreForDb = Number.isFinite(trustScoreNum) ? Math.round(trustScoreNum) : 0;
    await db.insert(generatedProfileReports).values({
      user_id: userId,
      organization_id: organizationIdStr ?? undefined,
      attestation_id: attestationId,
      trust_score: trustScoreForDb,
      summary: summaryForDb,
      report: reportPayload,
    });

    // console.log("[Summary] Step: submitVendorSelfAttestation (generateAndStoreProfileReport) — inserted into generated_profile_reports | attestation_id:", attestationId, "| summary stored:", summaryForDb != null);

    return reportPayload;
  } catch (err) {
    console.error("generateVendorAttestationReport after submit:", err);
    return null;
  }
}

/**
 * POST vendor self attestation: create new or update existing by id.
 * - newAttestation: true OR no attestationId → always INSERT a new row (status DRAFT or COMPLETED). Never reuse or modify existing.
 * - attestationId provided (and not newAttestation) → UPDATE that row only if status is not COMPLETED (completed are immutable).
 * - New records: status "DRAFT" when is_draft true, "COMPLETED" when submit. Editing only by explicit attestationId.
 */
const submitVendorSelfAttestation = async (req: Request, res: Response): Promise<void> => {
  try {
    // --- 1. Resolve user id from JWT (id/userId) or by email ---
    const payload = req.user as {
      id?: number;
      userId?: string | number;
      email?: string;
    } | undefined;
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
      });
      return;
    }

    // --- 1b. Resolve user's organization_id for storing with attestation and same-org update check ---
    const [userRow] = await db
      .select({ organization_id: usersTable.organization_id })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const organizationIdStr = userRow?.organization_id != null ? String(userRow.organization_id) : null;

    // --- 2. Normalize request body: accept current API names (snake_case); map to DB columns (Excel sheet names) ---
    const b = req.body ?? {};
    const get = (key: string) => b[key] ?? b[key.replace(/_([a-z])/g, (_, c) => c.toUpperCase())];
    const asJson = (v: unknown) => (Array.isArray(v) || (v != null && typeof v === "object") ? v : null);

    const productNameRaw = get("product_name") ?? get("productName");
    const product_name =
      productNameRaw != null && String(productNameRaw).trim() !== ""
        ? String(productNameRaw).trim().slice(0, 255)
        : null;
    const purchase_decisions_by = asJson(get("purchase_decision_makers"));
    const pain_points = get("pain_points_solved") != null ? String(get("pain_points_solved")) : null;
    const alternatives_consider = get("alternatives_considered") != null ? String(get("alternatives_considered")) : null;
    const unique_solution = get("unique_value_proposition") != null ? String(get("unique_value_proposition")) : null;
    const roi_value_metrics = get("typical_customer_roi") != null ? String(get("typical_customer_roi")).slice(0, 500) : null;
    const product_capabilities = asJson(get("ai_capabilities"));
    const ai_models_usage = asJson(get("ai_model_types"));
    const ai_model_transparency = get("model_transparency") != null ? String(get("model_transparency")).slice(0, 100) : null;
    const ai_autonomy_level = get("decision_autonomy") != null ? String(get("decision_autonomy")).slice(0, 100) : null;
    const documented_ai_governance_policy =
      get("documented_ai_governance_policy") != null
        ? String(get("documented_ai_governance_policy")).slice(0, 100)
        : null;
    const security_compliance_certificates = asJson(get("security_certifications"));
    const assessment_feedback = get("assessment_completion_level") != null ? String(get("assessment_completion_level")).slice(0, 100) : null;
    const audit_frequency = get("audit_frequency") != null ? String(get("audit_frequency")).slice(0, 100) : null;
    const pii_information = get("pii_handling") != null ? String(get("pii_handling")).slice(0, 100) : null;
    const data_residency_options = asJson(get("data_residency_options"));
    const data_retention_policy = get("data_retention_policy") != null ? String(get("data_retention_policy")) : null;
    const bias_ai = asJson(get("bias_testing_approach"));
    const security_testing = get("adversarial_security_testing") != null ? String(get("adversarial_security_testing")).slice(0, 100) : null;
    const human_oversight = asJson(get("human_oversight"));
    const training_data_document = get("training_data_documentation") != null ? String(get("training_data_documentation")).slice(0, 100) : null;
    const sla_guarantee = get("uptime_sla") != null ? String(get("uptime_sla")).slice(0, 100) : null;
    const support_slas = get("support_slas") != null ? String(get("support_slas")) : null;
    const change_management = get("change_management") != null ? String(get("change_management")) : null;
    const incident_response_plan = get("incident_response_plan") != null ? String(get("incident_response_plan")).slice(0, 100) : null;
    const rollback_deployment_issues = get("rollback_capability") != null ? String(get("rollback_capability")).slice(0, 100) : null;
    const solution_hosted = asJson(get("hosting_deployment"));
    const deployment_scale = get("deployment_scale") != null ? String(get("deployment_scale")).slice(0, 100) : null;
    const stage_product = get("product_stage") != null ? String(get("product_stage")).slice(0, 100) : null;
    const available_usage_data = get("interaction_data_available") != null ? String(get("interaction_data_available")).slice(0, 100) : null;
    const audit_logs = get("audit_logs_available") != null ? String(get("audit_logs_available")).slice(0, 100) : null;
    const test_results = get("testing_results_available") != null ? String(get("testing_results_available")).slice(0, 100) : null;
    const document_uploadsRaw = get("document_uploads");
    const docUploadResult = normalizeDocumentUploads(document_uploadsRaw);
    if (!docUploadResult.ok) {
      res.status(400).json({ success: false, message: docUploadResult.message });
      return;
    }
    const document_uploads = Object.keys(docUploadResult.value).length > 0 ? docUploadResult.value : null;

    // Company profile (from step 0): save with draft so editing draft shows saved data, not onboarding.
    const cp = (b.companyProfile && typeof b.companyProfile === "object") ? (b.companyProfile as Record<string, unknown>) : {};
    const cpGet = (key: string) => cp[key] ?? get(key);
    const sectorVal = cpGet("sector");
    const target_industries = sectorVal != null && typeof sectorVal === "object" ? sectorVal : (typeof sectorVal === "string" && sectorVal.trim() ? (() => { try { return JSON.parse(sectorVal); } catch { return null; } })() : null);
    const operatingRegionsRaw = cpGet("operatingRegions");
    const operate_regions = Array.isArray(operatingRegionsRaw) ? operatingRegionsRaw : (typeof operatingRegionsRaw === "string" && operatingRegionsRaw.trim() ? (() => { try { const p = JSON.parse(operatingRegionsRaw); return Array.isArray(p) ? p : null; } catch { return null; } })() : null);
    const companyProfileValues = {
      vendor_type: cpGet("vendorType") != null ? String(cpGet("vendorType")).slice(0, 100) : null,
      target_industries: target_industries != null && typeof target_industries === "object" ? target_industries : null,
      company_stage: cpGet("vendorMaturity") != null ? String(cpGet("vendorMaturity")).slice(0, 100) : null,
      company_website: cpGet("companyWebsite") != null ? String(cpGet("companyWebsite")).slice(0, 500) : null,
      company_description: cpGet("companyDescription") != null ? String(cpGet("companyDescription")) : null,
      no_of_employees: cpGet("employeeCount") != null ? String(cpGet("employeeCount")).slice(0, 100) : null,
      year_founded: (() => { const v = cpGet("yearFounded"); if (v == null || String(v).trim() === "") return null; const n = parseInt(String(v), 10); return Number.isInteger(n) ? n : null; })(),
      headquarter_location: cpGet("headquartersLocation") != null ? String(cpGet("headquartersLocation")).slice(0, 255) : null,
      operate_regions,
    };

    // Saving a draft does NOT mark as completed. Only final Submit sets COMPLETED.
    const rawDraft = get("is_draft");
    const isDraft =
      rawDraft === true ||
      rawDraft === "true" ||
      String(rawDraft).toLowerCase() === "true" ||
      rawDraft === 1;
    const status = isDraft ? "DRAFT" : "COMPLETED";

    const values = {
      user_id: userId,
      organization_id: organizationIdStr,
      status,
      ...(status === "COMPLETED" ? { submitted_at: new Date() } : {}),
      ...companyProfileValues,
      product_name,
      purchase_decisions_by,
      pain_points,
      alternatives_consider,
      unique_solution,
      roi_value_metrics,
      product_capabilities,
      ai_models_usage,
      ai_model_transparency,
      ai_autonomy_level,
      documented_ai_governance_policy,
      security_compliance_certificates,
      assessment_feedback,
      audit_frequency,
      pii_information,
      data_residency_options,
      data_retention_policy,
      bias_ai,
      security_testing,
      human_oversight,
      training_data_document,
      sla_guarantee,
      support_slas,
      change_management,
      incident_response_plan,
      rollback_deployment_issues,
      solution_hosted,
      deployment_scale,
      stage_product,
      available_usage_data,
      audit_logs,
      test_results,
      document_uploads,
    };

    const rawNew = get("newAttestation");
    const newAttestation =
      rawNew === true ||
      rawNew === "true" ||
      String(rawNew).toLowerCase() === "true" ||
      rawNew === 1;
    const attestationIdRaw = get("attestationId") ?? get("id");
    const attestationId = typeof attestationIdRaw === "string" ? attestationIdRaw.trim() || null : null;

    /** Map DB columns (Excel names) back to API response shape (current names for UI). */
    const buildAttestationResponse = (row: Record<string, unknown>) => ({
      id: row.id,
      status: row.status ?? status,
      created_at: row.created_at ?? undefined,
      updated_at: row.updated_at ?? undefined,
      product_name: row.product_name ?? undefined,
      purchase_decision_makers: row.purchase_decisions_by ?? undefined,
      pain_points_solved: row.pain_points ?? undefined,
      alternatives_considered: row.alternatives_consider ?? undefined,
      unique_value_proposition: row.unique_solution ?? undefined,
      typical_customer_roi: row.roi_value_metrics ?? undefined,
      ai_capabilities: row.product_capabilities ?? undefined,
      ai_model_types: row.ai_models_usage ?? undefined,
      model_transparency: row.ai_model_transparency ?? undefined,
      decision_autonomy: row.ai_autonomy_level ?? undefined,
      documented_ai_governance_policy: row.documented_ai_governance_policy ?? undefined,
      security_certifications: row.security_compliance_certificates ?? undefined,
      assessment_completion_level: row.assessment_feedback ?? undefined,
      audit_frequency: row.audit_frequency ?? undefined,
      pii_handling: row.pii_information ?? undefined,
      data_residency_options: row.data_residency_options ?? undefined,
      data_retention_policy: row.data_retention_policy ?? undefined,
      bias_testing_approach: row.bias_ai ?? undefined,
      adversarial_security_testing: row.security_testing ?? undefined,
      human_oversight: row.human_oversight ?? undefined,
      training_data_documentation: row.training_data_document ?? undefined,
      uptime_sla: row.sla_guarantee ?? undefined,
      support_slas: row.support_slas ?? undefined,
      change_management: row.change_management ?? undefined,
      incident_response_plan: row.incident_response_plan ?? undefined,
      rollback_capability: row.rollback_deployment_issues ?? undefined,
      hosting_deployment: row.solution_hosted ?? undefined,
      deployment_scale: row.deployment_scale ?? undefined,
      product_stage: row.stage_product ?? undefined,
      interaction_data_available: row.available_usage_data ?? undefined,
      audit_logs_available: row.audit_logs ?? undefined,
      testing_results_available: row.test_results ?? undefined,
      document_uploads: row.document_uploads ?? undefined,
      generated_profile_report: row.generated_profile_report ?? undefined,
    });

    // --- New Attestation: always INSERT (never reuse or overwrite existing). No attestationId = create new. ---
    if (newAttestation || !attestationId) {
      const [inserted] = await db
        .insert(vendorSelfAttestations)
        .values(values)
        .returning({
          id: vendorSelfAttestations.id,
          status: vendorSelfAttestations.status,
          created_at: vendorSelfAttestations.created_at,
          updated_at: vendorSelfAttestations.updated_at,
          product_name: vendorSelfAttestations.product_name,
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
          available_usage_data: vendorSelfAttestations.available_usage_data,
          audit_logs: vendorSelfAttestations.audit_logs,
          test_results: vendorSelfAttestations.test_results,
          document_uploads: vendorSelfAttestations.document_uploads,
          generated_profile_report: vendorSelfAttestations.generated_profile_report,
        });
      const insertedId = inserted?.id as string | undefined;
      let reportPayload: ReportPayload | null = null;
      if (status === "COMPLETED" && insertedId) {
        const vendorData = buildVendorDataFromPayload(b);
        reportPayload = await generateAndStoreProfileReport(
          vendorData,
          b as Record<string, unknown>,
          userId,
          organizationIdStr ?? null,
          insertedId,
        );
        if (document_uploads) {
          void parseAndStoreComplianceDocumentExpiries(
            insertedId,
            document_uploads as Record<string, unknown>,
          ).catch((err) => console.error("Compliance document expiry parse:", err));
        }
      }
      const [rowAfter] = insertedId
        ? await db
            .select({
              id: vendorSelfAttestations.id,
              status: vendorSelfAttestations.status,
              created_at: vendorSelfAttestations.created_at,
              updated_at: vendorSelfAttestations.updated_at,
              product_name: vendorSelfAttestations.product_name,
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
              available_usage_data: vendorSelfAttestations.available_usage_data,
              audit_logs: vendorSelfAttestations.audit_logs,
              test_results: vendorSelfAttestations.test_results,
              document_uploads: vendorSelfAttestations.document_uploads,
              generated_profile_report: vendorSelfAttestations.generated_profile_report,
            })
            .from(vendorSelfAttestations)
            .where(eq(vendorSelfAttestations.id, insertedId))
            .limit(1)
        : [inserted];
      const att = rowAfter ? buildAttestationResponse(rowAfter as Record<string, unknown>) : (inserted ? buildAttestationResponse(inserted as Record<string, unknown>) : null);
      if (att && reportPayload) (att as Record<string, unknown>).generated_profile_report = reportPayload;
      res.status(201).json({
        success: true,
        message: isDraft ? "Draft saved successfully" : "Vendor self attestation submitted successfully",
        status,
        attestation: att,
      });
      return;
    }

    // --- Update existing by id: owner can edit draft/rejected; same-org user can edit only DRAFT (not completed/rejected) ---
    if (attestationId) {
      const updateWhere =
        organizationIdStr
          ? and(
              eq(vendorSelfAttestations.id, attestationId),
              or(
                eq(vendorSelfAttestations.user_id, userId),
                and(
                  eq(vendorSelfAttestations.organization_id, organizationIdStr),
                  eq(vendorSelfAttestations.status, "DRAFT"),
                ),
              ),
            )
          : and(eq(vendorSelfAttestations.id, attestationId), eq(vendorSelfAttestations.user_id, userId));
      const [existingById] = await db
        .select({
          id: vendorSelfAttestations.id,
          status: vendorSelfAttestations.status,
          document_uploads: vendorSelfAttestations.document_uploads,
        })
        .from(vendorSelfAttestations)
        .where(updateWhere)
        .limit(1);
      if (!existingById) {
        res.status(404).json({ success: false, message: "Attestation not found" });
        return;
      }
      const currentStatus = String((existingById as { status?: string }).status ?? "").toUpperCase();
      if (currentStatus === "COMPLETED") {
        res.status(403).json({
          success: false,
          message: "Completed attestations cannot be modified. Start a new attestation to make changes.",
        });
        return;
      }
      const oldDocUpload = (existingById as { document_uploads?: Record<string, unknown> | null }).document_uploads;
      const oldNames = getAllDocumentFileNames(oldDocUpload ?? null);
      const newNames = getAllDocumentFileNames(docUploadResult.value as Record<string, unknown>);
      const removed = new Set<string>();
      for (const n of oldNames) if (!newNames.has(n)) removed.add(n);
      deleteRemovedDocumentFiles(attestationId, removed);

      await db
        .update(vendorSelfAttestations)
        .set({
          ...values,
          updated_at: sql`now()`,
          ...(status === "COMPLETED" ? { submitted_at: sql`now()` } : {}),
        })
        .where(updateWhere);
      let reportPayload: ReportPayload | null = null;
      if (status === "COMPLETED") {
        const vendorData = buildVendorDataFromPayload(b);
        reportPayload = await generateAndStoreProfileReport(
          vendorData,
          b as Record<string, unknown>,
          userId,
          organizationIdStr ?? null,
          attestationId,
        );
        if (document_uploads) {
          void parseAndStoreComplianceDocumentExpiries(
            attestationId,
            document_uploads as Record<string, unknown>,
          ).catch((err) => console.error("Compliance document expiry parse:", err));
        }
      }
      const [savedRow] = await db
        .select({
          id: vendorSelfAttestations.id,
          status: vendorSelfAttestations.status,
          created_at: vendorSelfAttestations.created_at,
          updated_at: vendorSelfAttestations.updated_at,
          product_name: vendorSelfAttestations.product_name,
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
          available_usage_data: vendorSelfAttestations.available_usage_data,
          audit_logs: vendorSelfAttestations.audit_logs,
          test_results: vendorSelfAttestations.test_results,
          document_uploads: vendorSelfAttestations.document_uploads,
          generated_profile_report: vendorSelfAttestations.generated_profile_report,
        })
        .from(vendorSelfAttestations)
        .where(eq(vendorSelfAttestations.id, attestationId))
        .limit(1);
      const att = savedRow ? buildAttestationResponse(savedRow as Record<string, unknown>) : null;
      if (att && reportPayload) (att as Record<string, unknown>).generated_profile_report = reportPayload;
      res.status(200).json({
        success: true,
        message: isDraft ? "Draft saved successfully" : "Vendor self attestation submitted successfully",
        status,
        attestation: att,
      });
      return;
    }

    // --- Only reachable when attestationId is set and newAttestation is false: update that row (already handled above). ---
    res.status(400).json({
      success: false,
      message: "Either newAttestation or attestationId must be provided.",
    });
  } catch (error) {
    console.error("submitVendorSelfAttestation error:", error);
    res.status(500).json({
      success: false,
      message: "Database or server error",
    });
  }
};

export default submitVendorSelfAttestation;
