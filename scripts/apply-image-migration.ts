/**
 * apply-image-migration.ts
 *
 * Applies supabase/migrations/20260402200000_image_assets.sql to the live DB
 * using a direct Postgres connection (bypasses PostgREST which can't run DDL).
 *
 * Prerequisites:
 *   1. Add to .env.local:
 *      SUPABASE_DB_URL=postgresql://postgres:[password]@db.zmnlsdohtwztneamvwaq.supabase.co:5432/postgres
 *      → get the password from: Supabase dashboard > Settings > Database > Connection string (Direct)
 *
 * Usage:
 *   npx tsx scripts/apply-image-migration.ts
 */

import { Client } from "pg";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFiles } from "./lib/loadEnvFiles";

loadEnvFiles([".env", ".env.local"]);

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error(`
❌  SUPABASE_DB_URL is not set.

Add it to .env.local:
  SUPABASE_DB_URL=postgresql://postgres:[password]@db.zmnlsdohtwztneamvwaq.supabase.co:5432/postgres

Get the password from:
  Supabase dashboard → Settings → Database → Connection string (Direct)
`);
  process.exit(1);
}

const MIGRATION_PATH = join(process.cwd(), "supabase/migrations/20260402200000_image_assets.sql");

if (!existsSync(MIGRATION_PATH)) {
  console.error(`Migration file not found: ${MIGRATION_PATH}`);
  process.exit(1);
}

async function main() {
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

  await client.connect();
  console.log("Connected to Supabase Postgres");

  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("✅  Migration applied: logo_assets + headshot_assets tables created");

    // Verify
    const res = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('logo_assets','headshot_assets') ORDER BY table_name"
    );
    console.log("Tables present:", res.rows.map((r: any) => r.table_name).join(", "));
  } catch (err: any) {
    await client.query("ROLLBACK");
    if (err.message?.includes("already exists")) {
      console.log("ℹ️  Migration already applied (objects already exist) — OK");
    } else {
      throw err;
    }
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
