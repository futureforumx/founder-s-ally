import { formatOutboundUrl } from "@/lib/utils/formatOutboundUrl";

/**
 * Outbound link tracking helpers.
 *
 * Every external link on /fresh-capital routes through /outbound so clicks are
 * logged and destination sites can see traffic attributed to vekta.so.
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

/** Returns false for javascript:, data:, and any non-http(s) scheme. */
export function isValidOutboundUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

function appendUtm(url: string, campaign: OutboundContext): string {
  return formatOutboundUrl(url, campaign);
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

  const dest = UTM_ENABLED ? appendUtm(raw, context) : raw;
  const params = new URLSearchParams({ to: dest, type, context });
  if (id) params.set("id", id);
  return `/outbound?${params.toString()}`;
}
