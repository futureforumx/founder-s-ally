import { safeTrim } from "@/lib/utils";

/**
 * Third-party favicon resolvers and deprecated logo CDNs. Storing or displaying these
 * as `logo_url` often yields generic globes or tiny icons — treat as absent so we can
 * fall back to the firm's own site assets.
 */
export const THIRD_PARTY_FAVICON_PROXY_RE =
  /gstatic\.com\/faviconV2|google\.com\/s2\/favicons|googleusercontent\.com\/favicon|unavatar\.io|icon\.horse|clearbit\.com\/logo|duckduckgo\.com\/ip3\//i;

export function isThirdPartyFaviconProxyUrl(url: string | null | undefined): boolean {
  const t = safeTrim(url);
  if (!t) return false;
  return THIRD_PARTY_FAVICON_PROXY_RE.test(t);
}

/** Stored logo suitable for tier-1 display: non-empty and not a favicon proxy URL. */
export function sanitizeFirmLogoUrlForDisplay(logoUrl: string | null | undefined): string | null {
  const t = safeTrim(logoUrl);
  if (!t) return null;
  if (isThirdPartyFaviconProxyUrl(t)) return null;
  return t;
}
