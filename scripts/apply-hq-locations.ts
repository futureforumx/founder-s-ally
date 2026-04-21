/**
 * Apply canonical HQ locations for Corazon Capital, Lux Capital, and Antler
 * directly to the Supabase Postgres database, then report affected row counts.
 *
 * Set in .env.local:
 *   SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.<ref>.supabase.co:5432/postgres
 *
 * Dashboard → Project Settings → Database → Connection string → URI (Direct, port 5432).
 *
 * Usage:
 *   npx tsx scripts/apply-hq-locations.ts
 */

import { Client } from "pg";
import { loadEnvFiles } from "./lib/loadEnvFiles";

loadEnvFiles([".env", ".env.local"]);

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
  console.error(`
❌  SUPABASE_DB_URL is not set.

Add to .env.local:
  SUPABASE_DB_URL=postgresql://postgres:[PASSWORD]@db.<ref>.supabase.co:5432/postgres

Dashboard: Settings → Database → Connection string → URI (use Direct, port 5432).
`);
  process.exit(1);
}

type HqFirm = { name: string; city: string; state: string; location: string };

const FIRMS: HqFirm[] = [
  { name: "Corazon Capital", city: "Chicago",  state: "IL", location: "Chicago, IL"  },
  { name: "Lux Capital",     city: "New York", state: "NY", location: "New York, NY" },
  { name: "Antler",          city: "New York", state: "NY", location: "New York, NY" },
];

async function applyFirmRecords(client: Client, firm: HqFirm): Promise<number> {
  const res = await client.query<{ count: string }>(
    `UPDATE public.firm_records
     SET
       hq_city             = $1,
       hq_state            = $2,
       hq_country          = NULL,
       location            = $3,
       canonical_hq_locked = true,
       canonical_hq_source = 'manual_admin',
       canonical_hq_set_at = now(),
       updated_at          = now()
     WHERE deleted_at IS NULL
       AND lower(trim(firm_name)) = lower(trim($4))
     RETURNING (SELECT count(*) FROM firm_records WHERE lower(trim(firm_name)) = lower(trim($4)))::text AS count`,
    [firm.city, firm.state, firm.location, firm.name],
  );
  // rowCount is the number of rows updated
  return res.rowCount ?? 0;
}

async function applyVcFirms(client: Client, firm: HqFirm): Promise<number> {
  const res = await client.query(
    `UPDATE public.vc_firms
     SET
       hq_city    = $1,
       hq_state   = $2,
       hq_country = NULL,
       updated_at = now()
     WHERE deleted_at IS NULL
       AND lower(trim(firm_name)) = lower(trim($3))`,
    [firm.city, firm.state, firm.name],
  );
  return res.rowCount ?? 0;
}

async function main() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log("✅  Connected to Postgres\n");

  for (const firm of FIRMS) {
    try {
      const [frRows, vcRows] = await Promise.all([
        applyFirmRecords(client, firm),
        applyVcFirms(client, firm),
      ]);
      const status = frRows === 0
        ? "⚠️   NOT FOUND in firm_records — firm may not exist in database"
        : `✅  Updated ${frRows} firm_records row(s), ${vcRows} vc_firms row(s)`;
      console.log(`${firm.name} (${firm.location}): ${status}`);
    } catch (err) {
      console.error(`❌  ${firm.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await client.end();
  console.log("\nDone. Refresh the fresh-capital page to see the updated locations.");
}

main().catch((err: unknown) => {
  console.error("FATAL:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
