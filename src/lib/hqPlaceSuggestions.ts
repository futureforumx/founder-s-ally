/**
 * Typeahead for company HQ city, state, and country.
 * Place names are derived from GeoNames (https://www.geonames.org/), CC BY 4.0.
 * US states are stored as postal codes (NY). Other subdivisions are stored as names.
 */
import places from "@/data/hqPlaces.json";

export type HqSuggestion = {
  key: string;
  label: string;
  detail: string;
  city?: string;
  state?: string;
  country?: string;
};

type CountryRec = { name: string; code: string; folded: string; aliases: string[] };
type StateRec = { cc: string; admin: string; name: string; save: string; folded: string; aliases: string[] };
type CityRec = { cc: string; admin: string; name: string; folded: string; extras: string[] };

const data = places as {
  countries: [string, string, string][];
  states: [string, string, string, string, string][];
  cities: [string, string, string, string?][];
};

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function splitAliases(value: string): string[] {
  return value.split("|").map(fold).filter(Boolean);
}

function displayCity(cc: string, admin: string, name: string): string {
  if (cc === "US" && admin === "NY" && name === "New York City") return "New York";
  return name;
}

function cityNicknames(cc: string, admin: string, name: string): string[] {
  if (cc === "US" && admin === "NY" && name === "New York City") return ["nyc"];
  if (cc === "US" && admin === "CA" && name === "San Francisco") return ["sf"];
  if (cc === "US" && admin === "CA" && name === "Los Angeles") return ["la"];
  if (cc === "US" && admin === "DC" && name === "Washington") return ["dc"];
  return [];
}

const countries: CountryRec[] = data.countries.map(([name, code, aliases]) => ({
  name,
  code,
  folded: fold(name),
  aliases: [...new Set([...splitAliases(aliases), code.toLowerCase()])],
}));

const states: StateRec[] = data.states
  .map(([cc, admin, name, save, aliases]) => ({
    cc,
    admin,
    name,
    save,
    folded: fold(name),
    aliases: [...new Set([...splitAliases(aliases), fold(save), fold(name)])],
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const cities: CityRec[] = data.cities.map(([cc, admin, name, alias]) => {
  const save = displayCity(cc, admin, name);
  const folded = fold(save);
  const extras = new Set<string>();
  const raw = fold(name);
  if (raw && raw !== folded) extras.add(raw);
  if (alias) {
    const foldedAlias = fold(alias);
    if (foldedAlias && foldedAlias !== folded) extras.add(foldedAlias);
  }
  for (const nick of cityNicknames(cc, admin, name)) extras.add(nick);
  return { cc, admin, name: save, folded, extras: [...extras] };
});

const countryByCode = new Map(countries.map((country) => [country.code, country]));
const stateByKey = new Map(states.map((state) => [`${state.cc}|${state.admin}`, state]));

function score(query: string, folded: string, aliases: string[]): number {
  if (!query) return 99;
  if (folded === query || aliases.includes(query)) return 0;
  if (folded.startsWith(query) || aliases.some((alias) => alias.startsWith(query))) return 1;
  if (folded.includes(query) || aliases.some((alias) => alias.includes(query))) return 2;
  return 99;
}

function takeMatches<T>(items: T[], query: string, limit: number, rank: (item: T) => number, allowContains: boolean): T[] {
  const exact: T[] = [];
  const prefix: T[] = [];
  const contains: T[] = [];
  for (const item of items) {
    const ranked = rank(item);
    if (ranked === 0) exact.push(item);
    else if (ranked === 1) {
      if (prefix.length < limit) prefix.push(item);
    } else if (allowContains && ranked === 2 && contains.length < limit) {
      contains.push(item);
    }
  }
  return [...exact, ...prefix, ...contains].slice(0, limit);
}

function matchingCountries(value: string | null): CountryRec[] | null {
  const query = fold(value ?? "");
  if (!query) return null;
  const exact = countries.filter((country) => country.folded === query || country.aliases.includes(query));
  if (exact.length) return exact;
  const prefix = countries.filter((country) =>
    country.folded.startsWith(query) || country.aliases.some((alias) => alias.startsWith(query)),
  );
  return prefix.length === 1 ? prefix : null;
}

function matchingStates(value: string | null, countryCodes: Set<string> | null): StateRec[] | null {
  const query = fold(value ?? "");
  if (!query) return null;
  const pool = countryCodes ? states.filter((state) => countryCodes.has(state.cc)) : states;
  const exact = pool.filter((state) => state.folded === query || state.aliases.includes(query));
  if (exact.length) return exact;
  const prefix = pool.filter((state) =>
    state.folded.startsWith(query) || state.aliases.some((alias) => alias.startsWith(query)),
  );
  return prefix.length === 1 ? prefix : null;
}

function countryName(code: string): string {
  return countryByCode.get(code)?.name ?? code;
}

function stateLabel(state: StateRec | undefined): string {
  if (!state) return "";
  return state.save === state.name ? state.name : state.save;
}

export function suggestHqCountries(query: string, limit = 8): HqSuggestion[] {
  const folded = fold(query);
  if (folded.length < 1) return [];
  return takeMatches(countries, folded, limit, (country) => score(folded, country.folded, country.aliases), folded.length >= 4).map((country) => ({
    key: country.code,
    label: country.name,
    detail: country.code,
    country: country.name,
  }));
}

export function suggestHqStates(query: string, country: string | null, limit = 8): HqSuggestion[] {
  const folded = fold(query);
  if (folded.length < 1) return [];
  const countryHits = matchingCountries(country);
  const countryCodes = countryHits ? new Set(countryHits.map((hit) => hit.code)) : null;
  const pool = countryCodes ? states.filter((state) => countryCodes.has(state.cc)) : states;
  return takeMatches(pool, folded, limit, (state) => score(folded, state.folded, state.aliases), folded.length >= 4).map((state) => ({
    key: `${state.cc}|${state.admin}`,
    label: state.name,
    detail: [state.save === state.name ? "" : state.save, countryName(state.cc)].filter(Boolean).join(" · "),
    state: state.save,
    country: countryName(state.cc),
  }));
}

export function suggestHqCities(query: string, country: string | null, state: string | null, limit = 8): HqSuggestion[] {
  const folded = fold(query);
  if (folded.length < 2) return [];
  const countryHits = matchingCountries(country);
  const countryCodes = countryHits ? new Set(countryHits.map((hit) => hit.code)) : null;
  const stateHits = matchingStates(state, countryCodes);
  const stateKeys = stateHits ? new Set(stateHits.map((hit) => `${hit.cc}|${hit.admin}`)) : null;
  const pool = cities.filter((city) => {
    if (countryCodes && !countryCodes.has(city.cc)) return false;
    if (stateKeys && !stateKeys.has(`${city.cc}|${city.admin}`)) return false;
    return true;
  });
  return takeMatches(pool, folded, limit, (city) => score(folded, city.folded, city.extras), folded.length >= 4).map((city) => {
    const region = stateByKey.get(`${city.cc}|${city.admin}`);
    return {
      key: `${city.cc}|${city.admin}|${city.name}`,
      label: city.name,
      detail: [stateLabel(region), countryName(city.cc)].filter(Boolean).join(" · "),
      city: city.name,
      state: region?.save,
      country: countryName(city.cc),
    };
  });
}
