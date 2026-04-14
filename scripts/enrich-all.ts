/**
 * enrich-all.ts — Master enrichment orchestrator
 *
 * Fills ALL empty fields on firm_records and firm_investors by running
 * multiple enrichment phases in sequence:
 *
 *   Phase 1 — Firm Profile Enrichment (Exa/Tavily + Firecrawl + LLM)
 *             Fills: description, thesis_verticals (e.g. Climate Tech), team-based
 *             total_headcount when the site lists people, website_url, and optional
 *             portfolio company names → firm_recent_deals (source_name=firm_website)
 *
 *   Phase 2 — Tri-Force Pipeline (Perplexity + Exa + AI formatting)
 *             Fills: aum, recent_deals, current_partners (firm_investors)
 *
 *   Phase 3 — Firm Investor Enrichment (Team page scraping + Exa + PDL)
 *             Fills: first_name, last_name, title, bio, avatar_url, email,
 *             linkedin_url, x_url, website_url, medium_url, substack_url,
 *             personal_thesis_tags, city/state/country, education_summary,
 *             background_summary, past_investments (company list from page + web)
 *
 *   Phase 4 — Email Backfill (multi-provider waterfall)
 *             Fills: email on firm_investors with no email
 *
 *   Phase 5 — Headshot Backfill (Unavatar cascade)
 *             Fills: avatar_url on firm_investors
 *
 * Usage:
 *   npx tsx scripts/enrich-all.ts
 *   ENRICH_ALL_MAX=50 npx tsx scripts/enrich-all.ts
 *   ENRICH_ALL_PHASES=1,2,3 npx tsx scripts/enrich-all.ts
 *   ENRICH_ALL_DRY_RUN=1 npx tsx scripts/enrich-all.ts
 *
 * Env vars (from .env / .env.local):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   APOLLO_API_KEY, HUNTER_API_KEY, CLAY_API_KEY, EXPLORIUM_API_KEY
 *   PERPLEXITY_API_KEY, EXA_API_KEY, LOVABLE_API_KEY
 *   GROQ_API_KEY, GEMINI_API_KEY
 *   FIRECRAWL_API_KEY, JINA_API_KEY
 *   PEOPLE_DATA_LABS_API_KEY, LUSHA_API_KEY, SERPWOW_API_KEY, LINKUP_API_KEY
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { augmentFirmRecordsPatchWithFetch } from "./lib/firmRecordsCanonicalHqPolicy";

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
      const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      if (process.env[m[1]] !== undefined && process.env[m[1]] !== "") continue;
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      )
        v = v.slice(1, -1);
      if (v) process.env[m[1]] = v;
    }
  }
}

loadEnv();

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SUPABASE_URL = (
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || ""
).replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not set.");
if (!SERVICE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");

let MAX = Math.max(1, parseInt(process.env.ENRICH_ALL_MAX || "100", 10));
const DELAY_MS = Math.max(0, parseInt(process.env.ENRICH_ALL_DELAY_MS || "3000", 10));
const STALE_DAYS = Math.max(0, parseInt(process.env.ENRICH_ALL_STALE_DAYS || "30", 10));
const DRY_RUN = ["1", "true", "yes"].includes(
  (process.env.ENRICH_ALL_DRY_RUN || "").toLowerCase()
);
const PHASES = new Set(
  (process.env.ENRICH_ALL_PHASES || "1,2,3,4,5")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => n >= 1 && n <= 5)
);

// API keys
const PERPLEXITY_KEY   = process.env.PERPLEXITY_API_KEY?.trim() || "";
const EXA_KEY          = (process.env.EXA_API_KEY?.trim() || process.env.EXA_AI_API_KEY?.trim() || "");
const TAVILY_KEY       = process.env.TAVILY_API_KEY?.trim() || "";
const JINA_KEY         = process.env.JINA_API_KEY?.trim() || "";
const LINKUP_KEY       = process.env.LINKUP_API_KEY?.trim() || "";
const GROQ_KEY         = process.env.GROQ_API_KEY?.trim() || "";
const DEEPSEEK_KEY     = process.env.DEEPSEEK_API_KEY?.trim() || "";
// GEMINI_KEY   — gemini-2.0-flash (fast fallback)
const GEMINI_KEY       = process.env.GEMINI_API_KEY?.trim() || "";
// GEMINI_25_KEY — gemini-2.5-flash (primary extractor; falls back to GEMINI_KEY if not set)
const GEMINI_25_KEY    = (process.env.GEMINI_25_API_KEY?.trim() || GEMINI_KEY);
const HUNTER_KEY       = process.env.HUNTER_API_KEY?.trim() || "";
const PDL_KEY          = process.env.PEOPLE_DATA_LABS_API_KEY?.trim() || process.env.PDL_API_KEY?.trim() || "";
const LUSHA_KEY        = process.env.LUSHA_API_KEY?.trim() || "";
const FIRECRAWL_KEY    = process.env.FIRECRAWL_API_KEY?.trim() || "";
const SERPWOW_KEY      = process.env.SERPWOW_API_KEY?.trim() || "";
const LOVABLE_KEY      = process.env.LOVABLE_API_KEY?.trim() || "";
// ScrapingBee — JS-rendered scraping; reads SCRAPING_BEE_API_KEY or SCRAPINGBEE_API_KEY
const SCRAPINGBEE_KEY  = (process.env.SCRAPING_BEE_API_KEY?.trim() || process.env.SCRAPINGBEE_API_KEY?.trim() || "");
// CLAY_KEY    → deprecated endpoint (HTTP 404)
// EXPLORIUM_KEY → endpoint not found (HTTP 404)
const APOLLO_KEY = process.env.APOLLO_API_KEY?.trim() || "";
const CLAY_KEY = "";   // disabled

// ---------------------------------------------------------------------------
// ENRICH_SKIP_PROVIDERS — comma-separated hostnames to skip from the start
// e.g. ENRICH_SKIP_PROVIDERS=api.tavily.com,api.exa.ai
// ---------------------------------------------------------------------------
const SKIP_PROVIDERS = new Set(
  (process.env.ENRICH_SKIP_PROVIDERS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
);

// Pre-mark known-broken providers so they're never called
for (const host of ["api.clay.com", "api.explorium.ai"]) {
  SKIP_PROVIDERS.add(host);
}

// Tracks providers that have permanently exhausted billing/quota — skipped for entire run
const QUOTA_EXHAUSTED = new Set<string>();
// Pre-seed from SKIP_PROVIDERS so the first call is never wasted
for (const host of SKIP_PROVIDERS) QUOTA_EXHAUSTED.add(host);

// Time-based cooldown for rate-limited providers (429 = temporary, not permanent)
// Maps hostname → timestamp when it may be retried again
const RATE_LIMIT_COOLDOWN = new Map<string, number>();
const RATE_LIMIT_COOLDOWN_MS = 90_000; // 90s cooldown before retrying a 429-limited provider

// ---------------------------------------------------------------------------
// Run-level statistics (populated during the run, printed at end)
// ---------------------------------------------------------------------------

/** Per-provider call tracking */
type ProviderStat = { calls: number; successes: number; failures: number; rate_limited: number; quota_exhausted: boolean };
const PROVIDER_STATS: Record<string, ProviderStat> = {};

function trackProvider(host: string, outcome: "success" | "failure" | "rate_limit" | "quota") {
  if (!PROVIDER_STATS[host]) {
    PROVIDER_STATS[host] = { calls: 0, successes: 0, failures: 0, rate_limited: 0, quota_exhausted: false };
  }
  PROVIDER_STATS[host].calls++;
  if (outcome === "success")     PROVIDER_STATS[host].successes++;
  else if (outcome === "rate_limit") PROVIDER_STATS[host].rate_limited++;
  else if (outcome === "quota")  { PROVIDER_STATS[host].quota_exhausted = true; PROVIDER_STATS[host].failures++; }
  else                           PROVIDER_STATS[host].failures++;
}

/** Per-field update tracking (across the whole run) */
const FIELD_STATS: Record<string, number> = {};   // key = "table.field" → count of updates

function trackFieldUpdates(table: string, patch: Record<string, any>) {
  const skip = new Set(["updated_at", "last_enriched_at", "needs_review"]);
  for (const field of Object.keys(patch)) {
    if (skip.has(field)) continue;
    const key = `${table}.${field}`;
    FIELD_STATS[key] = (FIELD_STATS[key] ?? 0) + 1;
  }
}

/** Per-phase attempt/update/error counters */
type PhaseStat = { attempted: number; updated: number; skipped: number; errors: number };
const PHASE_STATS: Record<string, PhaseStat> = {};

const RUN_START = Date.now();

// ---------------------------------------------------------------------------
// Supabase REST helpers
// ---------------------------------------------------------------------------

const SB_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function sbQuery<T = any>(
  table: string,
  query: string,
  options?: { head?: boolean; count?: boolean }
): Promise<{ data: T[]; count: number | null; error: string | null }> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${query}`;
  const headers: Record<string, string> = { ...SB_HEADERS };
  if (options?.head) headers["Prefer"] = "count=exact";
  if (options?.count) headers["Prefer"] = "count=exact";
  const method = options?.head ? "HEAD" : "GET";
  const res = await fetch(url, { method, headers });
  if (!res.ok) {
    const text = await res.text();
    return { data: [], count: null, error: text };
  }
  const count = res.headers.get("content-range")?.match(/\/(\d+)/)?.[1];
  const data = options?.head ? [] : await res.json();
  return { data, count: count ? parseInt(count, 10) : null, error: null };
}

async function sbUpdate(
  table: string,
  id: string,
  patch: Record<string, any>
): Promise<boolean> {
  let effectivePatch = patch;
  if (table === "firm_records") {
    effectivePatch = (await augmentFirmRecordsPatchWithFetch(
      SUPABASE_URL,
      SB_HEADERS,
      id,
      patch,
      "enrich_all",
    )) as Record<string, any>;
  }

  // Always track what fields are being set (for post-run audit)
  trackFieldUpdates(table, effectivePatch);

  if (DRY_RUN) {
    // Fetch current record to show a proper before → after diff
    try {
      const cur = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}&select=*&limit=1`, {
        headers: SB_HEADERS,
      });
      const rows = cur.ok ? await cur.json() : [];
      const before: Record<string, any> = rows[0] ?? {};
      const skip = new Set(["updated_at", "last_enriched_at", "needs_review"]);
      const meaningful = Object.entries(effectivePatch).filter(([k]) => !skip.has(k));
      if (meaningful.length > 0) {
        console.log(`    [DRY RUN] ${table} id=${id.slice(0, 8)}...`);
        for (const [k, v] of meaningful) {
          const was = before[k] != null ? JSON.stringify(before[k]).slice(0, 80) : "null";
          const willBe = JSON.stringify(v).slice(0, 80);
          console.log(`      ${k}: ${was} → ${willBe}`);
        }
      }
    } catch {
      console.log(`    [DRY RUN] Would update ${table}.${id}:`, Object.keys(effectivePatch).join(", "));
    }
    return true;
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...SB_HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(effectivePatch),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.warn(`    ✗ DB write FAILED for ${table}.${id} (HTTP ${res.status}): ${errBody.slice(0, 200)}`);
    return false;
  }
  return true;
}

async function sbUpsert(
  table: string,
  data: Record<string, any>,
  onConflict?: string
): Promise<boolean> {
  if (DRY_RUN) {
    console.log(`    [DRY RUN] Would upsert into ${table} (conflict on: ${onConflict ?? "none"}):`, JSON.stringify(data).slice(0, 200));
    return true;
  }
  // PostgREST requires the conflict columns as a query param AND the Prefer header
  // Without ?on_conflict= the merge-duplicates preference is ignored and inserts fail on constraint violation
  const conflictParam = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
  const prefer = onConflict ? `resolution=merge-duplicates,return=minimal` : "return=minimal";
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${conflictParam}`, {
    method: "POST",
    headers: { ...SB_HEADERS, Prefer: prefer },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.warn(`    ✗ sbUpsert FAILED for ${table} (HTTP ${res.status}): ${errBody.slice(0, 200)}`);
  }
  return res.ok;
}

/**
 * Bulk upsert: sends a single POST with an array of rows instead of one call per row.
 * This collapses N individual round-trips into a single PostgREST call, dramatically
 * reducing write IO on high-churn tables like firm_investors.
 */
async function sbBulkUpsert(
  table: string,
  rows: Record<string, any>[],
  onConflict?: string
): Promise<boolean> {
  if (!rows.length) return true;
  if (DRY_RUN) {
    console.log(`    [DRY RUN] Would bulk-upsert ${rows.length} rows into ${table} (conflict on: ${onConflict ?? "none"})`);
    return true;
  }
  const conflictParam = onConflict ? `?on_conflict=${encodeURIComponent(onConflict)}` : "";
  const prefer = onConflict ? `resolution=merge-duplicates,return=minimal` : "return=minimal";
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${conflictParam}`, {
    method: "POST",
    headers: { ...SB_HEADERS, Prefer: prefer },
    body: JSON.stringify(rows),  // array → PostgREST bulk insert in one roundtrip
  });
  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    console.warn(`    ✗ sbBulkUpsert FAILED for ${table} ${rows.length} rows (HTTP ${res.status}): ${errBody.slice(0, 200)}`);
  }
  return res.ok;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Lowercase normalized company key for firm_recent_deals upserts (aligns with portfolio pipeline). */
function normalizePortfolioCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[''`´]/g, "")
    .replace(/[^a-z0-9\s&+]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type FirmWebsitePortfolioUpsert = {
  firm_id: string;
  company_name: string;
  normalized_company_name: string;
  source_name: string;
  source_url: string | null;
  source_confidence: number;
  investment_status: string;
  stage: string | null;
  updated_at: string;
};

/** Upserts portfolio names scraped from the firm's own site (does not replace Signal/CBI rows). */
async function upsertWebsitePortfolioCompanies(
  firmId: string,
  names: string[],
  websiteUrl: string | null
): Promise<number> {
  const now = new Date().toISOString();
  const rows: FirmWebsitePortfolioUpsert[] = [];
  const seen = new Set<string>();
  for (const raw of names.slice(0, 60)) {
    const company_name = String(raw ?? "").trim();
    if (company_name.length < 2) continue;
    const normalized_company_name = normalizePortfolioCompanyName(company_name);
    if (!normalized_company_name) continue;
    const dedupe = `${firmId}:${normalized_company_name}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    rows.push({
      firm_id: firmId,
      company_name,
      normalized_company_name,
      source_name: "firm_website",
      source_url: websiteUrl?.trim() || null,
      source_confidence: 0.65,
      investment_status: "unknown",
      stage: "Portfolio (website)",
      updated_at: now,
    });
  }
  if (!rows.length) return 0;
  const ok = await sbBulkUpsert(
    "firm_recent_deals",
    rows as unknown as Record<string, any>[],
    "firm_id,normalized_company_name"
  );
  return ok ? rows.length : 0;
}

function domainFromUrl(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.trim().startsWith("http") ? raw.trim() : `https://${raw.trim()}`);
    const host = url.hostname.replace(/^www\./i, "");
    if (!host || !host.includes(".")) return null;
    const blocked = new Set([
      "linkedin.com", "twitter.com", "x.com", "facebook.com",
      "instagram.com", "youtube.com", "linktr.ee", "notion.site",
      "crunchbase.com", "angel.co", "tracxn.com", "pitchbook.com",
      "dealroom.co", "cbinsights.com", "signal.nfx.com", "wellfound.com",
      "f6s.com", "golden.com", "owler.com",
    ]);
    if (blocked.has(host) || host.endsWith(".linkedin.com")) return null;
    return host;
  } catch {
    return null;
  }
}

async function jsonFetch<T>(url: string, options: RequestInit = {}, trackingHost?: string): Promise<T | null> {
  let apiHost = trackingHost || "";
  if (!apiHost) {
    try {
      apiHost = new URL(url).hostname;
    } catch {
      apiHost = url.slice(0, 40);
    }
  }

  // Skip if this provider already hit quota or is in cooldown
  if (QUOTA_EXHAUSTED.has(apiHost)) return null;
  const coolUntil = RATE_LIMIT_COOLDOWN.get(apiHost);
  if (coolUntil && Date.now() < coolUntil) return null;

  try {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const msg = body.slice(0, 200).replace(/<[^>]+>/g, "");

      // ── Permanent exhaustion: billing / credits / quota gone ──
      // 402 = payment required, 422/401/403 with credit/billing/quota/plan language = exhausted
      const isBillingError =
        res.status === 402 ||
        (res.status === 422 && /credit|insufficient|billing|upgrade|plan/i.test(msg)) ||
        (res.status === 401 && /quota|exceeded|billing|plan|credit/i.test(msg)) ||
        (res.status === 403 && /upgrade|plan|not accessible|free plan/i.test(msg));

      if (isBillingError) {
        console.warn(`    ⊘ ${apiHost} → credits/quota exhausted (HTTP ${res.status}) — disabled for this run`);
        QUOTA_EXHAUSTED.add(apiHost);
        trackProvider(apiHost, "quota");
        return null;
      }

      // ── Deprecated / gone endpoints ──
      if (res.status === 404 || res.status === 410) {
        console.warn(`    ⊘ ${apiHost} → HTTP ${res.status} (endpoint unavailable) — disabled`);
        QUOTA_EXHAUSTED.add(apiHost);
        trackProvider(apiHost, "quota");
        return null;
      }

      // ── Temporary rate limit (429): put in cooldown, skip for now, auto-retry next firm ──
      if (res.status === 429) {
        const retryAfterSec = parseInt(res.headers.get("retry-after") || "0", 10);
        // Honour retry-after if given, otherwise use default cooldown
        const coolMs = retryAfterSec > 0 ? retryAfterSec * 1000 : RATE_LIMIT_COOLDOWN_MS;
        RATE_LIMIT_COOLDOWN.set(apiHost, Date.now() + coolMs);
        console.warn(`    ⚠ ${apiHost} → rate limited — cooling down for ${Math.round(coolMs / 1000)}s`);
        trackProvider(apiHost, "rate_limit");
        return null;
      }

      console.warn(`    ⚠ ${apiHost} → HTTP ${res.status}: ${msg.slice(0, 150)}`);
      trackProvider(apiHost, "failure");
      return null;
    }
    trackProvider(apiHost, "success");
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`    ⚠ ${apiHost} → ${e instanceof Error ? e.message : String(e)}`);
    trackProvider(apiHost, "failure");
    return null;
  }
}

function isAvailable(host: string): boolean {
  if (QUOTA_EXHAUSTED.has(host) || SKIP_PROVIDERS.has(host)) return false;
  const coolUntil = RATE_LIMIT_COOLDOWN.get(host);
  if (coolUntil && Date.now() < coolUntil) return false;
  return true;
}

// Valid enum values (must match Supabase schema exactly)
const VALID_STAGE_FOCUS = ["Friends and Family", "Pre-Seed", "Seed", "Series A", "Series B+", "Growth"] as const;
const VALID_ENTITY_TYPE = ["Institutional", "Micro", "Solo GP", "Angel", "Corporate (CVC)", "Family Office", "Accelerator / Studio", "Syndicate", "Fund of Funds"] as const;
const VALID_THESIS_ORIENTATION = ["Generalist", "Sector-Focused", "Thesis-Driven", "Founder-First", "Geographic", "Operator-led"] as const;
const VALID_SECTOR_SCOPE = ["Generalist", "Specialized"] as const;
const VALID_US_REGION = ["West", "East", "South", "Midwest", "Southwest", "Southeast", "Northeast", "Northwest", "International"] as const;

function toValidStages(arr: any[]): string[] {
  return (arr || []).filter((s: any) => VALID_STAGE_FOCUS.includes(s));
}

type FirmRow = {
  id: string;
  firm_name: string;
  website_url: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  description: string | null;
  elevator_pitch: string | null;
  founded_year: number | null;
  total_headcount: number | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_country: string | null;
  hq_region: string | null;
  crunchbase_url: string | null;
  angellist_url: string | null;
  aum: string | null;
  min_check_size: number | null;
  max_check_size: number | null;
  logo_url: string | null;
  last_enriched_at: string | null;
  // New fields
  firm_type: string | null;
  entity_type: string | null;
  thesis_verticals: string[] | null;
  stage_focus: string[] | null;
  stage_min: string | null;
  stage_max: string | null;
  sector_scope: string | null;
  thesis_orientation: string | null;
  geo_focus: string[] | null;
  is_actively_deploying: boolean | null;
};

type InvestorRow = {
  id: string;
  firm_id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  email: string | null;
  bio: string | null;
  avatar_url: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  medium_url: string | null;
  substack_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  sector_focus: string[] | null;
  stage_focus: string[] | null;
  personal_thesis_tags: string[] | null;
  education_summary: string | null;
  background_summary: string | null;
  /** jsonb array of { company, ... } — optional on select */
  past_investments: unknown[] | null;
  investment_style: string | null;
  check_size_min: number | null;
  check_size_max: number | null;
  needs_review: boolean;
  // Embedded via PostgREST join (only populated in Phase 5 query)
  firm_records?: { website_url: string | null } | null;
};

type EnrichPatch = Record<string, any>;

// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║ PHASE 1: Firm Profile Enrichment (Apollo / Clay / Explorium)              ║
// ╚═════════════════════════════════════════════════════════════════════════════╝

// ---------------------------------------------------------------------------
// Phase 1 providers: Exa neural search + Jina website scrape + Gemini extraction
// These use working API keys (Apollo/Clay/Explorium are deprecated/out of credits)
// ---------------------------------------------------------------------------

async function enrichFirmWithExa(firmName: string, domain: string | null): Promise<string> {
  if (!EXA_KEY) return "";
  const domainHint = domain ? ` site:${domain}` : "";
  const data = await jsonFetch<any>("https://api.exa.ai/search", {
    method: "POST",
    headers: { "x-api-key": EXA_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `${firmName} venture capital firm profile headquarters AUM fund size partners${domainHint}`,
      type: "auto",
      numResults: 5,
      contents: { text: { maxCharacters: 3000 } },
    }),
  });

  const results = data?.results || [];
  return results
    .map((r: any) => `[${r.title}] (${r.url})\n${(r.text || "").slice(0, 2000)}`)
    .join("\n\n---\n\n");
}

async function enrichFirmWithPerplexity(firmName: string, domain: string | null): Promise<string> {
  if (!PERPLEXITY_KEY) return "";
  const domainHint = domain ? ` (${domain})` : "";
  const data = await jsonFetch<any>("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${PERPLEXITY_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [{
        role: "user",
        content: `Research the venture capital firm "${firmName}"${domainHint}. Provide detailed facts about: their investment focus (stages: pre-seed/seed/series A/B/growth), sector verticals they invest in (e.g. fintech, SaaS, healthcare, AI, climate), their fund size and AUM, typical check size range, headquarters location (city, state, country), their general partners and managing partners by name, website URL, LinkedIn company page, X/Twitter handle, Crunchbase profile, founding year, firm type (VC/CVC/accelerator/family office/micro fund), and whether they are actively deploying capital right now. Be specific and factual.`,
      }],
    }),
  });
  return data?.choices?.[0]?.message?.content || "";
}

async function enrichFirmWithTavily(firmName: string, domain: string | null): Promise<string> {
  if (!TAVILY_KEY) return "";
  const domainHint = domain ? ` ${domain}` : "";
  const data = await jsonFetch<any>("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: TAVILY_KEY,
      query: `${firmName}${domainHint} venture capital AUM fund size headquarters general partners check size`,
      search_depth: "advanced",
      max_results: 5,
      include_answer: true,
    }),
  });

  const parts: string[] = [];
  if (data?.answer) parts.push(`[Tavily Summary]\n${data.answer}`);
  for (const r of data?.results || []) {
    parts.push(`[${r.title}] (${r.url})\n${(r.content || "").slice(0, 1500)}`);
  }
  return parts.join("\n\n---\n\n");
}

async function enrichFirmWithLinkup(firmName: string): Promise<string> {
  if (!LINKUP_KEY) return "";
  const data = await jsonFetch<any>("https://api.linkup.so/v1/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${LINKUP_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      q: `${firmName} venture capital firm profile AUM partners`,
      depth: "standard",
      outputType: "searchResults",
    }),
  });

  const results = data?.results || [];
  return results
    .map((r: any) => `[${r.name}] (${r.url})\n${(r.content || "").slice(0, 1500)}`)
    .join("\n\n---\n\n");
}

async function scrapeWebsiteWithJina(url: string): Promise<string> {
  if (!JINA_KEY) return "";
  const host = "r.jina.ai";
  if (!isAvailable(host)) return "";
  try {
    const res = await fetch(`https://${host}/${url}`, {
      headers: {
        Authorization: `Bearer ${JINA_KEY}`,
        Accept: "text/markdown",
        "X-Return-Format": "markdown",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      trackProvider(host, "success");
      const text = await res.text();
      return text.slice(0, 8000);
    }
    trackProvider(host, "failure");
    console.warn(`    ⚠ Jina → HTTP ${res.status}`);
  } catch (e) {
    trackProvider(host, "failure");
    console.warn(`    ⚠ Jina → ${e instanceof Error ? e.message : e}`);
  }
  return "";
}

// ---------------------------------------------------------------------------
// ScrapingBee — JS-rendered page fetch (SCRAPING_BEE_API_KEY / SCRAPINGBEE_API_KEY)
// Preferred over raw fetch for JS-heavy team pages and firm websites.
// ---------------------------------------------------------------------------

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 30_000);
}

async function scrapeWithScrapingBee(url: string): Promise<string> {
  if (!SCRAPINGBEE_KEY) return "";
  const host = "app.scrapingbee.com";
  if (!isAvailable(host)) return "";

  const params = new URLSearchParams({
    api_key: SCRAPINGBEE_KEY,
    url,
    render_js: "true",
    block_ads: "true",
    block_resources: "false",
  });

  try {
    const res = await fetch(`https://${host}/api/v1/?${params}`, {
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 402 || res.status === 429) {
        const outcome = res.status === 429 ? "rate_limit" : "quota";
        trackProvider(host, outcome);
        if (res.status === 429) RATE_LIMIT_COOLDOWN.set(host, Date.now() + RATE_LIMIT_COOLDOWN_MS);
        else QUOTA_EXHAUSTED.add(host);
        console.warn(`    ⚠ ScrapingBee → HTTP ${res.status}`);
      } else {
        trackProvider(host, "failure");
        console.warn(`    ⚠ ScrapingBee → HTTP ${res.status}: ${body.slice(0, 120)}`);
      }
      return "";
    }

    const html = await res.text();
    if (!html) { trackProvider(host, "failure"); return ""; }
    trackProvider(host, "success");
    return stripHtmlToText(html);
  } catch (e) {
    trackProvider(host, "failure");
    console.warn(`    ⚠ ScrapingBee → ${e instanceof Error ? e.message : e}`);
    return "";
  }
}

// ---------------------------------------------------------------------------
// Firecrawl — structured markdown scraping and async crawl
// FIRECRAWL_SCRAPE: single page, synchronous, returns markdown immediately.
// FIRECRAWL_CRAWL:  multi-page async job (about/team/portfolio), polled up to 15s.
//                   Only triggered when single-page fetch is thin (< CRAWL_THRESHOLD chars).
// ---------------------------------------------------------------------------

const FIRECRAWL_HOST = "api.firecrawl.dev";

/** Single-page Firecrawl scrape — synchronous, cheapest option (1 credit). */
async function firecrawlScrape(url: string): Promise<string> {
  if (!FIRECRAWL_KEY || !isAvailable(FIRECRAWL_HOST)) return "";
  const data = await jsonFetch<any>("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${FIRECRAWL_KEY}` },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
      onlyMainContent: true,
    }),
  });
  return (data?.data?.markdown || data?.markdown || "").slice(0, 15_000);
}

/**
 * Multi-page Firecrawl crawl — async job targeting About/Team/Portfolio subpages.
 * Only call this when single-page results are thin (< CRAWL_THRESHOLD chars).
 * Polls every 3s up to 5 attempts (15s max); takes partial results if still running.
 * Cost: up to `maxPages` credits.
 */
async function firecrawlCrawl(url: string, maxPages = 4): Promise<string> {
  if (!FIRECRAWL_KEY || !isAvailable(FIRECRAWL_HOST)) return "";

  // Start the async crawl job
  const job = await jsonFetch<any>("https://api.firecrawl.dev/v1/crawl", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${FIRECRAWL_KEY}` },
    body: JSON.stringify({
      url,
      limit: maxPages,
      includePaths: ["about", "team", "partners", "portfolio", "contact", "who-we-are", "our-story", "people"],
      scrapeOptions: { formats: ["markdown"], onlyMainContent: true },
    }),
  });

  if (!job?.id) return "";
  const jobId = job.id as string;

  // Poll for completion — 5 attempts × 3s = 15s max wait per firm
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(3_000);
    try {
      const res = await fetch(`https://api.firecrawl.dev/v1/crawl/${jobId}`, {
        headers: { Authorization: `Bearer ${FIRECRAWL_KEY}` },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) break;
      const status = await res.json();
      const pages: any[] = status?.data ?? [];
      if (pages.length > 0) {
        const combined = pages
          .map((p: any) => {
            const title = p.metadata?.title || p.url || "";
            const md = p.markdown || "";
            return title ? `## ${title}\n${md}` : md;
          })
          .join("\n\n---\n\n");
        // Return on completion OR when we have enough pages
        if (status?.status === "completed" || pages.length >= maxPages) {
          return combined.slice(0, 20_000);
        }
      }
    } catch {
      break;
    }
  }

  return "";
}

// ---------------------------------------------------------------------------
// Exa REST helpers — search/discovery layer (not MCP; uses REST API directly)
// NOTE: Exa MCP is only available in interactive Claude sessions, not Node scripts.
//       These helpers call https://api.exa.ai/search directly using EXA_API_KEY.
// ---------------------------------------------------------------------------

interface ExaResult { url: string; title: string; text?: string }

/** Core Exa search — returns raw result array for callers to interpret. */
async function exaSearch(
  query: string,
  opts: { numResults?: number; type?: "neural" | "keyword" | "auto"; includeText?: boolean } = {}
): Promise<ExaResult[]> {
  if (!EXA_KEY || !isAvailable("api.exa.ai")) return [];
  const data = await jsonFetch<any>("https://api.exa.ai/search", {
    method: "POST",
    headers: { "x-api-key": EXA_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      type: opts.type ?? "auto",
      numResults: opts.numResults ?? 5,
      contents: opts.includeText ? { text: { maxCharacters: 2000 } } : undefined,
    }),
  });
  return data?.results ?? [];
}

/**
 * Exa: discover official website_url and/or linkedin_url for a firm.
 * Called when both are missing from the DB record.
 */
async function discoverFirmUrlsWithExa(
  firmName: string
): Promise<{ website_url: string | null; linkedin_url: string | null }> {
  const results = await exaSearch(`"${firmName}" venture capital official website`, { numResults: 6, type: "neural" });

  let website_url: string | null = null;
  let linkedin_url: string | null = null;

  for (const r of results) {
    const url = (r.url || "").split("?")[0];
    if (!linkedin_url && url.includes("linkedin.com/company/")) {
      linkedin_url = url;
    } else if (!website_url) {
      const domain = domainFromUrl(url);
      if (domain) website_url = url.startsWith("http") ? url : `https://${url}`;
    }
    if (website_url && linkedin_url) break;
  }

  return { website_url, linkedin_url };
}

/**
 * Exa: find team/people/about page URL for a firm.
 * More reliable than HEAD-probing common URL suffixes.
 */
async function discoverTeamPageWithExa(firmName: string, domain: string | null): Promise<string | null> {
  const domainHint = domain ? ` site:${domain}` : "";
  const results = await exaSearch(
    `${firmName} venture capital team partners people page${domainHint}`,
    { numResults: 4, type: "neural" }
  );

  for (const r of results) {
    const url = r.url || "";
    if (/\/(team|people|about|partners|who-we-are|our-team|leadership)/i.test(url)) return url;
  }
  // Fallback: first result that lives on the firm's own domain
  if (domain) {
    const onDomain = results.find(r => (r.url || "").includes(domain));
    if (onDomain) return onDomain.url;
  }
  return null;
}

type FirmAiExtract = { patch: EnrichPatch; portfolioNames: string[] };

async function extractFirmDataWithAI(
  firmName: string,
  searchText: string,
  websiteText: string,
  firm: FirmRow
): Promise<[EnrichPatch, string, string[]]> {
  const emptyFields: string[] = [];

  // Core identity
  if (!firm.description) emptyFields.push("description (2-3 sentence summary of what this firm invests in)");
  if (!firm.elevator_pitch) emptyFields.push("elevator_pitch (1 concise sentence)");
  if (!firm.firm_type)
    emptyFields.push(
      `firm_type (e.g. Institutional, Corporate/CVC, Solo GP, Micro VC, Family office, Public, Accelerator, Venture studio — plus legacy: VC, Angel network, Micro fund, PE, Other)`,
    );
  if (!firm.entity_type) emptyFields.push(`entity_type (one of: ${VALID_ENTITY_TYPE.join(", ")})`);

  // Contact / web presence
  if (!firm.website_url) emptyFields.push("website_url (full URL starting with https://)");
  if (!firm.linkedin_url) emptyFields.push("linkedin_url (full LinkedIn company URL)");
  if (!firm.x_url) emptyFields.push("x_url (full X/Twitter URL, e.g. https://x.com/handle)");
  if (!firm.crunchbase_url) emptyFields.push("crunchbase_url (full Crunchbase URL)");
  if (!firm.email) emptyFields.push("email (general contact or info@ email)");
  if (!firm.phone) emptyFields.push("phone (main contact phone number)");
  if (!firm.logo_url) emptyFields.push("logo_url (direct URL to firm logo image)");

  // Location
  if (!firm.hq_city) emptyFields.push("hq_city");
  if (!firm.hq_state) emptyFields.push("hq_state (US state abbreviation or full name)");
  if (!firm.hq_country) emptyFields.push("hq_country");
  if (!firm.hq_region) emptyFields.push(`hq_region (one of: ${VALID_US_REGION.join(", ")})`);

  // Investment profile
  if (!firm.aum) emptyFields.push("aum (Assets Under Management, e.g. '$500M' or '$1.2B' — use null if unknown)");
  if (!firm.min_check_size) emptyFields.push("min_check_size (minimum investment in USD as integer, e.g. 100000)");
  if (!firm.max_check_size) emptyFields.push("max_check_size (maximum investment in USD as integer, e.g. 5000000)");
  if (!firm.stage_focus?.length) emptyFields.push(`stage_focus (JSON array of stages they invest in — ONLY use values from: ${VALID_STAGE_FOCUS.join(", ")})`);
  if (!firm.stage_min) emptyFields.push(`stage_min (earliest stage they invest — ONLY use: ${VALID_STAGE_FOCUS.join(", ")})`);
  if (!firm.stage_max) emptyFields.push(`stage_max (latest stage they invest — ONLY use: ${VALID_STAGE_FOCUS.join(", ")})`);
  if (!firm.thesis_verticals?.length) {
    emptyFields.push(
      "thesis_verticals (JSON array of sectors/themes stated on the firm's site or in === FIRM WEBSITE === — short labels like \"Climate Tech\", \"Enterprise SaaS\", \"Fintech\", \"Healthcare\", \"AI/ML\", \"Deep Tech\", \"Consumer\"; prefer nav/hero/thesis copy over generic guesses)",
    );
  }
  if (!firm.sector_scope) emptyFields.push(`sector_scope (one of: ${VALID_SECTOR_SCOPE.join(", ")})`);
  if (!firm.thesis_orientation) emptyFields.push(`thesis_orientation (one of: ${VALID_THESIS_ORIENTATION.join(", ")})`);
  if (!firm.geo_focus?.length) emptyFields.push("geo_focus (JSON array of geographies they invest in, e.g. [\"US\", \"Latin America\", \"Global\"])");
  if (firm.is_actively_deploying === null) emptyFields.push("is_actively_deploying (boolean — true if actively investing now, false if not)");

  // Team basics — prefer roster size from Team/People content when present in === FIRM WEBSITE ===
  if (!firm.total_headcount) {
    emptyFields.push(
      "total_headcount (integer: when === FIRM WEBSITE === lists investment-team people with names, return the count of distinct people on that roster; if the site only states a single total headcount/team-size number with no roster, use that; use null if ambiguous or unknown — do not guess)",
    );
  }
  if (!firm.founded_year) emptyFields.push("founded_year (4-digit integer year the firm was founded)");

  const wantsWebsitePortfolio = websiteText.length >= 400;
  if (emptyFields.length === 0 && !wantsWebsitePortfolio) {
    return [{}, "SKIPPED_ALL_POPULATED", []];
  }
  if (wantsWebsitePortfolio && !emptyFields.some((f) => f.startsWith("website_portfolio_companies"))) {
    emptyFields.push(
      "website_portfolio_companies (JSON array of distinct portfolio company names explicitly listed on the firm's website in === FIRM WEBSITE === — logo grids, /portfolio, \"companies we back\"; exclude press headlines and the VC's own brand; use [] if none)",
    );
  }

  if (emptyFields.length === 0) {
    return [{}, "SKIPPED_ALL_POPULATED", []];
  }

  const combined = [
    websiteText ? `=== FIRM WEBSITE ===\n${websiteText}` : "",
    searchText ? `=== WEB RESEARCH ===\n${searchText}` : "",
  ].filter(Boolean).join("\n\n");

  if (!combined || combined.length < 50) return [{}, "SKIPPED_NO_INPUT", []];

  // Sanitizes raw AI JSON: firm_records patch + website portfolio names (separate table)
  function sanitizeFirmExtract(parsed: Record<string, any>): FirmAiExtract {
    const patch: EnrichPatch = {};
    const portfolioNames: string[] = [];
    for (const [k, v] of Object.entries(parsed)) {
      if (v == null || v === "" || v === "null" || v === "unknown") continue;

      if (k === "website_portfolio_companies") {
        const arr = Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
        for (const s of arr) {
          if (typeof s !== "string") continue;
          const t = s.trim();
          if (t.length > 1 && t.length < 120) portfolioNames.push(t);
        }
        continue;
      }

      // Skip already-populated fields
      const existing = (firm as any)[k];
      if (existing != null && (Array.isArray(existing) ? existing.length > 0 : true)) continue;

      // Enum validation
      if (k === "stage_focus") {
        const valid = toValidStages(Array.isArray(v) ? v : [v]);
        if (valid.length) patch[k] = valid;
        continue;
      }
      if (k === "stage_min" || k === "stage_max") {
        if (VALID_STAGE_FOCUS.includes(v as any)) patch[k] = v;
        continue;
      }
      if (k === "entity_type") {
        if (VALID_ENTITY_TYPE.includes(v as any)) patch[k] = v;
        continue;
      }
      if (k === "thesis_orientation") {
        if (VALID_THESIS_ORIENTATION.includes(v as any)) patch[k] = v;
        continue;
      }
      if (k === "sector_scope") {
        if (VALID_SECTOR_SCOPE.includes(v as any)) patch[k] = v;
        continue;
      }
      if (k === "hq_region") {
        if (VALID_US_REGION.includes(v as any)) patch[k] = v;
        continue;
      }
      // Array fields
      if (k === "thesis_verticals" || k === "geo_focus") {
        const arr = Array.isArray(v) ? v : [v];
        const clean = arr.filter((s: any) => typeof s === "string" && s.trim()).map((s: string) => s.trim());
        if (clean.length) patch[k] = clean;
        continue;
      }
      // Integer fields
      if (k === "min_check_size" || k === "max_check_size" || k === "total_headcount" || k === "founded_year") {
        const n = typeof v === "number" ? v : parseInt(String(v).replace(/[^0-9]/g, ""), 10);
        if (!isNaN(n) && n > 0) patch[k] = n;
        continue;
      }
      // Boolean fields
      if (k === "is_actively_deploying") {
        if (typeof v === "boolean") patch[k] = v;
        else if (v === "true") patch[k] = true;
        else if (v === "false") patch[k] = false;
        continue;
      }
      // String fields — just store as-is
      patch[k] = v;
    }
    return { patch, portfolioNames };
  }

  const prompt = `Extract data about the VC firm "${firmName}" from the sources below.

Return ONLY a valid JSON object with EXACTLY these fields (use null for any field you cannot confidently determine from the sources):

${emptyFields.map((f) => `- ${f}`).join("\n")}

STRICT RULES:
- Only include fields listed above
- Use null if uncertain — never guess or hallucinate
- For enum fields, use ONLY the exact values shown — do not invent new values
- For array fields (stage_focus, thesis_verticals, geo_focus, website_portfolio_companies), return a JSON array even if only one item
- For check sizes and headcount: integer only, no $ symbols or commas
- For URLs: full URL starting with https://
- For stage_focus: only use exact values from the allowed list
- For website_portfolio_companies: only companies shown as investments/portfolio on the firm's own site content — not news articles

Sources:
${combined.slice(0, 12_000)}`;

  // Helper: call Groq with a specific model tracked under its own virtual host key
  async function tryGroq(model: string, trackHost: string): Promise<FirmAiExtract | null> {
    if (!GROQ_KEY || !isAvailable(trackHost)) return null;
    const label = model.includes("70b") ? "GROQ_70B" : "GROQ_8B";
    console.log(`    → [${label}_EXTRACT] trying ${model}...`);
    try {
      const data = await jsonFetch<any>(
        `https://api.groq.com/openai/v1/chat/completions`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: "You extract structured data about VC firms. Return only valid JSON with the requested fields. Use null for unknown values." },
              { role: "user", content: prompt },
            ],
            response_format: { type: "json_object" },
            temperature: 0.1,
          }),
        },
        trackHost, // use per-model tracking key so 70b and 8b cool down independently
      );
      const content = data?.choices?.[0]?.message?.content;
      if (content) {
        console.log(`    ✓ [${label}_EXTRACT] succeeded`);
        const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        const parsed = JSON.parse(cleaned);
        return sanitizeFirmExtract(parsed);
      }
      console.log(`    ↷ [${label}_EXTRACT] → no content in response`);
    } catch (e) {
      console.warn(`    ✗ [${label}_EXTRACT] failed: ${e instanceof Error ? e.message : e}`);
    }
    return null;
  }

  // Helper: call Gemini for structured extraction; tracked per model under distinct virtual hosts
  async function tryGemini(model: string, apiKey: string, trackHost: string): Promise<FirmAiExtract | null> {
    if (!apiKey || !isAvailable(trackHost)) return null;
    const label = model.includes("2.5") ? "GEMINI_25" : "GEMINI_20";
    console.log(`    → [${label}_EXTRACT] trying ${model}...`);
    try {
      const data = await jsonFetch<any>(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
          }),
        },
        trackHost,
      );
      const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) {
        console.log(`    ✓ [${label}_EXTRACT] succeeded`);
        return sanitizeFirmExtract(JSON.parse(content.trim()));
      }
      console.log(`    ↷ [${label}_EXTRACT] → no content in response`);
    } catch (e) {
      console.warn(`    ✗ [${label}_EXTRACT] failed: ${e instanceof Error ? e.message : e}`);
    }
    return null;
  }

  // Waterfall: Gemini 2.5 Flash → Groq 70b → Groq 8b → Gemini 2.0 → Perplexity (last resort)
  // Each step returns [patch, providerLabel, portfolioNames] so callers know who actually extracted.
  // NOTE: "gemini-2.5-flash" is the stable model name (preview suffix was dropped in 2025).
  {
    const result = await tryGemini("gemini-2.5-flash", GEMINI_25_KEY, "generativelanguage.googleapis.com/2.5");
    if (result) return [result.patch, "GEMINI_25", result.portfolioNames];
  }
  {
    const result = await tryGroq("llama-3.3-70b-versatile", "api.groq.com/70b");
    if (result) return [result.patch, "GROQ_70B", result.portfolioNames];
  }
  {
    const result = await tryGroq("llama-3.1-8b-instant", "api.groq.com/8b");
    if (result) return [result.patch, "GROQ_8B", result.portfolioNames];
  }
  // Gemini 2.0 Flash — fallback if 2.5 returned 404/rate-limit
  {
    const result = await tryGemini("gemini-2.0-flash", GEMINI_KEY, "generativelanguage.googleapis.com/2.0");
    if (result) return [result.patch, "GEMINI_20", result.portfolioNames];
  }
  // Perplexity last resort — quota-sensitive, only fires if all above are exhausted
  if (PERPLEXITY_KEY && isAvailable("api.perplexity.ai")) {
    console.log(`    → [PERPLEXITY_EXTRACT] trying sonar-pro...`);
    try {
      const data = await jsonFetch<any>("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${PERPLEXITY_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "sonar-pro",
          messages: [
            { role: "system", content: "You extract structured data about VC firms and return only valid JSON. Use null for any field you cannot confidently determine." },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
        }),
      });
      const content = data?.choices?.[0]?.message?.content;
      if (content) {
        const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          console.log(`    ✓ [PERPLEXITY_EXTRACT] succeeded`);
          const r = sanitizeFirmExtract(JSON.parse(jsonMatch[0]));
          return [r.patch, "PERPLEXITY", r.portfolioNames];
        }
      }
      console.log(`    ↷ [PERPLEXITY_EXTRACT] → no parseable JSON in response`);
    } catch (e) {
      console.warn(`    ✗ [PERPLEXITY_EXTRACT] failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  return [{}, "NONE", []];
}

async function phase1_firmProfiles(): Promise<{ enriched: number; errors: number }> {
  console.log("\n╔═══════════════════════════════════════════════════════════════════════╗");
  console.log("║  PHASE 1: Firm Profile Enrichment                                     ║");
  console.log("║  Search : Exa (primary) → Tavily (fallback if thin)                  ║");
  console.log("║  Fetch  : ScrapingBee → Firecrawl scrape → Firecrawl crawl (deep)    ║");
  console.log("║  Extract: Gemini 2.5 → Groq 70b → Groq 8b → Gemini 2.0              ║");
  console.log("╚═══════════════════════════════════════════════════════════════════════╝\n");

  const staleDate = new Date(Date.now() - STALE_DAYS * 86400_000).toISOString();
  const staleFilter = STALE_DAYS === 0
    ? ""
    : `&or=(last_enriched_at.is.null,last_enriched_at.lt.${staleDate})`;

  const { data: firms, error } = await sbQuery<FirmRow>(
    "firm_records",
    `select=id,firm_name,website_url,email,phone,linkedin_url,x_url,description,elevator_pitch,founded_year,total_headcount,hq_city,hq_state,hq_country,hq_region,crunchbase_url,angellist_url,aum,min_check_size,max_check_size,logo_url,last_enriched_at,firm_type,entity_type,thesis_verticals,stage_focus,stage_min,stage_max,sector_scope,thesis_orientation,geo_focus,is_actively_deploying&deleted_at=is.null${staleFilter}&order=last_enriched_at.asc.nullsfirst&limit=${MAX}`
  );

  if (error) {
    console.error("  Failed to query firms:", error);
    return { enriched: 0, errors: 1 };
  }
  if (!firms.length) {
    console.log("  All firms are up to date!");
    return { enriched: 0, errors: 0 };
  }

  console.log(`  ${firms.length} firms need enrichment`);

  // ── Startup: show actual key status (masked) so missing keys are immediately visible ──
  {
    const kv = (key: string, name: string, role: string) => {
      const ok = !!key;
      const masked = ok ? key.slice(0, 6) + "..." : "NOT SET ✗";
      return `    ${ok ? "✓" : "✗"} ${name.padEnd(18)} ${role.padEnd(22)} ${masked}`;
    };
    console.log("\n  ── PROVIDER KEY STATUS ──────────────────────────────────────────────────");
    console.log(kv(EXA_KEY,         "Exa",          "[PRIMARY search]"));
    console.log(kv(FIRECRAWL_KEY,   "Firecrawl",    "[PRIMARY fetch]"));
    console.log(kv(GEMINI_25_KEY,   "Gemini 2.5",   "[PRIMARY extract]"));
    console.log(kv(GROQ_KEY,        "Groq",         "[fallback extract]"));
    console.log(kv(GEMINI_KEY,      "Gemini 2.0",   "[fallback extract]"));
    console.log(kv(PERPLEXITY_KEY,  "Perplexity",   "[secondary search]"));
    console.log(kv(FIRECRAWL_KEY,   "Firecrawl",    "[P1 fallback scrape/crawl]"));
    console.log(kv(LINKUP_KEY,      "Linkup",       "[Phase 2 only — NOT Phase 1]"));
    console.log(kv(JINA_KEY,        "Jina",         "[Phase 3 only — NOT Phase 1]"));
    console.log("  ─────────────────────────────────────────────────────────────────────────\n");
  }

  if (!EXA_KEY && !TAVILY_KEY) {
    console.log("  ⚠ No Phase 1 search keys set (EXA_API_KEY / TAVILY_API_KEY) — cannot gather data. Skipping.\n");
    return { enriched: 0, errors: 0 };
  }
  if (!GEMINI_25_KEY && !GROQ_KEY && !PERPLEXITY_KEY) {
    console.log("  ⚠ No AI extraction keys set (GEMINI_25_API_KEY / GEMINI_API_KEY / GROQ_API_KEY). Skipping.\n");
    return { enriched: 0, errors: 0 };
  }

  let enriched = 0;
  let errors   = 0;
  let attempted = 0; // incremented once per firm that enters the processing try-block

  for (const firm of firms) {
    let domain = domainFromUrl(firm.website_url);
    console.log(`  ▸ ${firm.firm_name}${domain ? ` (${domain})` : " [no website]"}`);

    try {
      attempted++;
      // DEBUG (first 3 firms): show counter state at start of each firm
      if (attempted <= 3) {
        console.log(`    [COUNTERS] firm #${attempted} entered — attempted:${attempted} updated:${enriched} errors:${errors}`);
      }

      // ── Step 0: Exa URL discovery (runs when website_url or linkedin_url is missing) ──
      // This lets the AI extraction prompt include a real website URL even for unknown firms.
      if ((!firm.website_url || !firm.linkedin_url) && EXA_KEY && isAvailable("api.exa.ai")) {
        const discovered = await discoverFirmUrlsWithExa(firm.firm_name);
        if (discovered.website_url && !firm.website_url) {
          firm.website_url = discovered.website_url;
          domain = domainFromUrl(firm.website_url);
          console.log(`    Exa → discovered website: ${firm.website_url}`);
        }
        if (discovered.linkedin_url && !firm.linkedin_url) {
          firm.linkedin_url = discovered.linkedin_url;
          console.log(`    Exa → discovered LinkedIn: ${firm.linkedin_url}`);
        }
        await sleep(300);
      }

      // Guard: if ALL AI extractors are cooling/exhausted, skip rather than burning search credits.
      // Cap wait at 30s — if the shortest cooldown is longer than that, skip and retry next run.
      const MAX_AI_WAIT_MS = 30_000;
      const aiHosts = [
        "generativelanguage.googleapis.com/2.5",
        "generativelanguage.googleapis.com/2.0",
        "api.groq.com/70b",
        "api.groq.com/8b",
        "api.perplexity.ai",
      ];
      const hasAI = (): boolean => aiHosts.some(h => isAvailable(h));
      if (!hasAI()) {
        const now = Date.now();
        const waitMs = aiHosts.reduce((min, h) => {
          if (QUOTA_EXHAUSTED.has(h)) return min; // permanently gone — skip
          const coolUntil = RATE_LIMIT_COOLDOWN.get(h) ?? 0;
          const remaining = coolUntil - now;
          return remaining > 0 ? Math.min(min, remaining) : min;
        }, Infinity);
        if (waitMs === Infinity) {
          console.log(`    — All AI extractors permanently exhausted; skipping firm`);
          continue;
        }
        if (waitMs > MAX_AI_WAIT_MS) {
          console.log(`    — All AI extractors cooling ${Math.round(waitMs / 1000)}s (> ${MAX_AI_WAIT_MS / 1000}s cap); skipping firm — will retry next run`);
          continue;
        }
        console.log(`    ⏳ AI extractors cooling ${Math.round(waitMs / 1000)}s — waiting...`);
        await sleep(waitMs + 500);
        if (!hasAI()) {
          console.log(`    — AI still unavailable after wait; skipping firm`);
          continue;
        }
      }

      // ── Provider path for this firm (printed at end of each firm) ──────────
      const providerPath: string[] = [];

      // Step 1a: PRIMARY search — Exa + Perplexity in parallel
      // Linkup/Tavily are DEMOTED: only run if primary search returns < 300 chars
      const primarySearchPromises: Promise<string>[] = [];
      const primarySearchLabels: string[] = [];

      if (EXA_KEY && isAvailable("api.exa.ai")) {
        console.log(`    → [EXA_SEARCH] querying...`);
        providerPath.push("EXA_SEARCH");
        primarySearchPromises.push(enrichFirmWithExa(firm.firm_name, domain));
        primarySearchLabels.push("Exa");
      } else {
        const reason = !EXA_KEY ? "key missing (EXA_API_KEY not set)"
          : QUOTA_EXHAUSTED.has("api.exa.ai") ? "quota exhausted"
          : "in cooldown";
        console.log(`    ↷ [EXA_SEARCH] skipped — ${reason}`);
      }

      // Perplexity is NOT used for Phase 1 search — it's quota-sensitive and reserved
      // exclusively for the AI extraction fallback (last resort in the extractor waterfall).

      const primaryResults = await Promise.allSettled(primarySearchPromises);
      const searchTexts: string[] = [];
      for (let i = 0; i < primaryResults.length; i++) {
        const r = primaryResults[i];
        const label = primarySearchLabels[i].toUpperCase();
        if (r.status === "fulfilled" && r.value) {
          searchTexts.push(r.value);
          console.log(`    ✓ [${label}_SEARCH] → ${r.value.length} chars`);
        } else if (r.status === "rejected") {
          console.warn(`    ✗ [${label}_SEARCH] failed: ${r.reason}`);
        } else {
          console.log(`    ↷ [${label}_SEARCH] → returned empty`);
        }
      }

      // Step 1b: FALLBACK search — Tavily only, if Exa returned < 300 chars.
      // Linkup is NOT used in Phase 1 — it throttles immediately and contributes nothing.
      const combinedPrimaryText = searchTexts.join("");
      if (combinedPrimaryText.length < 300) {
        if (TAVILY_KEY && isAvailable("api.tavily.com")) {
          console.log(`    → [FALLBACK_TAVILY] Exa thin (${combinedPrimaryText.length} chars), trying Tavily...`);
          providerPath.push("FALLBACK_TAVILY");
          const tv = await enrichFirmWithTavily(firm.firm_name, domain);
          if (tv) { searchTexts.push(tv); console.log(`    ✓ [FALLBACK_TAVILY] → ${tv.length} chars`); }
          else console.log(`    ↷ [FALLBACK_TAVILY] → returned empty`);
        }
      } else {
        if (TAVILY_KEY) console.log(`    ↷ [FALLBACK_TAVILY] skipped — Exa sufficient (${combinedPrimaryText.length} chars)`);
      }

      const combinedSearchText = searchTexts.join("\n\n=== NEXT SOURCE ===\n\n");

      if (combinedSearchText.length === 0 && !firm.website_url) {
        console.log(`    — No search data and no website URL; skipping firm`);
        continue;
      }

      // Step 1c: Website scrape waterfall
      // PRIMARY:   ScrapingBee — JS-rendered homepage fetch
      // FALLBACK:  Firecrawl scrape — single page markdown (if ScrapingBee empty or thin)
      // DEEP:      Firecrawl crawl — about/team/portfolio subpages (if single-page is still thin)
      // Jina is NOT used in Phase 1 (quota-sensitive; reserved for Phase 3 team pages only)
      //
      // Thresholds:
      //   THIN_THRESHOLD = 500 chars  → ScrapingBee result thin enough to try Firecrawl scrape
      //   CRAWL_THRESHOLD = 1000 chars → combined result still thin → trigger multi-page crawl
      const THIN_THRESHOLD = 500;
      const CRAWL_THRESHOLD = 1_000;

      let websiteText = "";
      if (firm.website_url) {
        // ── PRIMARY: Firecrawl single-page scrape ────────────────────────────
        if (FIRECRAWL_KEY && isAvailable(FIRECRAWL_HOST)) {
          console.log(`    → [FIRECRAWL_SCRAPE] scraping ${firm.website_url}...`);
          providerPath.push("FIRECRAWL_SCRAPE");
          const fcText = await firecrawlScrape(firm.website_url);
          if (fcText) {
            console.log(`    ✓ [FIRECRAWL_SCRAPE] → ${fcText.length} chars`);
            websiteText = fcText;
          } else {
            console.log(`    ✗ [FIRECRAWL_SCRAPE] → returned empty`);
          }
        } else if (!FIRECRAWL_KEY) {
          console.log(`    ↷ [FIRECRAWL_SCRAPE] skipped — key missing (FIRECRAWL_API_KEY not set)`);
        }

        // ── DEEP: Firecrawl multi-page crawl ─────────────────────────────────
        // Fires only when single-page results are still thin AND search text is also thin.
        // Crawls about/team/portfolio subpages to find the missing context.
        const combinedSoFar = websiteText.length + combinedSearchText.length;
        if (websiteText.length < CRAWL_THRESHOLD && FIRECRAWL_KEY && isAvailable(FIRECRAWL_HOST)) {
          const reason = `content thin (${websiteText.length} chars site + ${combinedSearchText.length} chars search)`;
          console.log(`    → [FIRECRAWL_CRAWL] ${reason} — crawling subpages (max 4 pages)...`);
          providerPath.push("FIRECRAWL_CRAWL");
          const crawlText = await firecrawlCrawl(firm.website_url, 4);
          if (crawlText) {
            console.log(`    ✓ [FIRECRAWL_CRAWL] → ${crawlText.length} chars from subpages`);
            websiteText = websiteText
              ? `${websiteText}\n\n=== SUBPAGES ===\n\n${crawlText}`
              : crawlText;
          } else {
            console.log(`    ✗ [FIRECRAWL_CRAWL] → returned empty`);
          }
        } else if (websiteText.length >= CRAWL_THRESHOLD) {
          console.log(`    ↷ [FIRECRAWL_CRAWL] skipped — content sufficient (${websiteText.length} chars)`);
        }

        if (websiteText) await sleep(200);
      }

      // Step 2: Extract structured data — waterfall: Gemini 2.5 → Groq 70b → Groq 8b → Gemini 2.0
      console.log(`    → [AI_EXTRACT] waterfall: Gemini 2.5 → Groq 70b → Groq 8b → Gemini 2.0...`);
      const [patch, extractProvider, websitePortfolioNames] = await extractFirmDataWithAI(
        firm.firm_name,
        combinedSearchText,
        websiteText,
        firm,
      );
      providerPath.push(`AI_EXTRACT[${extractProvider}]`);
      console.log(`    ⬡ Provider path: ${providerPath.join(" → ")}`);
      await sleep(200);

      // Step 3: Write to DB (+ optional website portfolio → firm_recent_deals)
      patch.last_enriched_at = new Date().toISOString();

      let portfolioUpserted = 0;
      if (websitePortfolioNames.length > 0) {
        portfolioUpserted = await upsertWebsitePortfolioCompanies(
          firm.id,
          websitePortfolioNames,
          firm.website_url,
        );
        if (portfolioUpserted > 0) {
          console.log(`    ✓ Portfolio (website) → upserted ${portfolioUpserted} row(s) (source_name=firm_website)`);
        }
      }

      const firmFieldKeys = Object.keys(patch).filter((k) => k !== "last_enriched_at");
      const fieldCount = firmFieldKeys.length;
      if (fieldCount > 0 || portfolioUpserted > 0) {
        const ok = await sbUpdate("firm_records", firm.id, patch);
        if (ok) {
          if (fieldCount > 0) {
            console.log(`    ✓ DB confirmed — updated ${fieldCount} fields: ${firmFieldKeys.join(", ")}`);
          } else {
            console.log(`    ✓ DB confirmed — last_enriched_at only (portfolio upsert)`);
          }
          enriched++;
        } else {
          console.warn(`    ✗ DB write failed — fields were extracted but NOT saved`);
          errors++;
        }
      } else {
        // All AI providers were rate-limited — wait for the shortest cooldown to expire, then retry once
        const aiHosts = ["generativelanguage.googleapis.com/2.5", "generativelanguage.googleapis.com/2.0", "api.groq.com/70b", "api.groq.com/8b", "api.perplexity.ai"];
        const now = Date.now();
        const waitMs = aiHosts.reduce((min, h) => {
          const coolUntil = RATE_LIMIT_COOLDOWN.get(h) ?? 0;
          const remaining = coolUntil - now;
          return remaining > 0 ? Math.min(min, remaining) : min;
        }, Infinity);
        const MAX_RETRY_WAIT_MS = 30_000; // never sleep > 30s; skip firm if all extractors are cooling longer
        const actualWait = waitMs === Infinity ? 0 : waitMs + 1000;
        if (actualWait > MAX_RETRY_WAIT_MS) {
          console.log(`    — All AI extractors cooling ${Math.round(actualWait / 1000)}s (> ${MAX_RETRY_WAIT_MS / 1000}s cap); skipping firm — will retry next run`);
        } else if (actualWait > 0) {
          console.log(`    ⏳ Waiting ${Math.round(actualWait / 1000)}s for AI provider to recover, then retrying...`);
          await sleep(actualWait);
          const [retryPatch, , retryPortfolio] = await extractFirmDataWithAI(
            firm.firm_name,
            combinedSearchText,
            websiteText,
            firm,
          );
          let retryPortfolioUpserted = 0;
          if (retryPortfolio.length > 0) {
            retryPortfolioUpserted = await upsertWebsitePortfolioCompanies(
              firm.id,
              retryPortfolio,
              firm.website_url,
            );
          }
          const retryFirmKeys = Object.keys(retryPatch);
          if (retryFirmKeys.length > 0 || retryPortfolioUpserted > 0) {
            retryPatch.last_enriched_at = new Date().toISOString();
            const retryOk = await sbUpdate("firm_records", firm.id, retryPatch);
            if (retryOk) {
              const keysNoStamp = retryFirmKeys.filter((k) => k !== "last_enriched_at");
              console.log(
                `    ✓ DB confirmed — retry updated ${keysNoStamp.length} fields` +
                  (retryPortfolioUpserted ? ` + ${retryPortfolioUpserted} portfolio row(s)` : "") +
                  (keysNoStamp.length ? `: ${keysNoStamp.join(", ")}` : ""),
              );
              enriched++;
            } else {
              console.warn(`    ✗ DB write failed on retry — fields extracted but NOT saved`);
              errors++;
            }
          } else {
            console.log(`    — Retry also rate-limited; skipping last_enriched_at stamp so firm retries next run`);
          }
        } else {
          console.log(`    — No new data extracted (all fields already populated or extraction returned empty)`);
        }
      }
    } catch (e) {
      errors++;
      console.warn(`    ✗ Error:`, e instanceof Error ? e.message : e);
    }

    // DEBUG (first 3 firms): show counter state after each firm completes
    if (attempted <= 3) {
      const skippedSoFar = attempted - enriched - errors;
      console.log(`    [COUNTERS] firm #${attempted} done — attempted:${attempted} updated:${enriched} skipped:${skippedSoFar} errors:${errors}`);
    }

    await sleep(DELAY_MS);
  }

  if (QUOTA_EXHAUSTED.size > 0) {
    console.log(`\n  ⚠ Providers that hit quota this run: ${[...QUOTA_EXHAUSTED].join(", ")}`);
  }

  // Write phase-level counters so printRunSummary reads real values.
  // skipped = firms that completed without writing any new fields (already enriched, or extraction empty).
  // This is the only source of truth — PHASE_STATS was previously never populated, causing
  // attempted/skipped to show 0 even when firms were fully processed.
  const skipped = Math.max(0, attempted - enriched - errors);
  PHASE_STATS["Phase 1 (Firm Profiles)"] = { attempted, updated: enriched, skipped, errors };

  return { enriched, errors };
}

// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║ PHASE 2: Tri-Force Pipeline (Perplexity + Exa + AI → AUM/deals/partners) ║
// ╚═════════════════════════════════════════════════════════════════════════════╝

async function perplexityResearch(firmName: string, domain: string | null): Promise<string> {
  if (!PERPLEXITY_KEY) return "";
  const domainHint = domain ? ` (${domain})` : "";
  const data = await jsonFetch<any>("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${PERPLEXITY_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "sonar-pro",
      messages: [
        {
          role: "user",
          content: `Search the web for the venture capital firm ${firmName}${domainHint}. Provide a concise text summary of: 1) Their most recently announced fund size and total AUM. 2) A list of their current General Partners and Managing Partners. Do not format as JSON, just provide the facts.`,
        },
      ],
    }),
  });
  return data?.choices?.[0]?.message?.content || "";
}

async function exaDealDiscovery(firmName: string): Promise<string> {
  if (!EXA_KEY) return "";
  const data = await jsonFetch<any>("https://api.exa.ai/search", {
    method: "POST",
    headers: { "x-api-key": EXA_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `Recent startup investments, seed rounds, or series A/B funding led by ${firmName} in the last 6 months`,
      type: "auto",
      numResults: 3,
      contents: {
        text: { maxCharacters: 3000 },
        highlights: {
          query: `${firmName} investment funding round`,
          highlightsPerUrl: 3,
          numSentences: 3,
        },
      },
    }),
  });
  const results = data?.results || [];
  return results
    .map((r: any, i: number) => {
      const highlights = (r.highlights || []).join(" ");
      const text = r.text ? r.text.substring(0, 1500) : "";
      return `[Source ${i + 1}] ${r.title}\n${highlights}\n${text}`;
    })
    .join("\n\n---\n\n");
}

async function formatWithAI(
  firmName: string,
  perplexityText: string,
  exaText: string
): Promise<{ aum: string | null; current_partners: string[]; recent_deals: { company: string; amount: string | null; sector: string | null }[] } | null> {
  const combined = [
    perplexityText ? `=== RESEARCH ===\n${perplexityText}` : "",
    exaText ? `=== DEAL SCOUTING ===\n${exaText}` : "",
  ].filter(Boolean).join("\n\n");

  if (!combined) return null;

  // Try Lovable AI gateway first, then Groq, then Gemini
  const aiProviders = [
    LOVABLE_KEY && {
      url: "https://ai.gateway.lovable.dev/v1/chat/completions",
      headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
      model: "openai/gpt-4o-mini",
    },
    GROQ_KEY && {
      url: "https://api.groq.com/openai/v1/chat/completions",
      headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
      model: "llama-3.3-70b-versatile",
    },
    GEMINI_KEY && {
      url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
      isGemini: true,
    },
  ].filter(Boolean) as any[];

  const systemPrompt = `You are a strict data formatter. Extract facts about a VC firm and format them EXACTLY into this JSON schema: { "aum": "string (e.g., $500M) or null", "current_partners": ["Name 1", "Name 2"], "recent_deals": [ { "company": "string", "amount": "string (e.g., $3M) or null", "sector": "string or null" } ] }. If data is missing, use null or empty array. Do not hallucinate.`;
  const userPrompt = `Extract structured data about "${firmName}" from this research:\n\n${combined}`;

  for (const provider of aiProviders) {
    try {
      let content: string | null = null;

      if (provider.isGemini) {
        const data = await jsonFetch<any>(provider.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        });
        content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      } else {
        const data = await jsonFetch<any>(provider.url, {
          method: "POST",
          headers: provider.headers,
          body: JSON.stringify({
            model: provider.model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
            response_format: { type: "json_object" },
          }),
        });
        content = data?.choices?.[0]?.message?.content;
      }

      if (content) {
        // Strip markdown code fences if present
        const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        return JSON.parse(cleaned);
      }
    } catch {
      continue;
    }
  }

  return null;
}

async function phase2_triForce(): Promise<{ enriched: number; errors: number }> {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  PHASE 2: Tri-Force Pipeline (AUM / Deals / Partners)    ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // Phase 2 requires at least one primary search provider (Perplexity or Exa).
  // Linkup and Jina are NOT primary providers for Phase 2.
  if (!PERPLEXITY_KEY && !EXA_KEY) {
    console.log("  ⚠ No Phase 2 search keys (PERPLEXITY_API_KEY / EXA_API_KEY) — skipping Phase 2\n");
    return { enriched: 0, errors: 0 };
  }

  // ── Phase 2 startup: show actual key status so missing keys are immediately visible ──
  {
    const kv = (key: string, name: string, role: string) => {
      const ok = !!key;
      const masked = ok ? key.slice(0, 6) + "..." : "NOT SET ✗";
      return `    ${ok ? "✓" : "✗"} ${name.padEnd(18)} ${role.padEnd(30)} ${masked}`;
    };
    console.log("\n  ── PROVIDER KEY STATUS (Phase 2) ────────────────────────────────────────");
    console.log(kv(PERPLEXITY_KEY, "Perplexity",   "[PRIMARY research]"));
    console.log(kv(EXA_KEY,        "Exa",           "[PRIMARY deal discovery]"));
    console.log(kv(LOVABLE_KEY,    "Lovable",       "[AI formatting primary]"));
    console.log(kv(GROQ_KEY,       "Groq",          "[AI formatting fallback]"));
    console.log(kv(GEMINI_KEY,     "Gemini 2.0",    "[AI formatting fallback]"));
    console.log("  ─────────────────────────────────────────────────────────────────────────\n");
  }

  const staleDate = new Date(Date.now() - STALE_DAYS * 86400_000).toISOString();
  const staleFilter2 = STALE_DAYS === 0
    ? "aum.is.null"
    : `aum.is.null,last_enriched_at.is.null,last_enriched_at.lt.${staleDate}`;

  // Focus on firms missing AUM or with stale data
  const { data: firms } = await sbQuery<FirmRow>(
    "firm_records",
    `select=id,firm_name,website_url,aum,last_enriched_at&deleted_at=is.null&or=(${staleFilter2})&order=last_enriched_at.asc.nullsfirst&limit=${MAX}`
  );

  if (!firms.length) {
    console.log("  All firms have AUM/deal data!");
    return { enriched: 0, errors: 0 };
  }

  console.log(`  ${firms.length} firms to process\n`);

  let enriched = 0;
  let errors = 0;
  let attempted = 0;

  for (const firm of firms) {
    console.log(`  ▸ ${firm.firm_name}`);

    try {
      attempted++;
      const domain = domainFromUrl(firm.website_url);

      // Step 1: Perplexity research (primary)
      // Checks isAvailable so rate-limited/exhausted providers are skipped with a clear log line.
      let researchText = "";
      if (PERPLEXITY_KEY && isAvailable("api.perplexity.ai")) {
        console.log(`    → [P2_PERPLEXITY] researching ${firm.firm_name}...`);
        researchText = await perplexityResearch(firm.firm_name, domain);
        if (researchText) {
          console.log(`    ✓ [P2_PERPLEXITY] → ${researchText.length} chars`);
        } else {
          console.log(`    ↷ [P2_PERPLEXITY] → returned empty (no data or API error)`);
        }
      } else {
        const why = !PERPLEXITY_KEY
          ? "key missing (PERPLEXITY_API_KEY not set)"
          : QUOTA_EXHAUSTED.has("api.perplexity.ai")
            ? "quota exhausted"
            : "in cooldown";
        console.log(`    ↷ [P2_PERPLEXITY] skipped — ${why}`);
      }
      await sleep(500);

      // Step 2: Exa deal discovery (primary)
      // Checks isAvailable so a quota hit from Phase 1 doesn't silently swallow calls here.
      let exaText = "";
      if (EXA_KEY && isAvailable("api.exa.ai")) {
        console.log(`    → [P2_EXA_DEALS] discovering recent investments for ${firm.firm_name}...`);
        exaText = await exaDealDiscovery(firm.firm_name);
        if (exaText) {
          console.log(`    ✓ [P2_EXA_DEALS] → ${exaText.length} chars`);
        } else {
          console.log(`    ↷ [P2_EXA_DEALS] → returned empty (no recent deals found or API error)`);
        }
      } else {
        const why = !EXA_KEY
          ? "key missing (EXA_API_KEY not set)"
          : QUOTA_EXHAUSTED.has("api.exa.ai")
            ? "quota exhausted"
            : "in cooldown";
        console.log(`    ↷ [P2_EXA_DEALS] skipped — ${why}`);
      }
      await sleep(500);

      // If both primaries returned nothing, skip rather than burning Linkup/Jina quota.
      // Linkup throttles to 429 immediately; Jina has returned 402 (billing exhausted).
      // Neither is a reliable fallback — skip and let the next run retry.
      if (!researchText && !exaText) {
        console.log(`    — [P2_NO_DATA] Both Perplexity and Exa returned empty; skipping firm`);
        await sleep(DELAY_MS);
        continue;
      }

      await sleep(DELAY_MS);

      // Step 3: AI formatting
      const result = await formatWithAI(firm.firm_name, researchText, exaText);
      if (!result) {
        console.log("    — No structured data extracted");
        continue;
      }

      // Step 4: Update firm_records.aum
      if (result.aum && !firm.aum) {
        await sbUpdate("firm_records", firm.id, {
          aum: result.aum,
          last_enriched_at: new Date().toISOString(),
        });
        console.log(`    AUM → ${result.aum}`);
      }

      // Step 5: Upsert recent deals (only replace Phase-2 rows with null source_name;
      // preserve firm_website, signal_nfx, cb_insights, merged, manual, etc.)
      if (result.recent_deals?.length) {
        // Delete prior Phase-2 inserts only
        if (!DRY_RUN) {
          await fetch(`${SUPABASE_URL}/rest/v1/firm_recent_deals?firm_id=eq.${firm.id}&source_name=is.null`, {
            method: "DELETE",
            headers: { ...SB_HEADERS, Prefer: "return=minimal" },
          });
          const deals = result.recent_deals.map((d) => ({
            firm_id: firm.id,
            company_name: d.company || "Unknown",
            amount: d.amount || null,
            stage: d.sector || null,
            date_announced: null,
          }));
          await fetch(`${SUPABASE_URL}/rest/v1/firm_recent_deals`, {
            method: "POST",
            headers: SB_HEADERS,
            body: JSON.stringify(deals),
          });
        }
        console.log(`    Deals → ${result.recent_deals.length} recent deals`);
      }

      // Step 6: Bulk-upsert partners as firm_investors.
      // Previously: one sbUpsert call per partner (O(n) round-trips per firm).
      // Now: single POST with the full partner array (1 round-trip regardless of partner count).
      if (result.current_partners?.length) {
        const now = new Date().toISOString();
        const partnerRows = result.current_partners.map((name) => {
          const parts = name.trim().split(/\s+/);
          return {
            firm_id: firm.id,
            full_name: name.trim(),
            first_name: parts[0] || "",
            last_name: parts.slice(1).join(" ") || "",
            is_active: true,
            updated_at: now,
          };
        });
        // Single PostgREST call with the full array — conflict on (firm_id, full_name)
        await sbBulkUpsert("firm_investors", partnerRows, "firm_id,full_name");
        console.log(`    Partners → ${result.current_partners.length} investors (1 bulk call)`);
      }

      enriched++;
    } catch (e) {
      errors++;
      console.warn(`    ✗ Error:`, e instanceof Error ? e.message : e);
    }

    await sleep(2000); // Rate limit between firms
  }

  const skipped = Math.max(0, attempted - enriched - errors);
  PHASE_STATS["Phase 2 (Tri-Force)"] = { attempted, updated: enriched, skipped, errors };

  return { enriched, errors };
}

// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║ PHASE 3: Firm Investor Enrichment (Team scraping + Exa + PDL)             ║
// ╚═════════════════════════════════════════════════════════════════════════════╝

const TEAM_PAGE_SUFFIXES = [
  "/team", "/people", "/about/team", "/about/people", "/about-us/team",
  "/our-team", "/who-we-are", "/partners", "/portfolio-team", "/about",
];

async function discoverTeamPageUrl(websiteUrl: string): Promise<string | null> {
  const base = websiteUrl.replace(/\/$/, "");
  for (const suffix of TEAM_PAGE_SUFFIXES) {
    try {
      const r = await fetch(`${base}${suffix}`, {
        method: "HEAD",
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) return `${base}${suffix}`;
    } catch {
      continue;
    }
  }
  return null;
}

async function scrapeTeamPage(url: string): Promise<string> {
  // Tier 1: Firecrawl — best markdown output for LLM consumption
  if (FIRECRAWL_KEY) {
    try {
      const data = await jsonFetch<any>("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${FIRECRAWL_KEY}` },
        body: JSON.stringify({ url, formats: ["markdown"] }),
      });
      if (data?.data?.markdown) return data.data.markdown;
    } catch {}
  }

  // Tier 2: ScrapingBee — JS-rendered HTML → text (many VC /people pages)
  if (SCRAPINGBEE_KEY) {
    const bee = await scrapeWithScrapingBee(url);
    if (bee.length > 200) return bee;
  }

  // Tier 3: Jina Reader — lightweight markdown extraction
  if (JINA_KEY) {
    const text = await scrapeWebsiteWithJina(url);
    if (text.length > 100) return text;
  }

  // Tier 4: Raw fetch — last resort, no JS rendering
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const html = await res.text();
      return stripHtmlToText(html);
    }
  } catch {}

  return "";
}

async function extractInvestorsWithAI(
  markdown: string,
  firmName: string
): Promise<Array<{
  first_name: string;
  last_name: string;
  title?: string;
  bio?: string;
  email?: string;
  linkedin_url?: string;
  x_url?: string;
  avatar_url?: string;
  website_url?: string;
  medium_url?: string;
  substack_url?: string;
  investment_themes?: string[];
  portfolio_companies?: string[];
  location?: string;
}>> {
  const prompt = `Extract investment professionals from this VC firm team page for "${firmName}".

Return a JSON array. Each object:
- first_name, last_name (required strings)
- title, bio, email, linkedin_url, x_url (Twitter/X profile URL only), website_url, medium_url, substack_url, avatar_url (absolute image URLs when shown on this page), location — use null when unknown
- investment_themes: string[] of sectors/themes if listed for this person, else null
- portfolio_companies: string[] of notable portfolio company NAMES or board seats explicitly tied to this person on the page (not the whole firm portfolio unless listed under their bio). Else null.

Include partners, principals, MDs, VPs, associates, analysts, and investing team. You may include platform / IR / finance leads if they appear as named team cards with investing-adjacent titles.

Return ONLY the JSON array, no markdown fences.`;

  const fullPrompt = `${prompt}\n\nTeam page content:\n${markdown.slice(0, 24_000)}`;

  // Try Gemini 2.5 Flash first (primary), then Gemini 2.0, then Groq
  if (GEMINI_25_KEY && isAvailable("generativelanguage.googleapis.com/2.5")) {
    try {
      const data = await jsonFetch<any>(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent?key=${GEMINI_25_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
          }),
        },
        "generativelanguage.googleapis.com/2.5",
      );
      const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) {
        const parsed = JSON.parse(content.trim());
        return Array.isArray(parsed) ? parsed : parsed.investors || parsed.team || parsed.people || [];
      }
    } catch {}
  }

  if (GROQ_KEY && isAvailable("api.groq.com/70b")) {
    try {
      const data = await jsonFetch<any>("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: "You extract structured data from VC team pages. Return only valid JSON." },
            { role: "user", content: fullPrompt },
          ],
          response_format: { type: "json_object" },
        }),
      });
      const content = data?.choices?.[0]?.message?.content;
      if (content) {
        const parsed = JSON.parse(content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim());
        return Array.isArray(parsed) ? parsed : parsed.investors || parsed.team || parsed.people || [];
      }
    } catch {}
  }

  // Gemini 2.0 Flash — fallback if 2.5 was rate-limited
  if (GEMINI_KEY && isAvailable("generativelanguage.googleapis.com/2.0")) {
    try {
      const data = await jsonFetch<any>(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: fullPrompt }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        },
        "generativelanguage.googleapis.com/2.0",
      );
      const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) {
        const parsed = JSON.parse(content.trim());
        return Array.isArray(parsed) ? parsed : parsed.investors || parsed.team || parsed.people || [];
      }
    } catch {}
  }

  return [];
}

function normalizeLinkedinProfileUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    if (!/linkedin\.com$/i.test(u.hostname.replace(/^www\./i, ""))) return null;
    if (!/\/in\//i.test(u.pathname)) return null;
    u.hash = "";
    u.search = "";
    return u.toString();
  } catch {
    return null;
  }
}

function normalizePersonalXUrl(raw: string): string | null {
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (!["x.com", "twitter.com"].includes(host)) return null;
    if (/intent|share|search|hashtag|home|explore|settings|i\/|statuses?\/|communities\//i.test(u.pathname)) return null;
    const segs = u.pathname.split("/").filter(Boolean);
    if (!segs[0] || ["intent", "share", "home", "search", "hashtag", "i", "explore"].includes(segs[0])) return null;
    return `https://x.com/${segs[0]}`;
  } catch {
    return null;
  }
}

function portfolioCompaniesToPastInvestments(names: string[]): { company: string }[] {
  const seen = new Set<string>();
  const out: { company: string }[] = [];
  for (const n of names) {
    const c = n.replace(/\s+/g, " ").trim();
    if (c.length < 2 || c.length > 120) continue;
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ company: c });
    if (out.length >= 40) break;
  }
  return out;
}

function mergeBackgroundSummary(existing: string | null, addition: string | null | undefined): string | undefined {
  if (!addition?.trim()) return undefined;
  if (!existing?.trim()) return addition.trim();
  if (existing.includes(addition.slice(0, 40))) return undefined;
  return `${existing.trim()}\n\n${addition.trim()}`.slice(0, 8000);
}

/** Web snippets: investments, boards, career context (not a substitute for verified CRM data). */
async function enrichInvestorBackgroundWithExa(name: string, firmName: string): Promise<string | undefined> {
  if (!EXA_KEY) return undefined;

  const data = await jsonFetch<any>("https://api.exa.ai/search", {
    method: "POST",
    headers: { "x-api-key": EXA_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `"${name}" "${firmName}" venture capital portfolio investments board advisor`,
      type: "neural",
      numResults: 5,
      contents: { text: { maxCharacters: 2800 } },
    }),
  });

  const results = data?.results || [];
  const parts: string[] = [];
  for (const r of results) {
    const title = (r.title || "").trim();
    const text = (r.text || "").trim();
    const url = (r.url || "").trim();
    const chunk = [title && `[${title}]`, url && `(${url})`, text].filter(Boolean).join(" ");
    if (chunk.length > 40) parts.push(chunk);
  }
  if (!parts.length) return undefined;
  const merged = parts.join("\n\n---\n\n").slice(0, 3500).trim();
  return merged.length >= 100 ? merged : undefined;
}

async function enrichInvestorWithExa(
  name: string,
  firmName: string
): Promise<{
  linkedin_url?: string;
  x_url?: string;
  bio?: string;
  education_summary?: string;
  background_summary?: string;
  investment_style?: string;
}> {
  if (!EXA_KEY) return {};

  const data = await jsonFetch<any>("https://api.exa.ai/search", {
    method: "POST",
    headers: { "x-api-key": EXA_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `${name} ${firmName} venture capital investor`,
      type: "neural",
      numResults: 5,
      contents: { text: { maxCharacters: 3200 } },
    }),
  });

  const results = data?.results || [];
  const patch: Record<string, string> = {};
  const bioChunks: string[] = [];

  for (const r of results) {
    const url = (r.url || "").trim();
    const text = (r.text || "").trim();

    if (!patch.linkedin_url) {
      const li = normalizeLinkedinProfileUrl(url) || (text.match(/https?:\/\/(?:www\.)?linkedin\.com\/in\/[a-z0-9\-_%/]+/i)?.[0] ?? "");
      const canon = li ? normalizeLinkedinProfileUrl(li) : null;
      if (canon) patch.linkedin_url = canon;
    }
    if (!patch.x_url) {
      const m = url.match(/https?:\/\/(?:www\.)?(?:x\.com|twitter\.com)\/[a-z0-9_]+/i);
      const xu = normalizePersonalXUrl(m?.[0] || url);
      if (xu) patch.x_url = xu;
    }
    if (text.length > 80) bioChunks.push(text);
  }

  if (!patch.bio && bioChunks.length) {
    patch.bio = bioChunks[0]!.slice(0, 700).trim();
  }

  return patch;
}

async function enrichInvestorWithPDL(
  firstName: string,
  lastName: string,
  firmName: string
): Promise<{
  linkedin_url?: string;
  email?: string;
  city?: string;
  state?: string;
  country?: string;
  education_summary?: string;
}> {
  if (!PDL_KEY) return {};

  const data = await jsonFetch<any>("https://api.peopledatalabs.com/v5/person/search", {
    method: "POST",
    headers: { "X-Api-Key": PDL_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: {
        bool: {
          must: [
            { term: { first_name: firstName.toLowerCase() } },
            { term: { last_name: lastName.toLowerCase() } },
            { term: { job_company_name: firmName.toLowerCase() } },
          ],
        },
      },
      size: 1,
    }),
  });

  const person = data?.data?.[0];
  if (!person) return {};

  const patch: Record<string, string> = {};
  if (person.linkedin_url) patch.linkedin_url = person.linkedin_url;
  if (person.work_email) patch.email = person.work_email;
  else if (person.recommended_personal_email) patch.email = person.recommended_personal_email;
  if (person.location_locality) patch.city = person.location_locality;
  if (person.location_region) patch.state = person.location_region;
  if (person.location_country) patch.country = person.location_country;
  if (person.education?.length) {
    patch.education_summary = person.education
      .map((e: any) => [e.school?.name, e.degrees?.join(", ")].filter(Boolean).join(" — "))
      .join("; ");
  }

  return patch;
}

async function phase3_firmInvestors(): Promise<{ enriched: number; errors: number }> {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  PHASE 3: Firm Investor Enrichment (Team scraping + Exa)  ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // Get firms that have investors needing enrichment
  const { data: firms } = await sbQuery<{ id: string; firm_name: string; website_url: string | null }>(
    "firm_records",
    `select=id,firm_name,website_url&deleted_at=is.null&website_url=not.is.null&order=firm_name.asc&limit=${MAX}`
  );

  if (!firms.length) {
    console.log("  No firms with websites found!");
    return { enriched: 0, errors: 0 };
  }

  let enriched = 0;
  let errors = 0;

  for (const firm of firms) {
    // Get investors for this firm that are missing key fields
    const { data: investors } = await sbQuery<InvestorRow>(
      "firm_investors",
      `select=*&firm_id=eq.${firm.id}&deleted_at=is.null&or=(title.is.null,bio.is.null,linkedin_url.is.null,email.is.null,avatar_url.is.null,x_url.is.null,background_summary.is.null,website_url.is.null,medium_url.is.null,substack_url.is.null)&limit=50`
    );

    if (!investors.length) continue;

    console.log(`  ▸ ${firm.firm_name} — ${investors.length} investors need enrichment`);

    try {
      // Step 1: Discover and scrape the team page
      let extractedPeople: any[] = [];
      if (firm.website_url) {
        const domain = domainFromUrl(firm.website_url);
        // Exa finds the correct URL more reliably than HEAD-probing common suffixes
        let teamUrl: string | null = await discoverTeamPageWithExa(firm.firm_name, domain);
        if (!teamUrl) {
          // Fallback: HEAD-probe common URL suffixes
          teamUrl = await discoverTeamPageUrl(firm.website_url);
        }
        if (teamUrl && (FIRECRAWL_KEY || SCRAPINGBEE_KEY || JINA_KEY)) {
          const markdown = await scrapeTeamPage(teamUrl);
          if (markdown.length > 100) {
            extractedPeople = await extractInvestorsWithAI(markdown, firm.firm_name);
            console.log(`    AI extracted ${extractedPeople.length} people`);
          }
        }
        await sleep(DELAY_MS);
      }

      // Step 2: For each investor, merge scraped data + enrichment APIs
      for (const investor of investors) {
        const patch: EnrichPatch = {};

        // Match against extracted team page data
        const nameNorm = investor.full_name.toLowerCase().trim();
        const matched = extractedPeople.find((ep) => {
          const epName = `${ep.first_name} ${ep.last_name}`.toLowerCase().trim();
          return epName === nameNorm ||
            nameNorm.includes(ep.last_name?.toLowerCase() || "___") ||
            epName.includes(investor.last_name?.toLowerCase() || "___");
        });

        if (matched) {
          if (!investor.title && matched.title) patch.title = matched.title;
          if (!investor.bio && matched.bio) patch.bio = matched.bio;
          if (!investor.email && matched.email) patch.email = matched.email;
          if (!investor.linkedin_url && matched.linkedin_url) patch.linkedin_url = matched.linkedin_url;
          if (!investor.x_url && matched.x_url) patch.x_url = matched.x_url;
          if (!investor.avatar_url && matched.avatar_url) patch.avatar_url = matched.avatar_url;
          if (!investor.website_url && matched.website_url) patch.website_url = matched.website_url;
          if (!investor.medium_url && matched.medium_url) patch.medium_url = matched.medium_url;
          if (!investor.substack_url && matched.substack_url) patch.substack_url = matched.substack_url;
          if (matched.investment_themes?.length && !investor.personal_thesis_tags?.length)
            patch.personal_thesis_tags = matched.investment_themes;
          if (matched.location && !investor.city) {
            const parts = matched.location.split(",").map((s: string) => s.trim());
            if (parts[0]) patch.city = parts[0];
            if (parts[1]) patch.state = parts[1];
          }
          if (!investor.first_name && matched.first_name) patch.first_name = matched.first_name;
          if (!investor.last_name && matched.last_name) patch.last_name = matched.last_name;

          const rawPc = matched.portfolio_companies;
          const companies = Array.isArray(rawPc)
            ? rawPc.filter((c: unknown): c is string => typeof c === "string" && c.trim().length > 1)
            : [];
          if (companies.length) {
            const emptyPast =
              !investor.past_investments ||
              (Array.isArray(investor.past_investments) && investor.past_investments.length === 0);
            const pi = portfolioCompaniesToPastInvestments(companies);
            if (pi.length && emptyPast) patch.past_investments = pi;
            const portfolioLine = `Portfolio (from team page): ${companies.slice(0, 25).join(", ")}`;
            if (!investor.background_summary) {
              patch.background_summary = portfolioLine;
            } else {
              const merged = mergeBackgroundSummary(investor.background_summary, portfolioLine);
              if (merged) patch.background_summary = merged;
            }
          }
        }

        // Enrich remaining gaps with Exa (LinkedIn, X, bio; broader search than before)
        const needsExa =
          !!EXA_KEY &&
          (!investor.linkedin_url || !investor.x_url || !investor.bio);
        if (needsExa) {
          const exaPatch = await enrichInvestorWithExa(investor.full_name, firm.firm_name);
          for (const [k, v] of Object.entries(exaPatch)) {
            if (!patch[k] && !(investor as any)[k] && v) patch[k] = v;
          }
          await sleep(400);
        }

        // Long-form background from web (investments, boards) — only when DB has no summary yet
        if (EXA_KEY && !investor.background_summary) {
          const bgExtra = await enrichInvestorBackgroundWithExa(investor.full_name, firm.firm_name);
          if (bgExtra) {
            const base = (patch.background_summary as string | undefined) || "";
            patch.background_summary = base.trim()
              ? (mergeBackgroundSummary(base, bgExtra) ?? `${base.trim()}\n\n${bgExtra}`.slice(0, 8000))
              : bgExtra;
          }
          await sleep(350);
        }

        // Enrich with People Data Labs for email/location/education
        if ((!patch.email && !investor.email) || (!patch.city && !investor.city)) {
          const firstName = patch.first_name || investor.first_name || investor.full_name.split(" ")[0];
          const lastName = patch.last_name || investor.last_name || investor.full_name.split(" ").slice(1).join(" ");
          if (firstName && lastName) {
            const pdlPatch = await enrichInvestorWithPDL(firstName, lastName, firm.firm_name);
            for (const [k, v] of Object.entries(pdlPatch)) {
              if (!patch[k] && !(investor as any)[k] && v) patch[k] = v;
            }
            await sleep(300);
          }
        }

        if (patch.linkedin_url) {
          const c = normalizeLinkedinProfileUrl(String(patch.linkedin_url));
          if (c) patch.linkedin_url = c;
        }
        if (patch.x_url) {
          const c = normalizePersonalXUrl(String(patch.x_url));
          if (c) patch.x_url = c;
          else delete patch.x_url;
        }

        // Apply the patch
        if (Object.keys(patch).length > 0) {
          patch.updated_at = new Date().toISOString();
          patch.needs_review = false;
          await sbUpdate("firm_investors", investor.id, patch);
          console.log(`    ✓ ${investor.full_name}: ${Object.keys(patch).filter(k => k !== "updated_at" && k !== "needs_review").join(", ")}`);
          enriched++;
        }
      }
    } catch (e) {
      errors++;
      console.warn(`    ✗ Error:`, e instanceof Error ? e.message : e);
    }

    await sleep(DELAY_MS);
  }

  return { enriched, errors };
}

// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║ PHASE 4: Email Backfill (Hunter domain search for remaining gaps)         ║
// ╚═════════════════════════════════════════════════════════════════════════════╝

async function phase4_emailBackfill(): Promise<{ enriched: number; errors: number }> {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  PHASE 4: Email Backfill (Hunter domain search)           ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  if (!HUNTER_KEY) {
    console.log("  ⚠ No HUNTER_API_KEY set — skipping Phase 4\n");
    return { enriched: 0, errors: 0 };
  }

  // Get firms with investors missing emails
  const { data: firms } = await sbQuery<{ id: string; firm_name: string; website_url: string | null }>(
    "firm_records",
    `select=id,firm_name,website_url&deleted_at=is.null&website_url=not.is.null&order=firm_name.asc&limit=${MAX}`
  );

  let enriched = 0;
  let errors = 0;

  for (const firm of firms) {
    const domain = domainFromUrl(firm.website_url);
    if (!domain) continue;

    const { data: investors } = await sbQuery<InvestorRow>(
      "firm_investors",
      `select=id,full_name,first_name,last_name,email&firm_id=eq.${firm.id}&deleted_at=is.null&email=is.null&limit=20`
    );

    if (!investors.length) continue;

    console.log(`  ▸ ${firm.firm_name} — ${investors.length} investors need email`);

    try {
      const url = new URL("https://api.hunter.io/v2/domain-search");
      url.searchParams.set("domain", domain);
      url.searchParams.set("api_key", HUNTER_KEY);
      url.searchParams.set("limit", "20");

      const result = await jsonFetch<any>(url.toString());
      const emails = result?.data?.emails ?? [];

      for (const investor of investors) {
        const first = (investor.first_name || "").toLowerCase();
        const last = (investor.last_name || "").toLowerCase();

        const scored = emails
          .filter((e: any) => e.value?.includes("@"))
          .map((e: any) => {
            let score = (e.confidence ?? 0) / 100;
            if (first && e.first_name?.toLowerCase() === first) score += 0.25;
            if (last && e.last_name?.toLowerCase() === last) score += 0.25;
            return { email: e.value!, score };
          })
          .sort((a: any, b: any) => b.score - a.score);

        const best = scored[0];
        if (best && best.score >= 0.5) {
          await sbUpdate("firm_investors", investor.id, {
            email: best.email,
            updated_at: new Date().toISOString(),
          });
          console.log(`    ✓ ${investor.full_name} → ${best.email}`);
          enriched++;
        }
      }

      await sleep(DELAY_MS);
    } catch (e) {
      errors++;
      console.warn(`    ✗ Error:`, e instanceof Error ? e.message : e);
    }
  }

  return { enriched, errors };
}

// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║ PHASE 5: Headshot / Avatar Backfill (Unavatar cascade)                    ║
// ╚═════════════════════════════════════════════════════════════════════════════╝

async function checkImageUrl(url: string): Promise<boolean> {
  try {
    // First try HEAD — fast, but many CDNs omit Content-Length (chunked)
    const head = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
    });
    if (!head.ok) return false;
    const ct = head.headers.get("content-type") || "";
    if (!ct.startsWith("image/")) return false;
    const cl = parseInt(head.headers.get("content-length") || "0", 10);
    // If Content-Length is present and too small, it's a placeholder
    if (cl > 0 && cl < 1024) return false;
    // If Content-Length is missing (chunked), do a partial GET to confirm real data
    if (cl === 0) {
      try {
        const get = await fetch(url, {
          headers: { Range: "bytes=0-4095" },
          redirect: "follow",
          signal: AbortSignal.timeout(8000),
        });
        const buf = await get.arrayBuffer();
        return buf.byteLength > 1024;
      } catch {
        return true; // assume valid if range request fails
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Given Jina/Firecrawl markdown of a team page, find the best image URL
 * for a specific investor by looking for markdown image tags near their name.
 */
function findAvatarOnTeamPage(markdown: string, fullName: string): string | null {
  if (!markdown || !fullName) return null;

  // Build name variants to search for (full, first, last)
  const parts = fullName.trim().split(/\s+/);
  const firstName = parts[0] ?? "";
  const lastName = parts[parts.length - 1] ?? "";

  // Regex to find all markdown images: ![alt](url)
  const imgRegex = /!\[[^\]]*\]\((https?:\/\/[^)\s"']+)\)/g;

  // Find all image positions in the markdown
  const images: Array<{ idx: number; url: string }> = [];
  let m: RegExpExecArray | null;
  while ((m = imgRegex.exec(markdown)) !== null) {
    const url = m[1];
    // Skip tiny icons, logos, decorative images (common patterns to exclude)
    if (/logo|icon|badge|arrow|banner|bg|background|pattern|social|twitter|linkedin|facebook/i.test(url)) continue;
    images.push({ idx: m.index, url });
  }

  if (images.length === 0) return null;

  // Find all positions of the investor's name in the markdown
  const namePositions: number[] = [];
  const searchStr = markdown.toLowerCase();
  const fullNameLower = fullName.toLowerCase();
  let pos = searchStr.indexOf(fullNameLower);
  while (pos !== -1) {
    namePositions.push(pos);
    pos = searchStr.indexOf(fullNameLower, pos + 1);
  }

  // If full name not found, try first + last within 120 chars of each other
  if (namePositions.length === 0 && firstName && lastName && firstName !== lastName) {
    const firstLower = firstName.toLowerCase();
    const lastLower = lastName.toLowerCase();
    let fi = searchStr.indexOf(firstLower);
    while (fi !== -1) {
      const li = searchStr.indexOf(lastLower, fi);
      if (li !== -1 && li - fi < 120) namePositions.push(fi);
      fi = searchStr.indexOf(firstLower, fi + 1);
    }
  }

  if (namePositions.length === 0) return null;

  // For each name position, find the closest image within ±1500 chars
  let bestUrl: string | null = null;
  let bestDist = Infinity;
  for (const namePos of namePositions) {
    for (const img of images) {
      const dist = Math.abs(img.idx - namePos);
      if (dist < 1500 && dist < bestDist) {
        bestDist = dist;
        bestUrl = img.url;
      }
    }
  }

  return bestUrl;
}

async function md5Hex(str: string): Promise<string> {
  // Node built-in crypto — available without any import via globalThis or dynamic import
  const { createHash } = await import("node:crypto");
  return createHash("md5").update(str.trim().toLowerCase()).digest("hex");
}

async function findAvatar(investor: InvestorRow): Promise<{ url: string; source: string } | null> {
  // 1. Unavatar → Twitter/X (most reliable: public profile photos)
  if (investor.x_url) {
    const handle = investor.x_url.replace(/\/$/, "").split("/").pop();
    if (handle && handle !== "x.com" && handle !== "twitter.com") {
      const url = `https://unavatar.io/twitter/${handle}`;
      if (await checkImageUrl(url)) return { url, source: "Twitter/X" };
    }
  }

  // 2. Unavatar → LinkedIn (works when Unavatar has cached it)
  if (investor.linkedin_url) {
    const handle = investor.linkedin_url.replace(/\/$/, "").split("/").pop();
    if (handle && handle !== "linkedin.com" && handle !== "in") {
      const url = `https://unavatar.io/linkedin/${handle}`;
      if (await checkImageUrl(url)) return { url, source: "LinkedIn" };
    }
  }

  // 3. Gravatar (reliable for investors who use Gmail/GSuite-based email)
  if (investor.email) {
    try {
      const hash = await md5Hex(investor.email);
      const url = `https://www.gravatar.com/avatar/${hash}?s=400&d=404`;
      if (await checkImageUrl(url)) return { url, source: "Gravatar" };
    } catch { /* ignore */ }
  }

  // 4. Unavatar → email (checks Gravatar + other social platforms by email)
  if (investor.email) {
    const url = `https://unavatar.io/${encodeURIComponent(investor.email)}`;
    if (await checkImageUrl(url)) return { url, source: "Unavatar/email" };
  }

  // 5. Unavatar → full name (last resort — less accurate but often finds something)
  const name = investor.full_name.trim().replace(/\s+/g, "+");
  if (name) {
    const url = `https://unavatar.io/${encodeURIComponent(investor.full_name.trim())}`;
    if (await checkImageUrl(url)) return { url, source: "Unavatar/name" };
  }

  return null;
}

async function phase5_headshots(): Promise<{ enriched: number; errors: number }> {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log("║  PHASE 5: Headshot / Avatar Backfill                      ║");
  console.log("╚══════════════════════════════════════════════════════════╝\n");

  // Fetch investors with no avatar — join firm_records to get website_url
  const { data: investors } = await sbQuery<InvestorRow>(
    "firm_investors",
    `select=id,full_name,first_name,last_name,email,linkedin_url,x_url,avatar_url,firm_id,firm_records(website_url)&deleted_at=is.null&avatar_url=is.null&limit=${Math.min(MAX * 3, 300)}`
  );

  if (!investors.length) {
    console.log("  All investors have avatars!");
    return { enriched: 0, errors: 0 };
  }

  console.log(`  ${investors.length} investors need headshots\n`);

  // Group by firm so we scrape each team page once
  const byFirm = new Map<string, { websiteUrl: string | null; investors: InvestorRow[] }>();
  for (const inv of investors) {
    const websiteUrl = (inv.firm_records as any)?.website_url ?? null;
    if (!byFirm.has(inv.firm_id)) {
      byFirm.set(inv.firm_id, { websiteUrl, investors: [] });
    }
    byFirm.get(inv.firm_id)!.investors.push(inv);
  }

  let enriched = 0;
  let errors = 0;

  for (const [firmId, { websiteUrl, investors: firmInvestors }] of byFirm) {
    // ── Step 1: Scrape the firm's team page once ──────────────────────────────
    let teamMarkdown = "";
    let teamPageUrl: string | null = null;

    if (websiteUrl && (JINA_KEY || FIRECRAWL_KEY || SCRAPINGBEE_KEY)) {
      teamPageUrl = await discoverTeamPageUrl(websiteUrl);
      if (teamPageUrl) {
        console.log(`  📄 Scraping team page: ${teamPageUrl}`);
        teamMarkdown = await scrapeTeamPage(teamPageUrl);
        if (teamMarkdown) {
          console.log(`     → ${teamMarkdown.length} chars`);
        }
        await sleep(500);
      }
    }

    // ── Step 2: For each investor in this firm, try team page first ──────────
    for (const investor of firmInvestors) {
      try {
        let avatarUrl: string | null = null;
        let source = "";

        // 1. Team page: look for image near investor's name in markdown
        if (teamMarkdown) {
          const candidate = findAvatarOnTeamPage(teamMarkdown, investor.full_name);
          if (candidate && await checkImageUrl(candidate)) {
            avatarUrl = candidate;
            source = "team page";
          }
        }

        // 2. Social / Gravatar fallback
        if (!avatarUrl) {
          const result = await findAvatar(investor);
          if (result) {
            avatarUrl = result.url;
            source = result.source;
          }
        }

        if (avatarUrl) {
          await sbUpdate("firm_investors", investor.id, {
            avatar_url: avatarUrl,
            updated_at: new Date().toISOString(),
          });
          console.log(`  ✓ ${investor.full_name} → ${source}`);
          enriched++;
        } else {
          console.log(`  — ${investor.full_name} → no headshot found`);
        }

        await sleep(300);
      } catch (e) {
        errors++;
        console.warn(`  ✗ ${investor.full_name} → ${e instanceof Error ? e.message : e}`);
      }
    }

    await sleep(800); // pause between firms
  }

  return { enriched, errors };
}

// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║ POST-RUN AUDIT SUMMARY                                                    ║
// ╚═════════════════════════════════════════════════════════════════════════════╝

function printRunSummary(phaseResults: Record<string, { enriched: number; errors: number }>) {
  const elapsed = Math.round((Date.now() - RUN_START) / 1000);
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;

  console.log("\n╔═════════════════════════════════════════════════════════════╗");
  console.log("║  POST-RUN AUDIT SUMMARY                                     ║");
  console.log("╚═════════════════════════════════════════════════════════════╝");
  console.log(`  Run duration : ${mins}m ${secs}s`);
  console.log(`  Dry-run mode : ${DRY_RUN ? "YES — no writes committed" : "NO — live writes"}`);

  // ── Phase-level results ──
  console.log("\n  ── Phase Results ──────────────────────────────────────────");
  let totalAttempted = 0;
  let totalUpdated = 0;
  let totalErrors = 0;
  for (const [phase, { enriched, errors }] of Object.entries(phaseResults)) {
    const stat = PHASE_STATS[phase];
    const attempted = stat?.attempted ?? enriched + errors;
    const skipped   = stat?.skipped   ?? 0;
    console.log(`  ${phase}`);
    console.log(`    attempted: ${attempted}  updated: ${enriched}  skipped: ${skipped}  errors: ${errors}`);
    totalAttempted += attempted;
    totalUpdated   += enriched;
    totalErrors    += errors;
  }
  console.log(`\n  TOTAL  attempted: ${totalAttempted}  updated: ${totalUpdated}  errors: ${totalErrors}`);

  // ── Fields updated this run ──
  const byTable: Record<string, Array<[string, number]>> = {};
  for (const [key, count] of Object.entries(FIELD_STATS)) {
    const [table, field] = key.split(".");
    if (!byTable[table]) byTable[table] = [];
    byTable[table].push([field, count]);
  }
  if (Object.keys(byTable).length > 0) {
    console.log("\n  ── Fields Written This Run ─────────────────────────────────");
    for (const [table, fields] of Object.entries(byTable)) {
      console.log(`  ${table}:`);
      for (const [field, count] of fields.sort((a, b) => b[1] - a[1])) {
        console.log(`    ${field.padEnd(28)} +${count}`);
      }
    }
  }

  // ── Provider outcomes ──
  if (Object.keys(PROVIDER_STATS).length > 0) {
    console.log("\n  ── Provider Outcomes ───────────────────────────────────────");
    const sorted = Object.entries(PROVIDER_STATS).sort((a, b) => b[1].calls - a[1].calls);
    for (const [host, s] of sorted) {
      const status = s.quota_exhausted ? "⊘ QUOTA" : s.rate_limited > 0 ? "⚠ THROTTLED" : "✓";
      console.log(
        `  ${status.padEnd(12)} ${host.padEnd(40)} ` +
        `calls:${s.calls}  ok:${s.successes}  fail:${s.failures}  429s:${s.rate_limited}`
      );
    }
    // Explicitly list quota-exhausted providers
    const exhausted = Object.entries(PROVIDER_STATS).filter(([, s]) => s.quota_exhausted).map(([h]) => h);
    if (exhausted.length > 0) {
      console.log(`\n  ⚠ Quota/billing exhausted (won't retry until next run): ${exhausted.join(", ")}`);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════════\n");
}

// ╔═════════════════════════════════════════════════════════════════════════════╗
// ║ MAIN: Run all phases                                                      ║
// ╚═════════════════════════════════════════════════════════════════════════════╝

async function audit() {
  console.log("\n📊 Pre-enrichment Audit\n");

  const firmFields = [
    "description", "website_url", "linkedin_url", "x_url", "email", "phone",
    "hq_city", "hq_state", "hq_country", "aum", "founded_year", "logo_url",
    "elevator_pitch", "total_headcount", "min_check_size", "max_check_size",
  ];

  const { count: totalFirms } = await sbQuery("firm_records", "select=id&deleted_at=is.null&limit=0", { count: true });
  console.log(`  firm_records: ${totalFirms ?? "?"} total active`);

  for (const f of firmFields) {
    const { count } = await sbQuery("firm_records", `select=id&deleted_at=is.null&${f}=is.null&limit=0`, { count: true });
    if (count && count > 0 && totalFirms) {
      console.log(`    ${f}: ${count} empty (${Math.round((count / totalFirms) * 100)}%)`);
    }
  }

  const investorFields = [
    "email", "linkedin_url", "x_url", "bio", "avatar_url", "title",
    "website_url", "medium_url", "substack_url",
    "city", "state", "country", "sector_focus", "stage_focus",
    "education_summary", "background_summary", "investment_style",
  ];

  const { count: totalInvestors } = await sbQuery("firm_investors", "select=id&deleted_at=is.null&limit=0", { count: true });
  console.log(`\n  firm_investors: ${totalInvestors ?? "?"} total active`);

  for (const f of investorFields) {
    const { count } = await sbQuery("firm_investors", `select=id&deleted_at=is.null&${f}=is.null&limit=0`, { count: true });
    if (count && count > 0 && totalInvestors) {
      console.log(`    ${f}: ${count} empty (${Math.round((count / totalInvestors) * 100)}%)`);
    }
  }

  console.log("");
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  VEKTA — Master Enrichment Pipeline");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Max records per phase: ${MAX}`);
  console.log(`  Stale threshold: ${STALE_DAYS} days`);
  console.log(`  Phases to run: ${[...PHASES].join(", ")}`);
  console.log(`  Dry run: ${DRY_RUN}`);
  console.log(`  API keys configured:`);
  const k = (key: string) => key ? "✓" : "✗ no key";
  console.log(`  Search/discovery:`);
  console.log(`    Exa(search+discovery): ${k(EXA_KEY)}  Perplexity: ${k(PERPLEXITY_KEY)}  Tavily: ${k(TAVILY_KEY)}  Linkup: ${k(LINKUP_KEY)}`);
  console.log(`  Page fetching:`);
  console.log(`    Firecrawl(primary): ${k(FIRECRAWL_KEY)}  Jina: ${k(JINA_KEY)}`);
  if (!FIRECRAWL_KEY) console.log(`    ⚠ Firecrawl key missing — set FIRECRAWL_API_KEY in .env.local`);
  console.log(`  AI extraction (waterfall):`);
  console.log(`    [1] Gemini 2.5 Flash: ${k(GEMINI_25_KEY)}  [2] Groq 70b: ${k(GROQ_KEY)}  [3] Groq 8b: ${k(GROQ_KEY)}  [4] Perplexity: ${k(PERPLEXITY_KEY)}`);
  console.log(`    Gemini 2.0 Flash(fb): ${k(GEMINI_KEY)}`);
  console.log(`  Email/contact:`);
  console.log(`    Hunter: ${k(HUNTER_KEY)}  PDL: ${k(PDL_KEY)}`);
  if (SKIP_PROVIDERS.size > 0) {
    console.log(`\n  ⊘ Pre-skipped: ${[...SKIP_PROVIDERS].join(", ")}`);
  }

  // In dry-run mode, cap to 10 sample firms and 10 sample investors so output stays readable
  if (DRY_RUN && MAX > 10) {
    console.log(`  ℹ Dry-run mode: capping MAX to 10 samples per phase (was ${MAX})`);
    MAX = 10;
  }

  // Run pre-enrichment audit
  await audit();

  const results: Record<string, { enriched: number; errors: number }> = {};

  if (PHASES.has(1)) {
    results["Phase 1 (Firm Profiles)"] = await phase1_firmProfiles();
  }
  if (PHASES.has(2)) {
    results["Phase 2 (AUM/Deals/Partners)"] = await phase2_triForce();
  }
  if (PHASES.has(3)) {
    results["Phase 3 (Investor Profiles)"] = await phase3_firmInvestors();
  }
  if (PHASES.has(4)) {
    results["Phase 4 (Email Backfill)"] = await phase4_emailBackfill();
  }
  if (PHASES.has(5)) {
    results["Phase 5 (Headshots)"] = await phase5_headshots();
  }

  // Post-run audit summary (replaces the simple counter block)
  printRunSummary(results);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
