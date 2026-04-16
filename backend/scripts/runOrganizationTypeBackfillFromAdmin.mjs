/**
 * Backfills organizations."organizationType" from admin users' user_platform_role (vendor/buyer).
 */
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: join(__dirname, "..", ".env.local") });

const DATABASE_URL = process.env.DATABASE_URL?.trim();
const DATABASE_USER = process.env.DATABASE_USER ?? "postgres";
const DATABASE_PASSWORD = process.env.DATABASE_PASSWORD ?? "Postgresql123";
const DATABASE_HOST = process.env.DATABASE_HOST ?? "localhost";
const DATABASE_PORT = process.env.DATABASE_PORT ?? "5432";
const DATABASE_NAME = process.env.DATABASE_NAME ?? "ai_eval_db";

const connectionString =
  DATABASE_URL ||
  `postgresql://${encodeURIComponent(DATABASE_USER)}:${encodeURIComponent(DATABASE_PASSWORD)}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}`;

const sqlPath = join(__dirname, "..", "..", "DataBase", "backfill_organizations_type_from_admin.sql");
const sql = readFileSync(sqlPath, "utf8");

const client = new pg.Client({ connectionString });
await client.connect();
try {
  const result = await client.query(sql);
  console.log(
    `Backfill organizationType from admin user_platform_role completed (rows updated: ${result.rowCount ?? "unknown"}).`,
  );
} finally {
  await client.end();
}
