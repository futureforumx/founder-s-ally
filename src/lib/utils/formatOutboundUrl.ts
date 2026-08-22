/** Shared attributes for external source anchors so destinations receive our referrer. */
export const EXTERNAL_SOURCE_LINK_ATTRS = {
  target: "_blank",
  rel: "noopener",
  referrerPolicy: "strict-origin-when-cross-origin",
} as const;

export function formatOutboundUrl(targetUrl: string, campaign = "latest_funding"): string {
  try {
    const url = new URL(targetUrl);
    url.searchParams.set("utm_source", "vekta.so");
    url.searchParams.set("utm_medium", "referral");
    url.searchParams.set("utm_campaign", campaign);
    return url.toString();
  } catch {
    return targetUrl;
  }
}
