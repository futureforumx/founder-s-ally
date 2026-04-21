/**
 * Adapter: venture5.com/vc-deals/
 *
 * Venture5 is an aggregated/curated deals feed.
 * The listing page contains deal cards; individual deal pages exist for details.
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
  absUrl,
} from "../normalize.ts";

const BASE = "https://venture5.com/vc-deals/";

async function fetchListing(ctx: AdapterContext): Promise<ListingItem[]> {
  const result = await ctx.fetchUrl(BASE);
  if (!result.ok) {
    throw new Error(`venture5 listing fetch failed: ${result.status} ${result.error ?? ""}`);
  }

  const html = result.text;
  const items: ListingItem[] = [];
  const seen = new Set<string>();

  // Venture5 deal cards typically link to individual deal pages
  // Pattern: article or div with a link containing company/deal info
  const linkRe = /<a[^>]+href=["']((?:https?:\/\/venture5\.com)?[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1].trim();
    const label = decodeHtmlEntities(stripHtml(m[2])).trim();

    if (!href || !label || label.length < 4) continue;
    if (/^\/(about|contact|privacy|blog|news|tag|category)\b/i.test(href)) continue;
    if (/^#/.test(href)) continue;

    const url = absUrl(href, BASE);
    if (seen.has(url)) continue;
    seen.add(url);

    // Keep deal-page links (internal venture5 links) or funding-specific external links
    const isInternal = url.includes("venture5.com");
    const looks_like_deal = isInternal ||
      /raises?|round|series|seed|fund|million|billion|\$[\d]/i.test(label);
    if (!looks_like_deal) continue;

    // Try to extract date from nearby text
    const pubDateMatch = html
      .slice(Math.max(0, m.index - 200), m.index + 200)
      .match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}/i);

    items.push({
      url,
      title: label,
      published_date: pubDateMatch ? pubDateMatch[0] : undefined,
    });
  }

  return items.slice(0, 50);
}

function parseDocument(
  html: string,
  url: string,
  listingItem: ListingItem,
  source: FiSource
): RawDealCandidate[] {
  const text = decodeHtmlEntities(stripHtml(html));

  // Company name
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  let company_name_raw = h1
    ? decodeHtmlEntities(stripHtml(h1[1])).replace(/\s+(raises?|secures?|closes?).*/i, "").trim()
    : null;
  if (!company_name_raw) {
    company_name_raw = listingItem.title
      ?.replace(/\s+(raises?|secures?|closes?)\s+.*/i, "")
      .trim() ?? null;
  }

  // Amount
  const amountMatch = text.match(/\$([\d,.]+)\s*(million|billion|[mb])/i);
  const amount_raw = amountMatch ? amountMatch[0] : null;

  // Round
  const roundMatch = text.match(/\b(pre-?seed|seed|series\s*[a-f]\+?|growth|strategic)\b/i);
  const round_type_raw = roundMatch ? roundMatch[0] : null;

  // Lead investor
  const ledBy = text.match(/led\s+by\s+([\w\s,&.']+?)(?=[,.]|\s+(?:with|and|alongside))/i);
  const lead_investor_raw = ledBy ? ledBy[1].trim() : null;

  // Co-investors
  const coMatch = text.match(/(?:with|alongside|other investors include)\s+([\w\s,&.']+?)(?=[.;]|$)/i);
  const co_investors_raw = coMatch
    ? coMatch[1].split(/,|and/).map((s) => s.trim()).filter(Boolean)
    : [];

  // Date
  const dateMatch = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s*\d{4}/i
  );
  const announced_date_raw = dateMatch ? dateMatch[0] : (listingItem.published_date ?? null);

  // Location
  const locationMatch = text.match(/\b([A-Z][a-zA-Z\s,]+)-based|\bbased\s+in\s+([A-Z][a-zA-Z\s,]+)/);
  const company_location_raw = locationMatch
    ? (locationMatch[1] || locationMatch[2])?.trim() ?? null
    : null;

  // Website — look for explicit site link, skip CDN/framework URLs
  const CDN_RE = /bootstrap|googleapis|gstatic|framer\.com|jquery|cloudflare|unpkg|jsdelivr|cdnjs|fonts\.|stackpath|hotjar|segment|analytics|tracking|wp-content|wp-includes/i;
  const websiteRe = /href=["'](https?:\/\/(?!venture5\.com)[^"'<>\s]{6,})["']/gi;
  let websiteMatch: RegExpExecArray | null;
  let company_website_raw: string | null = null;
  while ((websiteMatch = websiteRe.exec(html)) !== null) {
    if (!CDN_RE.test(websiteMatch[1])) { company_website_raw = websiteMatch[1]; break; }
  }

  const sectorMatch = text.match(/\b(?:fintech|healthtech|ai|saas|edtech|cleantech|proptech|cybersecurity|logistics|spacetech)\b/i);
  const sector_raw = sectorMatch ? sectorMatch[0].toLowerCase() : null;

  if (!company_name_raw) return [];

  return [
    {
      slot_index: 0,
      company_name_raw,
      company_domain_raw: null,
      company_website_raw,
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
      source_type: "curated_feed",
      is_rumor: false,
      confidence_score: source.credibility_score,
      extracted_summary: text.slice(0, 500) || null,
      extraction_method: "html_parse",
      extraction_metadata: { adapter: "venture5" },
    },
  ];
}

export const Venture5Adapter: SourceAdapter = {
  key: "venture5",
  fetchListing,
  parseDocument,
};
