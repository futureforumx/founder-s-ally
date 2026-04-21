/**
 * Adapter: vcnewsdaily.com
 *
 * VC News Daily is a curated venture financings feed.
 * The site has a main listing page and individual article/company pages.
 * Listing page contains company snippets with round info.
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

const BASE = "https://vcnewsdaily.com/";

async function fetchListing(ctx: AdapterContext): Promise<ListingItem[]> {
  const result = await ctx.fetchUrl(BASE);
  if (!result.ok) {
    throw new Error(`vcnewsdaily listing fetch failed: ${result.status} ${result.error ?? ""}`);
  }

  const html = result.text;
  const items: ListingItem[] = [];
  const seen = new Set<string>();

  // VC News Daily uses article links — extract all internal article links
  const articleRe = /<a[^>]+href=["']((?:https?:\/\/vcnewsdaily\.com)?\/[^"'?#]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = articleRe.exec(html)) !== null) {
    const href = m[1].trim();
    const label = decodeHtmlEntities(stripHtml(m[2])).trim();
    if (!label || label.length < 5) continue;
    if (/^\/(about|contact|privacy|terms|tag|category|author)\b/i.test(href)) continue;

    const url = absUrl(href, BASE);
    if (seen.has(url)) continue;
    seen.add(url);

    // Must look like a company/funding article
    const looks_like_deal = /raises?|secures?|closes?|fund|invest|million|billion|\$[\d]/i.test(label)
      || /vcnewsdaily\.com\/[a-z0-9-]+\//.test(url);
    if (!looks_like_deal) continue;

    items.push({ url, title: label });
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

  // Company name: typically the H1 or page title minus " raised $X" suffix
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  let company_name_raw = h1Match
    ? decodeHtmlEntities(stripHtml(h1Match[1])).trim()
    : null;

  // Strip common trailing patterns like "raises $50M in Series B"
  // VC News Daily uses many colorful funding verbs in headlines
  const FUNDING_VERBS = /\s+(raises?|secures?|closes?|announces?|snares?|scores?|lands?|nabs?|bags?|receives?|recieves?|gets?|wins?|earns?|pulls?\s+in|pulls?\s+down|hauls?\s+in|nets?|fetches?|collects?)\s+.*/i;
  if (company_name_raw) {
    company_name_raw = company_name_raw
      .replace(FUNDING_VERBS, "")
      .trim();
  }
  if (!company_name_raw) {
    company_name_raw = listingItem.title
      ?.replace(FUNDING_VERBS, "")
      .trim() ?? null;
  }

  // Amount — normalize "million"/"billion" to M/B for consistent display
  const amountMatch = text.match(/\$([\d,.]+\s*(?:million|billion|[mb]))/i);
  const amount_raw = amountMatch
    ? amountMatch[0].trim()
        .replace(/\s*million\b/i, "M")
        .replace(/\s*billion\b/i, "B")
    : null;

  // Round
  const roundMatch = text.match(/\b(pre-?seed|seed|series\s*[a-f]\+?|growth|strategic)\b/i);
  const round_type_raw = roundMatch ? roundMatch[0] : null;

  // Lead investor — require uppercase start, max 6 words to avoid sentence fragments
  // e.g. reject "top Silicon Valley investors" (lowercase), "fitness industry veteran Adam Shane" (descriptor)
  const ledByMatch = text.match(/led\s+by\s+([\w\s,&.']+?)(?=\s*[,.]|\s+(?:with|and|plus|alongside))/i);
  const lead_investor_candidate = ledByMatch ? ledByMatch[1].trim() : null;
  const lead_investor_raw = lead_investor_candidate &&
    /^[A-Z]/.test(lead_investor_candidate) &&
    lead_investor_candidate.split(/\s+/).length <= 6
    ? lead_investor_candidate
    : null;

  // Co-investors — conservative extraction: stop at period/semicolon only, cap at 200 chars
  // Avoid greedy $ anchor which captures entire page text
  const coMatch = text.match(
    /(?:with\s+participation\s+from|participating\s+investors\s+include|co-investors?(?:\s+include)?)\s+([\w\s,&.']{3,200}?)(?=[.;])/i
  );
  const co_raw = coMatch
    ? coMatch[1].split(/,\s*|\s+and\s+/).map((s) => s.trim()).filter((s) => s.length > 2 && s.length < 60 && /^[A-Z]/.test(s))
    : [];

  // Date
  const dateMatch = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s*\d{4}/i
  ) || text.match(/\d{4}-\d{2}-\d{2}/);
  const announced_date_raw = dateMatch ? dateMatch[0] : null;

  // Company website — skip CDN/framework/analytics URLs
  const CDN_RE = /bootstrap|googleapis|gstatic|framer\.com|jquery|cloudflare|unpkg|jsdelivr|cdnjs|fonts\.|stackpath|hotjar|segment|mixpanel|intercom|zendesk|hubspot|analytics|tracking|pixel\.|gtm\.|gravatar|wp-content|wp-includes/i;
  const websiteRe = /href=["'](https?:\/\/(?!vcnewsdaily\.com)[^"'<>\s]+)["']/gi;
  let websiteMatch: RegExpExecArray | null;
  let company_website_raw: string | null = null;
  while ((websiteMatch = websiteRe.exec(html)) !== null) {
    if (!CDN_RE.test(websiteMatch[1])) { company_website_raw = websiteMatch[1]; break; }
  }

  // Sector
  const sectorMatch = text.match(/\b(?:fintech|healthtech|ai|saas|edtech|cleantech|proptech|security|logistics)\b/i);
  const sector_raw = sectorMatch ? sectorMatch[0].toLowerCase() : null;

  if (!company_name_raw) return [];

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
      co_investors_raw: co_raw,
      sector_raw,
      article_url: url,
      press_url: url,
      source_type: "curated_feed",
      is_rumor: false,
      confidence_score: source.credibility_score,
      extracted_summary: text.slice(0, 500) || null,
      extraction_method: "html_parse",
      extraction_metadata: { adapter: "vc_news_daily" },
    },
  ];
}

export const VcNewsDailyAdapter: SourceAdapter = {
  key: "vc_news_daily",
  fetchListing,
  parseDocument,
};
