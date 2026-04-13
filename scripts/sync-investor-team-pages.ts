/**
 * Crawl firm websites (team/people pages) and upsert vc_people profile details.
 *
 * Scraping strategy (in order):
 *   1. Firecrawl API — best JS-rendered page support (requires FIRECRAWL_API_KEY)
 *   2. Jina Reader   — fast markdown extraction fallback (optional JINA_API_KEY)
 *   3. Raw fetch     — plain HTML fallback
 *
 * Extraction strategy (in order):
 *   1. Gemini via Lovable AI gateway — richest structured output (requires LOVABLE_API_KEY)
 *   2. JSON-LD schema.org/Person     — deterministic, high precision
 *   3. Heuristic HTML/text parsing   — broad coverage fallback
 *
 * Extracts when available:
 * - Name, title/role, photo
 * - Contact details: email, X/Twitter, LinkedIn, Medium, Substack
 * - Bio/background text
 * - Thought leadership/article links (stored in articles JSONB + vc_signals)
 * - Investment themes
 *
 * Usage:
 *   npm run db:sync:investor-teams
 *   INVESTOR_TEAM_MAX_FIRMS=150 npm run db:sync:investor-teams
 *   INVESTOR_TEAM_DRY_RUN=1 npm run db:sync:investor-teams
 *   INVESTOR_TEAM_FIRM_SLUG=sequoia-capital npm run db:sync:investor-teams
 *
 * Env vars:
 *   FIRECRAWL_API_KEY   — Firecrawl scraping (primary)
 *   LOVABLE_API_KEY     — Gemini AI extraction (primary)
 *   JINA_API_KEY        — Jina Reader (optional fallback)
 *   DATABASE_URL        — Postgres connection string
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ── Env loading ───────────────────────────────────────────────────────────────

function loadEnv(): void {
  for (const name of [".env", ".env.local", ".env.enrichment"]) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      if (process.env[m[1]] !== undefined && process.env[m[1]] !== "") continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      if (v) process.env[m[1]] = v;
    }
  }
}
loadEnv();

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not set.");
if (!SERVICE_KEY)  throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set.");

const SB = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

async function sbGet<T>(table: string, select: string, extra = ""): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}&limit=50000${extra}`, { headers: SB });
  if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbGetPaged<T>(
  table: string,
  select: string,
  extra = "",
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=${select}&limit=${pageSize}&offset=${offset}${extra}`,
      { headers: SB },
    );
    if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
    const rows = await res.json() as T[];
    all.push(...rows);
    if (rows.length < pageSize) break;
    offset += rows.length;
  }
  return all;
}

async function sbPatch(table: string, id: string, patch: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...SB, Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) console.warn(`  ✗ PATCH ${table}/${id}: ${res.status}`);
}

async function sbPost<T>(table: string, data: Record<string, unknown>): Promise<T | null> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: { ...SB, Prefer: "return=representation" },
    body: JSON.stringify(data),
  });
  if (!res.ok) { console.warn(`  ✗ POST ${table}: ${res.status} ${await res.text()}`); return null; }
  const rows = await res.json() as T[];
  return rows[0] ?? null;
}

// ── Supabase row type ─────────────────────────────────────────────────────────

type FirmInvestorRow = {
  id: string;
  firm_id: string;
  full_name: string | null;
  first_name: string;
  last_name: string;
  title: string | null;
  bio: string | null;
  email: string | null;
  avatar_url: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  medium_url: string | null;
  substack_url: string | null;
  website_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  stage_focus: string[] | null;
  sector_focus: string[] | null;
  personal_thesis_tags: string[] | null;
  background_summary: string | null;
};

// Stage / Sector string enums (matches existing DB values)
type StageFocus = string;
type SectorFocus = string;

// ---------------------------------------------------------------------------
// AI extraction types
// ---------------------------------------------------------------------------

type ArticleRecord = {
  title: string;
  url: string;
  published_at?: string;
  platform?: "medium" | "substack" | "linkedin" | "twitter" | "company_blog" | "other";
  summary?: string;
};

type AiExtractedPerson = {
  first_name: string;
  last_name: string;
  title?: string;
  bio?: string;
  avatar_url?: string;
  email?: string;
  linkedin_url?: string;
  x_url?: string;
  medium_url?: string;
  substack_url?: string;
  investment_themes?: string[];
  articles?: ArticleRecord[];
  portfolio_companies?: string[];
  location?: string;
  investment_stages?: string[];
  investment_sectors?: string[];
};

type Config = {
  maxFirms: number;
  startOffset: number;
  delayMs: number;
  timeoutMs: number;
  dryRun: boolean;
  overwrite: boolean;
  firmSlug?: string;
  useJinaReader: boolean;
  useFirecrawl: boolean;
  useAiExtraction: boolean;
};

type FirmRow = {
  id: string;
  slug: string;
  firm_name: string;
  website_url: string | null;
  investors: Array<{
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    linkedin_url: string | null;
    website_url: string | null;
  }>;
};

type ExtractedPerson = {
  fullName: string;
  title?: string;
  role?: string;
  bio?: string;
  email?: string;
  linkedinUrl?: string;
  xUrl?: string;
  mediumUrl?: string;
  substackUrl?: string;
  profileUrl?: string;
  avatarUrl?: string;
  thoughtLeadershipUrls: string[];
  investments: string[];
  themes: string[];
  location?: string;
  investmentStages: StageFocus[];
  investmentSectors: SectorFocus[];
  sourceUrl: string;
  confidence: number;
};

type PageFetch = {
  url: string;
  html: string;
  text: string;
};

const TEAM_PATH_HINTS = [
  "#team",
  "#people",
  "#partners",
  "#leadership",
  "/team",
  "/people",
  "/our-team",
  "/partners",
  "/investment-team",
  "/about/team",
  "/about",
];

const TEAM_LINK_RE = /(team|people|partner|investment[-_ ]?team|our[-_ ]?team|leadership)/i;
const INVESTMENT_WORD_RE = /(portfolio|investments?|backed|deals?)/i;
const TITLE_RE = /(partner|principal|associate|investor|analyst|managing director|venture partner|general partner|founder)/i;

function env(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  return raw ? raw : undefined;
}

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function configFromEnv(): Config {
  return {
    maxFirms: Math.max(1, envInt("INVESTOR_TEAM_MAX_FIRMS", 100)),
    startOffset: Math.max(0, envInt("INVESTOR_TEAM_START_OFFSET", 0)),
    delayMs: Math.max(0, envInt("INVESTOR_TEAM_DELAY_MS", 200)),
    timeoutMs: Math.max(1500, envInt("INVESTOR_TEAM_TIMEOUT_MS", 12000)),
    dryRun: envBool("INVESTOR_TEAM_DRY_RUN", false),
    overwrite: envBool("INVESTOR_TEAM_OVERWRITE", false),
    firmSlug: env("INVESTOR_TEAM_FIRM_SLUG"),
    useJinaReader: envBool("INVESTOR_TEAM_USE_JINA", true),
    useFirecrawl: envBool("INVESTOR_TEAM_USE_FIRECRAWL", Boolean(process.env.FIRECRAWL_API_KEY)),
    useAiExtraction: envBool("INVESTOR_TEAM_USE_AI", Boolean(process.env.LOVABLE_API_KEY ?? process.env.GEMINI_API_KEY)),
  };
}

// ---------------------------------------------------------------------------
// Scraping helpers: Firecrawl → ScrapingBee → Jina (waterfall)
// ---------------------------------------------------------------------------

async function firecrawlScrapeMarkdown(url: string): Promise<string | null> {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) return null;

  try {
    const r = await fetch("https://api.firecrawl.dev/v1/scrape", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        formats: ["markdown"],
        onlyMainContent: true,
        timeout: 30000,
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!r.ok) return null;
    const data = await r.json() as Record<string, unknown>;
    const nested = data.data as Record<string, unknown> | undefined;
    return (nested?.markdown ?? data.markdown ?? null) as string | null;
  } catch {
    return null;
  }
}

/** ScrapingBee: renders JS, returns HTML — converted to text via strip */
async function scrapingBeeFetch(url: string): Promise<string | null> {
  const key = process.env.SCRAPING_BEE_API_KEY ?? process.env.SCRAPINGBEE_API_KEY;
  if (!key) return null;

  try {
    const params = new URLSearchParams({
      api_key: key,
      url,
      render_js: "true",
      block_ads: "true",
      block_resources: "false",
    });
    const r = await fetch(`https://app.scrapingbee.com/api/v1/?${params}`, {
      signal: AbortSignal.timeout(45000),
    });
    if (!r.ok) return null;
    const html = await r.text();
    return html ? stripHtml(html) : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scrapeless — JS-rendered scraping (same API shape as the research-pipeline)
// ---------------------------------------------------------------------------

async function scrapelessScrape(url: string): Promise<string | null> {
  const key =
    process.env.SCRAPELESS_API_KEY ??
    process.env.SCRAPELESS_API_TOKEN ??
    process.env.SCRAPELESS_API;
  if (!key) return null;

  const actor = process.env.SCRAPELESS_ACTOR ?? "scraper.browser";

  try {
    const r = await fetch("https://api.scrapeless.com/api/v1/scraper/request", {
      method: "POST",
      headers: { "x-api-token": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        actor,
        input: { url },
        proxy: { country: "US" },
        async: false,
      }),
      signal: AbortSignal.timeout(50_000),
    });

    const raw = await r.text();
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(raw) as Record<string, unknown>; } catch { /* keep raw */ }

    // Handle nested data object
    const nested = typeof data.data === "object" && data.data !== null
      ? (data.data as Record<string, unknown>)
      : {};

    for (const key of ["markdown", "content", "html", "text", "body"]) {
      const v = (data[key] ?? nested[key]) as string | undefined;
      if (typeof v === "string" && v.trim().length > 80) return v;
    }
    // Fallback: raw text if non-empty
    if (raw.trim().length > 80 && !raw.startsWith("{")) return raw;
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Gemini AI extraction
// Waterfall: LOVABLE_API_KEY (gateway) → GEMINI_API_KEY (direct REST)
// ---------------------------------------------------------------------------

const AI_PROMPT_TEMPLATE = (firmName: string, teamPageUrl: string, markdown: string) => `You are a venture capital data analyst.

Team/people page for "${firmName}" scraped from: ${teamPageUrl}

Extract EVERY individual investor, partner, principal, associate, or team member you can identify. Only include data explicitly present — do not invent anything.

Return JSON:
{
  "investors": [
    {
      "first_name": "string",
      "last_name": "string",
      "title": "string or null",
      "bio": "string or null",
      "avatar_url": "string or null",
      "email": "string or null",
      "linkedin_url": "string or null",
      "x_url": "string or null",
      "medium_url": "string or null",
      "substack_url": "string or null",
      "investment_themes": ["string"],
      "articles": [{ "title": "string", "url": "string", "published_at": "YYYY-MM-DD or null", "platform": "medium|substack|linkedin|twitter|company_blog|other", "summary": "string or null" }],
      "portfolio_companies": ["string"],
      "location": "City, State or City, Country — null if unknown",
      "investment_stages": ["Pre-Seed|Seed|Series A|Series B|Series C|Growth|Late Stage|IPO"],
      "investment_sectors": ["Fintech|Enterprise SaaS|AI|Health Tech|Biotech|Consumer|Climate|Mobility|Industrial|Cybersecurity|Media|Web3|EdTech|GovTech|Hardware|Robotics|Marketplace|AgriTech|PropTech"]
    }
  ]
}

Rules:
- first_name and last_name must contain only the person's name (no title, no honorifics).
- title must contain only the role (e.g. "Senior Associate"), never the person's name.
- email must be a literal email address only (no "mailto:" prefix, no extra text).
- portfolio_companies must contain company names only, not categories or sentence fragments.

--- PAGE CONTENT (truncated) ---
${markdown.slice(0, 60_000)}`;

/** Tier 1: Lovable AI gateway (OpenAI-compatible) */
async function aiExtractViaLovable(prompt: string): Promise<AiExtractedPerson[]> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return [];

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!r.ok) return [];
  const data = await r.json() as Record<string, unknown>;
  const choices = data.choices as Array<{ message: { content: string } }>;
  const raw = choices?.[0]?.message?.content ?? "{}";
  return (JSON.parse(raw) as { investors?: AiExtractedPerson[] }).investors ?? [];
}

/** Tier 2b: Groq (OpenAI-compatible, very fast) */
async function aiExtractViaGroq(prompt: string): Promise<AiExtractedPerson[]> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return [];

  const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "You are a VC data analyst. Always respond with valid JSON only — no markdown, no preamble.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 8192,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!r.ok) return [];
  const data = (await r.json()) as { choices?: Array<{ message: { content: string } }> };
  const raw = data.choices?.[0]?.message?.content ?? "{}";
  try {
    return (JSON.parse(raw) as { investors?: AiExtractedPerson[] }).investors ?? [];
  } catch {
    return [];
  }
}

/** Tier 3: Google Gemini direct REST API */
async function aiExtractViaGemini(prompt: string): Promise<AiExtractedPerson[]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return [];

  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
      }),
      signal: AbortSignal.timeout(90_000),
    }
  );

  if (!r.ok) return [];
  const data = await r.json() as Record<string, unknown>;
  const candidates = data.candidates as Array<{ content: { parts: Array<{ text: string }> } }>;
  const raw = candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  return (JSON.parse(raw) as { investors?: AiExtractedPerson[] }).investors ?? [];
}

async function aiExtractPeople(
  firmName: string,
  markdown: string,
  teamPageUrl: string
): Promise<AiExtractedPerson[]> {
  if (!markdown.trim()) return [];

  const prompt = AI_PROMPT_TEMPLATE(firmName, teamPageUrl, markdown);

  try {
    // Tier 1: Lovable gateway
    if (process.env.LOVABLE_API_KEY) {
      const people = await aiExtractViaLovable(prompt);
      if (people.length > 0) return people;
    }

    // Tier 2: Groq (fast, generous free tier)
    if (process.env.GROQ_API_KEY) {
      const people = await aiExtractViaGroq(prompt);
      if (people.length > 0) return people;
    }

    // Tier 3: Direct Gemini API
    if (process.env.GEMINI_API_KEY) {
      const people = await aiExtractViaGemini(prompt);
      if (people.length > 0) return people;
    }
  } catch {
    // fall through to heuristic extraction
  }

  return [];
}

// ---------------------------------------------------------------------------
// Unified investor enrichment waterfall
// Sources: EXA → SerpWow → LinkUp (search/profile results)
//          + Lusha / Exporium (contact lookup)
// ---------------------------------------------------------------------------

/** Normalised result from any search/profile provider */
interface EnrichResult {
  url: string;
  title: string;
  snippet?: string;
  publishedDate?: string;
}

/** EXA neural search */
async function searchExa(queries: string[]): Promise<EnrichResult[]> {
  const key = process.env.EXA_API_KEY;
  if (!key) return [];
  const out: EnrichResult[] = [];
  for (const query of queries) {
    try {
      const r = await fetch("https://api.exa.ai/search", {
        method: "POST",
        headers: { "x-api-key": key, "Content-Type": "application/json" },
        body: JSON.stringify({ query, type: "neural", numResults: 5, contents: { text: { maxCharacters: 1500 } } }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!r.ok) continue;
      const data = await r.json() as { results?: Array<{ url: string; title: string; text?: string; publishedDate?: string }> };
      out.push(...(data.results ?? []).map((x) => ({ url: x.url, title: x.title, snippet: x.text, publishedDate: x.publishedDate })));
    } catch { continue; }
  }
  return out;
}

/** SerpWow Google search */
async function searchSerpWow(query: string): Promise<EnrichResult[]> {
  const key = process.env.SERPWOW_API_KEY ?? process.env.SERP_WOW_API_KEY ?? process.env.SERPWOW_API;
  if (!key) return [];
  try {
    const params = new URLSearchParams({ q: query, api_key: key, engine: "google", num: "10", output: "json" });
    const r = await fetch(`https://api.serpwow.com/live/search?${params}`, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return [];
    const data = await r.json() as { organic_results?: Array<{ link: string; title: string; snippet?: string }> };
    return (data.organic_results ?? []).map((o) => ({ url: o.link, title: o.title, snippet: o.snippet }));
  } catch {
    return [];
  }
}

/** LinkUp deep professional search */
async function searchLinkUp(query: string): Promise<EnrichResult[]> {
  const key = process.env.LINKUP_API_KEY ?? process.env.LINKUP_API;
  if (!key) return [];
  try {
    const r = await fetch("https://api.linkup.so/v1/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ q: query, depth: "standard", outputType: "searchResults" }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return [];
    const data = await r.json() as { results?: Array<{ url: string; name?: string; title?: string; content?: string }> };
    return (data.results ?? []).map((o) => ({ url: o.url, title: o.title ?? o.name ?? "", snippet: o.content }));
  } catch {
    return [];
  }
}

/** Lusha contact lookup — returns email + LinkedIn URL when found */
async function lushaLookup(
  firstName: string,
  lastName: string,
  firmName: string,
  linkedinUrl?: string
): Promise<Partial<AiExtractedPerson>> {
  const key = process.env.LUSHA_API_KEY ?? process.env.LUSHA_API;
  if (!key) return {};
  try {
    // Lusha Person API — query by name + company
    const params = new URLSearchParams({ firstName, lastName, company: firmName });
    if (linkedinUrl) params.set("linkedInUrl", linkedinUrl);
    const r = await fetch(`https://api.lusha.com/person?${params}`, {
      headers: { api_key: key },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return {};
    const data = await r.json() as {
      emailAddresses?: Array<{ email: string }>;
      email?: string;
      linkedIn?: string;
      linkedInUrl?: string;
    };
    const email = data.emailAddresses?.[0]?.email ?? data.email;
    const linkedin_url = data.linkedIn ?? data.linkedInUrl;
    return {
      ...(email ? { email } : {}),
      ...(linkedin_url ? { linkedin_url } : {}),
    };
  } catch {
    return {};
  }
}

/** People Data Labs — returns email, LinkedIn, X, and other social data */
async function pdlLookup(
  firstName: string,
  lastName: string,
  firmName: string,
  linkedinUrl?: string
): Promise<Partial<AiExtractedPerson>> {
  const key =
    process.env.PEOPLE_DATA_LABS_API_KEY ??
    process.env.PDL_API_KEY ??
    process.env.PEOPLEDATALABS_API_KEY;
  if (!key) return {};
  try {
    const payload: Record<string, unknown> = {
      first_name: firstName,
      last_name: lastName,
      name: `${firstName} ${lastName}`,
      company: firmName,
    };
    if (linkedinUrl) payload.profile = linkedinUrl;

    const r = await fetch("https://api.peopledatalabs.com/v5/person/enrich", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return {};
    const data = await r.json() as {
      data?: {
        emails?: Array<{ address: string }>;
        linkedin_url?: string;
        twitter_url?: string;
        profiles?: Array<{ url: string; network: string }>;
      };
      status?: number;
    };
    if (data.status && data.status !== 200) return {};
    const d = data.data ?? (data as typeof data.data);
    if (!d) return {};

    const result: Partial<AiExtractedPerson> = {};
    const emailAddr = d.emails?.[0]?.address;
    if (emailAddr) result.email = emailAddr;
    if (d.linkedin_url) result.linkedin_url = d.linkedin_url;
    if (d.twitter_url) result.x_url = d.twitter_url;
    // Also check profiles array for Medium / Substack
    for (const p of d.profiles ?? []) {
      const u = p.url?.toLowerCase() ?? "";
      if (!result.linkedin_url && u.includes("linkedin.com")) result.linkedin_url = p.url;
      if (!result.x_url && (u.includes("twitter.com") || u.includes("x.com"))) result.x_url = p.url;
    }
    return result;
  } catch {
    return {};
  }
}

/** Exporium — configurable enrichment endpoint (set EXPORIUM_API_URL + EXPORIUM_API_KEY) */
async function exporiuEnrich(
  firstName: string,
  lastName: string,
  firmName: string,
  extra?: Record<string, string>
): Promise<Partial<AiExtractedPerson>> {
  const key = process.env.EXPORIUM_API_KEY;
  const url = process.env.EXPORIUM_API_URL;
  if (!key || !url) return {};
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ firstName, lastName, company: firmName, ...(extra ?? {}) }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return {};
    const data = await r.json() as Record<string, unknown>;
    const pick = (k: string) => (typeof data[k] === "string" ? data[k] as string : undefined);
    return {
      ...(pick("email") ? { email: pick("email") } : {}),
      ...(pick("linkedin_url") ? { linkedin_url: pick("linkedin_url") } : {}),
      ...(pick("x_url") ? { x_url: pick("x_url") } : {}),
      ...(pick("medium_url") ? { medium_url: pick("medium_url") } : {}),
      ...(pick("substack_url") ? { substack_url: pick("substack_url") } : {}),
    };
  } catch {
    return {};
  }
}

/** Apply a list of EnrichResults to fill social links, articles, and themes on a person */
function applyEnrichResults(
  person: AiExtractedPerson,
  enriched: Partial<AiExtractedPerson>,
  results: EnrichResult[]
): void {
  // Social links — only fill gaps
  for (const res of results) {
    const u = res.url.toLowerCase();
    if (!person.linkedin_url && !enriched.linkedin_url && u.includes("linkedin.com/in/")) {
      enriched.linkedin_url = res.url;
    }
    if (!person.x_url && !enriched.x_url && (u.includes("twitter.com/") || u.includes("x.com/")) && !u.includes("/status/")) {
      enriched.x_url = res.url;
    }
    if (!person.medium_url && !enriched.medium_url && u.includes("medium.com/@")) {
      enriched.medium_url = res.url.split("/").slice(0, 4).join("/");
    }
    if (!person.substack_url && !enriched.substack_url && u.includes("substack.com") && !u.includes("/p/")) {
      enriched.substack_url = res.url.split("/p/")[0];
    }
  }

  // Articles
  const existingUrls = new Set([...(person.articles ?? []), ...(enriched.articles ?? [])].map((a) => a.url));
  const newArticles: ArticleRecord[] = [...(person.articles ?? [])];
  for (const res of results) {
    const u = res.url.toLowerCase();
    const isArticle =
      (u.includes("medium.com") && u.includes("/p/")) ||
      (u.includes("substack.com") && u.includes("/p/")) ||
      u.includes("linkedin.com/pulse/");
    if (!isArticle || existingUrls.has(res.url)) continue;
    existingUrls.add(res.url);
    const platform: ArticleRecord["platform"] = u.includes("medium.com")
      ? "medium" : u.includes("substack.com") ? "substack" : u.includes("linkedin.com") ? "linkedin" : "other";
    newArticles.push({
      title: res.title || "Untitled",
      url: res.url,
      published_at: res.publishedDate?.slice(0, 10),
      platform,
      summary: res.snippet?.slice(0, 300),
    });
  }
  if (newArticles.length > (person.articles?.length ?? 0)) enriched.articles = newArticles;

  // Investment themes (heuristic from snippet/text)
  if (!person.investment_themes?.length && !enriched.investment_themes?.length) {
    const corpus = results.map((r) => r.snippet ?? "").join(" ");
    const themeMap: Array<[RegExp, string]> = [
      [/\bai\b|artificial intelligence|machine learning/i, "AI / ML"],
      [/\bfintech|payments|insurtech/i, "Fintech"],
      [/\bdeveloper tools?|devtools|infrastructure/i, "Developer Tools"],
      [/\bhealth(?:tech)?|biotech|medtech/i, "Health / Bio"],
      [/\bclimate|clean ?tech|sustainability/i, "Climate / Clean Tech"],
      [/\benterprise|b2b\b|saas\b/i, "Enterprise / B2B"],
      [/\bconsumer|marketplace|d2c\b/i, "Consumer / Marketplace"],
      [/\bcyber|security\b/i, "Cybersecurity"],
      [/\bweb3|crypto|blockchain/i, "Web3 / Crypto"],
    ];
    const themes = themeMap.filter(([re]) => re.test(corpus)).map(([, label]) => label);
    if (themes.length > 0) enriched.investment_themes = themes;
  }
}

async function exaEnrichPerson(
  person: AiExtractedPerson,
  firmName: string
): Promise<Partial<AiExtractedPerson>> {
  const fullName = `${person.first_name} ${person.last_name}`;
  const enriched: Partial<AiExtractedPerson> = {};
  const hasAnySearchKey =
    process.env.EXA_API_KEY ||
    (process.env.SERPWOW_API_KEY ?? process.env.SERP_WOW_API_KEY) ||
    process.env.LINKUP_API_KEY;
  if (!hasAnySearchKey) {
    // Still try contact enrichment providers
    const [lusha, pdl, exporium] = await Promise.all([
      lushaLookup(person.first_name, person.last_name, firmName, person.linkedin_url ?? undefined),
      pdlLookup(person.first_name, person.last_name, firmName, person.linkedin_url ?? undefined),
      exporiuEnrich(person.first_name, person.last_name, firmName),
    ]);
    return { ...pdl, ...lusha, ...exporium }; // later providers override earlier (Exporium > Lusha > PDL for contact)
  }

  const baseQuery = `"${fullName}" "${firmName}" venture capital investor`;
  const articleQuery =
    !person.articles?.length
      ? `"${fullName}" site:medium.com OR site:substack.com`
      : null;

  const queries = [baseQuery, ...(articleQuery ? [articleQuery] : [])];

  // Run all search providers concurrently
  const [exaResults, serpResults, linkupResults] = await Promise.all([
    searchExa(queries),
    searchSerpWow(baseQuery),
    searchLinkUp(baseQuery),
  ]);

  const allResults = [...exaResults, ...serpResults, ...linkupResults];

  if (allResults.length > 0) {
    applyEnrichResults(person, enriched, allResults);
  }

  // Contact lookup providers (PDL + Lusha + Exporium) — run concurrently
  const currentLinkedin = enriched.linkedin_url ?? person.linkedin_url ?? undefined;
  const [pdl, lusha, exporium] = await Promise.all([
    pdlLookup(person.first_name, person.last_name, firmName, currentLinkedin),
    lushaLookup(person.first_name, person.last_name, firmName, currentLinkedin),
    exporiuEnrich(person.first_name, person.last_name, firmName, {
      ...(person.linkedin_url ? { linkedinUrl: person.linkedin_url } : {}),
    }),
  ]);

  // Only fill gaps — don't overwrite AI-extracted contact data
  // Priority: Exporium > Lusha > PDL (most specific wins)
  for (const src of [pdl, lusha, exporium]) {
    if (!person.email && !enriched.email && src.email) enriched.email = src.email;
    if (!person.linkedin_url && !enriched.linkedin_url && src.linkedin_url) enriched.linkedin_url = src.linkedin_url;
    if (!person.x_url && !enriched.x_url && src.x_url) enriched.x_url = src.x_url;
    if (!person.medium_url && !enriched.medium_url && src.medium_url) enriched.medium_url = src.medium_url;
    if (!person.substack_url && !enriched.substack_url && src.substack_url) enriched.substack_url = src.substack_url;
  }

  return enriched;
}

async function exaEnrichBatch(people: AiExtractedPerson[], firmName: string): Promise<AiExtractedPerson[]> {
  if (!process.env.EXA_API_KEY) return people;
  const CONCURRENCY = 3;
  const out = [...people];
  for (let i = 0; i < people.length; i += CONCURRENCY) {
    const batch = people.slice(i, i + CONCURRENCY);
    const patches = await Promise.all(batch.map((p) => exaEnrichPerson(p, firmName).catch(() => ({} as Partial<AiExtractedPerson>))));
    for (let j = 0; j < batch.length; j++) {
      if (patches[j] && Object.keys(patches[j]).length > 0) out[i + j] = { ...out[i + j], ...patches[j] };
    }
  }
  return out;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
    return u.toString();
  } catch {
    return null;
  }
}

function socialAvatarUrl(profileUrl: string | null | undefined): string | null {
  const normalized = normalizeUrl(profileUrl ?? "");
  return normalized ? `https://unavatar.io/${encodeURIComponent(normalized)}` : null;
}

function isLikelyHeadshotUrl(rawUrl: string | null | undefined): boolean {
  const normalized = normalizeUrl(rawUrl ?? "");
  if (!normalized) return false;
  const lower = normalized.toLowerCase();
  if (!/\.(jpg|jpeg|png|webp|avif)(\?|$)/.test(lower)) return false;
  if (/(logo|favicon|icon|sprite|banner|hero|background|wordmark|placeholder)/.test(lower)) return false;
  return true;
}

function resolvePreferredAvatarUrl(
  websiteAvatarUrl: string | null | undefined,
  linkedinUrl: string | null | undefined,
  xUrl: string | null | undefined,
): string | null {
  const websiteAvatar = normalizeUrl(websiteAvatarUrl ?? "");
  if (websiteAvatar && isLikelyHeadshotUrl(websiteAvatar)) return websiteAvatar;
  const liAvatar = socialAvatarUrl(linkedinUrl);
  if (liAvatar) return liAvatar;
  const xAvatar = socialAvatarUrl(xUrl);
  if (xAvatar) return xAvatar;
  return null;
}

function toAbsoluteUrl(href: string, baseUrl: string): string | null {
  const h = href.trim();
  if (!h || h === "#" || h.startsWith("javascript:")) return null;
  try {
    return new URL(h, baseUrl).toString();
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function parseHost(url: string): string {
  return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
}

function uniq<T>(vals: T[]): T[] {
  return [...new Set(vals)];
}

const NON_COMPANY_TOKENS_RE =
  /^(portfolio|investments?|deals?|investment notes|source|visit website|learn more|all companies|active|exited|acquired|ipo|healthcare|cybersecurity|data \+ ai|enterprise|consumer\/marketplace)$/i;

function isLikelyCompanyName(value: string): boolean {
  const v = value.trim().replace(/\s+/g, " ");
  if (!v || v.length < 2 || v.length > 70) return false;
  if (NON_COMPANY_TOKENS_RE.test(v)) return false;
  if (/https?:\/\//i.test(v) || /@/.test(v)) return false;
  if (/[!?]/.test(v)) return false;
  if (/^(the|and|for|with)\b/i.test(v)) return false;
  if (!/[A-Za-z]/.test(v)) return false;
  // Avoid sentence-like fragments.
  if (v.split(/\s+/).length > 5) return false;
  return true;
}

function sanitizeCompanyNames(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const cleaned = raw.replace(/^[-•*]\s*/, "").trim();
    if (!isLikelyCompanyName(cleaned)) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function chunk<T>(vals: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < vals.length; i += size) out.push(vals.slice(i, i + size));
  return out;
}

function firstNonEmpty(...vals: Array<string | null | undefined>): string | undefined {
  for (const v of vals) {
    const t = v?.trim();
    if (t) return t;
  }
  return undefined;
}

function extractLinks(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const re = /href=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null = null;
  while ((m = re.exec(html))) {
    const abs = toAbsoluteUrl(m[1], baseUrl);
    if (abs) urls.push(abs);
  }
  return uniq(urls);
}

async function fetchText(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; VEKTA-InvestorTeamSync/1.0)",
        accept: "text/html,application/xhtml+xml,application/json,text/plain,*/*",
      },
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPage(url: string, cfg: Config): Promise<PageFetch & { markdown?: string } | null> {
  const prefersJina = cfg.useJinaReader && (url.includes("#") || TEAM_LINK_RE.test(url));

  const fetchViaJina = async (): Promise<(PageFetch & { markdown?: string }) | null> => {
    const jinaKey = process.env.JINA_API_KEY ?? "";
    const jinaHeaders: Record<string, string> = {
      Accept: "text/plain",
      "X-Return-Format": "markdown",
      "X-Timeout": "20",
      ...(jinaKey ? { Authorization: `Bearer ${jinaKey}` } : {}),
    };
    const jinaText = await (async () => {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), cfg.timeoutMs);
      try {
        const r = await fetch(`https://r.jina.ai/${url}`, { headers: jinaHeaders, signal: controller.signal });
        return r.ok ? await r.text() : null;
      } catch { return null; } finally { clearTimeout(t); }
    })();
    if (jinaText && jinaText.trim().length > 120) {
      return { url, html: jinaText, text: jinaText, markdown: jinaText };
    }
    return null;
  };

  if (prefersJina) {
    const preferred = await fetchViaJina();
    if (preferred) return preferred;
  }

  // Tier 1: Firecrawl — best markdown output for JS-rendered pages
  if (cfg.useFirecrawl) {
    const markdown = await firecrawlScrapeMarkdown(url);
    if (markdown && markdown.trim().length > 100) {
      const html = await fetchText(url, cfg.timeoutMs) ?? "";
      return { url, html, text: markdown, markdown };
    }
  }

  // Tier 2: ScrapingBee — JS rendering, returns HTML
  const sbKey = process.env.SCRAPING_BEE_API_KEY ?? process.env.SCRAPINGBEE_API_KEY;
  if (sbKey) {
    const sbText = await scrapingBeeFetch(url);
    if (sbText && sbText.trim().length > 100) {
      return { url, html: sbText, text: sbText };
    }
  }

  // Tier 3: Scrapeless — headless browser scraping
  const slContent = await scrapelessScrape(url);
  if (slContent && slContent.trim().length > 100) {
    return { url, html: slContent, text: slContent, markdown: slContent };
  }

  // Tier 4: Jina Reader — fast markdown extraction
  if (cfg.useJinaReader) {
    const viaJina = await fetchViaJina();
    if (viaJina) return viaJina;
  }

  // Tier 5: Raw fetch + strip HTML
  const html = await fetchText(url, cfg.timeoutMs);
  if (!html) return null;

  return { url, html, text: stripHtml(html) };
}

function discoverTeamPages(homeUrl: string, homeHtml: string): string[] {
  const host = parseHost(homeUrl);
  const normalizeNoHash = (url: string): string => {
    try {
      const u = new URL(url);
      u.hash = "";
      return u.toString();
    } catch {
      return url;
    }
  };
  const links = extractLinks(homeHtml, homeUrl)
    .filter((u) => parseHost(u) === host)
    .filter((u) => TEAM_LINK_RE.test(u))
    .map(normalizeNoHash);

  const hinted = TEAM_PATH_HINTS
    .map((path) => toAbsoluteUrl(path, homeUrl))
    .filter((u): u is string => Boolean(u))
    .map(normalizeNoHash);

  return uniq([...hinted, ...links]).slice(0, 20);
}

function extractXmlLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)]
    .map((m) => m[1]?.trim())
    .filter((v): v is string => Boolean(v));
}

async function discoverTeamPagesFromSitemaps(homeUrl: string, cfg: Config): Promise<string[]> {
  const host = parseHost(homeUrl);
  const seeds = uniq([
    toAbsoluteUrl("/sitemap_index.xml", homeUrl),
    toAbsoluteUrl("/sitemap.xml", homeUrl),
  ].filter((u): u is string => Boolean(u)));

  const sitemapUrls: string[] = [];
  const pageUrls: string[] = [];
  const visited = new Set<string>();
  const queue = [...seeds];

  while (queue.length && visited.size < 16) {
    const next = queue.shift();
    if (!next || visited.has(next)) continue;
    visited.add(next);
    const xml = await fetchText(next, Math.min(cfg.timeoutMs, 20_000));
    if (!xml || !xml.includes("<loc>")) continue;

    const locs = extractXmlLocs(xml)
      .map((u) => normalizeUrl(u))
      .filter((u): u is string => Boolean(u))
      .filter((u) => parseHost(u) === host);

    if (/<sitemapindex/i.test(xml)) {
      for (const loc of locs) {
        if (visited.has(loc)) continue;
        if (!/sitemap/i.test(loc)) continue;
        sitemapUrls.push(loc);
        queue.push(loc);
      }
      continue;
    }

    pageUrls.push(...locs);
  }

  const teamLike = pageUrls.filter((u) =>
    /(\/team-member\/|\/team\/|\/people\/|\/partners?\/|\/leadership\/|\/investment-team\/|\/our-team\/)/i.test(u),
  );

  return uniq(teamLike).slice(0, 80);
}

function normName(name: string): string {
  return name.toLowerCase().replace(/[^a-z\s'.-]/g, "").replace(/\s+/g, " ").trim();
}

function isLikelyPersonName(raw: string): boolean {
  const t = raw.trim();
  if (t.length < 5 || t.length > 60) return false;
  if (/\d/.test(t)) return false;
  if (/\b(wharf|street|st\.?|avenue|ave\.?|road|rd\.?|suite|floor|building|parkway|blvd|drive|dr\.?)\b/i.test(t)) return false;
  if (/\b(ventures|capital|partners|management|holdings|group|corporation)\b/i.test(t)) return false;
  if (/^(not found|page not found|404)$/i.test(t)) return false;
  if (/^(sector focus|stage focus|investment focus|visit website|view profile|team member|read more|learn more|portfolio|investments?)$/i.test(t)) return false;
  if (/^(our mission|board partner|brand partner|design partner|venture partner|founder\s*&\s*ceo|partner)$/i.test(t)) return false;
  if (/(team|portfolio|investments|contact|about|career|jobs|press|privacy|cookie)/i.test(t)) return false;
  if (!/^[A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,3}$/.test(t)) return false;
  return true;
}

function splitName(fullName: string): { first: string; last: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) return { first: parts[0] || "Investment", last: "Team" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function nameMatchesTeamMemberSlug(name: string, sourceUrl: string): boolean {
  const match = sourceUrl.match(/\/team-member\/([^/?#]+)/i);
  if (!match?.[1]) return true;
  const slugTokens = match[1]
    .replace(/-\d+$/, "")
    .split("-")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (slugTokens.length < 2) return true;
  const nameTokens = name
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z]/g, ""))
    .filter(Boolean);
  if (nameTokens.length < 2) return false;
  const intersection = slugTokens.filter((t) => nameTokens.includes(t));
  return intersection.length >= 2;
}

function sanitizeEmail(raw: string | null | undefined): string | undefined {
  const value = raw?.trim().toLowerCase();
  if (!value) return undefined;
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value)) return undefined;
  if (/example\.com$/.test(value)) return undefined;
  return value;
}

function sanitizeExtractedName(raw: string | null | undefined): string | undefined {
  const value = raw?.replace(/\s+/g, " ").trim();
  if (!value) return undefined;
  // Remove accidental "Name, Title" style payloads.
  const candidate = value.split("|")[0].split(",")[0].trim();
  if (!isLikelyPersonName(candidate)) return undefined;
  return candidate;
}

function sanitizeExtractedTitle(raw: string | null | undefined, fullName: string): string | undefined {
  const value = raw?.replace(/\s+/g, " ").trim();
  if (!value) return undefined;
  const escapedName = escapeRe(fullName);
  const stripped = value
    .replace(new RegExp(`^${escapedName}[\\s,:|\\-–—]*`, "i"), "")
    .replace(new RegExp(`[\\s,:|\\-–—]*${escapedName}$`, "i"), "")
    .trim();
  if (!stripped) return undefined;
  if (stripped.length > 110) return undefined;
  if (/^(email|linkedin|x|twitter|portfolio|investments?|sector focus|location)$/i.test(stripped)) return undefined;
  if (/https?:\/\//i.test(stripped) || /@/.test(stripped)) return undefined;
  return stripped;
}

function normalizeExtractedPerson(raw: ExtractedPerson): ExtractedPerson | null {
  const fullName = sanitizeExtractedName(raw.fullName);
  if (!fullName) return null;
  const title = sanitizeExtractedTitle(raw.title ?? raw.role, fullName);
  const linkedinUrl = normalizeUrl(raw.linkedinUrl ?? "");
  const xUrl = normalizeUrl(raw.xUrl ?? "");
  const mediumUrl = normalizeUrl(raw.mediumUrl ?? "");
  const substackUrl = normalizeUrl(raw.substackUrl ?? "");
  const profileUrl = normalizeUrl(raw.profileUrl ?? "");
  const avatarUrl = normalizeUrl(raw.avatarUrl ?? "");
  const email = sanitizeEmail(raw.email);
  const location = raw.location?.trim() || undefined;
  return {
    ...raw,
    fullName,
    title,
    role: title,
    email,
    linkedinUrl: linkedinUrl || undefined,
    xUrl: xUrl || undefined,
    mediumUrl: mediumUrl || undefined,
    substackUrl: substackUrl || undefined,
    profileUrl: profileUrl || undefined,
    avatarUrl: avatarUrl || undefined,
    location,
    investments: sanitizeCompanyNames(raw.investments ?? []),
    themes: uniq((raw.themes ?? []).map((t) => t.trim()).filter(Boolean)),
  };
}

function normalizeAiPerson(raw: AiExtractedPerson): {
  first: string;
  last: string;
  fullName: string;
  title?: string;
  email?: string;
  linkedinUrl?: string | null;
  xUrl?: string | null;
  mediumUrl?: string | null;
  substackUrl?: string | null;
  preferredAvatar: string | null;
  portfolioCompanies: string[];
} | null {
  const rawFirst = raw.first_name?.trim();
  const rawLast = raw.last_name?.trim();
  if (!rawFirst || !rawLast) return null;

  const combined = `${rawFirst} ${rawLast}`.replace(/\s+/g, " ").trim();
  let fullName = sanitizeExtractedName(combined);
  let inferredTitle: string | undefined;

  if (!fullName) {
    const tokens = combined.split(/\s+/).filter(Boolean);
    for (let splitIdx = 2; splitIdx < tokens.length; splitIdx += 1) {
      const nameCandidate = tokens.slice(0, splitIdx).join(" ");
      if (!isLikelyPersonName(nameCandidate)) continue;
      const roleCandidate = tokens.slice(splitIdx).join(" ");
      const cleanRole = sanitizeExtractedTitle(roleCandidate, nameCandidate);
      if (!cleanRole || !TITLE_RE.test(cleanRole)) continue;
      fullName = nameCandidate;
      inferredTitle = cleanRole;
      break;
    }
  }

  if (!fullName) return null;

  const split = splitName(fullName);
  const title = sanitizeExtractedTitle(raw.title ?? null, fullName) ?? inferredTitle;
  const email = sanitizeEmail(raw.email ?? null);
  const linkedinUrl = normalizeUrl(raw.linkedin_url ?? "") ?? null;
  const xUrl = normalizeUrl(raw.x_url ?? "") ?? null;
  const mediumUrl = normalizeUrl(raw.medium_url ?? "") ?? null;
  const substackUrl = normalizeUrl(raw.substack_url ?? "") ?? null;
  const preferredAvatar = resolvePreferredAvatarUrl(raw.avatar_url ?? null, linkedinUrl, xUrl);
  const portfolioCompanies = sanitizeCompanyNames(raw.portfolio_companies ?? []);

  return {
    first: split.first,
    last: split.last,
    fullName,
    title,
    email,
    linkedinUrl,
    xUrl,
    mediumUrl,
    substackUrl,
    preferredAvatar,
    portfolioCompanies,
  };
}

function extractEmails(s: string): string[] {
  const matches = s.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  return uniq(matches.map((v) => v.toLowerCase()));
}

function extractUrls(s: string): string[] {
  const matches = s.match(/https?:\/\/[^\s"'<>\])]+/gi) || [];
  return uniq(matches);
}

function classifySocial(urls: string[]): {
  linkedinUrl?: string;
  xUrl?: string;
  mediumUrl?: string;
  substackUrl?: string;
} {
  const out: { linkedinUrl?: string; xUrl?: string; mediumUrl?: string; substackUrl?: string } = {};
  for (const u of urls) {
    const v = u.toLowerCase();
    if (!out.linkedinUrl && /linkedin\.com\/(in|pub|company)\//.test(v)) out.linkedinUrl = u;
    if (!out.xUrl && /(x\.com|twitter\.com)\//.test(v)) out.xUrl = u;
    if (!out.mediumUrl && /medium\.com\//.test(v)) out.mediumUrl = u;
    if (!out.substackUrl && /substack\.com\//.test(v)) out.substackUrl = u;
  }
  return out;
}

function extractThemes(text: string): string[] {
  const lower = text.toLowerCase();
  const themeMap: Array<[RegExp, string]> = [
    [/\bai|artificial intelligence|machine learning\b/i, "AI"],
    [/\bfintech|payments|insurtech\b/i, "Fintech"],
    [/\bdeveloper tools|devtools\b/i, "Developer Tools"],
    [/\bhealth|biotech|medtech\b/i, "Health/Bio"],
    [/\bclimate|energy|sustainab/i, "Climate"],
    [/\benterprise|b2b\b/i, "Enterprise"],
    [/\bconsumer|marketplace\b/i, "Consumer/Marketplace"],
    [/\bcyber|security\b/i, "Cybersecurity"],
    [/\bweb3|crypto|blockchain\b/i, "Web3/Crypto"],
  ];
  const out: string[] = [];
  for (const [re, label] of themeMap) {
    if (re.test(lower)) out.push(label);
  }
  return uniq(out).slice(0, 8);
}

  // ---------------------------------------------------------------------------
  // Location / Stage / Sector helpers
  // ---------------------------------------------------------------------------

  function parseLocation(str: string): { city?: string; state?: string; country?: string } {
    if (!str?.trim()) return {};
    const raw = str.trim().replace(/\s+/g, " ");
    const cityStateTail = raw.match(/([A-Z][A-Za-z .'-]+),\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/);
    if (cityStateTail) {
      return { city: cityStateTail[1].trim(), state: cityStateTail[2].trim(), country: "USA" };
    }
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return {};
    if (parts.length === 1) return { city: parts[0] };
    if (parts.length === 2) {
      const [city, stateOrCountry] = parts;
      if (/^[A-Z]{2}$/.test(stateOrCountry)) return { city, state: stateOrCountry, country: "USA" };
      return { city, country: stateOrCountry };
    }
    return { city: parts[0], state: parts[1], country: parts[2] };
  }

  const STAGE_RE_MAP: Array<[RegExp, StageFocus]> = [
    [/pre.?seed|angel\s*stage|pre\s*series/i, "PRE_SEED"],
    [/\bseed\b/i, "SEED"],
    [/series[\s-]?a\b/i, "SERIES_A"],
    [/series[\s-]?b\b/i, "SERIES_B"],
    [/series[\s-]?c\b/i, "SERIES_C"],
    [/growth[\s-]?stage|growth[\s-]?equity/i, "GROWTH"],
    [/late[\s-]?stage|series[\s-]?[d-z]\b/i, "LATE"],
    [/\bipo\b|pre.?ipo/i, "IPO"],
  ];

  const SECTOR_RE_MAP: Array<[RegExp, SectorFocus]> = [
    [/fintech|payments|insurtech|neobank/i, "FINTECH"],
    [/enterprise[\s-]?saa?s|b2b[\s-]?saa?s/i, "ENTERPRISE_SAAS"],
    [/\bai\b|machine[\s-]?learning|artificial[\s-]?intelligence/i, "AI"],
    [/health[\s-]?tech|digital[\s-]?health|medtech/i, "HEALTHTECH"],
    [/biotech|life[\s-]?sciences?/i, "BIOTECH"],
    [/\bconsumer\b|d2c\b|direct.to.consumer/i, "CONSUMER"],
    [/climate[\s-]?tech|clean[\s-]?tech|green[\s-]?tech|sustainability/i, "CLIMATE"],
    [/\bmobility\b|autonomous\s+vehicle|transportation\s+tech/i, "MOBILITY"],
    [/\bindustrial\b|manufacturing\b|supply[\s-]?chain/i, "INDUSTRIAL"],
    [/cyber[\s-]?security|infosec/i, "CYBERSECURITY"],
    [/\bmedia\b|\bcontent\b|entertainment\b/i, "MEDIA"],
    [/\bweb3\b|\bcrypto\b|\bblockchain\b|\bdefi\b/i, "WEB3"],
    [/edtech|education[\s-]?tech/i, "EDTECH"],
    [/govtech|government[\s-]?tech|civic[\s-]?tech/i, "GOVTECH"],
    [/\bhardware\b|deep[\s-]?tech|semiconductors?/i, "HARDWARE"],
    [/\brobotics\b|\bautomation\b/i, "ROBOTICS"],
    [/\bmarketplace\b/i, "MARKETPLACE"],
    [/agritech|agri[\s-]?tech|food[\s-]?tech/i, "AGRITECH"],
    [/proptech|real[\s-]?estate[\s-]?tech/i, "PROPTECH"],
  ];

  function parseStageFocusFromText(text: string): StageFocus[] {
    return uniq(STAGE_RE_MAP.filter(([re]) => re.test(text)).map(([, v]) => v));
  }

  function parseSectorFocusFromText(text: string): SectorFocus[] {
    return uniq(SECTOR_RE_MAP.filter(([re]) => re.test(text)).map(([, v]) => v));
  }

  function parseStageFocusFromStrings(stages: string[]): StageFocus[] {
    return uniq(stages.flatMap((s) => STAGE_RE_MAP.filter(([re]) => re.test(s)).map(([, v]) => v)));
  }

  function parseSectorFocusFromStrings(sectors: string[]): SectorFocus[] {
    return uniq(sectors.flatMap((s) => SECTOR_RE_MAP.filter(([re]) => re.test(s)).map(([, v]) => v)));
  }

function summarizeInvestments(text: string): string[] {
  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const candidates: string[] = [];
  for (const line of lines.filter((l) => INVESTMENT_WORD_RE.test(l))) {
    const stripped = line.replace(/^(portfolio|investments?|deals?|backed(?: companies)?|notable investments?)\s*[:\-]?\s*/i, "");
    for (const part of stripped.split(/,|;|\||\band\b/gi)) {
      const token = part.trim();
      if (token) candidates.push(token);
    }
  }
  return sanitizeCompanyNames(candidates).slice(0, 20);
}

function extractJsonLdPeople(html: string, sourceUrl: string): ExtractedPerson[] {
  const out: ExtractedPerson[] = [];
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];

  for (const m of scripts) {
    const raw = (m[1] || "").trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    const stack: unknown[] = [parsed];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== "object") continue;

      const rec = node as Record<string, unknown>;
      const typeRaw = rec["@type"];
      const types = Array.isArray(typeRaw) ? typeRaw.map(String) : [String(typeRaw || "")];
      const isPerson = types.some((t) => t.toLowerCase() === "person");

      if (isPerson) {
        const name = String(rec.name || "").trim();
        if (isLikelyPersonName(name)) {
          const sameAs = Array.isArray(rec.sameAs)
            ? rec.sameAs.map((v) => String(v)).filter(Boolean)
            : [];
          const social = classifySocial(sameAs);
          const bio = String(rec.description || "").trim();
          const email = String(rec.email || "").replace(/^mailto:/i, "").trim();
            // Extract location from address or homeLocation field
            const addrRaw = (rec.address ?? rec.homeLocation) as Record<string, unknown> | string | null | undefined;
            let locationStr: string | undefined;
            if (typeof addrRaw === "string" && addrRaw.trim()) {
              locationStr = addrRaw.trim();
            } else if (addrRaw && typeof addrRaw === "object") {
              const addrObj = addrRaw as Record<string, unknown>;
              const city = String(addrObj.addressLocality || "").trim();
              const region = String(addrObj.addressRegion || "").trim();
              locationStr = [city, region].filter(Boolean).join(", ") || undefined;
            }
          out.push({
            fullName: name,
            title: firstNonEmpty(String(rec.jobTitle || ""), String(rec.title || "")),
            role: firstNonEmpty(String(rec.jobTitle || ""), String(rec.title || "")),
            bio: bio || undefined,
            email: email || undefined,
            linkedinUrl: social.linkedinUrl,
            xUrl: social.xUrl,
            mediumUrl: social.mediumUrl,
            substackUrl: social.substackUrl,
            profileUrl: firstNonEmpty(String(rec.url || "")),
            avatarUrl: firstNonEmpty(String(rec.image || "")),
            thoughtLeadershipUrls: sameAs.filter((u) => /(medium\.com|substack\.com|\/blog\/|\/insights\/)/i.test(u)),
            investments: [],
            themes: extractThemes(bio),
              location: locationStr,
              investmentStages: parseStageFocusFromText(bio),
              investmentSectors: parseSectorFocusFromText(bio),
            sourceUrl,
            confidence: 0.9,
          });
        }
      }

      for (const v of Object.values(rec)) {
        if (Array.isArray(v)) stack.push(...v);
        else if (v && typeof v === "object") stack.push(v);
      }
    }
  }

  return out;
}

function normalizeMarkdownForPeopleExtraction(text: string): string {
  return text
    .replace(
      /\[!\[[^\]]*\]\([^)]*\)\s*####\s+([^#\]]+?)\s+#####\s+([^#\]]+?)(?:\s+([^\]]+?))?\]\([^)]*\)/g,
      (_m, name: string, title: string, bio?: string) => {
        return `\n${name.trim()}\n${title.trim()}${bio?.trim() ? `\n${bio.trim()}` : ""}\n`;
      },
    )
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1\n$2")
    .replace(/[>*`~]/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}

function extractMarkdownPeople(text: string, sourceUrl: string): ExtractedPerson[] {
  const out: ExtractedPerson[] = [];

  const headingMatches = [
    ...text.matchAll(/(?:^|\n)###\s+([^\n]+)\n#####\s+([^\n]+)\n([^\n]{30,1200})/g),
  ];

  for (const match of headingMatches) {
    const rawName = (match[1] || "").trim();
    const title = (match[2] || "").trim();
    const bio = (match[3] || "").trim();
    if (!isLikelyPersonName(rawName) || !TITLE_RE.test(title)) continue;

    out.push({
      fullName: rawName,
      title,
      role: title,
      bio: bio || undefined,
      email: undefined,
      linkedinUrl: undefined,
      xUrl: undefined,
      mediumUrl: undefined,
      substackUrl: undefined,
      profileUrl: undefined,
      avatarUrl: undefined,
      thoughtLeadershipUrls: [],
      investments: summarizeInvestments(bio),
      themes: extractThemes(bio),
      location: undefined,
      investmentStages: parseStageFocusFromText(bio),
      investmentSectors: parseSectorFocusFromText(bio),
      sourceUrl,
      confidence: 0.6,
    });
  }

  const normalized = normalizeMarkdownForPeopleExtraction(text);
  const lines = normalized
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^https?:\/\//i.test(line))
    .filter((line) => !/^(close|published time:|image\s+\d+:|x)$/i.test(line));

  for (let i = 0; i < lines.length; i += 1) {
    const name = lines[i];
    if (!isLikelyPersonName(name)) continue;

    const title = TITLE_RE.test(lines[i + 1] || "") ? lines[i + 1] : undefined;
    const bioLines: string[] = [];
    for (let j = i + (title ? 2 : 1); j < Math.min(lines.length, i + 8); j += 1) {
      const candidate = lines[j];
      if (isLikelyPersonName(candidate)) break;
      if (TITLE_RE.test(candidate) && !title) break;
      bioLines.push(candidate);
    }

    const bio = bioLines.join(" ").trim();
    if (!title && bio.length < 80) continue;

    out.push({
      fullName: name,
      title,
      role: title,
      bio: bio || undefined,
      email: undefined,
      linkedinUrl: undefined,
      xUrl: undefined,
      mediumUrl: undefined,
      substackUrl: undefined,
      profileUrl: undefined,
      avatarUrl: undefined,
      thoughtLeadershipUrls: [],
      investments: summarizeInvestments(bio),
      themes: extractThemes(bio),
      location: undefined,
      investmentStages: parseStageFocusFromText(bio),
      investmentSectors: parseSectorFocusFromText(bio),
      sourceUrl,
      confidence: title ? 0.55 : 0.4,
    });
  }

  return out;
}

function extractHeuristicPeople(html: string, text: string, sourceUrl: string): ExtractedPerson[] {
  const out: ExtractedPerson[] = extractMarkdownPeople(text, sourceUrl);
  const nameMatches = [...html.matchAll(/>([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){1,3})</g)];

  for (const m of nameMatches) {
    const name = (m[1] || "").trim();
    if (!isLikelyPersonName(name)) continue;
    if (!nameMatchesTeamMemberSlug(name, sourceUrl)) continue;
    if (new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g").exec(name) === null) continue;

    const idx = m.index || 0;
    const snippet = html.slice(Math.max(0, idx - 650), Math.min(html.length, idx + 900));
    const snippetText = stripHtml(snippet);
    const emails = extractEmails(snippet);
    const urls = extractUrls(snippet);
    const social = classifySocial(urls);

    const titleCandidate = snippetText
      .split(/[\n|•·]/)
      .map((p) => p.trim())
      .find((p) => TITLE_RE.test(p) && p.length <= 110);
    const titleNearName = (() => {
      const clean = snippetText.replace(/\s+/g, " ").trim();
      const re = new RegExp(
        `${escapeRe(name)}\\s+([A-Z][A-Za-z&/\\-\\s]{2,80}?)(?:\\s+(Sector Focus|Stage Focus|Email|LinkedIn|Location|Portfolio|Investments?)\\b|$)`,
        "i",
      );
      const match = clean.match(re);
      if (!match?.[1]) return undefined;
      return sanitizeExtractedTitle(match[1], name);
    })();
    const finalTitle = titleNearName || titleCandidate;

    const avatarMatch = snippet.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i);
    const avatarUrl = avatarMatch ? toAbsoluteUrl(avatarMatch[1], sourceUrl) : null;

    let confidence = 0;
    if (social.linkedinUrl) confidence += 0.35;
    if (emails.length) confidence += 0.2;
    if (finalTitle) confidence += 0.2;
    if (avatarUrl) confidence += 0.15;
    if (snippetText.length > 80) confidence += 0.1;
    if (confidence < 0.35) continue;

    const locationMatch = snippetText.match(/\b([A-Z][a-zA-Z\s]{2,25},\s*(?:[A-Z]{2}|[A-Z][a-zA-Z]{3,20}))\b/);
    const investments = summarizeInvestments(snippetText);
    const themes = extractThemes(snippetText);
    const thoughtLeadershipUrls = urls.filter((u) => /(medium\.com|substack\.com|\/blog\/|\/insights\/|\/articles?\/)/.test(u));

    out.push({
      fullName: name,
      title: finalTitle,
      role: finalTitle,
      bio: snippetText.length > 50 ? snippetText.slice(0, 600) : undefined,
      email: emails[0],
      linkedinUrl: social.linkedinUrl,
      xUrl: social.xUrl,
      mediumUrl: social.mediumUrl,
      substackUrl: social.substackUrl,
      profileUrl: urls.find((u) => !/(linkedin|x\.com|twitter|medium|substack)/.test(u)),
      avatarUrl: avatarUrl || undefined,
      thoughtLeadershipUrls,
      investments,
      themes,
      location: locationMatch?.[1],
      investmentStages: parseStageFocusFromText(snippetText),
      investmentSectors: parseSectorFocusFromText(snippetText),
      sourceUrl,
      confidence,
    });
  }

  if (out.length === 0) {
    const normalizedText = normalizeMarkdownForPeopleExtraction(text);
    const lines = normalizedText
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 2500);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!isLikelyPersonName(line)) continue;
      const window = lines.slice(i, Math.min(lines.length, i + 10)).join("\n");
      const emails = extractEmails(window);
      const urls = extractUrls(window);
      const social = classifySocial(urls);
      const title = lines
        .slice(i + 1, Math.min(lines.length, i + 4))
        .find((l) => TITLE_RE.test(l) && l.length < 90);
      const bio = lines.slice(i + 1, Math.min(lines.length, i + 8)).join(" ");
      let confidence = 0.3;
      if (social.linkedinUrl) confidence += 0.3;
      if (emails.length) confidence += 0.2;
      if (title) confidence += 0.15;
      if (bio.length > 60) confidence += 0.05;
      if (confidence < 0.45) continue;

      out.push({
        fullName: line,
        title,
        role: title,
        bio: bio.slice(0, 600),
        email: emails[0],
        linkedinUrl: social.linkedinUrl,
        xUrl: social.xUrl,
        mediumUrl: social.mediumUrl,
        substackUrl: social.substackUrl,
        profileUrl: urls.find((u) => !/(linkedin|x\.com|twitter|medium|substack)/i.test(u)),
        thoughtLeadershipUrls: urls.filter((u) => /(medium\.com|substack\.com|\/blog\/|\/insights\/|\/articles?\/)/i.test(u)),
        investments: summarizeInvestments(window),
        themes: extractThemes(window),
        location: undefined,
        investmentStages: parseStageFocusFromText(window),
        investmentSectors: parseSectorFocusFromText(window),
        sourceUrl,
        confidence,
      });
    }
  }

  return out;
}

function mergePeople(raw: ExtractedPerson[]): ExtractedPerson[] {
  const byName = new Map<string, ExtractedPerson>();
  for (const candidate of raw) {
    const p = normalizeExtractedPerson(candidate);
    if (!p) continue;
    const key = normName(p.fullName);
    if (!key) continue;
    const existing = byName.get(key);
    if (!existing) {
      byName.set(key, {
        ...p,
        thoughtLeadershipUrls: uniq(p.thoughtLeadershipUrls),
        investments: uniq(p.investments),
        themes: uniq(p.themes),
      });
      continue;
    }

    existing.title = firstNonEmpty(existing.title, p.title);
    existing.role = firstNonEmpty(existing.role, p.role);
    existing.bio = firstNonEmpty(existing.bio, p.bio);
    existing.email = firstNonEmpty(existing.email, p.email);
    existing.linkedinUrl = firstNonEmpty(existing.linkedinUrl, p.linkedinUrl);
    existing.xUrl = firstNonEmpty(existing.xUrl, p.xUrl);
    existing.mediumUrl = firstNonEmpty(existing.mediumUrl, p.mediumUrl);
    existing.substackUrl = firstNonEmpty(existing.substackUrl, p.substackUrl);
    existing.profileUrl = firstNonEmpty(existing.profileUrl, p.profileUrl);
    existing.avatarUrl = firstNonEmpty(existing.avatarUrl, p.avatarUrl);
    existing.confidence = Math.max(existing.confidence, p.confidence);
    existing.location = firstNonEmpty(existing.location, p.location);
    existing.investmentStages = uniq([...existing.investmentStages, ...p.investmentStages]) as StageFocus[];
    existing.investmentSectors = uniq([...existing.investmentSectors, ...p.investmentSectors]) as SectorFocus[];
    existing.thoughtLeadershipUrls = uniq([...existing.thoughtLeadershipUrls, ...p.thoughtLeadershipUrls]);
    existing.investments = uniq([...existing.investments, ...p.investments]);
    existing.themes = uniq([...existing.themes, ...p.themes]);
  }

  return [...byName.values()].filter((p) => p.confidence >= 0.45);
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function compileBackground(existing: string | null, incoming: ExtractedPerson): string | undefined {
  const blocks: string[] = [];
  if (incoming.thoughtLeadershipUrls.length) {
    blocks.push(`Thought leadership: ${incoming.thoughtLeadershipUrls.slice(0, 6).join(", ")}`);
  }
  if (incoming.investments.length) {
    blocks.push(`Investment notes: ${incoming.investments.slice(0, 5).join(" | ")}`);
  }
  if (incoming.mediumUrl || incoming.substackUrl) {
    blocks.push(`Publishing: ${[incoming.mediumUrl, incoming.substackUrl].filter(Boolean).join(" | ")}`);
  }
  blocks.push(`Source: ${incoming.sourceUrl}`);

  const incomingSummary = blocks.join("\n").trim();
  if (!incomingSummary) return undefined;
  if (!existing?.trim()) return incomingSummary.slice(0, 4000);

  const withoutOldSource = existing
    .split("\n")
    .filter((l) => !/^Source:/i.test(l.trim()))
    .join("\n")
    .trim();
  return `${withoutOldSource}\n${incomingSummary}`.slice(0, 4000);
}

function shouldReplace(current: string | null, incoming: string | undefined, overwrite: boolean): boolean {
  const c = current?.trim();
  const i = incoming?.trim();
  if (!i) return false;
  if (!c) return true;
  return overwrite;
}

function shouldReplaceTitle(current: string | null, incoming: string | undefined, overwrite: boolean): boolean {
  if (shouldReplace(current, incoming, overwrite)) return true;
  const c = current?.trim().toLowerCase();
  const i = incoming?.trim().toLowerCase();
  if (!c || !i || c === i) return false;

  // Allow non-overwrite upgrades when incoming title is clearly more specific.
  if (i.includes(c) && i.length >= c.length + 3) return true;
  const seniorityRe = /\b(senior|managing|general|founding|chief|co[- ]?founder|operating|venture)\b/i;
  if (seniorityRe.test(i) && !seniorityRe.test(c)) return true;
  return false;
}

function resolveExistingPerson(
  firm: FirmRow,
  extracted: ExtractedPerson,
  fullRowsById: Map<string, FirmInvestorRow>,
): FirmInvestorRow | null {
  const byEmail = extracted.email?.toLowerCase();
  if (byEmail) {
    const hit = [...fullRowsById.values()].find((p) => p.email?.toLowerCase() === byEmail);
    if (hit) return hit;
  }

  const byLinkedIn = extracted.linkedinUrl?.toLowerCase();
  if (byLinkedIn) {
    const hit = [...fullRowsById.values()].find((p) => p.linkedin_url?.toLowerCase() === byLinkedIn);
    if (hit) return hit;
  }

  const target = normName(extracted.fullName);
  if (!target) return null;
  const base = firm.investors.find(
    (p) => normName(`${p.first_name} ${p.last_name}`) === target,
  );
  if (!base) return null;
  return fullRowsById.get(base.id) || null;
}

// ---------------------------------------------------------------------------
// Article signals helper
// ---------------------------------------------------------------------------

// Article signals are not written to firm_investors — kept as a no-op stub
// so existing call sites compile without changes.
async function upsertArticleSignals(
  _firmId: string,
  _personId: string,
  _articles: ArticleRecord[],
  _authorName: string,
): Promise<void> {}

async function main() {
  const cfg = configFromEnv();

  // ── Fetch firms ────────────────────────────────────────────────────────────
  const firmFilter = `&deleted_at=is.null&website_url=not.is.null`
    + (cfg.firmSlug ? `&slug=eq.${encodeURIComponent(cfg.firmSlug)}` : "")
    + `&order=updated_at.asc`;

  const rawFirms = await sbGetPaged<{ id: string; slug: string; firm_name: string; website_url: string | null }>(
    "firm_records", "id,slug,firm_name,website_url", firmFilter
  );
  const firmSlice = rawFirms.slice(cfg.startOffset, cfg.startOffset + cfg.maxFirms);

  // ── Batch-load investors for those firms ───────────────────────────────────
  const firmIds = firmSlice.map((f) => f.id);
  const allInvestors: Array<{
    id: string;
    firm_id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    linkedin_url: string | null;
    website_url: string | null;
  }> = [];
  if (firmIds.length) {
    // Avoid oversized URL filters on full runs.
    for (const idBatch of chunk(firmIds, 120)) {
      const rows = await sbGetPaged<{
        id: string;
        firm_id: string;
        first_name: string;
        last_name: string;
        email: string | null;
        linkedin_url: string | null;
        website_url: string | null;
      }>(
        "firm_investors",
        "id,firm_id,first_name,last_name,email,linkedin_url,website_url",
        `&firm_id=in.(${idBatch.join(",")})&deleted_at=is.null`,
      );
      allInvestors.push(...rows);
    }
  }

  const investorsByFirm = new Map<string, typeof allInvestors>();
  for (const inv of allInvestors) {
    const arr = investorsByFirm.get(inv.firm_id) ?? [];
    arr.push(inv);
    investorsByFirm.set(inv.firm_id, arr);
  }

  // Process all firms with websites. Existing investors are used for matching,
  // but firms with zero current rows can still create new people from extraction.
  const firms: FirmRow[] = firmSlice.map((f) => ({
    ...f,
    investors: investorsByFirm.get(f.id) ?? [],
  }));

  const stats = {
    firmsScanned: firms.length,
    firmsWithTeamPage: 0,
    extractedPeople: 0,
    updatedPeople: 0,
    createdPeople: 0,
    skippedPeople: 0,
    failedFirms: 0,
  };

  console.log("\n[team-sync] Starting investor team page sync");
  console.log(
    `[team-sync] firms=${firms.length} offset=${cfg.startOffset} max=${cfg.maxFirms} dryRun=${cfg.dryRun} overwrite=${cfg.overwrite} useJina=${cfg.useJinaReader}`,
  );

  for (let i = 0; i < firms.length; i += 1) {
    const firm = firms[i];
    const website = normalizeUrl(firm.website_url || "");
    if (!website) {
      stats.failedFirms += 1;
      continue;
    }

    console.log(`[team-sync] ${i + 1}/${firms.length} ${firm.firm_name} (${firm.slug})`);

    try {
      const home = await fetchPage(website, cfg);
      if (!home) {
        stats.failedFirms += 1;
        continue;
      }

      const candidatePages = discoverTeamPages(website, home.html);
      const sitemapPages = await discoverTeamPagesFromSitemaps(website, cfg);
      const pagesToScan = uniq([...candidatePages, ...sitemapPages]).slice(0, 100);
      const extractedRaw: ExtractedPerson[] = [];

      if (cfg.firmSlug) {
        console.log(`[team-sync]   candidate pages: ${pagesToScan.join(', ') || '(none)'}`);
      }

      for (const pageUrl of pagesToScan) {
        const page = await fetchPage(pageUrl, cfg);
        if (!page) continue;
        const jsonLdPeople = extractJsonLdPeople(page.html, page.url);
        const heuristicPeople = extractHeuristicPeople(page.html, page.text, page.url);
        if (cfg.firmSlug) {
          console.log(
            `[team-sync]   page ${pageUrl} -> jsonld=${jsonLdPeople.length} heuristic=${heuristicPeople.length} markdown=${page.markdown ? 'yes' : 'no'} names=${heuristicPeople.map((p) => p.fullName).join(' | ') || '(none)'}`,
          );
        }

        extractedRaw.push(...jsonLdPeople);
        extractedRaw.push(...heuristicPeople);
      }

      // --- AI extraction (primary when available) ---
      let aiPeople: AiExtractedPerson[] = [];
      const primaryMarkdown = pagesToScan.length > 0
        ? (await fetchPage(pagesToScan[0], cfg))?.markdown
        : undefined;

      if (cfg.useAiExtraction && primaryMarkdown) {
        aiPeople = await aiExtractPeople(firm.firm_name, primaryMarkdown, pagesToScan[0]);
        console.log(`[team-sync]   AI extracted ${aiPeople.length} people`);

        // EXA: per-investor enrichment (social links, articles, themes)
        if (process.env.EXA_API_KEY && aiPeople.length > 0) {
          aiPeople = await exaEnrichBatch(aiPeople, firm.firm_name);
          console.log(`[team-sync]   EXA enrichment applied`);
        }
      }

      const extracted = mergePeople(extractedRaw);
      if (extracted.length === 0 && aiPeople.length === 0) {
        await sleep(cfg.delayMs);
        continue;
      }

      stats.firmsWithTeamPage += 1;
      stats.extractedPeople += Math.max(extracted.length, aiPeople.length);

      const existingRows = await sbGet<FirmInvestorRow>(
        "firm_investors",
        "id,firm_id,full_name,first_name,last_name,title,bio,email,avatar_url,linkedin_url,x_url,medium_url,substack_url,website_url,city,state,country,stage_focus,sector_focus,personal_thesis_tags,background_summary",
        `&firm_id=eq.${firm.id}&deleted_at=is.null`
      );
      const byId = new Map(existingRows.map((p) => [p.id, p]));
      const aiHandledNames = new Set<string>();

      // --- Process AI-extracted people (richer data) ---
      for (const ap of aiPeople) {
        const normalizedAi = normalizeAiPerson(ap);
        if (!normalizedAi) continue;
        const aiFirst = normalizedAi.first;
        const aiLast = normalizedAi.last;
        const aiFullName = normalizedAi.fullName;
        const aiTitle = normalizedAi.title;
        const aiEmail = normalizedAi.email;
        const aiLinkedinUrl = normalizedAi.linkedinUrl;
        const aiXUrl = normalizedAi.xUrl;
        const aiMediumUrl = normalizedAi.mediumUrl;
        const aiSubstackUrl = normalizedAi.substackUrl;
        const preferredAiAvatar = normalizedAi.preferredAvatar;
        const cleanPortfolioCompanies = normalizedAi.portfolioCompanies;
        aiHandledNames.add(normName(aiFullName));

        const existingAi = byId
          ? [...byId.values()].find(
              (r) =>
                r.first_name.toLowerCase() === aiFirst.toLowerCase() &&
                r.last_name.toLowerCase() === aiLast.toLowerCase()
            )
          : null;

        // Merge articles — keep existing + add new
        const existingArticles: ArticleRecord[] = (existingAi?.articles as ArticleRecord[] | null) ?? [];
        const newArticles = (ap.articles ?? []).filter(
          (a) => a.url && !existingArticles.some((e) => e.url === a.url)
        );
        const mergedArticles = [...existingArticles, ...newArticles];

        const aiThemes = uniq((ap.investment_themes ?? []).map((t) => t.trim()).filter(Boolean));

        if (existingAi) {
          const updates: Record<string, unknown> = {
            team_page_scraped_at: new Date(),
          };
          if (shouldReplaceTitle(existingAi.title, aiTitle, cfg.overwrite)) updates.title = aiTitle;
          if (shouldReplace(existingAi.bio, ap.bio, cfg.overwrite)) updates.bio = ap.bio;
          if (shouldReplace(existingAi.email, aiEmail, cfg.overwrite)) updates.email = aiEmail;
          if (shouldReplace(existingAi.avatar_url, preferredAiAvatar ?? undefined, cfg.overwrite)) updates.avatar_url = preferredAiAvatar;
          if (shouldReplace(existingAi.linkedin_url, aiLinkedinUrl ?? undefined, cfg.overwrite)) updates.linkedin_url = aiLinkedinUrl;
          if (shouldReplace(existingAi.x_url, aiXUrl ?? undefined, cfg.overwrite)) updates.x_url = aiXUrl;
          if (shouldReplace((existingAi as Record<string, unknown>).medium_url as string | null, aiMediumUrl ?? undefined, cfg.overwrite)) {
            updates.medium_url = aiMediumUrl;
          }
          if (shouldReplace((existingAi as Record<string, unknown>).substack_url as string | null, aiSubstackUrl ?? undefined, cfg.overwrite)) {
            updates.substack_url = aiSubstackUrl;
          }
          if (ap.location) {
            const loc = parseLocation(ap.location);
            if (shouldReplace(existingAi.city, loc.city, cfg.overwrite)) updates.city = loc.city;
            if (shouldReplace(existingAi.state, loc.state, cfg.overwrite)) updates.state = loc.state;
            if (shouldReplace(existingAi.country, loc.country, cfg.overwrite)) updates.country = loc.country;
          }
          const aiNewStages = parseStageFocusFromStrings(ap.investment_stages ?? []);
          if (aiNewStages.length) {
            const merged = uniq([...(existingAi.stage_focus ?? []), ...aiNewStages]);
            updates.stage_focus = merged;
          }
          const aiNewSectors = parseSectorFocusFromStrings(ap.investment_sectors ?? []);
          if (aiNewSectors.length) {
            const merged = uniq([...(existingAi.sector_focus ?? []), ...aiNewSectors]);
            updates.sector_focus = merged;
          }
          if (cleanPortfolioCompanies.length) {
            const portfolioLine = `Portfolio: ${cleanPortfolioCompanies.slice(0, 15).join(", ")}`;
            if (!existingAi.background_summary?.includes("Portfolio:") || cfg.overwrite) {
              updates.background_summary = [existingAi.background_summary, portfolioLine].filter(Boolean).join("\n").slice(0, 4000);
            }
          }
          if (mergedArticles.length > existingArticles.length) {
            updates.articles = mergedArticles;
          }
          if (aiThemes.length) {
            const existingThemes = ((existingAi as Record<string, unknown>).investment_themes as string[] | null) ?? [];
            const mergedThemes = uniq([...existingThemes, ...aiThemes]).slice(0, 20);
            updates.investment_themes = mergedThemes;
          }

          // Drop fields not in firm_investors (team_page_scraped_at, investment_themes → personal_thesis_tags)
          delete (updates as Record<string, unknown>).team_page_scraped_at;
          if (aiThemes.length) {
            const existing2 = (existingAi.personal_thesis_tags ?? []) as string[];
            updates.personal_thesis_tags = uniq([...existing2, ...aiThemes]).slice(0, 20);
          }

          if (!cfg.dryRun) {
            await sbPatch("firm_investors", existingAi.id, updates);
            byId.set(existingAi.id, { ...existingAi, ...updates } as FirmInvestorRow);
          }
          stats.updatedPeople += 1;

          if (!cfg.dryRun) {
            await upsertArticleSignals(firm.id, existingAi.id, newArticles, aiFullName);
          }
        } else {
          const aiCreateLoc = ap.location ? parseLocation(ap.location) : {};
          const portfolioSummary = cleanPortfolioCompanies.length
            ? `Portfolio: ${cleanPortfolioCompanies.slice(0, 15).join(", ")}`
            : null;
          const createData: Record<string, unknown> = {
            firm_id: firm.id,
            full_name: aiFullName,
            first_name: aiFirst,
            last_name: aiLast,
            title: aiTitle ?? null,
            bio: ap.bio ?? null,
            email: aiEmail ?? null,
            avatar_url: preferredAiAvatar,
            linkedin_url: aiLinkedinUrl,
            x_url: aiXUrl,
            medium_url: aiMediumUrl,
            substack_url: aiSubstackUrl,
            city: aiCreateLoc.city ?? null,
            state: aiCreateLoc.state ?? null,
            country: aiCreateLoc.country ?? null,
            stage_focus: parseStageFocusFromStrings(ap.investment_stages ?? []),
            sector_focus: parseSectorFocusFromStrings(ap.investment_sectors ?? []),
            personal_thesis_tags: aiThemes.length > 0 ? aiThemes : null,
            background_summary: portfolioSummary,
          };

          if (!cfg.dryRun) {
            const created = await sbPost<FirmInvestorRow>("firm_investors", createData);
            if (created) {
              byId.set(created.id, created);
              await upsertArticleSignals(firm.id, created.id, newArticles, aiFullName);
            }
          }
          stats.createdPeople += 1;
        }
      }

      // --- Process heuristic-extracted people (for firms without AI results) ---
      for (const p of extracted) {
        // Skip if AI already handled this person
        if (aiHandledNames.has(normName(p.fullName))) continue;

        const existing = resolveExistingPerson(firm, p, byId);
        const thesisTags = uniq((p.themes || []).map((t) => t.trim()).filter(Boolean));
        const preferredHeuristicAvatar = resolvePreferredAvatarUrl(p.avatarUrl ?? null, p.linkedinUrl ?? null, p.xUrl ?? null);

        if (existing) {
          const updates: Record<string, unknown> = { team_page_scraped_at: new Date() };

          if (shouldReplaceTitle(existing.title, p.title, cfg.overwrite)) updates.title = p.title;
          if (shouldReplace(existing.bio, p.bio, cfg.overwrite)) updates.bio = p.bio;
          if (shouldReplace(existing.email, p.email, cfg.overwrite)) updates.email = p.email;
          if (shouldReplace(existing.linkedin_url, p.linkedinUrl, cfg.overwrite)) updates.linkedin_url = p.linkedinUrl;
          if (shouldReplace(existing.x_url, p.xUrl, cfg.overwrite)) updates.x_url = p.xUrl;
          if (shouldReplace(existing.website_url, p.profileUrl, cfg.overwrite)) updates.website_url = p.profileUrl;
          if (shouldReplace(existing.avatar_url, preferredHeuristicAvatar ?? undefined, cfg.overwrite)) updates.avatar_url = preferredHeuristicAvatar;
          if (shouldReplace((existing as Record<string, unknown>).medium_url as string | null, p.mediumUrl, cfg.overwrite)) {
            updates.medium_url = p.mediumUrl;
          }
          if (shouldReplace((existing as Record<string, unknown>).substack_url as string | null, p.substackUrl, cfg.overwrite)) {
            updates.substack_url = p.substackUrl;
          }
          if (p.location) {
            const loc = parseLocation(p.location);
            if (shouldReplace(existing.city, loc.city, cfg.overwrite)) updates.city = loc.city;
            if (shouldReplace(existing.state, loc.state, cfg.overwrite)) updates.state = loc.state;
            if (shouldReplace(existing.country, loc.country, cfg.overwrite)) updates.country = loc.country;
          }
          if (p.investmentStages.length) {
            const merged = uniq([...(existing.stage_focus ?? []), ...p.investmentStages]);
            updates.stage_focus = merged;
          }
          if (p.investmentSectors.length) {
            const merged = uniq([...(existing.sector_focus ?? []), ...p.investmentSectors]);
            updates.sector_focus = merged;
          }

          const mergedSummary = compileBackground(existing.background_summary, p);
          if (shouldReplace(existing.background_summary, mergedSummary, cfg.overwrite)) {
            updates.background_summary = mergedSummary;
          }

          if (thesisTags.length) {
            const merged = uniq([...(existing.personal_thesis_tags || []), ...thesisTags]).slice(0, 20);
            if (merged.join("|") !== (existing.personal_thesis_tags || []).join("|")) {
              updates.personal_thesis_tags = merged;
            }
          }

          if (Object.keys(updates).length <= 1) { // only team_page_scraped_at changed
            stats.skippedPeople += 1;
            continue;
          }

          if (!cfg.dryRun) {
            // Drop fields not present in firm_investors
            delete (updates as Record<string, unknown>).team_page_scraped_at;
            delete (updates as Record<string, unknown>).role;
            await sbPatch("firm_investors", existing.id, updates);
            byId.set(existing.id, { ...existing, ...updates } as FirmInvestorRow);
          }
          stats.updatedPeople += 1;
          continue;
        }

        const { first, last } = splitName(p.fullName);
        if (!first.trim() || !last.trim()) {
          stats.skippedPeople += 1;
          continue;
        }

        const hCreateLoc = p.location ? parseLocation(p.location) : {};
        const createData: Record<string, unknown> = {
          firm_id: firm.id,
          full_name: `${first} ${last}`,
          first_name: first,
          last_name: last,
          title: p.title || null,
          bio: p.bio || null,
          email: p.email || null,
          linkedin_url: p.linkedinUrl || null,
          x_url: p.xUrl || null,
          medium_url: p.mediumUrl || null,
          substack_url: p.substackUrl || null,
          website_url: p.profileUrl || null,
          avatar_url: preferredHeuristicAvatar,
          city: hCreateLoc.city ?? null,
          state: hCreateLoc.state ?? null,
          country: hCreateLoc.country ?? null,
          stage_focus: p.investmentStages,
          sector_focus: p.investmentSectors,
          background_summary: compileBackground(null, p) || null,
          personal_thesis_tags: thesisTags.length > 0 ? thesisTags : null,
        };

        if (!cfg.dryRun) {
          const created = await sbPost<FirmInvestorRow>("firm_investors", createData);
          if (created) byId.set(created.id, created);
        }
        stats.createdPeople += 1;
      }
    } catch {
      stats.failedFirms += 1;
    }

    await sleep(cfg.delayMs);
  }

  console.log("\n[team-sync] Done");
  console.log(
    `[team-sync] firmsScanned=${stats.firmsScanned} firmsWithTeamPage=${stats.firmsWithTeamPage} failedFirms=${stats.failedFirms}`,
  );
  console.log(
    `[team-sync] extractedPeople=${stats.extractedPeople} updatedPeople=${stats.updatedPeople} createdPeople=${stats.createdPeople} skippedPeople=${stats.skippedPeople}`,
  );
}

main().catch(async (err) => {
  console.error("[team-sync] fatal:", err);
  process.exitCode = 1;
});
