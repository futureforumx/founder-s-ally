/**
 * audit-missing.ts — Print a breakdown of empty fields in firm_records and firm_investors
 * Usage: npx tsx scripts/audit-missing.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function loadEnv() {
  for (const name of [".env", ".env.local"]) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      if (process.env[m[1]]) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v) process.env[m[1]] = v;
    }
  }
}
loadEnv();

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");

const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function count(table: string, filter: string): Promise<number> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}&limit=0`, {
    headers: { ...H, Prefer: "count=exact" },
    method: "HEAD",
  });
  const cr = res.headers.get("content-range");
  return cr ? parseInt(cr.split("/")[1]) : 0;
}

function bar(n: number, total: number, width = 20): string {
  const pct = total ? n / total : 0;
  const filled = Math.round(pct * width);
  return "[" + "█".repeat(filled) + "░".repeat(width - filled) + "] " + String(Math.round(pct * 100)).padStart(3) + "%";
}

async function main() {
  console.log("\n📊  VEKTA — Missing Data Audit\n");

  // ── firm_records ─────────────────────────────────────────────────────────
  const totalFirms = await count("firm_records", "select=id&deleted_at=is.null");
  console.log(`firm_records  (${totalFirms} active firms)\n`);

  const firmFields: [string, string][] = [
    ["description",        "Description"],
    ["elevator_pitch",     "Elevator pitch"],
    ["firm_type",          "Firm type"],
    ["entity_type",        "Entity type"],
    ["thesis_verticals",   "Thesis verticals"],
    ["stage_focus",        "Stage focus"],
    ["stage_min",          "Stage min"],
    ["stage_max",          "Stage max"],
    ["sector_scope",       "Sector scope"],
    ["thesis_orientation", "Thesis orientation"],
    ["geo_focus",          "Geo focus"],
    ["is_actively_deploying", "Actively deploying"],
    ["website_url",        "Website URL"],
    ["linkedin_url",       "LinkedIn URL"],
    ["x_url",              "X/Twitter URL"],
    ["crunchbase_url",     "Crunchbase URL"],
    ["email",              "Email"],
    ["phone",              "Phone"],
    ["logo_url",           "Logo URL"],
    ["hq_city",            "HQ city"],
    ["hq_state",           "HQ state"],
    ["hq_country",         "HQ country"],
    ["hq_region",          "HQ region"],
    ["aum",                "AUM"],
    ["min_check_size",     "Min check size"],
    ["max_check_size",     "Max check size"],
    ["founded_year",       "Founded year"],
    ["total_headcount",    "Total headcount"],
  ];

  for (const [field, label] of firmFields) {
    const missing = await count("firm_records", `select=id&deleted_at=is.null&${field}=is.null`);
    const filled  = totalFirms - missing;
    const indicator = missing === 0 ? "✅" : missing < totalFirms * 0.1 ? "🟡" : "🔴";
    console.log(`  ${indicator} ${label.padEnd(22)} ${bar(filled, totalFirms)}  ${filled}/${totalFirms} filled  (${missing} missing)`);
  }

  // ── firm_investors ────────────────────────────────────────────────────────
  const totalInv = await count("firm_investors", "select=id&deleted_at=is.null");
  console.log(`\n\nfirm_investors  (${totalInv} active investors)\n`);

  const invFields: [string, string][] = [
    ["avatar_url",          "Headshot"],
    ["first_name",          "First name"],
    ["last_name",           "Last name"],
    ["title",               "Title"],
    ["bio",                 "Bio"],
    ["email",               "Email"],
    ["linkedin_url",        "LinkedIn URL"],
    ["x_url",               "X/Twitter URL"],
    ["city",                "City"],
    ["state",               "State"],
    ["country",             "Country"],
    ["sector_focus",        "Sector focus"],
    ["stage_focus",         "Stage focus"],
    ["personal_thesis_tags","Thesis tags"],
    ["education_summary",   "Education summary"],
    ["background_summary",  "Background summary"],
    ["investment_style",    "Investment style"],
  ];

  for (const [field, label] of invFields) {
    const missing = await count("firm_investors", `select=id&deleted_at=is.null&${field}=is.null`);
    const filled  = totalInv - missing;
    const indicator = missing === 0 ? "✅" : missing < totalInv * 0.1 ? "🟡" : "🔴";
    console.log(`  ${indicator} ${label.padEnd(22)} ${bar(filled, totalInv)}  ${filled}/${totalInv} filled  (${missing} missing)`);
  }

  console.log("\n");
}

main().catch(console.error);
