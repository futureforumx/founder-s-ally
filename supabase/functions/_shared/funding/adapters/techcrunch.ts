/**
 * Adapter: techcrunch.com/category/venture/
 *
 * TechCrunch's venture category is broad — mix of funding articles, opinion,
 * and analysis. This adapter:
 *  1. Fetches the category RSS feed (more reliable than scraping HTML)
 *  2. Classifies each item as a funding announcement or not
 *  3. Only returns items that pass the classification threshold
 */

import type {
  SourceAdapter,
  AdapterContext,
  ListingItem,
  RawDealCandidate,
  FiSource,
} from "../types.ts";
import {
  stripHtml,
  decodeHtmlEntities,
  classifyTechCrunchArticle,
} from "../normalize.ts";

// TechCrunch venture RSS feed (public)
const FEED_URL = "https://techcrunch.com/category/venture/feed/";
const MIN_FUNDING_CONFIDENCE = 0.50;

// ── RSS parser ───────────────────────────────────────────────────────────────

interface RssItem {
  title: string;
  link: string;
  pubDate: string | null;
  description: string;
  author: string | null;
  categories: string[];
}

function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = [];
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

  for (const block of itemBlocks) {
    const title = textTag(block, "title");
    const link = textTag(block, "link");
    const pubDate = textTag(block, "pubDate");
    const description =
      cdataContent(block, "description") ||
      textTag(block, "description") ||
      cdataContent(block, "content:encoded") ||
      "";
    const author =
      textTag(block, "dc:creator") ||
      cdataContent(block, "dc:creator") ||
      null;
    const categories = (block.match(/<category[^>]*>([^<]+)<\/category>/gi) || [])
      .map((c) => c.replace(/<[^>]+>/g, "").trim());

    if (title && link) {
      items.push({
        title: decodeHtmlEntities(title.trim()),
        link: link.trim(),
        pubDate: pubDate?.trim() ?? null,
        description: decodeHtmlEntities(stripHtml(description)).slice(0, 1000),
        author,
        categories,
      });
    }
  }
  return items;
}

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

// ── Listing fetcher ──────────────────────────────────────────────────────────

async function fetchListing(ctx: AdapterContext): Promise<ListingItem[]> {
  const result = await ctx.fetchUrl(FEED_URL, {
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
  });
  if (!result.ok) {
    throw new Error(`TechCrunch RSS fetch failed: ${result.status} ${result.error ?? ""}`);
  }

  const rssItems = parseRss(result.text);
  const items: ListingItem[] = [];

  for (const item of rssItems) {
    const { isFunding, confidence } = classifyTechCrunchArticle(
      item.title,
      item.description
    );
    if (!isFunding || confidence < MIN_FUNDING_CONFIDENCE) continue;

    items.push({
      url: item.link,
      title: item.title,
      published_date: item.pubDate ?? undefined,
      snippet: item.description.slice(0, 300),
      is_rumor: false,
    });
  }

  return items.slice(0, 40);
}

// ── Document parser ──────────────────────────────────────────────────────────

function parseDocument(
  html: string,
  url: string,
  listingItem: ListingItem,
  source: FiSource
): RawDealCandidate[] {
  const text = decodeHtmlEntities(stripHtml(html));
  const snippet = listingItem.snippet ?? text.slice(0, 1000);

  // Re-classify using full text for better accuracy
  const { isFunding, confidence: classConf } = classifyTechCrunchArticle(
    listingItem.title ?? "",
    snippet
  );
  if (!isFunding) return []; // skip non-funding articles

  // Company name — from title: "<Company> raises $X in <Round>"
  let company_name_raw: string | null = null;
  const VERB_PAT = /(?:raises?|secures?|closes?|lands?|nets?|snares?|scores?|nabs?|bags?)/i;
  const titleRaises = (listingItem.title ?? "").match(
    new RegExp(`^(.+?)\\s+${VERB_PAT.source}\\s+`, "i")
  );
  if (titleRaises) {
    let raw = titleRaises[1].trim();
    // Strip trailing "in talks to [raise]" or "is set to" qualifier phrases
    raw = raw
      .replace(/\s+in\s+talks?\s+(?:to\s+)?(?:raise)?$/i, "")
      .replace(/\s+(?:is\s+)?(?:set|looking|planning|preparing)\s+to\s*$/i, "")
      .replace(/\s+reportedly\s*$/i, "")
      .trim();
    // Strip leading descriptor phrases like "Financial risk management platform CompanyName"
    // — find the last sequence of ProperCase words if the extracted name has lowercase words
    if (/^[a-z]/.test(raw) || /\s[a-z]/.test(raw)) {
      const properNoun = raw.match(/\b([A-Z][a-zA-Z0-9]+(?:[\s.][A-Z][a-zA-Z0-9]+)*)$/);
      if (properNoun && properNoun[1].length < raw.length * 0.75) {
        raw = properNoun[1];
      }
    }
    company_name_raw = raw || null;
  }
  if (!company_name_raw) {
    const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    company_name_raw = h1
      ? decodeHtmlEntities(stripHtml(h1[1]))
          .replace(new RegExp(`\\s+${VERB_PAT.source}\\s+.*`, "i"), "")
          .trim()
      : null;
  }

  // Amount
  const amountMatch = text.match(/\$([\d,.]+)\s*(million|billion|[mb])/i);
  const amount_raw = amountMatch ? amountMatch[0] : null;

  // Round
  const roundMatch = text.match(/\b(pre-?seed|seed|series\s*[a-f]\+?|growth|strategic)\b/i);
  const round_type_raw = roundMatch ? roundMatch[0] : null;

  // Lead investor
  const ledBy = text.match(/led\s+by\s+([\w\s,&.']+?)(?=[,.]|\s+(?:with|and|plus|alongside))/i);
  const lead_investor_raw = ledBy ? ledBy[1].trim() : null;

  // Co-investors (names after "with" or "participating investors include")
  const coMatch = text.match(
    /(?:with\s+participation\s+from|participating\s+investors\s+include|also\s+participated)\s*([\w\s,&.']+?)(?=[.;]|$)/i
  );
  const co_investors_raw = coMatch
    ? coMatch[1].split(/,|and/).map((s) => s.trim()).filter(Boolean)
    : [];

  // Date — prefer listing pubDate
  const dateMatch = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s*\d{4}/i
  );
  const announced_date_raw =
    dateMatch ? dateMatch[0]
    : listingItem.published_date ?? null;

  // Location — common pattern: "based in <City>" or "<City>-based"
  const locationMatch = text.match(/\b([A-Z][a-zA-Z\s,]+)-based|\bbased\s+in\s+([A-Z][a-zA-Z\s,]+)/);
  const company_location_raw = locationMatch
    ? (locationMatch[1] || locationMatch[2])?.trim() ?? null
    : null;

  // Sector — use categories from RSS
  const sectorMatch = text.match(/\b(?:fintech|healthtech|ai|saas|edtech|cleantech|proptech|cybersecurity|logistics)\b/i);
  const sector_raw = sectorMatch ? sectorMatch[0].toLowerCase() : null;

  if (!company_name_raw) return [];

  // Reject VC firms raising their own funds (e.g. "Accel raises $5B to back...",
  // "Collide Capital raises $95M fund"). These are LP-level fund raises, not startup rounds.
  const VC_FIRM_SUFFIX_RE = /\b(capital|ventures?|partners|equity|fund|vc)\s*$/i;
  if (VC_FIRM_SUFFIX_RE.test(company_name_raw) && /\bfund\b/i.test(listingItem.title ?? "")) return [];

  // Blend classification confidence with source credibility
  const confidence_score = Math.min(
    1.0,
    source.credibility_score * 0.6 + classConf * 0.4
  );

  return [
    {
      slot_index: 0,
      company_name_raw,
      company_domain_raw: null,
      company_website_raw: null,
      company_location_raw,
      round_type_raw,
      amount_raw,
      currency_raw: null,
      announced_date_raw,
      lead_investor_raw,
      co_investors_raw,
      sector_raw,
      article_url: url,
      press_url: url,
      source_type: "news",
      is_rumor: false,
      confidence_score,
      extracted_summary: text.slice(0, 500) || null,
      extraction_method: "html_parse",
      extraction_metadata: { adapter: "techcrunch", classification_confidence: classConf },
    },
  ];
}

export const TechCrunchAdapter: SourceAdapter = {
  key: "techcrunch",
  fetchListing,
  parseDocument,
};
