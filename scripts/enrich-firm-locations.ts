/**
 * enrich-firm-locations.ts
 *
 * Audits firm_records for missing location data and attempts to enrich:
 * - hq_city, hq_state, hq_country, hq_zip_code, hq_region
 *
 * Uses multiple strategies:
 * 1. Extract from existing 'location' or 'headquarters' fields
 * 2. Parse 'hq_city, hq_state, hq_country' text
 * 3. Call NinjaPear API for company profile data (requires API key)
 * 4. Derive hq_region from hq_state
 *
 * Run: npx tsx scripts/enrich-firm-locations.ts
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ── Environment loader ───────────────────────────────────────────────────────
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
const NINJAPEAR_API_KEY = process.env.NINJAPEAR_API_KEY || "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

console.log("🔗 Supabase:", SUPABASE_URL);
if (NINJAPEAR_API_KEY) {
  console.log("🔑 NinjaPear API key loaded");
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
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
  const res = await fetchWithTimeout(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`PATCH ${table} ${id}: ${res.status} ${await res.text()}`);
}

// ── Location enrichment utilities ────────────────────────────────────────────

const US_STATES = {
  'WA': 'West', 'OR': 'West', 'CA': 'West', 'NV': 'West', 'HI': 'West', 'AK': 'West',
  'ID': 'West', 'MT': 'West', 'WY': 'West', 'CO': 'West', 'UT': 'West',
  'NY': 'East', 'NJ': 'East', 'CT': 'East', 'MA': 'East', 'RI': 'East', 'NH': 'East',
  'VT': 'East', 'ME': 'East', 'PA': 'East', 'DE': 'East', 'MD': 'East', 'DC': 'East',
  'TX': 'South', 'OK': 'South', 'AR': 'South', 'LA': 'South', 'MS': 'South',
  'AL': 'South', 'TN': 'South', 'KY': 'South', 'WV': 'South', 'VA': 'South',
  'NC': 'South', 'SC': 'South', 'GA': 'South', 'FL': 'South',
  'OH': 'Midwest', 'MI': 'Midwest', 'IN': 'Midwest', 'IL': 'Midwest', 'WI': 'Midwest',
  'MN': 'Midwest', 'IA': 'Midwest', 'MO': 'Midwest', 'ND': 'Midwest', 'SD': 'Midwest',
  'NE': 'Midwest', 'KS': 'Midwest',
} as const;

function deriveRegionFromState(state: string | null): string | null {
  if (!state || state.length !== 2) return null;
  return (US_STATES[state.toUpperCase() as keyof typeof US_STATES] as string) || null;
}

interface LocationData {
  hq_city?: string | null;
  hq_state?: string | null;
  hq_country?: string | null;
  hq_zip_code?: string | null;
  hq_region?: string | null;
}

function parseLocationText(text: string | null): LocationData {
  if (!text) return {};

  // Try "City, State, Country" or "City, State" or just "City"
  const parts = text.split(',').map(p => p.trim());

  const result: LocationData = {};
  if (parts.length >= 1) result.hq_city = parts[0] || null;
  if (parts.length >= 2) result.hq_state = parts[1] || null;
  if (parts.length >= 3) result.hq_country = parts[2] || null;

  return result;
}

// Try to extract location from website URL or other fields
function extractLocationFromFirm(firm: {
  website_url?: string | null;
  location?: string | null;
  hq_city?: string | null;
  hq_state?: string | null;
  hq_country?: string | null;
  description?: string | null;
}): LocationData {
  const result: LocationData = {};

  // Already has data
  if (firm.hq_city) result.hq_city = firm.hq_city;
  if (firm.hq_state) result.hq_state = firm.hq_state;
  if (firm.hq_country) result.hq_country = firm.hq_country;

  // Try parsing location field
  if (firm.location && !result.hq_city) {
    const parsed = parseLocationText(firm.location);
    Object.assign(result, parsed);
  }

  // Default country to US if we have a state
  if (result.hq_state && !result.hq_country) {
    result.hq_country = 'US';
  }

  return result;
}

// Call NinjaPear API to enrich company details
async function enrichFromNinjaPear(websiteUrl: string | null): Promise<LocationData> {
  if (!websiteUrl || !NINJAPEAR_API_KEY) return {};

  try {
    // Extract domain from URL
    const url = new URL(websiteUrl);
    const domain = url.hostname.replace('www.', '');

    const res = await fetchWithTimeout(`https://api.ninjapear.com/v1/company?website=${encodeURIComponent(domain)}`, {
      headers: { 'Authorization': `Bearer ${NINJAPEAR_API_KEY}` }
    }, 5000);

    if (!res.ok) return {};

    const data = await res.json() as Record<string, unknown>;
    const company = data.company as Record<string, unknown> || {};

    return {
      hq_city: (company.hq_city as string) || null,
      hq_state: (company.hq_state as string) || null,
      hq_country: (company.hq_country as string) || null,
      hq_zip_code: (company.hq_zip as string) || null,
    };
  } catch (e) {
    // Silently fail - NinjaPear enrichment is optional
    return {};
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
interface FirmRecord {
  id: string;
  firm_name: string;
  website_url: string | null;
  location: string | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_country: string | null;
  hq_zip_code: string | null;
  hq_region: string | null;
  description: string | null;
}

async function main() {
  console.log('\n🔍 Auditing firm location data…\n');

  // 1. Fetch all firms with missing location data
  const firms = await sbGet<FirmRecord>(
    'firm_records',
    'select=id,firm_name,website_url,location,hq_city,hq_state,hq_country,hq_zip_code,hq_region,description&deleted_at=is.null&limit=9999'
  );

  console.log(`📊 Total firms: ${firms.length}`);

  const missing = firms.filter(f => !f.hq_city || !f.hq_state || !f.hq_country);
  console.log(`⚠️  Firms with missing location: ${missing.length}`);

  if (missing.length === 0) {
    console.log('\n✅ All firms have location data!\n');
    process.exit(0);
  }

  console.log('\n📝 Enriching missing location data…\n');

  let enriched = 0;
  let failed = 0;

  for (const firm of missing) {
    try {
      // Collect location data from multiple sources
      const fromText = extractLocationFromFirm(firm);
      const fromNinjaPear = await enrichFromNinjaPear(firm.website_url);

      // Merge with preference: NinjaPear > parsed > existing
      const merged: LocationData = {
        hq_city: fromNinjaPear.hq_city || fromText.hq_city,
        hq_state: fromNinjaPear.hq_state || fromText.hq_state,
        hq_country: fromNinjaPear.hq_country || fromText.hq_country,
        hq_zip_code: fromNinjaPear.hq_zip_code || fromText.hq_zip_code,
      };

      // Derive region if we have state
      if (merged.hq_state && !merged.hq_region) {
        merged.hq_region = deriveRegionFromState(merged.hq_state);
      }

      // Only patch if we have new data
      const hasNewData = (merged.hq_city && !firm.hq_city) ||
                         (merged.hq_state && !firm.hq_state) ||
                         (merged.hq_country && !firm.hq_country) ||
                         (merged.hq_zip_code && !firm.hq_zip_code) ||
                         (merged.hq_region && !firm.hq_region);

      if (hasNewData) {
        // Remove null values for cleaner PATCH
        const patch = Object.fromEntries(
          Object.entries(merged).filter(([_, v]) => v !== null && v !== undefined)
        );

        await sbPatch('firm_records', firm.id, patch);

        const added = Object.entries(patch)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ');
        console.log(`  ✅ ${firm.firm_name.slice(0, 40).padEnd(40)}: ${added}`);
        enriched++;
      } else {
        console.log(`  ⊘ ${firm.firm_name.slice(0, 40).padEnd(40)}: no new data found`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`  ❌ ${firm.firm_name}: ${msg}`);
      failed++;
    }
  }

  console.log(`\n🎉 Done — ${enriched} enriched, ${failed} failed\n`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
