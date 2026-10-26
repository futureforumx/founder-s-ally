import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExistingProvenance } from "./decide";
import type { CachedResponse, LedgerEntry } from "./executor";
import { ENTITY_SPECS, selectColumns } from "./fieldRegistry";
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

// The generated Supabase types do not include the new alexandria_* tables, so this store is untyped.
type Db = SupabaseClient<any, "public", any>;

const PAGE = 1000;
const IN_CHUNK = 150;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function fail(op: string, error: { message: string } | null): void {
  if (error) throw new Error(`[alexandria-store] ${op}: ${error.message}`);
}

export class SupabaseStore implements EnrichmentStore {
  constructor(private readonly db: Db) {}

  // ---------------------------------------------------------------- reads

  async scanRecords(entity: EntityType, opts: ScanOptions): Promise<RecordRow[]> {
    const spec = ENTITY_SPECS[entity];
    const cols = selectColumns(entity);
    const out: RecordRow[] = [];
    if (opts.recordIds) {
      for (const ids of chunk(opts.recordIds, IN_CHUNK)) {
        let q = this.db.from(spec.table).select(cols).in(spec.idColumn, ids);
        if (spec.softDeleteColumn) q = q.is(spec.softDeleteColumn, null);
        const { data, error } = await q;
        fail(`scan ${spec.table}`, error);
        out.push(...((data ?? []) as unknown as RecordRow[]));
      }
      return out;
    }
    for (let from = 0; out.length < opts.scanCap; from += PAGE) {
      let q = this.db.from(spec.table).select(cols).order(spec.idColumn, { ascending: true }).range(from, from + PAGE - 1);
      if (spec.softDeleteColumn) q = q.is(spec.softDeleteColumn, null);
      const { data, error } = await q;
      fail(`scan ${spec.table}`, error);
      const rows = (data ?? []) as unknown as RecordRow[];
      out.push(...rows);
      if (rows.length < PAGE) break;
    }
    return out.slice(0, opts.scanCap);
  }

  async loadParents(entity: EntityType, rows: RecordRow[]): Promise<Map<string, RecordRow>> {
    const p = ENTITY_SPECS[entity].parent;
    const out = new Map<string, RecordRow>();
    if (!p) return out;
    const ids = [...new Set(rows.map((r) => r[p.fkColumn]).filter((v): v is string => typeof v === "string"))];
    const cols = ["id", p.nameColumn, p.domainColumn, p.websiteColumn].filter(Boolean).join(",");
    for (const part of chunk(ids, IN_CHUNK)) {
      const { data, error } = await this.db.from(p.table).select(cols).in("id", part);
      fail(`load parents ${p.table}`, error);
      for (const r of (data ?? []) as unknown as RecordRow[]) out.set(String(r.id), r);
    }
    return out;
  }

  async loadStates(entity: EntityType, ids: string[]): Promise<Map<string, EnrichmentState>> {
    const out = new Map<string, EnrichmentState>();
    for (const part of chunk(ids, IN_CHUNK)) {
      const { data, error } = await this.db.from("alexandria_enrichment_state").select("*").eq("entity_type", entity).in("entity_id", part);
      fail("load states", error);
      for (const r of (data ?? []) as Array<Record<string, any>>) {
        out.set(r.entity_id, {
          entityType: entity,
          entityId: r.entity_id,
          status: r.status,
          lastAttemptAt: r.last_attempt_at,
          lastSuccessAt: r.last_success_at,
          lastRunId: r.last_run_id,
          attempts: r.attempts ?? 0,
          completenessBefore: r.completeness_before,
          completenessAfter: r.completeness_after,
          missingFields: r.missing_fields ?? [],
          fieldsUpdated: r.fields_updated ?? [],
          fieldLastRefreshed: r.field_last_refreshed ?? {},
          retryAfter: r.retry_after,
          lastError: r.last_error,
        });
      }
    }
    return out;
  }

  async loadProvenance(entity: EntityType, ids: string[]): Promise<Map<string, Record<string, ExistingProvenance>>> {
    const out = new Map<string, Record<string, ExistingProvenance>>();
    for (const part of chunk(ids, IN_CHUNK)) {
      const { data, error } = await this.db
        .from("enrichment_field_provenance")
        .select("entity_id, field_name, source_platform, confidence_score, scraped_at, auto_applied")
        .eq("entity_type", entity)
        .in("entity_id", part)
        .order("scraped_at", { ascending: false });
      fail("load provenance", error);
      for (const r of (data ?? []) as Array<Record<string, any>>) {
        const rec = out.get(r.entity_id) ?? {};
        // Newest row wins; rows that were only queued for review do not describe the stored value.
        if (!rec[r.field_name] && r.auto_applied !== false) {
          rec[r.field_name] = { sourcePlatform: r.source_platform, confidenceScore: r.confidence_score === null ? null : Number(r.confidence_score), scrapedAt: r.scraped_at };
        }
        out.set(r.entity_id, rec);
      }
    }
    return out;
  }

  async creditsSince(since: Date): Promise<number> {
    const { data, error } = await this.db
      .from("alexandria_credit_ledger")
      .select("credits_actual, credits_estimated, status")
      .gte("created_at", since.toISOString())
      .in("status", ["charged", "unknown", "reserved"]);
    fail("credits since", error);
    return ((data ?? []) as Array<Record<string, any>>).reduce((n, r) => n + Number(r.credits_actual ?? r.credits_estimated ?? 0), 0);
  }

  // --------------------------------------------------- ledger and cache

  async upsertLedger(e: LedgerEntry): Promise<void> {
    const { error } = await this.db.from("alexandria_credit_ledger").upsert(
      {
        request_id: e.requestId,
        run_id: e.runId,
        batch_id: e.batchId ?? null,
        entity_type: e.entityType ?? null,
        entity_id: e.entityId ?? null,
        provider: e.provider,
        capability: e.capability,
        credits_estimated: e.creditsEstimated,
        credits_actual: e.creditsActual ?? null,
        status: e.status,
        error_code: e.errorCode ?? null,
        scrape_id: e.scrapeId ?? null,
        attempt_count: Math.max(1, e.attemptCount),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "request_id" },
    );
    fail("upsert ledger", error);
  }

  async getCache(cacheKey: string, now: Date): Promise<CachedResponse | null> {
    const { data, error } = await this.db.from("alexandria_provider_cache").select("*").eq("cache_key", cacheKey).gt("expires_at", now.toISOString()).maybeSingle();
    fail("get cache", error);
    if (!data) return null;
    return {
      cacheKey: data.cache_key,
      provider: data.provider,
      capability: data.capability,
      response: data.response,
      creditsCost: Number(data.credits_cost ?? 0),
      requestId: data.request_id,
      retrievedAt: data.retrieved_at,
      expiresAt: data.expires_at,
    };
  }

  async putCache(e: CachedResponse): Promise<void> {
    const { error } = await this.db.from("alexandria_provider_cache").upsert(
      {
        cache_key: e.cacheKey,
        provider: e.provider,
        capability: e.capability,
        response: e.response,
        credits_cost: e.creditsCost,
        request_id: e.requestId ?? null,
        retrieved_at: e.retrievedAt,
        expires_at: e.expiresAt,
      },
      { onConflict: "cache_key" },
    );
    fail("put cache", error);
  }

  // ------------------------------------------------------------- runs

  async startRun(run: RunRecord): Promise<void> {
    const { error } = await this.db.from("enrichment_scrape_runs").upsert(
      { run_id: run.runId, mode: run.mode, sources: ["alexandria"], status: "running", summary: { entity: run.entity, options: run.options } },
      { onConflict: "run_id", ignoreDuplicates: true },
    );
    fail("start run", error);
  }

  async finishRun(runId: string, s: RunSummary): Promise<void> {
    const { error } = await this.db
      .from("enrichment_scrape_runs")
      .update({
        finished_at: new Date().toISOString(),
        status: s.status,
        fields_updated: s.fieldsUpdated,
        fields_queued_review: s.fieldsQueuedReview,
        errors: s.failed,
        summary: s,
      })
      .eq("run_id", runId);
    fail("finish run", error);
  }

  async saveCheckpoint(
    runId: string,
    entity: EntityType,
    lastEntityId: string,
    lastEntityName: string,
    counts: { processed: number; updated: number; skipped: number; failed: number },
    status: "in_progress" | "completed" | "failed" | "paused",
  ): Promise<void> {
    const fields = {
      last_entity_id: lastEntityId || "-",
      last_entity_name: lastEntityName,
      records_processed: counts.processed,
      records_updated: counts.updated,
      records_skipped: counts.skipped,
      records_failed: counts.failed,
      status,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await this.db
      .from("enrichment_scrape_checkpoints")
      .select("id")
      .eq("run_id", runId)
      .eq("source_platform", "alexandria")
      .eq("entity_type", entity)
      .limit(1);
    fail("find checkpoint", error);
    if (data && data.length) {
      const { error: e2 } = await this.db.from("enrichment_scrape_checkpoints").update(fields).eq("id", data[0].id);
      fail("update checkpoint", e2);
    } else {
      const { error: e3 } = await this.db.from("enrichment_scrape_checkpoints").insert({ run_id: runId, source_platform: "alexandria", entity_type: entity, ...fields });
      fail("insert checkpoint", e3);
    }
  }

  /** A run is cancelled by setting its enrichment_scrape_runs.status to 'paused' (see rollback/cancel script). */
  async isCancelled(runId: string): Promise<boolean> {
    const { data, error } = await this.db.from("enrichment_scrape_runs").select("status").eq("run_id", runId).maybeSingle();
    fail("is cancelled", error);
    return data?.status === "paused";
  }

  // ----------------------------------------------------------- writes

  async applyRecordUpdate(batchId: string, runId: string, update: RecordUpdate): Promise<ApplyResult> {
    const cols = update.changes.map((c) => c.column);
    // Re-read the target columns immediately before writing: if anyone edited them since we read the row, do nothing.
    const { data: current, error } = await this.db.from(update.table).select(cols.join(",")).eq(update.idColumn, update.id).maybeSingle();
    fail("re-read before update", error);
    if (!current) return { applied: false, conflict: true, columns: [] };
    for (const c of update.changes) {
      if (!sameValue((current as unknown as Record<string, unknown>)[c.column], c.before)) return { applied: false, conflict: true, columns: [] };
    }

    // The change log is written first: a log row without a write is harmless (rollback verifies current == after), but a write without a log row would not be revertible.
    const { error: logErr } = await this.db.from("alexandria_enrichment_changes").insert(
      update.changes.map((c) => ({
        batch_id: batchId,
        run_id: runId,
        entity_type: update.entity,
        entity_id: update.id,
        table_name: update.table,
        column_name: c.column,
        op: "update",
        row_id: update.id,
        before_value: c.before ?? null,
        after_value: c.after ?? null,
        provider: c.provider,
        capability: c.capability,
        confidence_label: c.confidenceLabel,
        confidence_score: c.confidenceScore,
      })),
    );
    fail("write change log", logErr);

    const patch: Record<string, unknown> = {};
    for (const c of update.changes) patch[c.column] = c.after;
    if (update.touchColumn) patch[update.touchColumn] = new Date().toISOString();
    const { error: upErr } = await this.db.from(update.table).update(patch).eq(update.idColumn, update.id);
    fail("update record", upErr);
    return { applied: true, conflict: false, columns: cols };
  }

  async upsertDeal(batchId: string, runId: string, d: DealUpsert): Promise<"inserted" | "exists" | "failed"> {
    const { data: existing, error } = await this.db
      .from("firm_recent_deals")
      .select("id")
      .eq("firm_id", d.firmId)
      .eq("normalized_company_name", d.normalizedCompanyName)
      .limit(1);
    if (error) return "failed";
    if (existing && existing.length) return "exists";
    const { data, error: insErr } = await this.db
      .from("firm_recent_deals")
      .insert({
        firm_id: d.firmId,
        company_name: d.companyName,
        normalized_company_name: d.normalizedCompanyName,
        amount: d.amountText,
        stage: d.stage,
        date_announced: d.dateAnnounced,
        portfolio_company_website: d.website,
        source_name: `alexandria:${d.provider}`,
        source_url: d.sourceUrl,
        source_confidence: d.confidence,
      })
      .select("id")
      .maybeSingle();
    // firm_recent_deals.firm_id is a FK whose target differs across environments; a rejected insert is non-fatal.
    if (insErr || !data) return "failed";
    const { error: logErr } = await this.db.from("alexandria_enrichment_changes").insert({
      batch_id: batchId,
      run_id: runId,
      entity_type: "firm",
      entity_id: d.firmId,
      table_name: "firm_recent_deals",
      op: "insert_row",
      row_id: String(data.id),
      after_value: { company_name: d.companyName },
      provider: d.provider,
    });
    fail("log deal insert", logErr);
    return "inserted";
  }

  async saveProvenance(rows: ProvenanceWrite[]): Promise<void> {
    if (!rows.length) return;
    const { error } = await this.db.from("enrichment_field_provenance").insert(
      rows.map((r) => ({
        entity_type: r.entityType,
        entity_id: r.entityId,
        field_name: r.fieldName,
        old_value: r.oldValue,
        new_value: r.newValue,
        source_platform: r.sourcePlatform,
        source_url: r.sourceUrl,
        confidence_score: r.confidenceScore,
        extraction_method: r.extractionMethod,
        match_method: r.matchMethod,
        reviewer_required: r.reviewerRequired,
        raw_snippet: r.rawSnippet,
        corroborating_sources: r.corroboratingSources,
        auto_applied: r.autoApplied,
        run_id: r.runId,
        batch_id: r.batchId,
        provider: r.provider,
        capability: r.capability,
        credits_cost: r.creditsCost,
        confidence_label: r.confidenceLabel,
        fact_kind: r.factKind,
        verification_status: r.verificationStatus,
        decision: r.decision,
      })),
    );
    fail("save provenance", error);
  }

  async saveCandidates(rows: CandidateWrite[]): Promise<void> {
    if (!rows.length) return;
    const { error } = await this.db.from("enrichment_candidate_values").insert(
      rows.map((r) => ({
        entity_type: r.entityType,
        entity_id: r.entityId,
        field_name: r.fieldName,
        candidate_value: r.candidateValue,
        current_value: r.currentValue,
        source_platform: r.sourcePlatform,
        source_url: r.sourceUrl,
        confidence_score: r.confidenceScore,
        reason: r.reason,
        raw_snippet: r.rawSnippet,
        run_id: r.runId,
        provider: r.provider,
        capability: r.capability,
        confidence_label: r.confidenceLabel,
        fact_kind: r.factKind,
      })),
    );
    fail("save candidates", error);
  }

  async saveMatchFailure(r: MatchFailureWrite): Promise<void> {
    const { error } = await this.db.from("enrichment_match_failures").insert({
      run_id: r.runId,
      entity_type: r.entityType,
      entity_id: r.entityId,
      entity_name: r.entityName,
      source_platform: r.provider,
      failure_reason: r.reason,
      candidate_names: r.candidateNames,
    });
    fail("save match failure", error);
  }

  async enqueueReview(item: ReviewItemWrite): Promise<void> {
    const { error } = await this.db.from("enrichment_review_queue").insert({
      entity_type: "alexandria_identity_match",
      entity_id: `${item.entityType}:${item.entityId}`,
      firm_id: item.firmId,
      reason: item.reason,
      review_data: { ...item.reviewData, entity_type: item.entityType, entity_id: item.entityId },
    });
    fail("enqueue review", error);
  }

  async upsertState(s: EnrichmentState): Promise<void> {
    const { error } = await this.db.from("alexandria_enrichment_state").upsert(
      {
        entity_type: s.entityType,
        entity_id: s.entityId,
        status: s.status,
        last_attempt_at: s.lastAttemptAt,
        last_success_at: s.lastSuccessAt,
        last_run_id: s.lastRunId,
        attempts: s.attempts,
        completeness_before: s.completenessBefore,
        completeness_after: s.completenessAfter,
        missing_fields: s.missingFields,
        fields_updated: s.fieldsUpdated,
        field_last_refreshed: s.fieldLastRefreshed,
        retry_after: s.retryAfter,
        last_error: s.lastError,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "entity_type,entity_id" },
    );
    fail("upsert state", error);
  }

  // --------------------------------------------------------- rollback

  async rollbackBatch(batchIdOrRunId: string, by: string, opts: { force: boolean }): Promise<RollbackResult[]> {
    const { data, error } = await this.db
      .from("alexandria_enrichment_changes")
      .select("*")
      .is("rolled_back_at", null)
      .or(`batch_id.eq.${batchIdOrRunId},run_id.eq.${batchIdOrRunId}`)
      .order("applied_at", { ascending: false });
    fail("load changes", error);

    const results = new Map<string, RollbackResult>();
    for (const c of (data ?? []) as Array<Record<string, any>>) {
      const res = results.get(c.batch_id) ?? { batchId: c.batch_id, reverted: 0, skippedConflicts: 0, deletedRows: 0 };
      results.set(c.batch_id, res);

      if (c.op === "insert_row") {
        const { error: delErr } = await this.db.from(c.table_name).delete().eq("id", c.row_id);
        fail("rollback delete", delErr);
        res.deletedRows++;
      } else {
        const { data: cur, error: rErr } = await this.db.from(c.table_name).select(c.column_name).eq("id", c.row_id).maybeSingle();
        fail("rollback read", rErr);
        if (!cur) continue;
        if (!opts.force && !sameValue((cur as unknown as Record<string, unknown>)[c.column_name], c.after_value)) {
          res.skippedConflicts++;
          continue;
        }
        const { error: uErr } = await this.db.from(c.table_name).update({ [c.column_name]: c.before_value }).eq("id", c.row_id);
        fail("rollback update", uErr);
        res.reverted++;
      }
      const { error: mErr } = await this.db.from("alexandria_enrichment_changes").update({ rolled_back_at: new Date().toISOString(), rolled_back_by: by }).eq("id", c.id);
      fail("mark rolled back", mErr);
    }
    return [...results.values()];
  }
}
