/**
 * enrich-all.ts — Master enrichment orchestrator
 *
 * Fills ALL empty fields on firm_records and firm_investors by running
 * multiple enrichment phases in sequence:
 *
 *   Phase 1 — Firm Profile Enrichment (Apollo / Clay / Explorium)
 *             Fills: description, linkedin_url, x_url, crunchbase_url,
 *             founded_year, total_headcount, hq_city/state/country, aum
 *
 *   Phase 2 — Tri-Force Pipeline (Perplexity + Exa + AI formatting)
 *             Fills: aum, recent_deals, current_partners (firm_investors)
 *
 *   Phase 3 — Firm Investor Enrichment (Team page scraping + Exa + PDL + Lusha)
 *             Fills: first_name, last_name, title, bio, avatar_url, email,
 *             linkedin_url, x_url, medium_url, substack_url,
 *             sector_focus, stage_focus, personal_thesis_tags,
 *             city, state, country, education_summary, background_summary
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

const MAX = Math.max(1, parseInt(process.env.ENRICH_ALL_MAX || "100", 10));
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
const PERPLEXITY_KEY = process.env.PERPLEXITY_API_KEY?.trim() || "";
const EXA_KEY       = process.env.EXA_API_KEY?.trim() || "";
const TAVILY_KEY    = process.env.TAVILY_API_KEY?.trim() || "";
const JINA_KEY      = process.env.JINA_API_KEY?.trim() || "";
const LINKUP_KEY    = process.env.LINKUP_API_KEY?.trim() || "";
const GROQ_KEY      = process.env.GROQ_API_KEY?.trim() || "";
const DEEPSEEK_KEY  = process.env.DEEPSEEK_API_KEY?.trim() || "";
const GEMINI_KEY    = process.env.GEMINI_API_KEY?.trim() || "";
const HUNTER_KEY    = process.env.HUNTER_API_KEY?.trim() || "";
const PDL_KEY       = process.env.PEOPLE_DATA_LABS_API_KEY?.trim() || process.env.PDL_API_KEY?.trim() || "";
const LUSHA_KEY     = process.env.LUSHA_API_KEY?.trim() || "";
const FIRECRAWL_KEY = process.env.FIRECRAWL_API_KEY?.trim() || "";
const SERPWOW_KEY   = process.env.SERPWOW_API_KEY?.trim() || "";
const LOVABLE_KEY   = process.env.LOVABLE_API_KEY?.trim() || "";
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
  if (DRY_RUN) {
    console.log(`    [DRY RUN] Would update ${table}.${id}:`, Object.keys(patch).join(", "));
    return true;
  }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...SB_HEADERS, Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  return res.ok;
}

async function sbUpsert(
  table: string,
  data: Record<string, any>,
  onConflict?: string
): Promise<boolean> {
  if (DRY_RUN) {
    console.log(`    [DRY RUN] Would upsert into ${table}:`, JSON.stringify(data).slice(0, 200));
    return true;
  }
  const prefer = onConflict
    ? `resolution=merge-duplicates,return=minimal`
    : "return=minimal";
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...SB_HEADERS, Prefer: prefer },
    body: JSON.stringify(data),
  });
  return res.ok;
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
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
      // 402 = payment required, 422/401 with credit/billing/quota language = exhausted
      const isBillingError =
        res.status === 402 ||
        (res.status === 422 && /credit|insufficient|billing|upgrade|plan/i.test(msg)) ||
        (res.status === 401 && /quota|exceeded|billing|plan|credit/i.test(msg));

      if (isBillingError) {
        console.warn(`    ⊘ ${apiHost} → credits/quota exhausted (HTTP ${res.status}) — disabled for this run`);
        QUOTA_EXHAUSTED.add(apiHost);
        return null;
      }

      // ── Deprecated / gone endpoints ──
      if (res.status === 404 || res.status === 410) {
        console.warn(`    ⊘ ${apiHost} → HTTP ${res.status} (endpoint unavailable) — disabled`);
        QUOTA_EXHAUSTED.add(apiHost);
        return null;
      }

      // ── Temporary rate limit (429): put in cooldown, skip for now, auto-retry next firm ──
      if (res.status === 429) {
        const retryAfterSec = parseInt(res.headers.get("retry-after") || "0", 10);
        // Honour retry-after if given, otherwise use default cooldown
        const coolMs = retryAfterSec > 0 ? retryAfterSec * 1000 : RATE_LIMIT_COOLDOWN_MS;
        RATE_LIMIT_COOLDOWN.set(apiHost, Date.now() + coolMs);
        console.warn(`    ⚠ ${apiHost} → rate limited — cooling down for ${Math.round(coolMs / 1000)}s`);
        return null;
      }

      console.warn(`    ⚠ ${apiHost} → HTTP ${res.status}: ${msg.slice(0, 150)}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    console.warn(`    ⚠ ${apiHost} → ${e instanceof Error ? e.message : String(e)}`);
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
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        Authorization: `Bearer ${JINA_KEY}`,
        Accept: "text/markdown",
        "X-Return-Format": "markdown",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const text = await res.text();
      return text.slice(0, 8000);
    }
    console.warn(`    ⚠ Jina → HTTP ${res.status}`);
  } catch (e) {
    console.warn(`    ⚠ Jina → ${e instanceof Error ? e.message : e}`);
  }
  return "";
}

async function extractFirmDataWithAI(
  firmName: string,
  searchText: string,
  websiteText: string,
  firm: FirmRow
): Promise<EnrichPatch> {
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
  if (!firm.thesis_verticals?.length) emptyFields.push("thesis_verticals (JSON array of sector/vertical strings they focus on, e.g. [\"Fintech\", \"SaaS\", \"AI/ML\", \"Healthcare\"])");
  if (!firm.sector_scope) emptyFields.push(`sector_scope (one of: ${VALID_SECTOR_SCOPE.join(", ")})`);
  if (!firm.thesis_orientation) emptyFields.push(`thesis_orientation (one of: ${VALID_THESIS_ORIENTATION.join(", ")})`);
  if (!firm.geo_focus?.length) emptyFields.push("geo_focus (JSON array of geographies they invest in, e.g. [\"US\", \"Latin America\", \"Global\"])");
  if (firm.is_actively_deploying === null) emptyFields.push("is_actively_deploying (boolean — true if actively investing now, false if not)");

  // Team basics
  if (!firm.total_headcount) emptyFields.push("total_headcount (total number of employees as integer)");
  if (!firm.founded_year) emptyFields.push("founded_year (4-digit integer year the firm was founded)");

  if (emptyFields.length === 0) return {};

  const combined = [
    websiteText ? `=== FIRM WEBSITE ===\n${websiteText}` : "",
    searchText ? `=== WEB RESEARCH ===\n${searchText}` : "",
  ].filter(Boolean).join("\n\n");

  if (!combined || combined.length < 50) return {};

  // Sanitizes raw AI JSON output into a valid DB patch
  function sanitizePatch(parsed: Record<string, any>): EnrichPatch {
    const patch: EnrichPatch = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v == null || v === "" || v === "null" || v === "unknown") continue;
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
    return patch;
  }

  const prompt = `Extract data about the VC firm "${firmName}" from the sources below.

Return ONLY a valid JSON object with EXACTLY these fields (use null for any field you cannot confidently determine from the sources):

${emptyFields.map((f) => `- ${f}`).join("\n")}

STRICT RULES:
- Only include fields listed above
- Use null if uncertain — never guess or hallucinate
- For enum fields, use ONLY the exact values shown — do not invent new values
- For array fields (stage_focus, thesis_verticals, geo_focus), return a JSON array even if only one item
- For check sizes and headcount: integer only, no $ symbols or commas
- For URLs: full URL starting with https://
- For stage_focus: only use exact values from the allowed list

Sources:
${combined.slice(0, 12_000)}`;

  // Helper: call Groq with a specific model tracked under its own virtual host key
  async function tryGroq(model: string, trackHost: string): Promise<EnrichPatch | null> {
    if (!GROQ_KEY || !isAvailable(trackHost)) return null;
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
        const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        const parsed = JSON.parse(cleaned);
        return sanitizePatch(parsed);
      }
    } catch (e) {
      console.warn(`    ⚠ Groq(${model}) extraction failed: ${e instanceof Error ? e.message : e}`);
    }
    return null;
  }

  // Try Groq 70b → Groq 8b → DeepSeek → Gemini (each tracked separately for independent cooldowns)
  {
    const result = await tryGroq("llama-3.3-70b-versatile", "api.groq.com/70b");
    if (result) return result;
  }
  {
    const result = await tryGroq("llama-3.1-8b-instant", "api.groq.com/8b");
    if (result) return result;
  }

  if (DEEPSEEK_KEY && isAvailable("api.deepseek.com")) {
    try {
      const data = await jsonFetch<any>("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${DEEPSEEK_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: "You extract structured data about VC firms. Return only valid JSON with the requested fields. Use null for unknown values." },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
          temperature: 0.1,
        }),
      });
      const content = data?.choices?.[0]?.message?.content;
      if (content) {
        const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        const parsed = JSON.parse(cleaned);
        const patch: EnrichPatch = {};
        for (const [k, v] of Object.entries(parsed)) {
          if (v != null && v !== "" && v !== "null" && (firm as any)[k] == null) {
            patch[k] = v;
          }
        }
        return patch;
      }
    } catch (e) {
      console.warn(`    ⚠ DeepSeek extraction failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  if (GEMINI_KEY && isAvailable("generativelanguage.googleapis.com")) {
    try {
      const data = await jsonFetch<any>(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
          }),
        }
      );
      const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (content) {
        const parsed = JSON.parse(content.trim());
        return sanitizePatch(parsed);
      }
    } catch (e) {
      console.warn(`    ⚠ Gemini extraction failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Final fallback: Perplexity sonar-pro for extraction
  // (asks for JSON output explicitly; used when Groq/DeepSeek/Gemini are all rate-limited)
  if (PERPLEXITY_KEY && isAvailable("api.perplexity.ai")) {
    try {
      const data = await jsonFetch<any>("https://api.perplexity.ai/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${PERPLEXITY_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "sonar-pro",
          messages: [
            {
              role: "system",
              content: "You extract structured data about VC firms and return only valid JSON. Use null for any field you cannot confidently determine.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
        }),
      });
      const content = data?.choices?.[0]?.message?.content;
      if (content) {
        // Perplexity wraps JSON in markdown fences; strip them
        const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
        // Find the first { ... } block in case there's surrounding prose
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return sanitizePatch(parsed);
        }
      }
    } catch (e) {
      console.warn(`    ⚠ Perplexity extraction failed: ${e instanceof Error ? e.message : e}`);
    }
  }

  return {};
}

async function phase1_firmProfiles(): Promise<{ enriched: number; errors: number }> {
  console.log("\n╔═══════════════════════════════════════════════════════════════════════╗");
  console.log("║  PHASE 1: Firm Profile Enrichment (Exa+Tavily+Linkup+Jina → Groq/DeepSeek/Gemini)  ║");
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

  console.log(`  ${firms.length} firms need enrichment\n`);
  const providers = [
    EXA_KEY && "Exa",
    TAVILY_KEY && "Tavily",
    LINKUP_KEY && "Linkup",
    JINA_KEY && "Jina",
    GROQ_KEY && "Groq",
    DEEPSEEK_KEY && "DeepSeek",
    GEMINI_KEY && "Gemini",
  ].filter(Boolean);
  console.log(`  Search: ${[PERPLEXITY_KEY && "Perplexity", EXA_KEY && "Exa", TAVILY_KEY && "Tavily", LINKUP_KEY && "Linkup", JINA_KEY && "Jina"].filter(Boolean).join(", ")}`);
  console.log(`  AI extraction: ${[GROQ_KEY && "Groq", DEEPSEEK_KEY && "DeepSeek", GEMINI_KEY && "Gemini"].filter(Boolean).join(", ")}\n`);

  if (!PERPLEXITY_KEY && !EXA_KEY && !TAVILY_KEY && !JINA_KEY && !LINKUP_KEY) {
    console.log("  ⚠ No search API keys set — cannot gather data. Skipping.\n");
    return { enriched: 0, errors: 0 };
  }
  if (!GROQ_KEY && !DEEPSEEK_KEY && !GEMINI_KEY) {
    console.log("  ⚠ No AI API keys set — cannot extract structured data. Skipping.\n");
    return { enriched: 0, errors: 0 };
  }

  let enriched = 0;
  let errors = 0;

  for (const firm of firms) {
    const domain = domainFromUrl(firm.website_url);
    console.log(`  ▸ ${firm.firm_name}${domain ? ` (${domain})` : ""}`);

    try {
      // Step 1: Gather raw data from multiple search providers in parallel
      const searchPromises: Promise<string>[] = [];
      const searchLabels: string[] = [];

      if (PERPLEXITY_KEY && isAvailable("api.perplexity.ai")) {
        searchPromises.push(enrichFirmWithPerplexity(firm.firm_name, domain));
        searchLabels.push("Perplexity");
      }
      if (EXA_KEY && isAvailable("api.exa.ai")) {
        searchPromises.push(enrichFirmWithExa(firm.firm_name, domain));
        searchLabels.push("Exa");
      }
      if (TAVILY_KEY && isAvailable("api.tavily.com")) {
        searchPromises.push(enrichFirmWithTavily(firm.firm_name, domain));
        searchLabels.push("Tavily");
      }
      if (LINKUP_KEY && isAvailable("api.linkup.so")) {
        searchPromises.push(enrichFirmWithLinkup(firm.firm_name));
        searchLabels.push("Linkup");
      }

      if (searchPromises.length === 0 && !JINA_KEY) {
        console.log(`    — No search providers available for this firm, skipping`);
        continue;
      }

      const searchResults = await Promise.allSettled(searchPromises);
      const searchTexts: string[] = [];
      for (let i = 0; i < searchResults.length; i++) {
        const r = searchResults[i];
        if (r.status === "fulfilled" && r.value) {
          searchTexts.push(r.value);
          console.log(`    ${searchLabels[i]} → ${r.value.length} chars`);
        } else if (r.status === "rejected") {
          console.warn(`    ⚠ ${searchLabels[i]} failed: ${r.reason}`);
        }
      }
      const combinedSearchText = searchTexts.join("\n\n=== NEXT SOURCE ===\n\n");

      // Scrape firm website directly with Jina
      let websiteText = "";
      if (firm.website_url && JINA_KEY) {
        websiteText = await scrapeWebsiteWithJina(firm.website_url);
        if (websiteText) console.log(`    Jina → ${websiteText.length} chars`);
        await sleep(200);
      }

      // Step 2: Extract structured data with AI (Groq → DeepSeek → Gemini → Perplexity waterfall)
      const patch = await extractFirmDataWithAI(firm.firm_name, combinedSearchText, websiteText, firm);
      await sleep(200);

      // Step 3: Write to DB
      patch.last_enriched_at = new Date().toISOString();

      const fieldCount = Object.keys(patch).length - 1; // -1 for last_enriched_at
      if (fieldCount > 0) {
        await sbUpdate("firm_records", firm.id, patch);
        console.log(`    ✓ Updated ${fieldCount} fields: ${Object.keys(patch).filter(k => k !== "last_enriched_at").join(", ")}`);
        enriched++;
      } else {
        // All AI providers were rate-limited — do NOT stamp last_enriched_at so this
        // firm is retried on the next run rather than being skipped for 30 days.
        console.log(`    — No new data extracted (all AI providers rate-limited; skipping last_enriched_at stamp so firm retries next run)`);
        await sleep(20_000);
      }
    } catch (e) {
      errors++;
      console.warn(`    ✗ Error:`, e instanceof Error ? e.message : e);
    }

    await sleep(DELAY_MS);
  }

  if (QUOTA_EXHAUSTED.size > 0) {
    console.log(`\n  ⚠ Providers that hit quota this run: ${[...QUOTA_EXHAUSTED].join(", ")}`);
  }

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

  if (!PERPLEXITY_KEY && !EXA_KEY && !LINKUP_KEY && !JINA_KEY) {
    console.log("  ⚠ No search API keys available (Perplexity/Exa/Linkup/Jina) — skipping Phase 2\n");
    return { enriched: 0, errors: 0 };
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

  for (const firm of firms) {
    console.log(`  ▸ ${firm.firm_name}`);

    try {
      const domain = domainFromUrl(firm.website_url);

      // Step 1: Perplexity research (primary)
      let researchText = await perplexityResearch(firm.firm_name, domain);
      if (researchText) console.log("    Perplexity ✓");
      await sleep(500);

      // Step 2: Exa deal discovery (primary)
      let exaText = await exaDealDiscovery(firm.firm_name);
      if (exaText) console.log("    Exa ✓");
      await sleep(500);

      // Fallback: Linkup + Jina when both Perplexity and Exa are unavailable
      if (!researchText && !exaText) {
        if (LINKUP_KEY && isAvailable("api.linkup.so")) {
          researchText = await enrichFirmWithLinkup(firm.firm_name);
          if (researchText) console.log(`    Linkup → ${researchText.length} chars`);
          await sleep(500);
        }
        if (!researchText && firm.website_url && JINA_KEY && isAvailable("r.jina.ai")) {
          const jinaText = await scrapeWebsiteWithJina(firm.website_url);
          if (jinaText) {
            researchText = jinaText;
            console.log(`    Jina → ${jinaText.length} chars`);
          }
          await sleep(500);
        }
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

      // Step 5: Upsert recent deals
      if (result.recent_deals?.length) {
        // Delete old deals first
        if (!DRY_RUN) {
          await fetch(`${SUPABASE_URL}/rest/v1/firm_recent_deals?firm_id=eq.${firm.id}`, {
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

      // Step 6: Upsert partners as firm_investors
      if (result.current_partners?.length) {
        for (const name of result.current_partners) {
          const nameParts = name.trim().split(/\s+/);
          const firstName = nameParts[0] || "";
          const lastName = nameParts.slice(1).join(" ") || "";

          await sbUpsert("firm_investors", {
            firm_id: firm.id,
            full_name: name.trim(),
            first_name: firstName,
            last_name: lastName,
            is_active: true,
            updated_at: new Date().toISOString(),
          });
        }
        console.log(`    Partners → ${result.current_partners.length} investors`);
      }

      enriched++;
    } catch (e) {
      errors++;
      console.warn(`    ✗ Error:`, e instanceof Error ? e.message : e);
    }

    await sleep(2000); // Rate limit between firms
  }

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
  // Try Firecrawl first
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

  // Try Jina Reader
  if (JINA_KEY) {
    try {
      const res = await fetch(`https://r.jina.ai/${url}`, {
        headers: {
          Authorization: `Bearer ${JINA_KEY}`,
          Accept: "text/markdown",
          "X-Return-Format": "markdown",
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (res.ok) {
        const text = await res.text();
        if (text.length > 100) return text;
      }
    } catch {}
  }

  // Raw fetch fallback
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (res.ok) {
      const html = await res.text();
      return html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 30_000);
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
  investment_themes?: string[];
  location?: string;
}>> {
  const prompt = `Extract all investment professionals from this VC firm team page for "${firmName}". Return a JSON array where each element has: { "first_name": string, "last_name": string, "title": string or null, "bio": string or null, "email": string or null, "linkedin_url": string or null, "x_url": string or null, "avatar_url": string or null, "investment_themes": string[] or null, "location": string or null }. Only include people who are partners, principals, MDs, VPs, associates, or analysts. Exclude administrative/operations staff. Return ONLY the JSON array, no markdown fences.`;

  // Try Groq first (fast), then Gemini
  if (GROQ_KEY) {
    try {
      const data = await jsonFetch<any>("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: "You extract structured data from VC team pages. Return only valid JSON." },
            { role: "user", content: `${prompt}\n\nTeam page content:\n${markdown.slice(0, 15_000)}` },
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

  if (GEMINI_KEY && isAvailable("generativelanguage.googleapis.com")) {
    try {
      const data = await jsonFetch<any>(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${prompt}\n\nTeam page content:\n${markdown.slice(0, 15_000)}` }] }],
            generationConfig: { responseMimeType: "application/json" },
          }),
        }
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
      numResults: 3,
      contents: { text: { maxCharacters: 2000 } },
    }),
  });

  const results = data?.results || [];
  const patch: Record<string, string> = {};

  for (const r of results) {
    const url = r.url || "";
    const text = r.text || "";

    if (!patch.linkedin_url && url.includes("linkedin.com/in/")) {
      patch.linkedin_url = url;
    }
    if (!patch.x_url && (url.includes("twitter.com/") || url.includes("x.com/"))) {
      patch.x_url = url;
    }
    if (!patch.bio && text.length > 50) {
      // Use first 500 chars as a bio snippet
      patch.bio = text.slice(0, 500).trim();
    }
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
      `select=*&firm_id=eq.${firm.id}&deleted_at=is.null&or=(title.is.null,bio.is.null,linkedin_url.is.null,email.is.null,avatar_url.is.null)&limit=50`
    );

    if (!investors.length) continue;

    console.log(`  ▸ ${firm.firm_name} — ${investors.length} investors need enrichment`);

    try {
      // Step 1: Try to scrape the team page for bulk data
      let extractedPeople: any[] = [];
      if (firm.website_url && (FIRECRAWL_KEY || JINA_KEY)) {
        const teamUrl = await discoverTeamPageUrl(firm.website_url);
        if (teamUrl) {
          console.log(`    Team page: ${teamUrl}`);
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
          if (matched.investment_themes?.length && !investor.personal_thesis_tags?.length)
            patch.personal_thesis_tags = matched.investment_themes;
          if (matched.location && !investor.city) {
            const parts = matched.location.split(",").map((s: string) => s.trim());
            if (parts[0]) patch.city = parts[0];
            if (parts[1]) patch.state = parts[1];
          }
          if (!investor.first_name && matched.first_name) patch.first_name = matched.first_name;
          if (!investor.last_name && matched.last_name) patch.last_name = matched.last_name;
        }

        // Enrich remaining gaps with Exa
        if (!patch.linkedin_url && !investor.linkedin_url && EXA_KEY) {
          const exaPatch = await enrichInvestorWithExa(
            investor.full_name,
            firm.firm_name
          );
          for (const [k, v] of Object.entries(exaPatch)) {
            if (!patch[k] && !(investor as any)[k] && v) patch[k] = v;
          }
          await sleep(400);
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

    if (websiteUrl && (JINA_KEY || FIRECRAWL_KEY)) {
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
  const provStatus = (key: string, host: string) =>
    !key ? "✗ no key" : SKIP_PROVIDERS.has(host) ? "⊘ skipped" : "✓";
  console.log(`  Search providers:`);
  console.log(`    Perplexity: ${provStatus(PERPLEXITY_KEY, "api.perplexity.ai")}  Exa: ${provStatus(EXA_KEY, "api.exa.ai")}  Tavily: ${provStatus(TAVILY_KEY, "api.tavily.com")}  Linkup: ${provStatus(LINKUP_KEY, "api.linkup.so")}  Jina: ${provStatus(JINA_KEY, "r.jina.ai")}`);
  console.log(`  AI extraction:`);
  console.log(`    Groq: ${provStatus(GROQ_KEY, "api.groq.com")}  DeepSeek: ${provStatus(DEEPSEEK_KEY, "api.deepseek.com")}  Gemini: ${provStatus(GEMINI_KEY, "generativelanguage.googleapis.com")}`);
  console.log(`  Email/contact:`);
  console.log(`    Hunter: ${provStatus(HUNTER_KEY, "api.hunter.io")}  PDL: ${provStatus(PDL_KEY, "api.peopledatalabs.com")}`);
  if (SKIP_PROVIDERS.size > 0) {
    console.log(`\n  ⊘ Pre-skipped: ${[...SKIP_PROVIDERS].join(", ")}`);
    console.log(`    (add more with: ENRICH_SKIP_PROVIDERS=api.tavily.com,api.exa.ai npx tsx scripts/enrich-all.ts)`);
  }
  console.log(`    Groq: ${GROQ_KEY ? "✓" : "✗"}  Gemini: ${GEMINI_KEY ? "✓" : "✗"}  Firecrawl: ${FIRECRAWL_KEY ? "✓" : "✗"}`);
  console.log(`    Jina: ${JINA_KEY ? "✓" : "✗"}  PDL: ${PDL_KEY ? "✓" : "✗"}  Lusha: ${LUSHA_KEY ? "✓" : "✗"}`);

  // Run audit first
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

  // Summary
  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  ENRICHMENT SUMMARY");
  console.log("═══════════════════════════════════════════════════════════");
  let totalEnriched = 0;
  let totalErrors = 0;
  for (const [phase, { enriched, errors }] of Object.entries(results)) {
    console.log(`  ${phase}: ${enriched} enriched, ${errors} errors`);
    totalEnriched += enriched;
    totalErrors += errors;
  }
  console.log(`\n  TOTAL: ${totalEnriched} records enriched, ${totalErrors} errors`);
  console.log("═══════════════════════════════════════════════════════════\n");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
