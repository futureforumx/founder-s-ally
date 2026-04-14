import { safeTrim } from "@/lib/utils";
import { isThirdPartyFaviconProxyUrl, sanitizeFirmLogoUrlForDisplay } from "@/lib/firmLogoUrl";

const AGGREGATOR_HOSTS = new Set([
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "crunchbase.com",
  "angel.co",
  "wellfound.com",
]);

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

/** Google s2 favicon for the firm's own domain (client-safe fallback). */
export function firmWebsiteFaviconUrl(websiteUrl: string | null | undefined): string | null {
  const host = hostnameFromUrl(websiteUrl);
  if (!host || isBlockedWebsiteHost(host)) return null;
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`;
}

/** DB logo (non-proxy) then website favicon — matches edge fallback minus Signal/CB fetch. */
export function buildClientFirmImageFallback(
  firmLogoUrl: string | null | undefined,
  firmWebsiteUrl: string | null | undefined,
): string | null {
  return sanitizeFirmLogoUrlForDisplay(firmLogoUrl) || firmWebsiteFaviconUrl(firmWebsiteUrl);
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
