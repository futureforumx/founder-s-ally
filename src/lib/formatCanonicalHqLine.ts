/**
 * Canonical HQ display: City, State (US) or City, Country (everywhere else).
 * Never City + State + Country, street lines, or postal codes.
 */

const US_STATE_NAME_TO_ABBR: Record<string, string> = {
  alabama: "AL",
  alaska: "AK",
  arizona: "AZ",
  arkansas: "AR",
  california: "CA",
  colorado: "CO",
  connecticut: "CT",
  delaware: "DE",
  florida: "FL",
  georgia: "GA",
  hawaii: "HI",
  idaho: "ID",
  illinois: "IL",
  indiana: "IN",
  iowa: "IA",
  kansas: "KS",
  kentucky: "KY",
  louisiana: "LA",
  maine: "ME",
  maryland: "MD",
  massachusetts: "MA",
  michigan: "MI",
  minnesota: "MN",
  mississippi: "MS",
  missouri: "MO",
  montana: "MT",
  nebraska: "NE",
  nevada: "NV",
  "new hampshire": "NH",
  "new jersey": "NJ",
  "new mexico": "NM",
  "new york": "NY",
  "north carolina": "NC",
  "north dakota": "ND",
  ohio: "OH",
  oklahoma: "OK",
  oregon: "OR",
  pennsylvania: "PA",
  "rhode island": "RI",
  "south carolina": "SC",
  "south dakota": "SD",
  tennessee: "TN",
  texas: "TX",
  utah: "UT",
  vermont: "VT",
  virginia: "VA",
  washington: "WA",
  "west virginia": "WV",
  wisconsin: "WI",
  wyoming: "WY",
  "district of columbia": "DC",
};

const US_STATE_ABBR = new Set(Object.values(US_STATE_NAME_TO_ABBR));

const US_COUNTRY_KEYS = new Set([
  "us",
  "usa",
  "u.s.",
  "u.s.a.",
  "u.s.a",
  "united states",
  "united states of america",
  "america",
]);

const COUNTRY_DISPLAY: Record<string, string> = {
  england: "UK",
  scotland: "UK",
  wales: "UK",
  "northern ireland": "UK",
  "united kingdom": "UK",
  uk: "UK",
  "u.k.": "UK",
  "u.k": "UK",
  gb: "UK",
  britain: "UK",
  "great britain": "UK",
  canada: "Canada",
  germany: "Germany",
  france: "France",
  israel: "Israel",
  singapore: "Singapore",
  india: "India",
  china: "China",
  japan: "Japan",
  australia: "Australia",
  netherlands: "Netherlands",
  "the netherlands": "Netherlands",
  sweden: "Sweden",
  switzerland: "Switzerland",
  ireland: "Ireland",
  spain: "Spain",
  italy: "Italy",
  brazil: "Brazil",
  uae: "UAE",
  "united arab emirates": "UAE",
  "hong kong": "Hong Kong",
  luxembourg: "Luxembourg",
  denmark: "Denmark",
  norway: "Norway",
  finland: "Finland",
  belgium: "Belgium",
  austria: "Austria",
  portugal: "Portugal",
  "south korea": "South Korea",
  korea: "South Korea",
  mexico: "Mexico",
  "new zealand": "New Zealand",
  "south africa": "South Africa",
  poland: "Poland",
  estonia: "Estonia",
  lithuania: "Lithuania",
  latvia: "Latvia",
  chile: "Chile",
  colombia: "Colombia",
  argentina: "Argentina",
  georgia: "Georgia",
  nigeria: "Nigeria",
  kenya: "Kenya",
  indonesia: "Indonesia",
  vietnam: "Vietnam",
  thailand: "Thailand",
  malaysia: "Malaysia",
  philippines: "Philippines",
  taiwan: "Taiwan",
};

const ADMIN_REGION_KEYS = new Set([
  "ontario",
  "quebec",
  "british columbia",
  "alberta",
  "manitoba",
  "saskatchewan",
  "nova scotia",
  "new brunswick",
  "england",
  "scotland",
  "wales",
  "northern ireland",
  "greater london",
  "ile de france",
  "île-de-france",
  "bavaria",
  "catalonia",
  "new south wales",
  "victoria",
]);

const CITY_TO_US_STATE: Record<string, string> = {
  burlingame: "CA",
  "san francisco": "CA",
  sf: "CA",
  "palo alto": "CA",
  "menlo park": "CA",
  "mountain view": "CA",
  "redwood city": "CA",
  atherton: "CA",
  "los altos": "CA",
  sunnyvale: "CA",
  cupertino: "CA",
  "san mateo": "CA",
  oakland: "CA",
  berkeley: "CA",
  "los angeles": "CA",
  "santa monica": "CA",
  "san jose": "CA",
  "san diego": "CA",
  "new york": "NY",
  brooklyn: "NY",
  boston: "MA",
  cambridge: "MA",
  austin: "TX",
  seattle: "WA",
  chicago: "IL",
  miami: "FL",
  denver: "CO",
  boulder: "CO",
  washington: "DC",
  atlanta: "GA",
  philadelphia: "PA",
  portland: "OR",
  phoenix: "AZ",
};

const CITY_ABBREV_TO_NAME: Record<string, string> = {
  sf: "San Francisco",
  sfo: "San Francisco",
  nyc: "New York",
  ny: "New York",
  la: "Los Angeles",
  lax: "Los Angeles",
  dc: "Washington",
  sj: "San Jose",
  sd: "San Diego",
  atl: "Atlanta",
  bos: "Boston",
  chi: "Chicago",
  sea: "Seattle",
  aus: "Austin",
  mia: "Miami",
  den: "Denver",
  phl: "Philadelphia",
  pdx: "Portland",
  slc: "Salt Lake City",
  phx: "Phoenix",
};

function trimPart(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function locationKey(part: string): string {
  return part
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleCasePhrase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      const lc = word.toLowerCase();
      if (lc === "uk") return "UK";
      if (lc === "uae") return "UAE";
      if (lc === "dc") return "DC";
      if (CITY_ABBREV_TO_NAME[lc]) return CITY_ABBREV_TO_NAME[lc];
      if (/^[A-Za-z]{2}$/.test(word)) return word.toUpperCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function stripPostal(part: string): string {
  return part
    .replace(/\s+\d{5}(?:-\d{4})?\s*$/, "")
    .replace(/\s+[A-Z]\d[A-Z]\s*\d[A-Z]\d\s*$/i, "")
    .replace(/\s+[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\s*$/i, "")
    .trim();
}

function looksLikeStreet(part: string): boolean {
  if (/^\d/.test(part)) return true;
  if (/^st\.?\s+[A-Za-z]/i.test(part)) return false;
  return (
    /\b(street|avenue|ave|boulevard|blvd|road|rd|drive|dr|lane|ln|suite|ste|floor|fl|way|pkwy|parkway)\.?\b/i.test(part) ||
    /\s(st|ct|pl)\.?$/i.test(part)
  );
}

function usStateAbbr(part: string): string | null {
  const cleaned = stripPostal(part);
  const lc = locationKey(cleaned);
  if (US_STATE_NAME_TO_ABBR[lc]) return US_STATE_NAME_TO_ABBR[lc];
  const compact = cleaned.replace(/\./g, "").toUpperCase();
  if (/^[A-Z]{2}$/.test(compact) && US_STATE_ABBR.has(compact)) return compact;
  return null;
}

function countryDisplay(part: string): string | null {
  const lc = locationKey(part);
  if (US_COUNTRY_KEYS.has(part.toLowerCase()) || US_COUNTRY_KEYS.has(lc)) return "US";
  return COUNTRY_DISPLAY[lc] ?? COUNTRY_DISPLAY[part.toLowerCase()] ?? null;
}

function isAdminRegion(part: string): boolean {
  return ADMIN_REGION_KEYS.has(locationKey(part));
}

function expandCityName(part: string): string {
  return CITY_ABBREV_TO_NAME[locationKey(part)] ?? titleCasePhrase(part);
}

/**
 * Normalize a free-text HQ / address line to `City, ST` or `City, Country`.
 */
export function normalizeHqDisplayLine(raw: string | null | undefined): string | null {
  const t = trimPart(raw);
  if (!t) return null;

  const firstHq = t.split(/[;|/]/)[0]?.replace(/\s+/g, " ").trim() ?? t;
  const parts = firstHq
    .split(",")
    .map((p) => stripPostal(p.replace(/\s+/g, " ").trim()))
    .filter(Boolean)
    .filter((p) => !looksLikeStreet(p));

  if (parts.length === 0) return null;

  const hasUsCountryToken = parts.some((p) => countryDisplay(p) === "US");

  let city: string | null = null;
  let state: string | null = null;
  let country: string | null = null;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!;
    const st = usStateAbbr(part);
    const co = countryDisplay(part);
    if (i > 0 && st) {
      if (co && co !== "US" && !hasUsCountryToken) {
        country = co;
        continue;
      }
      state = st;
      continue;
    }
    if (co) {
      country = co;
      continue;
    }
    if (isAdminRegion(part)) continue;
    if (!city) city = expandCityName(part);
  }

  if (!city) return country && country !== "US" ? country : null;

  if (!state) {
    state = CITY_TO_US_STATE[locationKey(city)] ?? CITY_TO_US_STATE[locationKey(parts[0] ?? "")] ?? null;
  }

  if (state) return `${city}, ${state}`;
  if (country && locationKey(city) !== locationKey(country)) return `${city}, ${country}`;
  return city;
}

export function formatCanonicalHqLine(
  hqCity: string | null | undefined,
  hqState: string | null | undefined,
  hqCountry: string | null | undefined,
): string | null {
  const city = trimPart(hqCity);
  const state = trimPart(hqState);
  const country = trimPart(hqCountry);
  const parts = [city, state, country].filter(Boolean);
  if (!parts.length) return null;
  return normalizeHqDisplayLine(parts.join(", "));
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
  return normalizeHqDisplayLine(args.legacyLocation);
}

/** When writing hq_* in jobs, keep deprecated `location` in sync for list views still querying it. */
export function syncLegacyLocationFromHq(
  hqCity: string | null | undefined,
  hqState: string | null | undefined,
  hqCountry: string | null | undefined,
): string | null {
  return formatCanonicalHqLine(hqCity, hqState, hqCountry);
}
