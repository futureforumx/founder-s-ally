/**
 * Canonical HQ display: prefer structured hq_* on firm_records.
 * Legacy `location` is only a fallback when hq_* is empty (migration / old rows).
 */

export function formatCanonicalHqLine(
  hqCity: string | null | undefined,
  hqState: string | null | undefined,
  hqCountry: string | null | undefined,
): string | null {
  const city = typeof hqCity === "string" ? hqCity.trim() : "";
  const state = typeof hqState === "string" ? hqState.trim() : "";
  const country = typeof hqCountry === "string" ? hqCountry.trim() : "";
  const parts = [city, state, country].filter(Boolean);
  if (!parts.length) return null;
  return parts.join(", ");
}

/** Single display line for cards / profile: HQ-derived first, then legacy `location`. */
export function resolveFirmDisplayLocation(args: {
  hq_city?: string | null;
  hq_state?: string | null;
  hq_country?: string | null;
  legacyLocation?: string | null;
}): string | null {
  const fromHq = formatCanonicalHqLine(args.hq_city, args.hq_state, args.hq_country);
  if (fromHq) return fromHq;
  const leg = typeof args.legacyLocation === "string" ? args.legacyLocation.trim() : "";
  return leg.length > 0 ? leg : null;
}

/** When writing hq_* in jobs, keep deprecated `location` in sync for list views still querying it. */
export function syncLegacyLocationFromHq(
  hqCity: string | null | undefined,
  hqState: string | null | undefined,
  hqCountry: string | null | undefined,
): string | null {
  return formatCanonicalHqLine(hqCity, hqState, hqCountry);
}
