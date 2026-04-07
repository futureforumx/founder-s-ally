/**
 * enrich-mdm-avatars.ts
 *
 * Enriches public/data/vc_mdm_output.json with avatar URLs from the firm_investors table.
 * The MDM JSON is generated externally and doesn't include avatar_url/profile_image_url.
 * This script patches them in from the live Supabase data.
 *
 * Usage:
 *   tsx scripts/enrich-mdm-avatars.ts
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Env loading
// ---------------------------------------------------------------------------

function loadEnv(): void {
  const root = process.cwd();
  for (const name of [".env", ".env.local"]) {
    const p = join(root, name);
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

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

async function main() {
  const jsonPath = join(process.cwd(), "public", "data", "vc_mdm_output.json");
  if (!existsSync(jsonPath)) {
    throw new Error(`MDM JSON not found at ${jsonPath}`);
  }

  const raw = JSON.parse(readFileSync(jsonPath, "utf8"));
  const people: any[] = raw.people || [];

  if (!people.length) {
    console.log("No people in MDM JSON. Nothing to enrich.");
    return;
  }

  console.log(`MDM JSON has ${people.length} people entries.`);

  // Load all firm_investors with avatar_url (paginated — Supabase caps at 1000)
  const investors: any[] = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await supabase
      .from("firm_investors")
      .select("id, full_name, firm_id, avatar_url")
      .not("avatar_url", "is", null)
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`Failed to load firm_investors: ${error.message}`);
    if (!data?.length) break;
    investors.push(...data);
    offset += PAGE;
    if (data.length < PAGE) break;
  }
  console.log(`Loaded ${investors.length} investors with avatars from firm_investors.`);

  // Also load firm name mapping (investor_database.id → firm_name)
  const { data: firms, error: firmErr } = await supabase
    .from("investor_database")
    .select("id, firm_name, website_url");
  if (firmErr) console.warn("Could not load investor_database:", firmErr.message);

  // Build firm UUID → domain/slug mapping
  const firmIdToDomain = new Map<string, string>();
  const domainToFirmId = new Map<string, string>();
  for (const f of firms ?? []) {
    if (f.website_url) {
      try {
        const domain = new URL(f.website_url.startsWith("http") ? f.website_url : `https://${f.website_url}`).hostname.replace(/^www\./, "");
        firmIdToDomain.set(f.id, domain);
        domainToFirmId.set(domain, f.id);
      } catch {}
    }
  }

  // Build lookup: normalized name → avatar_url (prefer unique matches)
  const byName = new Map<string, string>();
  const byNameAndDomain = new Map<string, string>();
  for (const inv of investors ?? []) {
    if (!inv.avatar_url || !inv.full_name) continue;
    const nameKey = inv.full_name.toLowerCase().trim();
    byName.set(nameKey, inv.avatar_url);
    // Also build name+domain key
    const domain = firmIdToDomain.get(inv.firm_id);
    if (domain) {
      byNameAndDomain.set(`${nameKey}::${domain}`, inv.avatar_url);
    }
  }

  let enriched = 0;
  for (const p of people) {
    if (p.profile_image_url || p.avatar_url) continue;

    const nameKey = p.full_name?.toLowerCase().trim();
    if (!nameKey) continue;

    // Try exact match by name + firm domain
    let avatar = byNameAndDomain.get(`${nameKey}::${p.firm_id}`);

    // Fall back to name-only match
    if (!avatar) {
      avatar = byName.get(nameKey);
    }

    if (avatar) {
      p.profile_image_url = avatar;
      p.avatar_url = avatar;
      enriched++;
    }
  }

  writeFileSync(jsonPath, JSON.stringify(raw, null, 2), "utf8");
  console.log(`\nEnriched ${enriched} / ${people.length} people with avatar URLs.`);
  console.log(`Updated ${jsonPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
