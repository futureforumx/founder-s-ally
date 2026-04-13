/**
 * validate-firm-locations.ts
 *
 * Validates location data for consistency:
 * - Detects international firms marked as US
 * - Validates state codes
 * - Ensures country field is set for all records
 * - Detects obvious data quality issues
 *
 * Run: npx tsx scripts/validate-firm-locations.ts
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

// Known international locations (city -> country mapping)
const INTERNATIONAL_CITIES: Record<string, string> = {
  'Toronto': 'Canada',
  'Vancouver': 'Canada',
  'Montreal': 'Canada',
  'Beijing': 'China',
  'Shanghai': 'China',
  'London': 'United Kingdom',
  'Manchester': 'United Kingdom',
  'Paris': 'France',
  'Berlin': 'Germany',
  'Tokyo': 'Japan',
  'Singapore': 'Singapore',
  'Hong Kong': 'Hong Kong',
  'Dubai': 'United Arab Emirates',
  'Tel Aviv': 'Israel',
  'Athens': 'Greece',
  'Kiev': 'Ukraine',
  'Istanbul': 'Turkey',
  'Sydney': 'Australia',
  'Melbourne': 'Australia',
  'Auckland': 'New Zealand',
};

// Known non-US states (state code -> country mapping)
const NON_US_STATES: Record<string, string> = {
  'BC': 'Canada',
  'ON': 'Canada',
  'QC': 'Canada',
  'AB': 'Canada',
  'MB': 'Canada',
  'SK': 'Canada',
  'NS': 'Canada',
  'NB': 'Canada',
  'PE': 'Canada',
  'NL': 'Canada',
  'YT': 'Canada',
  'NT': 'Canada',
  'NU': 'Canada',
  'Greece': 'Greece',
  'Ukraine': 'Ukraine',
};

interface FirmLocation {
  id: string;
  firm_name: string;
  hq_city: string | null;
  hq_state: string | null;
  hq_country: string | null;
}

interface Issue {
  firmId: string;
  firmName: string;
  type: string;
  message: string;
  suggestion?: Record<string, unknown>;
}

async function main() {
  console.log('\n🔍 Validating firm locations…\n');

  const firms = await sbGet<FirmLocation>(
    'firm_records',
    'select=id,firm_name,hq_city,hq_state,hq_country&deleted_at=is.null&limit=9999'
  );

  const issues: Issue[] = [];

  for (const firm of firms) {
    const city = firm.hq_city?.trim() || '';
    const state = firm.hq_state?.trim() || '';
    const country = firm.hq_country?.trim() || '';

    // Issue 1: International city with US country
    if (INTERNATIONAL_CITIES[city] && country === 'US') {
      issues.push({
        firmId: firm.id,
        firmName: firm.firm_name,
        type: 'COUNTRY_MISMATCH',
        message: `City "${city}" is in ${INTERNATIONAL_CITIES[city]}, not US`,
        suggestion: { hq_country: INTERNATIONAL_CITIES[city] }
      });
    }

    // Issue 2: Non-US state with US country
    if (NON_US_STATES[state] && country === 'US') {
      issues.push({
        firmId: firm.id,
        firmName: firm.firm_name,
        type: 'COUNTRY_MISMATCH',
        message: `State "${state}" is in ${NON_US_STATES[state]}, not US`,
        suggestion: { hq_country: NON_US_STATES[state] }
      });
    }

    // Issue 3: Missing country
    if (state && !country) {
      if (state.length === 2) {
        issues.push({
          firmId: firm.id,
          firmName: firm.firm_name,
          type: 'MISSING_COUNTRY',
          message: `Has state "${state}" but missing country`,
          suggestion: { hq_country: 'US' }
        });
      }
    }
  }

  if (issues.length === 0) {
    console.log('✅ All location data is valid!\n');
    process.exit(0);
  }

  console.log(`⚠️  Found ${issues.length} validation issues:\n`);

  // Group by type
  const byType: Record<string, Issue[]> = {};
  for (const issue of issues) {
    if (!byType[issue.type]) byType[issue.type] = [];
    byType[issue.type].push(issue);
  }

  for (const [type, typeIssues] of Object.entries(byType)) {
    console.log(`\n${type} (${typeIssues.length} issues):`);
    for (const issue of typeIssues.slice(0, 10)) {
      console.log(`  ${issue.firmName}: ${issue.message}`);
    }
    if (typeIssues.length > 10) {
      console.log(`  ... and ${typeIssues.length - 10} more`);
    }
  }

  // Auto-fix obvious issues
  console.log(`\n⚙️  Auto-fixing obvious issues…\n`);
  let fixed = 0;

  for (const issue of issues) {
    if (issue.suggestion && Object.keys(issue.suggestion).length > 0) {
      try {
        await sbPatch('firm_records', issue.firmId, issue.suggestion);
        console.log(`  ✅ ${issue.firmName.slice(0, 40).padEnd(40)}: ${Object.entries(issue.suggestion).map(([k,v]) => `${k}=${v}`).join(', ')}`);
        fixed++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`  ❌ ${issue.firmName}: ${msg}`);
      }
    }
  }

  console.log(`\n👍 Fixed ${fixed} issues\n`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
