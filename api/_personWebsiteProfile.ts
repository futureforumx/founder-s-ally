type PersonWebsiteProfile = {
  headshotUrl: string | null;
  title: string | null;
  email: string | null;
  linkedinUrl: string | null;
  xUrl: string | null;
  bio: string | null;
  location: string | null;
  websiteUrl: string | null;
  profileUrl: string | null;
  sectorFocus: string[];
  portfolioCompanies: string[];
  scannedUrls: string[];
};

const REQUEST_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (compatible; VEKTAInvestorResolver/1.0; +https://vekta.app)",
  accept: "text/html,application/xhtml+xml",
};

const EMAIL_RE = /(?:mailto:)?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
const HREF_RE = /href=["']([^"'#]+)["']/gi;
const IMG_RE = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
const BLOCK_TAGS_RE = /<\/?(?:p|div|li|ul|ol|section|article|br|h[1-6]|span|strong|em|figure|figcaption)[^>]*>/gi;
const SECTION_STOP_RE = /^(email|linkedin|x|twitter|portfolio|articles|news|insights|team|people|contact|about)$/i;
const GENERIC_EMAIL_LOCAL_RE = /^(hello|info|contact|team|support|admin|media|press|privacy|legal|jobs|careers)$/i;

function emptyProfile(scannedUrls: string[] = []): PersonWebsiteProfile {
  return {
    headshotUrl: null,
    title: null,
    email: null,
    linkedinUrl: null,
    xUrl: null,
    bio: null,
    location: null,
    websiteUrl: null,
    profileUrl: null,
    sectorFocus: [],
    portfolioCompanies: [],
    scannedUrls,
  };
}

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

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(BLOCK_TAGS_RE, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim(),
  );
}

function toLines(html: string): string[] {
  return stripTags(html)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/['.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function collectCandidatePages(baseUrl: string, html: string, fullName: string): string[] {
  const base = new URL(baseUrl);
  const host = normalizeHostname(base.hostname);
  const nameSlug = slugifyName(fullName);
  const bareNameSlug = nameSlug.replace(/-/g, "");
  const candidates = new Set<string>([
    base.toString(),
    normalizeMaybeUrl("/team", base.toString()) ?? "",
    normalizeMaybeUrl("/people", base.toString()) ?? "",
    normalizeMaybeUrl("/about", base.toString()) ?? "",
    normalizeMaybeUrl("/partners", base.toString()) ?? "",
  ].filter(Boolean));

  const keywords = ["team", "people", "about", "partners", "investors", "leadership", "team-member"];
  for (const href of extractHrefs(html, base.toString())) {
    try {
      const parsed = new URL(href);
      if (normalizeHostname(parsed.hostname) !== host) continue;
      const haystack = `${parsed.pathname} ${parsed.search}`.toLowerCase();
      if (
        keywords.some((k) => haystack.includes(k)) ||
        haystack.includes(nameSlug) ||
        haystack.replace(/[^a-z0-9]/g, "").includes(bareNameSlug)
      ) {
        candidates.add(parsed.toString());
      }
    } catch {
      // ignore malformed href
    }
  }

  return Array.from(candidates).slice(0, 12);
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: REQUEST_HEADERS,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function chooseBestEmail(emails: string[]): string | null {
  const cleaned = Array.from(
    new Set(
      emails
        .map((email) => email.trim().toLowerCase())
        .filter((email) => {
          if (!email.includes("@") || email.includes("example.com") || email.includes("noreply")) return false;
          const local = email.split("@")[0] ?? "";
          if (!local) return false;
          if (GENERIC_EMAIL_LOCAL_RE.test(local)) return false;
          return true;
        }),
    ),
  );
  return cleaned[0] ?? null;
}

function extractObfuscatedEmails(text: string): string[] {
  const out = new Set<string>();
  // e.g. "jenn at mucker dot com", "name(at)domain(dot)io"
  const re =
    /\b([a-z0-9._%+-]{1,64})\s*(?:@|\(at\)|\[at\]|\bat\b)\s*([a-z0-9.-]{1,253})\s*(?:\.|\(dot\)|\[dot\]|\bdot\b)\s*([a-z]{2,24})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const local = (m[1] ?? "").toLowerCase();
    const domain = (m[2] ?? "").toLowerCase().replace(/\.+/g, ".");
    const tld = (m[3] ?? "").toLowerCase();
    if (!local || !domain || !tld) continue;
    out.add(`${local}@${domain}.${tld}`);
  }
  return Array.from(out);
}

function chooseSocialUrl(
  urls: string[],
  kind: "linkedin" | "x",
  fullName?: string,
  websiteUrl?: string,
): string | null {
  const hostNeedles = kind === "linkedin" ? ["linkedin.com/in/", "linkedin.com/company/"] : ["x.com/", "twitter.com/"];
  const blocked = kind === "linkedin" ? ["/share", "/jobs"] : ["/intent/", "/share", "/home", "/search", "/hashtag/"];
  return (
    urls.find((url) => {
      const lower = url.toLowerCase();
      if (!hostNeedles.some((needle) => lower.includes(needle)) || blocked.some((needle) => lower.includes(needle))) {
        return false;
      }
      if (kind !== "x") return true;
      try {
        const pathname = new URL(url).pathname.toLowerCase();
        const handle = pathname.replace(/^\/+/, "").split("/")[0] ?? "";
        const firmHost = websiteUrl ? normalizeHostname(new URL(websiteUrl).hostname).replace(/\.[a-z]{2,}$/i, "") : "";
        const nameSlug = fullName ? slugifyName(fullName).replace(/-/g, "") : "";
        if (!handle || handle === "share" || handle === "home") return false;
        if (firmHost && handle.includes(firmHost.replace(/[^a-z0-9]/g, ""))) return false;
        if (nameSlug && !handle.replace(/[^a-z0-9]/g, "").includes(nameSlug.slice(0, 6))) return false;
        return true;
      } catch {
        return false;
      }
    }) ?? null
  );
}

function findNameIndex(lines: string[], fullName: string): number {
  const lowerName = fullName.trim().toLowerCase();
  return lines.findIndex((line) => line.trim().toLowerCase() === lowerName);
}

function extractTitle(lines: string[], fullName: string, fallbackTitle?: string | null): string | null {
  const idx = findNameIndex(lines, fullName);
  if (idx >= 0) {
    for (let i = idx + 1; i < Math.min(lines.length, idx + 5); i += 1) {
      const line = lines[i];
      if (!line) continue;
      if (line.toLowerCase() === lowerTrim(fallbackTitle)) return fallbackTitle?.trim() || line;
      if (SECTION_STOP_RE.test(line) || /^sector focus$/i.test(line)) continue;
      if (line.length > 80 || /@|https?:\/\//i.test(line)) continue;
      return line;
    }
  }
  return fallbackTitle?.trim() || null;
}

function lowerTrim(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function extractSectionLines(lines: string[], label: string): string[] {
  const start = lines.findIndex((line) => line.toLowerCase() === label.toLowerCase());
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    if (SECTION_STOP_RE.test(line) || /^how i /i.test(line) || /^your /i.test(line) || /^best /i.test(line) || /^key to /i.test(line) || /^grew up in$/i.test(line)) {
      break;
    }
    out.push(line);
  }
  return out;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function extractSectorFocus(lines: string[]): string[] {
  const section = extractSectionLines(lines, "Sector Focus");
  return uniqueStrings(
    section.filter((line) => line.length <= 60 && !/@|https?:\/\//i.test(line)),
  ).slice(0, 12);
}

function extractBio(lines: string[], fullName: string, title?: string | null): string | null {
  const idx = findNameIndex(lines, fullName);
  if (idx < 0) return null;
  const paragraphs: string[] = [];
  for (let i = idx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    if (line === title) continue;
    if (/^(sector focus|email|linkedin|x|twitter|portfolio)$/i.test(line)) continue;
    if (/^how i /i.test(line) || /^your /i.test(line) || /^best /i.test(line) || /^key to /i.test(line) || /^grew up in$/i.test(line)) break;
    if (/^(visit website|learn more|all companies)$/i.test(line)) continue;
    if (line.length < 45) continue;
    paragraphs.push(line);
    if (paragraphs.join(" ").length >= 1200) break;
  }
  if (paragraphs.length === 0) return null;
  return paragraphs.join("\n\n").slice(0, 4000);
}

function unwrapKnownImageProxyUrl(rawUrl: string): string {
  const u = rawUrl.trim();
  // ShortPixel pattern: .../client/.../https://origin/path.jpg
  const directIdx = u.indexOf("/https://");
  if (directIdx >= 0) return u.slice(directIdx + 1);
  const directHttpIdx = u.indexOf("/http://");
  if (directHttpIdx >= 0) return u.slice(directHttpIdx + 1);
  return u;
}

function looksLikeNonPersonImage(url: string): boolean {
  return /logo|wordmark|favicon|icon|sprite|banner|background|bg[-_]|placeholder|horizontal|header|nav|brand/i.test(url);
}

function extractMetaImageCandidates(html: string, baseUrl: string): string[] {
  const out: string[] = [];
  const metaRe =
    /<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src)["'][^>]+content=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = metaRe.exec(html)) !== null) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    const unwrapped = unwrapKnownImageProxyUrl(raw);
    const absolute = normalizeMaybeUrl(unwrapped, baseUrl);
    if (!absolute) continue;
    out.push(absolute);
  }
  return out;
}

function personNameTokens(fullName: string): string[] {
  return slugifyName(fullName).split("-").filter((t) => t.length >= 3);
}

function extractImage(html: string, fullName: string, baseUrl: string): string | null {
  const nameIdx = html.toLowerCase().indexOf(fullName.toLowerCase());
  const nameTokens = personNameTokens(fullName);
  const images: Array<{ url: string; pos: number; score: number }> = [];
  IMG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMG_RE.exec(html)) !== null) {
    const src = match[1]?.trim();
    if (!src) continue;
    const unwrapped = unwrapKnownImageProxyUrl(src);
    const absolute = normalizeMaybeUrl(unwrapped, baseUrl);
    if (!absolute) continue;
    if (looksLikeNonPersonImage(absolute)) continue;
    if (/\.svg(?:\?|$)/i.test(absolute)) continue;
    let score = 0;
    const lower = absolute.toLowerCase();
    if (nameTokens.some((t) => lower.includes(t))) score += 60;
    if (/\/team\//i.test(lower)) score += 25;
    if (/\/wp-content\/uploads\//i.test(lower)) score += 10;
    if (looksLikeNonPersonImage(lower)) score -= 80;
    images.push({ url: absolute, pos: match.index, score });
  }
  for (const metaUrl of extractMetaImageCandidates(html, baseUrl)) {
    const lower = metaUrl.toLowerCase();
    if (/\.svg(?:\?|$)/i.test(metaUrl)) continue;
    if (looksLikeNonPersonImage(lower)) continue;
    let score = 35; // prefer OG/Twitter image over random page assets
    if (nameTokens.some((t) => lower.includes(t))) score += 60;
    if (/\/team\//i.test(lower)) score += 25;
    images.push({ url: metaUrl, pos: nameIdx >= 0 ? nameIdx : Number.MAX_SAFE_INTEGER, score });
  }
  if (images.length === 0) return null;
  images.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (nameIdx >= 0) return Math.abs(a.pos - nameIdx) - Math.abs(b.pos - nameIdx);
    return a.pos - b.pos;
  });
  return images[0].url;
}

function extractFooterLocation(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(/([A-Z][A-Za-z .'-]+,\s*[A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/);
    if (!match?.[1]) continue;
    const [city] = match[1].split(",").map((s) => s.trim());
    if (!city || city.length < 3) continue;
    return match[1].trim();
  }
  return null;
}

function extractLocation(lines: string[], bio: string | null): string | null {
  const explicitLabel = extractSectionLines(lines, "Location");
  if (explicitLabel.length > 0) return explicitLabel[0];

  const footerLocation = extractFooterLocation(lines);
  if (footerLocation) return footerLocation;

  const text = [bio ?? "", ...lines].join(" ");
  const patterns = [
    /\b(?:based in|located in|lives in)\s+([A-Z][A-Za-z .'-]+(?:,\s*[A-Z][A-Za-z .'-]+){0,1})(?=,?\s+(?:where|who|and)\b|[.])/i,
    /\b([A-Z][A-Za-z .'-]+,\s*[A-Z]{2})(?:\b|,)/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim();
    if (!value) continue;
    const [city] = value.split(",").map((s) => s.trim());
    if (!city || city.length < 3) continue;
    return value;
  }

  return null;
}

function extractPortfolioCompanies(lines: string[]): string[] {
  const start = lines.findIndex((line) => line.toLowerCase() === "portfolio");
  if (start < 0) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    if (/^(all companies|contact|jobs|copyright|legal & privacy)$/i.test(line)) break;
    if (/^(visit website|learn more|healthcare|data \+ ai|cybersecurity|about us|portfolio|email)$/i.test(line)) continue;
    if (/^(exited|acquired|ipo|stealth|active|public)$/i.test(line)) continue;
    if (line.length > 60 || /[.!?]/.test(line) || /@|https?:\/\//i.test(line)) continue;
    if (/\d/.test(line)) continue;
    if (!/[A-Z]/.test(line) || line === line.toUpperCase()) continue;
    if (line.split(/\s+/).length > 5) continue;
    out.push(line);
  }
  return uniqueStrings(out).slice(0, 20);
}

function pickBestPage(
  pages: Array<{ url: string; html: string; lines: string[] }>,
  fullName: string,
): { url: string; html: string; lines: string[] } | null {
  const nameSlug = slugifyName(fullName);
  const scored = pages
    .map((page) => {
      const lowerUrl = page.url.toLowerCase();
      const exactNameLine = findNameIndex(page.lines, fullName) >= 0;
      let score = 0;
      if (lowerUrl.includes("/team-member/")) score += 6;
      if (lowerUrl.includes(nameSlug)) score += 5;
      if (exactNameLine) score += 4;
      if (page.lines.some((line) => lowerTrim(line) === "portfolio")) score += 3;
      if (page.lines.some((line) => lowerTrim(line) === "sector focus")) score += 2;
      return { page, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored[0]?.page ?? null;
}

function looksLikeProfileUrl(url: string, websiteUrl: string, fullName: string): boolean {
  try {
    const parsed = new URL(url);
    const base = new URL(websiteUrl);
    if (normalizeHostname(parsed.hostname) !== normalizeHostname(base.hostname)) return false;
    const lower = `${parsed.pathname}${parsed.search}`.toLowerCase();
    const slug = slugifyName(fullName);
    return (
      lower.includes("/team-member/") ||
      lower.includes(`/${slug}`) ||
      lower.replace(/[^a-z0-9]/g, "").includes(slug.replace(/-/g, ""))
    );
  } catch {
    return false;
  }
}

export async function resolvePersonWebsiteProfile(input: {
  firmWebsiteUrl: string;
  fullName: string;
  title?: string | null;
}): Promise<PersonWebsiteProfile> {
  const websiteUrl = normalizeWebsiteUrl(input.firmWebsiteUrl);
  if (!websiteUrl || !input.fullName.trim()) {
    return emptyProfile();
  }

  const homepageHtml = await fetchHtml(websiteUrl);
  if (!homepageHtml) {
    return emptyProfile([websiteUrl]);
  }

  const candidatePages = collectCandidatePages(websiteUrl, homepageHtml, input.fullName);
  const scannedUrls: string[] = [];
  const fetchedPages: Array<{ url: string; html: string; lines: string[] }> = [];

  for (const pageUrl of candidatePages) {
    const html = pageUrl === websiteUrl ? homepageHtml : await fetchHtml(pageUrl);
    scannedUrls.push(pageUrl);
    if (!html) continue;
    fetchedPages.push({ url: pageUrl, html, lines: toLines(html) });
  }

  const profileHrefCandidates = new Set<string>();
  for (const page of fetchedPages) {
    for (const href of extractHrefs(page.html, page.url)) {
      if (looksLikeProfileUrl(href, websiteUrl, input.fullName)) {
        profileHrefCandidates.add(href);
      }
    }
  }

  for (const profileUrl of profileHrefCandidates) {
    if (scannedUrls.includes(profileUrl)) continue;
    const html = await fetchHtml(profileUrl);
    scannedUrls.push(profileUrl);
    if (!html) continue;
    fetchedPages.push({ url: profileUrl, html, lines: toLines(html) });
  }

  const bestPage = pickBestPage(fetchedPages, input.fullName);
  if (!bestPage) {
    return emptyProfile(scannedUrls);
  }
  const pageMentionsPerson =
    findNameIndex(bestPage.lines, input.fullName) >= 0 ||
    looksLikeProfileUrl(bestPage.url, websiteUrl, input.fullName);
  if (!pageMentionsPerson) {
    return emptyProfile(scannedUrls);
  }

  const hrefs = extractHrefs(bestPage.html, bestPage.url);
  const emails: string[] = [];
  EMAIL_RE.lastIndex = 0;
  let emailMatch: RegExpExecArray | null;
  while ((emailMatch = EMAIL_RE.exec(bestPage.html)) !== null) {
    const email = emailMatch[1]?.trim();
    if (email) emails.push(email);
  }
  const obfuscated = extractObfuscatedEmails(stripTags(bestPage.html));
  for (const email of obfuscated) emails.push(email);
  for (const href of hrefs) {
    if (href.toLowerCase().startsWith("mailto:")) {
      const email = href.slice("mailto:".length).split("?")[0]?.trim();
      if (email) emails.push(email);
    }
  }

  const title = extractTitle(bestPage.lines, input.fullName, input.title);
  const bio = extractBio(bestPage.lines, input.fullName, title);

  return {
    headshotUrl: extractImage(bestPage.html, input.fullName, bestPage.url),
    title,
    email: chooseBestEmail(emails),
    linkedinUrl: chooseSocialUrl(hrefs, "linkedin", input.fullName, websiteUrl),
    xUrl: chooseSocialUrl(hrefs, "x", input.fullName, websiteUrl),
    bio,
    location: extractLocation(bestPage.lines, bio),
    websiteUrl,
    profileUrl: bestPage.url,
    sectorFocus: extractSectorFocus(bestPage.lines),
    portfolioCompanies: extractPortfolioCompanies(bestPage.lines),
    scannedUrls,
  };
}
