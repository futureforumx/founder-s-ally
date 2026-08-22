/**
 * Investor / company logo enrichment for the funding intel pipeline.
 * Clearbit is the stored primary; Google s2 is the display fallback.
 */
import { lookupKnownVcDomain } from "@/lib/knownVcDomains";

/** Lowercase firm name / alias → canonical public domain (no scheme). */
export const VC_FIRM_DOMAIN_BY_NAME: Record<string, string> = {
  sequoia: "sequoiacap.com",
  "sequoia capital": "sequoiacap.com",
  "general catalyst": "generalcatalyst.com",
  "nexus venture partners": "nexusvp.com",
  nexus: "nexusvp.com",
  "stellaris venture partners": "stellarisvp.com",
  stellaris: "stellarisvp.com",
  "andreessen horowitz": "a16z.com",
  a16z: "a16z.com",
  accel: "accel.com",
  "accel partners": "accel.com",
  "lightspeed venture partners": "lsvp.com",
  lightspeed: "lsvp.com",
  "y combinator": "ycombinator.com",
  yc: "ycombinator.com",
};

export function normalizeLogoDomain(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  let s = raw.trim().toLowerCase();
  if (!/^https?:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, "")}`;
  try {
    const host = new URL(s).hostname.replace(/^www\./i, "").toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

export function lookupVcFirmDomain(firmName: string | null | undefined): string | null {
  if (!firmName?.trim()) return null;
  const key = firmName.toLowerCase().trim();
  if (VC_FIRM_DOMAIN_BY_NAME[key]) return VC_FIRM_DOMAIN_BY_NAME[key];
  const extra = Object.entries(VC_FIRM_DOMAIN_BY_NAME).find(([name]) => key.startsWith(name) || name.startsWith(key));
  if (extra) return extra[1];
  return lookupKnownVcDomain(firmName);
}

export function resolveLogoDomain(args: {
  name?: string | null;
  websiteUrl?: string | null;
  domain?: string | null;
}): string | null {
  return (
    normalizeLogoDomain(args.domain) ||
    normalizeLogoDomain(args.websiteUrl) ||
    lookupVcFirmDomain(args.name)
  );
}

/** Primary Clearbit logo URL for a bare domain. */
export function getLogoUrl(domain: string): string {
  const host = normalizeLogoDomain(domain);
  if (!host) return "";
  return `https://logo.clearbit.com/${host}`;
}

/** Google favicon fallback used when Clearbit is missing or blocked. */
export function getLogoFallbackUrl(domain: string): string {
  const host = normalizeLogoDomain(domain);
  if (!host) return "";
  return `https://www.google.com/s2/favicons?domain=${host}&sz=128`;
}

export function getLogoUrls(domain: string): { primary: string; fallback: string } | null {
  const host = normalizeLogoDomain(domain);
  if (!host) return null;
  return { primary: getLogoUrl(host), fallback: getLogoFallbackUrl(host) };
}

export function isMissingLogoUrl(url: string | null | undefined): boolean {
  return !url?.trim();
}
