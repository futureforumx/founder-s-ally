type PersonWebsiteProfile = {
  headshotUrl: string | null;
  email: string | null;
  linkedinUrl: string | null;
  xUrl: string | null;
  bio: string | null;
  location: string | null;
  websiteUrl: string | null;
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
    .replace(/<\/?(?:p|div|li|section|article|br|h[1-6]|span|strong|em)[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
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
      // ignore malformed href
    }
  }

  return Array.from(candidates).slice(0, 8);
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
        .filter((email) => email.includes("@") && !email.includes("example.com") && !email.includes("noreply")),
    ),
  );
  return cleaned[0] ?? null;
}

function chooseSocialUrl(urls: string[], kind: "linkedin" | "x"): string | null {
  const hostNeedles = kind === "linkedin" ? ["linkedin.com/in/", "linkedin.com/company/"] : ["x.com/", "twitter.com/"];
  const blocked = kind === "linkedin" ? ["/share", "/jobs"] : ["/intent/", "/share", "/home", "/search", "/hashtag/"];
  return (
    urls.find((url) => {
      const lower = url.toLowerCase();
      return hostNeedles.some((needle) => lower.includes(needle)) && !blocked.some((needle) => lower.includes(needle));
    }) ?? null
  );
}

function extractSnippet(html: string, fullName: string): { snippet: string; nameOffset: number } | null {
  const idx = html.toLowerCase().indexOf(fullName.toLowerCase());
  if (idx < 0) return null;
  const start = Math.max(0, idx - 1500);
  const end = Math.min(html.length, idx + 3000);
  return { snippet: html.slice(start, end), nameOffset: idx - start };
}

function extractImage(snippet: string, nameOffset: number, baseUrl: string): string | null {
  const images: Array<{ url: string; pos: number }> = [];
  IMG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = IMG_RE.exec(snippet)) !== null) {
    const src = match[1]?.trim();
    if (!src) continue;
    const absolute = normalizeMaybeUrl(src, baseUrl);
    if (!absolute) continue;
    if (/logo|icon|favicon|banner|background|bg[-_]/i.test(absolute)) continue;
    images.push({ url: absolute, pos: match.index });
  }
  if (images.length === 0) return null;
  // Return the image closest to the name mention — not just the first one in the snippet.
  // This avoids grabbing the previous person's photo when they appear within the before-window.
  images.sort((a, b) => Math.abs(a.pos - nameOffset) - Math.abs(b.pos - nameOffset));
  return images[0].url;
}

function aggressiveStripHtml(html: string): string {
  return html
    // Remove script/style blocks first
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Strip tags, handling quoted attrs with > inside and unclosed tags
    .replace(/<(?:"[^"]*"|'[^']*'|[^>"'])*>?/g, " ")
    // Strip any leftover tag fragments (unclosed at end)
    .replace(/<[^<>]{0,300}$/, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function extractBio(snippet: string, fullName: string, title?: string | null): string | null {
  const text = aggressiveStripHtml(snippet);
  const idx = text.toLowerCase().indexOf(fullName.toLowerCase());
  const afterName = idx >= 0 ? text.slice(idx + fullName.length).trim() : text;
  const cleaned = afterName
    .replace(new RegExp(`^${title?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") ?? ""}[\\s,|:-]*`, "i"), "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length < 40) return null;
  const pipeCount = (cleaned.match(/\|/g) ?? []).length;
  const namedPeopleCount = (cleaned.match(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g) ?? []).length;
  if (
    pipeCount >= 3 ||
    namedPeopleCount >= 5 ||
    /sqs-html-content|newsletter|subscribe|cookie|privacy policy|terms of use/i.test(cleaned)
  ) {
    return null;
  }
  return cleaned.slice(0, 420).trim();
}

function extractLocation(snippet: string): string | null {
  const text = stripTags(snippet);
  const patterns = [
    /\b(?:based in|located in|from)\s+([A-Z][A-Za-z .'-]+(?:,\s*[A-Z][A-Za-z .'-]+){0,2})/i,
    /\b([A-Z][A-Za-z .'-]+,\s*[A-Z]{2})(?:\b|,)/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

export async function resolvePersonWebsiteProfile(input: {
  firmWebsiteUrl: string;
  fullName: string;
  title?: string | null;
}): Promise<PersonWebsiteProfile> {
  const websiteUrl = normalizeWebsiteUrl(input.firmWebsiteUrl);
  if (!websiteUrl || !input.fullName.trim()) {
    return {
      headshotUrl: null,
      email: null,
      linkedinUrl: null,
      xUrl: null,
      bio: null,
      location: null,
      websiteUrl: null,
      scannedUrls: [],
    };
  }

  const homepageHtml = await fetchHtml(websiteUrl);
  if (!homepageHtml) {
    return {
      headshotUrl: null,
      email: null,
      linkedinUrl: null,
      xUrl: null,
      bio: null,
      location: null,
      websiteUrl: null,
      scannedUrls: [websiteUrl],
    };
  }

  const candidatePages = collectCandidatePages(websiteUrl, homepageHtml);
  const scannedUrls: string[] = [];
  const matchedSnippets: Array<{ snippet: string; nameOffset: number; pageUrl: string }> = [];

  for (const pageUrl of candidatePages) {
    const html = pageUrl === websiteUrl ? homepageHtml : await fetchHtml(pageUrl);
    scannedUrls.push(pageUrl);
    if (!html) continue;
    const result = extractSnippet(html, input.fullName);
    if (result) matchedSnippets.push({ snippet: result.snippet, nameOffset: result.nameOffset, pageUrl });
  }

  if (matchedSnippets.length === 0) {
    return {
      headshotUrl: null,
      email: null,
      linkedinUrl: null,
      xUrl: null,
      bio: null,
      location: null,
      websiteUrl: null,
      scannedUrls,
    };
  }

  const emails: string[] = [];
  const urls: string[] = [];
  let headshotUrl: string | null = null;
  let bio: string | null = null;
  let location: string | null = null;

  for (const match of matchedSnippets) {
    let emailMatch: RegExpExecArray | null;
    EMAIL_RE.lastIndex = 0;
    while ((emailMatch = EMAIL_RE.exec(match.snippet)) !== null) {
      const email = emailMatch[1]?.trim();
      if (email) emails.push(email);
    }

    for (const href of extractHrefs(match.snippet, match.pageUrl)) {
      urls.push(href);
      if (href.toLowerCase().startsWith("mailto:")) {
        const email = href.slice("mailto:".length).split("?")[0]?.trim();
        if (email) emails.push(email);
      }
    }

    if (!headshotUrl) headshotUrl = extractImage(match.snippet, match.nameOffset, match.pageUrl);
    if (!bio) bio = extractBio(match.snippet, input.fullName, input.title);
    if (!location) location = extractLocation(match.snippet);
  }

  return {
    headshotUrl,
    email: chooseBestEmail(emails),
    linkedinUrl: chooseSocialUrl(urls, "linkedin"),
    xUrl: chooseSocialUrl(urls, "x"),
    bio,
    location,
    websiteUrl,
    scannedUrls,
  };
}
