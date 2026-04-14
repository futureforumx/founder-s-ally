import { mirrorWebsiteTeamHeadshotsToR2 } from "./_r2MirrorWebsiteHeadshot.js";
import { createClient } from "@supabase/supabase-js";

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
const IMG_OPEN_TAG_RE = /<img\b([^>]*)\/?>/gi;
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

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function splitNameParts(fullName: string): { first: string | null; last: string | null } {
  const parts = safeTrim(fullName).split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function pickIncomingString(current: unknown, incoming: string | null | undefined): string | undefined {
  const next = safeTrim(incoming);
  if (!next) return undefined;
  const prev = safeTrim(current);
  if (!prev) return next;
  return prev === next ? undefined : next;
}

async function persistWebsiteTeamToFirmInvestors(websiteUrl: string, people: FirmWebsiteTeamPerson[]): Promise<void> {
  if (!people.length) return;
  const admin = supabaseAdmin();
  if (!admin) return;

  let host = "";
  try {
    host = normalizeHostname(new URL(websiteUrl).hostname);
  } catch {
    return;
  }
  if (!host) return;

  const { data: candidateFirms } = await admin
    .from("firm_records")
    .select("id, website_url")
    .is("deleted_at", null)
    .ilike("website_url", `%${host}%`)
    .limit(8);
  if (!candidateFirms?.length) return;

  let firmRecordId: string | null = null;
  for (const row of candidateFirms) {
    const w = safeTrim((row as Record<string, unknown>).website_url);
    if (!w) continue;
    try {
      const rowHost = normalizeHostname(new URL(w.includes("://") ? w : `https://${w}`).hostname);
      if (rowHost === host) {
        firmRecordId = String((row as Record<string, unknown>).id);
        break;
      }
    } catch {
      /* ignore malformed website_url */
    }
  }
  if (!firmRecordId) return;

  const { data: investors } = await admin
    .from("firm_investors")
    .select("id, full_name, title, email, linkedin_url, x_url, bio, background_summary, avatar_url")
    .eq("firm_id", firmRecordId)
    .is("deleted_at", null)
    .limit(1000);

  const byName = new Map<string, Record<string, unknown>>();
  for (const inv of (investors ?? []) as Record<string, unknown>[]) {
    const key = normalizeNameKey(safeTrim(inv.full_name));
    if (key) byName.set(key, inv);
  }

  const updates: Array<Promise<unknown>> = [];
  for (const p of people) {
    const key = normalizeNameKey(safeTrim(p.full_name));
    if (!key) continue;
    const inv = byName.get(key);
    if (inv) {
      const patch: Record<string, unknown> = {};
      const maybeTitle = pickIncomingString(inv.title, p.title);
      if (maybeTitle) patch.title = maybeTitle;
      const maybeEmail = pickIncomingString(inv.email, p.email);
      if (maybeEmail) patch.email = maybeEmail;
      const maybeLinkedIn = pickIncomingString(inv.linkedin_url, p.linkedin_url);
      if (maybeLinkedIn) patch.linkedin_url = maybeLinkedIn;
      const maybeX = pickIncomingString(inv.x_url, p.x_url);
      if (maybeX) patch.x_url = maybeX;
      const maybeBackground = pickIncomingString(inv.background_summary, p.bio);
      if (maybeBackground) patch.background_summary = maybeBackground;
      const maybeBio = pickIncomingString(inv.bio, p.bio);
      if (maybeBio) patch.bio = maybeBio;
      const maybeAvatar = pickIncomingString(inv.avatar_url, p.profile_image_url);
      if (maybeAvatar) patch.avatar_url = maybeAvatar;
      if (!Object.keys(patch).length) continue;
      updates.push(admin.from("firm_investors").update(patch).eq("id", String(inv.id)));
      continue;
    }

    const { first, last } = splitNameParts(p.full_name);
    const insertRow: Record<string, unknown> = {
      firm_id: firmRecordId,
      full_name: p.full_name,
      first_name: first,
      last_name: last,
      title: safeTrim(p.title) || null,
      email: safeTrim(p.email) || null,
      linkedin_url: safeTrim(p.linkedin_url) || null,
      x_url: safeTrim(p.x_url) || null,
      website_url: safeTrim(p.website_url) || null,
      background_summary: safeTrim(p.bio) || null,
      bio: safeTrim(p.bio) || null,
      avatar_url: safeTrim(p.profile_image_url) || null,
      is_active: true,
      ready_for_live: true,
    };
    updates.push(admin.from("firm_investors").insert(insertRow));
  }

  if (updates.length) {
    await Promise.allSettled(updates);
  }
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
  "managing partner", "general partner", "venture partner", "investing partner",
  "co-founder", "cofounder",
  "partner", "principal",   "associate", "senior associate", "analyst", "scout",
  "investor",
  "founder", "advisor", "adviser",
  "president", "vice president", "managing director",
  "chief executive", "chief operating", "chief financial", "chief technology",
  "chief legal", "ceo", "coo", "cfo", "cto", "clo",
  "investment manager", "portfolio manager",
  "scientist in residence",
  "entrepreneur in residence", "eir",
  "capital formation",
  "human resources", "people operations",
  "office manager", "executive assistant",
  "head of",
  "board member", "board observer",
];
const STRICT_TITLE_KW_RE = new RegExp(`\\b(${STRICT_TITLE_PARTS.join("|")})\\b`, "i");

// Ops / function words — only count when there is a real person card signal (photo+name heading or LinkedIn /in/)
const OPS_TITLE_PARTS = [
  "portfolio",
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
/** Elementor `loop-item` team tiles can include very deep DOM trees (still one logical card). */
const MAX_ELEMENTOR_LOOP_ITEM_CHARS = 200_000;

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

/** Elementor roster tiles: person name in `<h3 class="elementor-heading-title">`, role line in following `<h2>`. */
function elementorTeamCardRoleLine(block: string): string | null {
  if (!/elementor-heading-title/i.test(block)) return null;
  if (!/\b(data-vekta-elementor-loop-card|e-loop-item|type-team\b|post-\d+\s+team\b)/i.test(block)) {
    return null;
  }
  const m = block.match(
    /<h3[^>]*elementor-heading-title[^>]*>([^<]+)<\/h3>[\s\S]{0,8000}?<h2[^>]*elementor-heading-title[^>]*>([^<]+)<\/h2>/i,
  );
  if (!m?.[1] || !m?.[2]) return null;
  const name = stripTags(m[1]).trim();
  const role = stripHtmlEntities(m[2]).trim();
  if (!isLikelyPersonName(name) || role.length < 2 || role.length > 80) return null;
  return role;
}

function attrValue(attrs: string, attr: string): string | null {
  const re = new RegExp(`\\b${attr}=["']([^"']*)["']`, "i");
  return attrs.match(re)?.[1]?.trim() ?? null;
}

function isJunkOrPlaceholderImageUrl(url: string): boolean {
  return (
    /^data:image\//i.test(url) ||
    /logo|icon|favicon|banner|bg[-_]|spacer|1x1|blank\.gif|pixel\.gif|placeholder|loading\.svg/i.test(url)
  );
}

/** Prefer largest `640w`-style candidate from a srcset string. */
function bestUrlFromSrcset(srcset: string | null, baseUrl: string): string | null {
  if (!srcset) return null;
  let best: { url: string; w: number } | null = null;
  for (const part of srcset.split(",")) {
    const bits = part.trim().split(/\s+/).filter(Boolean);
    if (!bits.length) continue;
    const raw = bits[0];
    const url = normalizeMaybeUrl(raw, baseUrl);
    if (!url || isJunkOrPlaceholderImageUrl(url)) continue;
    const wMatch = bits[1]?.toLowerCase().match(/^(\d+)w$/);
    const w = wMatch ? parseInt(wMatch[1], 10) : 0;
    if (!best || w > best.w) best = { url, w };
  }
  return best?.url ?? null;
}

/**
 * Resolve a usable portrait URL from one `<img ...>` attribute string (lazy-load + srcset).
 */
function collectImgTagImageUrls(attrs: string, baseUrl: string): string[] {
  const src = attrValue(attrs, "src");
  const srcset = attrValue(attrs, "srcset");
  const dataSrc =
    attrValue(attrs, "data-src") ||
    attrValue(attrs, "data-lazy-src") ||
    attrValue(attrs, "data-original") ||
    attrValue(attrs, "data-image");
  const fromSet = bestUrlFromSrcset(srcset, baseUrl);
  const orderedRaw = [dataSrc, fromSet, src];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of orderedRaw) {
    if (!raw) continue;
    const url = normalizeMaybeUrl(raw, baseUrl);
    if (!url || isJunkOrPlaceholderImageUrl(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);
    out.push(url);
  }
  return out;
}

function altTextNameKey(attrs: string): string | null {
  const alt = attrValue(attrs, "alt");
  if (!alt) return null;
  const cleaned = stripTags(alt).trim();
  if (cleaned.length < 2) return null;
  return normalizeNameKey(cleaned);
}

function altMatchesPerson(altKey: string | null, personKey: string): boolean {
  if (!altKey || altKey.length < 4) return false;
  if (altKey === personKey) return true;
  if (altKey.length >= 8 && personKey.includes(altKey)) return true;
  if (altKey.length >= 8 && altKey.includes(personKey)) return true;
  return false;
}

function collectPictureSourceBestUrls(block: string, baseUrl: string): Array<{ url: string; pos: number }> {
  const out: Array<{ url: string; pos: number }> = [];
  const re = /<source\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const srcset = attrValue(m[1] ?? "", "srcset");
    const url = bestUrlFromSrcset(srcset, baseUrl);
    if (!url || isJunkOrPlaceholderImageUrl(url)) continue;
    out.push({ url, pos: m.index });
  }
  return out;
}

function chooseImage(block: string, fullName: string, baseUrl: string): string | null {
  const personKey = normalizeNameKey(fullName);
  const nameIdx = block.toLowerCase().indexOf(fullName.toLowerCase());

  type Cand = { url: string; pos: number; altKey: string | null };
  const images: Cand[] = [];

  IMG_OPEN_TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = IMG_OPEN_TAG_RE.exec(block)) !== null) {
    const attrs = m[1] ?? "";
    const pos = m.index;
    const urls = collectImgTagImageUrls(attrs, baseUrl);
    const url = urls.find((u) => !/logo|icon|favicon|banner|bg[-_]/i.test(u));
    if (!url) continue;
    images.push({ url, pos, altKey: altTextNameKey(attrs) });
  }

  for (const { url, pos } of collectPictureSourceBestUrls(block, baseUrl)) {
    if (/logo|icon|favicon|banner|bg[-_]/i.test(url)) continue;
    images.push({ url, pos, altKey: null });
  }

  if (images.length === 0) return null;

  for (const im of images) {
    if (altMatchesPerson(im.altKey, personKey)) return im.url;
  }

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

/**
 * Elementor team grids (`data-elementor-type="loop-item"`) — one card per person (~3–8k chars).
 * Splitting on `</div>` alone fragments cards; whole-section splits exceed `MAX_PERSON_BLOCK_CHARS`.
 */
function extractElementorLoopItemBlocks(html: string): string[] | null {
  if (!/\bdata-elementor-type=["']loop-item["']/i.test(html)) return null;
  const parts = html.split(/<div[^>]*\bdata-elementor-type=["']loop-item["'][^>]*>/i);
  const cards = parts
    .slice(1)
    .map((p) => p.trim())
    .filter((p) => p.length >= 400 && p.length <= MAX_ELEMENTOR_LOOP_ITEM_CHARS)
    // Opening `loop-item` wrapper is removed by `split` — tag fragments so role-line heuristics apply.
    .map((p) => `<div data-vekta-elementor-loop-card="1">${p}`);
  return cards.length >= 2 ? cards : null;
}

function extractBlocks(html: string): string[] {
  const elementorCards = extractElementorLoopItemBlocks(html);
  if (elementorCards) return elementorCards;

  const blocks = html
    .split(/<\/(?:article|section|div|li|tr|figure)>/i)
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
  if (/<img\b/i.test(block)) score += 4;
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

function sanitizeWebsitePersonBioSnippet(text: string, maxLen: number): string | null {
  const raw = stripHtmlEntities(text).slice(0, maxLen).trim();
  if (!raw) return null;
  const cleaned = raw.replace(/\bRead bio\b/gi, " ").replace(/\s{2,}/g, " ").trim();
  return cleaned.length ? cleaned.slice(0, maxLen) : null;
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
  const maxBlockChars =
    /\b(data-vekta-elementor-loop-card|e-loop-item|data-elementor-type=["']loop-item)/i.test(block)
      ? MAX_ELEMENTOR_LOOP_ITEM_CHARS
      : MAX_PERSON_BLOCK_CHARS;
  if (block.length > maxBlockChars) return null;

  const text = stripTags(block);

  const hasNameHeading = hasNameInHeading(block);
  const hasPhoto = /<img\b/i.test(block);
  const hasMailto = MAILTO_RE.test(block);
  const hasInLinkedIn = hasLinkedInProfileHref(block);

  const allowOpsTitle = hasInLinkedIn || (hasNameHeading && hasPhoto);
  const hasStrictTitle = STRICT_TITLE_KW_RE.test(text);
  STRICT_TITLE_KW_RE.lastIndex = 0;
  const hasOpsTitle = OPS_TITLE_KW_RE.test(text);
  OPS_TITLE_KW_RE.lastIndex = 0;
  const elementorRole = elementorTeamCardRoleLine(block);
  const hasTitleSignal = hasStrictTitle || (hasOpsTitle && allowOpsTitle) || Boolean(elementorRole);

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
  let blockScore = scoreBlock(block, text, allowOpsTitle);
  if (elementorRole) blockScore += 4;
  if (blockScore < minPersonScore) return null;

  const fullName = chooseName(block, text);
  if (!fullName || !isLikelyPersonName(fullName)) return null;

  const title = elementorRole ?? chooseTitle(text, { allowOpsTitle });
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
    bio: sanitizeWebsitePersonBioSnippet(text, 500),
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
  const hasPhoto = /<img\b/i.test(block);
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
    bio: sanitizeWebsitePersonBioSnippet(text, 500),
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
    const block = html.slice(Math.max(0, idx - 3600), Math.min(html.length, idx + 900));
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

const TEAM_CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const EMPTY_TEAM_CACHE_COOLDOWN_MS = 2 * 24 * 60 * 60 * 1000;

type CachedTeamRow = {
  people: unknown;
  team_member_estimate: number | null;
  fetched_at: string | null;
};

function parseCachedPeople(raw: unknown): FirmWebsiteTeamPerson[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is FirmWebsiteTeamPerson => {
    if (!p || typeof p !== "object") return false;
    const row = p as Record<string, unknown>;
    return typeof row.id === "string" && typeof row.full_name === "string" && typeof row.source_page_url === "string";
  });
}

export async function resolveFirmWebsiteTeam(
  websiteUrl: string,
  options?: { forceRefresh?: boolean },
): Promise<FirmWebsiteTeamResult> {
  const normalized = normalizeWebsiteUrl(websiteUrl);
  if (!normalized) return { people: [], teamMemberEstimate: 0 };
  const forceRefresh = options?.forceRefresh === true;
  const admin = supabaseAdmin();
  const host = normalizeHostname(new URL(normalized).hostname);

  if (admin && !forceRefresh) {
    const { data: cached, error } = await admin
      .from("firm_website_team_cache")
      .select("people, team_member_estimate, fetched_at")
      .eq("firm_website_host", host)
      .maybeSingle();
    if (!error && cached) {
      const row = cached as CachedTeamRow;
      const ageMs = row.fetched_at ? Date.now() - new Date(row.fetched_at).getTime() : Number.POSITIVE_INFINITY;
      const people = parseCachedPeople(row.people);
      const estimate = typeof row.team_member_estimate === "number" ? row.team_member_estimate : 0;
      const ttl = people.length > 0 ? TEAM_CACHE_TTL_MS : EMPTY_TEAM_CACHE_COOLDOWN_MS;
      if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < ttl) {
        return { people, teamMemberEstimate: estimate };
      }
    }
  }

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

  let people = Array.from(byName.values());
  try {
    people = await mirrorWebsiteTeamHeadshotsToR2(people, normalized);
  } catch (err) {
    console.error("[resolveFirmWebsiteTeam] R2 headshot mirror failed (returning scraped URLs):", err);
  }

  // Save website-derived people data for faster subsequent modal loads.
  try {
    await persistWebsiteTeamToFirmInvestors(normalized, people);
  } catch (err) {
    console.error("[resolveFirmWebsiteTeam] DB writeback failed (continuing with scraped payload):", err);
  }

  const out = {
    people,
    teamMemberEstimate: linkedInSlugs.size,
  };

  if (admin) {
    try {
      await admin.from("firm_website_team_cache").upsert(
        {
          firm_website_host: host,
          people,
          team_member_estimate: out.teamMemberEstimate,
          fetched_at: new Date().toISOString(),
        },
        { onConflict: "firm_website_host" },
      );
    } catch (err) {
      console.error("[resolveFirmWebsiteTeam] cache upsert failed:", err);
    }
  }

  return out;
}
