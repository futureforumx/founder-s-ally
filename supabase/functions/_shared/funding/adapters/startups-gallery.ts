/**
 * Adapter: startups.gallery/news
 *
 * The listing is a structured table (Company, Amount/Round, Date, Lead, Source).
 * We parse every Post row from the HTML — no keyword filter, no 60-item cap —
 * and emit presetDeal so LinkedIn/X source links still become canonical deals.
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
const MAX_ROWS = 500;
const PRESS_HOST_RE =
  /(techcrunch|reuters|businesswire|finsmes|linkedin|lnkd\.in|twitter|x\.com|yahoo|prnewswire|bloomberg|forbes|startups\.gallery|medium\.com)/i;

function firstPartyWebsite(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    if (!host || PRESS_HOST_RE.test(host)) return null;
    const parts = host.split(".");
    const skip = new Set(["news", "blog", "press", "ir", "about", "go"]);
    const cleaned = parts.length >= 3 && skip.has(parts[0]) ? parts.slice(1).join(".") : host;
    return `https://${cleaned}`;
  } catch {
    return null;
  }
}

function splitAmountAndRound(text: string): { amount: string | null; round: string | null } {
  const cleaned = text.trim();
  if (!cleaned) return { amount: null, round: null };
  const parts = cleaned.split(/\s*[·•|]\s*/).map((p) => p.trim()).filter(Boolean);
  const amount = parts.find((p) => /[\d]/.test(p) && /[$€£]|[kmb]\b|\d/i.test(p)) ?? null;
  const round = parts.find((p) => p !== amount) ?? null;
  return { amount, round };
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i");
  const m = tag.match(re);
  return m ? decodeHtmlEntities(m[1]) : null;
}

function namedInner(html: string, name: string): string {
  const re = new RegExp(
    `<([a-z][a-z0-9]*)\\b[^>]*data-framer-name="${name}"[^>]*>([\\s\\S]*?)</\\1>`,
    "i",
  );
  const m = html.match(re);
  return m ? stripHtml(decodeHtmlEntities(m[2])) : "";
}

function parsePostChunk(chunk: string): ListingItem | null {
  const anchors = chunk.match(/<a\b[^>]*data-framer-name="Company Name"[^>]*>[\s\S]*?<\/a>/gi) ?? [];
  let companyHref: string | null = null;
  let companyName = "";
  let leadInvestor: string | null = null;
  let logoUrl: string | null = null;

  for (const a of anchors) {
    const href = attr(a, "href");
    if (!href) continue;
    if (/\/companies\//i.test(href) && !companyHref) {
      companyHref = href;
      companyName = stripHtml(decodeHtmlEntities(a));
      const img = a.match(/<img\b[^>]+src=["']([^"']+)["']/i);
      const src = img?.[1] ? decodeHtmlEntities(img[1]).trim() : "";
      if (/^https?:\/\//i.test(src)) logoUrl = src;
    } else if (/\/investors\//i.test(href) && !leadInvestor) {
      leadInvestor = stripHtml(decodeHtmlEntities(a)) || null;
    }
  }
  if (!companyHref || !companyName) return null;

  const { amount, round } = splitAmountAndRound(namedInner(chunk, "Amount"));
  const dateBlock = namedInner(chunk, "Date");
  const timeTag = chunk.match(/<time\b[^>]*>[\s\S]*?<\/time>/i)?.[0] ?? "";
  const datetime = timeTag ? attr(timeTag, "datetime") : null;
  let published: string | undefined;
  if (datetime) {
    const d = new Date(datetime);
    if (!Number.isNaN(d.getTime())) published = d.toISOString();
  } else if (dateBlock) {
    const dm = dateBlock.match(
      /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i,
    );
    if (dm) {
      const d = new Date(dm[0]);
      if (!Number.isNaN(d.getTime())) published = d.toISOString();
    }
  }

  const sourceTag = chunk.match(/<a\b[^>]*data-framer-name="Source"[^>]*>/i)?.[0];
  const sourceHref = sourceTag ? attr(sourceTag, "href") : null;
  const companyPage = absUrl(companyHref, BASE);
  const url = sourceHref ? absUrl(sourceHref, BASE) : companyPage;
  const titleParts = [companyName, "raises", amount, round].filter(Boolean);

  return {
    url,
    title: titleParts.length > 1 ? titleParts.join(" ") : companyName,
    published_date: published,
    presetDeal: {
      company_name: companyName,
      amount_raw: amount,
      round_type_raw: round,
      announced_date: published ?? null,
      lead_investor: leadInvestor,
      company_website: firstPartyWebsite(url),
      company_logo_url: logoUrl,
    },
  };
}

function parseListingHtml(html: string): ListingItem[] {
  const parts = html.split(/data-framer-name="Post"/i);
  const items: ListingItem[] = [];
  const seen = new Set<string>();
  for (let i = 1; i < parts.length && items.length < MAX_ROWS; i++) {
    const item = parsePostChunk(parts[i].slice(0, 20_000));
    if (!item) continue;
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    items.push(item);
  }
  return items;
}

async function fetchListing(ctx: AdapterContext): Promise<ListingItem[]> {
  const result = await ctx.fetchUrl(BASE);
  if (!result.ok) {
    throw new Error(`startups.gallery listing fetch failed: ${result.status} ${result.error ?? ""}`);
  }

  const items = parseListingHtml(result.text);
  if (items.length > 0) return items;

  // Fallback: company-page links only if Framer markup changes.
  const linkRe = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const fallback: ListingItem[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(result.text)) !== null) {
    const href = m[1].trim();
    if (!/\/companies\//i.test(href)) continue;
    const url = absUrl(href, BASE);
    if (seen.has(url)) continue;
    seen.add(url);
    const label = decodeHtmlEntities(stripHtml(m[2])).trim();
    if (!label) continue;
    fallback.push({ url, title: label });
    if (fallback.length >= MAX_ROWS) break;
  }
  return fallback;
}

function parseDocument(
  html: string,
  url: string,
  listingItem: ListingItem,
  source: FiSource
): RawDealCandidate[] {
  const preset = listingItem.presetDeal;
  if (preset?.company_name) {
    return [
      {
        slot_index: 0,
        company_name_raw: preset.company_name,
        company_domain_raw: null,
        company_website_raw: preset.company_website ?? null,
        company_location_raw: null,
        round_type_raw: preset.round_type_raw ?? null,
        amount_raw: preset.amount_raw ?? null,
        currency_raw: null,
        announced_date_raw: preset.announced_date ?? listingItem.published_date ?? null,
        lead_investor_raw: preset.lead_investor ?? null,
        co_investors_raw: [],
        sector_raw: null,
        article_url: url,
        press_url: url,
        source_type: "curated_feed",
        is_rumor: false,
        confidence_score: Math.max(source.credibility_score, 0.82),
        extracted_summary: listingItem.title ?? null,
        extraction_method: "html_parse",
        extraction_metadata: {
          adapter: "startups_gallery",
          listing: true,
          logo_url: preset.company_logo_url ?? null,
        },
      },
    ];
  }

  const text = decodeHtmlEntities(stripHtml(html));
  const companyMatch = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  const company_name_raw = companyMatch
    ? decodeHtmlEntities(stripHtml(companyMatch[1])).trim()
    : (listingItem.title?.split(" raises")[0]?.split(" closes")[0]?.trim() ?? null);

  if (!company_name_raw) return [];
  if (/^top\s+(?:series|seed|pre-?seed|growth|startups?)\b/i.test(company_name_raw)) return [];

  const amountMatch = text.match(/\$([\d,.]+)\s*(million|billion|[mb])/i);
  const roundMatch = text.match(/\b(pre-?seed|seed|series\s*[a-f]|growth|strategic|debt|venture)\b/i);
  const investorMatch = text.match(/led by\s+([\w\s,&]+?)(?=\.|,\s*(?:with|and)|$)/i);
  const dateMatch = text.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s*\d{4}/i
  ) || text.match(/\d{4}-\d{2}-\d{2}/);

  return [
    {
      slot_index: 0,
      company_name_raw,
      company_domain_raw: null,
      company_website_raw: null,
      company_location_raw: null,
      round_type_raw: roundMatch ? roundMatch[0].trim() : null,
      amount_raw: amountMatch ? amountMatch[0].trim() : null,
      currency_raw: null,
      announced_date_raw: dateMatch ? dateMatch[0] : (listingItem.published_date ?? null),
      lead_investor_raw: investorMatch ? investorMatch[1].trim() : null,
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
