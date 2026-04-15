/**
 * Prints Supabase row counts for Network directory canonical tables.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY or anon key with SELECT access.
 *
 *   npx tsx scripts/print-community-directory-counts.ts
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnv() {
  for (const name of [".env", ".env.local"]) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m) continue;
      if (process.env[m[1]] !== undefined) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}
loadEnv();

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

async function main() {
  if (!url || !key) {
    console.error("Missing SUPABASE_URL (or VITE_SUPABASE_URL) and a Supabase key in env.");
    process.exit(1);
  }
  const sb = createClient(url, key);

  const [{ count: orgs }, { count: ops }, founderRpc] = await Promise.all([
    sb
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .not("description", "is", null)
      .eq("ready_for_live", true),
    sb
      .from("operator_profiles")
      .select("id", { count: "exact", head: true })
      .is("deleted_at", null)
      .eq("is_available", true)
      .eq("ready_for_live", true),
    sb.rpc("community_founders_distinct_count"),
  ]);

  console.log("Canonical directory tables (Supabase public):");
  console.log(`  organizations (ready_for_live, description set): ${orgs ?? "?"}`);
  console.log(`  operator_profiles (live + available):          ${ops ?? "?"}`);
  if (founderRpc.error) {
    console.log(`  founders (distinct via RPC):                     RPC error — apply migration 20260415140000_community_founders_distinct_count.sql`);
    console.log(`    ${founderRpc.error.message}`);
  } else {
    console.log(`  founders (distinct roles → people, RPC):        ${founderRpc.data ?? "?"}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
