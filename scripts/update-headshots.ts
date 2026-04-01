/**
 * update-headshots.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Populate / refresh firm_investors.avatar_url by:
 *
 *   Pass 1 — Social-handle resolution via unavatar.io
 *     • x_url  →  https://unavatar.io/x/<handle>
 *     • linkedin_url  →  https://unavatar.io/linkedin/<slug>
 *
 *   Pass 2 — Firm website scraping (HTML + regex, no headless browser)
 *     • Discovers team pages (/team, /people, /partners, …)
 *     • Respects robots.txt (caches rules per domain)
 *     • Extracts <img> URLs near name text, fuzzy-matches to DB investors
 *
 * Usage (from project root):
 *   npx tsx scripts/update-headshots.ts
 *   # Or limit to one firm:
 *   FIRM_ID=<uuid> npx tsx scripts/update-headshots.ts
 *   # Dry-run (no DB writes):
 *   DRY_RUN=true npx tsx scripts/update-headshots.ts
 *
 * Team page fetching strategy:
 *   1. Jina AI reader (r.jina.ai) — renders JavaScript, returns markdown with image URLs.
 *      Handles React / Next.js / Svelte sites that don't SSR their team content.
 *      Falls back to raw HTML if Jina fails (e.g. rate-limited or blocked).
 *   2. Raw HTML fetch — works for Webflow and other SSR sites.
 *
 * Dependencies (all already in node_modules):
 *   @supabase/supabase-js, p-limit, node-fetch-native (or Node ≥18 global fetch)
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/loadEnvFiles.js";
import pLimit from "p-limit";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG
// ─────────────────────────────────────────────────────────────────────────────

loadEnvFiles(); // loads .env + .env.local into process.env

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not set");
if (!SUPABASE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

const DRY_RUN = process.env.DRY_RUN === "true";
const FIRM_ID_FILTER = process.env.FIRM_ID ?? null;      // optional: run for one firm only
const ALLOW_REFRESH = process.env.ALLOW_REFRESH === "true"; // overwrite ALL existing avatars
const FIRM_CONCURRENCY = 3;   // parallel firm workers
const REQUEST_DELAY_MS = [400, 1_000] as const; // random range between HTTP requests

// Jina AI reader — renders JS before returning page content as markdown
const JINA_API_KEY = process.env.JINA_API_KEY ?? "";
const JINA_BASE = "https://r.jina.ai";
// Jina concurrency: keep low to avoid rate limits on free/starter plans
const jinaLimit = pLimit(2);

/**
 * URL substrings that indicate a known-bad / placeholder avatar.
 * These are treated as missing regardless of ALLOW_REFRESH, because
 * a previous enrichment run populated them with Google favicons or
 * unavatar.io SVG initials — neither are real headshot photos.
 *
 *   • gstatic.com/favicon  — Google's 16px favicon service
 *   • s2.googleusercontent.com — another Google favicon CDN
 *   • unavatar.io           — returns SVG initials as fallback when no real photo found
 */
const BAD_AVATAR_PATTERNS = [
  "gstatic.com/favicon",
  "s2.googleusercontent.com",
  "unavatar.io",
];

/** Returns true if the stored avatar_url is a known placeholder, not a real headshot */
function isBadAvatar(url: string | null): boolean {
  if (!url) return true;
  return BAD_AVATAR_PATTERNS.some((p) => url.includes(p));
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

interface FirmRecord {
  id: string;
  firm_name: string;
  website_url: string | null;
}

interface FirmInvestor {
  id: string;
  firm_id: string;
  full_name: string;
  title: string | null;
  avatar_url: string | null;
  linkedin_url: string | null;
  x_url: string | null;
}

interface UpdateOutcome {
  investorId: string;
  investorName: string;
  method: "unavatar-x" | "unavatar-linkedin" | "website-scrape-jina" | "website-scrape-html";
  imageUrl: string;
  sourceUrl: string;
}

interface FirmResult {
  firmId: string;
  firmName: string;
  updated: UpdateOutcome[];
  skipped: { name?: string; reason: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP HELPERS
// ─────────────────────────────────────────────────────────────────────────────

const USER_AGENT =
  "Mozilla/5.0 (compatible; VektaBot/1.0; +https://vekta.so/bot)";

async function httpGet(
  url: string,
  options: { method?: "GET" | "HEAD"; timeout?: number } = {}
): Promise<Response | null> {
  const { method = "GET", timeout = 10_000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    return res;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url: string): Promise<string | null> {
  const res = await httpGet(url);
  if (!res?.ok) return null;
  try {
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Fetch a team page via Jina AI reader (r.jina.ai).
 *
 * Jina renders the page in a headless browser, then returns clean markdown
 * that includes all image URLs — works for React, Next.js, Svelte, etc.
 *
 * Response format (markdown):
 *   Title: Acme Ventures – Team
 *   URL Source: https://acmeventures.com/team
 *   ...
 *   ## Alice Johnson
 *   Partner
 *   ![Alice Johnson](https://cdn.acme.com/alice.jpg)
 *
 * Returns null on error / rate-limit, so caller can fall back to raw HTML.
 */
async function fetchViaJina(url: string): Promise<string | null> {
  if (!JINA_API_KEY) return null;

  const jinaUrl = `${JINA_BASE}/${url}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000); // Jina is slower

  try {
    const res = await fetch(jinaUrl, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${JINA_API_KEY}`,
        Accept: "text/plain, application/json",
        // Request image URLs to be preserved in output
        "X-With-Images-Summary": "true",
        "X-Return-Format": "markdown",
      },
    });
    if (!res.ok) {
      console.warn(`  [jina] ${res.status} for ${url}`);
      return null;
    }
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract (name, imageUrl) pairs from Jina markdown output.
 *
 * Real-world Jina structure (observed from blingcap.com, etc.):
 *   [![Image 1](https://firm.com/team/ben.jpg)](https://firm.com/ben/) ## Ben Ling
 *
 * Key observations:
 *  • The image PRECEDES the name — look AFTER the image, not before.
 *  • Alt text is often "Image N" (generic) — don't rely on it.
 *  • Names appear as ## headings or **bold** within ~300 chars after the image.
 *  • Also check 300 chars before for sites that put name first.
 */
function extractPersonsFromMarkdown(
  markdown: string,
  pageUrl: string
): { name: string; imageUrl: string }[] {
  const results: { name: string; imageUrl: string }[] = [];
  const seenImages = new Set<string>();
  const origin = new URL(pageUrl).origin;

  // Broad name pattern — handles hyphenated, apostrophe, Jr., III, etc.
  // Accepts 2-5 words where each starts with a capital or is a suffix (Jr, II, III)
  const NAME_RE =
    /^[A-ZÀ-Ö][a-zA-ZÀ-ö'\-\.]+(?:\s+[A-ZÀ-Ö][a-zA-ZÀ-ö'\-\.]+){1,4}(?:\s+(?:Jr\.?|Sr\.?|II|III|IV|V))?$/;

  // Patterns that pull a name out of surrounding text
  const namePatterns = [
    /#{1,4}\s+([A-ZÀ-Ö][^\n#]{2,50})/g,           // ## Ben Ling  or  ## Ann Miura-Ko
    /\*\*([A-ZÀ-Ö][^*\n]{2,50})\*\*/g,             // **Ben Ling**
    /^([A-ZÀ-Ö][a-zA-ZÀ-ö'\-\s\.]{4,50})$/mg,     // Plain capitalised line
  ];

  function findNameInWindow(text: string): string | null {
    for (const pat of namePatterns) {
      pat.lastIndex = 0;
      let nm: RegExpExecArray | null;
      let best: string | null = null;
      while ((nm = pat.exec(text)) !== null) {
        const candidate = nm[1].trim();
        const words = candidate.split(/\s+/);
        if (words.length >= 2 && words.length <= 6 && NAME_RE.test(candidate)) {
          best = candidate; // take last match — closer to the image
        }
      }
      if (best) return best;
    }
    return null;
  }

  // Match all markdown images: ![alt](url) — also matches inside [![alt](url)](link)
  const imgRegex = /!\[([^\]]*)\]\(([^)\s]+)\)/g;
  let m: RegExpExecArray | null;

  while ((m = imgRegex.exec(markdown)) !== null) {
    const altText = m[1].trim();
    const rawUrl = m[2].trim();
    const imgEnd = m.index + m[0].length;

    let imageUrl: string;
    try {
      imageUrl = new URL(rawUrl, origin).toString();
    } catch {
      continue;
    }
    if (!isLikelyHeadshot(imageUrl)) continue;
    if (seenImages.has(imageUrl)) continue;

    // ── Try alt text if it looks like a real name (not "Image N") ───────────
    if (!/^image\s*\d+$/i.test(altText) && NAME_RE.test(altText)) {
      seenImages.add(imageUrl);
      results.push({ name: altText, imageUrl });
      continue;
    }

    // ── Look AFTER the image (primary — this is where names appear) ─────────
    const afterWindow = markdown.slice(imgEnd, imgEnd + 350);
    let name = findNameInWindow(afterWindow);

    // ── Also look BEFORE as a fallback (some sites put name first) ───────────
    if (!name) {
      const beforeWindow = markdown.slice(Math.max(0, m.index - 350), m.index);
      name = findNameInWindow(beforeWindow);
    }

    if (name) {
      seenImages.add(imageUrl);
      results.push({ name, imageUrl });
    }
  }

  return results;
}

/**
 * Cache of final resolved URLs from Jina — prevents scraping the same page
 * twice when /team and /our-team both redirect to the same destination.
 */
const jinaFinalUrlCache = new Set<string>();

/**
 * Extract the canonical URL Jina resolved to (from "URL Source: ..." header line).
 * Returns null if not found.
 */
function extractJinaFinalUrl(markdown: string): string | null {
  const m = markdown.match(/^URL Source:\s*(\S+)/m);
  return m ? m[1].trim() : null;
}

/**
 * Fetch a team page and return extracted persons with their source method.
 * Strategy: try Jina first (handles JS-rendered sites), fall back to raw HTML.
 */
async function fetchTeamPage(
  pageUrl: string
): Promise<{ name: string; imageUrl: string; via: "jina" | "html" }[]> {
  // ── Pass A: Jina AI (JS-rendered markdown) ────────────────────────────────
  const markdown = await jinaLimit(() => fetchViaJina(pageUrl));
  if (markdown && markdown.length > 500) {
    // Deduplicate: if /team and /our-team resolve to the same URL, skip the second
    const finalUrl = extractJinaFinalUrl(markdown);
    if (finalUrl) {
      if (jinaFinalUrlCache.has(finalUrl)) {
        // Already scraped this canonical page via a different candidate path
        return [];
      }
      jinaFinalUrlCache.add(finalUrl);
    }

    const persons = extractPersonsFromMarkdown(markdown, finalUrl ?? pageUrl);
    // Require ≥ 2 persons — a real team page lists multiple people.
    // A news article or blog post might mention 1 name but isn't a team page.
    if (persons.length >= 2) {
      console.log(`  [jina] ${pageUrl} → ${persons.length} person(s)`);
      return persons.map((p) => ({ ...p, via: "jina" as const }));
    }
    // Jina rendered the page but found < 2 persons — fall through to raw HTML
  }

  // ── Pass B: Raw HTML (fast for Webflow / SSR sites) ───────────────────────
  const html = await fetchText(pageUrl);
  if (!html) return [];
  const persons = extractPersonsFromHtml(html, pageUrl);
  if (persons.length > 0) {
    console.log(`  [html] ${pageUrl} → ${persons.length} person(s)`);
  }
  return persons.map((p) => ({ ...p, via: "html" as const }));
}

function delay(minMs = REQUEST_DELAY_MS[0], maxMs = REQUEST_DELAY_MS[1]) {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise<void>((r) => setTimeout(r, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// ROBOTS.TXT HELPER
// ─────────────────────────────────────────────────────────────────────────────

/** Per-domain cache: domain origin → { disallowed[], allowed[] } */
const robotsCache = new Map<string, { disallowed: string[]; allowed: string[] }>();

function parseRobotsTxt(body: string): { disallowed: string[]; allowed: string[] } {
  const disallowed: string[] = [];
  const allowed: string[] = [];
  let inWildcard = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;

    if (/^user-agent\s*:/i.test(line)) {
      inWildcard = line.replace(/^user-agent\s*:\s*/i, "").trim() === "*";
      continue;
    }
    if (!inWildcard) continue;

    if (/^disallow\s*:/i.test(line)) {
      const p = line.replace(/^disallow\s*:\s*/i, "").trim();
      if (p) disallowed.push(p);
    } else if (/^allow\s*:/i.test(line)) {
      const p = line.replace(/^allow\s*:\s*/i, "").trim();
      if (p) allowed.push(p);
    }
  }
  return { disallowed, allowed };
}

async function canScrapePath(origin: string, path: string): Promise<boolean> {
  if (!robotsCache.has(origin)) {
    const body = await fetchText(`${origin}/robots.txt`);
    robotsCache.set(origin, body ? parseRobotsTxt(body) : { disallowed: [], allowed: [] });
  }
  const { disallowed, allowed } = robotsCache.get(origin)!;

  let bestLen = -1;
  let bestAllow = true;

  for (const rule of disallowed) {
    if (path.startsWith(rule) && rule.length > bestLen) {
      bestLen = rule.length;
      bestAllow = false;
    }
  }
  for (const rule of allowed) {
    if (path.startsWith(rule) && rule.length > bestLen) {
      bestLen = rule.length;
      bestAllow = true;
    }
  }
  return bestAllow;
}

// ─────────────────────────────────────────────────────────────────────────────
// PASS 1 — UNAVATAR SOCIAL RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pull the handle from a social profile URL.
 * e.g. "https://x.com/naval" → "naval"
 *      "https://linkedin.com/in/garrytan" → "garrytan"
 */
function extractHandle(url: string): string | null {
  try {
    const parts = new URL(url).pathname.split("/").filter(Boolean);
    // LinkedIn: /in/<slug>  →  last meaningful segment
    const last = parts[parts.length - 1];
    if (last && last.length > 1 && !/^\d+$/.test(last)) return last;
  } catch {}
  return null;
}

/**
 * Check unavatar.io for a given candidate URL.
 * Returns the URL if it resolves to a real image (not a fallback SVG / tiny redirect).
 */
async function probeUnavatar(candidateUrl: string): Promise<string | null> {
  const res = await httpGet(candidateUrl, { method: "HEAD" });
  if (!res?.ok) return null;

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) return null;

  // Reject SVG fallbacks (unavatar returns SVG initials when nothing is found)
  if (contentType.includes("svg")) return null;

  // Reject tiny responses (< 2 KB — likely a placeholder)
  const cl = parseInt(res.headers.get("content-length") ?? "0", 10);
  if (cl > 0 && cl < 2_000) return null;

  return candidateUrl;
}

/**
 * Attempt to resolve a headshot URL for an investor using social handles.
 * Returns { method, imageUrl } or null.
 */
async function resolveViaUnavatar(
  investor: FirmInvestor
): Promise<{ method: "unavatar-x" | "unavatar-linkedin"; imageUrl: string } | null> {
  // ── X / Twitter ────────────────────────────────────────────────────────────
  if (investor.x_url) {
    const handle = extractHandle(investor.x_url);
    if (handle) {
      await delay();
      const url = await probeUnavatar(
        `https://unavatar.io/x/${encodeURIComponent(handle)}`
      );
      if (url) return { method: "unavatar-x", imageUrl: url };
    }
  }

  // ── LinkedIn ───────────────────────────────────────────────────────────────
  if (investor.linkedin_url) {
    const handle = extractHandle(investor.linkedin_url);
    if (handle) {
      await delay();
      const url = await probeUnavatar(
        `https://unavatar.io/linkedin/${encodeURIComponent(handle)}`
      );
      if (url) return { method: "unavatar-linkedin", imageUrl: url };
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PASS 2 — WEBSITE SCRAPING
// ─────────────────────────────────────────────────────────────────────────────

// Only the 6 most common paths — avoids hammering every firm with 13 Jina calls
const TEAM_PATHS = ["/team", "/people", "/partners", "/about", "/leadership", "/firm"];

const TEAM_KEYWORDS = ["team", "people", "partners", "investors", "about", "leadership", "staff"];

/** Image URL substrings that reliably indicate non-headshot images */
const REJECT_SUBSTRINGS = [
  "logo", "icon", "sprite", "brand", "banner", "hero",
  "background", "bg-", "placeholder", "pattern", "texture",
  "illustration", "cover", "favicon",
];

function isLikelyHeadshot(url: string): boolean {
  const lower = url.toLowerCase();
  if (REJECT_SUBSTRINGS.some((kw) => lower.includes(kw))) return false;
  if (lower.includes(".svg")) return false;

  // Dimension hints: reject tiny images (< 60 px)
  const dim = lower.match(/[_-](\d+)x(\d+)/);
  if (dim && (parseInt(dim[1]) < 60 || parseInt(dim[2]) < 60)) return false;

  return true;
}

/** Normalise a name: lowercase, trim, strip non-alpha */
function normName(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z\s]/g, "").replace(/\s+/g, " ");
}

/** Simple Jaro-Winkler similarity (no deps) */
function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;

  const range = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  if (range < 0) return 0;

  const m1 = new Array<boolean>(s1.length).fill(false);
  const m2 = new Array<boolean>(s2.length).fill(false);
  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    for (let j = Math.max(0, i - range); j < Math.min(i + range + 1, s2.length); j++) {
      if (m2[j] || s1[i] !== s2[j]) continue;
      m1[i] = m2[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!m1[i]) continue;
    while (!m2[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  for (let i = 0; i < Math.min(4, s1.length, s2.length); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Match a scraped name string to the best FirmInvestor. Threshold 0.82. */
function matchName(
  scrapedName: string,
  investors: FirmInvestor[]
): { investor: FirmInvestor; confidence: number } | null {
  const sn = normName(scrapedName);
  const [sf, ...sr] = sn.split(" ");
  const sl = sr[sr.length - 1] ?? "";

  let best: { investor: FirmInvestor; confidence: number } | null = null;

  for (const inv of investors) {
    const in_ = normName(inv.full_name);
    if (sn === in_) return { investor: inv, confidence: 1.0 };

    const [inf, ...inr] = in_.split(" ");
    const inl = inr[inr.length - 1] ?? "";
    if (sf === inf && sl === inl && sf && sl) {
      if (!best || best.confidence < 0.95) best = { investor: inv, confidence: 0.95 };
      continue;
    }

    const score = jaroWinkler(sn, in_);
    if (score >= 0.82 && (!best || score > best.confidence)) {
      best = { investor: inv, confidence: score };
    }
  }
  return best;
}

/**
 * Extract absolute image URL from <img> tag string.
 * Handles src, data-src, data-lazy-src, srcset.
 */
function extractImgUrl(imgTag: string, origin: string): string | null {
  const attrPriority = ["data-src", "data-lazy-src", "data-original", "src", "srcset"];
  for (const attr of attrPriority) {
    const m = imgTag.match(new RegExp(`${attr}="([^"]+)"`))
      ?? imgTag.match(new RegExp(`${attr}='([^']+)'`));
    if (!m) continue;
    const raw = m[1].split(",")[0].split(" ")[0].trim();
    if (!raw || raw.startsWith("data:")) continue;
    try {
      return new URL(raw, origin).toString();
    } catch {}
  }
  return null;
}

/**
 * Given a raw HTML page, extract (name, imageUrl) pairs by looking for
 * <img> tags within ~600 chars of a name-like heading.
 *
 * Strategy:
 *  1. Find all <img> positions in the HTML.
 *  2. Within a 600-char window around each img, look for h2/h3/h4/.name text.
 *  3. Clean the text, try to match investor names.
 */
function extractPersonsFromHtml(
  html: string,
  pageUrl: string
): { name: string; imageUrl: string }[] {
  const origin = new URL(pageUrl).origin;
  const results: { name: string; imageUrl: string }[] = [];

  // Strip script/style blocks to reduce noise
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  // Find all <img ...> positions
  const imgRegex = /<img\s[^>]*>/gi;
  let imgMatch: RegExpExecArray | null;

  while ((imgMatch = imgRegex.exec(cleaned)) !== null) {
    const imgTag = imgMatch[0];
    const imgPos = imgMatch.index;

    // Window: 600 chars before + 200 chars after the img tag
    const windowStart = Math.max(0, imgPos - 600);
    const windowEnd = Math.min(cleaned.length, imgPos + imgTag.length + 200);
    const window = cleaned.slice(windowStart, windowEnd);

    // Look for name-like text in headings or .name spans inside this window
    const namePatterns = [
      /<h[1-4][^>]*>([^<]{2,60})<\/h[1-4]>/gi,
      /class="[^"]*name[^"]*"[^>]*>([^<]{2,60})</gi,
      /class="[^"]*title[^"]*"[^>]*>([^<]{2,60})</gi,  // sometimes title class holds name
      /<strong>([A-Z][a-z]+ [A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)<\/strong>/gi,
    ];

    let name: string | null = null;
    for (const pat of namePatterns) {
      let m: RegExpExecArray | null;
      while ((m = pat.exec(window)) !== null) {
        const candidate = m[1]
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        // Must look like a name: 2–5 words, each starting capital
        if (/^[A-Z][a-z]+(\s[A-Z][a-z\-']+){1,4}$/.test(candidate)) {
          name = candidate;
          break;
        }
      }
      if (name) break;
    }

    if (!name) continue;

    // Extract image URL
    const imageUrl = extractImgUrl(imgTag, origin);
    if (!imageUrl) continue;
    if (!isLikelyHeadshot(imageUrl)) continue;

    results.push({ name, imageUrl });
  }

  return results;
}

/** Path segments that indicate a non-team page */
const SKIP_PATH_SEGMENTS = [
  "portfolio", "investment", "investments", "company", "companies",
  "startups", "fund", "funds", "news", "news-insights", "insights",
  "blog", "press", "media", "jobs", "careers", "contact", "legal",
  "privacy", "terms", "resources", "events", "case-studies", "research",
];

function isNonTeamPath(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const parts = pathname.split("/").filter(Boolean);
    // Reject deep paths (news articles, portfolio company pages, etc.)
    // A team page is almost always 1–2 levels deep: /team or /about/team
    if (parts.length > 2) return true;
    return SKIP_PATH_SEGMENTS.some((seg) => parts.includes(seg));
  } catch {
    return true;
  }
}

/**
 * Discover team-like page URLs for a firm, respecting robots.txt.
 * Deduplicates by the Jina-resolved final URL to avoid scraping redirects twice.
 */
async function discoverTeamPages(websiteUrl: string): Promise<string[]> {
  const origin = new URL(websiteUrl).origin;
  const seenPaths = new Set<string>();
  const pages: string[] = [];

  const tryAdd = async (url: string) => {
    const norm = url.replace(/\/$/, "");
    const path = new URL(norm).pathname;
    if (seenPaths.has(path)) return;
    if (isNonTeamPath(norm)) return;
    seenPaths.add(path);
    if (await canScrapePath(origin, path)) pages.push(norm);
  };

  // Fixed candidate paths (trimmed to the 6 most common)
  for (const p of TEAM_PATHS) await tryAdd(`${origin}${p}`);

  // Parse homepage HTML for additional internal team links
  const html = await fetchText(websiteUrl);
  if (html) {
    const linkRegex = /<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = linkRegex.exec(html)) !== null) {
      const href = m[1];
      const text = m[2].replace(/<[^>]+>/g, "").toLowerCase().trim();
      let resolved: string;
      try { resolved = new URL(href, origin).toString(); } catch { continue; }
      if (!resolved.startsWith(origin)) continue;
      if (isNonTeamPath(resolved)) continue;
      if (TEAM_KEYWORDS.some((kw) => resolved.toLowerCase().includes(kw) || text.includes(kw))) {
        await tryAdd(resolved);
      }
    }
  }

  return pages;
}

/**
 * Scrape all discovered team pages for a firm, return matched investor updates.
 *
 * Domain guard: we only accept image URLs whose hostname either:
 *  a) matches the firm's own website hostname, OR
 *  b) is a known CDN (Webflow, Cloudinary, Cloudfront, Imgix, etc.)
 *
 * This prevents cross-contamination where a firm's website links to a partner
 * firm's page and we accidentally scrape that firm's headshots instead.
 */

/** CDN hostnames whose images can legitimately serve any firm's assets */
const TRUSTED_CDN_HOSTS = [
  "cdn.prod.website-files.com",  // Webflow CDN
  "assets.website-files.com",
  "uploads-ssl.webflow.com",
  "cloudinary.com",
  "res.cloudinary.com",
  "images.ctfassets.net",        // Contentful
  "a.storyblok.com",             // Storyblok
  "d1.awsstatic.com",
  "images.squarespace-cdn.com",
  "static.wixstatic.com",
  "framerusercontent.com",
  "storage.googleapis.com",
  "s3.amazonaws.com",
  "amazonaws.com",
];

function isTrustedCdn(imageUrl: string): boolean {
  try {
    const host = new URL(imageUrl).hostname;
    return TRUSTED_CDN_HOSTS.some((cdn) => host === cdn || host.endsWith(`.${cdn}`));
  } catch {
    return false;
  }
}

function imageMatchesFirmDomain(imageUrl: string, firmWebsiteUrl: string): boolean {
  try {
    const imgHost = new URL(imageUrl).hostname.replace(/^www\./, "");
    const firmHost = new URL(firmWebsiteUrl).hostname.replace(/^www\./, "");
    return imgHost === firmHost || imgHost.endsWith(`.${firmHost}`);
  } catch {
    return false;
  }
}

async function scrapeWebsiteForHeadshots(
  firm: FirmRecord,
  investors: FirmInvestor[]
): Promise<UpdateOutcome[]> {
  const updates: UpdateOutcome[] = [];
  const matchedIds = new Set<string>();

  let pages: string[];
  try {
    pages = await discoverTeamPages(firm.website_url!);
  } catch {
    return [];
  }

  for (const pageUrl of pages) {
    await delay();
    const persons = await fetchTeamPage(pageUrl);
    for (const { name, imageUrl, via } of persons) {
      // ── Domain guard ──────────────────────────────────────────────────────
      // Only accept the image if it comes from the firm's own domain or a CDN.
      // This prevents a firm whose website_url accidentally points to another
      // firm's site from polluting the wrong investor records.
      const fromFirmDomain = imageMatchesFirmDomain(imageUrl, firm.website_url!);
      const fromTrustedCdn = isTrustedCdn(imageUrl);
      if (!fromFirmDomain && !fromTrustedCdn) {
        console.warn(
          `  [domain-guard] Skipped cross-domain image for "${name}": ${new URL(imageUrl).hostname} ≠ ${new URL(firm.website_url!).hostname}`
        );
        continue;
      }

      const match = matchName(name, investors);
      if (!match) continue;
      const { investor } = match;
      if (matchedIds.has(investor.id)) continue;
      matchedIds.add(investor.id);

      updates.push({
        investorId: investor.id,
        investorName: investor.full_name,
        method: via === "jina" ? "website-scrape-jina" : "website-scrape-html",
        imageUrl,
        sourceUrl: pageUrl,
      });
    }
  }

  return updates;
}

// ─────────────────────────────────────────────────────────────────────────────
// ORCHESTRATION
// ─────────────────────────────────────────────────────────────────────────────

async function processInvestor(investor: FirmInvestor): Promise<UpdateOutcome | null> {
  // Skip if they have a good avatar already (bad avatars were already nulled by cleanBadAvatars)
  if (investor.avatar_url && !ALLOW_REFRESH && !isBadAvatar(investor.avatar_url)) return null;
  if (!investor.x_url && !investor.linkedin_url) return null; // no social handles — handled in scrape pass

  const result = await resolveViaUnavatar(investor);
  if (!result) return null;

  return {
    investorId: investor.id,
    investorName: investor.full_name,
    method: result.method,
    imageUrl: result.imageUrl,
    sourceUrl: result.imageUrl,
  };
}

async function processFirm(firm: FirmRecord): Promise<FirmResult> {
  const result: FirmResult = {
    firmId: firm.id,
    firmName: firm.firm_name,
    updated: [],
    skipped: [],
  };

  // Fetch investors for this firm
  const { data: investors, error } = await supabase
    .from("firm_investors")
    .select("id, firm_id, full_name, title, avatar_url, linkedin_url, x_url")
    .eq("firm_id", firm.id);

  if (error || !investors?.length) {
    result.skipped.push({ reason: "no investors found or DB error" });
    return result;
  }

  // Needs an avatar if: no avatar, OR avatar is a known-bad placeholder, OR force-refresh is on
  const needsAvatar = investors.filter(
    (i) => ALLOW_REFRESH || isBadAvatar(i.avatar_url)
  );

  if (needsAvatar.length === 0) {
    result.skipped.push({ reason: "all investors already have avatars" });
    return result;
  }

  // ── Pass 1: Social-handle resolution (per-investor, parallelised) ───────────
  const socialLimit = pLimit(5);
  const socialResults = await Promise.all(
    needsAvatar.map((inv) => socialLimit(() => processInvestor(inv)))
  );

  const updatedByUnavatar = new Set<string>();
  for (const outcome of socialResults) {
    if (!outcome) continue;
    result.updated.push(outcome);
    updatedByUnavatar.add(outcome.investorId);
  }

  // ── Pass 2: Website scraping for investors still missing avatars ─────────────
  const stillMissing = needsAvatar.filter((i) => !updatedByUnavatar.has(i.id));

  if (stillMissing.length > 0 && firm.website_url) {
    const scrapeUpdates = await scrapeWebsiteForHeadshots(firm, stillMissing);
    result.updated.push(...scrapeUpdates);
  } else if (stillMissing.length > 0) {
    for (const inv of stillMissing) {
      result.skipped.push({ name: inv.full_name, reason: "no social handles and no firm website" });
    }
  }

  // ── Write back to DB ──────────────────────────────────────────────────────────
  if (!DRY_RUN) {
    for (const outcome of result.updated) {
      const { error: upErr } = await supabase
        .from("firm_investors")
        .update({ avatar_url: outcome.imageUrl })
        .eq("id", outcome.investorId);

      if (upErr) {
        console.error(`  ✗ DB update failed for ${outcome.investorName}: ${upErr.message}`);
        result.skipped.push({ name: outcome.investorName, reason: `DB write failed: ${upErr.message}` });
        result.updated = result.updated.filter((u) => u.investorId !== outcome.investorId);
      }
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

/**
 * One-time cleanup: NULL-out known-bad avatar URLs so subsequent logic
 * treats them correctly as missing. Runs before the main firm loop.
 * Skipped in DRY_RUN mode.
 */
async function cleanBadAvatars(): Promise<void> {
  if (DRY_RUN) {
    console.log("[cleanup] DRY RUN — skipping bad-avatar nullification");
    return;
  }

  console.log("[cleanup] Nullifying known-bad avatar URLs (favicon / unavatar fallbacks)…");
  let totalCleaned = 0;

  for (const pattern of BAD_AVATAR_PATTERNS) {
    const { count, error } = await supabase
      .from("firm_investors")
      .update({ avatar_url: null })
      .like("avatar_url", `%${pattern}%`)
      .select("id", { count: "exact", head: true });

    if (error) {
      console.warn(`  ⚠ Failed to clean pattern "${pattern}": ${error.message}`);
    } else {
      const n = count ?? 0;
      totalCleaned += n;
      if (n > 0) console.log(`  ✓ Cleared ${n} rows matching "${pattern}"`);
    }
  }

  console.log(`[cleanup] Done — ${totalCleaned} bad avatars nullified.\n`);
}

async function main() {
  console.log("═".repeat(64));
  console.log("  Vekta — Investor Headshot Updater");
  if (DRY_RUN) console.log("  ⚠️  DRY RUN — no DB writes will occur");
  console.log("═".repeat(64));

  // Step 0: null-out placeholder/favicon avatar_url values first
  await cleanBadAvatars();

  // Fetch firms
  let query = supabase.from("firm_records").select("id, firm_name, website_url");
  if (FIRM_ID_FILTER) query = query.eq("id", FIRM_ID_FILTER);

  const { data: firms, error: firmsErr } = await query;
  if (firmsErr || !firms) {
    console.error("Failed to fetch firms:", firmsErr?.message);
    process.exit(1);
  }
  console.log(`\nFirms to process: ${firms.length}\n`);

  // Process firms with concurrency limit
  const firmLimit = pLimit(FIRM_CONCURRENCY);
  const allResults: FirmResult[] = [];

  await Promise.all(
    firms.map((firm) =>
      firmLimit(async () => {
        console.log(`\n${"─".repeat(64)}`);
        console.log(`Firm: ${firm.firm_name}`);
        const result = await processFirm(firm as FirmRecord);
        allResults.push(result);

        for (const u of result.updated) {
          const dryTag = DRY_RUN ? " [DRY RUN]" : "";
          console.log(
            `  ✅ ${u.investorName}  via=${u.method}  →  ${u.imageUrl.slice(0, 80)}${dryTag}`
          );
        }
        for (const s of result.skipped) {
          const who = s.name ? `[${s.name}] ` : "";
          console.log(`  ⏭  ${who}${s.reason}`);
        }
      })
    )
  );

  // ── Summary ─────────────────────────────────────────────────────────────────
  const totalUpdated = allResults.reduce((n, r) => n + r.updated.length, 0);
  const totalSkipped = allResults.reduce((n, r) => n + r.skipped.length, 0);

  const byMethod = allResults
    .flatMap((r) => r.updated)
    .reduce<Record<string, number>>((acc, u) => {
      acc[u.method] = (acc[u.method] ?? 0) + 1;
      return acc;
    }, {});

  console.log("\n" + "═".repeat(64));
  console.log("  Summary");
  console.log("─".repeat(64));
  console.log(`  Firms processed : ${allResults.length}`);
  console.log(`  Avatars updated : ${totalUpdated}${DRY_RUN ? " (DRY RUN)" : ""}`);
  console.log(`  Skipped         : ${totalSkipped}`);
  console.log(`  By method:`);
  for (const [method, count] of Object.entries(byMethod)) {
    console.log(`    ${method.padEnd(22)}: ${count}`);
  }
  console.log("═".repeat(64));
}

main().catch((e) => {
  console.error("[fatal]", e);
  process.exit(1);
});
