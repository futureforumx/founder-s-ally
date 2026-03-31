/**
 * enrich-investor-profiles.ts
 *
 * Enriches firm_records records using Apollo, Hunter, Clay, Explorium, and HubSpot.
 *
 * Provider responsibilities:
 *   Apollo     — firm description, linkedin_url, x_url, headcount, founded_year, location
 *   Hunter     — partner email discovery via domain search
 *   Clay       — comprehensive company data (thesis, AUM, key contacts)
 *   Explorium  — supplementary company firmographics
 *   HubSpot    — check whether firm/person already exists in CRM; pull any known contacts
 *
 * Usage:
 *   tsx scripts/enrich-investor-profiles.ts
 *   ENRICH_MAX=25 ENRICH_PROVIDERS=apollo,hunter tsx scripts/enrich-investor-profiles.ts
 *   ENRICH_STALE_DAYS=14 tsx scripts/enrich-investor-profiles.ts
 *
 * Env vars (sourced from .env / .env.local):
 *   APOLLO_API_KEY
 *   HUNTER_API_KEY
 *   CLAY_API_KEY
 *   EXPLORIUM_API_KEY
 *   HUBSPOT_ACCESS_TOKEN
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// Env loading
// ---------------------------------------------------------------------------

function loadEnv(): void {
  const root = process.cwd();
  for (const name of [".env", ".env.local", ".env.enrichment"]) {
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
const MAX = Math.max(1, parseInt(process.env.ENRICH_MAX || "100", 10));
const DELAY_MS = Math.max(0, parseInt(process.env.ENRICH_DELAY_MS || "600", 10));
const STALE_DAYS = Math.max(1, parseInt(process.env.ENRICH_STALE_DAYS || "30", 10));
const PROVIDERS = new Set(
  (process.env.ENRICH_PROVIDERS || "apollo,hunter,clay,explorium,hubspot")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean)
);

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not set.");
if (!SUPABASE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type FirmRow = {
  id: string;
  firm_name: string;
  website_url: string | null;
  email: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  description: string | null;
  founded_year: number | null;
  total_headcount: number | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_country: string | null;
  crunchbase_url: string | null;
  angellist_url: string | null;
  aum: string | null;
  last_enriched_at: string | null;
};

type PartnerRow = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  firm_id: string;
};

type EnrichPatch = Partial<{
  description: string;
  linkedin_url: string;
  x_url: string;
  crunchbase_url: string;
  founded_year: number;
  total_headcount: number;
  hq_city: string;
  hq_state: string;
  hq_country: string;
  aum: string;
  email: string;
  last_enriched_at: string;
  enrichment_sources: string[];
}>;

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

async function sleep(ms: number) {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

function domainFromUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const u = raw.trim();
  try {
    const url = new URL(u.startsWith("http") ? u : `https://${u}`);
    const host = url.hostname.replace(/^www\./i, "");
    if (!host || !host.includes(".")) return null;
    const blocked = new Set([
      "linkedin.com", "twitter.com", "x.com", "facebook.com",
      "instagram.com", "youtube.com", "linktr.ee", "notion.site",
      "crunchbase.com", "angel.co",
    ]);
    if (blocked.has(host) || host.endsWith(".linkedin.com")) return null;
    return host;
  } catch {
    return null;
  }
}

async function jsonFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T | null> {
  try {
    const res = await fetch(url, options);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Provider: Apollo (organization enrichment)
// Docs: https://apolloio.github.io/apollo-api-docs/?shell#organization-enrichment
// ---------------------------------------------------------------------------

type ApolloOrgData = {
  organization?: {
    name?: string;
    short_description?: string;
    linkedin_url?: string;
    twitter_url?: string;
    crunchbase_url?: string;
    primary_domain?: string;
    founded_year?: number;
    estimated_num_employees?: number;
    city?: string;
    state?: string;
    country?: string;
    annual_revenue_printed?: string;
  };
};

async function enrichWithApollo(
  firm: FirmRow,
  apiKey: string
): Promise<EnrichPatch> {
  const domain = domainFromUrl(firm.website_url);
  if (!domain) return {};

  const data = await jsonFetch<ApolloOrgData>(
    "https://api.apollo.io/api/v1/organizations/enrich",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({ domain }),
    }
  );

  const org = data?.organization;
  if (!org) return {};

  const patch: EnrichPatch = {};
  if (!firm.description && org.short_description) patch.description = org.short_description;
  if (!firm.linkedin_url && org.linkedin_url) patch.linkedin_url = org.linkedin_url;
  if (!firm.x_url && org.twitter_url) patch.x_url = org.twitter_url;
  if (!firm.crunchbase_url && org.crunchbase_url) patch.crunchbase_url = org.crunchbase_url;
  if (!firm.founded_year && org.founded_year) patch.founded_year = org.founded_year;
  if (!firm.total_headcount && org.estimated_num_employees)
    patch.total_headcount = org.estimated_num_employees;
  if (!firm.hq_city && org.city) patch.hq_city = org.city;
  if (!firm.hq_state && org.state) patch.hq_state = org.state;
  if (!firm.hq_country && org.country) patch.hq_country = org.country;
  if (!firm.aum && org.annual_revenue_printed) patch.aum = org.annual_revenue_printed;

  return patch;
}

// ---------------------------------------------------------------------------
// Provider: Hunter (domain search → partner emails)
// Docs: https://hunter.io/api-documentation/v2#domain-search
// ---------------------------------------------------------------------------

type HunterResult = {
  data?: {
    emails?: Array<{
      value?: string;
      confidence?: number;
      first_name?: string;
      last_name?: string;
    }>;
  };
};

async function enrichPartnersWithHunter(
  domain: string,
  partners: PartnerRow[],
  apiKey: string
): Promise<Map<string, string>> {
  const url = new URL("https://api.hunter.io/v2/domain-search");
  url.searchParams.set("domain", domain);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("limit", "20");

  const result = await jsonFetch<HunterResult>(url.toString());
  const emails = result?.data?.emails ?? [];
  const emailMap = new Map<string, string>(); // partner supabase id → email

  for (const partner of partners) {
    if (partner.email) continue; // already have email
    const first = (partner.first_name || "").toLowerCase();
    const last = (partner.last_name || "").toLowerCase();

    const scored = emails
      .filter((e) => e.value?.includes("@"))
      .map((e) => {
        let score = (e.confidence ?? 0) / 100;
        if (first && e.first_name?.toLowerCase() === first) score += 0.25;
        if (last && e.last_name?.toLowerCase() === last) score += 0.25;
        return { email: e.value!, score };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (best && best.score >= 0.5) {
      emailMap.set(partner.id, best.email);
    }
  }

  return emailMap;
}

// ---------------------------------------------------------------------------
// Provider: Clay (company enrichment)
// Docs: https://docs.clay.com/reference/api-overview
// ---------------------------------------------------------------------------

type ClayEnrichResult = {
  data?: {
    description?: string;
    linkedin_url?: string;
    twitter_handle?: string;
    founded_year?: number;
    employee_count?: number;
    city?: string;
    state?: string;
    country?: string;
    funding?: { total?: string };
  };
};

async function enrichWithClay(
  firm: FirmRow,
  apiKey: string
): Promise<EnrichPatch> {
  const domain = domainFromUrl(firm.website_url);
  if (!domain) return {};

  // Clay enrichment API endpoint
  const data = await jsonFetch<ClayEnrichResult>(
    "https://api.clay.com/v1/sources/company-enrichment",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ domain }),
    }
  );

  const d = data?.data;
  if (!d) return {};

  const patch: EnrichPatch = {};
  if (!firm.description && d.description) patch.description = d.description;
  if (!firm.linkedin_url && d.linkedin_url) patch.linkedin_url = d.linkedin_url;
  if (!firm.x_url && d.twitter_handle)
    patch.x_url = `https://x.com/${d.twitter_handle.replace("@", "")}`;
  if (!firm.founded_year && d.founded_year) patch.founded_year = d.founded_year;
  if (!firm.total_headcount && d.employee_count) patch.total_headcount = d.employee_count;
  if (!firm.hq_city && d.city) patch.hq_city = d.city;
  if (!firm.hq_state && d.state) patch.hq_state = d.state;
  if (!firm.hq_country && d.country) patch.hq_country = d.country;
  if (!firm.aum && d.funding?.total) patch.aum = d.funding.total;

  return patch;
}

// ---------------------------------------------------------------------------
// Provider: Explorium (business enrichment)
// Docs: https://developers.explorium.ai/reference
// ---------------------------------------------------------------------------

type ExploriumResult = {
  data?: {
    short_description?: string;
    linkedin_url?: string;
    twitter_url?: string;
    founded_year?: number;
    number_of_employees?: number;
    headquarters_city?: string;
    headquarters_state?: string;
    headquarters_country?: string;
  };
};

async function enrichWithExplorium(
  firm: FirmRow,
  apiKey: string
): Promise<EnrichPatch> {
  const domain = domainFromUrl(firm.website_url);
  if (!domain) return {};

  const data = await jsonFetch<ExploriumResult>(
    "https://api.explorium.ai/v1/businesses/enrich",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        identifiers: [{ type: "domain", value: domain }],
        features: ["short_description", "linkedin_url", "twitter_url",
          "founded_year", "number_of_employees", "headquarters_city",
          "headquarters_state", "headquarters_country"],
      }),
    }
  );

  const d = data?.data;
  if (!d) return {};

  const patch: EnrichPatch = {};
  if (!firm.description && d.short_description) patch.description = d.short_description;
  if (!firm.linkedin_url && d.linkedin_url) patch.linkedin_url = d.linkedin_url;
  if (!firm.x_url && d.twitter_url) patch.x_url = d.twitter_url;
  if (!firm.founded_year && d.founded_year) patch.founded_year = d.founded_year;
  if (!firm.total_headcount && d.number_of_employees)
    patch.total_headcount = d.number_of_employees;
  if (!firm.hq_city && d.headquarters_city) patch.hq_city = d.headquarters_city;
  if (!firm.hq_state && d.headquarters_state) patch.hq_state = d.headquarters_state;
  if (!firm.hq_country && d.headquarters_country) patch.hq_country = d.headquarters_country;

  return patch;
}

// ---------------------------------------------------------------------------
// Provider: HubSpot (pull existing company/contact data from CRM)
// Docs: https://developers.hubspot.com/docs/api/crm/companies
// ---------------------------------------------------------------------------

type HubSpotSearchResult = {
  results?: Array<{
    id: string;
    properties: {
      name?: string;
      description?: string;
      linkedin_company_page?: string;
      twitterhandle?: string;
      founded_year?: string;
      numberofemployees?: string;
      city?: string;
      state?: string;
      country?: string;
      domain?: string;
    };
  }>;
};

async function enrichWithHubSpot(
  firm: FirmRow,
  accessToken: string
): Promise<EnrichPatch> {
  const domain = domainFromUrl(firm.website_url);
  if (!domain) return {};

  const data = await jsonFetch<HubSpotSearchResult>(
    "https://api.hubapi.com/crm/v3/objects/companies/search",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        filterGroups: [
          {
            filters: [
              {
                propertyName: "domain",
                operator: "EQ",
                value: domain,
              },
            ],
          },
        ],
        properties: [
          "name", "description", "linkedin_company_page", "twitterhandle",
          "founded_year", "numberofemployees", "city", "state", "country",
        ],
        limit: 1,
      }),
    }
  );

  const company = data?.results?.[0]?.properties;
  if (!company) return {};

  const patch: EnrichPatch = {};
  if (!firm.description && company.description) patch.description = company.description;
  if (!firm.linkedin_url && company.linkedin_company_page)
    patch.linkedin_url = company.linkedin_company_page;
  if (!firm.x_url && company.twitterhandle)
    patch.x_url = `https://x.com/${company.twitterhandle}`;
  if (!firm.founded_year && company.founded_year)
    patch.founded_year = parseInt(company.founded_year, 10);
  if (!firm.total_headcount && company.numberofemployees)
    patch.total_headcount = parseInt(company.numberofemployees, 10);
  if (!firm.hq_city && company.city) patch.hq_city = company.city;
  if (!firm.hq_state && company.state) patch.hq_state = company.state;
  if (!firm.hq_country && company.country) patch.hq_country = company.country;

  return patch;
}

// ---------------------------------------------------------------------------
// Merge patches from all providers (first non-null value wins per field)
// ---------------------------------------------------------------------------

function mergePatches(
  base: EnrichPatch,
  ...patches: EnrichPatch[]
): EnrichPatch {
  const merged: EnrichPatch = { ...base };
  for (const patch of patches) {
    for (const [key, val] of Object.entries(patch)) {
      const k = key as keyof EnrichPatch;
      if (merged[k] == null && val != null) {
        (merged as Record<string, unknown>)[k] = val;
      }
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Main enrichment loop
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n── Enriching firm_records (max: ${MAX}, stale: ${STALE_DAYS}d) ──`);
  console.log(`   Providers: ${[...PROVIDERS].join(", ")}`);

  const staleDate = new Date(Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: firms, error: loadErr } = await supabase
    .from("firm_records")
    .select(
      "id, firm_name, website_url, email, linkedin_url, x_url, description, " +
      "founded_year, total_headcount, hq_city, hq_state, hq_country, " +
      "crunchbase_url, angellist_url, aum, last_enriched_at"
    )
    .or(`last_enriched_at.is.null,last_enriched_at.lt.${staleDate}`)
    .not("website_url", "is", null)
    .limit(MAX)
    .order("last_enriched_at", { ascending: true, nullsFirst: true });

  if (loadErr) throw new Error(`Failed to query firms: ${loadErr.message}`);
  if (!firms?.length) {
    console.log("  No stale firms found. All up to date!");
    return;
  }

  console.log(`  ${firms.length} firms need enrichment\n`);

  const apolloKey = process.env.APOLLO_API_KEY?.trim() || "";
  const hunterKey = process.env.HUNTER_API_KEY?.trim() || "";
  const clayKey = process.env.CLAY_API_KEY?.trim() || "";
  const exploriumKey = process.env.EXPLORIUM_API_KEY?.trim() || "";
  const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN?.trim() || "";

  let enriched = 0;
  let skipped = 0;
  let errors = 0;

  for (const firm of firms) {
    const domain = domainFromUrl(firm.website_url);
    if (!domain) {
      skipped++;
      continue;
    }

    console.log(`  ▸ ${firm.firm_name} (${domain})`);

    try {
      // ----- Collect patches from all enabled providers -----

      const patches: EnrichPatch[] = [];

      if (PROVIDERS.has("apollo") && apolloKey) {
        const p = await enrichWithApollo(firm, apolloKey);
        if (Object.keys(p).length) {
          console.log(`    Apollo: ${Object.keys(p).join(", ")}`);
          patches.push(p);
        }
        await sleep(DELAY_MS);
      }

      if (PROVIDERS.has("clay") && clayKey) {
        const p = await enrichWithClay(firm, clayKey);
        if (Object.keys(p).length) {
          console.log(`    Clay: ${Object.keys(p).join(", ")}`);
          patches.push(p);
        }
        await sleep(DELAY_MS);
      }

      if (PROVIDERS.has("explorium") && exploriumKey) {
        const p = await enrichWithExplorium(firm, exploriumKey);
        if (Object.keys(p).length) {
          console.log(`    Explorium: ${Object.keys(p).join(", ")}`);
          patches.push(p);
        }
        await sleep(DELAY_MS);
      }

      if (PROVIDERS.has("hubspot") && hubspotToken) {
        const p = await enrichWithHubSpot(firm, hubspotToken);
        if (Object.keys(p).length) {
          console.log(`    HubSpot: ${Object.keys(p).join(", ")}`);
          patches.push(p);
        }
        await sleep(DELAY_MS);
      }

      // ----- Merge all provider patches -----
      const merged = mergePatches({}, ...patches);
      merged.last_enriched_at = new Date().toISOString();

      // ----- Update firm_records -----
      const { error: updateErr } = await supabase
        .from("firm_records")
        .update(merged)
        .eq("id", firm.id);
      if (updateErr) throw updateErr;

      // ----- Hunter: enrich partner emails -----
      if (PROVIDERS.has("hunter") && hunterKey) {
        const { data: partners } = await supabase
          .from("firm_investors")
          .select("id, full_name, first_name, last_name, email")
          .eq("firm_id", firm.id)
          .is("email", null);

        if (partners?.length) {
          const emailMap = await enrichPartnersWithHunter(domain, partners, hunterKey);
          for (const [partnerId, email] of emailMap) {
            await supabase
              .from("firm_investors")
              .update({ email })
              .eq("id", partnerId);
            console.log(`    Hunter: partner email → ${email}`);
          }
          await sleep(DELAY_MS);
        }
      }

      enriched++;
    } catch (e) {
      errors++;
      console.warn(`    ✗ Error enriching ${firm.firm_name}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`\n✅ Enrichment complete. Enriched: ${enriched}, skipped (no domain): ${skipped}, errors: ${errors}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
