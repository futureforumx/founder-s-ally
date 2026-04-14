/**
 * Scrapes a VC firm's portfolio page and returns an array of portfolio company names.
 *
 * Strategy:
 *   1. Try common portfolio page paths on the firm's website.
 *   2. For each candidate page, parse HTML to extract company names using multiple heuristics:
 *      a. External `<a href>` link text (company name as anchor text linking to company site)
 *      b. Heading-level text (h2/h3/h4) in grid/card containers
 *      c. Elements with class names containing "company", "portfolio", "investment"
 *   3. Filter candidates: proper nouns, not nav/footer noise, not social media domains.
 *   4. Deduplicate and return sorted list.
 */

const REQUEST_HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; VEKTAPortfolioResolver/1.0; +https://vekta.app)",
  accept: "text/html,application/xhtml+xml",
};

const FETCH_TIMEOUT_MS = 12_000;

/** Common portfolio page slug candidates — ordered by likelihood. */
const PORTFOLIO_PATH_CANDIDATES = [
  "/portfolio",
  "/companies",
  "/portfolio-companies",
  "/investments",
  "/our-portfolio",
  "/our-companies",
  "/our-investments",
  "/portfolio/",
  "/companies/",
  "/investments/",
  "/portfolio-companies/",
  "/our-portfolio/",
];

/** Domains that are VC infrastructure / social media — not portfolio companies. */
const BLOCKED_PORTFOLIO_DOMAINS = new Set([
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "crunchbase.com",
  "angel.co",
  "wellfound.com",
  "pitchbook.com",
  "signal.nfx.com",
  "cbinsights.com",
  "dealroom.co",
  "techcrunch.com",
  "medium.com",
  "substack.com",
  "notion.so",
  "notion.site",
  "airtable.com",
  "typeform.com",
  "calendly.com",
  "zoom.us",
  "apple.com",
  "google.com",
  "microsoft.com",
  "github.com",
  "producthunt.com",
  "ycombinator.com",
]);

/** Words that indicate a link is nav/footer noise, not a company name. */
const NAV_NOISE_RE = /^(home|about|team|contact|blog|news|press|events|jobs|careers|subscribe|privacy|terms|login|sign\s*up|menu|close|open|back|next|prev|more|read\s*more|learn\s*more|see\s*all|view\s*all|portfolio|companies|investments|insights|resources|newsletter|get\s*in\s*touch|apply|pitch|submit|fund|funds|lp|investor\s*relations)$/i;

/** A company name looks like 1–5 words that start with a capital letter or digit. */
const COMPANY_NAME_RE = /^[A-Z0-9][\w&., \-'()!]{1,60}$/;

/** Strip HTML tags and decode entities from a fragment. */
function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).toString();
  } catch {
    return null;
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

function isBlockedDomain(href: string): boolean {
  try {
    const host = normalizeHostname(new URL(href).hostname);
    if (!host) return true;
    for (const blocked of BLOCKED_PORTFOLIO_DOMAINS) {
      if (host === blocked || host.endsWith(`.${blocked}`)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

function isExternalLink(href: string, firmHostname: string): boolean {
  try {
    const host = normalizeHostname(new URL(href).hostname);
    return host !== firmHostname && host !== "";
  } catch {
    return false;
  }
}

function looksLikeCompanyName(text: string): boolean {
  const t = text.trim();
  if (t.length < 2 || t.length > 80) return false;
  if (NAV_NOISE_RE.test(t)) return false;
  if (!COMPANY_NAME_RE.test(t)) return false;
  // Reject if it's all uppercase and >6 chars (likely an acronym / nav label)
  if (t === t.toUpperCase() && t.length > 6 && !/[0-9]/.test(t)) return false;
  return true;
}

/**
 * Extract portfolio company names from raw HTML of a portfolio page.
 * Returns deduplicated, sorted array of company name strings.
 */
function extractCompanyNamesFromHtml(html: string, firmHostname: string): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  function addCandidate(raw: string) {
    const name = raw.replace(/\s+/g, " ").trim();
    if (!looksLikeCompanyName(name)) return;
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    results.push(name);
  }

  // ── Strategy 1: external <a href="..."> link text ─────────────────────────
  // Companies often appear as anchor tags whose href goes to the company's website.
  const anchorRe = /<a\b[^>]*href=["']([^"'#\s]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const href = safeTrim(m[1]);
    const innerHtml = m[2] ?? "";
    const innerText = stripTags(innerHtml);
    if (!href || !innerText) continue;
    if (!href.startsWith("http")) continue;
    if (isBlockedDomain(href)) continue;
    if (!isExternalLink(href, firmHostname)) continue;
    // Anchor text is the company name candidate
    addCandidate(innerText);
  }

  // ── Strategy 2: headings inside likely portfolio containers ───────────────
  // Look for h2/h3/h4 text in sections that contain portfolio-related class names.
  const containerRe = /class=["'][^"']*(?:portfolio|company|companies|investment|grid|card|item)[^"']*["'][^>]*>([\s\S]*?)(?=<\/(?:section|div|article|main|ul)>)/gi;
  while ((m = containerRe.exec(html)) !== null) {
    const containerHtml = m[1] ?? "";
    const headingRe = /<(?:h[2-4]|strong)\b[^>]*>([\s\S]*?)<\/(?:h[2-4]|strong)>/gi;
    let hm: RegExpExecArray | null;
    while ((hm = headingRe.exec(containerHtml)) !== null) {
      addCandidate(stripTags(hm[1] ?? ""));
    }
  }

  // ── Strategy 3: elements with company/name/title class in alt text ────────
  // <img alt="CompanyName"> inside portfolio sections
  const imgRe = /<img\b[^>]*\balt=["']([^"']{2,80})["'][^>]*>/gi;
  while ((m = imgRe.exec(html)) !== null) {
    const alt = safeTrim(m[1]);
    // Only use alt text that looks like a company name (not descriptive text)
    if (alt.split(/\s+/).length <= 5) addCandidate(alt);
  }

  // ── Strategy 4: JSON-LD / schema.org ──────────────────────────────────────
  const jsonLdRe = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  while ((m = jsonLdRe.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1] ?? "{}") as unknown;
      const extractNames = (obj: unknown) => {
        if (!obj || typeof obj !== "object") return;
        if (Array.isArray(obj)) { obj.forEach(extractNames); return; }
        const o = obj as Record<string, unknown>;
        if (typeof o.name === "string") addCandidate(o.name);
        Object.values(o).forEach(extractNames);
      };
      extractNames(parsed);
    } catch {
      // ignore malformed JSON-LD
    }
  }

  return results.sort((a, b) => a.localeCompare(b));
}

async function fetchWithTimeout(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: REQUEST_HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("html")) return null;
    return await res.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type FirmPortfolioResult = {
  companies: string[];
  sourceUrl: string | null;
  scannedUrls: string[];
};

/**
 * Resolve a VC firm's portfolio companies by scraping their website.
 *
 * @param firmWebsiteUrl - The firm's website (e.g. "https://406ventures.com")
 * @returns companies array, the source URL that yielded results, and all scanned URLs
 */
export async function resolveFirmWebsitePortfolio(firmWebsiteUrl: string): Promise<FirmPortfolioResult> {
  const base = normalizeWebsiteUrl(firmWebsiteUrl);
  if (!base) return { companies: [], sourceUrl: null, scannedUrls: [] };

  let firmHostname: string;
  try {
    firmHostname = normalizeHostname(new URL(base).hostname);
  } catch {
    return { companies: [], sourceUrl: null, scannedUrls: [] };
  }

  const scannedUrls: string[] = [];
  const baseNoTrailing = base.replace(/\/$/, "");

  // First, scan the home page to find any explicit portfolio page links
  const homeHtml = await fetchWithTimeout(base);
  if (homeHtml) {
    scannedUrls.push(base);
    // Find internal links that look like portfolio pages
    const hrefRe = /href=["']([^"'#\s]+)["']/gi;
    const internalPortfolioLinks: string[] = [];
    let hm: RegExpExecArray | null;
    while ((hm = hrefRe.exec(homeHtml)) !== null) {
      const href = safeTrim(hm[1]);
      if (!href) continue;
      let absolute: string;
      try {
        absolute = href.startsWith("http") ? href : new URL(href, base).toString();
      } catch {
        continue;
      }
      if (normalizeHostname(new URL(absolute).hostname) !== firmHostname) continue;
      const path = new URL(absolute).pathname.toLowerCase();
      if (
        /\b(portfolio|companies|investments|our-portfolio|our-companies)\b/.test(path) &&
        !internalPortfolioLinks.includes(absolute)
      ) {
        internalPortfolioLinks.push(absolute);
      }
    }
    // Try internal portfolio links first
    for (const link of internalPortfolioLinks) {
      if (scannedUrls.includes(link)) continue;
      const html = await fetchWithTimeout(link);
      scannedUrls.push(link);
      if (!html) continue;
      const companies = extractCompanyNamesFromHtml(html, firmHostname);
      if (companies.length >= 3) {
        return { companies, sourceUrl: link, scannedUrls };
      }
    }
  }

  // Try standard path candidates
  for (const path of PORTFOLIO_PATH_CANDIDATES) {
    const url = `${baseNoTrailing}${path}`;
    if (scannedUrls.includes(url)) continue;
    const html = await fetchWithTimeout(url);
    scannedUrls.push(url);
    if (!html) continue;
    const companies = extractCompanyNamesFromHtml(html, firmHostname);
    if (companies.length >= 3) {
      return { companies, sourceUrl: url, scannedUrls };
    }
  }

  return { companies: [], sourceUrl: null, scannedUrls };
}
