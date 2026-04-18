import { load } from "cheerio";
import { CAPITAL_EVENT_KEYWORDS, CAPITAL_EVENT_SCAN_PATHS } from "./config";
import { contentHash, extractFundSequenceNumber, normalizeFirmName, normalizeFundName } from "./normalize";
import type { ExtractedFundAnnouncement, FirmRecordLookup, FundSyncRunOptions, VcFundSourceAdapter } from "./types";

type LinkCandidate = {
  url: string;
  headline: string;
  excerpt: string | null;
  publishedAt: string | null;
};

type NewsRawArticle = {
  title: string;
  url: string;
  source_name: string;
  published_at: string;
  content_snippet: string;
  tags: string[];
  og_image_url: string | null;
};

function normalizeUrl(base: string, path: string): string {
  return new URL(path, base).toString();
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

function extractDomain(input: string | null | undefined): string | null {
  if (!input) return null;
  try {
    let normalized = input.trim();
    if (!/^https?:\/\//i.test(normalized)) normalized = `https://${normalized}`;
    return new URL(normalized).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function tokenizeFirmName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s&.-]/g, " ")
    .split(/\s+/)
    .map((value) => value.trim())
    .filter((value) => value.length >= 3);
}

function normUrl(href: string): string {
  try {
    const url = new URL(href);
    url.hash = "";
    let path = url.pathname.replace(/\/+$/, "");
    if (!path) path = "/";
    url.pathname = path;
    return url.href.toLowerCase();
  } catch {
    return href.trim().toLowerCase();
  }
}

function parsePublishedAt($: ReturnType<typeof load>): string | null {
  const selectors = [
    'meta[property="article:published_time"]',
    'meta[name="publish_date"]',
    'meta[name="pubdate"]',
    "time[datetime]",
  ];
  for (const selector of selectors) {
    const value =
      $(selector).attr("content") ||
      $(selector).attr("datetime") ||
      $(selector).first().text();
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return null;
}

function extractUsdAmount(text: string): number | null {
  const match = text.match(/\$?\s?(\d+(?:\.\d+)?)\s?(million|billion|m|b)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier = unit.startsWith("b") ? 1_000_000_000 : 1_000_000;
  return Math.round(value * multiplier);
}

function extractVintageYear(text: string): number | null {
  const match = text.match(/\b(20\d{2}|19\d{2}) vintage\b|\bvintage (\d{4})\b|\b(20\d{2}|19\d{2}) fund\b/i);
  if (!match) return null;
  const raw = match[1] || match[2] || match[3];
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function inferEventTypeGuess(text: string): ExtractedFundAnnouncement["metadata"] {
  const lowered = text.toLowerCase();
  if (/\bfinal close\b|\bclosed\b/.test(lowered)) return { event_type_guess: "fund_closed" };
  if (/\btarget\b/.test(lowered)) return { event_type_guess: "fund_target_updated" };
  if (/\bvehicle\b|\bopportunity fund\b|\bgrowth fund\b|\bseed fund\b|\brolling fund\b/.test(lowered)) return { event_type_guess: "new_vehicle_detected" };
  return { event_type_guess: "new_fund_announced" };
}

function articleLooksRelevant(text: string): boolean {
  return CAPITAL_EVENT_KEYWORDS.positiveFund.test(text) &&
    !CAPITAL_EVENT_KEYWORDS.negativePortfolio.test(text) &&
    !CAPITAL_EVENT_KEYWORDS.negativeHiring.test(text) &&
    !CAPITAL_EVENT_KEYWORDS.negativeProduct.test(text) &&
    !CAPITAL_EVENT_KEYWORDS.negativeCommentary.test(text);
}

function isPressReleasePublisher(publisher: string): boolean {
  return /\b(prnewswire|business wire|globenewswire|accesswire)\b/i.test(publisher);
}

function buildFundLabel(firm: FirmRecordLookup | { firm_name: string }, headline: string, body: string): string | null {
  const combined = `${headline} ${body}`;
  const explicit = combined.match(/\b([A-Z][A-Za-z0-9&'’\- ]{0,80}(?:Fund|Vehicle)(?:\s+[IVX0-9]+)?)\b/);
  if (explicit?.[1]) return explicit[1].trim();
  const seq = combined.match(/\bFund\s+([IVX0-9]+)\b/i);
  if (seq?.[1]) return `${firm.firm_name} Fund ${seq[1]}`;
  if (/\bopportunity fund\b/i.test(combined)) return `${firm.firm_name} Opportunity Fund`;
  if (/\bgrowth fund\b/i.test(combined)) return `${firm.firm_name} Growth Fund`;
  if (/\bseed fund\b/i.test(combined)) return `${firm.firm_name} Seed Fund`;
  return null;
}

export async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "VektaFreshCapitalBot/1.0 (+https://vekta.app)",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("html")) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function extractLinkCandidates(baseUrl: string, html: string, limit = 4): LinkCandidate[] {
  const $ = load(html);
  const candidates: LinkCandidate[] = [];

  $("a[href]").each((_, anchor) => {
    const href = $(anchor).attr("href");
    if (!href) return;
    const url = normalizeUrl(baseUrl, href);
    if (hostname(url) !== hostname(baseUrl)) return;

    const headline = $(anchor).text().replace(/\s+/g, " ").trim();
    const excerpt = $(anchor).closest("article, li, div").text().replace(/\s+/g, " ").trim() || null;
    const blob = `${headline} ${excerpt || ""}`;
    if (!articleLooksRelevant(blob)) return;

    candidates.push({
      url,
      headline,
      excerpt,
      publishedAt: null,
    });
  });

  const unique = new Map<string, LinkCandidate>();
  for (const candidate of candidates) {
    if (!unique.has(candidate.url)) unique.set(candidate.url, candidate);
    if (unique.size >= limit) break;
  }
  return Array.from(unique.values());
}

function parseCapitalArticle(
  firm: FirmRecordLookup | { id?: string; firm_name: string; website_url?: string | null },
  articleUrl: string,
  articleHtml: string,
  fallback: { headline?: string | null; excerpt?: string | null; publishedAt?: string | null; sourceType: ExtractedFundAnnouncement["sourceType"]; publisher?: string | null; metadata?: Record<string, unknown> },
): ExtractedFundAnnouncement | null {
  const $ = load(articleHtml);
  const title =
    $("meta[property='og:title']").attr("content") ||
    $("title").text().trim() ||
    $("h1").first().text().trim() ||
    fallback.headline ||
    "Untitled capital event";
  const description =
    $("meta[name='description']").attr("content") ||
    $("meta[property='og:description']").attr("content") ||
    $("article p").slice(0, 3).text().replace(/\s+/g, " ").trim() ||
    fallback.excerpt ||
    "";
  const body = $("body").text().replace(/\s+/g, " ").trim().slice(0, 7000);
  const blob = `${title} ${description} ${body}`;
  if (!articleLooksRelevant(blob)) return null;

  const publishedAt = parsePublishedAt($) || fallback.publishedAt || null;
  const publisher = fallback.publisher || hostname(articleUrl);
  const fundLabel = buildFundLabel(firm, title, blob);
  const sourceType = fallback.sourceType === "news_article" && isPressReleasePublisher(publisher || "") ? "press_release" : fallback.sourceType;

  return {
    externalId: contentHash([firm.id || normalizeFirmName(firm.firm_name), articleUrl, title]),
    firmName: firm.firm_name,
    firmWebsiteUrl: firm.website_url || null,
    fundName: fundLabel,
    fundLabel,
    fundType: null,
    fundSize: extractUsdAmount(blob),
    currency: "USD",
    vintageYear: extractVintageYear(blob),
    announcedDate: publishedAt ? publishedAt.slice(0, 10) : null,
    closeDate: /\bfinal close|closed\b/i.test(blob) ? (publishedAt ? publishedAt.slice(0, 10) : null) : null,
    sourceUrl: articleUrl,
    sourceTitle: title,
    sourcePublisher: publisher,
    sourceType,
    rawText: `${description}\n\n${body}`.trim(),
    confidence: sourceType === "official_website" ? 0.62 : sourceType === "press_release" ? 0.68 : 0.56,
    metadata: {
      ...inferEventTypeGuess(blob),
      ...(fallback.metadata || {}),
      verification_refetch_url: articleUrl,
      extracted_sequence_number: extractFundSequenceNumber(fundLabel || title),
      normalized_fund_label: fundLabel ? normalizeFundName(fundLabel) : null,
    },
  };
}

export async function refetchCapitalArticleDetails(args: {
  url: string;
  firmName: string;
  firmWebsiteUrl?: string | null;
  sourceType: ExtractedFundAnnouncement["sourceType"];
  publisher?: string | null;
  headline?: string | null;
  excerpt?: string | null;
  publishedAt?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<ExtractedFundAnnouncement | null> {
  const html = await fetchHtml(args.url);
  if (!html) return null;
  return parseCapitalArticle(
    { firm_name: args.firmName, website_url: args.firmWebsiteUrl || null },
    args.url,
    html,
    {
      sourceType: args.sourceType,
      publisher: args.publisher || null,
      headline: args.headline || null,
      excerpt: args.excerpt || null,
      publishedAt: args.publishedAt || null,
      metadata: args.metadata,
    },
  );
}

async function detectFirmWebsiteCandidates(firm: FirmRecordLookup, options: FundSyncRunOptions): Promise<ExtractedFundAnnouncement[]> {
  if (!firm.website_url) return [];
  const found: ExtractedFundAnnouncement[] = [];
  let scanned = 0;

  for (const path of CAPITAL_EVENT_SCAN_PATHS) {
    if ((options.maxItems || 0) > 0 && found.length >= options.maxItems!) break;
    const pageUrl = normalizeUrl(firm.website_url, path);
    const html = await fetchHtml(pageUrl);
    scanned += 1;
    if (!html) continue;

    const links = extractLinkCandidates(pageUrl, html, 4);
    for (const link of links) {
      const articleHtml = await fetchHtml(link.url);
      if (!articleHtml) continue;
      const parsed = parseCapitalArticle(firm, link.url, articleHtml, {
        sourceType: "official_website",
        publisher: hostname(link.url),
        headline: link.headline,
        excerpt: link.excerpt,
        publishedAt: link.publishedAt,
        metadata: {
          detection_mode: "official_website_news",
          scan_page_url: pageUrl,
          pages_scanned: scanned,
        },
      });
      if (!parsed) continue;
      if (options.dateFrom && parsed.announcedDate && new Date(parsed.announcedDate) < new Date(options.dateFrom)) continue;
      if (options.dateTo && parsed.announcedDate && new Date(parsed.announcedDate) > new Date(options.dateTo)) continue;
      found.push(parsed);
    }
  }

  return found;
}

function isRelevantToFirm(article: NewsRawArticle, firm: FirmRecordLookup): boolean {
  const name = (firm.firm_name || "").trim().toLowerCase();
  if (!name) return true;
  const tokens = tokenizeFirmName(name);
  const domain = extractDomain(firm.website_url ?? null);
  const articleDomain = extractDomain(article.url);
  const haystack = `${article.title} ${article.content_snippet} ${article.source_name}`.toLowerCase();

  if (haystack.includes(name)) return true;
  if (domain && (articleDomain === domain || articleDomain?.endsWith(`.${domain}`))) return true;

  let hits = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) hits += 1;
  }
  return hits >= Math.min(2, tokens.length);
}

function dedupeNewsArticles(articles: NewsRawArticle[]): NewsRawArticle[] {
  const seen = new Set<string>();
  const out: NewsRawArticle[] = [];
  for (const article of articles) {
    const url = (article.url || "").trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const key = normUrl(url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(article);
  }
  return out;
}

async function fetchNewsApi(firmName: string): Promise<NewsRawArticle[]> {
  const key = process.env.NEWS_API_KEY;
  if (!key) return [];
  const safe = firmName.replace(/"/g, "").trim();
  const query = encodeURIComponent(`"${safe}"`);
  const url = `https://newsapi.org/v2/everything?q=${query}&sortBy=publishedAt&pageSize=12&language=en&apiKey=${encodeURIComponent(key)}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return [];
    const json = await response.json();
    const rows = json?.articles;
    if (!Array.isArray(rows)) return [];
    return rows.map((row: Record<string, unknown>) => ({
      title: String(row.title ?? "").trim() || "Untitled",
      url: String(row.url ?? "").trim(),
      source_name: String((row.source as { name?: string } | undefined)?.name ?? "NewsAPI"),
      published_at: row.publishedAt ? String(row.publishedAt) : new Date().toISOString(),
      content_snippet: String(row.description ?? "").trim(),
      tags: ["Press"],
      og_image_url: typeof row.urlToImage === "string" ? row.urlToImage : null,
    }));
  } catch {
    return [];
  }
}

async function fetchGNews(firmName: string): Promise<NewsRawArticle[]> {
  const key = process.env.GNEWS_API_KEY;
  if (!key) return [];
  const query = encodeURIComponent(firmName);
  const url = `https://gnews.io/api/v4/search?q=${query}&lang=en&max=12&token=${encodeURIComponent(key)}`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return [];
    const json = await response.json();
    const rows = json?.articles;
    if (!Array.isArray(rows)) return [];
    return rows.map((row: Record<string, unknown>) => ({
      title: String(row.title ?? "").trim() || "Untitled",
      url: String(row.url ?? "").trim(),
      source_name: String((row.source as { name?: string } | undefined)?.name ?? "GNews"),
      published_at: row.publishedAt ? String(row.publishedAt) : new Date().toISOString(),
      content_snippet: String(row.description ?? "").trim(),
      tags: ["Press"],
      og_image_url: typeof row.image === "string" ? row.image : null,
    }));
  } catch {
    return [];
  }
}

async function fetchMediastack(firmName: string): Promise<NewsRawArticle[]> {
  const key = process.env.MEDIASTACK_ACCESS_KEY;
  if (!key) return [];
  const keywords = encodeURIComponent(firmName);
  const url = `https://api.mediastack.com/v1/news?access_key=${encodeURIComponent(key)}&keywords=${keywords}&languages=en&sort=published_desc&limit=12`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return [];
    const json = await response.json();
    const rows = json?.data;
    if (!Array.isArray(rows)) return [];
    return rows.map((row: Record<string, unknown>) => ({
      title: String(row.title ?? "").trim() || "Untitled",
      url: String(row.url ?? "").trim(),
      source_name: String(row.source ?? "Mediastack"),
      published_at: row.published_at ? String(row.published_at) : new Date().toISOString(),
      content_snippet: String(row.description ?? "").trim(),
      tags: ["Press"],
      og_image_url: typeof row.image === "string" ? row.image : null,
    }));
  } catch {
    return [];
  }
}

async function fetchExternalNewsForFirm(firm: FirmRecordLookup): Promise<NewsRawArticle[]> {
  const [a, b, c] = await Promise.all([
    fetchNewsApi(firm.firm_name),
    fetchGNews(firm.firm_name),
    fetchMediastack(firm.firm_name),
  ]);

  return dedupeNewsArticles([...a, ...b, ...c])
    .filter((article) => isRelevantToFirm(article, firm))
    .filter((article) => articleLooksRelevant(`${article.title} ${article.content_snippet}`))
    .sort((left, right) => new Date(right.published_at).getTime() - new Date(left.published_at).getTime())
    .slice(0, 10);
}

async function detectExternalNewsCandidates(firm: FirmRecordLookup, options: FundSyncRunOptions): Promise<ExtractedFundAnnouncement[]> {
  const rows = await fetchExternalNewsForFirm(firm);
  const found: ExtractedFundAnnouncement[] = [];

  for (const row of rows) {
    if (options.dateFrom && row.published_at && new Date(row.published_at) < new Date(options.dateFrom)) continue;
    if (options.dateTo && row.published_at && new Date(row.published_at) > new Date(options.dateTo)) continue;

    const refined = await refetchCapitalArticleDetails({
      url: row.url,
      firmName: firm.firm_name,
      firmWebsiteUrl: firm.website_url || null,
      sourceType: isPressReleasePublisher(row.source_name) ? "press_release" : "news_article",
      publisher: row.source_name,
      headline: row.title,
      excerpt: row.content_snippet,
      publishedAt: row.published_at,
      metadata: {
        detection_mode: "external_news_api",
        og_image_url: row.og_image_url,
      },
    });
    if (!refined) continue;

    found.push({
      ...refined,
      confidence: refined.sourceType === "press_release" ? 0.69 : 0.57,
      metadata: {
        ...(refined.metadata || {}),
        raw_firm_name: firm.firm_name,
        event_type_guess: refined.metadata?.event_type_guess || inferEventTypeGuess(`${row.title} ${row.content_snippet}`).event_type_guess,
        normalized_fund_label: refined.fundLabel ? normalizeFundName(refined.fundLabel) : null,
        fund_sequence_number: extractFundSequenceNumber(refined.fundLabel || refined.sourceTitle || ""),
      },
    });
  }

  return found;
}

export const officialWebsiteCapitalAdapter: VcFundSourceAdapter = {
  key: "official_website",
  label: "Official firm website news/press detector",
  priority: 100,
  async fetchFundAnnouncements({ firms, options }): Promise<ExtractedFundAnnouncement[]> {
    const targets = firms
      .filter((firm) => Boolean(firm.website_url))
      .filter((firm) => !options.firmId || firm.id === options.firmId)
      .slice(0, options.maxItems ? Math.max(options.maxItems, 10) : 40);

    const results: ExtractedFundAnnouncement[] = [];
    for (const firm of targets) {
      try {
        const matches = await detectFirmWebsiteCandidates(firm, options);
        results.push(...matches);
        if (options.verbose) console.log(`[vc-fund:adapter:official] ${firm.firm_name}: ${matches.length} candidate(s)`);
      } catch (error) {
        console.warn(`[vc-fund:adapter:official] ${firm.firm_name}:`, error);
      }
    }
    return results;
  },
};

export const externalNewsCapitalAdapter: VcFundSourceAdapter = {
  key: "external_news",
  label: "External news and press corroboration detector",
  priority: 85,
  async fetchFundAnnouncements({ firms, options }): Promise<ExtractedFundAnnouncement[]> {
    const targets = firms
      .filter((firm) => !options.firmId || firm.id === options.firmId)
      .slice(0, options.maxItems ? Math.max(options.maxItems, 10) : 25);

    const results: ExtractedFundAnnouncement[] = [];
    for (const firm of targets) {
      try {
        const matches = await detectExternalNewsCandidates(firm, options);
        results.push(...matches);
        if (options.verbose) console.log(`[vc-fund:adapter:news] ${firm.firm_name}: ${matches.length} candidate(s)`);
      } catch (error) {
        console.warn(`[vc-fund:adapter:news] ${firm.firm_name}:`, error);
      }
    }
    return results;
  },
};

export function buildDefaultFundAdapters(): VcFundSourceAdapter[] {
  return [officialWebsiteCapitalAdapter, externalNewsCapitalAdapter];
}
