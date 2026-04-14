type FirmWebsiteThemesResult = {
  themes: string[];
  scannedUrls: string[];
};

const REQUEST_HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; VEKTAFirmThemesResolver/1.0; +https://vekta.app)",
  accept: "text/html,application/xhtml+xml",
};

const HREF_RE = /href=["']([^"'#]+)["']/gi;

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

function normalizeMaybeUrl(url: string, baseUrl?: string): string | null {
  try {
    if (/^https?:\/\//i.test(url)) return new URL(url).toString();
    if (!baseUrl) return null;
    return new URL(url, baseUrl).toString();
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
  const sameHost = normalizeHostname(base.hostname);
  const candidates = new Set<string>([base.toString()]);
  const keywords = ["team", "about", "thesis", "focus", "portfolio", "capital", "invest"];
  for (const href of extractHrefs(html, baseUrl)) {
    try {
      const parsed = new URL(href);
      if (normalizeHostname(parsed.hostname) !== sameHost) continue;
      const haystack = `${parsed.pathname} ${parsed.search}`.toLowerCase();
      if (keywords.some((k) => haystack.includes(k))) candidates.add(parsed.toString());
      if (candidates.size >= 8) break;
    } catch {
      /* ignore malformed href */
    }
  }
  return Array.from(candidates).slice(0, 8);
}

const THEME_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\benergy\b/i, label: "Energy" },
  { re: /\benvironment(?:al)?\b/i, label: "Environment" },
  { re: /\bhealth(?:care|tech)?\b/i, label: "Health" },
  { re: /\beducation|\bedtech\b/i, label: "Education" },
  { re: /\bfood safety\b|\bfood tech\b/i, label: "Food Safety" },
  { re: /\bsupply chain\b|\blogistics\b/i, label: "Supply Chain" },
  { re: /\bmanufacturing\b/i, label: "Manufacturing" },
  { re: /\bclimate\b/i, label: "Climate" },
  { re: /\bai\b|\bartificial intelligence\b|\bmachine learning\b/i, label: "AI" },
  { re: /\bdata\b|\banalytics\b/i, label: "Data" },
];

function extractThemesFromText(text: string): string[] {
  const out: string[] = [];
  for (const { re, label } of THEME_PATTERNS) {
    if (re.test(text) && !out.includes(label)) out.push(label);
  }
  return out;
}

export async function resolveFirmWebsiteThemes(websiteUrl: string): Promise<FirmWebsiteThemesResult> {
  const normalized = normalizeWebsiteUrl(websiteUrl);
  if (!normalized) return { themes: [], scannedUrls: [] };

  const homepageHtml = await fetchHtml(normalized);
  if (!homepageHtml) return { themes: [], scannedUrls: [normalized] };

  const pages = collectCandidatePages(normalized, homepageHtml);
  const scannedUrls: string[] = [];
  let corpus = stripTags(homepageHtml);
  for (const pageUrl of pages) {
    if (pageUrl === normalized) {
      scannedUrls.push(pageUrl);
      continue;
    }
    const html = await fetchHtml(pageUrl);
    scannedUrls.push(pageUrl);
    if (!html) continue;
    corpus += ` ${stripTags(html)}`;
  }
  return { themes: extractThemesFromText(corpus).slice(0, 12), scannedUrls };
}
