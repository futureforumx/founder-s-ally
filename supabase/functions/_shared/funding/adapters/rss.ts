/**
 * Generic RSS / listing adapter for operator-added sources.
 * Uses `fi_sources.base_url` as the feed or listing page.
 */

import type {
  SourceAdapter,
  AdapterContext,
  ListingItem,
  RawDealCandidate,
  FiSource,
} from "../types.ts";
import {
  absUrl,
  classifyTechCrunchArticle,
  decodeHtmlEntities,
  stripHtml,
} from "../normalize.ts";

function textTag(block: string, tag: string): string | null {
  const esc = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<${esc}[^>]*>([\\s\\S]*?)<\\/${esc}>`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

function cdataContent(block: string, tag: string): string | null {
  const esc = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`<${esc}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${esc}>`, "i");
  const m = block.match(re);
  return m ? m[1].trim() : null;
}

function parseRss(xml: string): Array<{ title: string; link: string; pubDate: string | null; description: string }> {
  const items: Array<{ title: string; link: string; pubDate: string | null; description: string }> = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  for (const block of itemBlocks) {
    const title = textTag(block, "title") || cdataContent(block, "title");
    const link =
      textTag(block, "link") ||
      block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] ||
      null;
    const pubDate = textTag(block, "pubDate") || textTag(block, "updated") || textTag(block, "published");
    const description =
      cdataContent(block, "description") ||
      textTag(block, "description") ||
      cdataContent(block, "content:encoded") ||
      cdataContent(block, "summary") ||
      "";
    if (title && link) {
      items.push({
        title: decodeHtmlEntities(title.trim()),
        link: link.trim(),
        pubDate: pubDate?.trim() ?? null,
        description: decodeHtmlEntities(stripHtml(description)).slice(0, 1000),
      });
    }
  }
  return items;
}

function looksLikeFeed(text: string): boolean {
  return /<(rss|feed|rdf:RDF)\b/i.test(text) && /<(item|entry)\b/i.test(text);
}

function feedCandidateUrls(baseUrl: string): string[] {
  const trimmed = baseUrl.replace(/\/+$/, "");
  const urls = [baseUrl];
  if (!/\/feed|rss|\.xml$/i.test(trimmed)) {
    urls.push(`${trimmed}/feed`);
    urls.push(`${trimmed}/rss`);
    urls.push(`${trimmed}/feed.xml`);
  }
  return [...new Set(urls)];
}

function parseHtmlListing(html: string, baseUrl: string): ListingItem[] {
  const items: ListingItem[] = [];
  const seen = new Set<string>();
  const re = /<a[^>]+href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1].trim();
    const label = decodeHtmlEntities(stripHtml(m[2])).trim();
    if (!label || label.length < 8) continue;
    if (/^(#|javascript:|mailto:)/i.test(href)) continue;
    const url = absUrl(href, baseUrl);
    if (seen.has(url)) continue;
    seen.add(url);
    const blob = `${label} ${url}`;
    if (!/raises?|secures?|closes?|funding|fund|invest|million|billion|\$[\d]|series\s*[a-f]/i.test(blob)) continue;
    items.push({ url, title: label });
  }
  return items.slice(0, 40);
}

async function fetchListing(ctx: AdapterContext): Promise<ListingItem[]> {
  const baseUrl = ctx.source.base_url?.trim();
  if (!baseUrl) throw new Error("Source is missing base_url");

  let lastError = "No listing fetched";
  for (const url of feedCandidateUrls(baseUrl)) {
    const result = await ctx.fetchUrl(url, {
      headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html" },
    });
    if (!result.ok) {
      lastError = `${url}: ${result.status} ${result.error ?? ""}`;
      continue;
    }
    if (looksLikeFeed(result.text)) {
      const rssItems = parseRss(result.text);
      const funding: ListingItem[] = [];
      const rest: ListingItem[] = [];
      for (const item of rssItems) {
        const row: ListingItem = {
          url: item.link,
          title: item.title,
          published_date: item.pubDate ?? undefined,
          snippet: item.description.slice(0, 300),
        };
        const { isFunding } = classifyTechCrunchArticle(item.title, item.description);
        if (isFunding) funding.push(row);
        else rest.push(row);
      }
      const picked = (funding.length ? funding : rest).slice(0, 40);
      if (picked.length) return picked;
      lastError = `${url}: feed parsed but no items`;
      continue;
    }
    const htmlItems = parseHtmlListing(result.text, result.url || url);
    if (htmlItems.length) return htmlItems;
    lastError = `${url}: no RSS items or funding links`;
  }
  throw new Error(`Custom source listing failed: ${lastError}`);
}

function parseDocument(
  html: string,
  url: string,
  listingItem: ListingItem,
  _source: FiSource,
): RawDealCandidate[] {
  const text = decodeHtmlEntities(stripHtml(html));
  const snippet = listingItem.snippet ?? text.slice(0, 1000);
  const title = listingItem.title ?? "";
  const { isFunding, confidence } = classifyTechCrunchArticle(title, snippet);
  if (!isFunding && confidence < 0.5 && !listingItem.title) return [];

  const VERB_PAT = /(?:raises?|secures?|closes?|lands?|nets?|snares?|scores?|nabs?|bags?)/i;
  let company_name_raw: string | null = null;
  const titleRaises = title.match(new RegExp(`^(.+?)\\s+${VERB_PAT.source}\\s+`, "i"));
  if (titleRaises) company_name_raw = titleRaises[1].trim();
  if (!company_name_raw) {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    company_name_raw = h1
      ? decodeHtmlEntities(stripHtml(h1[1])).replace(new RegExp(`\\s+${VERB_PAT.source}\\s+.*`, "i"), "").trim()
      : title || null;
  }

  const amountMatch = text.match(/\$([\d,.]+)\s*(million|billion|[mb])?/i);
  const roundMatch = text.match(/\b(pre-?seed|seed|series\s*[a-f]\+?|growth|strategic)\b/i);
  const ledBy = text.match(/led\s+by\s+([\w\s,&.']+?)(?=[,.]|\s+(?:with|and|plus|alongside))/i);

  if (!company_name_raw) return [];

  return [
    {
      slot_index: 0,
      company_name_raw,
      company_domain_raw: null,
      company_website_raw: null,
      company_location_raw: null,
      round_type_raw: roundMatch ? roundMatch[0] : null,
      amount_raw: amountMatch ? amountMatch[0] : null,
      currency_raw: "USD",
      announced_date_raw: listingItem.published_date ?? null,
      lead_investor_raw: ledBy ? ledBy[1].trim() : null,
      co_investors_raw: [],
      sector_raw: null,
      article_url: url,
      press_url: url,
      source_type: "news",
      is_rumor: false,
      confidence_score: isFunding ? 0.62 : 0.45,
      extracted_summary: snippet || null,
      extraction_method: "rss",
      extraction_metadata: { title, adapter: "rss" },
    },
  ];
}

export const RssAdapter: SourceAdapter = {
  key: "rss",
  fetchListing,
  parseDocument,
};
