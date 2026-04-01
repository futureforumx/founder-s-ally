/**
 * headshot-scraper.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Founder-intelligence platform — cheap, polite headshot population for
 * firm_investors rows.
 *
 * Strategy
 * --------
 *  1. Discover "team-like" pages on the firm's public website.
 *  2. Scrape each page with axios + cheerio (no headless browser).
 *  3. Fuzzy-match scraped names to known investors.
 *  4. Filter for images that look like headshots (not logos/icons).
 *  5. Write back via a stub repository layer (swap in real Supabase calls).
 *
 * Dependencies (add to package.json):
 *   axios, cheerio, p-limit
 *   @types/cheerio (if using cheerio v1 / types separate pkg)
 *
 * Run:
 *   npx ts-node headshot-scraper.ts
 */

import axios, { AxiosRequestConfig } from "axios";
import * as cheerio from "cheerio";
import pLimit from "p-limit";

// ─────────────────────────────────────────────────────────────────────────────
// 1. TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type FirmRecord = {
  id: string;
  firm_name: string;
  website_url?: string | null;
};

export type FirmInvestor = {
  id: string;
  firm_id: string;
  full_name: string;
  title?: string | null;
  avatar_url?: string | null;
  website_url?: string | null;
  linkedin_url?: string | null;
  x_url?: string | null;
};

export type ScrapedPerson = {
  name: string;
  title?: string | null;
  imageUrl?: string | null;
  sourceUrl: string;
};

export type HeadshotUpdate = {
  investorId: string;
  investorName: string;
  imageUrl: string;
  sourceUrl: string;
};

export type HeadshotUpdateResult = {
  firmId: string;
  firmName: string;
  scannedPages: string[];
  matched: HeadshotUpdate[];
  skipped: { investorId?: string; investorName?: string; reason: string }[];
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. HTTP UTILITY
// ─────────────────────────────────────────────────────────────────────────────

/** Shared axios config — short timeouts, browser-like UA to reduce bot blocks */
const HTTP_CONFIG: AxiosRequestConfig = {
  timeout: 10_000,
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; VektaBot/1.0; +https://vekta.so/bot)",
    Accept: "text/html,application/xhtml+xml,*/*;q=0.9",
    "Accept-Language": "en-US,en;q=0.9",
  },
  maxRedirects: 5,
};

/** Fetch HTML; returns null on any error so callers can skip gracefully */
async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await axios.get<string>(url, {
      ...HTTP_CONFIG,
      responseType: "text",
    });
    return res.data;
  } catch {
    console.warn(`[http] Could not fetch ${url}`);
    return null;
  }
}

/** Random delay in [minMs, maxMs] — polite scraping */
function randomDelay(minMs = 400, maxMs = 1_200): Promise<void> {
  const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. ROBOTS.TXT HELPER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * In-memory cache: domain → list of disallowed path prefixes for User-agent: *
 * Populated once per domain per process run.
 */
const robotsCache = new Map<string, string[]>();

/**
 * Parse a robots.txt body and extract disallowed paths for the wildcard agent.
 * This is intentionally simple: we only honour `User-agent: *` blocks and
 * `Disallow:` directives.  Allow: overrides are respected at the per-path level.
 */
function parseRobotsTxt(body: string): { disallowed: string[]; allowed: string[] } {
  const disallowed: string[] = [];
  const allowed: string[] = [];

  let inWildcardBlock = false;

  for (const rawLine of body.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim(); // strip comments
    if (!line) continue;

    if (/^user-agent\s*:/i.test(line)) {
      const agent = line.replace(/^user-agent\s*:\s*/i, "").trim();
      inWildcardBlock = agent === "*";
      continue;
    }

    if (!inWildcardBlock) continue;

    if (/^disallow\s*:/i.test(line)) {
      const path = line.replace(/^disallow\s*:\s*/i, "").trim();
      if (path) disallowed.push(path);
    } else if (/^allow\s*:/i.test(line)) {
      const path = line.replace(/^allow\s*:\s*/i, "").trim();
      if (path) allowed.push(path);
    }
  }

  return { disallowed, allowed };
}

/**
 * Returns true if the given path is scrapeable according to robots.txt.
 * Fetches and caches robots.txt once per base domain.
 */
export async function canScrapePath(
  baseUrl: string,
  path: string
): Promise<boolean> {
  const origin = new URL(baseUrl).origin;

  if (!robotsCache.has(origin)) {
    const robotsUrl = `${origin}/robots.txt`;
    const body = await fetchHtml(robotsUrl);

    if (!body) {
      // If we can't fetch robots.txt, assume everything is allowed
      robotsCache.set(origin, []);
      return true;
    }

    const { disallowed, allowed } = parseRobotsTxt(body);

    // Store combined rules; we'll re-evaluate per-path below.
    // We encode as "D:<path>" or "A:<path>" to distinguish allow/disallow.
    const rules = [
      ...disallowed.map((p) => `D:${p}`),
      ...allowed.map((p) => `A:${p}`),
    ];
    robotsCache.set(origin, rules);
  }

  const rules = robotsCache.get(origin)!;
  if (rules.length === 0) return true; // no restrictions

  // Find the most-specific matching rule (longest prefix wins per RFC 9309).
  let bestLen = -1;
  let bestAllow = true; // default = allowed

  for (const rule of rules) {
    const isAllow = rule.startsWith("A:");
    const rulePath = rule.slice(2);

    if (path.startsWith(rulePath) && rulePath.length > bestLen) {
      bestLen = rulePath.length;
      bestAllow = isAllow;
    }
  }

  return bestAllow;
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. DISCOVER TEAM PAGES
// ─────────────────────────────────────────────────────────────────────────────

/** Well-known paths that commonly host team/investor listings */
const TEAM_PATH_CANDIDATES = [
  "/team",
  "/our-team",
  "/the-team",
  "/people",
  "/partners",
  "/investors",
  "/about",
  "/about-us",
  "/leadership",
  "/portfolio-team",
  "/firm",
];

/** Keywords used to surface team-like links from the homepage */
const TEAM_LINK_KEYWORDS = [
  "team",
  "people",
  "partners",
  "investors",
  "about",
  "leadership",
  "staff",
  "crew",
  "members",
];

/**
 * Given a firm's root URL, return a deduplicated, robots-allowed list of URLs
 * that are likely to contain team/people listings.
 *
 * Steps:
 *  a) Generate well-known path candidates and filter by robots.txt.
 *  b) Fetch homepage and extract internal links that mention team keywords.
 */
export async function discoverTeamPages(websiteUrl: string): Promise<string[]> {
  const origin = new URL(websiteUrl).origin;
  const seen = new Set<string>();
  const results: string[] = [];

  /** Helper: add a URL only if robots allows it and we haven't seen it */
  const tryAdd = async (url: string) => {
    if (seen.has(url)) return;
    seen.add(url);

    const path = new URL(url).pathname;
    if (await canScrapePath(origin, path)) {
      results.push(url);
    }
  };

  // a) Canonical candidate paths
  for (const path of TEAM_PATH_CANDIDATES) {
    await tryAdd(`${origin}${path}`);
  }

  // b) Parse homepage for matching internal links
  const html = await fetchHtml(websiteUrl);
  if (html) {
    const $ = cheerio.load(html);

    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") ?? "";
      const text = $(el).text().toLowerCase();

      // Resolve relative → absolute
      let resolved: string;
      try {
        resolved = new URL(href, origin).toString();
      } catch {
        return; // skip malformed hrefs
      }

      // Only internal links
      if (!resolved.startsWith(origin)) return;

      const pathLower = new URL(resolved).pathname.toLowerCase();
      const matchesKeyword = TEAM_LINK_KEYWORDS.some(
        (kw) => pathLower.includes(kw) || text.includes(kw)
      );

      if (matchesKeyword) {
        // Queue async — we collect them synchronously then await below
        seen.add(resolved); // mark early to avoid double-queue
      }
    });

    // Now evaluate the queued URLs against robots
    for (const url of [...seen]) {
      if (!results.includes(url)) {
        const path = new URL(url).pathname;
        if (await canScrapePath(origin, path)) {
          results.push(url);
        }
      }
    }
  }

  // Deduplicate (URL with trailing slash ≡ without)
  const normalised = [...new Set(results.map((u) => u.replace(/\/$/, "")))];
  return normalised;
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. SCRAPE TEAM PAGE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CSS selectors tried (in order) to identify a "person card" container.
 * We try more specific selectors first to avoid over-broad matches.
 */
const CARD_SELECTORS = [
  "[class*='team-member']",
  "[class*='team_member']",
  "[class*='TeamMember']",
  "[class*='person-card']",
  "[class*='PersonCard']",
  "[class*='profile-card']",
  "[class*='bio-card']",
  "[class*='member-card']",
  "[class*='staff-card']",
  "[class*='investor-card']",
  "[class*='partner-card']",
  "[class*='people-card']",
  "[class*='person']",
  "[class*='profile']",
  "[class*='bio']",
  "[class*='member']",
  "article",
  "li",       // fallback — may produce noise; filtered downstream
];

/** Selectors for the name element within a card */
const NAME_SELECTORS = [
  "[itemprop='name']",
  "[class*='name']",
  "[class*='Name']",
  "h1",
  "h2",
  "h3",
  "h4",
  "strong",
];

/** Selectors for the title/role element within a card */
const TITLE_SELECTORS = [
  "[itemprop='jobTitle']",
  "[class*='title']",
  "[class*='Title']",
  "[class*='role']",
  "[class*='Role']",
  "[class*='position']",
  "[class*='Position']",
  "p",
  "span",
];

/**
 * Resolve a potentially relative image URL to an absolute one.
 * Returns null if the URL is clearly a data URI or unparseable.
 */
function resolveImageUrl(rawSrc: string, pageOrigin: string): string | null {
  if (!rawSrc || rawSrc.startsWith("data:")) return null;
  try {
    return new URL(rawSrc.split(" ")[0].trim(), pageOrigin).toString();
  } catch {
    return null;
  }
}

/**
 * Extract image URL from an <img> element, honouring lazy-load attributes.
 */
function extractImgUrl(
  $img: cheerio.Cheerio<cheerio.Element>,
  pageOrigin: string
): string | null {
  const attrs = [
    $img.attr("src"),
    $img.attr("data-src"),
    $img.attr("data-lazy-src"),
    $img.attr("data-original"),
    // srcset: take first URL (smallest / fallback)
    ($img.attr("srcset") ?? "").split(",")[0],
  ];

  for (const raw of attrs) {
    if (!raw) continue;
    const resolved = resolveImageUrl(raw.trim(), pageOrigin);
    if (resolved) return resolved;
  }

  return null;
}

/**
 * Try each card selector until we find one that yields ≥ 2 distinct cards
 * (heuristic: a real team section has multiple people).
 */
function findCards(
  $: cheerio.CheerioAPI,
  minCards = 2
): cheerio.Cheerio<cheerio.Element> | null {
  for (const selector of CARD_SELECTORS) {
    const cards = $(selector);
    if (cards.length >= minCards) {
      return cards;
    }
  }
  return null;
}

/**
 * Scrape a single page and return zero or more ScrapedPerson objects.
 */
export async function scrapeTeamPage(pageUrl: string): Promise<ScrapedPerson[]> {
  const html = await fetchHtml(pageUrl);
  if (!html) return [];

  const $ = cheerio.load(html);
  const origin = new URL(pageUrl).origin;
  const people: ScrapedPerson[] = [];

  const cards = findCards($);
  if (!cards) return [];

  cards.each((_, cardEl) => {
    const $card = $(cardEl);

    // ── Name ──────────────────────────────────────────────────────────────
    let name = "";
    for (const sel of NAME_SELECTORS) {
      const text = $card.find(sel).first().text().trim();
      if (text && text.length > 2 && text.length < 80) {
        name = text;
        break;
      }
    }
    // Fallback: first non-empty text node that looks like a name (2+ words)
    if (!name) {
      $card.find("*").each((_, el) => {
        if (name) return false; // break
        const text = $(el).clone().children().remove().end().text().trim();
        if (/^[A-Z][a-z]+ [A-Z]/.test(text) && text.split(" ").length <= 5) {
          name = text;
        }
      });
    }
    if (!name) return; // skip cards without a detectable name

    // ── Title ─────────────────────────────────────────────────────────────
    let title: string | null = null;
    for (const sel of TITLE_SELECTORS) {
      const candidates = $card.find(sel);
      for (let i = 0; i < candidates.length; i++) {
        const text = $(candidates[i]).text().trim();
        // Title should be shorter than a paragraph and differ from the name
        if (
          text &&
          text !== name &&
          text.length < 100 &&
          text.split(" ").length <= 8
        ) {
          title = text;
          break;
        }
      }
      if (title) break;
    }

    // ── Image URL ─────────────────────────────────────────────────────────
    let imageUrl: string | null = null;
    const $img = $card.find("img").first();
    if ($img.length) {
      imageUrl = extractImgUrl($img, origin);
    }

    // Also check for CSS background-image on a [style] attribute
    if (!imageUrl) {
      $card.find("[style]").each((_, el) => {
        if (imageUrl) return false;
        const style = $(el).attr("style") ?? "";
        const match = style.match(/url\(['"]?([^'"()]+)['"]?\)/);
        if (match?.[1]) {
          imageUrl = resolveImageUrl(match[1], origin);
        }
      });
    }

    people.push({ name, title, imageUrl, sourceUrl: pageUrl });
  });

  return people;
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. FUZZY NAME MATCHING
// ─────────────────────────────────────────────────────────────────────────────

/** Normalise a name for comparison: lowercase, trim, strip punctuation */
function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Very small Jaro-Winkler implementation (no external deps).
 * Returns a similarity score in [0, 1].
 */
function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  if (!s1.length || !s2.length) return 0;

  const matchDist = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
  if (matchDist < 0) return 0;

  const s1Matches = new Array<boolean>(s1.length).fill(false);
  const s2Matches = new Array<boolean>(s2.length).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < s1.length; i++) {
    const start = Math.max(0, i - matchDist);
    const end = Math.min(i + matchDist + 1, s2.length);
    for (let j = start; j < end; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / s1.length +
      matches / s2.length +
      (matches - transpositions / 2) / matches) /
    3;

  // Winkler prefix bonus (up to 4 chars)
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

/** Minimum confidence score to consider a match valid */
const MATCH_CONFIDENCE_THRESHOLD = 0.82;

/**
 * Given a ScrapedPerson, find the best-matching FirmInvestor from the list.
 * Returns null if no candidate meets the confidence threshold.
 */
export function matchScrapedPersonToInvestor(
  scraped: ScrapedPerson,
  investors: FirmInvestor[]
): { investor: FirmInvestor; confidence: number } | null {
  const scrapedNorm = normaliseName(scraped.name);
  const [scrapedFirst, ...scrapedRestParts] = scrapedNorm.split(" ");
  const scrapedLast = scrapedRestParts[scrapedRestParts.length - 1] ?? "";

  let bestMatch: { investor: FirmInvestor; confidence: number } | null = null;

  for (const investor of investors) {
    const investorNorm = normaliseName(investor.full_name);

    // ── Exact full-name match → confidence 1.0 ────────────────────────────
    if (scrapedNorm === investorNorm) {
      return { investor, confidence: 1.0 };
    }

    // ── First + Last name match (handles middle-name differences) ─────────
    const [invFirst, ...invRestParts] = investorNorm.split(" ");
    const invLast = invRestParts[invRestParts.length - 1] ?? "";

    if (
      scrapedFirst === invFirst &&
      scrapedLast === invLast &&
      scrapedFirst &&
      scrapedLast
    ) {
      const candidate = { investor, confidence: 0.95 };
      if (!bestMatch || candidate.confidence > bestMatch.confidence) {
        bestMatch = candidate;
      }
      continue;
    }

    // ── Jaro-Winkler on full normalised names ─────────────────────────────
    const jwScore = jaroWinkler(scrapedNorm, investorNorm);
    if (jwScore >= MATCH_CONFIDENCE_THRESHOLD) {
      if (!bestMatch || jwScore > bestMatch.confidence) {
        bestMatch = { investor, confidence: jwScore };
      }
    }
  }

  return bestMatch;
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. HEADSHOT IMAGE FILTER
// ─────────────────────────────────────────────────────────────────────────────

/** Substrings in a URL path that suggest a non-headshot image */
const REJECT_KEYWORDS = [
  "logo",
  "icon",
  "sprite",
  "brand",
  "banner",
  "hero",
  "background",
  "bg-",
  "placeholder",
  "default",
  "thumbnail-placeholder",
  "pattern",
  "texture",
  "illustration",
  "graphic",
  "cover",
];

/** Preferred image file extensions for headshots */
const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".avif"];

/**
 * Returns true if the URL looks like it could be a personal headshot photo
 * rather than a logo, icon, or decorative image.
 */
export function isLikelyHeadshotUrl(url: string): boolean {
  const lower = url.toLowerCase();

  // Reject if any blacklisted keyword appears in the path
  if (REJECT_KEYWORDS.some((kw) => lower.includes(kw))) return false;

  // Reject SVGs (almost always logos or illustrations)
  if (lower.includes(".svg")) return false;

  // Reject very small images (pixel trackers, icon sizes)
  // We can't check dimensions without fetching, but size-hint params help
  const pixelHint = lower.match(/[_-](\d+)x(\d+)/);
  if (pixelHint) {
    const [, w, h] = pixelHint.map(Number);
    if (w < 60 || h < 60) return false;
  }

  // Prefer known good extensions, but don't hard-reject unknown (CDN URLs
  // sometimes have no extension, e.g. .../image/upload/v123/abc)
  const hasGoodExtension = ALLOWED_EXTENSIONS.some((ext) =>
    lower.split("?")[0].endsWith(ext)
  );
  const hasQueryParams = lower.includes("?"); // CDN / Cloudinary / imgix style
  const noExtension = !lower.split("/").pop()?.includes(".");

  if (!hasGoodExtension && !hasQueryParams && !noExtension) return false;

  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. REPOSITORY STUBS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * TODO: Replace with real Supabase/Postgres query:
 *   SELECT * FROM firm_records WHERE website_url IS NOT NULL AND active = true
 */
export async function getActiveFirmsWithWebsites(): Promise<FirmRecord[]> {
  console.log("[repo] getActiveFirmsWithWebsites — using mock data");
  return MOCK_FIRMS;
}

/**
 * TODO: Replace with real Supabase/Postgres query:
 *   SELECT * FROM firm_investors WHERE firm_id = $1
 */
export async function getInvestorsForFirm(
  firmId: string
): Promise<FirmInvestor[]> {
  console.log(`[repo] getInvestorsForFirm(${firmId}) — using mock data`);
  return MOCK_INVESTORS.filter((i) => i.firm_id === firmId);
}

/**
 * TODO: Replace with real Supabase/Postgres query:
 *   UPDATE firm_investors SET avatar_url = $1 WHERE id = $2
 */
export async function updateFirmInvestorAvatar(
  investorId: string,
  data: { avatar_url: string }
): Promise<void> {
  // ── Stub: in a real implementation this would be something like:
  // await supabase
  //   .from("firm_investors")
  //   .update({ avatar_url: data.avatar_url })
  //   .eq("id", investorId);
  console.log(
    `[repo] updateFirmInvestorAvatar(${investorId}) → ${data.avatar_url}`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. ORCHESTRATION: UPDATE HEADSHOTS FOR A SINGLE FIRM
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set to true to overwrite existing avatar_url values.
 * Set to false (default) to only fill in missing ones — cheaper on re-runs.
 */
const ALLOW_REFRESH = false;

/**
 * Main per-firm function.  Discovers team pages, scrapes them, matches
 * investors, and calls the repository stub for each confident match.
 */
export async function updateHeadshotsForFirm(
  firm: FirmRecord,
  investors: FirmInvestor[]
): Promise<HeadshotUpdateResult> {
  const result: HeadshotUpdateResult = {
    firmId: firm.id,
    firmName: firm.firm_name,
    scannedPages: [],
    matched: [],
    skipped: [],
  };

  // ── Guard: no website ────────────────────────────────────────────────────
  if (!firm.website_url) {
    result.skipped.push({ reason: "no website URL for firm" });
    return result;
  }

  // ── Guard: no investors to process ───────────────────────────────────────
  if (investors.length === 0) {
    result.skipped.push({ reason: "no investors found for firm" });
    return result;
  }

  // ── Discover team pages ───────────────────────────────────────────────────
  let teamPages: string[];
  try {
    teamPages = await discoverTeamPages(firm.website_url);
  } catch (err) {
    console.error(`[firm:${firm.firm_name}] discoverTeamPages failed:`, err);
    result.skipped.push({ reason: "failed to discover team pages" });
    return result;
  }

  if (teamPages.length === 0) {
    result.skipped.push({ reason: "no team pages discovered" });
    return result;
  }

  // Track investors that have already been matched (avoid duplicates)
  const matchedInvestorIds = new Set<string>();

  // ── Scrape each team page ─────────────────────────────────────────────────
  for (const pageUrl of teamPages) {
    result.scannedPages.push(pageUrl);

    let scraped: ScrapedPerson[];
    try {
      await randomDelay();
      scraped = await scrapeTeamPage(pageUrl);
    } catch (err) {
      console.error(`[firm:${firm.firm_name}] scrapeTeamPage(${pageUrl}) failed:`, err);
      result.skipped.push({ reason: `scrape failed: ${pageUrl}` });
      continue;
    }

    for (const person of scraped) {
      // ── Filter 1: must have an image ───────────────────────────────────
      if (!person.imageUrl) {
        result.skipped.push({
          investorName: person.name,
          reason: "no image found on page",
        });
        continue;
      }

      // ── Filter 2: image must look like a headshot ──────────────────────
      if (!isLikelyHeadshotUrl(person.imageUrl)) {
        result.skipped.push({
          investorName: person.name,
          reason: `image URL rejected by headshot filter: ${person.imageUrl}`,
        });
        continue;
      }

      // ── Fuzzy match to known investors ─────────────────────────────────
      const match = matchScrapedPersonToInvestor(person, investors);
      if (!match) {
        result.skipped.push({
          investorName: person.name,
          reason: "no confident investor match",
        });
        continue;
      }

      const { investor, confidence } = match;

      // ── Guard: already updated this investor in this run ───────────────
      if (matchedInvestorIds.has(investor.id)) continue;

      // ── Guard: skip if avatar already set and refresh not allowed ──────
      if (investor.avatar_url && !ALLOW_REFRESH) {
        result.skipped.push({
          investorId: investor.id,
          investorName: investor.full_name,
          reason: "avatar already set (ALLOW_REFRESH=false)",
        });
        continue;
      }

      // ── Commit the update ──────────────────────────────────────────────
      console.log(
        `[firm:${firm.firm_name}] matched "${person.name}" → "${investor.full_name}" ` +
          `(confidence=${confidence.toFixed(2)}) image=${person.imageUrl}`
      );

      matchedInvestorIds.add(investor.id);

      result.matched.push({
        investorId: investor.id,
        investorName: investor.full_name,
        imageUrl: person.imageUrl,
        sourceUrl: pageUrl,
      });

      // Persist via repo stub
      await updateFirmInvestorAvatar(investor.id, { avatar_url: person.imageUrl });
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// 10. BATCH JOB: UPDATE ALL FIRMS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run headshot updates across multiple firms with capped concurrency.
 *
 * @param firms              - list of firms to process
 * @param getInvestors       - async function to fetch investors for a firm
 * @param concurrencyLimit   - max firms processed in parallel (default: 3)
 */
export async function updateHeadshotsForAllFirms(
  firms: FirmRecord[],
  getInvestors: (firmId: string) => Promise<FirmInvestor[]>,
  concurrencyLimit = 3
): Promise<HeadshotUpdateResult[]> {
  const limit = pLimit(concurrencyLimit);
  const results: HeadshotUpdateResult[] = [];

  const tasks = firms.map((firm) =>
    limit(async () => {
      console.log(`\n${"─".repeat(60)}`);
      console.log(`[batch] Processing firm: ${firm.firm_name}`);

      try {
        const investors = await getInvestors(firm.id);
        const result = await updateHeadshotsForFirm(firm, investors);
        results.push(result);
      } catch (err) {
        console.error(`[batch] Unhandled error for firm ${firm.firm_name}:`, err);
        results.push({
          firmId: firm.id,
          firmName: firm.firm_name,
          scannedPages: [],
          matched: [],
          skipped: [{ reason: `unhandled error: ${(err as Error).message}` }],
        });
      }
    })
  );

  await Promise.all(tasks);
  return results;
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. MOCK DATA
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_FIRMS: FirmRecord[] = [
  {
    id: "firm-001",
    firm_name: "Acme Ventures",
    website_url: "https://example-vc-firm.com", // swap for a real URL to test live
  },
  {
    id: "firm-002",
    firm_name: "Horizon Capital",
    website_url: "https://another-vc-example.com",
  },
  {
    id: "firm-003",
    firm_name: "No Site Partners",
    website_url: null, // intentionally missing — will be skipped
  },
];

const MOCK_INVESTORS: FirmInvestor[] = [
  // Acme Ventures
  {
    id: "inv-001",
    firm_id: "firm-001",
    full_name: "Alice Johnson",
    title: "General Partner",
    avatar_url: null,
  },
  {
    id: "inv-002",
    firm_id: "firm-001",
    full_name: "Bob Martinez",
    title: "Partner",
    avatar_url: null,
  },
  {
    id: "inv-003",
    firm_id: "firm-001",
    full_name: "Carol Wei",
    title: "Principal",
    avatar_url: null,
  },

  // Horizon Capital
  {
    id: "inv-004",
    firm_id: "firm-002",
    full_name: "David Park",
    title: "Managing Partner",
    avatar_url: null,
  },
  {
    id: "inv-005",
    firm_id: "firm-002",
    full_name: "Emma Clarke",
    title: "Venture Partner",
    avatar_url: null,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// 12. MAIN ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=".repeat(60));
  console.log("  Vekta — Investor Headshot Scraper");
  console.log("=".repeat(60));

  // In production you'd call:  const firms = await getActiveFirmsWithWebsites();
  const firms = MOCK_FIRMS;

  const allResults = await updateHeadshotsForAllFirms(
    firms,
    getInvestorsForFirm,
    /* concurrencyLimit= */ 2
  );

  // ── Summary report ─────────────────────────────────────────────────────────
  console.log("\n" + "=".repeat(60));
  console.log("  Run Summary");
  console.log("=".repeat(60));

  let totalMatched = 0;
  let totalSkipped = 0;

  for (const r of allResults) {
    totalMatched += r.matched.length;
    totalSkipped += r.skipped.length;

    console.log(`\nFirm: ${r.firmName} (${r.firmId})`);
    console.log(`  Pages scanned : ${r.scannedPages.length}`);
    console.log(`  Matched       : ${r.matched.length}`);
    console.log(`  Skipped       : ${r.skipped.length}`);

    if (r.matched.length > 0) {
      console.log("  ✅ Updated investors:");
      for (const m of r.matched) {
        console.log(`     • ${m.investorName} → ${m.imageUrl}`);
      }
    }

    if (r.skipped.length > 0) {
      console.log("  ⏭  Skipped:");
      for (const s of r.skipped) {
        const who = s.investorName ? `[${s.investorName}] ` : "";
        console.log(`     • ${who}${s.reason}`);
      }
    }
  }

  console.log("\n" + "─".repeat(60));
  console.log(
    `Total: ${totalMatched} investors updated, ${totalSkipped} skipped across ${allResults.length} firms.`
  );
  console.log("=".repeat(60));
}

// Run when executed directly (not imported as a module)
main().catch((err) => {
  console.error("[main] Fatal error:", err);
  process.exit(1);
});
