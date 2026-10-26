/**
 * Admin enrichment report (aggregates only; no raw provider payloads or contact values).
 *
 *   pnpm alexandria:report [--since-days 30]
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "../lib/loadEnvFiles";

loadEnvFiles([".env", ".env.local"]);

const { values: v } = parseArgs({ options: { "since-days": { type: "string", default: "30" } } });

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(2);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const since = new Date(Date.now() - Number(v["since-days"]) * 86_400_000).toISOString();
  const { data, error } = await db.rpc("alexandria_enrichment_report", { p_since: since });
  if (error) {
    console.error(`report failed: ${error.message} (has migration 20261026120000_alexandria_enrichment.sql been applied?)`);
    process.exit(1);
  }
  console.log(JSON.stringify(data, null, 2));
}

main();
