/**
 * Applies the latest get_recent_funding_feed RPC migration over a direct Postgres connection
 * (bypasses Supabase management API / CLI login issues).
 *
 * Set in .env.local (same pattern as scripts/apply-image-migration.ts):
 *   SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.zmnlsdohtwztneamvwaq.supabase.co:5432/postgres
 *
 * Password: Dashboard → Project Settings → Database → Database password (URI / Direct).
 *
 * Usage:
 *   npx tsx scripts/apply-recent-funding-feed-migration.ts
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

/** Prefer the latest RPC definition (canonical-first priority). */
const MIGRATION_PATH = join(
  process.cwd(),
  "supabase/migrations/20260430140000_get_recent_funding_feed_canonical_priority.sql",
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
    console.log("✅  Applied get_recent_funding_feed RPC + grants");

    const check = await client.query(
      `SELECT proname FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND proname = 'get_recent_funding_feed'`
    );
    if (check.rows.length === 0) {
      console.warn("⚠️  Function not found after apply — check SQL errors above.");
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("already exists") || message.includes("duplicate key")) {
      console.log("ℹ️  Objects already present — OK");
    } else {
      throw err;
    }
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error("FATAL:", message);
  if (message.includes("ENOTFOUND") || message.includes("ECONNREFUSED")) {
    console.error(`
Tip: If the host is wrong, copy the exact "Direct connection" URI from Supabase (db.<ref>.supabase.co:5432).
For Prisma/ingest from your laptop, prefer the same URI or the Session pooler (port 6543) if direct is blocked.
`);
  }
  if (message.includes('relation "funding_deals" does not exist')) {
    console.error(`
This database does not have Prisma funding tables yet. On this same database run:
  npx prisma migrate deploy
(use DATABASE_URL pointing at this Postgres — often the same string as SUPABASE_DB_URL with sslmode=require)
`);
  }
  process.exit(1);
});
