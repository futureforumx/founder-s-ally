/**
 * audit-vc-database.ts — Comprehensive data completeness audit for VC firms and investors
 *
 * Queries both Supabase REST tables (firm_records, firm_investors) via SERVICE_ROLE_KEY
 * and optionally Prisma tables (vc_firms, vc_people) via DATABASE_URL.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJ... npx tsx scripts/audit-vc-database.ts
 *   # Or set in .env / .env.local, then:
 *   npx tsx scripts/audit-vc-database.ts
 *   npx tsx scripts/audit-vc-database.ts --json > audit-results/vc-audit-$(date +%Y%m%d).json
 */

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ── env loader ───────────────────────────────────────────────────────────────
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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      if (v) process.env[m[1]] = v;
    }
  }
}
loadEnv();

const SUPABASE_URL = (
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  ""
).replace(/\/$/, "");
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_KEY || "";

const JSON_MODE = process.argv.includes("--json");

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "❌  Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "    Add them to .env.local or pass as environment variables.\n" +
      "    Example:\n" +
      "      SUPABASE_URL=https://zmnlsdohtwztneamvwaq.supabase.co \\\n" +
      "      SUPABASE_SERVICE_ROLE_KEY=eyJ... \\\n" +
      "      npx tsx scripts/audit-vc-database.ts"
  );
  process.exit(1);
}

const H: Record<string, string> = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
};

// ── helpers ──────────────────────────────────────────────────────────────────
async function countRows(table: string, filter = ""): Promise<number> {
  const qs = filter ? `${filter}&limit=0` : "select=id&limit=0";
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    method: "HEAD",
    headers: { ...H, Prefer: "count=exact" },
  });
  if (!res.ok) {
    if (res.status === 404) return -1; // table doesn't exist
    throw new Error(`HEAD ${table} → ${res.status} ${res.statusText}`);
  }
  const cr = res.headers.get("content-range");
  return cr ? parseInt(cr.split("/")[1], 10) : 0;
}

async function countNull(table: string, field: string, baseFilter = ""): Promise<number> {
  const filter = [baseFilter, `${field}=is.null`].filter(Boolean).join("&");
  return countRows(table, `select=id&${filter}`);
}

async function countEmptyArray(table: string, field: string, baseFilter = ""): Promise<number> {
  // Arrays are empty when field=eq.{} OR field=is.null
  const [nullCount, emptyCount] = await Promise.all([
    countRows(table, `select=id&${[baseFilter, `${field}=is.null`].filter(Boolean).join("&")}`),
    countRows(table, `select=id&${[baseFilter, `${field}=eq.{}`].filter(Boolean).join("&")}`),
  ]);
  return nullCount + emptyCount;
}

function bar(filled: number, total: number, width = 20): string {
  const pct = total > 0 ? filled / total : 0;
  const blocks = Math.round(pct * width);
  return "[" + "█".repeat(blocks) + "░".repeat(width - blocks) + "]";
}

function pct(filled: number, total: number): string {
  if (total === 0) return "  n/a";
  return String(Math.round((filled / total) * 100)).padStart(4) + "%";
}

function indicator(filled: number, total: number): string {
  const p = total > 0 ? filled / total : 0;
  if (p >= 0.9) return "✅";
  if (p >= 0.5) return "🟡";
  return "🔴";
}

// ── audit field definition ───────────────────────────────────────────────────
type FieldDef = {
  col: string;
  label: string;
  type?: "array"; // treat {} as missing
};

// ── firm_records fields ──────────────────────────────────────────────────────
const FIRM_FIELDS: FieldDef[] = [
  // Identity
  { col: "description",          label: "Description / About" },
  { col: "elevator_pitch",       label: "Elevator pitch" },
  { col: "tagline",              label: "Tagline" },
  { col: "slug",                 label: "URL slug" },
  { col: "logo_url",             label: "Logo URL" },
  // Classification
  { col: "firm_type",            label: "Firm type" },
  { col: "entity_type",          label: "Entity type" },
  { col: "thesis_verticals",     label: "Thesis verticals", type: "array" },
  { col: "stage_focus",          label: "Stage focus", type: "array" },
  { col: "stage_min",            label: "Stage min" },
  { col: "stage_max",            label: "Stage max" },
  { col: "sector_scope",         label: "Sector scope" },
  { col: "thesis_orientation",   label: "Thesis orientation" },
  { col: "geo_focus",            label: "Geo focus", type: "array" },
  { col: "is_actively_deploying","label": "Actively deploying" },
  // Contact & Links
  { col: "website_url",          label: "Website URL" },
  { col: "email",                label: "Email" },
  { col: "phone",                label: "Phone" },
  { col: "linkedin_url",         label: "LinkedIn URL" },
  { col: "x_url",                label: "X / Twitter URL" },
  { col: "substack_url",         label: "Substack URL" },
  // External DB Links
  { col: "crunchbase_url",       label: "Crunchbase URL" },
  { col: "signal_nfx_url",       label: "Signal NFX URL" },
  { col: "cb_insights_url",      label: "CB Insights URL" },
  { col: "vcsheet_url",          label: "VCSheet URL" },
  { col: "angellist_url",        label: "AngelList URL" },
  { col: "openvc_url",           label: "OpenVC URL" },
  { col: "pitchbook_url",        label: "PitchBook URL" },
  { col: "tracxn_url",           label: "Tracxn URL" },
  // Location
  { col: "hq_city",              label: "HQ city" },
  { col: "hq_state",             label: "HQ state" },
  { col: "hq_country",           label: "HQ country" },
  { col: "hq_region",            label: "HQ region" },
  // Financials
  { col: "aum",                  label: "AUM (text)" },
  { col: "min_check_size",       label: "Min check size" },
  { col: "max_check_size",       label: "Max check size" },
  { col: "founded_year",         label: "Founded year" },
  // Team
  { col: "total_headcount",      label: "Total headcount" },
  { col: "total_investors",      label: "Total investors" },
  { col: "total_partners",       label: "Total partners" },
  { col: "partner_names",        label: "Partner names", type: "array" },
  // Scores & status
  { col: "reputation_score",     label: "Reputation score" },
  { col: "match_score",          label: "Match score" },
  { col: "responsiveness_score", label: "Responsiveness score" },
  { col: "completeness_score",   label: "Completeness score" },
  { col: "enrichment_status",    label: "Enrichment status" },
  { col: "ready_for_live",       label: "Ready for live" },
  { col: "last_enriched_at",     label: "Last enriched at" },
  { col: "source_count",         label: "Source count" },
];

// ── firm_investors fields ────────────────────────────────────────────────────
const INVESTOR_FIELDS: FieldDef[] = [
  // Identity
  { col: "first_name",           label: "First name" },
  { col: "last_name",            label: "Last name" },
  { col: "title",                label: "Title" },
  { col: "bio",                  label: "Bio" },
  { col: "avatar_url",           label: "Headshot / avatar" },
  { col: "slug",                 label: "URL slug" },
  // Contact
  { col: "email",                label: "Email" },
  { col: "phone",                label: "Phone" },
  { col: "linkedin_url",         label: "LinkedIn URL" },
  { col: "x_url",                label: "X / Twitter URL" },
  // Location
  { col: "city",                 label: "City" },
  { col: "state",                label: "State" },
  { col: "country",              label: "Country" },
  // Investment profile
  { col: "sector_focus",         label: "Sector focus", type: "array" },
  { col: "stage_focus",          label: "Stage focus", type: "array" },
  { col: "personal_thesis_tags", label: "Thesis tags", type: "array" },
  { col: "investment_style",     label: "Investment style" },
  // Background
  { col: "education_summary",    label: "Education summary" },
  { col: "background_summary",   label: "Background summary" },
  // Activity
  { col: "is_actively_investing","label": "Actively investing" },
  { col: "last_active_date",     label: "Last active date" },
  { col: "recent_deal_count",    label: "Recent deal count" },
  // Scores
  { col: "match_score",          label: "Match score" },
  { col: "reputation_score",     label: "Reputation score" },
  { col: "responsiveness_score", label: "Responsiveness score" },
  { col: "completeness_score",   label: "Completeness score" },
  { col: "enrichment_status",    label: "Enrichment status" },
  { col: "ready_for_live",       label: "Ready for live" },
  { col: "last_enriched_at",     label: "Last enriched at" },
  { col: "source_count",         label: "Source count" },
];

// ── audit one table ──────────────────────────────────────────────────────────
type FieldResult = {
  col: string;
  label: string;
  filled: number;
  missing: number;
  total: number;
  pct_filled: number;
};

type TableResult = {
  table: string;
  total: number;
  fields: FieldResult[];
  ready_for_live?: number;
  enrichment_breakdown?: Record<string, number>;
};

async function auditTable(
  table: string,
  fields: FieldDef[],
  baseFilter: string
): Promise<TableResult | null> {
  const total = await countRows(table, `select=id&${baseFilter}`);
  if (total === -1) return null; // table not found

  const results: FieldResult[] = [];
  for (const { col, label, type } of fields) {
    let missing: number;
    try {
      missing =
        type === "array"
          ? await countEmptyArray(table, col, baseFilter)
          : await countNull(table, col, baseFilter);
    } catch {
      missing = -1;
    }
    const filled = missing === -1 ? -1 : total - missing;
    results.push({
      col,
      label,
      filled,
      missing: missing === -1 ? -1 : missing,
      total,
      pct_filled: filled === -1 ? -1 : total > 0 ? (filled / total) * 100 : 0,
    });
  }

  // ready_for_live count (boolean true)
  let ready: number | undefined;
  try {
    ready = await countRows(table, `select=id&${baseFilter}&ready_for_live=eq.true`);
  } catch { /* column may not exist */ }

  // enrichment_status breakdown
  let enrichBreakdown: Record<string, number> | undefined;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=enrichment_status&${baseFilter}&limit=0`,
      { method: "HEAD", headers: { ...H, Prefer: "count=exact" } }
    );
    if (res.ok) {
      // fetch actual breakdown via small query
      const data = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/audit_enrichment_${table}`,
        { method: "POST", headers: { ...H, "Content-Type": "application/json" }, body: "{}" }
      );
      if (!data.ok) throw new Error("rpc not available");
      enrichBreakdown = await data.json();
    }
  } catch { /* rpc not available — skip */ }

  return { table, total, fields: results, ready_for_live: ready, enrichment_breakdown: enrichBreakdown };
}

// ── print table result ───────────────────────────────────────────────────────
function printTableResult(r: TableResult) {
  const { table, total, fields, ready_for_live } = r;
  const readyPct = ready_for_live != null && total > 0
    ? Math.round((ready_for_live / total) * 100)
    : null;

  console.log(`\n${"═".repeat(72)}`);
  console.log(`  TABLE: ${table.toUpperCase()}   (${total.toLocaleString()} active records)`);
  if (readyPct != null)
    console.log(`  Ready-for-live: ${ready_for_live?.toLocaleString()} / ${total.toLocaleString()} (${readyPct}%)`);
  console.log(`${"─".repeat(72)}`);
  console.log(
    `  ${"Indicator".padEnd(4)} ${"Field".padEnd(28)} ${"Bar".padEnd(22)} ${"Filled".padStart(8)}  ${"Missing".padStart(8)}  ${"% Fill".padStart(6)}`
  );
  console.log(`  ${"─".repeat(68)}`);

  for (const f of fields) {
    if (f.filled === -1) {
      console.log(`  ⚠️  ${f.label.padEnd(28)} (column not found)`);
      continue;
    }
    const ind = indicator(f.filled, f.total);
    const b = bar(f.filled, f.total);
    console.log(
      `  ${ind}  ${f.label.padEnd(28)} ${b}  ${String(f.filled).padStart(8)}  ${String(f.missing).padStart(8)}  ${pct(f.filled, f.total)}`
    );
  }
}

// ── summary stats ────────────────────────────────────────────────────────────
function printSummary(results: TableResult[]) {
  console.log(`\n${"═".repeat(72)}`);
  console.log("  SUMMARY");
  console.log(`${"─".repeat(72)}`);

  for (const r of results) {
    const avg =
      r.fields
        .filter((f) => f.pct_filled >= 0)
        .reduce((acc, f) => acc + f.pct_filled, 0) /
      r.fields.filter((f) => f.pct_filled >= 0).length;

    const criticalMissing = r.fields.filter(
      (f) => f.pct_filled >= 0 && f.pct_filled < 20
    );

    console.log(`\n  ${r.table}  (${r.total.toLocaleString()} rows)`);
    console.log(`    Avg field completeness: ${avg.toFixed(1)}%`);
    if (r.ready_for_live != null)
      console.log(
        `    Ready for live: ${r.ready_for_live.toLocaleString()} / ${r.total.toLocaleString()} (${Math.round((r.ready_for_live / r.total) * 100)}%)`
      );
    if (criticalMissing.length > 0) {
      console.log(`    🔴 Critical gaps (<20% filled):`);
      for (const f of criticalMissing) {
        console.log(`       • ${f.label}: ${f.pct_filled.toFixed(1)}% (${f.missing} missing)`);
      }
    }
  }
  console.log();
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const BASE_FIRM = "deleted_at=is.null";
  const BASE_INV = "deleted_at=is.null";

  if (!JSON_MODE) {
    console.log("\n📊  VC DATABASE AUDIT");
    console.log(`    Project: ${SUPABASE_URL}`);
    console.log(`    Date:    ${new Date().toISOString()}`);
  }

  const [firmResult, investorResult] = await Promise.all([
    auditTable("firm_records", FIRM_FIELDS, BASE_FIRM),
    auditTable("firm_investors", INVESTOR_FIELDS, BASE_INV),
  ]);

  const results: TableResult[] = [];
  if (firmResult) results.push(firmResult);
  if (investorResult) results.push(investorResult);

  if (results.length === 0) {
    console.error("❌ No tables found. Check SUPABASE_URL and SERVICE_KEY.");
    process.exit(1);
  }

  if (JSON_MODE) {
    const out = {
      generated_at: new Date().toISOString(),
      project_url: SUPABASE_URL,
      tables: results.map((r) => ({
        table: r.table,
        total: r.total,
        ready_for_live: r.ready_for_live,
        fields: r.fields.map((f) => ({
          col: f.col,
          label: f.label,
          filled: f.filled,
          missing: f.missing,
          total: f.total,
          pct_filled: Math.round(f.pct_filled * 10) / 10,
        })),
      })),
    };
    console.log(JSON.stringify(out, null, 2));
    // Also save to audit-results/
    mkdirSync(join(process.cwd(), "scripts/audit-results"), { recursive: true });
    const fname = `vc-audit-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.json`;
    writeFileSync(join(process.cwd(), "scripts/audit-results", fname), JSON.stringify(out, null, 2));
    console.error(`\n✅ Saved to scripts/audit-results/${fname}`);
    return;
  }

  for (const r of results) printTableResult(r);
  printSummary(results);
}

main().catch((err) => {
  console.error("❌", err.message);
  process.exit(1);
});
