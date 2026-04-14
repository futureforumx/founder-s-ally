/**
 * normalize-firm-countries.ts
 *
 * Normalizes country names for consistency:
 * - "US", "USA", "United States" → "US"
 * - "UK", "United Kingdom" → "United Kingdom"
 * - etc.
 *
 * Run: npx tsx scripts/normalize-firm-countries.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { augmentFirmRecordsPatchWithFetch } from "./lib/firmRecordsCanonicalHqPolicy";

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
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};

function fetchWithTimeout(url: string, opts: RequestInit, ms = 12000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...opts, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function sbGet<T>(table: string, query: string): Promise<T[]> {
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbPatch(table: string, id: string, patch: Record<string, unknown>): Promise<void> {
  let body: Record<string, unknown> = patch;
  if (table === "firm_records") {
    body = (await augmentFirmRecordsPatchWithFetch(SUPABASE_URL, HEADERS, id, patch, "normalize_firm_countries")) as Record<
      string,
      unknown
    >;
  }
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: HEADERS,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH ${table} ${id}: ${res.status} ${await res.text()}`);
}

// Normalization mapping
const COUNTRY_NORMALIZATION: Record<string, string> = {
  'USA': 'US',
  'United States': 'US',
  'United States of America': 'US',
  'America': 'US',
  'UK': 'United Kingdom',
  'England': 'United Kingdom',
  'Scotland': 'United Kingdom',
};

function normalizeCountry(country: string | null): string | null {
  if (!country) return null;
  const trimmed = country.trim();
  return COUNTRY_NORMALIZATION[trimmed] || trimmed;
}

async function main() {
  console.log('\n🔄 Normalizing country names…\n');

  const firms = await sbGet<{ id: string; firm_name: string; hq_country: string | null }>(
    'firm_records',
    'select=id,firm_name,hq_country&deleted_at=is.null&limit=9999'
  );

  const toNormalize = firms.filter(f => f.hq_country && COUNTRY_NORMALIZATION[f.hq_country]);

  console.log(`Found ${toNormalize.length} firms with non-normalized country names\n`);

  let updated = 0;

  for (const firm of toNormalize) {
    const normalized = normalizeCountry(firm.hq_country);
    try {
      await sbPatch('firm_records', firm.id, { hq_country: normalized });
      console.log(`  ✅ ${firm.firm_name.slice(0, 40).padEnd(40)}: "${firm.hq_country}" → "${normalized}"`);
      updated++;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ❌ ${firm.firm_name}: ${msg}`);
    }
  }

  console.log(`\n✅ Normalized ${updated} country names\n`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
