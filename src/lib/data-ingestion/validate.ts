import type { NormalizedMarketEntity, ValidationIssue } from "./types";

const KNOWN_ROUNDS: Record<string, string> = {
  "pre seed": "Pre-Seed", "pre-seed": "Pre-Seed", seed: "Seed", "series a": "Series A", "series b": "Series B",
  "series c": "Series C", "series d": "Growth", growth: "Growth", angel: "Angel", accelerator: "Accelerator",
};

export function normalizeRoundType(value: string | null): string | null {
  if (!value) return null;
  return KNOWN_ROUNDS[value.toLowerCase().replace(/[_-]+/g, " ").trim()] ?? null;
}

export function validateEntity(entity: NormalizedMarketEntity): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!entity.name) issues.push({ code: "name_required", message: "Record has no usable name; keep it quarantined for review.", field: "name", severity: "error" });
  for (const item of entity.qualityIssues) {
    const severity = item === "unrecognized_country" || (item === "funding_currency_missing" && entity.entityType !== "funding_round") ? "warning" : "error";
    issues.push({ code: item, message: validationMessage(item), field: item, severity });
  }
  if (entity.websiteUrl && !/^https:\/\//.test(entity.websiteUrl)) issues.push({ code: "invalid_url", message: "Website URL is not a valid normalized HTTPS URL.", field: "websiteUrl", severity: "error" });
  if (entity.roundType && !normalizeRoundType(entity.roundType)) issues.push({ code: "unknown_round_type", message: `Funding round type '${entity.roundType}' is outside VEKTA's known stage labels; preserve the source value for review.`, field: "roundType", severity: "warning" });
  if (entity.countryCode && !/^[A-Z]{2}$/.test(entity.countryCode)) issues.push({ code: "invalid_country_code", message: "Country code must be ISO 3166-1 alpha-2.", field: "countryCode", severity: "error" });
  return issues;
}

/** Data quality only; this score is not an investor/company intelligence score. */
export function dataQualityScore(entity: NormalizedMarketEntity): number {
  const checks = [Boolean(entity.name), Boolean(entity.sourceId), Boolean(entity.sourceUrl), Boolean(entity.websiteUrl || entity.entityType !== "company"), Boolean(entity.countryCode), entity.entityType !== "funding_round" || Boolean(entity.currency || entity.amount == null)];
  const penalty = Math.min(60, entity.qualityIssues.length * 15);
  return Math.max(0, Math.round((checks.filter(Boolean).length / checks.length) * 100) - penalty);
}

function validationMessage(code: string): string {
  const messages: Record<string, string> = {
    missing_or_placeholder_name: "Name is missing or looks like a placeholder.",
    missing_provider_id: "Provider record has no stable source ID for idempotency and provenance.",
    title_embedded_in_person_name: "A role or title appears embedded in the person's name.",
    invalid_funding_amount: "Funding amount is negative, malformed, or outside the supported range.",
    funding_currency_missing: "Funding amount is present without a currency; do not assume USD.",
    invalid_date: "Date value could not be normalized; preserve the provider value for review.",
    unrecognized_country: "Country value could not be confidently mapped to ISO 3166-1.",
  };
  return messages[code] ?? `Validation flagged ${code}.`;
}
