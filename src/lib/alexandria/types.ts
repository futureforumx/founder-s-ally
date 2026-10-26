export type EntityType = "firm" | "investor" | "company" | "founder" | "operator";

export const ENTITY_TYPES: readonly EntityType[] = ["firm", "investor", "company", "founder", "operator"];

export type ConfidenceLabel = "high" | "medium" | "low";

export type FactKind = "explicit" | "inferred";

/** How the value reached us. Drives the authority ceiling for confidence. */
export type VerificationStatus =
  | "first_party" // read from the entity's own published page
  | "provider_verified" // provider returned it as a matched, verified field
  | "provider_reported" // provider returned it without verification metadata
  | "derived"; // computed by us from provider data

export type FieldValueType = "text" | "url" | "domain" | "int" | "number" | "boolean" | "date" | "text[]" | "json";

export type RefreshGroup =
  | "funding_deals" // daily
  | "roles" // 30d
  | "criteria" // 30-60d
  | "growth" // 30d
  | "profiles" // 60-90d
  | "firmographics"; // 90-180d

export type RecordRow = Record<string, unknown>;

/** A single claim extracted from a provider response, before any decision is made. */
export interface Fact {
  field: string;
  value: unknown;
  provider: string;
  capability: string;
  kind: FactKind;
  verification: VerificationStatus;
  /** False when the value came from a nested response shape the contract does not document. */
  shapeDocumented: boolean;
  sourceUrl?: string | null;
  evidence?: string | null;
  retrievedAt: string;
  /** Provider-reported match likelihood in 0..1 when the provider returns one. */
  providerLikelihood?: number | null;
  /** Identity-match score of the provider record this fact came from (set by the pipeline). */
  identityScore?: number;
}

export type DecisionAction = "apply" | "review" | "skip";

export type SkipReason =
  | "identical"
  | "empty_value"
  | "low_confidence"
  | "inferred_not_applied"
  | "manual_value_protected"
  | "existing_more_authoritative"
  | "enum_column_review_only"
  | "contact_lookup_not_authorized"
  | "invalid_value"
  | "identity_not_confirmed";

export interface FieldDecision {
  field: string;
  column: string;
  action: DecisionAction;
  reason: string;
  before: unknown;
  after: unknown;
  confidence: ConfidenceLabel;
  confidenceScore: number;
  fact: Fact;
}

export interface MatchCandidate {
  id: string;
  score: number;
  signals: string[];
}

export type IdentityOutcome =
  | { kind: "match"; confidence: ConfidenceLabel; score: number; signals: string[] }
  | { kind: "ambiguous"; score: number; signals: string[]; reason: string }
  | { kind: "no_match"; score: number; signals: string[]; reason: string };

export interface ProviderCallPlan {
  provider: string;
  capability: string;
  options: Record<string, unknown>;
  /** Fields this call is expected to fill. */
  covers: string[];
  estimatedCredits: number;
  /** True when the call returns personal contact data and needs --allow-contact-lookups. */
  contact?: boolean;
  /** Free-form note for reports. */
  note?: string;
}

export interface JobOptions {
  entity: EntityType;
  limit: number;
  batchSize: number;
  maxCredits: number;
  dailyCreditCap: number | null;
  providerCaps: Record<string, number>;
  dryRun: boolean;
  missingOnly: boolean;
  refreshStale: boolean;
  forceRefresh: boolean;
  forceAuthorized: boolean;
  recordIds: string[] | null;
  allowContactLookups: boolean;
  allowWebResearch: boolean;
  allowWrites: boolean;
  allowBillable: boolean;
  concurrency: number;
  resumeRunId: string | null;
  providers: string[] | null;
  cacheTtlHours: number;
  maxRecordCredits: number;
  /** Max rows read while ranking records (bounds full-table scans). */
  scanCap: number;
  /** Log response shapes (keys and types only, never values) for pilot review. */
  captureShapes: boolean;
  /** "provider/capability" entries whose nested response shapes were verified in a pilot. */
  trustedShapes: string[];
}

export interface CreditSummary {
  estimated: number;
  actual: number;
  byProvider: Record<string, { calls: number; estimated: number; actual: number; failures: number; cacheHits: number }>;
}
