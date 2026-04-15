import * as cheerio from "cheerio";
import Parser from "rss-parser";
import type { FundingIngestSourceKey } from "@prisma/client";
import { canonicalizeArticleUrl } from "./url.js";
import type { ListingItem } from "./types.js";
import { withBackoff } from "./retry.js";

/** Public listing / category pages (used as `listing_url` + discovery). */
export const LISTING_PAGE_URLS: Record<FundingIngestSourceKey, string> = {
  STARTUPS_GALLERY_NEWS: "https://startups.gallery/news",
  TECHCRUNCH_VENTURE: "https://techcrunch.com/category/venture/",
  GEEKWIRE_FUNDINGS: "https://www.geekwire.com/fundings/",
  ALLEYWATCH_FUNDING: "https://www.alleywatch.com/category/funding/",
};

export const TECHCRUNCH_VENTURE_RSS = "https://techcrunch.com/category/venture/feed/";
export const ALLEYWATCH_FUNDING_RSS = "https://www.alleywatch.com/category/funding/feed/";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const parser = new Parser({
  timeout: 25_000,
  headers: {
    "User-Agent": "VEKTA-FundingIngest/1.0 (+https://vekta.app; ops@vekta.app)",
    Accept: "application/rss+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
  },
});

function sinceFilter(pub: Date | null, since: Date | null): boolean {
  if (!since) return true;
  if (!pub) return true;
  return pub.getTime() > since.getTime();
}

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

async function fetchText(url: string, log: (s: string) => void): Promise<string> {
  return withBackoff(
    `GET:${url.slice(0, 60)}`,
    async () => {
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          ...BROWSER_HEADERS,
          ...(url.includes("geekwire.com") ? { Referer: "https://www.geekwire.com/" } : {}),
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.text();
    },
    { log },
  );
}

export function publishedAtFromGeekwireUrl(url: string): Date | null {
  const m = url.match(/geekwire\.com\/(\d{4})\/(\d{2})\/(\d{2})\b/i);
  if (!m) return null;
  const y = +m[1]!;
  const mo = +m[2]!;
  const d = +m[3]!;
  if (y < 1990 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(Date.UTC(y, mo - 1, d, 12, 0, 0));
}

export async function fetchRssListings(
  sourceKey: FundingIngestSourceKey,
  feedUrl: string,
  listingPageUrl: string,
  since: Date | null,
  maxItems: number,
  log: (s: string) => void,
): Promise<ListingItem[]> {
  const xml = await fetchText(feedUrl, log);
  const trimmed = xml.trim();
  if (!trimmed.startsWith("<?xml") && !trimmed.startsWith("<rss") && !trimmed.startsWith("<feed")) {
    throw new Error(`Non-XML response from ${feedUrl} (likely HTML / block page)`);
  }
  let feed: Awaited<ReturnType<typeof parser.parseString>>;
  try {
    feed = await parser.parseString(xml);
  } catch (e) {
    throw new Error(`RSS parse failed for ${feedUrl}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const out: ListingItem[] = [];
  for (const item of feed.items ?? []) {
    if (out.length >= maxItems) break;
    const link = item.link ? canonicalizeArticleUrl(item.link) : null;
    if (!link) continue;
    const pub = item.pubDate ? new Date(item.pubDate) : item.isoDate ? new Date(item.isoDate) : null;
    if (!sinceFilter(pub, since)) continue;
    out.push({
      sourceKey,
      listingPageUrl,
      articleUrl: link,
      title: (item.title ?? link).trim(),
      publishedAt: pub && !Number.isNaN(pub.getTime()) ? pub : null,
      summary: item.contentSnippet ?? item.summary ?? null,
    });
  }
  return out;
}

/** TechCrunch venture category RSS (WordPress). */
export async function fetchTechcrunchVenture(since: Date | null, maxItems: number, log: (s: string) => void): Promise<ListingItem[]> {
  return fetchRssListings(
    "TECHCRUNCH_VENTURE",
    TECHCRUNCH_VENTURE_RSS,
    LISTING_PAGE_URLS.TECHCRUNCH_VENTURE,
    since,
    maxItems,
    log,
  );
}

/** AlleyWatch funding category RSS. */
export async function fetchAlleywatchFunding(since: Date | null, maxItems: number, log: (s: string) => void): Promise<ListingItem[]> {
  return fetchRssListings(
    "ALLEYWATCH_FUNDING",
    ALLEYWATCH_FUNDING_RSS,
    LISTING_PAGE_URLS.ALLEYWATCH_FUNDING,
    since,
    maxItems,
    log,
  );
}

const GEEKWIRE_FEED_CANDIDATES = [
  "https://www.geekwire.com/tag/funding/feed/",
  "https://www.geekwire.com/category/fundings/feed/",
];

/** GeekWire — try known feed URLs; if all fail, parse fundings hub HTML for article links. */
export async function fetchGeekwireFundings(since: Date | null, maxItems: number, log: (s: string) => void): Promise<ListingItem[]> {
  const hub = LISTING_PAGE_URLS.GEEKWIRE_FUNDINGS;
  for (const u of GEEKWIRE_FEED_CANDIDATES) {
    try {
      const items = await fetchRssListings("GEEKWIRE_FUNDINGS", u, hub, since, maxItems, log);
      if (items.length) return items;
    } catch (e) {
      log(`[geekwire] feed failed ${u}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const html = await fetchText(hub, log);
  const $ = cheerio.load(html);
  const out: ListingItem[] = [];
  $("a[href]").each((_, el) => {
    if (out.length >= maxItems) return false;
    const href = $(el).attr("href");
    if (!href) return;
    if (!/\/20\d\d\/\d\d\//.test(href) && !href.includes("geekwire.com/20")) return;
    let abs = href;
    if (href.startsWith("/")) abs = `https://www.geekwire.com${href}`;
    if (!abs.includes("geekwire.com")) return;
    if (abs.includes("/tag/") || abs.includes("/author/") || abs.includes("/page/")) return;
    const url = canonicalizeArticleUrl(abs);
    const title = $(el).text().trim() || url;
    if (out.some((x) => x.articleUrl === url)) return;
    const publishedAt = publishedAtFromGeekwireUrl(url);
    if (since && publishedAt && publishedAt <= since) return;
    out.push({
      sourceKey: "GEEKWIRE_FUNDINGS",
      listingPageUrl: hub,
      articleUrl: url,
      title,
      publishedAt,
      summary: null,
    });
    return undefined;
  });
  return out;
}

function parseStartupsGalleryNewsLinks(html: string, since: Date | null, maxItems: number): ListingItem[] {
  const $ = cheerio.load(html);
  const out: ListingItem[] = [];
  const seen = new Set<string>();
  const hub = LISTING_PAGE_URLS.STARTUPS_GALLERY_NEWS;

  $("a[href]").each((_, el) => {
    if (out.length >= maxItems) return false;
    const href = $(el).attr("href")?.trim();
    if (!href) return;
    const resolved = href.startsWith("http")
      ? href
      : href.startsWith("/")
        ? `https://startups.gallery${href}`
        : `https://startups.gallery/${href.replace(/^\.\//, "")}`;
    if (!/\/companies\//i.test(resolved)) return;
    const url = canonicalizeArticleUrl(resolved);
    if (seen.has(url)) return;
    seen.add(url);
    const title = $(el).text().trim() || url.split("/").filter(Boolean).pop() || url;
    let publishedAt: Date | null = null;
    const row = $(el).closest("li, tr, article, div");
    const t = row.text();
    const dm = t.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}\b/i);
    if (dm) {
      const d = new Date(dm[0]!);
      if (!Number.isNaN(d.getTime())) publishedAt = d;
    }
    if (since && publishedAt && publishedAt <= since) return;
    out.push({
      sourceKey: "STARTUPS_GALLERY_NEWS",
      listingPageUrl: hub,
      articleUrl: url,
      title,
      publishedAt,
      summary: null,
    });
    return undefined;
  });
  return out;
}

/**
 * startups.gallery /news — Framer often renders links client-side; cheerio may see an empty shell.
 * When `INGEST_STARTUPS_GALLERY_PLAYWRIGHT=0`, Playwright is skipped (listing may be empty).
 */
export async function fetchStartupsGalleryNewsPlaywright(
  since: Date | null,
  maxItems: number,
  log: (s: string) => void,
): Promise<ListingItem[]> {
  const { chromium } = await import("@playwright/test");
  const hub = LISTING_PAGE_URLS.STARTUPS_GALLERY_NEWS;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ userAgent: BROWSER_HEADERS["User-Agent"] });
  try {
    await page.goto(hub, { waitUntil: "networkidle", timeout: 45_000 });
    await sleep(2_500);
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => window.scrollBy(0, 900));
      await sleep(400);
    }
    const html = await page.content();
    return parseStartupsGalleryNewsLinks(html, since, maxItems);
  } finally {
    await browser.close();
  }
}

/** startups.gallery /news — parse company links; fetch detail for text in pipeline. */
export async function fetchStartupsGalleryNews(since: Date | null, maxItems: number, log: (s: string) => void): Promise<ListingItem[]> {
  const hub = LISTING_PAGE_URLS.STARTUPS_GALLERY_NEWS;
  const html = await fetchText(hub, log);
  let out = parseStartupsGalleryNewsLinks(html, since, maxItems);

  if (out.length === 0 && process.env.INGEST_STARTUPS_GALLERY_PLAYWRIGHT !== "0") {
    log("[startups.gallery] static HTML had no /companies/ links — using Playwright (Framer)");
    try {
      out = await fetchStartupsGalleryNewsPlaywright(since, maxItems, log);
    } catch (e) {
      log(`[startups.gallery] Playwright failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else if (out.length === 0) {
    log("[startups.gallery] no /companies/ links (Playwright disabled via INGEST_STARTUPS_GALLERY_PLAYWRIGHT=0)");
  }
  return out;
}

export async function fetchArticleHtml(articleUrl: string, log: (s: string) => void): Promise<string> {
  return fetchText(articleUrl, log);
}
