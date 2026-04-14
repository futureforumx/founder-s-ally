import { safeTrim } from "@/lib/utils";

/**
 * True when a "location" string should not block a firm-website HQ scrape (still fetch real HQ).
 * Enrichment often returns "Unknown", "—", etc. while the corporate site has structured address.
 */
export function isMeaninglessDisplayLocation(value: string | null | undefined): boolean {
  const t = safeTrim(value).toLowerCase();
  if (!t) return true;
  const one = t.replace(/\u2013|\u2014/g, "-");
  const meaningless = new Set([
    "-",
    "—",
    "?",
    "...",
    "…",
    "unknown",
    "n/a",
    "na",
    "tbd",
    "none",
    "n/a.",
  ]);
  if (meaningless.has(t) || meaningless.has(one)) return true;
  return false;
}

/**
 * Guard against sentence-like blobs accidentally mapped into location fields.
 * Accepts normal city/state/country lines; rejects bios and long descriptive text.
 */
export function isPlausibleLocationLine(value: string | null | undefined): boolean {
  const t = safeTrim(value);
  if (!t) return false;
  if (isMeaninglessDisplayLocation(t)) return false;
  if (t.length > 80) return false;
  if (/[.!?;:]/.test(t)) return false;
  if (/\bis an?\b|\bat\b|\bpartner\b|\binvestor\b|\bfounder\b/i.test(t)) return false;
  return true;
}
