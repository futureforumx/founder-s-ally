/**
 * Applies the create_company_workspace SECURITY DEFINER RPC migration.
 *
 * Set in .env.local:
 *   SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.zmnlsdohtwztneamvwaq.supabase.co:5432/postgres
 *
 * Usage:
 *   npx tsx scripts/apply-create-company-workspace-rpc.ts
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

Add to .env.local:
  SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.zmnlsdohtwztneamvwaq.supabase.co:5432/postgres

Dashboard: Settings → Database → Connection string → URI (Direct, port 5432).
`);
  process.exit(1);
}

const MIGRATION_PATH = join(
  process.cwd(),
  "supabase/migrations/20260417200000_create_company_workspace_rpc.sql",
);

if (!existsSync(MIGRATION_PATH)) {
  console.error(`Migration file not found: ${MIGRATION_PATH}`);
  process.exit(1);
}

async function main() {
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

  await client.connect();
  console.log("Connected.");

  try {
    await client.query(sql);
    console.log("✅  Applied create_company_workspace RPC");

    const check = await client.query(
      `SELECT proname FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND proname = 'create_company_workspace'`
    );
    if (check.rows.length > 0) {
      console.log("   Function confirmed in database.");
    } else {
      console.warn("⚠️  Function not found after apply.");
    }
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error("FATAL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
