/**
 * Applies Prisma funding-ingestion DDL to the database behind DATABASE_URL.
 * Use when `funding_deals` (etc.) is missing because migrations were baselined with
 * `migrate resolve --applied` without ever running the SQL on this Postgres.
 *
 *   npx tsx scripts/apply-funding-ingestion-schema.ts
 *
 * Requires DATABASE_URL (e.g. export from .env.local — same Supabase direct URI as ingest).
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { loadEnvFiles } from "./lib/loadEnvFiles";

loadEnvFiles([".env", ".env.local"]);

const FILES = [
  "prisma/migrations/20260415120000_funding_news_ingestion/migration.sql",
  "prisma/migrations/20260416100000_source_articles_listing_url/migration.sql",
] as const;

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("Missing DATABASE_URL. Set it to your Supabase direct Postgres URI.");
    process.exit(1);
  }

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("Connected:", new URL(url).hostname);

  try {
    for (const rel of FILES) {
      const path = join(process.cwd(), rel);
      if (!existsSync(path)) {
        console.error("File not found:", path);
        process.exit(1);
      }
      const sql = readFileSync(path, "utf8");
      console.log("Applying", rel, "…");
      await client.query(sql);
      console.log("  OK");
    }
  } finally {
    await client.end();
  }

  const verify = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await verify.connect();
  try {
    const r = await verify.query<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'funding_deals'`,
    );
    console.log("public.funding_deals present:", r.rows[0]?.n === "1" ? "yes" : "no");
  } finally {
    await verify.end();
  }
}

main().catch((e) => {
  console.error("FATAL:", e instanceof Error ? e.message : e);
  process.exit(1);
});
