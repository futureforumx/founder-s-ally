import type { NormalizedOrganization, NormalizedPerson, NormalizedRole } from "./normalized.types";

// ─── Adapter contract ─────────────────────────────────────────────────────────

export interface SourceRecord {
  sourceAdapter: string;
  sourceUrl: string;
  sourceId?: string;
  rawPayload: Record<string, unknown>;
  entityType: "organization" | "person";
}

export interface AdapterResult {
  organizations: NormalizedOrganization[];
  people: NormalizedPerson[];
  roles: NormalizedRole[];
  sourceRecords: SourceRecord[];
}

export interface AdapterRunStats {
  fetched: number;
  normalized: number;
  skipped: number;
  errors: number;
  durationMs: number;
}

export interface AdapterConfig {
  rateLimitMs?: number;
  maxPages?: number;
  enabled?: boolean;
}

export interface IAdapter {
  readonly name: string;
  readonly version: string;
  readonly enabled: boolean;
  /** Human-readable compliance note */
  readonly complianceNote: string;

  run(config?: AdapterConfig): Promise<AdapterResult>;
  checkRobotsTxt(): Promise<boolean>;
}

// ─── Job payload types ────────────────────────────────────────────────────────

export type IngestionStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "partial";

export interface IngestionJobPayload {
  source: string;
  triggeredBy?: string;
  options?: {
    maxPages?: number;
    dryRun?: boolean;
  };
}

export interface IngestionJobResult {
  jobId: string;
  source: string;
  status: IngestionStatus;
  stats: AdapterRunStats & {
    orgsUpserted: number;
    peopleUpserted: number;
    rolesUpserted: number;
    matchDecisions: number;
  };
  error?: string;
  startedAt: Date;
  completedAt: Date;
}

// ─── Enrichment types ─────────────────────────────────────────────────────────

export interface EnrichmentResult {
  roleType?: string;
  functionType?: string;
  expertiseTags?: string[];
  stageProxy?: string;
  companyStatus?: string;
  normalizedLocation?: string;
}
