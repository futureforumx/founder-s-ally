/**
 * Read-only audit: null/empty rates for operator_profiles directory fields.
 *
 *   tsx scripts/audit-operator-profiles-directory.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

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

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function empty(v: unknown): boolean {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  const s = String(v).trim();
  return !s || s === "—";
}

async function main() {
  const { data, error } = await sb
    .from("operator_profiles")
    .select(
      "sector_focus, stage_focus, title, current_company_name, prior_companies, expertise, city, state, country, bio",
    )
    .is("deleted_at", null)
    .eq("is_available", true)
    .eq("ready_for_live", true);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }
  const rows = data ?? [];
  const n = rows.length || 1;
  const c = (pred: (r: any) => boolean) => Math.round((rows.filter(pred).length / n) * 1000) / 10;

  console.log(JSON.stringify({
    live_rows: rows.length,
    pct_empty_sector_focus: c((r) => empty(r.sector_focus)),
    pct_empty_stage_focus: c((r) => empty(r.stage_focus)),
    pct_empty_title: c((r) => empty(r.title)),
    pct_empty_current_company_name: c((r) => empty(r.current_company_name)),
    pct_empty_prior_companies: c((r) => empty(r.prior_companies)),
    pct_empty_expertise: c((r) => empty(r.expertise)),
    pct_empty_city_state_country: c((r) => empty(r.city) && empty(r.state) && empty(r.country)),
    pct_empty_bio: c((r) => empty(r.bio)),
  }, null, 2));
}

main().catch(console.error);
