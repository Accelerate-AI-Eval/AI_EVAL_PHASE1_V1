/**
 * Apply all SQL migrations in `backend/migrations` in a safe order (idempotent where files use IF NOT EXISTS).
 *
 * Run from backend root:
 *   node migrations/run-migrations-all.mjs
 * Or:
 *   npm run db:migrate:all
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
dotenv.config({ path: path.join(backendRoot, ".env.local") });
dotenv.config({ path: path.join(backendRoot, ".env") });

const DATABASE_USER = process.env.DATABASE_USER ?? "postgres";
const DATABASE_PASSWORD = process.env.DATABASE_PASSWORD ?? "Postgresql123";
const DATABASE_HOST = process.env.DATABASE_HOST ?? "localhost";
const DATABASE_PORT = process.env.DATABASE_PORT ?? "5432";
const DATABASE_NAME = process.env.DATABASE_NAME ?? "ai_eval_db";
const fromParts = `postgresql://${encodeURIComponent(DATABASE_USER)}:${encodeURIComponent(DATABASE_PASSWORD)}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}`;
const connectionString = (process.env.DATABASE_URL ?? "").trim() || fromParts;

/** All `.sql` migration files in this folder, in run order. */
const sqlFiles = [
  "20260421_add_documented_ai_governance_policy.sql",
  "20260421_add_audit_frequency_to_vendor_self_attestations.sql",
  "20260421_add_support_slas_and_change_management.sql",
  "20260422_add_visible_company_identity_reach.sql",
  "20260423_add_user_archived_at_to_assessments.sql",
  "20260424_assessment_user_archive_log.sql",
  "20260425_add_user_archived_at_vendor_self_attestations.sql",
  "20260426_vendor_self_attestation_user_archive_log.sql",
  "20260714_enrich_generated_profile_reports_vts.sql",
  "20260716_score_rationale_columns.sql",
  "20260716_document_chunks_pgvector.sql",
  "20260721_llm_model_columns.sql",
  "20260721_general_reports_llm_model.sql",
  "20260730_vendor_import_long_text.sql",
  "20260811_llm_model_usage.sql",
  "20260811_llm_model_usage_events.sql",
  "20260813_org_token_quotas.sql",
  "20260813_admin_notifications.sql",
  "20260813_llm_usage_event_feature.sql",
  "20260813_backfill_usage_event_feature.sql",
  "20260813_org_status_archived.sql",
  "20260818_add_hipaa_baa_to_vendor_self_attestations.sql",
  "20260818_add_vendor_onboarding_business_fields.sql",
  "20260818_add_vendor_attestation_business_fields.sql",
  "20260818_add_fedramp_authorization.sql",
  "20260818_add_attestation_extended_fields.sql",
  "20260818_add_attestation_privacy_security_fields.sql",
  "20260820_attestation_privacy_security_checks.sql",
  "20260827_org_user_token_allocation_history.sql",
  "20260903_cots_buyer_archived_vendor_risk_report.sql",
  "20260903_contact_name_and_buyer_sector.sql",
  "20260903_assessment_risks.sql",
  "20260903_dpa_url.sql",
  "20260904_cots_vendor_desk_research_fields.sql",
  "20260907_cots_buyer_field_spec_v2.sql",
  "20261001_trust_score_two_decimals.sql",
];

const pool = new pg.Pool({ connectionString });
try {
  console.log("Running migrations in order…");
  for (const file of sqlFiles) {
    const sqlPath = path.join(__dirname, file);
    if (!fs.existsSync(sqlPath)) {
      console.warn(`Skip (file missing): ${file}`);
      continue;
    }
    const sql = fs.readFileSync(sqlPath, "utf8");
    await pool.query(sql);
    console.log(`  OK: ${file}`);
  }
  console.log("All listed migrations completed.");
} catch (err) {
  console.error("Migration failed:", err.message);
  if (err.detail) console.error("Detail:", err.detail);
  process.exitCode = 1;
} finally {
  await pool.end();
}
