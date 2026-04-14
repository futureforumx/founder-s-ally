/**
 * Resolve activity-card thumbnails: reject junk OG images, then fall back to firm branding
 * (DB logo → Signal NFX / CB Insights OG → website favicon).
 */

const THIRD_PARTY_FAVICON_PROXY_RE =
  /gstatic\.com\/faviconV2|google\.com\/s2\/favicons|googleusercontent\.com\/favicon|unavatar\.io|icon\.horse|clearbit\.com\/logo|duckduckgo\.com\/ip3\//i;

const AGGREGATOR_HOSTS = new Set([
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "crunchbase.com",
  "angel.co",
  "wellfound.com",
]);

function safeTrim(s: string | null | undefined): string {
  return typeof s === "string" ? s.trim() : "";
}

export function isThirdPartyFaviconProxyUrl(url: string | null | undefined): boolean {
  const t = safeTrim(url);
  if (!t) return false;
  return THIRD_PARTY_FAVICON_PROXY_RE.test(t);
}

/** Reject tiny trackers, blank images, favicon proxies, and obvious non-photos. */
export function isGarbageCardImageUrl(url: string | null | undefined): boolean {
  const t = safeTrim(url);
  if (!t || !/^https?:\/\//i.test(t)) return true;
  const u = t.toLowerCase();
  if (isThirdPartyFaviconProxyUrl(t)) return true;
  if (/1x1|pixel\.gif|blank\.gif|spacer\.gif|transparent\.gif|clear\.gif/.test(u)) return true;
  if (u.includes("gravatar.com") && /[?&]d=(identicon|mp|retro|wavatar|404)/.test(u)) return true;
  if (/wp-includes\/images\/media\/(default|video|audio)/.test(u)) return true;
  return false;
}

/** Keep only non-proxy firm logos from DB. */
export function sanitizeFirmLogoUrlForFallback(url: string | null | undefined): string | null {
  const t = safeTrim(url);
  if (!t || !/^https?:\/\//i.test(t)) return null;
  if (isThirdPartyFaviconProxyUrl(t)) return null;
  return t;
}

function hostnameFromUrl(raw: string | null | undefined): string | null {
  const t = safeTrim(raw);
  if (!t) return null;
  try {
    const u = new URL(t.startsWith("http") ? t : `https://${t}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function isBlockedWebsiteHost(host: string): boolean {
  const h = host.toLowerCase();
  if (AGGREGATOR_HOSTS.has(h)) return true;
  if (h.endsWith(".linkedin.com")) return true;
  return false;
}

/** Google s2 favicon for the firm's own domain (last resort before null). */
export function firmWebsiteFaviconUrl(websiteUrl: string | null | undefined): string | null {
  const host = hostnameFromUrl(websiteUrl);
  if (!host || isBlockedWebsiteHost(host)) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
}

/**
 * Fetch HTML and parse og:image — only for Signal / CB Insights profile URLs.
 */
export async function fetchOgImageFromProfilePage(
  pageUrl: string | null | undefined,
  timeoutMs = 8000,
): Promise<string | null> {
  const t = safeTrim(pageUrl);
  if (!t || !/^https?:\/\//i.test(t)) return null;
  let host: string;
  try {
    host = new URL(t).hostname.toLowerCase();
  } catch {
    return null;
  }
  const allowed =
    host === "signal.nfx.com" ||
    host.endsWith(".signal.nfx.com") ||
    host === "cbinsights.com" ||
    host.endsWith(".cbinsights.com") ||
    host === "www.cbinsights.com" ||
    host.includes("app.cbinsights.com");
  if (!allowed) return null;

  try {
    const res = await fetch(t, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VEKTA-InvestorUpdates/1.0; +https://vekta.app)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 200_000);
    const metaRe =
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i;
    const metaRe2 =
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i;
    const m = html.match(metaRe) || html.match(metaRe2);
    const img = m?.[1]?.trim();
    if (img && /^https?:\/\//i.test(img) && !isGarbageCardImageUrl(img)) return img;
  } catch {
    /* network / timeout / parse */
  }
  return null;
}

export function pickCardImageUrl(
  primary: string | null | undefined,
  firmFallback: string | null | undefined,
): string | null {
  const p = safeTrim(primary);
  if (p && !isGarbageCardImageUrl(p)) return p;
  const f = safeTrim(firmFallback);
  if (f && !isGarbageCardImageUrl(f)) return f;
  return null;
}
