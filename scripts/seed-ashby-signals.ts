/**
 * seed-ashby-signals.ts
 *
 * Ingests public job postings from the Ashby Job Board API and creates
 * OperatorSignal records (signal_type=JOB_POSTING_DETECTED) for each active role.
 *
 * Ashby's job board posting API is public — no auth required.
 * Endpoint: https://api.ashbyhq.com/posting-api/job-board/{company}
 *
 * The script:
 *   1. Reads target companies from operator_companies where metadata includes an ashby_slug,
 *      OR uses the curated CURATED_ASHBY_SLUGS list defined here.
 *   2. Fetches all published job postings for each company.
 *   3. Upserts operator_signals (keyed on company_id + job_id from metadata).
 *   4. Updates operator_companies.active_job_count + last_job_posted_at.
 *
 * Usage:
 *   tsx scripts/seed-ashby-signals.ts                                  # all tracked
 *   ASHBY_SLUGS=openai,anthropic tsx scripts/seed-ashby-signals.ts    # specific slugs
 *   DRY_RUN=true tsx scripts/seed-ashby-signals.ts                     # preview
 *   MAX_COMPANIES=20 tsx scripts/seed-ashby-signals.ts                 # cap
 *
 * Env vars:
 *   SUPABASE_URL               — required
 *   SUPABASE_SERVICE_ROLE_KEY  — required
 *   ASHBY_SLUGS                — optional comma-separated slug overrides
 *   MAX_COMPANIES              — optional cap (default 200)
 *   DRY_RUN                    — optional
 *
 * Finding Ashby slugs:
 *   Navigate to jobs.ashbyhq.com/<slug> — if it loads a job board, the slug is valid.
 *   The API endpoint is: https://api.ashbyhq.com/posting-api/job-board/<slug>
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

const SUPABASE_URL   = process.env.SUPABASE_URL || "";
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DRY_RUN        = process.env.DRY_RUN === "true";
const MAX_COMPANIES  = parseInt(process.env.MAX_COMPANIES || "200", 10);
const DELAY_MS       = parseInt(process.env.DELAY_MS || "400", 10);

const ENV_SLUGS = process.env.ASHBY_SLUGS
  ? process.env.ASHBY_SLUGS.split(",").map((s) => s.trim()).filter(Boolean)
  : [];

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not set.");
if (!SUPABASE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ─── Curated Ashby customer list (fast-growing tech companies) ────────────────
// Many prominent YC + top-tier startups use Ashby for ATS.
// Verify at: https://jobs.ashbyhq.com/<slug>

const CURATED_ASHBY_SLUGS: Array<{ slug: string; name: string }> = [
  { slug: "openai",             name: "OpenAI" },
  { slug: "anthropic",          name: "Anthropic" },
  { slug: "mistral",            name: "Mistral AI" },
  { slug: "cohere",             name: "Cohere" },
  { slug: "scale-ai",           name: "Scale AI" },
  { slug: "huggingface",        name: "Hugging Face" },
  { slug: "perplexity",         name: "Perplexity AI" },
  { slug: "cursor",             name: "Cursor" },
  { slug: "replit",             name: "Replit" },
  { slug: "harvey",             name: "Harvey" },
  { slug: "sierra",             name: "Sierra" },
  { slug: "cognition-labs",     name: "Cognition Labs" },
  { slug: "anysphere",          name: "Anysphere (Cursor)" },
  { slug: "moonshot-ai",        name: "Moonshot AI" },
  { slug: "together-ai",        name: "Together AI" },
  { slug: "modal-labs",         name: "Modal Labs" },
  { slug: "replicate",          name: "Replicate" },
  { slug: "baseten",            name: "Baseten" },
  { slug: "runway",             name: "Runway" },
  { slug: "elevenlabs",         name: "ElevenLabs" },
  { slug: "midjourney",         name: "Midjourney" },
  { slug: "stability-ai",       name: "Stability AI" },
  { slug: "character-ai",       name: "Character AI" },
  { slug: "inflection",         name: "Inflection AI" },
  { slug: "adept",              name: "Adept" },
  { slug: "imbue",              name: "Imbue" },
  { slug: "genesis-therapeutics", name: "Genesis Therapeutics" },
  { slug: "arc",                name: "Arc" },
  { slug: "browserbase",        name: "Browserbase" },
  { slug: "e2b",                name: "E2B" },
  { slug: "langchain",          name: "LangChain" },
  { slug: "llamaindex",         name: "LlamaIndex" },
  { slug: "weaviate",           name: "Weaviate" },
  { slug: "pinecone",           name: "Pinecone" },
  { slug: "qdrant",             name: "Qdrant" },
  { slug: "chroma",             name: "Chroma" },
  { slug: "vapi",               name: "Vapi" },
  { slug: "retellai",           name: "Retell AI" },
  { slug: "synthflow",          name: "Synthflow" },
  { slug: "heygen",             name: "HeyGen" },
  { slug: "descript",           name: "Descript" },
  { slug: "glean",              name: "Glean" },
  { slug: "notion",             name: "Notion" },
  { slug: "coda",               name: "Coda" },
  { slug: "linear",             name: "Linear" },
  { slug: "loom",               name: "Loom" },
  { slug: "pitch",              name: "Pitch" },
  { slug: "miro",               name: "Miro" },
  { slug: "figjam",             name: "FigJam" },
  { slug: "rows",               name: "Rows" },
  { slug: "hex",                name: "Hex" },
  { slug: "hightouch",          name: "Hightouch" },
  { slug: "census",             name: "Census" },
  { slug: "polytomic",          name: "Polytomic" },
  { slug: "airbyte",            name: "Airbyte" },
  { slug: "dagster",            name: "Dagster" },
  { slug: "prefect",            name: "Prefect" },
  { slug: "metaplane",          name: "Metaplane" },
  { slug: "monte-carlo",        name: "Monte Carlo" },
  { slug: "great-expectations", name: "Great Expectations" },
  { slug: "dbt",                name: "dbt Labs" },
  { slug: "motherduck",         name: "MotherDuck" },
  { slug: "tinybird",           name: "Tinybird" },
  { slug: "clickhouse",         name: "ClickHouse" },
  { slug: "turso",              name: "Turso" },
  { slug: "upstash",            name: "Upstash" },
  { slug: "fly-io",             name: "Fly.io" },
  { slug: "render",             name: "Render" },
  { slug: "railway",            name: "Railway" },
  { slug: "clerk",              name: "Clerk" },
  { slug: "workos",             name: "WorkOS" },
  { slug: "descope",            name: "Descope" },
  { slug: "stytch",             name: "Stytch" },
  { slug: "permit-io",          name: "Permit.io" },
  { slug: "oso",                name: "Oso" },
  { slug: "svix",               name: "Svix" },
  { slug: "inngest",            name: "Inngest" },
  { slug: "trigger-dev",        name: "Trigger.dev" },
  { slug: "resend",             name: "Resend" },
  { slug: "loops",              name: "Loops" },
  { slug: "courier",            name: "Courier" },
  { slug: "knock",              name: "Knock" },
  { slug: "attio",              name: "Attio" },
  { slug: "twenty",             name: "Twenty" },
  { slug: "people-data-labs",   name: "People Data Labs" },
  { slug: "apollo",             name: "Apollo.io" },
  { slug: "lusha",              name: "Lusha" },
  { slug: "clay",               name: "Clay" },
  { slug: "outreach",           name: "Outreach" },
  { slug: "gong",               name: "Gong" },
  { slug: "chorus",             name: "Chorus" },
  { slug: "clari",              name: "Clari" },
  { slug: "common-room",        name: "Common Room" },
  { slug: "orbit",              name: "Orbit" },
  { slug: "pave",               name: "Pave" },
  { slug: "levels-fyi",         name: "Levels.fyi" },
  { slug: "deel",               name: "Deel" },
  { slug: "remote",             name: "Remote" },
  { slug: "oyster",             name: "Oyster HR" },
  { slug: "rippling",           name: "Rippling" },
  { slug: "leapsome",           name: "Leapsome" },
  { slug: "lattice",            name: "Lattice" },
  { slug: "culture-amp",        name: "Culture Amp" },
  { slug: "15five",             name: "15Five" },
  { slug: "ramp",               name: "Ramp" },
  { slug: "brex",               name: "Brex" },
  { slug: "mercury",            name: "Mercury" },
  { slug: "relay",              name: "Relay" },
  { slug: "column",             name: "Column" },
  { slug: "modern-treasury",    name: "Modern Treasury" },
  { slug: "increase",           name: "Increase" },
  { slug: "unit",               name: "Unit" },
];

// ─── Ashby API types ──────────────────────────────────────────────────────────

interface AshbyJob {
  id: string;
  title: string;
  teamName?: string;
  departmentName?: string;
  locationName?: string;
  isListed: boolean;
  publishedAt?: string;
  updatedAt?: string;
  applyUrl?: string;
  jobUrl?: string;
  employmentType?: string;
  descriptionHtml?: string;
  compensation?: {
    summaryComponents?: Array<{ label: string; value: string }>;
    currency?: string;
  };
}

interface AshbyJobBoardResponse {
  jobs?: AshbyJob[];
  apiVersion?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

async function fetchAshby(slug: string): Promise<AshbyJob[] | null> {
  const url = `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "VektaOperatorGraph/1.0",
        Accept: "application/json",
      },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn(`  ⚠ Ashby ${res.status} for "${slug}": ${txt.slice(0, 80)}`);
      return null;
    }
    const json = (await res.json()) as AshbyJobBoardResponse;
    return (json.jobs ?? []).filter((j) => j.isListed !== false);
  } catch (e) {
    console.warn(`  ⚠ fetch error for "${slug}": ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

async function resolveCompanyByName(name: string): Promise<string | null> {
  const { data: existing } = await supabase
    .from("operator_companies")
    .select("id")
    .ilike("name", name.trim())
    .maybeSingle();

  if (existing?.id) return existing.id;

  const newId = randomUUID();
  if (!DRY_RUN) {
    const { error } = await supabase.from("operator_companies").insert({
      id:         newId,
      name:       name.trim(),
      data_source: "ashby",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    if (error) {
      if (error.code === "23505") {
        const { data: fallback } = await supabase
          .from("operator_companies")
          .select("id")
          .ilike("name", name.trim())
          .maybeSingle();
        return fallback?.id ?? null;
      }
      console.warn(`  ⚠ company insert error for "${name}": ${error.message}`);
      return null;
    }
  }
  return newId;
}

function deptToFunction(dept?: string): string {
  if (!dept) return "OTHER";
  const d = dept.toLowerCase();
  if (/engineering|tech|dev|infra|platform|ml|ai/.test(d)) return "ENGINEERING";
  if (/product/.test(d)) return "PRODUCT";
  if (/sales|revenue|business dev|partnerships|bdr|sdr/.test(d)) return "SALES";
  if (/marketing|growth|demand|brand|content/.test(d)) return "MARKETING";
  if (/design|ux|ui/.test(d)) return "DESIGN";
  if (/finance|accounting|fp&a|legal|compliance/.test(d)) return "FINANCE";
  if (/operations|ops/.test(d)) return "OPERATIONS";
  if (/people|hr|talent|recruiting/.test(d)) return "PEOPLE_HR";
  if (/customer|support|success|cx/.test(d)) return "CUSTOMER_SUCCESS";
  if (/data|analytics|bi/.test(d)) return "DATA";
  return "OTHER";
}

// ─── Company processing ───────────────────────────────────────────────────────

async function processCompany(
  slug: string,
  name: string,
  existingId: string | null
): Promise<{ inserted: number; skipped: number; companyId: string | null }> {
  const jobs = await fetchAshby(slug);
  if (jobs === null) return { inserted: 0, skipped: 0, companyId: null };
  if (jobs.length === 0) return { inserted: 0, skipped: 0, companyId: existingId };

  let companyId = existingId ?? (await resolveCompanyByName(name));

  // Fetch already-ingested job IDs
  const { data: existingSignals } = companyId
    ? await supabase
        .from("operator_signals")
        .select("metadata")
        .eq("company_id", companyId)
        .eq("source", "ashby")
    : { data: [] };

  const existingJobIds = new Set<string>(
    (existingSignals ?? [])
      .map((s: { metadata: Record<string, unknown> }) => String(s.metadata?.job_id ?? ""))
      .filter(Boolean)
  );

  let inserted = 0;
  let skipped  = 0;
  const now = new Date().toISOString();
  let latestPostedAt: string | null = null;

  for (const job of jobs) {
    if (existingJobIds.has(job.id)) {
      skipped++;
      continue;
    }

    const fn = deptToFunction(job.departmentName || job.teamName);
    const jobDate = job.publishedAt || job.updatedAt || now;

    const signal = {
      id:            randomUUID(),
      entity_type:   "company",
      company_id:    companyId,
      person_id:     null,
      signal_type:   "JOB_POSTING_DETECTED",
      title:         `${name} is hiring: ${job.title}`,
      description:   [
        job.departmentName ? `Team: ${job.departmentName}` : null,
        job.locationName   ? `Location: ${job.locationName}` : null,
        job.employmentType ? `Type: ${job.employmentType}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      url:           job.applyUrl ?? job.jobUrl ?? null,
      source:        "ashby",
      occurred_at:   jobDate,
      confidence_score: 95,
      metadata: {
        job_id:          job.id,
        job_title:       job.title,
        department:      job.departmentName ?? null,
        team:            job.teamName ?? null,
        location:        job.locationName ?? null,
        employment_type: job.employmentType ?? null,
        function_tag:    fn,
        ashby_slug:      slug,
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

    if (!latestPostedAt || jobDate > latestPostedAt) {
      latestPostedAt = jobDate;
    }
  }

  // Update company hiring counters
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
  console.log("  seed-ashby-signals.ts — Hiring Signal Ingestion (Ashby ATS)");
  console.log(`  Max companies: ${MAX_COMPANIES}  |  Delay: ${DELAY_MS}ms${DRY_RUN ? "  |  DRY RUN" : ""}`);
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Build slug list
  let slugTargets: Array<{ slug: string; name: string; id: string | null }> = [];

  if (ENV_SLUGS.length > 0) {
    slugTargets = ENV_SLUGS.map((s) => ({ slug: s, name: s, id: null }));
    console.log(`  Using ${slugTargets.length} slugs from ASHBY_SLUGS env\n`);
  } else {
    // Load curated list, try to match against existing operator_companies
    const { data: dbCompanies } = await supabase
      .from("operator_companies")
      .select("id, name")
      .limit(500);

    slugTargets = CURATED_ASHBY_SLUGS.slice(0, MAX_COMPANIES).map((c) => {
      const match = (dbCompanies ?? []).find(
        (db: { id: string; name: string }) =>
          db.name?.toLowerCase() === c.name.toLowerCase()
      );
      return {
        slug: c.slug,
        name: c.name,
        id: (match as { id: string } | undefined)?.id ?? null,
      };
    });

    console.log(`  Using ${slugTargets.length} companies from curated list\n`);
  }

  let totalInserted = 0;
  let totalSkipped  = 0;
  let totalErrors   = 0;
  let notFound      = 0;

  for (const target of slugTargets) {
    process.stdout.write(`  ▸ ${target.name} (${target.slug}) … `);

    try {
      const { inserted, skipped, companyId } = await processCompany(
        target.slug,
        target.name,
        target.id
      );

      if (companyId === null && inserted === 0 && skipped === 0) {
        console.log("not found / no jobs");
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
