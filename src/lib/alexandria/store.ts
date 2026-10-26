import type { CachePort, LedgerPort } from "./executor";
import type { ExistingProvenance } from "./decide";
import type { ConfidenceLabel, EntityType, RecordRow } from "./types";

export type StateStatus = "pending" | "enriched" | "unchanged" | "no_match" | "ambiguous" | "failed" | "skipped" | "budget_stopped";

export interface EnrichmentState {
  entityType: EntityType;
  entityId: string;
  status: StateStatus;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastRunId: string | null;
  attempts: number;
  completenessBefore: number | null;
  completenessAfter: number | null;
  missingFields: string[];
  fieldsUpdated: string[];
  /** Refresh group -> ISO time of the last successful provider refresh covering it. */
  fieldLastRefreshed: Record<string, string>;
  retryAfter: string | null;
  lastError: string | null;
}

export interface ProvenanceWrite {
  entityType: EntityType;
  entityId: string;
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  sourcePlatform: string;
  sourceUrl: string | null;
  confidenceScore: number;
  confidenceLabel: ConfidenceLabel;
  extractionMethod: string;
  matchMethod: string;
  reviewerRequired: boolean;
  autoApplied: boolean;
  rawSnippet: string | null;
  corroboratingSources: string[];
  factKind: "explicit" | "inferred";
  verificationStatus: string;
  decision: string;
  provider: string;
  capability: string;
  creditsCost: number | null;
  runId: string;
  batchId: string;
}

export interface CandidateWrite {
  entityType: EntityType;
  entityId: string;
  fieldName: string;
  candidateValue: string;
  currentValue: string | null;
  sourcePlatform: string;
  sourceUrl: string | null;
  confidenceScore: number;
  confidenceLabel: ConfidenceLabel;
  reason: string;
  rawSnippet: string | null;
  runId: string;
  provider: string;
  capability: string;
  factKind: "explicit" | "inferred";
}

export interface MatchFailureWrite {
  runId: string;
  entityType: EntityType;
  entityId: string;
  entityName: string;
  provider: string;
  reason: string;
  candidateNames: string[];
}

export interface ReviewItemWrite {
  entityType: EntityType;
  entityId: string;
  firmId: string | null;
  reason: string;
  reviewData: Record<string, unknown>;
}

export interface FieldChange {
  column: string;
  before: unknown;
  after: unknown;
  provider: string;
  capability: string;
  confidenceLabel: ConfidenceLabel;
  confidenceScore: number;
}

export interface RecordUpdate {
  entity: EntityType;
  table: string;
  idColumn: string;
  id: string;
  touchColumn: string | null;
  changes: FieldChange[];
}

export interface ApplyResult {
  applied: boolean;
  /** Set when the row changed between read and write; nothing was written. */
  conflict: boolean;
  columns: string[];
}

export interface DealUpsert {
  firmId: string;
  companyName: string;
  normalizedCompanyName: string;
  amountText: string | null;
  stage: string | null;
  dateAnnounced: string | null;
  website: string | null;
  sourceUrl: string | null;
  confidence: number;
  provider: string;
}

export interface RunRecord {
  runId: string;
  mode: "dry_run" | "production";
  entity: EntityType;
  options: Record<string, unknown>;
}

export interface RunSummary {
  status: "completed" | "failed" | "paused";
  processed: number;
  updated: number;
  failed: number;
  skipped: number;
  fieldsUpdated: number;
  fieldsQueuedReview: number;
  creditsActual: number;
  [k: string]: unknown;
}

export interface ScanOptions {
  recordIds: string[] | null;
  /** Hard cap on rows read while ranking; keeps full-table scans bounded. */
  scanCap: number;
}

export interface RollbackResult {
  batchId: string;
  reverted: number;
  skippedConflicts: number;
  deletedRows: number;
}

export interface EnrichmentStore extends LedgerPort, CachePort {
  scanRecords(entity: EntityType, opts: ScanOptions): Promise<RecordRow[]>;
  loadParents(entity: EntityType, rows: RecordRow[]): Promise<Map<string, RecordRow>>;
  loadStates(entity: EntityType, ids: string[]): Promise<Map<string, EnrichmentState>>;
  loadProvenance(entity: EntityType, ids: string[]): Promise<Map<string, Record<string, ExistingProvenance>>>;
  /** Credits (actual, else estimated) booked on the ledger since the given instant. */
  creditsSince(since: Date): Promise<number>;

  startRun(run: RunRecord): Promise<void>;
  finishRun(runId: string, summary: RunSummary): Promise<void>;
  saveCheckpoint(runId: string, entity: EntityType, lastEntityId: string, lastEntityName: string, counts: { processed: number; updated: number; skipped: number; failed: number }, status: "in_progress" | "completed" | "failed" | "paused"): Promise<void>;
  isCancelled(runId: string): Promise<boolean>;

  applyRecordUpdate(batchId: string, runId: string, update: RecordUpdate): Promise<ApplyResult>;
  upsertDeal(batchId: string, runId: string, deal: DealUpsert): Promise<"inserted" | "exists" | "failed">;
  saveProvenance(rows: ProvenanceWrite[]): Promise<void>;
  saveCandidates(rows: CandidateWrite[]): Promise<void>;
  saveMatchFailure(row: MatchFailureWrite): Promise<void>;
  enqueueReview(item: ReviewItemWrite): Promise<void>;
  upsertState(state: EnrichmentState): Promise<void>;

  rollbackBatch(batchIdOrRunId: string, by: string, opts: { force: boolean }): Promise<RollbackResult[]>;
}
