import { prettyWebsiteHost } from "@/lib/latestFundingDisplay";
import { resolveFirmDisplayLocation } from "@/lib/formatCanonicalHqLine";

export type FundingCompanySnapshot = {
  name: string;
  logoUrl: string | null;
  hqLine: string | null;
  description: string | null;
};

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function escapeIlike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function snapshotFromOrganization(
  row: Record<string, unknown>,
  fallbackName: string,
): FundingCompanySnapshot {
  return {
    name: asText(row.canonicalName) ?? fallbackName,
    logoUrl: asText(row.logoUrl),
    hqLine: resolveFirmDisplayLocation({
      hq_city: asText(row.city),
      hq_state: asText(row.state),
      hq_country: asText(row.country),
      legacyLocation: asText(row.location),
    }),
    description: asText(row.description),
  };
}

export function snapshotFromStartup(
  row: Record<string, unknown>,
  fallbackName: string,
): FundingCompanySnapshot {
  return {
    name: asText(row.company_name) ?? fallbackName,
    logoUrl: asText(row.logo_url),
    hqLine: resolveFirmDisplayLocation({
      hq_city: asText(row.hq_city),
      hq_state: asText(row.hq_state),
      hq_country: asText(row.hq_country),
      legacyLocation: asText(row.location),
    }),
    description: asText(row.description_short) ?? asText(row.description_long),
  };
}

export function snapshotLookupKeys(companyName: string, websiteUrl?: string | null) {
  return {
    name: companyName.trim(),
    escapedName: escapeIlike(companyName.trim()),
    host: prettyWebsiteHost(websiteUrl),
  };
}
