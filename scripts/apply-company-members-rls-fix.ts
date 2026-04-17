/**
 * Fixes infinite recursion in company_members RLS policies.
 *
 * Set in .env.local:
 *   SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.zmnlsdohtwztneamvwaq.supabase.co:5432/postgres
 *
 * Password: Dashboard → Project Settings → Database → Database password (URI / Direct).
 *
 * Usage:
 *   npx tsx scripts/apply-company-members-rls-fix.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { loadEnvFiles } from "./lib/loadEnvFiles";

loadEnvFiles([".env", ".env.local"]);

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error(`
❌  SUPABASE_DB_URL is not set.

Add to .env.local (replace [PASSWORD] with your DB password from Supabase):
  SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.zmnlsdohtwztneamvwaq.supabase.co:5432/postgres

Dashboard: Settings → Database → Connection string → URI (use Direct, port 5432).
`);
  process.exit(1);
}

const MIGRATION_PATH = join(
  process.cwd(),
  "supabase/migrations/20260417190000_fix_company_members_rls_recursion.sql",
);

if (!existsSync(MIGRATION_PATH)) {
  console.error(`Migration file not found: ${MIGRATION_PATH}`);
  process.exit(1);
}

async function main() {
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

  await client.connect();
  console.log("Connected to Postgres (direct)");

  try {
    await client.query(sql);
    console.log("✅  Applied company_members RLS recursion fix");

    const fnCheck = await client.query(
      `SELECT proname FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND proname IN ('get_my_company_ids', 'is_company_owner')`
    );
    console.log(`   Helper functions found: ${fnCheck.rows.map((r) => r.proname).join(", ")}`);

    const policyCheck = await client.query(
      `SELECT policyname FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'company_members'`
    );
    console.log(`   Active policies: ${policyCheck.rows.map((r) => r.policyname).join(", ")}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("FATAL:", message);
  if (message.includes("ENOTFOUND") || message.includes("ECONNREFUSED")) {
    console.error(
      "Tip: Copy the exact 'Direct connection' URI from Supabase (db.<ref>.supabase.co:5432)."
    );
  }
  process.exit(1);
});
