import { sanitizeFirmLogoUrlForDisplay } from "@/lib/firmLogoUrl";
import { prettyWebsiteHost } from "@/lib/latestFundingDisplay";

export function startupLogoHost(websiteUrl?: string | null, domain?: string | null): string | null {
  return prettyWebsiteHost(websiteUrl) ?? domain?.trim().toLowerCase().replace(/^www\./, "") ?? null;
}

export function googleFaviconUrl(host: string, size = 128): string {
  const h = host.trim().toLowerCase().replace(/^www\./, "");
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(h)}&sz=${size}`;
}

function gstaticFaviconUrl(host: string, size: number): string {
  const h = host.trim().toLowerCase().replace(/^www\./, "");
  return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${h}&size=${size}`;
}

function duckDuckGoIconUrl(host: string): string {
  const h = host.trim().toLowerCase().replace(/^www\./, "");
  return `https://icons.duckduckgo.com/ip3/${h}.ico`;
}

export function startupNameHash(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Unique monogram so fictional hosts never fall back to a Radix icon or Google globe. */
export function generatedStartupMonogramSrc(name: string): string {
  const letter = (name.trim().charAt(0) || "?").toUpperCase();
  const hue = startupNameHash(name) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="hsl(${hue} 62% 46%)"/><text x="32" y="42" text-anchor="middle" font-size="30" font-family="Inter,ui-sans-serif,system-ui,sans-serif" font-weight="700" fill="#fff">${letter}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Google’s default globe is 16×16 — keep real favicons, drop the placeholder. */
export function shouldRejectStartupFavicon(width: number, height: number): boolean {
  return width < 24 || height < 24;
}

/**
 * Company marks only — no first-party /favicon.ico (hangs on invented hosts)
 * and no logo.dev without a token (404). Ends with a monogram so every row has a logo.
 */
export function buildStartupLogoCandidates(input: {
  name?: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  domain?: string | null;
  size?: number;
}): string[] {
  const size = input.size ?? 128;
  const host = startupLogoHost(input.websiteUrl, input.domain);
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (url: string | null | undefined) => {
    const trimmed = url?.trim();
    if (!trimmed || seen.has(trimmed)) return;
    seen.add(trimmed);
    out.push(trimmed);
  };

  push(sanitizeFirmLogoUrlForDisplay(input.logoUrl));
  if (host) {
    push(googleFaviconUrl(host, size));
    push(gstaticFaviconUrl(host, size));
    push(duckDuckGoIconUrl(host));
  }
  if (input.name?.trim()) push(generatedStartupMonogramSrc(input.name));
  return out;
}

export function startupLogoSrc(input: {
  name?: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  domain?: string | null;
  size?: number;
}): string | null {
  return buildStartupLogoCandidates(input)[0] ?? null;
}
