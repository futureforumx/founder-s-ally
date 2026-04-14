type FirmWebsiteContact = {
  email: string | null;
  linkedinUrl: string | null;
  xUrl: string | null;
  facebookUrl: string | null;
  instagramUrl: string | null;
  youtubeUrl: string | null;
  scannedUrls: string[];
};

const REQUEST_HEADERS = {
  "user-agent":
    "Mozilla/5.0 (compatible; VEKTAContactResolver/1.0; +https://vekta.app)",
  accept: "text/html,application/xhtml+xml",
};

const EMAIL_RE = /(?:mailto:)?([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
const HREF_RE = /href=["']([^"'#]+)["']/gi;
const GENERIC_EMAIL_PREFIXES = new Set(["hello", "info", "contact", "team", "partners", "invest", "media"]);

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

function registrableHost(hostname: string): string {
  const parts = normalizeHostname(hostname).split(".").filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join(".") : normalizeHostname(hostname);
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
  const keywords = ["contact", "about", "team", "people", "partners", "platform", "investors"];
  for (const href of extractHrefs(html, baseUrl)) {
    try {
      const parsed = new URL(href);
      if (normalizeHostname(parsed.hostname) !== sameHost) continue;
      const haystack = `${parsed.pathname} ${parsed.search}`.toLowerCase();
      if (keywords.some((k) => haystack.includes(k))) candidates.add(parsed.toString());
      if (candidates.size >= 6) break;
    } catch {
      // ignore malformed href
    }
  }
  return Array.from(candidates).slice(0, 6);
}

function chooseBestEmail(emails: string[], websiteHost: string): string | null {
  const normalizedHost = registrableHost(websiteHost);
  const cleaned = emails
    .map((email) => email.trim().toLowerCase())
    .filter((email) => !email.endsWith(".png") && !email.endsWith(".jpg") && !email.includes("example.com"));
  if (cleaned.length === 0) return null;

  const scored = cleaned.map((email) => {
    const [localPart = "", domain = ""] = email.split("@");
    let score = 0;
    if (registrableHost(domain) === normalizedHost) score += 5;
    if (GENERIC_EMAIL_PREFIXES.has(localPart)) score += 3;
    if (!email.includes("noreply")) score += 1;
    return { email, score };
  });

  scored.sort((a, b) => b.score - a.score || a.email.localeCompare(b.email));
  return scored[0]?.email ?? null;
}

function chooseSocialUrl(
  urls: string[],
  kind: "linkedin" | "x" | "facebook" | "instagram" | "youtube",
): string | null {
  const hostNeedles =
    kind === "linkedin"
      ? ["linkedin.com/company/", "linkedin.com/in/"]
      : kind === "x"
        ? ["x.com/", "twitter.com/"]
        : kind === "facebook"
          ? ["facebook.com/"]
          : kind === "instagram"
            ? ["instagram.com/"]
            : ["youtube.com/", "youtu.be/"];
  const disallowNeedles =
    kind === "linkedin"
      ? ["/share", "/jobs"]
      : kind === "x"
        ? ["/intent/", "/share", "/home", "/search", "/hashtag/"]
        : kind === "facebook"
          ? ["/sharer", "/share.php", "/plugins/"]
          : kind === "instagram"
            ? ["/p/", "/reel/", "/stories/"]
            : ["/watch?", "/results?", "/shorts/"];
  const match = urls.find((url) => {
    const lower = url.toLowerCase();
    return hostNeedles.some((needle) => lower.includes(needle)) && !disallowNeedles.some((needle) => lower.includes(needle));
  });
  return match ?? null;
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

export async function resolveFirmWebsiteContact(websiteUrl: string): Promise<FirmWebsiteContact> {
  const normalized = normalizeWebsiteUrl(websiteUrl);
  if (!normalized) {
    return {
      email: null,
      linkedinUrl: null,
      xUrl: null,
      facebookUrl: null,
      instagramUrl: null,
      youtubeUrl: null,
      scannedUrls: [],
    };
  }

  const base = new URL(normalized);
  const homepageHtml = await fetchHtml(base.toString());
  if (!homepageHtml) {
    return {
      email: null,
      linkedinUrl: null,
      xUrl: null,
      facebookUrl: null,
      instagramUrl: null,
      youtubeUrl: null,
      scannedUrls: [base.toString()],
    };
  }

  const candidatePages = collectCandidatePages(base.toString(), homepageHtml);
  const scannedUrls: string[] = [];
  const emails = new Set<string>();
  const urls = new Set<string>();

  for (const pageUrl of candidatePages) {
    const html = pageUrl === base.toString() ? homepageHtml : await fetchHtml(pageUrl);
    scannedUrls.push(pageUrl);
    if (!html) continue;

    let emailMatch: RegExpExecArray | null;
    EMAIL_RE.lastIndex = 0;
    while ((emailMatch = EMAIL_RE.exec(html)) !== null) {
      const email = emailMatch[1]?.trim();
      if (email) emails.add(email);
    }

    for (const href of extractHrefs(html, pageUrl)) {
      urls.add(href);
      if (href.toLowerCase().startsWith("mailto:")) {
        const email = href.slice("mailto:".length).split("?")[0]?.trim();
        if (email) emails.add(email);
      }
    }
  }

  return {
    email: chooseBestEmail(Array.from(emails), base.hostname),
    linkedinUrl: chooseSocialUrl(Array.from(urls), "linkedin"),
    xUrl: chooseSocialUrl(Array.from(urls), "x"),
    facebookUrl: chooseSocialUrl(Array.from(urls), "facebook"),
    instagramUrl: chooseSocialUrl(Array.from(urls), "instagram"),
    youtubeUrl: chooseSocialUrl(Array.from(urls), "youtube"),
    scannedUrls,
  };
}
