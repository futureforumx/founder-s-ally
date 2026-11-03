import type { NormalizedMarketEntity, SourceRecord } from "./types";

const PLACEHOLDER_NAMES = new Set(["", "unknown", "n/a", "na", "none", "unnamed", "company", "startup", "founder", "team"]);
const TITLE_PREFIX = /^(?:mr|mrs|ms|dr|prof)\.?\s+/i;
const DUPLICATE_SUFFIX = /(?:\s*,?\s*(?:incorporated|inc\.?|corporation|corp\.?|limited|ltd\.?|llc|plc|gmbh|s\.?a\.?|pvt\.?\s*ltd\.?))\s*$/i;
const COUNTRIES: Record<string, string> = {
  "united states": "US", "united states of america": "US", usa: "US", "u.s.": "US",
  "united kingdom": "GB", uk: "GB", "great britain": "GB", india: "IN", canada: "CA",
  australia: "AU", germany: "DE", france: "FR", singapore: "SG", israel: "IL",
};

export function stripHtml(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

export function cleanName(value: unknown): { value: string | null; placeholder: boolean; embeddedTitle: boolean } {
  let name = stripHtml(value).normalize("NFKC").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim();
  const embeddedTitle = /\s+(?:\||—|–|,\s+)\s*(?:founder|ceo|cto|partner|director|president|investor)\b/i.test(name);
  name = name.replace(TITLE_PREFIX, "");
  let previous = "";
  while (name && name !== previous) { previous = name; name = name.replace(DUPLICATE_SUFFIX, "").trim().replace(/[,.\s]+$/, ""); }
  return { value: name || null, placeholder: PLACEHOLDER_NAMES.has(name.toLowerCase()), embeddedTitle };
}

export function normalizeWebsite(value: unknown): { url: string | null; domain: string | null } {
  if (typeof value !== "string" || !value.trim()) return { url: null, domain: null };
  try {
    const url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`);
    if (!url.hostname.includes(".") || /\s/.test(url.hostname)) return { url: null, domain: null };
    url.protocol = "https:";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.username = ""; url.password = ""; url.hash = "";
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid|ref$)/i.test(key)) url.searchParams.delete(key);
    const normalized = `${url.origin}${url.pathname.replace(/\/$/, "")}${url.search}`;
    return { url: normalized, domain: url.hostname };
  } catch { return { url: null, domain: null }; }
}

export function normalizeCountry(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const country = value.trim();
  if (/^[A-Za-z]{2}$/.test(country)) return country.toUpperCase();
  return COUNTRIES[country.toLowerCase()] ?? null;
}

export function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const raw = String(value).trim();
  if (/^\d{4}$/.test(raw)) return raw;
  if (/^\d{4}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function pick(payload: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? stripHtml(value).normalize("NFKC").replace(/\s+/g, " ").trim() : null; }

export function normalizeSourceRecord(record: SourceRecord): NormalizedMarketEntity {
  const raw = record.payload as Record<string, unknown>;
  const nameResult = cleanName(pick(raw, "name", "company_name", "firm_name", "full_name", "title"));
  const legalName = cleanName(pick(raw, "legal_name", "legalName")).value;
  const website = normalizeWebsite(pick(raw, "website", "website_url", "homepage_url", "company_url", "domain"));
  const sourceUrl = normalizeWebsite(record.sourceUrl).url ?? record.sourceUrl;
  const countryCode = normalizeCountry(pick(raw, "country_code", "countryCode", "country", "hq_country"));
  const amountValue = pick(raw, "amount", "funding_amount", "raised_amount", "amount_raised");
  const amount = amountValue == null ? null : Number(typeof amountValue === "number" ? amountValue : String(amountValue).replace(/,/g, "").replace(/[^0-9.+-]/g, ""));
  const currency = text(pick(raw, "currency", "currency_code", "amount_currency"))?.toUpperCase() ?? null;
  const linkedin = normalizeWebsite(pick(raw, "linkedin_url", "linkedin", "profile_url")).url;
  const qualityIssues: string[] = [];
  if (!record.sourceId.trim()) qualityIssues.push("missing_provider_id");
  if (!nameResult.value || nameResult.placeholder) qualityIssues.push("missing_or_placeholder_name");
  if (record.entityType === "person" && nameResult.embeddedTitle) qualityIssues.push("title_embedded_in_person_name");
  if (amountValue != null && (!Number.isFinite(amount) || amount! < 0 || amount! > 1e15)) qualityIssues.push("invalid_funding_amount");
  if (amount != null && !currency) qualityIssues.push("funding_currency_missing");
  const rawDate = pick(raw, "founded_on", "founded_date", "founding_date", "announcement_date", "announced_on", "round_date");
  const date = normalizeDate(rawDate);
  if (rawDate && !date) qualityIssues.push("invalid_date");
  if (pick(raw, "country_code", "countryCode", "country", "hq_country") && !countryCode) qualityIssues.push("unrecognized_country");
  const round = text(pick(raw, "round_type", "funding_type", "last_funding_type", "investment_stage"));
  return {
    provider: record.provider, entityType: record.entityType, sourceId: record.sourceId,
    sourceUrl, name: nameResult.value, legalName, description: text(pick(raw, "description", "short_description", "overview")),
    websiteUrl: website.url, domain: website.domain, countryCode,
    city: text(pick(raw, "city", "hq_city", "headquarters_city")),
    foundedDate: normalizeDate(pick(raw, "founded_on", "founded_date", "founding_date")),
    amount: Number.isFinite(amount) ? amount : null, currency, roundType: round,
    announcementDate: normalizeDate(pick(raw, "announcement_date", "announced_on", "round_date")),
    linkedinUrl: linkedin, raw, qualityIssues,
  };
}

export function normalizedNameKey(value: string): string {
  return cleanName(value).value?.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim() ?? "";
}
