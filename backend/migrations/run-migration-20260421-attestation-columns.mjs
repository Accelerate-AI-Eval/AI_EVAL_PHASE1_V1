/**
 * Run: node migrations/run-migration-20260421-attestation-columns.mjs
 * Applies:
 * - 20260421_add_documented_ai_governance_policy.sql
 * - 20260421_add_audit_frequency_to_vendor_self_attestations.sql
 * - 20260421_add_support_slas_and_change_management.sql
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

const sqlFiles = [
  "20260421_add_documented_ai_governance_policy.sql",
  "20260421_add_audit_frequency_to_vendor_self_attestations.sql",
  "20260421_add_support_slas_and_change_management.sql",
];

const pool = new pg.Pool({ connectionString });
try {
  for (const file of sqlFiles) {
    const sqlPath = path.join(__dirname, file);
    const sql = fs.readFileSync(sqlPath, "utf8");
    await pool.query(sql);
    console.log(`Migration ${file} applied successfully.`);
  }
} catch (err) {
  console.error("Migration failed:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
