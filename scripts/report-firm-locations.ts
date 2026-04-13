/**
 * report-firm-locations.ts
 *
 * Generates a summary report of firm location coverage
 *
 * Run: npx tsx scripts/report-firm-locations.ts
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
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
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

async function main() {
  console.log('\n📊 Location Coverage Report\n');
  console.log('=' .repeat(60));

  const firms = await sbGet<{
    id: string;
    hq_city: string | null;
    hq_state: string | null;
    hq_country: string | null;
    hq_region: string | null;
  }>(
    'firm_records',
    'select=id,hq_city,hq_state,hq_country,hq_region&deleted_at=is.null'
  );

  const total = firms.length;
  const withCity = firms.filter(f => f.hq_city).length;
  const withState = firms.filter(f => f.hq_state).length;
  const withCountry = firms.filter(f => f.hq_country).length;
  const withRegion = firms.filter(f => f.hq_region).length;
  const complete = firms.filter(f => f.hq_city && f.hq_state && f.hq_country).length;

  console.log(`Total firms:          ${total}`);
  console.log(`With city:            ${withCity} (${(withCity/total*100).toFixed(1)}%)`);
  console.log(`With state/province:  ${withState} (${(withState/total*100).toFixed(1)}%)`);
  console.log(`With country:         ${withCountry} (${(withCountry/total*100).toFixed(1)}%)`);
  console.log(`With region:          ${withRegion} (${(withRegion/total*100).toFixed(1)}%)`);
  console.log(`\nFully enriched:       ${complete} (${(complete/total*100).toFixed(1)}%)`);

  // Country distribution
  const byCountry: Record<string, number> = {};
  for (const firm of firms.filter(f => f.hq_country)) {
    const country = firm.hq_country!;
    byCountry[country] = (byCountry[country] || 0) + 1;
  }

  console.log('\n' + '=' .repeat(60));
  console.log('Country Distribution:\n');

  const sorted = Object.entries(byCountry).sort((a, b) => b[1] - a[1]);
  for (const [country, count] of sorted.slice(0, 10)) {
    const pct = (count / total * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(count / 5));
    console.log(`  ${country.padEnd(20)} ${count.toString().padStart(4)} (${pct.padStart(5)}%) ${bar}`);
  }

  if (sorted.length > 10) {
    const rest = sorted.slice(10).reduce((sum, [_, c]) => sum + c, 0);
    console.log(`  ${'Other'.padEnd(20)} ${rest.toString().padStart(4)} (${(rest/total*100).toFixed(1).padStart(5)}%)`);
  }

  // Region distribution (US only)
  const byRegion: Record<string, number> = {};
  for (const firm of firms.filter(f => f.hq_country === 'US' && f.hq_region)) {
    const region = firm.hq_region!;
    byRegion[region] = (byRegion[region] || 0) + 1;
  }

  console.log('\n' + '=' .repeat(60));
  console.log('US Regional Distribution:\n');

  const sortedRegions = Object.entries(byRegion).sort((a, b) => b[1] - a[1]);
  for (const [region, count] of sortedRegions) {
    const pct = (count / firms.filter(f => f.hq_country === 'US').length * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(count / 3));
    console.log(`  ${region.padEnd(20)} ${count.toString().padStart(4)} (${pct.padStart(5)}%) ${bar}`);
  }

  console.log('\n' + '=' .repeat(60) + '\n');
  console.log('✅ Location enrichment complete!\n');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
