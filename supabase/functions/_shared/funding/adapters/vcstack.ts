/**
 * Adapter: vcstack.com/funding-announcements-rumours
 *
 * VC Stack is a mixed feed of confirmed announcements AND rumors.
 * Key requirements:
 *  - Explicitly classify each item as confirmed vs. rumor
 *  - Set source_type = 'rumor' and lower confidence_score for rumors
 *  - Store the classification in extraction_metadata
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
  classifyVcStackItem,
} from "../normalize.ts";

const BASE = "https://www.vcstack.com/funding-announcements-rumours";

async function fetchListing(ctx: AdapterContext): Promise<ListingItem[]> {
  const result = await ctx.fetchUrl(BASE);
  if (!result.ok) {
    throw new Error(`vcstack listing fetch failed: ${result.status} ${result.error ?? ""}`);
  }

  const html = result.text;
  const items: ListingItem[] = [];
  const seen = new Set<string>();

  // Extract all links on the page; VC Stack cards link to detail pages or external sources
  const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;

  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1].trim();
    const label = decodeHtmlEntities(stripHtml(m[2])).trim();

    if (!href || !label || label.length < 5) continue;
    if (/^#|javascript:/i.test(href)) continue;

    // Skip navigation / resource pages at vcstack.com
    if (/\/(about|contact|privacy|terms|login|signup)\b/i.test(href)) continue;
    // Blocklist of known VC Stack nav/category slugs (not deal pages)
    if (/^\/(vc-firms|angels|research|newsletters|podcasts|vendors|fundraising-materials|acquirers|investment-bank|automation-templates|notion-templates|media-journalists|browser-plugin|documents|data-software-tools|lp-communication|prompt-library|masterclasses|accelerators|incubators|limited-partners|pe-firms|reports|trending-startups|ai-copilots|funding-announcements-rumours)([/?#]|$)/i.test(href)) continue;

    // Skip obvious CTA / UI / navigation labels that are not deal headlines
    if (/^(submit|stay|sign up|subscribe|follow us|get|join|download|view all|see all|learn more|click here|explore|check out|find|discover|compare|browse)\b/i.test(label)) continue;
    if (/\b(notifications?|newsletter|submit.*announcement|fund performances?|all document)\b/i.test(label)) continue;
    // Skip generic category-list labels like "Top Series X" or "Trending" pages
    if (/^(top\s+(?:series|seed|pre-?seed|growth)|trending\s+startups?|top\s+startups?)\b/i.test(label)) continue;

    const url = absUrl(href, BASE);
    if (seen.has(url)) continue;
    seen.add(url);

    // For vcstack.com internal URLs, require funding keywords in EITHER label OR surrounding context
    // (do NOT accept all vcstack.com URLs blindly — that scrapes navigation pages)
    // Note: 'fund' alone is too broad — require a more specific funding pattern or dollar amount
    const fundingRe = /raises?|round|series\s*[a-z]|seed\s+round|seed\s+fund|\bseed\b.*\$|million|billion|\$[\d]|rumou?r|invest(?:ment|or)/i;
    const context = html.slice(Math.max(0, m.index - 200), m.index + 200);
    // For the label, also allow bare "seed" or "series X" mentions (deal titles)
    const labelFundingRe = /raises?|round|series|seed|fund(?:ed|ing)|million|billion|\$[\d]|rumou?r|invest/i;
    const looks_like_deal = labelFundingRe.test(label)
      || (url.includes("vcstack.com") && fundingRe.test(context));
    if (!looks_like_deal) continue;

    // Classify as rumor based on listing text
    const { isRumor, confidence } = classifyVcStackItem(label, "");

    // Look for date in snippet context (context already computed above)
    const pubDateMatch = context.match(
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}/i
    );

    items.push({
      url,
      title: label,
      published_date: pubDateMatch ? pubDateMatch[0] : undefined,
      is_rumor: isRumor,
    });
  }

  return items.slice(0, 60);
}

function parseDocument(
  html: string,
  url: string,
  listingItem: ListingItem,
  source: FiSource
): RawDealCandidate[] {
  const text = decodeHtmlEntities(stripHtml(html));

  // Re-classify using full page content for better accuracy
  const { isRumor, confidence: rumorConf } = classifyVcStackItem(
    listingItem.title ?? "",
    text.slice(0, 500)
  );

  // Company name
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  let company_name_raw = h1
    ? decodeHtmlEntities(stripHtml(h1[1]))
        .replace(/\s+(raises?|reportedly|may|is)\s+.*/i, "").trim()
    : null;
  if (!company_name_raw) {
    company_name_raw = listingItem.title
      ?.replace(/\s+(raises?|reportedly|may|is)\s+.*/i, "")
      .trim() ?? null;
  }

  // Amount (may be absent for rumors)
  const amountMatch = text.match(/\$([\d,.]+)\s*(million|billion|[mb])/i);
  const amount_raw = amountMatch ? amountMatch[0] : null;

  // Round
  const roundMatch = text.match(/\b(pre-?seed|seed|series\s*[a-f]\+?|growth|strategic)\b/i);
  const round_type_raw = roundMatch ? roundMatch[0] : null;

  // Lead investor (may be unknown for rumors)
  // Note: avoid the broad "from X" fallback — too greedy on non-deal pages
  const ledBy = text.match(/led\s+by\s+([\w\s,&.']+?)(?=[,.]|\s+(?:with|and|alongside))/i)
    || text.match(/backed\s+by\s+([\w\s,&.']+?)(?=[,.]|\s+(?:with|and|alongside))/i);
  const lead_investor_raw_candidate = ledBy ? ledBy[1].trim() : null;
  // Sanity: reject if more than 6 words (likely a sentence fragment, not an investor name)
  const lead_investor_raw = lead_investor_raw_candidate && lead_investor_raw_candidate.split(/\s+/).length <= 6
    ? lead_investor_raw_candidate
    : null;

  // Date
  const dateMatch = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s*\d{4}/i
  );
  const announced_date_raw = dateMatch ? dateMatch[0] : (listingItem.published_date ?? null);

  // Sector
  const sectorMatch = text.match(/\b(?:fintech|healthtech|ai|saas|edtech|cleantech|proptech|cybersecurity|logistics)\b/i);
  const sector_raw = sectorMatch ? sectorMatch[0].toLowerCase() : null;

  // Confidence: rumors get meaningfully lower score
  const base_score = isRumor ? 0.35 : source.credibility_score;
  const confidence_score = Math.min(0.95, base_score);

  if (!company_name_raw) return [];
  // Reject obvious non-company names: navigation labels, CTAs, generic UI text
  if (/^(stay|submit|sign|follow|get|join|download|fund performances?|view|see|browse|top\s+)/i.test(company_name_raw)) return [];
  if (/\b(notification|newsletter|announcement form)\b/i.test(company_name_raw)) return [];

  return [
    {
      slot_index: 0,
      company_name_raw,
      company_domain_raw: null,
      company_website_raw: null,
      company_location_raw: null,
      round_type_raw,
      amount_raw,
      currency_raw: null,
      announced_date_raw,
      lead_investor_raw,
      co_investors_raw: [],
      sector_raw,
      article_url: url,
      press_url: url,
      // IMPORTANT: rumor entries get source_type = 'rumor'
      source_type: isRumor ? "rumor" : "curated_feed",
      is_rumor: isRumor,
      confidence_score,
      extracted_summary: text.slice(0, 400) || null,
      extraction_method: "html_parse",
      extraction_metadata: {
        adapter: "vcstack",
        is_rumor: isRumor,
        rumor_confidence: rumorConf,
      },
    },
  ];
}

export const VcStackAdapter: SourceAdapter = {
  key: "vcstack",
  fetchListing,
  parseDocument,
};
