/**
 * geo-parser.ts
 * ==============
 * Normalize free-text geographies to canonical region tags.
 */

export interface ParsedGeo {
  city?: string;
  state?: string;
  country?: string;
  region?: string;        // "North America" | "Europe" | "Asia-Pacific" | "LatAm" | "MENA" | "Global"
  raw: string;
}

const COUNTRIES: Record<string, { code: string; region: string }> = {
  "united states":  { code: "US", region: "North America" },
  "usa":            { code: "US", region: "North America" },
  "us":             { code: "US", region: "North America" },
  "canada":         { code: "CA", region: "North America" },
  "mexico":         { code: "MX", region: "North America" },
  "united kingdom": { code: "GB", region: "Europe" },
  "uk":             { code: "GB", region: "Europe" },
  "germany":        { code: "DE", region: "Europe" },
  "france":         { code: "FR", region: "Europe" },
  "netherlands":    { code: "NL", region: "Europe" },
  "spain":          { code: "ES", region: "Europe" },
  "italy":          { code: "IT", region: "Europe" },
  "sweden":         { code: "SE", region: "Europe" },
  "ireland":        { code: "IE", region: "Europe" },
  "israel":         { code: "IL", region: "MENA" },
  "united arab emirates": { code: "AE", region: "MENA" },
  "uae":            { code: "AE", region: "MENA" },
  "saudi arabia":   { code: "SA", region: "MENA" },
  "india":          { code: "IN", region: "Asia-Pacific" },
  "singapore":      { code: "SG", region: "Asia-Pacific" },
  "china":          { code: "CN", region: "Asia-Pacific" },
  "japan":          { code: "JP", region: "Asia-Pacific" },
  "south korea":    { code: "KR", region: "Asia-Pacific" },
  "australia":      { code: "AU", region: "Asia-Pacific" },
  "brazil":         { code: "BR", region: "LatAm" },
  "argentina":      { code: "AR", region: "LatAm" },
  "colombia":       { code: "CO", region: "LatAm" },
  "nigeria":        { code: "NG", region: "Africa" },
  "south africa":   { code: "ZA", region: "Africa" },
  "kenya":          { code: "KE", region: "Africa" },
};

const US_STATE_ABBR: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

const US_STATE_NAMES = new Set(Object.values(US_STATE_ABBR).map(s => s.toLowerCase()));

const REGION_KEYWORDS: Array<{ rx: RegExp; region: string }> = [
  { rx: /\b(global|worldwide|international)\b/i, region: "Global" },
  { rx: /\b(europe|eu|emea)\b/i,                region: "Europe" },
  { rx: /\b(asia|apac|asia[\s-]?pacific|southeast[\s-]?asia|sea)\b/i, region: "Asia-Pacific" },
  { rx: /\b(latam|latin[\s-]?america)\b/i,       region: "LatAm" },
  { rx: /\b(mena|middle[\s-]?east)\b/i,          region: "MENA" },
  { rx: /\b(africa|sub[\s-]?saharan)\b/i,        region: "Africa" },
  { rx: /\b(north[\s-]?america|us[\s-]?canada)\b/i, region: "North America" },
  { rx: /\b(india|indian[\s-]?subcontinent)\b/i, region: "Asia-Pacific" },
];

export function parseGeo(input: string | null | undefined): ParsedGeo | null {
  if (!input) return null;
  const raw = input.trim();
  const lc = raw.toLowerCase();

  // Match "City, ST" or "City, ST, Country"
  const parts = raw.split(/,\s*/).map(p => p.trim()).filter(Boolean);

  let city: string | undefined;
  let state: string | undefined;
  let country: string | undefined;
  let region: string | undefined;

  // Detect country
  for (const [name, meta] of Object.entries(COUNTRIES)) {
    if (lc.includes(name)) {
      country = meta.code;
      region = meta.region;
      break;
    }
  }

  // Detect US state
  for (const part of parts) {
    const up = part.toUpperCase();
    if (US_STATE_ABBR[up]) { state = US_STATE_ABBR[up]; country = country ?? "US"; region = region ?? "North America"; break; }
    if (US_STATE_NAMES.has(part.toLowerCase())) { state = part; country = country ?? "US"; region = region ?? "North America"; break; }
  }

  // City is typically the first token if it's not a state/country
  if (parts.length > 0) {
    const first = parts[0];
    if (first.length >= 2 && !US_STATE_ABBR[first.toUpperCase()] && !COUNTRIES[first.toLowerCase()]) {
      city = first;
    }
  }

  // Fallback region detection
  if (!region) for (const { rx, region: r } of REGION_KEYWORDS) if (rx.test(lc)) { region = r; break; }

  return { city, state, country, region, raw };
}

/** Canonical geo focus array like ["North America", "Europe"]. */
export function parseGeoFocus(inputs: Array<string | null | undefined>): string[] {
  const out = new Set<string>();
  for (const s of inputs) {
    if (!s) continue;
    const g = parseGeo(s);
    if (g?.region) out.add(g.region);
    if (g?.country === "US" && !out.has("North America")) out.add("North America");
  }
  return [...out];
}
