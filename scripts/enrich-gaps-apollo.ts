/**
 * enrich-gaps-apollo.ts
 *
 * Fills the biggest data gaps in firm_records and firm_investors using Apollo.
 *
 * Gap analysis (as of 2026-03-31):
 *   FIRMS (982 total):
 *     logo_url       11.7%  — Apollo org enrichment returns logo_url
 *     x_url          13.0%  — Apollo org enrichment
 *     crunchbase_url 15.9%  — Apollo org enrichment
 *     linkedin_url   33.3%  — Apollo org enrichment
 *     elevator_pitch 34.0%  — Apollo short_description (if description already set)
 *     founded_year   30.3%  — Apollo org enrichment
 *     hq location    ~42%   — Apollo org enrichment
 *     description    63.6%  — Apollo org enrichment
 *
 *   PEOPLE (2100 total):
 *     education_summary  0.1%  — Apollo people/match
 *     last_active_date   0.2%  — derived from employment history
 *     investment_style   0.2%  — not in Apollo; skip
 *     city/state/country ~8%   — Apollo people/match
 *     avatar_url         18.9% — Apollo people/match (photo_url)
 *     linkedin_url       21.0% — Apollo people/match
 *     bio                44.3% — Apollo people/match (headline / bio)
 *     title              53.6% — Apollo people/match
 *
 * Usage:
 *   tsx scripts/enrich-gaps-apollo.ts                        # both firms + people
 *   ENRICH_TARGET=firms tsx scripts/enrich-gaps-apollo.ts    # firms only
 *   ENRICH_TARGET=people tsx scripts/enrich-gaps-apollo.ts   # people only
 *   ENRICH_MAX=50 tsx scripts/enrich-gaps-apollo.ts          # limit batch size
 *   DRY_RUN=true tsx scripts/enrich-gaps-apollo.ts           # preview without writing
 *
 * Env vars (loaded from .env / .env.local):
 *   APOLLO_API_KEY          — required
 *   SUPABASE_URL            — required
 *   SUPABASE_SERVICE_ROLE_KEY — required
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { augmentFirmRecordsPatchWithSupabase } from "./lib/firmRecordsCanonicalHqPolicy";

// ─── Env loading ─────────────────────────────────────────────────────────────

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

const SUPABASE_URL  = process.env.SUPABASE_URL || "";
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const APOLLO_KEY    = process.env.APOLLO_API_KEY?.trim() || "";
const MAX           = Math.max(1, parseInt(process.env.ENRICH_MAX || "200", 10));
const DELAY_MS      = Math.max(0, parseInt(process.env.ENRICH_DELAY_MS || "700", 10));
const DRY_RUN       = process.env.DRY_RUN === "true";
const TARGET        = (process.env.ENRICH_TARGET || "both").toLowerCase(); // "firms" | "people" | "both"

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not set.");
if (!SUPABASE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");
if (!APOLLO_KEY)   throw new Error("APOLLO_API_KEY is not set.");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ─── Utilities ───────────────────────────────────────────────────────────────

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

async function jsonPost<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cache-Control": "no-cache", ...headers },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.warn(`    ⚠ Apollo ${res.status}: ${text.slice(0, 120)}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`    ⚠ fetch error: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

// ─── Apollo: Organization enrichment ─────────────────────────────────────────

type ApolloOrg = {
  organization?: {
    name?: string;
    short_description?: string;
    logo_url?: string;
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

type FirmPatch = Partial<{
  description: string;
  elevator_pitch: string;
  logo_url: string;
  linkedin_url: string;
  x_url: string;
  crunchbase_url: string;
  founded_year: number;
  total_headcount: number;
  hq_city: string;
  hq_state: string;
  hq_country: string;
  aum: string;
  last_enriched_at: string;
}>;

type FirmRow = {
  id: string;
  firm_name: string;
  website_url: string | null;
  description: string | null;
  elevator_pitch: string | null;
  logo_url: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  crunchbase_url: string | null;
  founded_year: number | null;
  total_headcount: number | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_country: string | null;
  aum: string | null;
  last_enriched_at: string | null;
};

async function apolloEnrichFirm(firm: FirmRow): Promise<FirmPatch> {
  const domain = domainFromUrl(firm.website_url);
  if (!domain) return {};

  const data = await jsonPost<ApolloOrg>(
    "https://api.apollo.io/api/v1/organizations/enrich",
    { domain },
    { "X-Api-Key": APOLLO_KEY }
  );

  const org = data?.organization;
  if (!org) return {};

  const patch: FirmPatch = {};

  // Only fill gaps — never overwrite existing data
  if (!firm.description && org.short_description)
    patch.description = org.short_description;

  // elevator_pitch: write Apollo description even if we already have description
  // (it's a separate field for a shorter pitch)
  if (!firm.elevator_pitch && org.short_description)
    patch.elevator_pitch = org.short_description;

  if (!firm.logo_url && org.logo_url)
    patch.logo_url = org.logo_url;

  if (!firm.linkedin_url && org.linkedin_url)
    patch.linkedin_url = org.linkedin_url;

  if (!firm.x_url && org.twitter_url)
    patch.x_url = org.twitter_url;

  if (!firm.crunchbase_url && org.crunchbase_url)
    patch.crunchbase_url = org.crunchbase_url;

  if (!firm.founded_year && org.founded_year)
    patch.founded_year = org.founded_year;

  if (!firm.total_headcount && org.estimated_num_employees)
    patch.total_headcount = org.estimated_num_employees;

  if (!firm.hq_city && org.city)
    patch.hq_city = org.city;

  if (!firm.hq_state && org.state)
    patch.hq_state = org.state;

  if (!firm.hq_country && org.country)
    patch.hq_country = org.country;

  if (!firm.aum && org.annual_revenue_printed)
    patch.aum = org.annual_revenue_printed;

  return patch;
}

// ─── Apollo: People match ─────────────────────────────────────────────────────

type ApolloPerson = {
  person?: {
    first_name?: string;
    last_name?: string;
    title?: string;
    headline?: string;
    photo_url?: string;
    linkedin_url?: string;
    twitter_url?: string;
    city?: string;
    state?: string;
    country?: string;
    employment_history?: Array<{
      title?: string;
      organization_name?: string;
      start_date?: string;
      end_date?: string | null;
      current?: boolean;
    }>;
    education_history?: Array<{
      school?: { name?: string };
      degree?: string;
      field_of_study?: string;
      graduation_year?: number;
    }>;
  };
};

type PersonPatch = Partial<{
  title: string;
  bio: string;
  avatar_url: string;
  linkedin_url: string;
  x_url: string;
  city: string;
  state: string;
  country: string;
  education_summary: string;
  last_active_date: string;
  updated_at: string;
}>;

type PersonRow = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  bio: string | null;
  avatar_url: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  education_summary: string | null;
  last_active_date: string | null;
  firm_website_url: string | null; // joined from firm_records
};

async function apolloMatchPerson(person: PersonRow): Promise<PersonPatch> {
  const domain = domainFromUrl(person.firm_website_url);
  const firstName = person.first_name || person.full_name.split(" ")[0] || "";
  const lastName  = person.last_name  || person.full_name.split(" ").slice(-1)[0] || "";

  if (!firstName && !lastName) return {};

  // Build request — provide as many signals as possible for better matching
  const reqBody: Record<string, unknown> = {
    first_name: firstName,
    last_name: lastName,
    reveal_personal_emails: false,
    reveal_phone_number: false,
  };
  if (domain) reqBody.organization_domain = domain;
  if (person.linkedin_url) reqBody.linkedin_url = person.linkedin_url;

  const data = await jsonPost<ApolloPerson>(
    "https://api.apollo.io/api/v1/people/match",
    reqBody,
    { "X-Api-Key": APOLLO_KEY }
  );

  const p = data?.person;
  if (!p) return {};

  const patch: PersonPatch = {};

  if (!person.title && p.title)
    patch.title = p.title;

  // bio: prefer headline (more descriptive) over title
  if (!person.bio && (p.headline || p.title))
    patch.bio = p.headline || p.title || "";

  if (!person.avatar_url && p.photo_url)
    patch.avatar_url = p.photo_url;

  if (!person.linkedin_url && p.linkedin_url)
    patch.linkedin_url = p.linkedin_url;

  if (!person.x_url && p.twitter_url)
    patch.x_url = p.twitter_url;

  if (!person.city && p.city)
    patch.city = p.city;

  if (!person.state && p.state)
    patch.state = p.state;

  if (!person.country && p.country)
    patch.country = p.country;

  // education_summary: build from education history
  if (!person.education_summary && p.education_history?.length) {
    const eduLines = p.education_history
      .filter((e) => e.school?.name)
      .map((e) => {
        const parts = [e.school!.name!];
        if (e.degree) parts.push(e.degree);
        if (e.field_of_study) parts.push(e.field_of_study);
        if (e.graduation_year) parts.push(`(${e.graduation_year})`);
        return parts.join(", ");
      });
    if (eduLines.length) patch.education_summary = eduLines.join("; ");
  }

  // last_active_date: infer from most recent employment
  if (!person.last_active_date && p.employment_history?.length) {
    const currentJobs = p.employment_history.filter((e) => e.current);
    const latestJob   = currentJobs[0] ?? p.employment_history[0];
    const dateStr     = latestJob?.end_date || latestJob?.start_date;
    if (dateStr) patch.last_active_date = dateStr.slice(0, 10);
  }

  patch.updated_at = new Date().toISOString();
  return patch;
}

// ─── Firms enrichment loop ────────────────────────────────────────────────────

async function enrichFirms() {
  console.log(`\n── Enriching firm_records (Apollo) — max: ${MAX} ──`);
  if (DRY_RUN) console.log("   DRY RUN — no writes\n");

  // Target firms that have a website but are missing key fields
  const { data: firms, error } = await supabase
    .from("firm_records")
    .select(
      "id, firm_name, website_url, description, elevator_pitch, logo_url, " +
      "linkedin_url, x_url, crunchbase_url, founded_year, total_headcount, " +
      "hq_city, hq_state, hq_country, aum, last_enriched_at"
    )
    .not("website_url", "is", null)
    .or(
      "logo_url.is.null," +
      "description.is.null," +
      "elevator_pitch.is.null," +
      "linkedin_url.is.null," +
      "founded_year.is.null," +
      "hq_city.is.null"
    )
    .order("last_enriched_at", { ascending: true, nullsFirst: true })
    .limit(MAX);

  if (error) throw new Error(`Query error: ${error.message}`);
  if (!firms?.length) { console.log("  No firms need enrichment. All up to date!"); return; }

  console.log(`  ${firms.length} firms to enrich\n`);

  let enriched = 0, skipped = 0, errors = 0;

  for (const firm of firms as FirmRow[]) {
    const domain = domainFromUrl(firm.website_url);
    if (!domain) { skipped++; continue; }

    process.stdout.write(`  ▸ ${firm.firm_name} (${domain}) … `);

    try {
      const patch = await apolloEnrichFirm(firm);
      const fields = Object.keys(patch).filter((k) => k !== "last_enriched_at");

      if (!fields.length) {
        console.log("no new data");
        skipped++;
      } else {
        console.log(fields.join(", "));
        if (!DRY_RUN) {
          patch.last_enriched_at = new Date().toISOString();
          const merged = (await augmentFirmRecordsPatchWithSupabase(
            supabase,
            firm.id,
            patch,
            "apollo_gap_enrich",
          )) as Record<string, unknown>;
          const { error: updateErr } = await supabase.from("firm_records").update(merged).eq("id", firm.id);
          if (updateErr) throw updateErr;
        }
        enriched++;
      }
    } catch (e) {
      errors++;
      console.log(`ERROR: ${e instanceof Error ? e.message : e}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n  ✅ Firms done — enriched: ${enriched}, no-data: ${skipped}, errors: ${errors}`);
}

// ─── People enrichment loop ───────────────────────────────────────────────────

async function enrichPeople() {
  console.log(`\n── Enriching firm_investors (Apollo People Match) — max: ${MAX} ──`);
  if (DRY_RUN) console.log("   DRY RUN — no writes\n");

  // Step 1: fetch people with gaps
  const { data: people, error } = await supabase
    .from("firm_investors")
    .select(
      "id, full_name, first_name, last_name, firm_id, " +
      "title, bio, avatar_url, linkedin_url, x_url, " +
      "city, state, country, education_summary, last_active_date"
    )
    .or(
      "title.is.null," +
      "bio.is.null," +
      "avatar_url.is.null," +
      "linkedin_url.is.null," +
      "city.is.null"
    )
    .eq("is_active", true)
    .limit(MAX);

  if (error) throw new Error(`Query error: ${error.message}`);
  if (!people?.length) { console.log("  No people need enrichment. All up to date!"); return; }

  // Step 2: batch-fetch website_urls for all unique firm_ids
  const firmIds = [...new Set(people.map((p) => p.firm_id).filter(Boolean))];
  const { data: firmRows } = await supabase
    .from("firm_records")
    .select("id, website_url")
    .in("id", firmIds);
  const firmWebsiteMap = new Map<string, string | null>(
    (firmRows ?? []).map((f) => [f.id, f.website_url])
  );

  console.log(`  ${people.length} people to enrich\n`);

  let enriched = 0, skipped = 0, errors = 0;

  for (const raw of people) {
    const person: PersonRow = {
      ...raw,
      firm_website_url: firmWebsiteMap.get(raw.firm_id) ?? null,
    };

    process.stdout.write(`  ▸ ${person.full_name} … `);

    try {
      const patch = await apolloMatchPerson(person);
      const fields = Object.keys(patch).filter((k) => k !== "updated_at");

      if (!fields.length) {
        console.log("no match / no new data");
        skipped++;
      } else {
        console.log(fields.join(", "));
        if (!DRY_RUN) {
          const { error: updateErr } = await supabase
            .from("firm_investors")
            .update(patch)
            .eq("id", person.id);
          if (updateErr) throw updateErr;
        }
        enriched++;
      }
    } catch (e) {
      errors++;
      console.log(`ERROR: ${e instanceof Error ? e.message : e}`);
    }

    await sleep(DELAY_MS);
  }

  console.log(`\n  ✅ People done — enriched: ${enriched}, no match: ${skipped}, errors: ${errors}`);
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════");
  console.log("  enrich-gaps-apollo.ts");
  console.log(`  Target: ${TARGET}  |  Max: ${MAX}  |  Delay: ${DELAY_MS}ms${DRY_RUN ? "  |  DRY RUN" : ""}`);
  console.log("═══════════════════════════════════════════════════");

  if (TARGET === "firms" || TARGET === "both") await enrichFirms();
  if (TARGET === "people" || TARGET === "both") await enrichPeople();

  console.log("\n✅ All done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
