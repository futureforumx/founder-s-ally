import * as cheerio from "cheerio";
import Parser from "rss-parser";
import type { FundingIngestSourceKey } from "@prisma/client";
import {
  parseStartupsGalleryNewsHtml,
  resolveStartupsGalleryUrl,
  startupsGalleryArticleUrl,
  startupsGalleryListingTitle,
  galleryRowsFromFundingTrackerCms,
  STARTUPS_GALLERY_NEWS_URL,
  type StartupsGalleryNewsRow,
} from "../../src/lib/startupsGalleryNews";
import {
  collectionFieldIdsByTitle,
  discoverFramerCmsChunkUrl,
  listFramerSiteModuleUrls,
  moduleUrlForCollectionId,
  parseFramerCmsChunk,
  relatedCollectionModuleIds,
  stringField,
  type FramerCmsRecord,
} from "../../src/lib/framerCmsChunk";
import { canonicalizeArticleUrl } from "./url.js";
import type { ListingItem } from "./types.js";
import { withBackoff } from "./retry.js";
import { firstPartyWebsiteFromUrl } from "../../src/lib/latestFundingMarks";
import {
  findGalleryCompanyEntry,
  galleryProfileIsIncomplete,
  pickGalleryCompanyProfile,
} from "../../src/lib/galleryCompanyProfile";
import { fetchGalleryCompanyProfileFromPages } from "../lib/galleryCompanyPage";
import {
  fetchStartupsGallerySearchIndex,
  splitInvestorsAndCompanies,
} from "../lib/startupsGalleryIndex";

/** Public listing / category pages (used as `listing_url` + discovery). */
export const LISTING_PAGE_URLS: Record<FundingIngestSourceKey, string> = {
  STARTUPS_GALLERY_NEWS: STARTUPS_GALLERY_NEWS_URL,
  TECHCRUNCH_VENTURE: "https://techcrunch.com/category/venture/",
  GEEKWIRE_FUNDINGS: "https://www.geekwire.com/fundings/",
  ALLEYWATCH_FUNDING: "https://www.alleywatch.com/category/funding/",
};

export const TECHCRUNCH_VENTURE_RSS = "https://techcrunch.com/category/venture/feed/";
export const ALLEYWATCH_FUNDING_RSS = "https://www.alleywatch.com/category/funding/feed/";

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

/** Strip quotes, markdown links, and control chars from INGEST_FETCH_PROXY_URL. */
export function sanitizeIngestProxyOrigin(proxyEnv: string | undefined | null): string | null {
  let raw = (proxyEnv ?? "").trim().replace(/[\u0000-\u001F]+/g, "");
  if (!raw) return null;
  raw = raw.replace(/^['"]+|['"]+$/g, "");
  const markdown = raw.match(/^\[[^\]]*]\((https?:\/\/[^)\s]+)\)$/i);
  if (markdown?.[1]) raw = markdown[1];
  else if (raw.startsWith("[")) {
    const embedded = raw.match(/https?:\/\/[^\s)\]]+/i);
    if (embedded?.[0]) raw = embedded[0];
  }
  raw = raw.replace(/\/+$/, "");
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/+$/, "");
    return `${parsed.origin}${path}`;
  } catch {
    return null;
  }
}

export function resolveIngestFetchUrl(url: string, proxyEnv = process.env.INGEST_FETCH_PROXY_URL): string {
  const proxy = sanitizeIngestProxyOrigin(proxyEnv);
  if (!proxy) return url;
  if (!/geekwire\.com/i.test(url)) return url;
  return `${proxy}?url=${encodeURIComponent(url)}`;
}

async function fetchText(url: string, log: (s: string) => void): Promise<string> {
  let requestUrl = resolveIngestFetchUrl(url);
  if (!URL.canParse(requestUrl)) {
    log(`[ingest-fetch] invalid proxy URL for ${url} — fetching source directly`);
    requestUrl = url;
  }
  return withBackoff(
    `GET:${url.slice(0, 60)}`,
    async () => {
      const res = await fetch(requestUrl, {
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

async function fetchBytes(url: string, log: (s: string) => void): Promise<Uint8Array> {
  const requestUrl = resolveIngestFetchUrl(url);
  return withBackoff(
    `GET-BIN:${url.slice(0, 60)}`,
    async () => {
      const res = await fetch(requestUrl, {
        redirect: "follow",
        headers: BROWSER_HEADERS,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return new Uint8Array(await res.arrayBuffer());
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

/**
 * TechCrunch venture category **archive** (paginated `/page/N/`, WordPress "loop-card" markup).
 * The RSS feed (`fetchTechcrunchVenture`) only exposes the most recent ~20 posts, so when a gap
 * is older than that (e.g. a CI outage), use this to walk back through history until `since`.
 */
export async function fetchTechcrunchVentureArchive(
  since: Date | null,
  maxItems: number,
  log: (s: string) => void,
  maxPages = 20,
): Promise<ListingItem[]> {
  const hub = LISTING_PAGE_URLS.TECHCRUNCH_VENTURE;
  const out: ListingItem[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= maxPages; page++) {
    if (out.length >= maxItems) break;
    const pageUrl = page === 1 ? hub : `${hub}page/${page}/`;
    let html: string;
    try {
      html = await fetchText(pageUrl, log);
    } catch (e) {
      log(`[techcrunch-archive] page ${page} failed: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
    const $ = cheerio.load(html);
    const cards = $("div.loop-card, article.loop-card");
    if (cards.length === 0) {
      log(`[techcrunch-archive] page ${page} had no loop-card entries — stopping`);
      break;
    }
    let oldestOnPage: Date | null = null;
    cards.each((_, el) => {
      const card = $(el);
      const a = card.find("h3.loop-card__title a[href]").first();
      const href = a.attr("href")?.trim();
      const title = a.text().trim();
      const dt = card.find("time.loop-card__time[datetime]").first().attr("datetime");
      if (!href || !title || !dt) return;
      const publishedAt = new Date(dt);
      if (Number.isNaN(publishedAt.getTime())) return;
      if (!oldestOnPage || publishedAt < oldestOnPage) oldestOnPage = publishedAt;
      const url = canonicalizeArticleUrl(href);
      if (seen.has(url)) return;
      if (since && publishedAt <= since) return;
      seen.add(url);
      out.push({
        sourceKey: "TECHCRUNCH_VENTURE",
        listingPageUrl: hub,
        articleUrl: url,
        title,
        publishedAt,
        summary: null,
      });
    });
    if (since && oldestOnPage && (oldestOnPage as Date) <= since) {
      log(`[techcrunch-archive] page ${page} reached cutoff (${since.toISOString()}) — stopping`);
      break;
    }
  }
  return out.slice(0, maxItems);
}

/**
 * AlleyWatch funding category **archive** (paginated `/page/N/`, Jannah/JNews theme markup).
 * Same rationale as `fetchTechcrunchVentureArchive` — RSS only covers recent posts.
 */
export async function fetchAlleywatchFundingArchive(
  since: Date | null,
  maxItems: number,
  log: (s: string) => void,
  maxPages = 20,
): Promise<ListingItem[]> {
  const hub = LISTING_PAGE_URLS.ALLEYWATCH_FUNDING;
  const out: ListingItem[] = [];
  const seen = new Set<string>();
  for (let page = 1; page <= maxPages; page++) {
    if (out.length >= maxItems) break;
    const pageUrl = page === 1 ? hub : `${hub}page/${page}/`;
    let html: string;
    try {
      html = await fetchText(pageUrl, log);
    } catch (e) {
      log(`[alleywatch-archive] page ${page} failed: ${e instanceof Error ? e.message : String(e)}`);
      break;
    }
    const $ = cheerio.load(html);
    const cards = $("article.jeg_post");
    if (cards.length === 0) {
      log(`[alleywatch-archive] page ${page} had no jeg_post entries — stopping`);
      break;
    }
    let oldestOnPage: Date | null = null;
    cards.each((_, el) => {
      const card = $(el);
      const a = card.find("h3.jeg_post_title a[href]").first();
      const href = a.attr("href")?.trim();
      const title = a.text().trim();
      const dateText = card.find(".jeg_meta_date a").first().text().trim();
      if (!href || !title || !dateText) return;
      const publishedAt = new Date(dateText);
      if (Number.isNaN(publishedAt.getTime())) return;
      if (!oldestOnPage || publishedAt < oldestOnPage) oldestOnPage = publishedAt;
      const url = canonicalizeArticleUrl(href);
      if (seen.has(url)) return;
      if (since && publishedAt <= since) return;
      seen.add(url);
      out.push({
        sourceKey: "ALLEYWATCH_FUNDING",
        listingPageUrl: hub,
        articleUrl: url,
        title,
        publishedAt,
        summary: null,
      });
    });
    if (since && oldestOnPage && (oldestOnPage as Date) <= since) {
      log(`[alleywatch-archive] page ${page} reached cutoff (${since.toISOString()}) — stopping`);
      break;
    }
  }
  return out.slice(0, maxItems);
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

/** When CMS ids were never persisted, look back this far so same-day / missed rows still ingest. */
export const GALLERY_EMPTY_CURSOR_LOOKBACK_DAYS = 14;

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}

export function listingItemsFromGalleryNewsRows(
  rows: StartupsGalleryNewsRow[],
  opts: { since: Date | null; maxItems: number; seenCmsIds?: Set<string> },
): ListingItem[] {
  const hub = LISTING_PAGE_URLS.STARTUPS_GALLERY_NEWS;
  const out: ListingItem[] = [];
  const seen = new Set<string>();
  const seenCms = opts.seenCmsIds ?? new Set<string>();
  const useIdCursor = seenCms.size > 0;
  const sinceStart = opts.since ? startOfUtcDay(opts.since) : null;
  const sinceFloor =
    sinceStart == null
      ? null
      : useIdCursor
        ? sinceStart
        : addUtcDays(sinceStart, -GALLERY_EMPTY_CURSOR_LOOKBACK_DAYS);

  const sorted = [...rows].sort((a, b) => {
    const at = a.announcedAtIso ? Date.parse(a.announcedAtIso) : 0;
    const bt = b.announcedAtIso ? Date.parse(b.announcedAtIso) : 0;
    const aOk = Number.isFinite(at) ? at : 0;
    const bOk = Number.isFinite(bt) ? bt : 0;
    return bOk - aOk;
  });

  for (const row of sorted) {
    if (out.length >= opts.maxItems) break;
    if (row.cmsId && seenCms.has(row.cmsId)) continue;

    const publishedAt = row.announcedAtIso ? new Date(row.announcedAtIso) : null;
    const validPublishedAt = publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null;
    // Inclusive of the checkpoint calendar day so date-only CMS timestamps (midnight UTC)
    // are not skipped after last_article_published_at is set to that same midnight.
    if (sinceFloor && validPublishedAt && validPublishedAt < sinceFloor) continue;

    const articleUrl = canonicalizeArticleUrl(startupsGalleryArticleUrl(row));
    if (seen.has(articleUrl)) continue;
    seen.add(articleUrl);

    out.push({
      sourceKey: "STARTUPS_GALLERY_NEWS",
      listingPageUrl: hub,
      articleUrl,
      title: startupsGalleryListingTitle(row),
      publishedAt: validPublishedAt,
      summary: null,
      externalId: row.cmsId ?? null,
      presetDeal: {
        company_name: row.companyName,
        amount_raw: row.amountRaw,
        round_type_raw: row.roundTypeRaw,
        announced_date: validPublishedAt,
        lead_investor: row.leadInvestor,
        company_website: firstPartyWebsiteFromUrl(row.sourceUrl),
        company_logo_url: row.logoUrl,
        company_hq: row.hqLine ?? null,
        sector_raw: row.sector ?? null,
        deal_summary: row.description ?? null,
      },
    });
  }
  return out;
}

function listingItemsFromGalleryRows(
  html: string,
  since: Date | null,
  maxItems: number,
  seenCmsIds?: Set<string>,
): ListingItem[] {
  return listingItemsFromGalleryNewsRows(parseStartupsGalleryNewsHtml(html), { since, maxItems, seenCmsIds });
}

async function loadFramerCollection(
  moduleUrl: string,
  log: (s: string) => void,
): Promise<{ fields: Record<string, string>; records: FramerCmsRecord[]; relatedIds: string[] } | null> {
  const js = await fetchText(moduleUrl, log);
  const chunkUrl = discoverFramerCmsChunkUrl(js);
  if (!chunkUrl) {
    log(`[startups.gallery] no CMS chunk URL in ${moduleUrl.split("/").pop()}`);
    return null;
  }
  const fields = collectionFieldIdsByTitle(js);
  const bytes = await fetchBytes(chunkUrl, log);
  const records = parseFramerCmsChunk(bytes, Object.values(fields));
  log(`[startups.gallery] CMS ${moduleUrl.split("/").pop()} → ${records.length} record(s)`);
  return { fields, records, relatedIds: relatedCollectionModuleIds(js) };
}

function lookupMap(
  records: FramerCmsRecord[],
  fields: Record<string, string>,
  nameTitle: string,
): Map<string, string> {
  const nameKey = fields[nameTitle] || fields.Title || fields.Name;
  const map = new Map<string, string>();
  for (const rec of records) {
    const id = typeof rec.id === "string" ? rec.id : null;
    const name = stringField(rec, nameKey);
    if (id && name) map.set(id, name);
  }
  return map;
}

async function fetchStartupsGalleryFromCms(
  html: string,
  log: (s: string) => void,
): Promise<StartupsGalleryNewsRow[] | null> {
  const moduleUrls = listFramerSiteModuleUrls(html);
  const trackerModule = moduleUrls.find((u) => /c41Fybgm6/i.test(u));
  if (!trackerModule) {
    log("[startups.gallery] Funding Tracker module not found in page HTML");
    return null;
  }
  const tracker = await loadFramerCollection(trackerModule, log);
  if (!tracker || tracker.records.length === 0) return null;

  const companiesId = tracker.relatedIds.find((id) => /Nykn2JMeY/i.test(id)) || "Nykn2JMeY";
  const stagesId = tracker.relatedIds.find((id) => /Qxqd3ti7u/i.test(id)) || "Qxqd3ti7u";
  const investorsId = tracker.relatedIds.find((id) => /kvFLVfA2o/i.test(id)) || "kvFLVfA2o";

  const companiesUrl = moduleUrlForCollectionId(moduleUrls, companiesId);
  const stagesUrl = moduleUrlForCollectionId(moduleUrls, stagesId);
  const investorsUrl = moduleUrlForCollectionId(moduleUrls, investorsId);

  const companiesCol = companiesUrl ? await loadFramerCollection(companiesUrl, log) : null;
  const stagesCol = stagesUrl ? await loadFramerCollection(stagesUrl, log) : null;
  const investorsCol = investorsUrl ? await loadFramerCollection(investorsUrl, log) : null;

  const companies = new Map<string, { name: string; slug: string | null; logoUrl: string | null }>();
  if (companiesCol) {
    const nameKey = companiesCol.fields.Name;
    const slugKey = companiesCol.fields.Slug;
    for (const rec of companiesCol.records) {
      const id = typeof rec.id === "string" ? rec.id : null;
      const name = stringField(rec, nameKey);
      if (!id || !name) continue;
      companies.set(id, {
        name,
        slug: stringField(rec, slugKey),
        logoUrl: null,
      });
    }
  }

  const rows = galleryRowsFromFundingTrackerCms(tracker.records, tracker.fields, {
    companies,
    stages: stagesCol ? lookupMap(stagesCol.records, stagesCol.fields, "Title") : new Map(),
    investors: investorsCol ? lookupMap(investorsCol.records, investorsCol.fields, "Name") : new Map(),
  });
  log(`[startups.gallery] CMS joined ${rows.length} deal row(s)`);
  return rows;
}

function attachGalleryCompanyProfiles(
  rows: StartupsGalleryNewsRow[],
  companies: Map<string, { path: string; entry: import("../lib/startupsGalleryIndex").GalleryIndexEntry }>,
): StartupsGalleryNewsRow[] {
  return rows.map((row) => {
    const match = findGalleryCompanyEntry(companies, row.companyName, row.companySlug);
    const profile = pickGalleryCompanyProfile(match?.entry);
    return {
      ...row,
      sector: profile.sector ?? row.sector ?? null,
      hqLine: profile.hqLine ?? row.hqLine ?? null,
      description: profile.description ?? row.description ?? null,
    };
  });
}

async function fillMissingGalleryProfilesFromPages(
  items: ListingItem[],
  log: (s: string) => void,
): Promise<ListingItem[]> {
  let fetched = 0;
  const out: ListingItem[] = [];
  for (const item of items) {
    const preset = item.presetDeal;
    if (!preset?.company_name) {
      out.push(item);
      continue;
    }
    const incomplete = galleryProfileIsIncomplete({
      sector: preset.sector_raw ?? null,
      hqLine: preset.company_hq ?? null,
      description: preset.deal_summary ?? null,
    });
    if (!incomplete || fetched >= 20) {
      out.push(item);
      continue;
    }
    fetched += 1;
    const slug = item.articleUrl.match(/startups\.gallery\/companies\/([^/?#]+)/i)?.[1]
      ?? preset.company_name;
    const profile = await fetchGalleryCompanyProfileFromPages(preset.company_name, slug);
    out.push({
      ...item,
      presetDeal: {
        ...preset,
        sector_raw: preset.sector_raw ?? profile.sector,
        company_hq: preset.company_hq ?? profile.hqLine,
        deal_summary: preset.deal_summary ?? profile.description,
      },
    });
  }
  if (fetched > 0) log(`[startups.gallery] company page profiles ${fetched}`);
  return out;
}

async function loadGalleryCompanyProfiles(
  log: (s: string) => void,
): Promise<Map<string, { path: string; entry: import("../lib/startupsGalleryIndex").GalleryIndexEntry }>> {
  try {
    const index = await fetchStartupsGallerySearchIndex();
    const { companies } = splitInvestorsAndCompanies(index);
    log(`[startups.gallery] company profiles ${companies.size}`);
    return companies;
  } catch (e) {
    log(`[startups.gallery] company profile index failed: ${e instanceof Error ? e.message : String(e)}`);
    return new Map();
  }
}

export type GalleryFetchOptions = {
  seenCmsIds?: string[];
};

/**
 * startups.gallery /news — Framer Funding Tracker CMS chunk (HTTP), with SSR HTML fallback.
 * Incremental runs skip CMS ids already stored on the source checkpoint.
 */
export async function fetchStartupsGalleryNews(
  since: Date | null,
  maxItems: number,
  log: (s: string) => void,
  options: GalleryFetchOptions = {},
): Promise<ListingItem[]> {
  const hub = LISTING_PAGE_URLS.STARTUPS_GALLERY_NEWS;
  const html = await fetchText(hub, log);
  const seenCmsIds = new Set((options.seenCmsIds ?? []).filter(Boolean));
  const companies = await loadGalleryCompanyProfiles(log);

  try {
    const cmsRows = await fetchStartupsGalleryFromCms(html, log);
    if (cmsRows && cmsRows.length > 0) {
      const items = listingItemsFromGalleryNewsRows(attachGalleryCompanyProfiles(cmsRows, companies), {
        since,
        maxItems,
        seenCmsIds,
      });
      const filled = await fillMissingGalleryProfilesFromPages(items, log);
      log(`[startups.gallery] CMS listings ${filled.length} (seen=${seenCmsIds.size}, max=${maxItems})`);
      return filled;
    }
  } catch (e) {
    log(`[startups.gallery] CMS fetch failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  log("[startups.gallery] falling back to SSR HTML table");
  let out = listingItemsFromGalleryRows(html, since, maxItems, seenCmsIds);
  if (out.length === 0) {
    log("[startups.gallery] row parser found nothing — falling back to link-only parsing");
    out = parseStartupsGalleryNewsLinks(html, since, maxItems);
  }
  if (companies.size === 0) return out;
  return out.map((item) => {
    const name = item.presetDeal?.company_name || item.title;
    const match = findGalleryCompanyEntry(companies, name);
    const profile = pickGalleryCompanyProfile(match?.entry);
    if (!item.presetDeal) return item;
    return {
      ...item,
      presetDeal: {
        ...item.presetDeal,
        company_hq: profile.hqLine ?? item.presetDeal.company_hq ?? null,
        sector_raw: profile.sector ?? item.presetDeal.sector_raw ?? null,
        deal_summary: profile.description ?? item.presetDeal.deal_summary ?? null,
      },
    };
  });
}

/** Legacy fallback: company-page links only (no amount/round/investor/source), used if row parsing finds nothing. */
function parseStartupsGalleryNewsLinks(html: string, since: Date | null, maxItems: number): ListingItem[] {
  const $ = cheerio.load(html);
  const out: ListingItem[] = [];
  const seen = new Set<string>();
  const hub = LISTING_PAGE_URLS.STARTUPS_GALLERY_NEWS;

  $("a[href]").each((_, el) => {
    if (out.length >= maxItems) return false;
    const href = $(el).attr("href")?.trim();
    if (!href) return;
    const resolved = resolveStartupsGalleryUrl(href);
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

export async function fetchArticleHtml(articleUrl: string, log: (s: string) => void): Promise<string> {
  return fetchText(articleUrl, log);
}
