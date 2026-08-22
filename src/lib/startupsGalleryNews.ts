/**
 * Cheerio-free parser for https://startups.gallery/news.
 *
 * Each deal is a Framer `data-framer-name="Post"` block with Company, Amount
 * (`$20M · Seed`), Date, lead investor, and a Source press link. The listing
 * already has the fields Latest Funding needs — we do not guess from article copy.
 */
import {
  stringField,
  stringListField,
  type FramerCmsRecord,
  type FramerCmsValue,
} from "./framerCmsChunk";


export const STARTUPS_GALLERY_NEWS_URL = "https://startups.gallery/news";
export const STARTUPS_GALLERY_ORIGIN = "https://startups.gallery";

export type StartupsGalleryNewsRow = {
  companyName: string;
  companyPageUrl: string;
  companySlug: string | null;
  amountRaw: string | null;
  roundTypeRaw: string | null;
  announcedAtIso: string | null;
  leadInvestor: string | null;
  sourceUrl: string | null;
  logoUrl: string | null;
  cmsId?: string | null;
};

export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/gi, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

export function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function resolveStartupsGalleryUrl(href: string, base = STARTUPS_GALLERY_NEWS_URL): string {
  const trimmed = decodeHtmlEntities(href.trim());
  if (!trimmed) return base;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  try {
    return new URL(trimmed, base).toString();
  } catch {
    if (trimmed.startsWith("/")) return `${STARTUPS_GALLERY_ORIGIN}${trimmed}`;
    return `${STARTUPS_GALLERY_ORIGIN}/${trimmed.replace(/^\.\//, "")}`;
  }
}

/** Splits startups.gallery's combined "$1B · Series D" cell into amount / round. */
export function splitAmountAndRound(text: string): { amount: string | null; round: string | null } {
  const cleaned = stripTags(text);
  if (!cleaned) return { amount: null, round: null };
  const parts = cleaned
    .split(/\s*[·•|]\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  const amount = parts.find((p) => /[\d]/.test(p) && /[$€££]|[kmb]\b|\d/i.test(p)) ?? null;
  const round = parts.find((p) => p !== amount) ?? null;
  return { amount, round };
}

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i");
  const m = tag.match(re);
  return m ? decodeHtmlEntities(m[1]) : null;
}

function firstTag(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[0] : null;
}

function namedBlock(html: string, name: string): string | null {
  const re = new RegExp(
    `<([a-z][a-z0-9]*)\\b[^>]*data-framer-name="${name}"[^>]*>`,
    "i",
  );
  const open = html.match(re);
  if (!open || open.index == null) return null;
  const tagName = open[1];
  const start = open.index;
  const closeRe = new RegExp(`</${tagName}\\s*>`, "i");
  const rest = html.slice(start);
  const close = rest.match(closeRe);
  if (!close || close.index == null) return rest.slice(0, 8_000);
  return rest.slice(0, close.index + close[0].length);
}

function companySlugFromHref(href: string): string | null {
  const m = href.match(/\/companies\/([^/?#]+)/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]).trim() || null;
  } catch {
    return m[1].trim() || null;
  }
}

function parsePostChunk(chunk: string): StartupsGalleryNewsRow | null {
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
      companyName = stripTags(a);
      const img = a.match(/<img\b[^>]+src=["']([^"']+)["']/i);
      const src = img?.[1] ? decodeHtmlEntities(img[1]).trim() : "";
      if (/^https?:\/\//i.test(src)) logoUrl = src;
    } else if (/\/investors\//i.test(href) && !leadInvestor) {
      leadInvestor = stripTags(a) || null;
    }
  }

  if (!companyHref || !companyName) return null;

  const amountBlock = namedBlock(chunk, "Amount");
  const { amount, round } = splitAmountAndRound(amountBlock ?? "");

  const dateBlock = namedBlock(chunk, "Date") ?? chunk;
  const timeTag = firstTag(dateBlock, /<time\b[^>]*>[\s\S]*?<\/time>/i);
  const datetime = timeTag ? attr(timeTag, "datetime") : null;
  let announcedAtIso: string | null = null;
  if (datetime) {
    const d = new Date(datetime);
    if (!Number.isNaN(d.getTime())) announcedAtIso = d.toISOString();
  } else {
    const dateText = stripTags(dateBlock);
    const dm = dateText.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/i);
    if (dm) {
      const d = new Date(dm[0]);
      if (!Number.isNaN(d.getTime())) announcedAtIso = d.toISOString();
    }
  }

  const sourceTag = firstTag(chunk, /<a\b[^>]*data-framer-name="Source"[^>]*>/i);
  const sourceHref = sourceTag ? attr(sourceTag, "href") : null;

  const companyPageUrl = resolveStartupsGalleryUrl(companyHref);
  return {
    companyName,
    companyPageUrl,
    companySlug: companySlugFromHref(companyPageUrl),
    amountRaw: amount,
    roundTypeRaw: round,
    announcedAtIso,
    leadInvestor,
    sourceUrl: sourceHref ? resolveStartupsGalleryUrl(sourceHref) : null,
    logoUrl,
  };
}

/**
 * Parse every deal row from startups.gallery /news HTML.
 * Does not keyword-filter or cap — callers apply `maxItems` / `since` if needed.
 */
export function parseStartupsGalleryNewsHtml(html: string): StartupsGalleryNewsRow[] {
  if (!html) return [];
  const parts = html.split(/data-framer-name="Post"/i);
  const out: StartupsGalleryNewsRow[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i].slice(0, 20_000);
    const row = parsePostChunk(chunk);
    if (!row) continue;
    const key = `${row.companyName.toLowerCase()}|${row.announcedAtIso ?? ""}|${row.amountRaw ?? ""}|${row.sourceUrl ?? row.companyPageUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function startupsGalleryArticleUrl(row: StartupsGalleryNewsRow): string {
  return row.sourceUrl || row.companyPageUrl;
}

export function startupsGalleryListingTitle(row: StartupsGalleryNewsRow): string {
  const parts = [row.companyName, "raises", row.amountRaw, row.roundTypeRaw].filter(Boolean);
  return parts.length > 1 ? parts.join(" ") : row.companyName;
}

export type GalleryCmsLookups = {
  companies: Map<string, { name: string; slug: string | null; logoUrl: string | null }>;
  stages: Map<string, string>;
  investors: Map<string, string>;
};

function isoFromCms(value: FramerCmsValue | undefined): string | null {
  if (typeof value !== "string" || !value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Map Framer Funding Tracker records onto the same row shape as the /news HTML table. */
export function galleryRowsFromFundingTrackerCms(
  records: FramerCmsRecord[],
  fields: Record<string, string>,
  lookups: GalleryCmsLookups,
): StartupsGalleryNewsRow[] {
  const companyKey = fields.Company;
  const amountKey = fields["Amount Raised"];
  const roundKey = fields.Round;
  const leadKey = fields["Lead Investor"];
  const dateKey = fields["Announcement Date"];
  const sourceKey = fields["Source Link"];
  const slugKey = fields.Slug;

  const out: StartupsGalleryNewsRow[] = [];
  const seen = new Set<string>();
  for (const rec of records) {
    const cmsId = typeof rec.id === "string" ? rec.id : null;
    const companyId = stringField(rec, companyKey);
    const company = companyId ? lookups.companies.get(companyId) : undefined;
    const companyName = company?.name?.trim() || "";
    if (!companyName) continue;

    const roundId = stringField(rec, roundKey);
    const leadIds = stringListField(rec, leadKey);
    const sourceUrl = stringField(rec, sourceKey);
    const amountRaw = stringField(rec, amountKey);
    const announcedAtIso = isoFromCms(dateKey ? rec[dateKey] : undefined);
    const slug = stringField(rec, slugKey) || company?.slug || null;
    const companySlug = company?.slug || (slug ? slug.replace(/-raises-.*$/i, "") : null);
    const companyPageUrl = companySlug
      ? resolveStartupsGalleryUrl(`./companies/${companySlug}`)
      : STARTUPS_GALLERY_NEWS_URL;

    const key = `${companyName.toLowerCase()}|${announcedAtIso ?? ""}|${amountRaw ?? ""}|${sourceUrl ?? cmsId ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      companyName,
      companyPageUrl,
      companySlug,
      amountRaw,
      roundTypeRaw: roundId ? lookups.stages.get(roundId) ?? null : null,
      announcedAtIso,
      leadInvestor: leadIds.map((id) => lookups.investors.get(id)).find(Boolean) ?? null,
      sourceUrl,
      logoUrl: company?.logoUrl ?? null,
      cmsId,
    });
  }
  return out;
}
