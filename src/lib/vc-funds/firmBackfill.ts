import { parseGeo } from "@/backfill/parsers/geo-parser";
import { getLogoUrl, isMissingLogoUrl, normalizeLogoDomain } from "@/lib/enrichment/logos";
import { syncLegacyLocationFromHq } from "@/lib/formatCanonicalHqLine";
import { firstPartyWebsiteFromUrl, isPressOrSocialHost } from "@/lib/latestFundingMarks";
import type { CanonicalFundDraft, ExtractedFundAnnouncement } from "./types";

const DIRECTORY_HOST_RE =
  /(^|\.)(vcsheet\.com|everythingstartups\.com|docs\.google\.com|crunchbase\.com|pitchbook\.com|signal\.nfx\.com|cbinsights\.com|tracxn\.com)\b/i;

const REGION_ONLY_RE =
  /^(global|worldwide|international|europe|eu|emea|asia|apac|asia-pacific|latam|latin america|mena|africa|north america|us|usa|united states)$/i;

export type FirmIdentityRow = {
  website_url?: string | null;
  domain?: string | null;
  logo_url?: string | null;
  hq_city?: string | null;
  hq_state?: string | null;
  hq_country?: string | null;
  location?: string | null;
  canonical_hq_locked?: boolean | null;
  linkedin_url?: string | null;
  x_url?: string | null;
  stage_focus?: string[] | null;
  thesis_verticals?: string[] | null;
  geo_focus?: string[] | null;
  description?: string | null;
  tagline?: string | null;
};

export type IncomingFirmIdentity = {
  websiteUrl: string | null;
  logoUrl: string | null;
  linkedinUrl: string | null;
  xUrl: string | null;
  hqCity: string | null;
  hqState: string | null;
  hqCountry: string | null;
  stageFocus: string[];
  thesisVerticals: string[];
  geoFocus: string[];
  description: string | null;
  tagline: string | null;
};

function blank(value: string | null | undefined): boolean {
  return !value?.trim();
}

function firstString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)),
  );
}

function metadataBag(item: ExtractedFundAnnouncement): Record<string, unknown> {
  const payload = item.rawPayload && typeof item.rawPayload === "object" ? item.rawPayload : {};
  const nested = payload.metadata && typeof payload.metadata === "object" ? (payload.metadata as Record<string, unknown>) : {};
  const meta = item.metadata && typeof item.metadata === "object" ? item.metadata : {};
  return { ...nested, ...meta, ...payload };
}

function usableWebsite(url: string | null): string | null {
  const firstParty = firstPartyWebsiteFromUrl(url);
  if (!firstParty) return null;
  const host = normalizeLogoDomain(firstParty);
  if (!host || isPressOrSocialHost(host) || DIRECTORY_HOST_RE.test(host)) return null;
  return firstParty;
}

function isPlausibleHqCity(city: string | null | undefined, state: string | null | undefined, country: string | null | undefined): boolean {
  if (!city?.trim() || REGION_ONLY_RE.test(city.trim())) return false;
  return Boolean(state?.trim() || country?.trim());
}

function mergeUnique(existing: string[] | null | undefined, incoming: string[]): string[] | null {
  if (!incoming.length) return null;
  const seen = new Set((existing ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
  const next = [...(existing ?? []).map((value) => value.trim()).filter(Boolean)];
  let added = false;
  for (const value of incoming) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    next.push(value.trim());
    added = true;
  }
  return added ? next : null;
}

export function collectIncomingFirmIdentity(
  announcements: ExtractedFundAnnouncement[],
  fund: Pick<CanonicalFundDraft, "stageFocus" | "sectorFocus" | "geographyFocus">,
): IncomingFirmIdentity {
  const bags = announcements.map(metadataBag);
  const websiteUrl =
    [
      ...announcements.map((item) => item.firmWebsiteUrl),
      ...bags.flatMap((bag) => [bag.firm_website_url, bag.website_url, bag.website]),
    ]
      .map((value) => (typeof value === "string" ? usableWebsite(value) : null))
      .find((value): value is string => Boolean(value)) ?? null;
  const logoUrl = firstString(bags.flatMap((bag) => [bag.firm_logo_url, bag.logo_url]));
  const linkedinUrl = firstString(bags.flatMap((bag) => [bag.linkedin_url, bag.linkedin]));
  const xUrl = firstString(bags.flatMap((bag) => [bag.x_url, bag.twitter_url, bag.twitter]));
  const description = firstString(bags.map((bag) => bag.description));
  const tagline = firstString(bags.map((bag) => bag.tagline));

  const hqCityDirect = firstString(bags.flatMap((bag) => [bag.hq_city, bag.city]));
  const hqStateDirect = firstString(bags.flatMap((bag) => [bag.hq_state, bag.state]));
  const hqCountryDirect = firstString(bags.flatMap((bag) => [bag.hq_country, bag.country]));
  const locationRaw = firstString(
    bags.flatMap((bag) => [bag.location, bag.headquarters, bag.hq, bag.firm_location]),
  );
  const geoValues = [
    ...stringList(fund.geographyFocus),
    ...bags.flatMap((bag) => stringList(bag.geography_focus)),
  ];
  const parsed = parseGeo(locationRaw || (geoValues.length === 1 ? geoValues[0] : null) || [hqCityDirect, hqStateDirect, hqCountryDirect].filter(Boolean).join(", "));
  const hqCity = hqCityDirect || parsed?.city || null;
  const hqState = hqStateDirect || parsed?.state || null;
  const hqCountry = hqCountryDirect || parsed?.country || null;

  return {
    websiteUrl,
    logoUrl: logoUrl && !isPressOrSocialHost(normalizeLogoDomain(logoUrl)) ? logoUrl : null,
    linkedinUrl,
    xUrl,
    hqCity: isPlausibleHqCity(hqCity, hqState, hqCountry) ? hqCity : null,
    hqState: isPlausibleHqCity(hqCity, hqState, hqCountry) ? hqState : null,
    hqCountry: isPlausibleHqCity(hqCity, hqState, hqCountry) ? hqCountry : null,
    stageFocus: [...stringList(fund.stageFocus), ...bags.flatMap((bag) => stringList(bag.stage_focus))],
    thesisVerticals: [...stringList(fund.sectorFocus), ...bags.flatMap((bag) => stringList(bag.sector_focus)), ...bags.flatMap((bag) => stringList(bag.thesis_verticals))],
    geoFocus: [...stringList(fund.geographyFocus), ...bags.flatMap((bag) => stringList(bag.geo_focus))],
    description,
    tagline,
  };
}

export function buildFirmRecordBackfillPatch(
  current: FirmIdentityRow,
  incoming: IncomingFirmIdentity,
): Record<string, unknown> | null {
  const patch: Record<string, unknown> = {};

  if (blank(current.website_url) && incoming.websiteUrl) {
    patch.website_url = incoming.websiteUrl;
  }
  const websiteForDomain = (typeof patch.website_url === "string" ? patch.website_url : current.website_url) ?? incoming.websiteUrl;
  if (blank(current.domain) && websiteForDomain) {
    const domain = normalizeLogoDomain(websiteForDomain);
    if (domain) patch.domain = domain;
  }

  if (isMissingLogoUrl(current.logo_url)) {
    if (incoming.logoUrl) {
      patch.logo_url = incoming.logoUrl;
    } else {
      const domain = (typeof patch.domain === "string" ? patch.domain : current.domain) || normalizeLogoDomain(websiteForDomain);
      if (domain) patch.logo_url = getLogoUrl(domain);
    }
  }

  if (blank(current.linkedin_url) && incoming.linkedinUrl) patch.linkedin_url = incoming.linkedinUrl;
  if (blank(current.x_url) && incoming.xUrl) patch.x_url = incoming.xUrl;
  if (blank(current.description) && incoming.description) patch.description = incoming.description;
  if (blank(current.tagline) && incoming.tagline) patch.tagline = incoming.tagline;

  const stages = mergeUnique(current.stage_focus, incoming.stageFocus);
  if (stages) patch.stage_focus = stages;
  const verticals = mergeUnique(current.thesis_verticals, incoming.thesisVerticals);
  if (verticals) patch.thesis_verticals = verticals;
  const geos = mergeUnique(current.geo_focus, incoming.geoFocus);
  if (geos) patch.geo_focus = geos;

  const hqLocked = Boolean(current.canonical_hq_locked);
  const hqEmpty = blank(current.hq_city) && blank(current.location);
  if (!hqLocked && hqEmpty && incoming.hqCity) {
    patch.hq_city = incoming.hqCity;
    if (incoming.hqState) patch.hq_state = incoming.hqState;
    if (incoming.hqCountry) patch.hq_country = incoming.hqCountry;
    const locationLine = syncLegacyLocationFromHq(incoming.hqCity, incoming.hqState, incoming.hqCountry);
    if (locationLine) patch.location = locationLine;
    patch.canonical_hq_source = "fund_promote";
    patch.canonical_hq_set_at = new Date().toISOString();
  }

  return Object.keys(patch).length ? patch : null;
}
