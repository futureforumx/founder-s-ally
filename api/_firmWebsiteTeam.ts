export type FirmWebsiteTeamPerson = {
  id: string;
  full_name: string;
  title: string | null;
  email: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  website_url: string | null;
  profile_image_url: string | null;
  bio: string | null;
  location: string | null;
  source_page_url: string;
};

const REQUEST_HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; VEKTAFirmTeamResolver/1.0; +https://vekta.app)",
  accept: "text/html,application/xhtml+xml",
};

const HREF_RE = /href=["']([^"'#]+)["']/gi;
const IMG_RE = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
const SOCIAL_LINK_RE = /href=["']([^"']*(?:linkedin\.com|x\.com|twitter\.com)[^"']*)["']/gi;
const MAILTO_RE = /mailto:([^"'? ]+)/i;
const NAME_RE = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z.'-]+){1,3})\b/g;

const TITLE_KEYWORDS = [
  "partner",
  "principal",
  "associate",
  "analyst",
  "venture partner",
  "managing partner",
  "general partner",
  "founder",
  "co-founder",
  "operator",
  "advisor",
  "investor",
  "president",
  "vice president",
] as const;

function normalizeWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    return new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`).toString();
  } catch {
    return null;
  }
}

function normalizeHostname(hostname: string): string {
  return hostname.replace(/^www\./i, "").toLowerCase();
}

function normalizeMaybeUrl(raw: string, baseUrl?: string): string | null {
  try {
    if (/^https?:\/\//i.test(raw)) return new URL(raw).toString();
    if (!baseUrl) return null;
    return new URL(raw, baseUrl).toString();
  } catch {
    return null;
  }
}

function stripTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNameKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isLikelyPersonName(name: string): boolean {
  if (name.length < 5 || name.length > 60) return false;
  if (/\b(cookie|privacy|terms|contact|team|about|linkedin|twitter|x\.com)\b/i.test(name)) return false;
  return name.split(/\s+/).length >= 2;
}

function chooseName(text: string): string | null {
  const matches = Array.from(text.matchAll(NAME_RE))
    .map((m) => m[1]?.trim())
    .filter((value): value is string => Boolean(value) && isLikelyPersonName(value));
  if (matches.length === 0) return null;
  return matches[0] ?? null;
}

function chooseTitle(text: string): string | null {
  const normalized = stripTags(text);
  const lines = normalized.split(/\s{2,}|\n+/).map((line) => line.trim()).filter(Boolean);
  const candidate = lines.find((line) =>
    TITLE_KEYWORDS.some((keyword) => line.toLowerCase().includes(keyword)),
  );
  return candidate && candidate.length <= 100 ? candidate : null;
}

function chooseImage(snippet: string, baseUrl: string): string | null {
  let match: RegExpExecArray | null;
  while ((match = IMG_RE.exec(snippet)) !== null) {
    const src = match[1]?.trim();
    if (!src) continue;
    const url = normalizeMaybeUrl(src, baseUrl);
    if (!url) continue;
    if (/logo|icon|favicon/i.test(url)) continue;
    return url;
  }
  return null;
}

function chooseLocation(text: string): string | null {
  const cleaned = stripTags(text);
  const match = cleaned.match(/\b([A-Z][A-Za-z .'-]+,\s*[A-Z]{2})(?:\b|,)/);
  return match?.[1]?.trim() ?? null;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: REQUEST_HEADERS, redirect: "follow" });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractHrefs(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = HREF_RE.exec(html)) !== null) {
    const href = match[1]?.trim();
    if (!href) continue;
    const absolute = normalizeMaybeUrl(href, baseUrl);
    if (absolute) urls.push(absolute);
  }
  return Array.from(new Set(urls));
}

function collectCandidatePages(baseUrl: string, html: string): string[] {
  const base = new URL(baseUrl);
  const host = normalizeHostname(base.hostname);
  const candidates = new Set<string>([
    base.toString(),
    normalizeMaybeUrl("/team", base.toString()) ?? "",
    normalizeMaybeUrl("/people", base.toString()) ?? "",
    normalizeMaybeUrl("/about", base.toString()) ?? "",
    normalizeMaybeUrl("/partners", base.toString()) ?? "",
  ].filter(Boolean));

  const keywords = ["team", "people", "about", "partners", "investors", "leadership"];
  for (const href of extractHrefs(html, base.toString())) {
    try {
      const parsed = new URL(href);
      if (normalizeHostname(parsed.hostname) !== host) continue;
      const haystack = `${parsed.pathname} ${parsed.search}`.toLowerCase();
      if (keywords.some((k) => haystack.includes(k))) candidates.add(parsed.toString());
      if (candidates.size >= 8) break;
    } catch {
      // ignore malformed hrefs
    }
  }
  return Array.from(candidates).slice(0, 8);
}

function extractBlocks(html: string): string[] {
  const blocks = html
    .split(/<\/(?:article|section|div|li|tr|figure)>/i)
    .map((block) => block.trim())
    .filter(Boolean);
  return blocks.length > 0 ? blocks : [html];
}

const MIN_PERSON_SCORE = 6;

function scoreBlock(block: string, text: string): number {
  let score = 0;
  if (IMG_RE.test(block)) score += 4;
  IMG_RE.lastIndex = 0;
  if (TITLE_KEYWORDS.some((kw) => text.toLowerCase().includes(kw))) score += 4;
  if (NAME_RE.test(text)) score += 3;
  NAME_RE.lastIndex = 0;
  if (SOCIAL_LINK_RE.test(block)) score += 2;
  SOCIAL_LINK_RE.lastIndex = 0;
  return score;
}

function stripHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePersonBlock(block: string, pageUrl: string, index: number): FirmWebsiteTeamPerson | null {
  const text = stripTags(block);
  if (scoreBlock(block, text) < MIN_PERSON_SCORE) return null;

  const fullName = chooseName(text);
  if (!fullName) return null;

  const hrefs = extractHrefs(block, pageUrl);
  const linkedin = hrefs.find((href) => /linkedin\.com\/(in|company)\//i.test(href)) ?? null;
  const x = hrefs.find((href) => /(x\.com|twitter\.com)\//i.test(href) && !/share|intent|search/i.test(href)) ?? null;
  const website = hrefs.find((href) => !/(linkedin\.com|x\.com|twitter\.com|mailto:)/i.test(href)) ?? null;
  const email =
    hrefs
      .find((href) => href.toLowerCase().startsWith("mailto:"))
      ?.replace(/^mailto:/i, "")
      .split("?")[0]
      ?.trim() ??
    null;

  return {
    id: `website-${normalizeNameKey(fullName)}-${index}`,
    full_name: fullName,
    title: chooseTitle(text),
    email,
    linkedin_url: linkedin,
    x_url: x,
    website_url: website,
    profile_image_url: chooseImage(block, pageUrl),
    bio: stripHtmlEntities(text).slice(0, 500) || null,
    location: chooseLocation(text),
    source_page_url: pageUrl,
  };
}

export async function resolveFirmWebsiteTeam(websiteUrl: string): Promise<FirmWebsiteTeamPerson[]> {
  const normalized = normalizeWebsiteUrl(websiteUrl);
  if (!normalized) return [];

  const homepageHtml = await fetchHtml(normalized);
  if (!homepageHtml) return [];

  const pages = collectCandidatePages(normalized, homepageHtml);
  const byName = new Map<string, FirmWebsiteTeamPerson>();

  for (const pageUrl of pages) {
    const html = pageUrl === normalized ? homepageHtml : await fetchHtml(pageUrl);
    if (!html) continue;

    const blocks = extractBlocks(html);
    blocks.forEach((block, index) => {
      const person = parsePersonBlock(block, pageUrl, index);
      if (!person) return;
      const key = normalizeNameKey(person.full_name);
      const existing = byName.get(key);
      byName.set(key, {
        ...(existing ?? person),
        ...person,
        title: person.title ?? existing?.title ?? null,
        email: person.email ?? existing?.email ?? null,
        linkedin_url: person.linkedin_url ?? existing?.linkedin_url ?? null,
        x_url: person.x_url ?? existing?.x_url ?? null,
        website_url: person.website_url ?? existing?.website_url ?? null,
        profile_image_url: person.profile_image_url ?? existing?.profile_image_url ?? null,
        bio: person.bio ?? existing?.bio ?? null,
        location: person.location ?? existing?.location ?? null,
      });
    });
  }

  return Array.from(byName.values());
}
