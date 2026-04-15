/**
 * Mirrors the browser `supabasePublicDirectory` read path (publishable key only, no Clerk JWT).
 * Run after deploy or locally:  npx tsx scripts/verify-public-directory-reads.ts
 *
 * Prints head counts + RPC founder total — same filters as useCommunityGridData / useProfile.
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

const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";

async function main() {
  if (!url || !key) {
    console.error("Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or SUPABASE_*).");
    process.exit(1);
  }

  console.log("Supabase origin:", new URL(url).origin);
  console.log("Client: anon publishable key only (same as supabasePublicDirectory)\n");

  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const [orgCount, opCount, founderRpc, orgRows, roleProbe, opRows] = await Promise.all([
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
    sb
      .from("organizations")
      .select("id")
      .not("description", "is", null)
      .eq("ready_for_live", true)
      .limit(3),
    sb.from("roles").select("id").eq("isCurrent", true).limit(1),
    sb
      .from("operator_profiles")
      .select("id, full_name")
      .is("deleted_at", null)
      .eq("is_available", true)
      .eq("ready_for_live", true)
      .limit(3),
  ]);

  console.log("organizations count (ready_for_live, description set):", orgCount.count, orgCount.error?.message ?? "");
  console.log("  sample ids:", (orgRows.data ?? []).map((r: any) => r.id));
  console.log("operator_profiles count (live filters):            ", opCount.count, opCount.error?.message ?? "");
  console.log("  sample:   ", opRows.data);
  if (founderRpc.error) {
    console.log("community_founders_distinct_count RPC:", founderRpc.error.message);
  } else {
    console.log("founders RPC (distinct people):                     ", founderRpc.data);
  }
  console.log("roles probe (isCurrent, limit 1):                  ", roleProbe.error?.message ?? "ok", roleProbe.data);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
