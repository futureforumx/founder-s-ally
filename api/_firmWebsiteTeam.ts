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
// Unicode letters for names like "Peter Hébert", "José García"
const NAME_ONE_RE = /\b([A-Z][\p{L}\p{M}]+(?:\s+[A-Z][\p{L}\p{M}.'-]+){1,4}(?:,\s*(?:PhD|MD|MBA|JD|CPA|CFA))?)\b/u;
const NAME_RE = new RegExp(NAME_ONE_RE.source, "gu");


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

/** LinkedIn `/in/{slug}` in anchor hrefs — used as a fallback team size when card parsing finds nobody. */
const LINKEDIN_IN_HREF_RE = /href=["'][^"']*linkedin\.com\/in\/([^/"'?#\s]+)/gi;

const LINKEDIN_IN_SLUG_BLOCKLIST =
  /^(share|feed|jobs|learning|public-profile|oauth|sales|help|posts|recent-activity|mynetwork|settings|uas|cap|me|notifications|checkpoint|start|signup|login|premium|talent|recommendations|edit)$/i;

/** Any `linkedin.com/in/{slug}` in HTML (href, JSON-in-script, data attributes). */
const LINKEDIN_IN_LOOSE_RE = /linkedin\.com\/in\/([^/"'?#\s<>]+)/gi;

function addLinkedInInSlugsFromHtml(html: string, into: Set<string>): void {
  for (const re of [LINKEDIN_IN_HREF_RE, LINKEDIN_IN_LOOSE_RE]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const slug = (m[1] ?? "").trim().toLowerCase();
      if (slug.length < 3 || LINKEDIN_IN_SLUG_BLOCKLIST.test(slug)) continue;
      into.add(slug);
    }
  }
}

function linkedInSlugFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = String(url).match(/linkedin\.com\/in\/([^/?#"'\s]+)/i);
  const s = m?.[1]?.trim().toLowerCase();
  return s && s.length >= 3 ? s : null;
}

function normalizeLinkedInProfileUrl(raw: string): string | null {
  try {
    const u = new URL(raw, "https://www.linkedin.com");
    if (!/\/in\//i.test(u.pathname)) return null;
    if (/\/in\/company\//i.test(u.pathname)) return null;
    u.hash = "";
    u.search = "";
    const parts = u.pathname.split("/").filter(Boolean);
    const inIdx = parts.indexOf("in");
    if (inIdx < 0 || !parts[inIdx + 1]) return null;
    const slug = parts[inIdx + 1];
    if (LINKEDIN_IN_SLUG_BLOCKLIST.test(slug.toLowerCase())) return null;
    return `https://www.linkedin.com/in/${slug}/`;
  } catch {
    return null;
  }
}

// Words that appear in VC firm names but not in person names
const ORG_WORD_RE = /\b(capital|ventures|venture|fund|funds|management|investments|holdings|advisors|advisory|partnership|associates|technologies|technology|labs|innovation|foundation|trust|kleiner|perkins|caufield|accel|andreessen|horowitz)\b/i;
// Words that signal navigational / descriptive context, not a person
const NON_NAME_CONTEXT_RE = /\b(since|early\s+at|formerly|portfolio|our\s+team|meet\s+the|partnered)\b/i;
const NON_PERSON_NAME_RE =
  /\b(view\s+all|read\s+more|learn\s+more|sign\s+up|subscribe|contact\s+us|get\s+started|privacy|terms|cookie|newsletter|featured|latest|press|media|resources|blog|podcast|events)\b/i;

function isLikelyPersonName(name: string): boolean {
  if (name.length < 5 || name.length > 60) return false;
  // Reject UI / nav phrases
  if (/\b(cookie|privacy|terms|contact|team|about|linkedin|twitter|x\.com)\b/i.test(name)) return false;
  if (NON_PERSON_NAME_RE.test(name)) return false;
  // Reject org-style names
  if (ORG_WORD_RE.test(name)) return false;
  // Reject names with contextual non-person words
  if (NON_NAME_CONTEXT_RE.test(name)) return false;
  const cleaned = name.replace(/,\s*(PhD|MD|MBA|JD|CPA|CFA)\s*$/i, "").trim();
  const wordCount = cleaned.split(/\s+/).filter(Boolean).length;
  return wordCount >= 2 && wordCount <= 5;
}

// Prefer names inside headings — Webflow / marketing sites use h1–h6
const HEADING_TAG_RE = /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi;

const IMG_ALT_NAME_CANDIDATE_RE = /<img[^>]+alt=["']([^"']{4,100})["'][^>]*>/gi;
const DATA_PERSON_NAME_RE =
  /(?:data-full-name|data-person-name|data-team-member-name|data-member-name|data-name)=["']([^"']{4,100})["']/gi;
const BOLD_NAME_CANDIDATE_RE = /<(?:strong|b)(?:\s[^>]*)?>([^<]{4,100})<\/(?:strong|b)>/gi;

function chooseName(html: string, text: string): string | null {
  // 1. Try heading tags first — team pages put the person's name in <h2>–<h5>
  let m: RegExpExecArray | null;
  while ((m = HEADING_TAG_RE.exec(html)) !== null) {
    const inner = stripTags(m[1] ?? "").trim();
    if (isLikelyPersonName(inner)) return inner;
    // heading may have multiple words — check NAME_RE within it
    const nameMatch = inner.match(NAME_ONE_RE);
    if (nameMatch?.[1] && isLikelyPersonName(nameMatch[1])) return nameMatch[1];
  }
  HEADING_TAG_RE.lastIndex = 0;

  // 2. Portrait / headshot alt text (very common on team grids)
  while ((m = IMG_ALT_NAME_CANDIDATE_RE.exec(html)) !== null) {
    const inner = stripTags(m[1] ?? "").trim();
    if (isLikelyPersonName(inner)) return inner;
    const nameMatch = inner.match(NAME_ONE_RE);
    if (nameMatch?.[1] && isLikelyPersonName(nameMatch[1])) return nameMatch[1];
  }
  IMG_ALT_NAME_CANDIDATE_RE.lastIndex = 0;

  // 3. data-* names from Webflow / headless builds
  while ((m = DATA_PERSON_NAME_RE.exec(html)) !== null) {
    const inner = stripTags(m[1] ?? "").trim();
    if (isLikelyPersonName(inner)) return inner;
  }
  DATA_PERSON_NAME_RE.lastIndex = 0;

  // 4. First prominent bold line in card (name above title)
  while ((m = BOLD_NAME_CANDIDATE_RE.exec(html)) !== null) {
    const inner = stripTags(m[1] ?? "").trim();
    if (isLikelyPersonName(inner)) return inner;
    const nameMatch = inner.match(NAME_ONE_RE);
    if (nameMatch?.[1] && isLikelyPersonName(nameMatch[1])) return nameMatch[1];
  }
  BOLD_NAME_CANDIDATE_RE.lastIndex = 0;

  // 5. Fall back to pattern matching in plain text
  const matches = Array.from(text.matchAll(NAME_RE))
    .map((n) => n[1]?.trim())
    .filter((value): value is string => Boolean(value) && isLikelyPersonName(value));
  return matches[0] ?? null;
}

// Strong signals — unlikely in random nav/footer copy alone
const STRICT_TITLE_PARTS = [
  "managing partner", "general partner", "venture partner",
  "co-founder", "cofounder",
  "partner", "principal", "associate", "analyst", "scout",
  "founder", "advisor", "adviser",
  "president", "vice president", "managing director",
  "chief executive", "chief operating", "chief financial", "chief technology",
  "chief legal", "ceo", "coo", "cfo", "cto", "clo",
  "investment manager", "portfolio manager",
  "scientist in residence",
  "capital formation",
  "human resources", "people operations",
  "office manager", "executive assistant",
  "head of",
];
const STRICT_TITLE_KW_RE = new RegExp(`\\b(${STRICT_TITLE_PARTS.join("|")})\\b`, "i");

// Ops / function words — only count when there is a real person card signal (photo+name heading or LinkedIn /in/)
const OPS_TITLE_PARTS = [
  "development and operations",
  "finance",
  "accounting",
  "legal",
  "counsel",
  "compliance",
  "marketing",
  "communications",
  "operations",
  "platform",
  "events",
  "research",
  "recruiting",
  "talent",
  "scientist",
  "resident",
  "intern",
  "fellow",
  "coordinator",
];
const OPS_TITLE_KW_RE = new RegExp(`\\b(${OPS_TITLE_PARTS.join("|")})\\b`, "i");

const MAX_PERSON_BLOCK_CHARS = 12_000;

function chooseTitle(
  text: string,
  opts: { allowOpsTitle: boolean }
): string | null {
  const normalized = stripTags(text);
  const lines = normalized.split(/\s{2,}|\n+/).map((line) => line.trim()).filter(Boolean);
  const tryLines = (re: RegExp) => lines.find((line) => (re.lastIndex = 0, re.test(line)));
  const strictLine = tryLines(STRICT_TITLE_KW_RE);
  if (strictLine && strictLine.length <= 80 && strictLine.split(/\s+/).length <= 8) return strictLine;
  if (!opts.allowOpsTitle) return null;
  const opsLine = tryLines(OPS_TITLE_KW_RE);
  if (!opsLine || opsLine.length > 80 || opsLine.split(/\s+/).length > 8) return null;
  return opsLine;
}

function chooseImage(block: string, fullName: string, baseUrl: string): string | null {
  const nameIdx = block.toLowerCase().indexOf(fullName.toLowerCase());
  const images: Array<{ url: string; pos: number }> = [];
  IMG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMG_RE.exec(block)) !== null) {
    const src = match[1]?.trim();
    if (!src) continue;
    const url = normalizeMaybeUrl(src, baseUrl);
    if (!url) continue;
    if (/logo|icon|favicon|banner|bg[-_]/i.test(url)) continue;
    images.push({ url, pos: match.index });
  }
  if (images.length === 0) return null;
  // Pick the image closest to the person's name — avoids grabbing an adjacent person's photo
  if (nameIdx >= 0) {
    images.sort((a, b) => Math.abs(a.pos - nameIdx) - Math.abs(b.pos - nameIdx));
  }
  return images[0].url;
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
  HREF_RE.lastIndex = 0;
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
    normalizeMaybeUrl("/people", base.toString()) ?? "",
    normalizeMaybeUrl("/team", base.toString()) ?? "",
    normalizeMaybeUrl("/our-team", base.toString()) ?? "",
    normalizeMaybeUrl("/investment-team", base.toString()) ?? "",
    normalizeMaybeUrl("/leadership", base.toString()) ?? "",
    normalizeMaybeUrl("/bios", base.toString()) ?? "",
    normalizeMaybeUrl("/investors", base.toString()) ?? "",
    base.toString(),
    normalizeMaybeUrl("/about", base.toString()) ?? "",
    normalizeMaybeUrl("/about-us", base.toString()) ?? "",
    normalizeMaybeUrl("/partners", base.toString()) ?? "",
    normalizeMaybeUrl("/advisors", base.toString()) ?? "",
  ].filter(Boolean));

  const keywords = [
    "team", "people", "about", "partners", "investors", "leadership",
    "bios", "advisors", "principal", "who-we-are", "investment",
    "venture", "profile",
  ];
  for (const href of extractHrefs(html, base.toString())) {
    try {
      const parsed = new URL(href);
      if (normalizeHostname(parsed.hostname) !== host) continue;
      const haystack = `${parsed.pathname} ${parsed.search}`.toLowerCase();
      if (keywords.some((k) => haystack.includes(k))) candidates.add(parsed.toString());
      if (candidates.size >= 24) break;
    } catch {
      // ignore malformed hrefs
    }
  }
  return Array.from(candidates).slice(0, 16);
}

function extractBlocks(html: string): string[] {
  const blocks = html
    .split(/<\/(?:article|section|div|li|tr|figure|a)>/i)
    .map((block) => block.trim())
    .filter(Boolean);
  return blocks.length > 0 ? blocks : [html];
}

const MIN_PERSON_SCORE = 9;
/** LinkedIn + visible name heading — common Webflow/Framer team tiles; allow slightly weaker blocks. */
const MIN_PERSON_SCORE_LINKEDIN_HEADING = 7;

function hasLinkedInProfileHref(block: string): boolean {
  return /href=["'][^"']*linkedin\.com\/in\//i.test(block);
}

function hasNameInHeading(block: string): boolean {
  HEADING_TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = HEADING_TAG_RE.exec(block)) !== null) {
    const inner = stripTags(m[1] ?? "").trim();
    if (isLikelyPersonName(inner)) { HEADING_TAG_RE.lastIndex = 0; return true; }
    const nameMatch = inner.match(NAME_ONE_RE);
    if (nameMatch?.[1] && isLikelyPersonName(nameMatch[1])) { HEADING_TAG_RE.lastIndex = 0; return true; }
  }
  HEADING_TAG_RE.lastIndex = 0;
  return false;
}

function scoreBlock(block: string, text: string, allowOpsTitle: boolean): number {
  let score = 0;
  if (IMG_RE.test(block)) score += 4;
  IMG_RE.lastIndex = 0;
  if (STRICT_TITLE_KW_RE.test(text)) {
    score += 4;
  } else if (allowOpsTitle && OPS_TITLE_KW_RE.test(text)) {
    score += 3;
  }
  STRICT_TITLE_KW_RE.lastIndex = 0;
  OPS_TITLE_KW_RE.lastIndex = 0;
  // Name in a heading tag is a strong signal; plain text name is weak
  if (hasNameInHeading(block)) score += 3;
  else if (NAME_RE.test(text)) score += 1;
  NAME_RE.lastIndex = 0;
  if (hasLinkedInProfileHref(block)) score += 3;
  else if (SOCIAL_LINK_RE.test(block)) score += 2;
  SOCIAL_LINK_RE.lastIndex = 0;
  if (MAILTO_RE.test(block)) score += 6;
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

function chooseMemberWebsiteUrl(hrefs: string[], pageUrl: string): string | null {
  let baseHost: string;
  try {
    baseHost = normalizeHostname(new URL(pageUrl).hostname);
  } catch {
    return null;
  }
  for (const href of hrefs) {
    if (/linkedin\.com|twitter\.com|x\.com|mailto:/i.test(href)) continue;
    try {
      const u = new URL(href);
      if (normalizeHostname(u.hostname) !== baseHost) continue;
      const p = u.pathname.toLowerCase();
      if (/\/(people|team|person|bio)\/[^/]+\/?$/i.test(p)) return u.toString();
    } catch {
      // ignore
    }
  }
  return null;
}

function parsePersonBlock(block: string, pageUrl: string, index: number): FirmWebsiteTeamPerson | null {
  if (block.length > MAX_PERSON_BLOCK_CHARS) return null;

  const text = stripTags(block);

  const hasNameHeading = hasNameInHeading(block);
  const hasPhoto = IMG_RE.test(block);
  IMG_RE.lastIndex = 0;
  const hasMailto = MAILTO_RE.test(block);
  const hasInLinkedIn = hasLinkedInProfileHref(block);

  const allowOpsTitle = hasInLinkedIn || (hasNameHeading && hasPhoto);
  const hasStrictTitle = STRICT_TITLE_KW_RE.test(text);
  STRICT_TITLE_KW_RE.lastIndex = 0;
  const hasOpsTitle = OPS_TITLE_KW_RE.test(text);
  OPS_TITLE_KW_RE.lastIndex = 0;
  const hasTitleSignal = hasStrictTitle || (hasOpsTitle && allowOpsTitle);

  // Real person card: strict role line, ops role only on tiles / LinkedIn /in/, or direct contact
  if (!hasTitleSignal && !hasMailto && !hasInLinkedIn) return null;
  // Bare mailto in footers (no name heading, no role, no LinkedIn) is almost never a person card
  if (hasMailto && !hasTitleSignal && !hasInLinkedIn && !hasNameHeading) return null;

  const minPersonScore =
    hasInLinkedIn && hasNameHeading
      ? MIN_PERSON_SCORE_LINKEDIN_HEADING
      : hasInLinkedIn
        ? MIN_PERSON_SCORE - 1
        : MIN_PERSON_SCORE;
  if (scoreBlock(block, text, allowOpsTitle) < minPersonScore) return null;

  const fullName = chooseName(block, text);
  if (!fullName || !isLikelyPersonName(fullName)) return null;

  const title = chooseTitle(text, { allowOpsTitle });
  if (!title && !hasMailto && !hasInLinkedIn) return null;

  const hrefs = extractHrefs(block, pageUrl);
  const linkedin =
    hrefs.find((href) => /linkedin\.com\/in\//i.test(href) && !/\/in\/company\//i.test(href)) ?? null;
  const x = hrefs.find((href) => /(x\.com|twitter\.com)\//i.test(href) && !/share|intent|search/i.test(href)) ?? null;
  const website = chooseMemberWebsiteUrl(hrefs, pageUrl);
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
    title,
    email,
    linkedin_url: linkedin,
    x_url: x,
    website_url: website,
    profile_image_url: chooseImage(block, fullName, pageUrl),
    bio: stripHtmlEntities(text).slice(0, 500) || null,
    location: chooseLocation(text),
    source_page_url: pageUrl,
  };
}

function linkedInProfileSlugUsed(byName: Map<string, FirmWebsiteTeamPerson>, slug: string): boolean {
  for (const p of byName.values()) {
    const s = linkedInSlugFromUrl(p.linkedin_url);
    if (s && s === slug) return true;
  }
  return false;
}

/**
 * Each LinkedIn profile link + surrounding HTML — names must come from markup (headings, img alt,
 * data-*, bold), never from URL slugs.
 */
function parseLinkedInNeighborhoodBlock(
  block: string,
  pageUrl: string,
  linkedinCanon: string,
  index: number,
): FirmWebsiteTeamPerson | null {
  if (block.length > MAX_PERSON_BLOCK_CHARS) return null;

  const text = stripTags(block);
  const hasPhoto = IMG_RE.test(block);
  IMG_RE.lastIndex = 0;
  const hasNameHeading = hasNameInHeading(block);
  const hasStrictTitle = STRICT_TITLE_KW_RE.test(text);
  STRICT_TITLE_KW_RE.lastIndex = 0;
  const hasOpsTitle = OPS_TITLE_KW_RE.test(text);
  OPS_TITLE_KW_RE.lastIndex = 0;
  const hasTitleLine = hasStrictTitle || hasOpsTitle;
  if (!hasTitleLine && !hasNameHeading && !hasPhoto) return null;

  const fullName = chooseName(block, text);
  if (!fullName || !isLikelyPersonName(fullName)) return null;

  const allowOpsTitle = true;
  const title = chooseTitle(text, { allowOpsTitle });
  if (!title && !hasPhoto && !hasNameHeading) return null;

  const hrefs = extractHrefs(block, pageUrl);
  const linkedin =
    hrefs.find((href) => /linkedin\.com\/in\//i.test(href) && !/\/in\/company\//i.test(href)) ?? linkedinCanon;
  const x = hrefs.find((href) => /(x\.com|twitter\.com)\//i.test(href) && !/share|intent|search/i.test(href)) ?? null;
  const website = chooseMemberWebsiteUrl(hrefs, pageUrl);
  const email =
    hrefs
      .find((href) => href.toLowerCase().startsWith("mailto:"))
      ?.replace(/^mailto:/i, "")
      .split("?")[0]
      ?.trim() ??
    null;

  return {
    id: `website-n-${normalizeNameKey(fullName)}-${index}`,
    full_name: fullName,
    title,
    email,
    linkedin_url: linkedin,
    x_url: x,
    website_url: website,
    profile_image_url: chooseImage(block, fullName, pageUrl),
    bio: stripHtmlEntities(text).slice(0, 500) || null,
    location: chooseLocation(text),
    source_page_url: pageUrl,
  };
}

const LINKEDIN_IN_PAGE_ANCHOR_RE = /href=["'](https?:\/\/[^"']*linkedin\.com\/in\/[^"']+)["']/gi;

function ingestLinkedInNeighborhoodPeople(
  html: string,
  pageUrl: string,
  byName: Map<string, FirmWebsiteTeamPerson>,
  seq: { value: number },
): void {
  const seenOnPage = new Set<string>();
  LINKEDIN_IN_PAGE_ANCHOR_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINKEDIN_IN_PAGE_ANCHOR_RE.exec(html)) !== null) {
    const raw = m[1];
    const canon = normalizeLinkedInProfileUrl(raw);
    if (!canon) continue;
    const slug = linkedInSlugFromUrl(canon);
    if (!slug || seenOnPage.has(slug) || linkedInProfileSlugUsed(byName, slug)) continue;
    seenOnPage.add(slug);
    const idx = m.index ?? 0;
    const block = html.slice(Math.max(0, idx - 3000), Math.min(html.length, idx + 800));
    const person = parseLinkedInNeighborhoodBlock(block, pageUrl, canon, seq.value++);
    if (!person) continue;
    const key = normalizeNameKey(person.full_name);
    const existing = byName.get(key);
    if (existing) {
      byName.set(key, {
        ...(existing ?? person),
        ...person,
        title: person.title ?? existing.title ?? null,
        email: person.email ?? existing.email ?? null,
        linkedin_url: person.linkedin_url ?? existing.linkedin_url ?? null,
        x_url: person.x_url ?? existing.x_url ?? null,
        website_url: person.website_url ?? existing.website_url ?? null,
        profile_image_url: person.profile_image_url ?? existing.profile_image_url ?? null,
        bio: person.bio ?? existing.bio ?? null,
        location: person.location ?? existing.location ?? null,
      });
    } else {
      byName.set(key, person);
    }
  }
}

export type FirmWebsiteTeamResult = {
  people: FirmWebsiteTeamPerson[];
  /** Unique LinkedIn `/in/{slug}` links seen on crawled pages — fallback headcount when `people` is empty. */
  teamMemberEstimate: number;
};

export async function resolveFirmWebsiteTeam(websiteUrl: string): Promise<FirmWebsiteTeamResult> {
  const normalized = normalizeWebsiteUrl(websiteUrl);
  if (!normalized) return { people: [], teamMemberEstimate: 0 };

  const homepageHtml = await fetchHtml(normalized);
  if (!homepageHtml) return { people: [], teamMemberEstimate: 0 };

  const pages = collectCandidatePages(normalized, homepageHtml);
  const byName = new Map<string, FirmWebsiteTeamPerson>();
  const linkedInSlugs = new Set<string>();
  const personSeq = { value: 0 };

  for (const pageUrl of pages) {
    const html = pageUrl === normalized ? homepageHtml : await fetchHtml(pageUrl);
    if (!html) continue;
    addLinkedInInSlugsFromHtml(html, linkedInSlugs);

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

    ingestLinkedInNeighborhoodPeople(html, pageUrl, byName, personSeq);
  }

  return {
    people: Array.from(byName.values()),
    teamMemberEstimate: linkedInSlugs.size,
  };
}
