/**
 * sync-signal-nfx-supabase.ts
 *
 * Applies Signal NFX featured investor data to firm_records + firm_investors.
 * Signal NFX is treated as a TRUSTED source — it overrides existing CSV-sourced
 * values for avatar_url, firm website, and investor profile URLs.
 *
 * Data source: data/imports/signal-nfx-featured.json (cached from previous fetch)
 * To refresh the cache first:  SIGNAL_NFX_FETCH_ONLY=1 npx tsx scripts/seed_signal_nfx.ts
 *
 * Usage:
 *   npx tsx scripts/sync-signal-nfx-supabase.ts
 *   DRY_RUN=1 npx tsx scripts/sync-signal-nfx-supabase.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ── Env ──────────────────────────────────────────────────────────────────────
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

const DRY_RUN = process.env.DRY_RUN === "1";
const SB = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

// ── Supabase helpers ──────────────────────────────────────────────────────────
async function sbGet<T>(table: string, select = "*", extra = ""): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}&limit=10000${extra}`, { headers: SB });
  if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbPatch(table: string, id: string, patch: Record<string, any>): Promise<boolean> {
  if (DRY_RUN) { console.log(`  [DRY] PATCH ${table}.${id}:`, Object.keys(patch).join(", ")); return true; }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH", headers: { ...SB, Prefer: "return=minimal" }, body: JSON.stringify(patch),
  });
  if (!res.ok) console.warn(`  ✗ PATCH ${table}.${id}: ${res.status} ${await res.text().catch(() => "")}`);
  return res.ok;
}

// ── Name normalisation ────────────────────────────────────────────────────────
function norm(s: string): string {
  return (s || "").toLowerCase()
    .replace(/\bventures?\b|\bcapital\b|\bpartners?\b|\bmanagement\b|\bfund\b|\bllc\b|\binc\b/g, "")
    .replace(/[^a-z0-9]/g, "").trim();
}

// ── Load cached Signal NFX data ───────────────────────────────────────────────
type FeaturedRow = {
  nfx_investor_profile_id: string;
  person_slug: string;
  person_name: string;
  first_name: string;
  last_name: string;
  firm_name: string;
  firm_slug: string;
  investor_profile_url: string;
  firm_profile_url: string;
  avatar_url: string | null;
};

function loadFeatured(): FeaturedRow[] {
  const paths = [
    join(process.cwd(), "data", "imports", "signal-nfx-featured.json"),
    join(process.cwd(), "signal-nfx-featured.json"),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      const d = JSON.parse(readFileSync(p, "utf8"));
      return d.featured ?? [];
    }
  }
  throw new Error("signal-nfx-featured.json not found. Run: SIGNAL_NFX_FETCH_ONLY=1 npx tsx scripts/seed_signal_nfx.ts");
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  Signal NFX → Supabase Sync  ${DRY_RUN ? "(DRY RUN)" : ""}`);
  console.log(`${"═".repeat(64)}\n`);
  console.log("  ⚡ Signal NFX is a TRUSTED source — overrides CSV-sourced values\n");

  const featured = loadFeatured();
  console.log(`  Loaded ${featured.length} featured profiles from cache\n`);

  // Load DB state
  type FirmRow = Record<string, any>;
  type InvRow  = Record<string, any>;
  const dbFirms  = await sbGet<FirmRow>("firm_records",  "*", "&deleted_at=is.null");
  const dbInvs   = await sbGet<InvRow>("firm_investors", "*", "&deleted_at=is.null");

  const firmByNorm = new Map<string, FirmRow>();
  for (const f of dbFirms) {
    const n = norm(f.firm_name || "");
    if (n) firmByNorm.set(n, f);
  }

  // Investor lookup: normalised full name → investor
  const invByName = new Map<string, InvRow>();
  for (const inv of dbInvs) {
    const full = `${inv.first_name || ""} ${inv.last_name || ""}`.trim() || inv.full_name || "";
    const n = norm(full);
    if (n) invByName.set(n, inv);
  }

  let firmPatched = 0, invPatched = 0;

  for (const row of featured) {
    const firmNorm = norm(row.firm_name);
    const invNorm  = norm(row.person_name);

    // ── Patch firm ──────────────────────────────────────────────────────────
    const firm = firmByNorm.get(firmNorm);
    if (firm) {
      const firmPatch: Record<string, any> = {};
      // Signal NFX firm profile URL — always set/override (trusted)
      if (firm.signal_nfx_url !== row.firm_profile_url) firmPatch.signal_nfx_url = row.firm_profile_url;
      if (Object.keys(firmPatch).length) {
        const ok = await sbPatch("firm_records", firm.id, firmPatch);
        if (ok) { firmPatched++; console.log(`  ✓ firm: ${row.firm_name} — ${Object.keys(firmPatch).join(", ")}`); }
      }
    } else {
      console.log(`  ⚠ firm not found in DB: ${row.firm_name}`);
    }

    // ── Patch investor ──────────────────────────────────────────────────────
    const inv = invByName.get(invNorm);
    if (inv) {
      const invPatch: Record<string, any> = {};
      // avatar_url: Signal NFX overrides (trusted source)
      if (row.avatar_url && inv.avatar_url !== row.avatar_url)
        invPatch.avatar_url = row.avatar_url;
      // Signal NFX profile URL — always set/override
      if (inv.signal_nfx_url !== row.investor_profile_url)
        invPatch.signal_nfx_url = row.investor_profile_url;
      if (Object.keys(invPatch).length) {
        const ok = await sbPatch("firm_investors", inv.id, invPatch);
        if (ok) { invPatched++; console.log(`  ✓ investor: ${row.person_name} @ ${row.firm_name} — ${Object.keys(invPatch).join(", ")}`); }
      } else {
        console.log(`  — investor: ${row.person_name} @ ${row.firm_name} (already up to date)`);
      }
    } else {
      console.log(`  ⚠ investor not found in DB: ${row.person_name} @ ${row.firm_name}`);
    }
  }

  console.log(`\n${"═".repeat(64)}`);
  console.log(`  Firms patched:     ${firmPatched}`);
  console.log(`  Investors patched: ${invPatched}`);
  console.log(`${"═".repeat(64)}\n`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
