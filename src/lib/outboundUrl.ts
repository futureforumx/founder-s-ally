/**
 * Outbound link tracking helpers.
 *
 * Every external link on /fresh-capital routes through /outbound so clicks are
 * logged and destination sites can see traffic attributed to tryvekta.com.
 */

export type OutboundLinkType =
  | "funding_article"
  | "firm_website"
  | "company_website"
  | "lead_investor";

export type OutboundContext = "fresh_funds" | "latest_funding";

/**
 * Whether to append UTM parameters to outbound destination URLs.
 * Set to false to disable globally without touching individual call sites.
 */
const UTM_ENABLED = true;

const UTM_PARAMS = {
  utm_source: "tryvekta",
  utm_medium: "referral",
  utm_campaign: "fresh_capital",
} as const;

/** Returns false for javascript:, data:, and any non-http(s) scheme. */
export function isValidOutboundUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** Appends UTM params to a URL, preserving any existing query string. */
function appendUtm(url: string): string {
  try {
    const parsed = new URL(url);
    for (const [key, value] of Object.entries(UTM_PARAMS)) {
      parsed.searchParams.set(key, value);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Builds the `/outbound` proxy URL for an external link.
 *
 * Returns null when `destination` is empty or not a valid http(s) URL so
 * callers can safely skip rendering a link at all.
 */
export function buildOutboundUrl(
  destination: string | null | undefined,
  type: OutboundLinkType,
  context: OutboundContext,
  id?: string | null,
): string | null {
  const raw = destination?.trim();
  if (!raw || !isValidOutboundUrl(raw)) return null;

  const dest = UTM_ENABLED ? appendUtm(raw) : raw;
  const params = new URLSearchParams({ to: dest, type, context });
  if (id) params.set("id", id);
  return `/outbound?${params.toString()}`;
}
