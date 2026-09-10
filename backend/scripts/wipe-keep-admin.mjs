/**
 * Wipe all app data; keep platform admin admin@work.com (+ org id=1 if linked),
 * plus catalog tables: risk_mappings, risk_top5_mitigations, document_chunks.
 * Run: node scripts/wipe-keep-admin.mjs
 */
import bcrypt from "bcrypt";
import pg from "pg";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(__dirname, "..");
dotenv.config({ path: path.join(backendRoot, ".env.local") });
dotenv.config({ path: path.join(backendRoot, ".env") });

const DATABASE_USER = process.env.DATABASE_USER ?? "postgres";
const DATABASE_PASSWORD = process.env.DATABASE_PASSWORD ?? "Postgresql123";
const DATABASE_HOST = process.env.DATABASE_HOST ?? "127.0.0.1";
const DATABASE_PORT = process.env.DATABASE_PORT ?? "5432";
const DATABASE_NAME = process.env.DATABASE_NAME ?? "ai_q_vendors_db";
const fromParts = `postgresql://${encodeURIComponent(DATABASE_USER)}:${encodeURIComponent(DATABASE_PASSWORD)}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}`;
const connectionString = (process.env.DATABASE_URL ?? "").trim() || fromParts;

const ADMIN_EMAIL = "admin@work.com";
const ADMIN_PASSWORD = "12345678";

const KEEP_TABLES = new Set([
  "risk_mappings",
  "risk_top5_mitigations",
  "document_chunks",
]);

const pool = new pg.Pool({ connectionString });
const client = await pool.connect();

try {
  await client.query("BEGIN");

  // Snapshot admin row (if present)
  const adminRes = await client.query(
    `SELECT * FROM users WHERE lower(trim(email)) = lower(trim($1)) LIMIT 1`,
    [ADMIN_EMAIL],
  );
  let admin = adminRes.rows[0] ?? null;
  const orgId = admin?.organization_id != null ? Number(admin.organization_id) : 1;

  const orgRes = await client.query(
    `SELECT * FROM organizations WHERE id = $1 LIMIT 1`,
    [orgId],
  );
  let org = orgRes.rows[0] ?? null;

  // Truncate every public table (CASCADE clears FK deps)
  const tables = await client.query(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  `);
  const names = tables.rows.map((r) => r.tablename);
  if (names.length === 0) {
    throw new Error("No public tables found");
  }

  const truncateNames = names.filter((n) => !KEEP_TABLES.has(n));
  if (truncateNames.length === 0) {
    throw new Error("No tables left to truncate");
  }

  const quoted = truncateNames.map((n) => `"${n.replace(/"/g, '""')}"`).join(", ");
  console.log(`Keeping tables: ${[...KEEP_TABLES].filter((n) => names.includes(n)).join(", ") || "(none present)"}`);
  console.log(`Truncating ${truncateNames.length} tables…`);
  // Avoid TRUNCATE CASCADE: it would also wipe kept tables that FK to truncated ones.
  await client.query(`SET session_replication_role = 'replica'`);
  await client.query(`TRUNCATE TABLE ${quoted} RESTART IDENTITY`);
  await client.query(`SET session_replication_role = 'origin'`);

  // Recreate minimal org
  if (org) {
    await client.query(
      `INSERT INTO organizations (id, "organizationName", "organizationType", "organizationStatus", created_at, created_by)
       VALUES ($1, $2, $3, $4, COALESCE($5::timestamp, NOW()), $6)`,
      [
        org.id,
        org.organizationName ?? "ai eval",
        org.organizationType ?? "vendor",
        "active",
        org.created_at ?? null,
        org.created_by ?? "seed",
      ],
    );
  } else {
    await client.query(
      `INSERT INTO organizations (id, "organizationName", "organizationType", "organizationStatus", created_by)
       VALUES (1, 'ai eval', 'vendor', 'active', 'seed')`,
    );
  }

  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const keepOrgId = org?.id ?? 1;

  if (admin) {
    await client.query(
      `INSERT INTO users (
        id, email, organization_id, role, invited_at, invited_by, account_status,
        user_name, user_first_name, user_last_name, user_password,
        "userStatus", user_signup_completed, user_onboarding_completed,
        onboarding_status, onboarding_link_sent_at, user_platform_role
      ) VALUES (
        $1, $2, $3, 'system admin', COALESCE($4::timestamp, NOW()), $5, 'confirmed',
        COALESCE($6, 'Admin'), COALESCE($7, 'Admin'), COALESCE($8, 'Admin'), $9,
        'active', 'true', 'true',
        'completed', NULL, 'system admin'
      )`,
      [
        admin.id,
        ADMIN_EMAIL,
        keepOrgId,
        admin.invited_at ?? null,
        admin.invited_by ?? "1",
        admin.user_name ?? "Admin",
        admin.user_first_name ?? "Admin",
        admin.user_last_name ?? "Admin",
        hash,
      ],
    );
  } else {
    await client.query(
      `INSERT INTO users (
        email, organization_id, role, invited_by, account_status,
        user_name, user_first_name, user_last_name, user_password,
        "userStatus", user_signup_completed, user_onboarding_completed,
        onboarding_status, user_platform_role
      ) VALUES (
        $1, $2, 'system admin', '1', 'confirmed',
        'Admin', 'Admin', 'Admin', $3,
        'active', 'true', 'true',
        'completed', 'system admin'
      )`,
      [ADMIN_EMAIL, keepOrgId, hash],
    );
  }

  // Reset sequences
  await client.query(
    `SELECT setval(pg_get_serial_sequence('organizations', 'id'), GREATEST((SELECT MAX(id) FROM organizations), 1))`,
  );
  await client.query(
    `SELECT setval(pg_get_serial_sequence('users', 'id'), GREATEST((SELECT MAX(id) FROM users), 1))`,
  );

  await client.query("COMMIT");

  const leftUsers = await pool.query(`SELECT id, email, role, user_platform_role, organization_id FROM users`);
  const leftOrgs = await pool.query(`SELECT id, "organizationName", "organizationType" FROM organizations`);
  const counts = await pool.query(`
    SELECT c.relname AS table_name, c.reltuples::bigint AS estimate
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `);
  // Exact non-empty counts
  const nonempty = [];
  for (const t of names) {
    const r = await pool.query(`SELECT COUNT(*)::int AS n FROM "${t.replace(/"/g, '""')}"`);
    if (r.rows[0].n > 0) nonempty.push({ table: t, count: r.rows[0].n });
  }

  console.log("Kept organizations:", leftOrgs.rows);
  console.log("Kept users:", leftUsers.rows);
  console.log("Non-empty tables:", nonempty);
  console.log("Done. Login: admin@work.com / 12345678");
} catch (err) {
  try {
    await client.query("ROLLBACK");
  } catch {
    /* ignore */
  }
  console.error("Wipe failed:", err.message);
  if (err.detail) console.error("Detail:", err.detail);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
