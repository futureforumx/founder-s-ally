import { sanitizeFirmLogoUrlForDisplay } from "@/lib/firmLogoUrl";
import { prettyWebsiteHost } from "@/lib/latestFundingDisplay";

const PRESS_OR_SOCIAL_HOST_RE =
  /(^|\.)(techcrunch|reuters|businesswire|finsmes|linkedin|lnkd\.in|twitter|x\.com|yahoo|fiercehealthcare|citybiz|dealroom|techfundingnews|upstartsmedia|fundraiseinsider|thesaasnews|runtimewire|htworld|prnewswire|bloomberg|forbes|cnbc|axios|wired|theverge|tech\.eu|alleywatch|geekwire|startups\.gallery|medium\.com|substack|youtube|facebook|instagram|t\.co|news\.ycombinator)\b/i;

const SKIP_SUBDOMAINS = new Set(["www", "news", "blog", "press", "ir", "about", "go", "www2"]);

const STARTUP_TLDS = [".com", ".ai", ".io", ".co", ".dev"] as const;

const NAME_SUFFIXES = new Set(["inc", "llc", "ltd", "corp", "co", "the", "ai", "labs", "lab"]);

export function logoProxyUrlsForHost(host: string): string[] {
  const h = host.trim().toLowerCase().replace(/^www\./, "");
  if (!h || PRESS_OR_SOCIAL_HOST_RE.test(h)) return [];
  return [
    `https://img.logo.dev/${encodeURIComponent(h)}?size=64&format=png&fallback=404`,
    `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(h)}`,
  ];
}

export function isPressOrSocialHost(host: string | null | undefined): boolean {
  const h = host?.trim().toLowerCase().replace(/^www\./, "") ?? "";
  if (!h) return false;
  return PRESS_OR_SOCIAL_HOST_RE.test(h);
}

/** Prefer the registrable host (strip news./blog.) when the press URL is actually the company site. */
export function firstPartyHostFromUrl(url: string | null | undefined): string | null {
  const host = prettyWebsiteHost(url);
  if (!host || isPressOrSocialHost(host)) return null;
  const parts = host.split(".").filter(Boolean);
  if (parts.length >= 3 && SKIP_SUBDOMAINS.has(parts[0] ?? "")) {
    return parts.slice(1).join(".");
  }
  return host;
}

export function firstPartyWebsiteFromUrl(url: string | null | undefined): string | null {
  const host = firstPartyHostFromUrl(url);
  return host ? `https://${host}` : null;
}

export function guessedHostsFromCompanyName(name: string | null | undefined): string[] {
  const raw = name?.trim().toLowerCase() ?? "";
  if (!raw) return [];

  const cleaned = raw
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return [];

  const tokens = cleaned.split(" ").filter(Boolean);
  const stripped = tokens.filter((token) => !NAME_SUFFIXES.has(token));
  const bases = [tokens.join(""), stripped.join("")].filter((value, index, arr) => {
    return Boolean(value) && value.length >= 2 && arr.indexOf(value) === index;
  });

  const out: string[] = [];
  const seen = new Set<string>();
  for (const base of bases.slice(0, 2)) {
    for (const tld of STARTUP_TLDS) {
      const host = `${base}${tld}`;
      if (seen.has(host)) continue;
      seen.add(host);
      out.push(host);
    }
  }
  return out;
}

/**
 * Ordered logo URLs for Latest Funding company marks:
 * 1. Stored / listing logo (gallery image, admin)
 * 2. Known website host — logo.dev, then Google s2
 * 3. First-party source URL host (company blog, not TechCrunch/LinkedIn)
 * 4. Guessed {name}.com/.ai/.io/.co/.dev
 */
export function buildCompanyMarkCandidateUrls(input: {
  companyName: string;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  sourceUrl?: string | null;
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (u: string | null | undefined) => {
    const t = u?.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  const pushHost = (host: string | null | undefined) => {
    if (!host) return;
    for (const url of logoProxyUrlsForHost(host)) push(url);
  };

  push(sanitizeFirmLogoUrlForDisplay(input.logoUrl));
  pushHost(prettyWebsiteHost(input.websiteUrl));
  pushHost(firstPartyHostFromUrl(input.sourceUrl));
  for (const host of guessedHostsFromCompanyName(input.companyName)) {
    pushHost(host);
  }
  return out;
}

export function shouldRejectLoadedMark(src: string | null, width: number, height: number): boolean {
  if (!src) return false;
  const tooSmall = width < 24 || height < 24;
  if (tooSmall) return true;

  const aspectRatio = width / height;
  if (!Number.isFinite(aspectRatio) || aspectRatio <= 0) return true;
  if (aspectRatio > 6 || aspectRatio < 0.2) return true;

  const normalized = src.toLowerCase();
  const isProxyService = normalized.includes("google.com/s2/favicons") || normalized.includes("img.logo.dev/");
  if (!isProxyService) return false;
  return width < 28 || height < 28;
}
