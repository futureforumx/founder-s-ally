/**
 * seed-greenhouse-signals.ts
 *
 * Ingests public job postings from the Greenhouse Job Board API and creates
 * OperatorSignal records (signal_type=JOB_POSTING_DETECTED) for each active role.
 *
 * This is a free, unauthenticated API — companies publish their job boards publicly.
 * Greenhouse endpoint: https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs?content=true
 *
 * The script:
 *   1. Reads target companies from operator_companies where data_source includes "greenhouse"
 *      OR from a static BOARD_TOKENS list defined here / in .env.
 *   2. For each company, fetches all published jobs.
 *   3. Upserts operator_signals rows (keyed on company_id + job_id from metadata).
 *   4. Updates operator_companies.active_job_count + last_job_posted_at.
 *
 * Usage:
 *   tsx scripts/seed-greenhouse-signals.ts                           # all tracked companies
 *   BOARD_TOKENS=stripe,notion,rippling tsx seed-greenhouse-signals.ts  # specific tokens
 *   DRY_RUN=true tsx scripts/seed-greenhouse-signals.ts              # preview
 *   MAX_COMPANIES=20 tsx scripts/seed-greenhouse-signals.ts          # cap companies
 *
 * Env vars:
 *   SUPABASE_URL               — required
 *   SUPABASE_SERVICE_ROLE_KEY  — required
 *   BOARD_TOKENS               — optional comma-separated token overrides
 *   MAX_COMPANIES              — optional cap (default 200)
 *   DRY_RUN                    — optional
 *
 * Adding new companies:
 *   Most companies using Greenhouse have a token matching their domain slug
 *   (e.g. stripe.com → "stripe"). You can verify at:
 *   https://boards-api.greenhouse.io/v1/boards/<token>/jobs
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

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
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      )
        v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}

loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DRY_RUN      = process.env.DRY_RUN === "true";
const MAX_COMPANIES = parseInt(process.env.MAX_COMPANIES || "200", 10);
const DELAY_MS     = parseInt(process.env.DELAY_MS || "400", 10);

// Override with explicit board tokens from env (comma-separated)
const ENV_TOKENS = process.env.BOARD_TOKENS
  ? process.env.BOARD_TOKENS.split(",").map((t) => t.trim()).filter(Boolean)
  : [];

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not set.");
if (!SUPABASE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ─── Curated seed list (well-known Greenhouse customers in startup ecosystem) ─
// Extend this list as you discover more companies using Greenhouse.
// Format: { token: "greenhouse_board_token", name: "Display Name" }

const CURATED_BOARD_TOKENS: Array<{ token: string; name: string }> = [
  { token: "stripe",         name: "Stripe" },
  { token: "rippling",       name: "Rippling" },
  { token: "notion",         name: "Notion" },
  { token: "figma",          name: "Figma" },
  { token: "airtable",       name: "Airtable" },
  { token: "brex",           name: "Brex" },
  { token: "ramp",           name: "Ramp" },
  { token: "retool",         name: "Retool" },
  { token: "verkada",        name: "Verkada" },
  { token: "benchling",      name: "Benchling" },
  { token: "plaid",          name: "Plaid" },
  { token: "gusto",          name: "Gusto" },
  { token: "carta",          name: "Carta" },
  { token: "mercury",        name: "Mercury" },
  { token: "moderntreasury", name: "Modern Treasury" },
  { token: "checkr",         name: "Checkr" },
  { token: "lattice",        name: "Lattice" },
  { token: "leapsome",       name: "Leapsome" },
  { token: "deel",           name: "Deel" },
  { token: "remote",         name: "Remote" },
  { token: "dbt",            name: "dbt Labs" },
  { token: "fivetran",       name: "Fivetran" },
  { token: "amplitude",      name: "Amplitude" },
  { token: "mixpanel",       name: "Mixpanel" },
  { token: "segment",        name: "Segment" },
  { token: "pagerduty",      name: "PagerDuty" },
  { token: "launchdarkly",   name: "LaunchDarkly" },
  { token: "hashicorp",      name: "HashiCorp" },
  { token: "mongodb",        name: "MongoDB" },
  { token: "cockroachdb",    name: "CockroachDB" },
  { token: "planetscale",    name: "PlanetScale" },
  { token: "neon",           name: "Neon" },
  { token: "supabase",       name: "Supabase" },
  { token: "vercel",         name: "Vercel" },
  { token: "netlify",        name: "Netlify" },
  { token: "linear",         name: "Linear" },
  { token: "height",         name: "Height" },
  { token: "coda",           name: "Coda" },
  { token: "webflow",        name: "Webflow" },
  { token: "framer",         name: "Framer" },
  { token: "intercom",       name: "Intercom" },
  { token: "front",          name: "Front" },
  { token: "zendesk",        name: "Zendesk" },
  { token: "freshworks",     name: "Freshworks" },
  { token: "gong",           name: "Gong" },
  { token: "clari",          name: "Clari" },
  { token: "outreach",       name: "Outreach" },
  { token: "salesloft",      name: "SalesLoft" },
  { token: "apollo",         name: "Apollo.io" },
  { token: "lusha",          name: "Lusha" },
  { token: "clearbit",       name: "Clearbit" },
  { token: "zoominfo",       name: "ZoomInfo" },
];

// ─── Greenhouse API types ─────────────────────────────────────────────────────

interface GreenhouseJob {
  id: number;
  title: string;
  absolute_url: string;
  updated_at: string;
  location: { name: string };
  departments: Array<{ name: string }>;
  offices: Array<{ name: string }>;
  content?: string; // HTML job description (when ?content=true)
}

interface GreenhouseJobsResponse {
  jobs: GreenhouseJob[];
  meta: { total: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

async function fetchGreenhouse(token: string): Promise<GreenhouseJob[] | null> {
  const url = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(token)}/jobs?content=false`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "VektaOperatorGraph/1.0" },
    });
    if (res.status === 404) return null; // board not found — skip silently
    if (!res.ok) {
      console.warn(`  ⚠ Greenhouse ${res.status} for token "${token}"`);
      return null;
    }
    const json = (await res.json()) as GreenhouseJobsResponse;
    return json.jobs ?? [];
  } catch (e) {
    console.warn(`  ⚠ fetch error for "${token}": ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

/**
 * Find or create an operator_company record by name.
 * Returns the company id or null.
 */
async function resolveCompanyByName(name: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from("operator_companies")
    .select("id")
    .ilike("name", name.trim())
    .maybeSingle();

  if (existing?.id) return existing.id;

  // Create a minimal record
  const newId = randomUUID();
  if (!DRY_RUN) {
    const { error } = await supabase.from("operator_companies").insert({
      id: newId,
      name: name.trim(),
      data_source: "greenhouse",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) {
      if (error.code === "23505") {
        // Concurrent insert: fetch existing
        const { data: fallback } = await supabase
          .from("operator_companies")
          .select("id")
          .ilike("name", name.trim())
          .maybeSingle();
        return fallback?.id ?? null;
      }
      console.warn(`  ⚠ company create error for "${name}": ${error.message}`);
      return null;
    }
  }
  return newId;
}

/**
 * Determine function tag from Greenhouse department name.
 */
function deptToFunction(dept: string): string {
  const d = dept.toLowerCase();
  if (/engineering|tech|dev|infra|platform|data/.test(d)) return "ENGINEERING";
  if (/product/.test(d)) return "PRODUCT";
  if (/sales|revenue|business dev|partnerships/.test(d)) return "SALES";
  if (/marketing|growth|demand/.test(d)) return "MARKETING";
  if (/design|ux|ui/.test(d)) return "DESIGN";
  if (/finance|accounting|fp&a/.test(d)) return "FINANCE";
  if (/operations|ops/.test(d)) return "OPERATIONS";
  if (/people|hr|talent|recruiting/.test(d)) return "PEOPLE_HR";
  if (/customer|cx|support|success/.test(d)) return "CUSTOMER_SUCCESS";
  if (/legal|compliance|privacy/.test(d)) return "LEGAL";
  if (/data|analytics|bi/.test(d)) return "DATA";
  return "OTHER";
}

// ─── Main processing ──────────────────────────────────────────────────────────

interface CompanyTarget {
  id: string | null; // null = we'll create on first use
  name: string;
  token: string;
}

async function processCompany(target: CompanyTarget): Promise<{
  inserted: number;
  skipped: number;
  companyId: string | null;
}> {
  const jobs = await fetchGreenhouse(target.token);
  if (jobs === null) return { inserted: 0, skipped: 0, companyId: null };
  if (jobs.length === 0) return { inserted: 0, skipped: 0, companyId: target.id };

  let companyId = target.id;
  if (!companyId) {
    companyId = await resolveCompanyByName(target.name);
  }

  // Fetch existing signal IDs for this company to avoid duplicates
  const { data: existing } = companyId
    ? await supabase
        .from("operator_signals")
        .select("metadata->job_id")
        .eq("company_id", companyId)
        .eq("source", "greenhouse")
    : { data: [] };

  const existingJobIds = new Set<string>(
    (existing ?? []).map((r: Record<string, unknown>) => String(r["?column?"] ?? ""))
  );

  let inserted = 0;
  let skipped  = 0;
  const now = new Date().toISOString();
  let latestPostedAt: string | null = null;

  for (const job of jobs) {
    const jobId = String(job.id);

    if (existingJobIds.has(jobId)) {
      skipped++;
      continue;
    }

    const dept = job.departments?.[0]?.name ?? "";
    const fn   = deptToFunction(dept);

    const signal = {
      id:            randomUUID(),
      entity_type:   "company",
      company_id:    companyId,
      person_id:     null,
      signal_type:   "JOB_POSTING_DETECTED",
      title:         `${target.name} is hiring: ${job.title}`,
      description:   `Department: ${dept || "N/A"} · Location: ${job.location?.name || "Remote/Unspecified"}`,
      url:           job.absolute_url,
      source:        "greenhouse",
      occurred_at:   job.updated_at ?? now,
      confidence_score: 95,
      metadata: {
        job_id:       jobId,
        job_title:    job.title,
        department:   dept,
        location:     job.location?.name ?? null,
        offices:      job.offices?.map((o) => o.name) ?? [],
        function_tag: fn,
        board_token:  target.token,
      },
      created_at: now,
      updated_at: now,
    };

    if (!DRY_RUN) {
      const { error } = await supabase.from("operator_signals").insert(signal);
      if (error && error.code !== "23505") {
        console.warn(`    ⚠ signal insert error: ${error.message}`);
      }
    }

    inserted++;

    // Track latest posting date for company update
    if (!latestPostedAt || job.updated_at > latestPostedAt) {
      latestPostedAt = job.updated_at;
    }
  }

  // Update company's job activity counters
  if (companyId && !DRY_RUN) {
    const patch: Record<string, unknown> = {
      active_job_count: jobs.length,
      updated_at: now,
    };
    if (latestPostedAt) patch.last_job_posted_at = latestPostedAt;

    await supabase
      .from("operator_companies")
      .update(patch)
      .eq("id", companyId);
  }

  return { inserted, skipped, companyId };
}

// ─── Entry point ─────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  seed-greenhouse-signals.ts — Hiring Signal Ingestion");
  console.log(`  Max companies: ${MAX_COMPANIES}  |  Delay: ${DELAY_MS}ms${DRY_RUN ? "  |  DRY RUN" : ""}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Build target list: ENV override > DB-stored tokens > curated seed list
  let targets: CompanyTarget[] = [];

  if (ENV_TOKENS.length > 0) {
    // Use explicit token overrides from env
    targets = ENV_TOKENS.map((token) => ({ id: null, name: token, token }));
    console.log(`  Using ${targets.length} board tokens from BOARD_TOKENS env\n`);
  } else {
    // Pull companies from operator_companies that have a greenhouse_token metadata
    const { data: dbCompanies } = await supabase
      .from("operator_companies")
      .select("id, name, metadata")
      .not("deleted_at", "is", null)
      .limit(MAX_COMPANIES);

    // For now, fall back to curated list (until companies store their greenhouse_token)
    const curatedTargets = CURATED_BOARD_TOKENS.slice(0, MAX_COMPANIES).map((c) => ({
      id: null as string | null,
      name: c.name,
      token: c.token,
    }));

    // Try to match curated names against DB companies
    for (const t of curatedTargets) {
      const match = (dbCompanies ?? []).find(
        (c: Record<string, string>) =>
          c.name?.toLowerCase() === t.name.toLowerCase()
      );
      if (match) t.id = (match as Record<string, string>).id;
    }

    targets = curatedTargets;
    console.log(`  Using ${targets.length} companies from curated list\n`);
  }

  let totalInserted = 0;
  let totalSkipped  = 0;
  let totalErrors   = 0;
  let notFound      = 0;

  for (const target of targets) {
    process.stdout.write(`  ▸ ${target.name} (${target.token}) … `);

    try {
      const { inserted, skipped, companyId } = await processCompany(target);

      if (companyId === null && inserted === 0 && skipped === 0) {
        console.log("not found");
        notFound++;
      } else {
        console.log(`${inserted} new signals, ${skipped} existing`);
        totalInserted += inserted;
        totalSkipped  += skipped;
      }
    } catch (e) {
      totalErrors++;
      console.log(`ERROR: ${e instanceof Error ? e.message : e}`);
    }

    await sleep(DELAY_MS);
  }

  console.log("\n─────────────────────────────────────────────────────────────");
  console.log(`  ✅ Done — inserted: ${totalInserted}, skipped: ${totalSkipped}, not found: ${notFound}, errors: ${totalErrors}`);
  console.log("─────────────────────────────────────────────────────────────\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
