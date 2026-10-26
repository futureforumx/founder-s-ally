import type { ExistingProvenance } from "./decide";
import type { CachedResponse, LedgerEntry } from "./executor";
import { ENTITY_SPECS } from "./fieldRegistry";
import { sameValue } from "./normalize";
import type {
  ApplyResult,
  CandidateWrite,
  DealUpsert,
  EnrichmentState,
  EnrichmentStore,
  MatchFailureWrite,
  ProvenanceWrite,
  RecordUpdate,
  ReviewItemWrite,
  RollbackResult,
  RunRecord,
  RunSummary,
  ScanOptions,
} from "./store";
import type { EntityType, RecordRow } from "./types";

interface ChangeRow {
  batchId: string;
  runId: string;
  entityType: EntityType;
  entityId: string;
  table: string;
  column: string | null;
  op: "update" | "insert_row";
  rowId: string | null;
  before: unknown;
  after: unknown;
  rolledBack: boolean;
}

/** In-memory store used by tests and by fixture-driven dry runs. Mirrors SupabaseStore semantics. */
export class MemoryStore implements EnrichmentStore {
  tables = new Map<string, RecordRow[]>();
  states = new Map<string, EnrichmentState>();
  ledger = new Map<string, LedgerEntry & { at: Date }>();
  cache = new Map<string, CachedResponse>();
  provenance: ProvenanceWrite[] = [];
  candidates: CandidateWrite[] = [];
  failures: MatchFailureWrite[] = [];
  reviews: ReviewItemWrite[] = [];
  changes: ChangeRow[] = [];
  deals: Array<DealUpsert & { id: string }> = [];
  runs = new Map<string, { run: RunRecord; summary?: RunSummary }>();
  checkpoints: Array<Record<string, unknown>> = [];
  cancelled = new Set<string>();
  /** Test hook: mutate a row between read and write to exercise conflict handling. */
  beforeApply: ((update: RecordUpdate) => void) | null = null;
  private seq = 0;

  seed(table: string, rows: RecordRow[]): void {
    this.tables.set(table, rows.map((r) => ({ ...r })));
  }

  row(table: string, id: string): RecordRow | undefined {
    return this.tables.get(table)?.find((r) => String(r.id) === id);
  }

  async scanRecords(entity: EntityType, opts: ScanOptions): Promise<RecordRow[]> {
    const spec = ENTITY_SPECS[entity];
    let rows = (this.tables.get(spec.table) ?? []).filter((r) => !spec.softDeleteColumn || r[spec.softDeleteColumn] == null);
    if (opts.recordIds) rows = rows.filter((r) => opts.recordIds!.includes(String(r[spec.idColumn])));
    return rows.slice(0, opts.scanCap).map((r) => ({ ...r }));
  }

  async loadParents(entity: EntityType, rows: RecordRow[]): Promise<Map<string, RecordRow>> {
    const p = ENTITY_SPECS[entity].parent;
    const out = new Map<string, RecordRow>();
    if (!p) return out;
    const table = this.tables.get(p.table) ?? [];
    for (const r of rows) {
      const fk = r[p.fkColumn];
      if (fk == null) continue;
      const parent = table.find((x) => String(x.id) === String(fk));
      if (parent) out.set(String(fk), { ...parent });
    }
    return out;
  }

  async loadStates(entity: EntityType, ids: string[]): Promise<Map<string, EnrichmentState>> {
    const out = new Map<string, EnrichmentState>();
    for (const id of ids) {
      const s = this.states.get(`${entity}:${id}`);
      if (s) out.set(id, { ...s });
    }
    return out;
  }

  async loadProvenance(entity: EntityType, ids: string[]): Promise<Map<string, Record<string, ExistingProvenance>>> {
    const out = new Map<string, Record<string, ExistingProvenance>>();
    for (const p of this.provenance) {
      if (p.entityType !== entity || !ids.includes(p.entityId)) continue;
      const rec = out.get(p.entityId) ?? {};
      rec[p.fieldName] = { sourcePlatform: p.sourcePlatform, confidenceScore: p.confidenceScore, scrapedAt: null };
      out.set(p.entityId, rec);
    }
    return out;
  }

  async creditsSince(since: Date): Promise<number> {
    let n = 0;
    for (const e of this.ledger.values()) {
      if (e.at >= since && ["charged", "unknown", "reserved"].includes(e.status)) n += e.creditsActual ?? e.creditsEstimated;
    }
    return n;
  }

  async upsertLedger(entry: LedgerEntry): Promise<void> {
    this.ledger.set(entry.requestId, { ...entry, at: this.ledger.get(entry.requestId)?.at ?? new Date() });
  }

  async getCache(cacheKey: string, now: Date): Promise<CachedResponse | null> {
    const hit = this.cache.get(cacheKey);
    return hit && new Date(hit.expiresAt) > now ? hit : null;
  }

  async putCache(entry: CachedResponse): Promise<void> {
    this.cache.set(entry.cacheKey, entry);
  }

  async startRun(run: RunRecord): Promise<void> {
    this.runs.set(run.runId, { run });
  }

  async finishRun(runId: string, summary: RunSummary): Promise<void> {
    const r = this.runs.get(runId);
    if (r) r.summary = summary;
  }

  async saveCheckpoint(runId: string, entity: EntityType, lastEntityId: string, lastEntityName: string, counts: Record<string, number>, status: string): Promise<void> {
    this.checkpoints.push({ runId, entity, lastEntityId, lastEntityName, ...counts, status });
  }

  async isCancelled(runId: string): Promise<boolean> {
    return this.cancelled.has(runId);
  }

  async applyRecordUpdate(batchId: string, runId: string, update: RecordUpdate): Promise<ApplyResult> {
    this.beforeApply?.(update);
    const row = this.row(update.table, update.id);
    if (!row) return { applied: false, conflict: true, columns: [] };
    for (const c of update.changes) {
      if (!sameValue(row[c.column], c.before)) return { applied: false, conflict: true, columns: [] };
    }
    for (const c of update.changes) {
      this.changes.push({
        batchId, runId, entityType: update.entity, entityId: update.id, table: update.table, column: c.column,
        op: "update", rowId: update.id, before: c.before ?? null, after: c.after, rolledBack: false,
      });
    }
    for (const c of update.changes) row[c.column] = c.after;
    if (update.touchColumn) row[update.touchColumn] = new Date().toISOString();
    return { applied: true, conflict: false, columns: update.changes.map((c) => c.column) };
  }

  async upsertDeal(batchId: string, runId: string, deal: DealUpsert): Promise<"inserted" | "exists" | "failed"> {
    if (this.deals.some((d) => d.firmId === deal.firmId && d.normalizedCompanyName === deal.normalizedCompanyName)) return "exists";
    const id = `deal-${++this.seq}`;
    this.deals.push({ ...deal, id });
    this.changes.push({
      batchId, runId, entityType: "firm", entityId: deal.firmId, table: "firm_recent_deals", column: null,
      op: "insert_row", rowId: id, before: null, after: { company_name: deal.companyName }, rolledBack: false,
    });
    return "inserted";
  }

  async saveProvenance(rows: ProvenanceWrite[]): Promise<void> {
    this.provenance.push(...rows);
  }

  async saveCandidates(rows: CandidateWrite[]): Promise<void> {
    this.candidates.push(...rows);
  }

  async saveMatchFailure(row: MatchFailureWrite): Promise<void> {
    this.failures.push(row);
  }

  async enqueueReview(item: ReviewItemWrite): Promise<void> {
    this.reviews.push(item);
  }

  async upsertState(state: EnrichmentState): Promise<void> {
    this.states.set(`${state.entityType}:${state.entityId}`, { ...state });
  }

  async rollbackBatch(batchIdOrRunId: string, _by: string, opts: { force: boolean; entityId?: string }): Promise<RollbackResult[]> {
    const rows = this.changes.filter((c) => !c.rolledBack && (c.batchId === batchIdOrRunId || c.runId === batchIdOrRunId) && (!opts.entityId || c.entityId === opts.entityId)).reverse();
    const results = new Map<string, RollbackResult>();
    for (const c of rows) {
      const res = results.get(c.batchId) ?? { batchId: c.batchId, reverted: 0, skippedConflicts: 0, deletedRows: 0 };
      results.set(c.batchId, res);
      if (c.op === "insert_row") {
        this.deals = this.deals.filter((d) => d.id !== c.rowId);
        res.deletedRows++;
        c.rolledBack = true;
        continue;
      }
      const row = this.row(c.table, c.rowId ?? c.entityId);
      if (!row || !c.column) continue;
      if (!opts.force && !sameValue(row[c.column], c.after)) {
        res.skippedConflicts++;
        continue;
      }
      row[c.column] = c.before ?? null;
      res.reverted++;
      c.rolledBack = true;
    }
    return [...results.values()];
  }
}
