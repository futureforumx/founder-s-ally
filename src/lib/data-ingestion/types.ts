export type MarketDataProvider = "crunchbase" | "tracxn";
export type MarketEntityType = "company" | "firm" | "person" | "funding_round";
export type ProcessingStatus = "raw" | "parsed" | "normalized" | "staged" | "quarantined" | "applied" | "deleted";

export interface SourceRecord<T = Record<string, unknown>> {
  provider: MarketDataProvider;
  entityType: MarketEntityType;
  sourceId: string;
  sourceUrl: string | null;
  retrievedAt: string;
  payload: T;
  payloadHash: string;
  importJobId: string;
  licenseScope: string;
}

export interface NormalizedMarketEntity {
  provider: MarketDataProvider;
  entityType: MarketEntityType;
  sourceId: string;
  sourceUrl: string | null;
  name: string | null;
  legalName: string | null;
  description: string | null;
  websiteUrl: string | null;
  domain: string | null;
  countryCode: string | null;
  city: string | null;
  foundedDate: string | null;
  amount: number | null;
  currency: string | null;
  roundType: string | null;
  announcementDate: string | null;
  linkedinUrl: string | null;
  raw: Record<string, unknown>;
  qualityIssues: string[];
}

export interface MatchCandidate {
  id: string;
  entityType: MarketEntityType;
  name: string;
  domain?: string | null;
  countryCode?: string | null;
  linkedinUrl?: string | null;
  provider?: MarketDataProvider | null;
  sourceId?: string | null;
}

export interface MatchResult {
  candidateId: string | null;
  confidence: number;
  method: "provider_id" | "domain" | "linkedin" | "name_location" | "fuzzy_name_location" | "none";
  decision: "auto_match" | "manual_review" | "keep_separate";
}

export interface ValidationIssue {
  code: string;
  message: string;
  field?: string;
  severity: "error" | "warning";
}
