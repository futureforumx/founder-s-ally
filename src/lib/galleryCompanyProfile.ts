import { normalizeHqDisplayLine } from "@/lib/formatCanonicalHqLine";

export type GalleryCompanyIndexEntry = {
  description?: string;
  h1?: string[];
  p?: string[];
};

export type GalleryCompanyProfile = {
  sector: string | null;
  hqLine: string | null;
  description: string | null;
};

const GALLERY_INDUSTRIES = new Set(
  [
    "aerospace",
    "ai",
    "analytics",
    "biotech",
    "climate",
    "construction",
    "consumer",
    "crypto",
    "cybersecurity",
    "design",
    "devtools",
    "education",
    "energy",
    "fintech",
    "gaming",
    "hardware",
    "healthtech",
    "healthcare",
    "industrials",
    "insurtech",
    "legaltech",
    "logistics",
    "marketplace",
    "media",
    "mobility",
    "proptech",
    "robotics",
    "semiconductor",
  ].map((s) => s.toLowerCase()),
);

const WORK_TYPES = new Set(["remote", "onsite", "hybrid"]);
const JUNK_DESCRIPTION_RE =
  /join for free|toggle search|flash sale|subscribe sign in|find top (early-stage )?startups|crafted by louis|explore similar companies|alleywatch|write for |no result view all|apply to contribute|share on facebook|share on twitter|on x:\s*"|don't worry, it's probably our fault|gpt-oss|other models\.?$/i;

const HEADLINE_HQ_RULES: Array<{ test: (name: string) => boolean; hq: string }> = [
  {
    test: (name) =>
      /\bseattle(?:-area|-based)?\b/i.test(name) && /startup|seattle[’']s/i.test(name),
    hq: "Seattle, WA",
  },
  {
    test: (name) => /^portland\b/i.test(name) || /\bportland\s+[\w]+\s+startup\b/i.test(name),
    hq: "Portland, OR",
  },
];

const BASED_IN_CITY_HQ: Record<string, string> = {
  seattle: "Seattle, WA",
  "seattle region": "Seattle, WA",
  "seattle area": "Seattle, WA",
  "new york": "New York, NY",
  "new york city": "New York, NY",
  nyc: "New York, NY",
  london: "London, UK",
  dubai: "Dubai, UAE",
  "san francisco": "San Francisco, CA",
  "palo alto": "Palo Alto, CA",
  "los angeles": "Los Angeles, CA",
  austin: "Austin, TX",
  boston: "Boston, MA",
  chicago: "Chicago, IL",
  "redondo beach": "Redondo Beach, CA",
};

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/gi, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function trimPara(value: string | null | undefined): string {
  return decodeHtmlEntities((value ?? "").replace(/\s+/g, " ").trim());
}

function isHeadcountLine(value: string): boolean {
  return /^\d[\d,.\s–-]*$/.test(value) || /^\d+\s*[–-]\s*\d+$/.test(value);
}

function isRoundLine(value: string): boolean {
  return /^\$/.test(value) || /\b(pre-?seed|seed|series\s*[a-z]|venture|bootstrapped)\b/i.test(value);
}

export function isPlausibleFundingHq(raw: string | null | undefined): boolean {
  const t = trimPara(raw);
  if (!t || t.length > 80 || t.includes("·") || /https?:/i.test(t)) return false;
  if (/\b(raises?|startup|toggle|subscribe|backed by)\b/i.test(t)) return false;
  if (!/^[\p{L}0-9 .'-]+,\s*[\p{L}0-9 .'-]+$/u.test(t)) return false;
  return Boolean(normalizeHqDisplayLine(t));
}

export function sanitizeFundingHq(raw: string | null | undefined): string | null {
  if (!isPlausibleFundingHq(raw)) return null;
  return normalizeHqDisplayLine(raw);
}

export function isUsableCompanyDescription(raw: string | null | undefined): boolean {
  const t = trimPara(raw);
  if (t.length < 40 || t.length > 900) return false;
  if (JUNK_DESCRIPTION_RE.test(t)) return false;
  if (/^[^.!?\n]{0,90}\braises?\s+\$/i.test(t)) return false;
  if (t.includes("·")) return false;
  return true;
}

export function sanitizeCompanyDescription(raw: string | null | undefined): string | null {
  const t = trimPara(raw);
  if (!isUsableCompanyDescription(t)) return null;
  return t.slice(0, 600);
}

export function inferHqFromFundingCopy(
  companyName: string | null | undefined,
  extra?: string | null,
): string | null {
  const name = trimPara(companyName);
  for (const rule of HEADLINE_HQ_RULES) {
    if (name && rule.test(name)) return rule.hq;
  }
  const blob = `${name} ${trimPara(extra)}`.trim();
  const based = blob.match(/\b(?:based|headquartered)\s+in\s+(?:the\s+)?([^.\n;:]{2,48})/i);
  if (!based?.[1]) return null;
  const phrase = based[1].replace(/\s+/g, " ").trim().replace(/[,.]+$/, "");
  const mapped = BASED_IN_CITY_HQ[phrase.toLowerCase()];
  if (mapped) return mapped;
  return sanitizeFundingHq(phrase);
}

export function gallerySlugFromUrl(url: string | null | undefined): string | null {
  const slug = url?.match(/startups\.gallery\/companies\/([^/?#]+)/i)?.[1];
  return slug ? decodeURIComponent(slug).trim().toLowerCase() : null;
}

function pickIndustry(paras: string[]): string | null {
  for (const para of paras) {
    const key = para.toLowerCase();
    if (GALLERY_INDUSTRIES.has(key)) return para;
  }
  return null;
}

function pickHq(paras: string[]): string | null {
  for (const para of paras) {
    const hq = sanitizeFundingHq(para);
    if (hq) return hq;
  }
  return null;
}

function pickDescription(entry: GalleryCompanyIndexEntry, paras: string[]): string | null {
  const fromParas = paras.find((para) => {
    if (WORK_TYPES.has(para.toLowerCase()) || isHeadcountLine(para) || isRoundLine(para)) return false;
    if (GALLERY_INDUSTRIES.has(para.toLowerCase())) return false;
    if (sanitizeFundingHq(para)) return false;
    return isUsableCompanyDescription(para);
  });
  if (fromParas) return sanitizeCompanyDescription(fromParas);

  const tagline = paras.find((para) => {
    if (para.length < 24 || para.length > 90) return false;
    if (WORK_TYPES.has(para.toLowerCase()) || isHeadcountLine(para) || isRoundLine(para)) return false;
    if (GALLERY_INDUSTRIES.has(para.toLowerCase()) || sanitizeFundingHq(para)) return false;
    if (/^(visit website|view jobs|backed by|join for free)$/i.test(para)) return false;
    return true;
  });
  return tagline ?? sanitizeCompanyDescription(entry.description);
}

export function pickGalleryCompanyProfile(entry: GalleryCompanyIndexEntry | null | undefined): GalleryCompanyProfile {
  const paras = (entry?.p ?? []).map(trimPara).filter(Boolean);
  const similarIdx = paras.findIndex((para) => /explore similar companies/i.test(para));
  const scoped = (similarIdx >= 0 ? paras.slice(0, similarIdx) : paras).slice(0, 18);
  return {
    sector: pickIndustry(scoped),
    hqLine: pickHq(scoped),
    description: pickDescription(entry ?? {}, scoped),
  };
}

export function mergeGalleryCompanyProfile(
  current: GalleryCompanyProfile,
  next: GalleryCompanyProfile,
): GalleryCompanyProfile {
  return {
    sector: current.sector ?? next.sector,
    hqLine: current.hqLine ?? next.hqLine,
    description: current.description ?? next.description,
  };
}

export function galleryProfileIsIncomplete(profile: GalleryCompanyProfile): boolean {
  return !profile.sector || !profile.hqLine || !profile.description;
}

export function galleryCompanyPageSlugs(companyName: string, slugHint?: string | null): string[] {
  const slugs: string[] = [];
  const add = (raw: string | null | undefined) => {
    const slug = raw
      ?.trim()
      .toLowerCase()
      .replace(/^\/+|\/+$/g, "")
      .replace(/^companies\//, "")
      .replace(/[?#].*$/, "");
    if (slug && !slugs.includes(slug)) slugs.push(slug);
  };
  add(slugHint);
  const key = slugifyGalleryCompanyKey(companyName);
  if (key) {
    add(key);
    add(`${key}-ai`);
  }
  return slugs;
}

export function isGalleryCompanyNotFoundPage(html: string): boolean {
  return /<title>\s*Page not found/i.test(html) || /Don't worry, it's probably our fault/i.test(html);
}

export function galleryHtmlCompanyTitle(html: string): string | null {
  const raw = html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? "";
  const title = trimPara(raw.replace(/\s*\|.*$/, ""));
  if (!title || /page not found/i.test(title)) return null;
  return title;
}

export function galleryHtmlMatchesCompany(html: string, companyName: string): boolean {
  if (!html || isGalleryCompanyNotFoundPage(html)) return false;
  const title = galleryHtmlCompanyTitle(html);
  if (!title) return false;
  const a = slugifyGalleryCompanyKey(title);
  const b = slugifyGalleryCompanyKey(companyName);
  if (!a || !b) return false;
  return a === b || a.startsWith(`${b}-`) || b.startsWith(`${a}-`);
}

export function galleryParagraphsFromHtml(html: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<p[^>]*class="[^"]*framer-text[^"]*"[^>]*>([\s\S]*?)<\/p>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    const para = stripTags(match[1] ?? "");
    if (!para || seen.has(para)) continue;
    seen.add(para);
    out.push(para);
  }
  return out;
}

export function pickGalleryCompanyProfileFromHtml(html: string): GalleryCompanyProfile {
  if (!html || isGalleryCompanyNotFoundPage(html)) {
    return { sector: null, hqLine: null, description: null };
  }
  return pickGalleryCompanyProfile({ p: galleryParagraphsFromHtml(html) });
}

export function slugifyGalleryCompanyKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

export function findGalleryCompanyEntry<T extends { entry: GalleryCompanyIndexEntry; path?: string }>(
  companies: Map<string, T>,
  companyName: string,
  slugHint?: string | null,
): T | null {
  const hint = slugHint?.trim().toLowerCase();
  if (hint && companies.has(hint)) return companies.get(hint) ?? null;

  const key = slugifyGalleryCompanyKey(companyName);
  if (key && companies.has(key)) return companies.get(key) ?? null;

  const nameLc = companyName.trim().toLowerCase();
  for (const row of companies.values()) {
    const h1 = row.entry.h1?.[0]?.trim().toLowerCase();
    if (h1 && h1 === nameLc) return row;
  }

  if (key) {
    const prefixed = [...companies.entries()].filter(
      ([slug]) => slug === key || slug.startsWith(`${key}-`) || key.startsWith(`${slug}-`),
    );
    if (prefixed.length === 1) return prefixed[0]![1];
  }
  return null;
}
