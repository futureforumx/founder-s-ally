#!/usr/bin/env tsx
/**
 * backfill-firm-websites.ts
 * ─────────────────────────
 * High-confidence website enrichment pipeline for firm_records.
 *
 * Fills `website_url` for firms where it is NULL/empty.
 * Uses Exa AI (primary) → Tavily (fallback) → simple heuristic (last resort).
 * Validates every candidate by fetching the page and confirming the firm name.
 *
 * ENV:
 *   SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   EXA_API_KEY          (primary search)
 *   TAVILY_API_KEY        (fallback search)
 *   JINA_API_KEY          (page validation)
 *
 * FLAGS (env):
 *   DRY_RUN=true          — log but don't write (default: true)
 *   LIMIT=100             — max firms to process (default: 100)
 *   CONCURRENCY=2         — parallel workers (default: 2)
 *   DELAY_MS=1500         — delay between firms (default: 1500)
 *   OFFSET=0              — skip first N candidates (default: 0)
 */

import { loadEnvFiles } from "./lib/loadEnvFiles";

// ── Load environment ──────────────────────────────────────────────
loadEnvFiles([".env", ".env.local", ".env.enrichment"]);

const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EXA_KEY = process.env.EXA_API_KEY || "";
const TAVILY_KEY = process.env.TAVILY_API_KEY || "";
const JINA_KEY = process.env.JINA_API_KEY || "";
const SCRAPINGBEE_KEY =
  process.env.SCRAPING_BEE_API_KEY || process.env.SCRAPINGBEE_API_KEY || "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!EXA_KEY) {
  console.warn("⚠️  No EXA_API_KEY — Exa search disabled");
}

// ── Config ────────────────────────────────────────────────────────
const DRY_RUN = (process.env.DRY_RUN ?? "true").toLowerCase() !== "false";
const LIMIT = parseInt(process.env.LIMIT || "100", 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || "2", 10);
const DELAY_MS = parseInt(process.env.DELAY_MS || "1500", 10);
const OFFSET = parseInt(process.env.OFFSET || "0", 10);

// ── Supabase REST helpers ─────────────────────────────────────────
const SB_HEADERS: Record<string, string> = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

interface FirmCandidate {
  id: string;
  firm_name: string;
  linkedin_url: string | null;
  description: string | null;
  slug: string | null;
  signal_nfx_url: string | null;
  hq_city: string | null;
}

/**
 * Enrichability score — higher = more likely to succeed.
 * Used to sort candidates so we process the easiest firms first.
 */
function enrichabilityScore(firm: FirmCandidate): number {
  let score = 0;
  const name = firm.firm_name;

  // Name quality: long descriptive names are easier to search for
  const clean = name.replace(/[^\w\s]/g, "").trim();
  const tokens = firmNameTokens(name);
  if (tokens.length >= 2) score += 3; // multi-word name
  else if (tokens.length === 1 && (tokens[0]?.length ?? 0) >= 5) score += 2;
  if (clean.replace(/\s/g, "").length >= 8) score += 1; // reasonably long

  // Penalize ambiguous/numeric names
  if (/^\d+$/.test(clean)) score -= 4;
  else if (clean.replace(/\s/g, "").length <= 4) score -= 3;

  // Data richness bonuses
  if (firm.description && firm.description.length > 50) score += 2;
  if (firm.linkedin_url && firm.linkedin_url.length > 10) score += 1;
  if (firm.hq_city && firm.hq_city.length > 1) score += 1;
  if (firm.signal_nfx_url) score += 1;
  if (firm.slug && firm.slug.length > 2) score += 0.5;

  return score;
}

async function fetchCandidates(): Promise<FirmCandidate[]> {
  // Overfetch 3x, then sort by enrichability client-side and take LIMIT.
  // This ensures we process the easiest firms first instead of alphabetical
  // order (which puts numeric/ambiguous names like 0BS, 040, 10100 first).
  const overfetchLimit = LIMIT * 3;
  const params = new URLSearchParams({
    select: "id,firm_name,linkedin_url,description,slug,signal_nfx_url,hq_city",
    or: "(website_url.is.null,website_url.eq.)",
    ready_for_live: "eq.true",
    deleted_at: "is.null",
    order: "firm_name.asc",
    offset: String(OFFSET),
    limit: String(overfetchLimit),
  });

  const res = await fetch(`${SUPABASE_URL}/rest/v1/firm_records?${params}`, {
    headers: { ...SB_HEADERS, Prefer: "count=exact" },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase fetch failed (${res.status}): ${txt}`);
  }
  const totalCount = res.headers.get("content-range")?.match(/\/(\d+)/)?.[1];
  const allData: FirmCandidate[] = await res.json();

  // Sort by enrichability (highest first) and take LIMIT
  const sorted = allData
    .map((f) => ({ firm: f, eScore: enrichabilityScore(f) }))
    .sort((a, b) => b.eScore - a.eScore)
    .slice(0, LIMIT);

  const selected = sorted.map((s) => s.firm);

  console.log(
    `📋 Fetched ${allData.length} from DB, selected top ${selected.length} by enrichability (of ~${totalCount ?? "?"} total missing website_url)`
  );
  if (sorted.length > 0) {
    const top = sorted[0];
    const bot = sorted[sorted.length - 1];
    console.log(
      `   Top enrichability: "${top.firm.firm_name}" (score=${top.eScore.toFixed(1)})  |  Bottom: "${bot.firm.firm_name}" (score=${bot.eScore.toFixed(1)})`
    );
  }
  return selected;
}

async function updateFirm(
  id: string,
  patch: Record<string, any>
): Promise<boolean> {
  if (DRY_RUN) return true;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/firm_records?id=eq.${id}`,
    {
      method: "PATCH",
      headers: { ...SB_HEADERS, Prefer: "return=minimal" },
      body: JSON.stringify(patch),
    }
  );
  return res.ok;
}

// ── Review-lane upsert (firm_website_candidates) ─────────────────
interface ReviewCandidate {
  firm_id: string;
  candidate_url: string;
  domain: string;
  score: number;
  confidence: "review" | "rejected";
  source: "exa" | "tavily" | "skipped";
  reason: string;
  competing_url?: string;
  competing_score?: number;
  fetch_method?: string;
}

async function upsertReviewCandidate(c: ReviewCandidate): Promise<boolean> {
  if (DRY_RUN) return true;
  const body = {
    firm_id: c.firm_id,
    candidate_url: c.candidate_url,
    domain: c.domain,
    score: c.score,
    confidence: c.confidence,
    source: c.source,
    reason: c.reason,
    competing_url: c.competing_url || null,
    competing_score: c.competing_score ?? null,
    fetch_method: c.fetch_method || null,
  };
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/firm_website_candidates?on_conflict=firm_id,domain`,
    {
      method: "POST",
      headers: {
        ...SB_HEADERS,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(body),
    }
  );
  return res.ok;
}

// ── Junk / non-canonical URL detection ───────────────────────────

/** Path segments that indicate junk, cookie, legal, or non-canonical pages. */
const JUNK_PATH_PATTERNS = [
  /cookie/i,
  /privacy/i,
  /terms/i,
  /legal/i,
  /disclaimer/i,
  /gdpr/i,
  /imprint/i,
  /impressum/i,
  /policy/i,
  /consent/i,
  /opt-?out/i,
  /unsubscribe/i,
  /login/i,
  /signin/i,
  /sign-?up/i,
  /register/i,
  /404/i,
  /error/i,
  /not-?found/i,
  /search/i,
  /tag\//i,
  /category\//i,
  /archive/i,
  /page\/\d/i,
  /blog\/.+/i, // blog index is ok, but blog/specific-post is not
  /news\/.+/i,
  /press\/.+/i,
  /article/i,
  /post\//i,
];

/** Domains that are aggregators, directories, or junk hosts. */
const JUNK_HOST_PATTERNS = [
  /^careers\./i,
  /^jobs\./i,
  /^mail\./i,
  /^app\./i,
  /^docs\./i,
  /^support\./i,
  /^help\./i,
  /^status\./i,
  /^cdn\./i,
  /^static\./i,
  /^api\./i,
  /\.blogspot\./i,
  /\.wordpress\.com$/i,
  /\.wixsite\.com$/i,
  /\.squarespace\.com$/i,
  /\.webflow\.io$/i,
  /\.carrd\.co$/i,
  /\.notion\.site$/i,
  /\.typeform\.com$/i,
  /\.hubspot\./i,
  /\.mailchimp\./i,
  /\.eventbrite\./i,
];

function isJunkUrl(url: string): { junk: boolean; reason: string } {
  try {
    const u = new URL(url);
    const hostname = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();

    // Check junk hosts
    for (const p of JUNK_HOST_PATTERNS) {
      if (p.test(hostname)) {
        return { junk: true, reason: `junk host: ${hostname}` };
      }
    }

    // Check junk paths
    for (const p of JUNK_PATH_PATTERNS) {
      if (p.test(path)) {
        return { junk: true, reason: `junk path: ${path}` };
      }
    }

    return { junk: false, reason: "" };
  } catch {
    return { junk: true, reason: "unparseable URL" };
  }
}

/**
 * Normalize a pathful URL to its root domain when safe.
 * e.g. "https://acme.vc/about" → "https://acme.vc"
 * Only normalizes if the path is shallow (1 segment) and looks like a
 * standard sub-page, not a different site hosted at that path.
 */
function normalizeToRoot(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter((s) => s.length > 0);
    // Already root
    if (segments.length === 0) return cleanUrl(url);
    // Single shallow segment — safe to normalize
    if (segments.length === 1) {
      u.pathname = "/";
      u.search = "";
      u.hash = "";
      return cleanUrl(u.toString());
    }
    // Deeper path — keep as-is, it might be a distinct site
    return cleanUrl(url);
  } catch {
    return cleanUrl(url);
  }
}

// ── Blocklist ─────────────────────────────────────────────────────
const BLOCKED_DOMAINS = new Set([
  "linkedin.com",
  "crunchbase.com",
  "pitchbook.com",
  "cbinsights.com",
  "signal.nfx.com",
  "angel.co",
  "wellfound.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "tiktok.com",
  "medium.com",
  "substack.com",
  "reddit.com",
  "wikipedia.org",
  "bloomberg.com",
  "reuters.com",
  "techcrunch.com",
  "forbes.com",
  "wsj.com",
  "nytimes.com",
  "ft.com",
  "cnbc.com",
  "businessinsider.com",
  "venturebeat.com",
  "theinformation.com",
  "prnewswire.com",
  "globenewswire.com",
  "sec.gov",
  "google.com",
  "bing.com",
  "yahoo.com",
  "amazon.com",
  "apple.com",
  "github.com",
  "glassdoor.com",
  "indeed.com",
  "yelp.com",
  "vcsheet.com",
  "openvc.app",
  "trustfinta.com",
  "dealroom.co",
  "tracxn.com",
]);

function isBlockedDomain(hostname: string): boolean {
  const h = hostname.replace(/^www\./, "").toLowerCase();
  for (const blocked of BLOCKED_DOMAINS) {
    if (h === blocked || h.endsWith("." + blocked)) return true;
  }
  return false;
}

function isRootishUrl(url: string): boolean {
  try {
    const u = new URL(url);
    // Allow root or single-segment paths like /about, /portfolio
    const segments = u.pathname
      .split("/")
      .filter((s) => s.length > 0);
    return segments.length <= 1;
  } catch {
    return false;
  }
}

function cleanUrl(url: string): string {
  try {
    const u = new URL(url);
    // Strip tracking params
    u.search = "";
    u.hash = "";
    // Normalize to https
    if (u.protocol === "http:") u.protocol = "https:";
    // Normalize to root
    if (u.pathname.length <= 1) u.pathname = "/";
    let result = u.origin + (u.pathname === "/" ? "" : u.pathname);
    // Remove trailing slash for consistency
    if (result.endsWith("/")) result = result.slice(0, -1);
    return result;
  } catch {
    return url;
  }
}

// ── Name matching ─────────────────────────────────────────────────
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function firmNameTokens(name: string): string[] {
  const stopwords = new Set([
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "for",
    "in",
    "at",
    "by",
    "to",
    "on",
    "is",
    "fund",
    "capital",
    "ventures",
    "venture",
    "partners",
    "group",
    "management",
    "advisors",
    "investments",
    "investing",
    "holdings",
    "llc",
    "lp",
    "inc",
    "corp",
  ]);
  const tokens = normalize(name).split(" ");
  // Keep at least one meaningful token
  const meaningful = tokens.filter((t) => !stopwords.has(t) && t.length > 1);
  return meaningful.length > 0 ? meaningful : tokens.filter((t) => t.length > 1);
}

function domainMatchesName(domain: string, firmName: string): boolean {
  const d = domain.replace(/^www\./, "").split(".")[0].toLowerCase();
  const tokens = firmNameTokens(firmName);

  // Check if domain contains the primary token(s)
  if (tokens.length === 0) return false;

  // Strong match: domain contains primary (first meaningful) token
  const primary = tokens[0];
  if (primary.length >= 3 && d.includes(primary)) return true;

  // Check if most tokens appear in domain
  const matches = tokens.filter((t) => t.length >= 3 && d.includes(t));
  return matches.length >= Math.ceil(tokens.length * 0.5);
}

function nameAppearsOnPage(pageText: string, firmName: string): boolean {
  const normalizedPage = normalize(pageText.slice(0, 5000));
  const normalizedName = normalize(firmName);

  // Direct name match
  if (normalizedPage.includes(normalizedName)) return true;

  // Check meaningful tokens — at least 60% must appear
  const tokens = firmNameTokens(firmName);
  if (tokens.length === 0) return false;
  const found = tokens.filter(
    (t) => t.length >= 3 && normalizedPage.includes(t)
  );
  return found.length >= Math.ceil(tokens.length * 0.6);
}

// ── Search providers ──────────────────────────────────────────────
interface SearchResult {
  url: string;
  title: string;
  text?: string;
  source: "exa" | "tavily";
}

async function searchExa(query: string): Promise<SearchResult[]> {
  if (!EXA_KEY) return [];
  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "x-api-key": EXA_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        type: "auto",
        numResults: 5,
        contents: { text: { maxCharacters: 500 } },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 429) {
      console.warn("  ⏳ Exa rate limited, cooling down");
      await sleep(10000);
      return [];
    }
    if (res.status === 402 || res.status === 401) {
      console.warn("  ❌ Exa quota/auth issue");
      return [];
    }
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((r: any) => ({
      url: r.url || "",
      title: r.title || "",
      text: r.text || "",
      source: "exa" as const,
    }));
  } catch (e: any) {
    console.warn(`  Exa error: ${e.message}`);
    return [];
  }
}

async function searchTavily(query: string): Promise<SearchResult[]> {
  if (!TAVILY_KEY) return [];
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: TAVILY_KEY,
        query,
        search_depth: "basic",
        max_results: 5,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map((r: any) => ({
      url: r.url || "",
      title: r.title || "",
      text: r.content || "",
      source: "tavily" as const,
    }));
  } catch (e: any) {
    console.warn(`  Tavily error: ${e.message}`);
    return [];
  }
}

// ── Page validation (3-tier: Jina → raw fetch → ScrapingBee) ──────
interface FetchResult {
  text: string;
  method: "jina" | "raw" | "scrapingbee" | "none";
}

function extractTextFromHtml(html: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const metaDesc = html.match(
    /<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i
  );
  const ogTitle = html.match(
    /<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i
  );
  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .slice(0, 3000);
  return [
    titleMatch?.[1] || "",
    ogTitle?.[1] || "",
    metaDesc?.[1] || "",
    bodyText,
  ].join(" ");
}

async function fetchPageText(url: string): Promise<FetchResult> {
  // Tier 1: Jina markdown extraction
  if (JINA_KEY) {
    try {
      const res = await fetch(`https://r.jina.ai/${url}`, {
        headers: {
          Authorization: `Bearer ${JINA_KEY}`,
          Accept: "text/plain",
          "X-Return-Format": "markdown",
        },
        signal: AbortSignal.timeout(12000),
      });
      if (res.ok) {
        const text = await res.text();
        if (
          !/access denied|forbidden|blocked|captcha/i.test(text.slice(0, 500))
        ) {
          const trimmed = text.slice(0, 5000);
          if (trimmed.length >= 50) {
            return { text: trimmed, method: "jina" };
          }
        }
      }
    } catch {}
  }

  // Tier 2: Raw HTTP fetch
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const html = await res.text();
      const extracted = extractTextFromHtml(html);
      if (extracted.length >= 50) {
        return { text: extracted, method: "raw" };
      }
    }
  } catch {}

  // Tier 3: ScrapingBee (JS-rendered, handles SPAs)
  if (SCRAPINGBEE_KEY) {
    try {
      const params = new URLSearchParams({
        api_key: SCRAPINGBEE_KEY,
        url,
        render_js: "false", // lightweight, no JS rendering
        premium_proxy: "false",
      });
      const res = await fetch(
        `https://app.scrapingbee.com/api/v1/?${params}`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (res.ok) {
        const html = await res.text();
        const extracted = extractTextFromHtml(html);
        if (extracted.length >= 50) {
          return { text: extracted, method: "scrapingbee" };
        }
      }
    } catch {}
  }

  return { text: "", method: "none" };
}

// ── Ambiguity & identity helpers ─────────────────────────────────

/** Returns the root domain (e.g. "10xcapital.com") for dedup and comparison. */
function rootDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url;
  }
}

/** True if the name is short/numeric/ambiguous and needs extra evidence. */
function isAmbiguousName(firmName: string): boolean {
  const clean = firmName.replace(/[^\w\s]/g, "").trim();
  // Pure numeric or very short (≤ 4 non-space chars)
  if (/^\d+$/.test(clean)) return true;
  if (clean.replace(/\s/g, "").length <= 4) return true;
  // Single common word that could match many firms
  const tokens = firmNameTokens(firmName);
  if (tokens.length <= 1 && (tokens[0]?.length ?? 0) <= 4) return true;
  return false;
}

/**
 * Known VC identity markers — if the page prominently names a DIFFERENT
 * firm, the candidate is for the wrong entity.
 */
const KNOWN_VC_SUFFIXES = [
  "capital",
  "ventures",
  "partners",
  "advisors",
  "holdings",
  "fund",
  "group",
  "investments",
  "management",
  "equity",
];

/**
 * Checks whether `pageText` reveals a different firm's identity.
 * Returns the alien firm name if detected, or null if clean.
 */
function detectAlienFirmIdentity(
  pageText: string,
  targetFirmName: string
): string | null {
  const normalizedTarget = normalize(targetFirmName);
  const normalizedPage = pageText.slice(0, 3000).toLowerCase();

  // Look for "<Something> Capital | Ventures | Partners …" in the first 500 chars
  // of the page (title/header zone) that does NOT match our target.
  const headerZone = normalizedPage.slice(0, 800);
  for (const suffix of KNOWN_VC_SUFFIXES) {
    // Pattern: "word(s) suffix" — capture the phrase
    const re = new RegExp(`([a-z0-9][a-z0-9 ]{1,30}${suffix})`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(headerZone)) !== null) {
      const found = normalize(m[1]);
      if (found.length < 4) continue;
      // Skip if it IS our target (or contained in it)
      if (normalizedTarget.includes(found) || found.includes(normalizedTarget))
        continue;
      // Different firm detected
      return m[1].trim();
    }
  }
  return null;
}

// ── Scored candidate (all fields needed for ranking) ─────────────
interface ScoredCandidate {
  url: string;
  domain: string;
  score: number;
  source: "exa" | "tavily";
  titleMatch: boolean;
  domainMatch: boolean;
  snippetMatch: boolean;
  isRoot: boolean;
}

// ── Core pipeline for a single firm ──────────────────────────────
interface EnrichResult {
  firmId: string;
  firmName: string;
  source: "exa" | "tavily" | "skipped";
  candidateUrl: string | null;
  lane: "canonical" | "review" | "skipped";
  written: boolean;   // true only for canonical writes to website_url
  reviewed: boolean;  // true when stored in firm_website_candidates
  reason: string;
  candidatesConsidered: number;
  ambiguityDetected: boolean;
}

/**
 * Helper: send a candidate to the review lane.
 * Returns a partially filled EnrichResult — caller sets remaining fields.
 */
async function sendToReview(
  result: EnrichResult,
  best: ScoredCandidate,
  ranked: ScoredCandidate[],
  reason: string,
  fetchMethod: string
): Promise<EnrichResult> {
  result.lane = "review";
  result.reason = reason;
  const runnerUp = ranked.length >= 2 ? ranked[1] : null;
  const ok = await upsertReviewCandidate({
    firm_id: result.firmId,
    candidate_url: best.url,
    domain: best.domain,
    score: best.score,
    confidence: "review",
    source: best.source,
    reason,
    competing_url: runnerUp?.domain,
    competing_score: runnerUp?.score,
    fetch_method: fetchMethod,
  });
  result.reviewed = ok;
  console.log(`  📝 → review lane: ${best.domain} (score=${best.score}) — ${reason}`);
  return result;
}

async function enrichFirm(firm: FirmCandidate): Promise<EnrichResult> {
  const result: EnrichResult = {
    firmId: firm.id,
    firmName: firm.firm_name,
    source: "skipped",
    candidateUrl: null,
    lane: "skipped",
    written: false,
    reviewed: false,
    reason: "",
    candidatesConsidered: 0,
    ambiguityDetected: false,
  };

  // ── Guard: unusable names ──────────────────────────────────────
  const cleanName = firm.firm_name.replace(/[^\w\s\-&.]/g, "").trim();
  if (cleanName.length < 2) {
    result.reason = "firm name too short or unparseable";
    return result;
  }

  const ambiguous = isAmbiguousName(cleanName);
  const CANONICAL_MIN_SCORE = ambiguous ? 5 : 3;
  const REVIEW_MIN_SCORE = 1.5; // lower bar — just needs *some* signal
  if (ambiguous) {
    console.log(`  ⚠️  Ambiguous/short name — canonical requires ≥ ${CANONICAL_MIN_SCORE}, review ≥ ${REVIEW_MIN_SCORE}`);
  }

  // ── Phase 1: Collect ALL search results from ALL providers ─────
  const allSearchResults: SearchResult[] = [];

  const cityHint = firm.hq_city ? ` ${firm.hq_city}` : "";
  const queries = [
    `"${cleanName}" venture capital official website`,
    `"${cleanName}" VC firm${cityHint}`,
  ];

  for (const q of queries) {
    const exaResults = await searchExa(q);
    allSearchResults.push(...exaResults);
    if (exaResults.length > 0) break;
  }

  if (TAVILY_KEY) {
    for (const q of queries) {
      const tavilyResults = await searchTavily(q);
      allSearchResults.push(...tavilyResults);
      if (tavilyResults.length > 0) break;
    }
  }

  if (allSearchResults.length === 0) {
    result.reason = "no search results from any provider";
    return result;
  }

  // ── Phase 2: Score, filter junk, deduplicate by domain ─────────
  const domainMap = new Map<string, ScoredCandidate>();

  for (const sr of allSearchResults) {
    if (!sr.url) continue;
    try {
      const u = new URL(sr.url);
      const hostname = u.hostname.replace(/^www\./, "").toLowerCase();

      if (isBlockedDomain(hostname)) continue;

      // NEW: hard-block junk URLs
      const junkCheck = isJunkUrl(sr.url);
      if (junkCheck.junk) {
        console.log(`  🚫 Junk blocked: ${sr.url} — ${junkCheck.reason}`);
        continue;
      }

      const isRoot = isRootishUrl(sr.url);
      const domainMatch = domainMatchesName(hostname, cleanName);
      const titleMatch = sr.title
        ? nameAppearsOnPage(sr.title, cleanName)
        : false;
      const snippetMatch = sr.text
        ? nameAppearsOnPage(sr.text, cleanName)
        : false;

      let score = 0;
      if (domainMatch) score += 3;
      if (titleMatch) score += 2;
      if (snippetMatch) score += 1;
      if (isRoot) score += 1;
      if (sr.source === "exa") score += 0.5;

      const domain = rootDomain(sr.url);
      const existing = domainMap.get(domain);

      if (
        !existing ||
        score > existing.score ||
        (score === existing.score && isRoot && !existing.isRoot)
      ) {
        domainMap.set(domain, {
          url: cleanUrl(sr.url),
          domain,
          score,
          source: sr.source,
          titleMatch,
          domainMatch,
          snippetMatch,
          isRoot,
        });
      }
    } catch {
      continue;
    }
  }

  // ── Phase 3: Rank ──────────────────────────────────────────────
  const ranked = Array.from(domainMap.values()).sort(
    (a, b) => b.score - a.score
  );
  result.candidatesConsidered = ranked.length;

  if (ranked.length === 0) {
    result.reason = `${allSearchResults.length} results but none passed filtering`;
    result.source =
      allSearchResults[0]?.source === "exa" ? "exa" : "tavily";
    return result;
  }

  const best = ranked[0];
  result.candidateUrl = best.url;
  result.source = best.source;

  console.log(
    `  📊 ${ranked.length} unique domain(s) — best: ${best.domain} (score=${best.score})`
  );
  if (ranked.length > 1) {
    console.log(
      `     runner-up: ${ranked[1].domain} (score=${ranked[1].score})`
    );
  }

  // ── Phase 4: Ambiguity check → review lane ─────────────────────
  if (ranked.length >= 2) {
    const runnerUp = ranked[1];
    const scoreDelta = best.score - runnerUp.score;
    if (scoreDelta <= 1 && best.domain !== runnerUp.domain) {
      result.ambiguityDetected = true;
      // Instead of hard-skip, send to review with both candidates noted
      return sendToReview(
        result,
        best,
        ranked,
        `ambiguous: ${best.domain} (${best.score}) vs ${runnerUp.domain} (${runnerUp.score}) — delta ${scoreDelta}`,
        "none"
      );
    }
  }

  // ── Phase 5: Score threshold — canonical vs review ─────────────
  if (best.score < REVIEW_MIN_SCORE) {
    result.reason = `best score ${best.score} below review threshold ${REVIEW_MIN_SCORE}`;
    return result;
  }

  const meetsCanonicalScore = best.score >= CANONICAL_MIN_SCORE;

  // ── Phase 6: Validate by fetching page ─────────────────────────
  const hasStrongSearchEvidence =
    best.score >= 5.5 &&
    best.domainMatch &&
    best.titleMatch &&
    !ambiguous &&
    (ranked.length < 2 || best.score - ranked[1].score > 1.5);

  const fetchResult = await fetchPageText(best.url);
  console.log(`  🔍 Fetch method: ${fetchResult.method} (${fetchResult.text.length} chars)`);

  let pageValidated = false;
  let pageFailedReason = "";

  if (fetchResult.text.length >= 50) {
    // Page fetched — run full validation

    // 6a: Name must appear on page
    if (!nameAppearsOnPage(fetchResult.text, cleanName)) {
      pageFailedReason = `firm name not found on candidate page [${fetchResult.method}]`;
    }

    // 6b: No alien firm identity
    if (!pageFailedReason) {
      const alienFirm = detectAlienFirmIdentity(fetchResult.text, cleanName);
      if (alienFirm) {
        pageFailedReason = `page identity mismatch: "${alienFirm}" not "${cleanName}"`;
      }
    }

    if (!pageFailedReason) {
      pageValidated = true;
    }
  } else {
    // Fetch failed
    if (hasStrongSearchEvidence) {
      pageValidated = true; // bypass
      console.log(
        `  🔓 Strong-match bypass: score=${best.score}, domain+title match, no close competitor`
      );
    } else {
      pageFailedReason = `fetch failed [${fetchResult.method || "all tiers"}], score ${best.score} too low for bypass`;
    }
  }

  // ── Phase 7: Route to canonical write or review lane ───────────
  //
  // CANONICAL requires ALL of:
  //   ✓ meets canonical score threshold
  //   ✓ page validated (or strong-match bypass)
  //   ✓ candidate is root domain (or safely normalizable to root)
  //   ✓ no close competing candidate
  //   ✓ not junk (already filtered in Phase 2)
  //
  // REVIEW gets everything else that has REVIEW_MIN_SCORE:
  //   - ambiguous candidates (already handled in Phase 4)
  //   - page validation failures
  //   - score below canonical threshold but above review threshold
  //   - non-root URLs that can't be safely normalized

  // Normalize pathful URLs to root domain for canonical writes
  const canonicalUrl = normalizeToRoot(best.url);
  const isCanonicalRoot = isRootishUrl(canonicalUrl)
    || new URL(canonicalUrl).pathname === "/";

  const noCloseCompetitor =
    ranked.length < 2 || best.score - ranked[1].score > 1;

  if (
    meetsCanonicalScore &&
    pageValidated &&
    isCanonicalRoot &&
    noCloseCompetitor
  ) {
    // ── CANONICAL WRITE ──────────────────────────────────────────
    const ok = await updateFirm(firm.id, {
      website_url: canonicalUrl,
      last_enriched_at: new Date().toISOString(),
    });

    if (ok) {
      result.written = true;
      result.lane = "canonical";
      const method = fetchResult.text.length < 50
        ? `search-bypass, score=${best.score}`
        : `${fetchResult.method}-validated, score=${best.score}`;
      result.reason = DRY_RUN
        ? `canonical (dry run) [${method}]`
        : `canonical write [${method}]`;
      result.candidateUrl = canonicalUrl;
    } else {
      result.reason = "supabase update failed";
    }
  } else {
    // ── REVIEW LANE ──────────────────────────────────────────────
    const reasons: string[] = [];
    if (!meetsCanonicalScore) reasons.push(`score ${best.score} < canonical ${CANONICAL_MIN_SCORE}`);
    if (!pageValidated) reasons.push(pageFailedReason || "page not validated");
    if (!isCanonicalRoot) reasons.push("non-root URL");
    if (!noCloseCompetitor) reasons.push(`close competitor: ${ranked[1]?.domain} (${ranked[1]?.score})`);

    return sendToReview(
      result,
      best,
      ranked,
      reasons.join("; "),
      fetchResult.method
    );
  }

  return result;
}

// ── Concurrency / orchestration ──────────────────────────────────
function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function processBatch(firms: FirmCandidate[]): Promise<EnrichResult[]> {
  const results: EnrichResult[] = [];
  let idx = 0;

  async function worker() {
    while (idx < firms.length) {
      const i = idx++;
      const firm = firms[i];
      const num = i + 1;
      const eScore = enrichabilityScore(firm);
      const hints: string[] = [];
      if (firm.description && firm.description.length > 50) hints.push("desc");
      if (firm.linkedin_url) hints.push("li");
      if (firm.hq_city) hints.push("city");
      if (firm.signal_nfx_url) hints.push("nfx");
      console.log(
        `\n[${num}/${firms.length}] Processing: ${firm.firm_name} (${firm.id.slice(0, 8)}…) enrich=${eScore.toFixed(1)} hints=[${hints.join(",")}]`
      );
      try {
        const result = await enrichFirm(firm);
        results.push(result);
        const icon = result.written ? "✅" : result.reviewed ? "📝" : "⏭️";
        console.log(
          `  ${icon} [${result.lane}] ${result.source} → ${result.candidateUrl || "none"} — ${result.reason}`
        );
      } catch (e: any) {
        console.error(`  ❌ Error: ${e.message}`);
        results.push({
          firmId: firm.id,
          firmName: firm.firm_name,
          source: "skipped",
          candidateUrl: null,
          lane: "skipped",
          written: false,
          reviewed: false,
          reason: `error: ${e.message}`,
          candidatesConsidered: 0,
          ambiguityDetected: false,
        });
      }
      if (i < firms.length - 1) await sleep(DELAY_MS);
    }
  }

  // Launch workers
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(CONCURRENCY, firms.length); w++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return results;
}

// ── Main ──────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  backfill-firm-websites.ts");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Mode:        ${DRY_RUN ? "🔍 DRY RUN" : "✏️  LIVE WRITE"}`);
  console.log(`  Limit:       ${LIMIT}`);
  console.log(`  Offset:      ${OFFSET}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
  console.log(`  Delay:       ${DELAY_MS}ms`);
  console.log(`  Exa:         ${EXA_KEY ? "✅" : "❌"}`);
  console.log(`  Tavily:      ${TAVILY_KEY ? "✅" : "❌"}`);
  console.log(`  Jina:        ${JINA_KEY ? "✅" : "❌"}`);
  console.log(`  ScrapingBee: ${SCRAPINGBEE_KEY ? "✅" : "❌"}`);
  console.log("═══════════════════════════════════════════════════════════\n");

  const firms = await fetchCandidates();
  if (firms.length === 0) {
    console.log("No candidates found. Exiting.");
    return;
  }

  const startTime = Date.now();
  const results = await processBatch(firms);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  // ── Summary ───────────────────────────────────────────────────
  const canonical = results.filter((r) => r.lane === "canonical");
  const reviewed = results.filter((r) => r.lane === "review");
  const skipped = results.filter((r) => r.lane === "skipped");
  const bySource = {
    exa: results.filter((r) => r.source === "exa").length,
    tavily: results.filter((r) => r.source === "tavily").length,
    none: results.filter((r) => r.source === "skipped").length,
  };
  const totalCandidates = results.reduce(
    (sum, r) => sum + r.candidatesConsidered,
    0
  );
  const bypasses = canonical.filter((r) => r.reason.includes("search-bypass")).length;

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("  SUMMARY (two-lane)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Processed:         ${results.length}`);
  console.log(
    `  ✅ Canonical writes: ${canonical.length} ${DRY_RUN ? "(would write)" : "→ firm_records.website_url"}`
  );
  console.log(
    `  📝 Review queue:     ${reviewed.length} ${DRY_RUN ? "(would queue)" : "→ firm_website_candidates"}`
  );
  console.log(`  ⏭️  Skipped:          ${skipped.length}`);
  console.log(`  Candidates eval:   ${totalCandidates} unique domains`);
  console.log(`  Search bypasses:   ${bypasses}`);
  console.log(`  By source:         Exa=${bySource.exa}  Tavily=${bySource.tavily}  None=${bySource.none}`);
  console.log(`  Time:              ${elapsed}s`);
  const total = results.length || 1;
  console.log(
    `  Canonical rate:    ${((canonical.length / total) * 100).toFixed(1)}%`
  );
  console.log(
    `  Coverage rate:     ${(((canonical.length + reviewed.length) / total) * 100).toFixed(1)}% (canonical + review)`
  );
  console.log("═══════════════════════════════════════════════════════════\n");

  // ── Skip reasons ──────────────────────────────────────────────
  if (skipped.length > 0) {
    const reasonCounts: Record<string, number> = {};
    for (const s of skipped) {
      reasonCounts[s.reason] = (reasonCounts[s.reason] || 0) + 1;
    }
    console.log("Skip reasons:");
    for (const [reason, count] of Object.entries(reasonCounts).sort(
      (a, b) => b[1] - a[1]
    )) {
      console.log(`  ${count}x — ${reason}`);
    }
  }

  // ── Review details ────────────────────────────────────────────
  if (reviewed.length > 0) {
    console.log("\n📝 Review queue:");
    for (const r of reviewed) {
      console.log(`  ${r.firmName} → ${r.candidateUrl} [${r.source}] ${r.reason}`);
    }
  }

  // ── Canonical details ─────────────────────────────────────────
  if (canonical.length > 0) {
    console.log("\n✅ Canonical writes:");
    for (const w of canonical) {
      console.log(`  ${w.firmName} → ${w.candidateUrl} [${w.source}] ${w.reason}`);
    }
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
