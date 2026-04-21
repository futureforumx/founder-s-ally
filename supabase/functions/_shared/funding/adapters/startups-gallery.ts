/**
 * Adapter: startups.gallery/news
 *
 * Page structure: curated daily funding page.
 * Each item has: company name, round, date, lead investor, source link.
 * The listing page itself contains structured data — minimal detail-page
 * fetching required; we use the listing payload directly.
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

const BASE = "https://startups.gallery/news";

// ── Listing fetcher ──────────────────────────────────────────────────────────

async function fetchListing(ctx: AdapterContext): Promise<ListingItem[]> {
  const result = await ctx.fetchUrl(BASE);
  if (!result.ok) {
    throw new Error(`startups.gallery listing fetch failed: ${result.status} ${result.error ?? ""}`);
  }

  const html = result.text;
  const items: ListingItem[] = [];

  // Pattern: each news item is typically inside an article or list element
  // with a link to either an external press source or an internal detail.
  // We extract all anchor hrefs that look like funding news items.
  const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1].trim();
    const label = decodeHtmlEntities(stripHtml(m[2])).trim();
    if (!label || label.length < 8) continue;
    // Skip navigation / non-content links
    if (/^\/(news|about|contact|rss|feed|tag|category)$/i.test(href)) continue;
    if (/^#/.test(href)) continue;

    const url = absUrl(href, BASE);
    if (seen.has(url)) continue;
    seen.add(url);

    // Skip investor/VC profile pages — those are not portfolio company deals
    if (/\/investors\//i.test(href)) continue;
    // Skip other non-deal internal paths
    if (/\/(investors?|funds?|portfolio|team|about|contact|newsletter|jobs)\b/i.test(href)) continue;

    // Skip category/listing index pages — e.g. "Top Series E Startups", "Top Seed Startups"
    if (/^top\s+(?:series\s+[a-z]|seed|pre-?seed|growth|series)/i.test(label)) continue;
    // Skip generic UI/nav labels
    if (/^(submit|sign up|subscribe|view all|see all|learn more|explore|get started)\b/i.test(label)) continue;

    // Heuristic: only keep links that mention typical funding keywords or company-like titles
    const looks_like_deal = /raises?|seed|series|fund|invest|million|billion|\$[\d]/i.test(label);
    if (!looks_like_deal && !url.includes("startups.gallery/news/")) continue;

    items.push({ url, title: label });
  }

  return items.slice(0, 60);
}

// ── Document parser ──────────────────────────────────────────────────────────

function parseDocument(
  html: string,
  url: string,
  listingItem: ListingItem,
  source: FiSource
): RawDealCandidate[] {
  const text = decodeHtmlEntities(stripHtml(html));

  // Extract company name — usually the first bold/heading text
  const companyMatch = html.match(
    /<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i
  );
  const company_name_raw = companyMatch
    ? decodeHtmlEntities(stripHtml(companyMatch[1])).trim()
    : (listingItem.title?.split(" raises")[0]?.split(" closes")[0]?.trim() ?? null);

  // Amount
  const amountMatch = text.match(/\$([\d,.]+)\s*(million|billion|[mb])/i);
  const amount_raw = amountMatch ? amountMatch[0].trim() : null;

  // Round type
  const roundMatch = text.match(/\b(pre-?seed|seed|series\s*[a-f]|growth|strategic|debt)\b/i);
  const round_type_raw = roundMatch ? roundMatch[0].trim() : null;

  // Lead investor
  const investorMatch = text.match(/led by\s+([\w\s,&]+?)(?=\.|,\s*(?:with|and)|$)/i);
  const lead_investor_raw = investorMatch ? investorMatch[1].trim() : null;

  // Date
  const dateMatch = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s*\d{4}/i
  ) || text.match(/\d{4}-\d{2}-\d{2}/);
  const announced_date_raw = dateMatch ? dateMatch[0] : (listingItem.published_date ?? null);

  // Website — look for a hyperlink to an external site, skip CDN/framework URLs
  const CDN_RE = /bootstrap|googleapis|gstatic|framer\.com|jquery|cloudflare|unpkg|jsdelivr|cdnjs|fonts\.|stackpath|hotjar|segment|analytics|tracking|wp-content|wp-includes/i;
  const websiteRe = /href=["'](https?:\/\/(?!startups\.gallery)[^"'<>\s]+)["']/gi;
  let websiteMatch: RegExpExecArray | null;
  let company_website_raw: string | null = null;
  while ((websiteMatch = websiteRe.exec(html)) !== null) {
    if (!CDN_RE.test(websiteMatch[1])) { company_website_raw = websiteMatch[1]; break; }
  }

  if (!company_name_raw) return [];
  // Reject category/index page company names that are not real companies
  if (/^top\s+(?:series|seed|pre-?seed|growth|startups?)\b/i.test(company_name_raw)) return [];
  if (/\b(startups?|companies|firms)\s*$/i.test(company_name_raw) && company_name_raw.split(" ").length > 3) return [];

  return [
    {
      slot_index: 0,
      company_name_raw,
      company_domain_raw: null,
      company_website_raw,
      company_location_raw: null,
      round_type_raw,
      amount_raw,
      currency_raw: null,
      announced_date_raw,
      lead_investor_raw,
      co_investors_raw: [],
      sector_raw: null,
      article_url: url,
      press_url: url,
      source_type: "curated_feed",
      is_rumor: false,
      confidence_score: source.credibility_score,
      extracted_summary: text.slice(0, 400) || null,
      extraction_method: "html_parse",
      extraction_metadata: { adapter: "startups_gallery" },
    },
  ];
}

export const StartupsGalleryAdapter: SourceAdapter = {
  key: "startups_gallery",
  fetchListing,
  parseDocument,
};
