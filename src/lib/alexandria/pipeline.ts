import { BudgetGuard } from "./budget";
import type { Catalog } from "./catalog";
import { decideFields, summarizeDecisions, type DecideContext } from "./decide";
import { AlexandriaExecutor, DEFAULT_EXECUTOR_CONFIG, type AlexandriaScrapePort } from "./executor";
import { ENTITY_SPECS, completenessScore, missingFields, staleGroups, type EntitySpec, type FieldSpec } from "./fieldRegistry";
import { flagDuplicateIdentities, identityFromRow, resolveIdentity, type EntityIdentity } from "./identity";
import { mapResponse, shapeSkeleton, type RelationshipClaim } from "./mappers";
import { isEmptyValue } from "./normalize";
import { planDeals } from "./relationships";
import type {
  CandidateWrite,
  EnrichmentState,
  EnrichmentStore,
  FieldChange,
  ProvenanceWrite,
  StateStatus,
} from "./store";
import { deterministicUuid } from "./stable";
import { webResearch, type WebScrapePort } from "./web";
import { planWaterfall } from "./waterfall";
import type { CreditSummary, EntityType, Fact, FieldDecision, JobOptions, RecordRow } from "./types";

export const DEFAULT_RETRY_COOLDOWN_DAYS = { no_match: 30, ambiguous: 30, failed: 3 } as const;

export function defaultJobOptions(entity: EntityType, overrides: Partial<JobOptions> = {}): JobOptions {
  return {
    entity,
    limit: 25,
    batchSize: 10,
    maxCredits: 0,
    dailyCreditCap: null,
    providerCaps: {},
    dryRun: true,
    missingOnly: true,
    refreshStale: false,
    forceRefresh: false,
    forceAuthorized: false,
    recordIds: null,
    allowContactLookups: false,
    allowWebResearch: false,
    allowWrites: false,
    allowBillable: false,
    concurrency: 1,
    minIntervalMs: 3_000,
    resumeRunId: null,
    providers: null,
    cacheTtlHours: 24 * 30,
    maxRecordCredits: 60,
    scanCap: 20_000,
    captureShapes: false,
    trustedShapes: [],
    ...overrides,
  };
}

export class OptionsError extends Error {}

/** Throws when the options would permit spend or writes without the matching explicit authorisation. */
export function validateJobOptions(o: JobOptions): void {
  const errs: string[] = [];
  if (o.limit < 1) errs.push("limit must be >= 1");
  if (o.batchSize < 1) errs.push("batchSize must be >= 1");
  if (o.allowBillable && !(o.maxCredits > 0)) errs.push("billable lookups require --max-credits > 0");
  if (o.allowWrites && o.dryRun) errs.push("writes require dry-run to be disabled (--no-dry-run)");
  if (!o.dryRun && !o.allowWrites) errs.push("--no-dry-run requires write authorisation (ALEXANDRIA_ALLOW_WRITES=1 and --apply)");
  if (o.forceRefresh && !o.forceAuthorized) errs.push("--force-refresh requires explicit authorisation (ALEXANDRIA_ALLOW_FORCE_REFRESH=1)");
  if (o.allowWebResearch && !o.allowBillable) errs.push("web research is billable and requires billable authorisation");
  if (errs.length) throw new OptionsError(errs.join("; "));
}

export type CallDisposition = "ok" | "cache" | "would_call" | "terms_blocked" | "budget" | "invalid" | "error" | "not_matched" | "ambiguous";

export interface CallLog {
  provider: string;
  capability: string;
  disposition: CallDisposition;
  credits: number;
  estimatedCredits: number;
  requestId: string | null;
  detail?: string;
}

export interface DecisionView {
  field: string;
  action: FieldDecision["action"];
  reason: string;
  confidence: FieldDecision["confidence"];
  confidenceScore: number;
  provider: string;
  capability: string;
  before: unknown;
  after: unknown;
}

export interface RecordResult {
  entity: EntityType;
  id: string;
  name: string;
  status: StateStatus | "planned";
  note: string | null;
  completenessBefore: number;
  completenessProjected: number;
  missingBefore: string[];
  plannedCredits: { base: number; worstCase: number };
  calls: CallLog[];
  decisions: DecisionView[];
  counts: { apply: number; review: number; skip: number };
  applied: string[];
  dealsInserted: number;
  creditsActual: number;
}

export interface JobReport {
  runId: string;
  mode: "dry_run" | "lookup_only" | "apply";
  entity: EntityType;
  startedAt: string;
  finishedAt: string;
  options: Record<string, unknown>;
  selected: number;
  scanned: number;
  stoppedReason: "completed" | "budget" | "cancelled" | "limit";
  results: RecordResult[];
  totals: {
    processed: number;
    enriched: number;
    unchanged: number;
    noMatch: number;
    ambiguous: number;
    failed: number;
    skipped: number;
    fieldsApplied: number;
    fieldsQueuedForReview: number;
    completenessBeforeAvg: number;
    completenessProjectedAvg: number;
  };
  credits: CreditSummary & { plannedBase: number; plannedWorstCase: number };
  blockedProviders: Array<{ provider: string; termsUrl: string | null }>;
  shapes: Record<string, unknown>;
}

export interface PipelineDeps {
  store: EnrichmentStore;
  catalog: Catalog;
  port: AlexandriaScrapePort | null;
  webPort?: WebScrapePort | null;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
  onRecord?: (r: RecordResult) => void;
  env?: Record<string, string | undefined>;
}

const CONTACT_PLACEHOLDER = "[contact value withheld]";

function toView(d: FieldDecision, spec: EntitySpec): DecisionView {
  const contact = spec.fields.find((f) => f.field === d.field)?.contact === true;
  return {
    field: d.field,
    action: d.action,
    reason: d.reason,
    confidence: d.confidence,
    confidenceScore: d.confidenceScore,
    provider: d.fact.provider,
    capability: d.fact.capability,
    before: contact ? CONTACT_PLACEHOLDER : d.before,
    after: contact ? CONTACT_PLACEHOLDER : d.after,
  };
}

/** Name-only records match weakly and are the most likely to be ambiguous, so they queue behind identifiable ones. */
const NAME_ONLY_PRIORITY_FACTOR = 0.25;

/** Higher = enrich sooner: most incomplete first, weighted by the table's own priority signal and by how identifiable the record is. */
export function priorityScore(spec: EntitySpec, row: RecordRow, identity?: EntityIdentity): number {
  const incompleteness = 100 - completenessScore(spec.entity, row);
  const raw = spec.priorityColumn ? Number(row[spec.priorityColumn]) : NaN;
  const weight = Number.isFinite(raw) ? 1 + Math.min(1, Math.max(0, raw) / 100) : 1;
  const identifiable = !identity || Boolean(identity.domain || identity.linkedinSlug);
  return incompleteness * weight * (identifiable ? 1 : NAME_ONLY_PRIORITY_FACTOR);
}

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function valueToText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return typeof v === "string" ? v : JSON.stringify(v);
}

interface Selected {
  row: RecordRow;
  id: string;
  identity: EntityIdentity;
  parent: RecordRow | null;
  state: EnrichmentState | null;
  targets: FieldSpec[];
  refreshable: Set<string>;
  priority: number;
}

export async function selectRecords(
  options: JobOptions,
  store: EnrichmentStore,
  now: Date,
  env: Record<string, string | undefined> = process.env,
): Promise<{ selected: Selected[]; scanned: number }> {
  const spec = ENTITY_SPECS[options.entity];
  const rows = await store.scanRecords(options.entity, { recordIds: options.recordIds, scanCap: options.scanCap });
  const parents = await store.loadParents(options.entity, rows);
  const ids = rows.map((r) => String(r[spec.idColumn]));
  const states = new Map<string, EnrichmentState>();
  for (let i = 0; i < ids.length; i += 200) {
    for (const [k, v] of await store.loadStates(options.entity, ids.slice(i, i + 200))) states.set(k, v);
  }

  const identities = rows.map((r) => identityFromRow(spec, r, spec.parent ? parents.get(String(r[spec.parent.fkColumn])) ?? null : null));
  if (options.recordIds) {
    // Duplicate detection must see the whole table: a twin outside the requested ids is still a twin.
    const everyRow = await store.scanRecords(options.entity, { recordIds: null, scanCap: options.scanCap });
    const everyParent = await store.loadParents(options.entity, everyRow);
    const everyIdentity = everyRow.map((r) => identityFromRow(spec, r, spec.parent ? everyParent.get(String(r[spec.parent.fkColumn])) ?? null : null));
    flagDuplicateIdentities(everyIdentity);
    const duplicated = new Set(everyIdentity.filter((i) => i.duplicateOfExisting).map((i) => i.id));
    for (const i of identities) if (duplicated.has(i.id)) i.duplicateOfExisting = true;
  } else {
    flagDuplicateIdentities(identities);
  }

  const out: Selected[] = [];
  rows.forEach((row, i) => {
    const id = ids[i];
    const state = states.get(id) ?? null;
    if (!options.recordIds) {
      if (state?.retryAfter && new Date(state.retryAfter) > now) return;
      if (options.resumeRunId && state?.lastRunId === options.resumeRunId && state.status !== "pending" && state.status !== "failed" && state.status !== "budget_stopped") return;
    }
    const missing = missingFields(options.entity, row, { includeContact: options.allowContactLookups });
    const stale = new Set(state ? staleGroups(options.entity, state.fieldLastRefreshed, now, env) : []);

    let targets: FieldSpec[] = [];
    if (options.forceRefresh) {
      targets = spec.fields.filter((f) => options.allowContactLookups || !f.contact);
    } else {
      const wantMissing = options.missingOnly || !options.refreshStale;
      const set = new Map<string, FieldSpec>();
      if (wantMissing) for (const f of missing) set.set(f.field, f);
      if (options.refreshStale && state?.lastSuccessAt) {
        for (const f of spec.fields) if (stale.has(f.group) && (options.allowContactLookups || !f.contact)) set.set(f.field, f);
      }
      targets = [...set.values()];
    }
    if (!targets.length) return;
    out.push({
      row,
      id,
      identity: identities[i],
      parent: spec.parent ? parents.get(String(row[spec.parent.fkColumn])) ?? null : null,
      state,
      targets,
      refreshable: new Set(targets.filter((t) => stale.has(t.group) || !state).map((t) => t.field)),
      priority: priorityScore(spec, row, identities[i]),
    });
  });

  out.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
  return { selected: out.slice(0, options.limit), scanned: rows.length };
}

class Pool {
  private active = 0;
  private waiters: Array<() => void> = [];
  constructor(private readonly max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.waiters.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.waiters.shift()?.();
    }
  }
}

export async function runEnrichmentJob(options: JobOptions, deps: PipelineDeps): Promise<JobReport> {
  validateJobOptions(options);
  const now = deps.now ?? (() => new Date());
  const env = deps.env ?? process.env;
  const startedAt = now();
  const spec = ENTITY_SPECS[options.entity];
  const effectiveWrites = options.allowWrites && !options.dryRun;
  const persistent = effectiveWrites || options.allowBillable;
  const mode: JobReport["mode"] = effectiveWrites ? "apply" : options.allowBillable ? "lookup_only" : "dry_run";

  const runId = options.resumeRunId ?? deterministicUuid(`${startedAt.toISOString()}\n${options.entity}\n${Math.random()}`);
  const batchId = deterministicUuid(`batch\n${runId}\n${startedAt.toISOString()}`);

  const { selected, scanned } = await selectRecords(options, deps.store, startedAt, env);

  const dailySpent = options.dailyCreditCap !== null ? await deps.store.creditsSince(utcDayStart(startedAt)) : 0;
  const budget = new BudgetGuard({
    maxCredits: options.allowBillable ? options.maxCredits : 0,
    dailyCap: options.dailyCreditCap,
    dailySpentBefore: dailySpent,
    providerCaps: options.providerCaps,
    maxRecordCredits: options.maxRecordCredits,
  });
  const executor = new AlexandriaExecutor({
    port: options.allowBillable ? deps.port : null,
    catalog: deps.catalog,
    budget,
    ledger: deps.store,
    cache: deps.store,
    config: {
      ...DEFAULT_EXECUTOR_CONFIG,
      runId,
      allowBillable: options.allowBillable,
      concurrency: Math.max(1, options.concurrency),
      minIntervalMs: Math.max(0, options.minIntervalMs),
      cacheTtlMs: options.cacheTtlHours * 3_600_000,
    },
    sleep: deps.sleep,
    now,
  });
  for (const p of deps.catalog.providers()) executor.blockFromCatalog(p);

  if (persistent) await deps.store.startRun({ runId, mode: effectiveWrites ? "production" : "dry_run", entity: options.entity, options: sanitizedOptions(options) });

  const trusted = new Set([...options.trustedShapes, ...parseList(env.ALEXANDRIA_TRUSTED_SHAPES)]);
  const shapes: Record<string, unknown> = {};
  const results: RecordResult[] = [];
  let stoppedReason: JobReport["stoppedReason"] = selected.length >= options.limit ? "limit" : "completed";
  const pool = new Pool(Math.max(1, options.concurrency));
  let halted = false;

  const processOne = async (sel: Selected): Promise<RecordResult> => {
    return processRecord(sel, {
      options, spec, deps, executor, budget, runId, batchId, trusted, shapes, effectiveWrites, now, env,
    });
  };

  for (let i = 0; i < selected.length && !halted; i += options.batchSize) {
    if (persistent && (await deps.store.isCancelled(runId))) {
      stoppedReason = "cancelled";
      break;
    }
    const batch = selected.slice(i, i + options.batchSize);
    const batchResults = await Promise.all(batch.map((s) => pool.run(() => processOne(s))));
    for (const r of batchResults) {
      results.push(r);
      deps.onRecord?.(r);
      if (r.status === "budget_stopped") {
        halted = true;
        stoppedReason = "budget";
      }
    }
    if (persistent && batchResults.length) {
      const last = batch[batch.length - 1];
      await deps.store.saveCheckpoint(
        runId,
        options.entity,
        last.id,
        last.identity.name,
        {
          processed: results.length,
          updated: results.filter((r) => r.status === "enriched").length,
          skipped: results.filter((r) => r.status === "skipped" || r.status === "unchanged").length,
          failed: results.filter((r) => r.status === "failed").length,
        },
        "in_progress",
      );
    }
  }

  const report = buildReport({ runId, mode, options, startedAt, finishedAt: now(), selected: selected.length, scanned, stoppedReason, results, budget, executor, shapes, catalog: deps.catalog });
  if (persistent) {
    await deps.store.finishRun(runId, {
      status: "completed",
      processed: report.totals.processed,
      updated: report.totals.enriched,
      failed: report.totals.failed,
      skipped: report.totals.skipped + report.totals.unchanged,
      fieldsUpdated: report.totals.fieldsApplied,
      fieldsQueuedReview: report.totals.fieldsQueuedForReview,
      creditsActual: report.credits.actual,
      stoppedReason,
    });
    await deps.store.saveCheckpoint(runId, options.entity, selected.at(-1)?.id ?? "", selected.at(-1)?.identity.name ?? "", { processed: results.length, updated: report.totals.enriched, skipped: report.totals.skipped, failed: report.totals.failed }, stoppedReason === "cancelled" ? "paused" : "completed");
  }
  return report;
}

function parseList(v: string | undefined): string[] {
  return (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

export function sanitizedOptions(o: JobOptions): Record<string, unknown> {
  return {
    entity: o.entity,
    limit: o.limit,
    batchSize: o.batchSize,
    maxCredits: o.maxCredits,
    dailyCreditCap: o.dailyCreditCap,
    providerCaps: o.providerCaps,
    dryRun: o.dryRun,
    missingOnly: o.missingOnly,
    refreshStale: o.refreshStale,
    forceRefresh: o.forceRefresh,
    allowContactLookups: o.allowContactLookups,
    allowWebResearch: o.allowWebResearch,
    allowWrites: o.allowWrites,
    allowBillable: o.allowBillable,
    recordIdsCount: o.recordIds?.length ?? null,
    providers: o.providers,
  };
}

interface RecordCtx {
  options: JobOptions;
  spec: EntitySpec;
  deps: PipelineDeps;
  executor: AlexandriaExecutor;
  budget: BudgetGuard;
  runId: string;
  batchId: string;
  trusted: Set<string>;
  shapes: Record<string, unknown>;
  effectiveWrites: boolean;
  now: () => Date;
  env: Record<string, string | undefined>;
}

async function processRecord(sel: Selected, c: RecordCtx): Promise<RecordResult> {
  const { options, spec, deps, executor } = c;
  const { row, id, identity } = sel;
  const nowIso = c.now().toISOString();
  const missingNames = missingFields(options.entity, row, { includeContact: options.allowContactLookups }).map((f) => f.field);
  const base: RecordResult = {
    entity: options.entity,
    id,
    name: identity.name,
    status: "planned",
    note: null,
    completenessBefore: completenessScore(options.entity, row),
    completenessProjected: completenessScore(options.entity, row),
    missingBefore: missingNames,
    plannedCredits: { base: 0, worstCase: 0 },
    calls: [],
    decisions: [],
    counts: { apply: 0, review: 0, skip: 0 },
    applied: [],
    dealsInserted: 0,
    creditsActual: 0,
  };

  const finish = async (status: StateStatus | "planned", note: string | null, extra: Partial<RecordResult> = {}, stateExtras: Partial<EnrichmentState> = {}): Promise<RecordResult> => {
    const result: RecordResult = { ...base, status, note, ...extra };
    if (c.effectiveWrites && status !== "planned") {
      const cooldown = status === "no_match" || status === "ambiguous" ? DEFAULT_RETRY_COOLDOWN_DAYS[status] : status === "failed" ? DEFAULT_RETRY_COOLDOWN_DAYS.failed : null;
      await deps.store.upsertState({
        entityType: options.entity,
        entityId: id,
        status,
        lastAttemptAt: nowIso,
        lastSuccessAt: status === "enriched" || status === "unchanged" ? nowIso : sel.state?.lastSuccessAt ?? null,
        lastRunId: c.runId,
        attempts: (sel.state?.attempts ?? 0) + 1,
        completenessBefore: base.completenessBefore,
        completenessAfter: result.completenessProjected,
        missingFields: missingFields(options.entity, row, { includeContact: true }).map((f) => f.field),
        fieldsUpdated: result.applied,
        fieldLastRefreshed: sel.state?.fieldLastRefreshed ?? {},
        retryAfter: cooldown ? new Date(c.now().getTime() + cooldown * 86_400_000).toISOString() : null,
        lastError: status === "failed" || status === "budget_stopped" ? note : null,
        ...stateExtras,
      });
    }
    return result;
  };

  if (identity.duplicateOfExisting) {
    if (c.effectiveWrites) {
      await deps.store.enqueueReview({
        entityType: options.entity,
        entityId: id,
        firmId: options.entity === "investor" ? String(row[spec.parent!.fkColumn] ?? "") || null : options.entity === "firm" ? id : null,
        reason: "alexandria: existing record shares its identity with another record; resolve the duplicate before enrichment",
        reviewData: { name: identity.name, domain: identity.domain },
      });
    }
    return finish("ambiguous", "duplicate existing record; skipped before any paid call");
  }
  if (!identity.name) return finish("skipped", "record has no name");

  const plan = planWaterfall({
    entity: options.entity,
    spec,
    row,
    identity,
    targets: sel.targets,
    options,
    catalog: deps.catalog,
    isBlocked: (p) => executor.isBlocked(p),
  });
  base.plannedCredits = { base: plan.baseCredits, worstCase: plan.worstCaseCredits };

  const wantsWeb = options.allowWebResearch && (options.entity === "firm" || options.entity === "company");
  if (!plan.stages.length && !wantsWeb) {
    const reasons = plan.skipped.map((s) => `${s.provider}/${s.capability}: ${s.reason}`).join("; ");
    return finish("skipped", reasons || "no applicable provider calls", {}, {});
  }

  const targetNames = new Set(sel.targets.map((t) => t.field));
  const facts: Fact[] = [];
  const claims: RelationshipClaim[] = [];
  const calls: CallLog[] = [];
  const refreshedGroups = new Set<string>();
  let anyBudgetStop = false;
  let failedCalls = 0;
  let ambiguity: string | null = null;
  let noMatch = 0;
  let okCalls = 0;
  const covered = new Set<string>();

  for (const stage of plan.stages) {
    const remaining = [...targetNames].filter((f) => !covered.has(f));
    if (stage.escalation && !remaining.some((f) => completenessFieldNames(spec).has(f))) break;
    const stageCalls = stage.calls.filter((call) => call.covers.some((f) => remaining.includes(f)));
    if (!stageCalls.length) continue;

    const outcomes = await Promise.all(
      stageCalls.map(async (call) => ({
        call,
        outcome: await executor.call(call.provider, call.capability, call.options, { entityType: options.entity, entityId: id, batchId: c.batchId }),
      })),
    );

    for (const { call, outcome } of outcomes) {
      const log: CallLog = { provider: call.provider, capability: call.capability, disposition: "ok", credits: 0, estimatedCredits: call.estimatedCredits, requestId: null };
      if (outcome.ok === false) {
        const failure = outcome as Exclude<typeof outcome, { ok: true }>;
        switch (failure.reason) {
          case "not_authorized":
            log.disposition = "would_call";
            break;
          case "terms_required":
            log.disposition = "terms_blocked";
            log.detail = failure.termsUrl ? `terms: ${failure.termsUrl}` : "provider terms not accepted";
            break;
          case "budget":
            log.disposition = "budget";
            log.detail = failure.error.message;
            anyBudgetStop = anyBudgetStop || failure.error.scope !== "record";
            break;
          case "invalid_call":
            log.disposition = "invalid";
            log.detail = failure.error.message;
            break;
          case "provider_error":
            log.disposition = "error";
            log.credits = failure.credits;
            log.detail = `${failure.code}: ${failure.message}`;
            log.requestId = failure.requestId;
            failedCalls++;
            break;
        }
        calls.push(log);
        continue;
      }

      const success = outcome as Extract<typeof outcome, { ok: true }>;
      log.disposition = success.source === "cache" ? "cache" : "ok";
      log.credits = success.credits;
      log.requestId = success.requestId;
      base.creditsActual += success.credits;
      okCalls++;

      const contract = deps.catalog.get(call.provider, call.capability);
      if (options.captureShapes) c.shapes[`${call.provider}/${call.capability}`] = shapeSkeleton(success.result.data);

      const mapped = mapResponse(call.provider, call.capability, success.result.data, contract.response?.key ?? null, {
        entity: options.entity,
        retrievedAt: nowIso,
        trustedShapes: c.trusted,
      });
      if (mapped.notes.length) log.detail = mapped.notes.join("; ");

      let identityScore: number;
      if (mapped.providerEntity) {
        const id_ = resolveIdentity(identity, mapped.providerEntity);
        if (id_.kind === "no_match") {
          log.disposition = "not_matched";
          log.detail = `identity no_match (${id_.score}): ${id_.reason}`;
          noMatch++;
          calls.push(log);
          if (c.effectiveWrites) {
            await deps.store.saveMatchFailure({
              runId: c.runId,
              entityType: options.entity,
              entityId: id,
              entityName: identity.name,
              provider: `alexandria:${call.provider}`,
              reason: id_.reason,
              candidateNames: mapped.providerEntity.name ? [mapped.providerEntity.name] : [],
            });
          }
          continue;
        }
        if (id_.kind === "ambiguous") {
          log.disposition = "ambiguous";
          log.detail = `identity ambiguous (${id_.score}): ${id_.reason}`;
          ambiguity = `${call.provider}/${call.capability}: ${id_.reason}`;
          calls.push(log);
          if (c.effectiveWrites) {
            await deps.store.enqueueReview({
              entityType: options.entity,
              entityId: id,
              firmId: options.entity === "firm" ? id : options.entity === "investor" ? String(row[spec.parent!.fkColumn] ?? "") || null : null,
              reason: `alexandria identity match is ambiguous (${call.provider}/${call.capability}): ${id_.reason}`,
              reviewData: { score: id_.score, signals: id_.signals, providerName: mapped.providerEntity.name ?? null, providerDomain: mapped.providerEntity.domain ?? null, existingName: identity.name, existingDomain: identity.domain },
            });
          }
          continue;
        }
        identityScore = id_.score;
      } else if (call.options.linkedin_url) {
        identityScore = 0.93;
      } else {
        log.detail = [log.detail, "no provider identity to verify; facts discarded"].filter(Boolean).join("; ");
        calls.push(log);
        continue;
      }

      for (const f of mapped.facts) {
        facts.push({ ...f, identityScore });
        if (targetNames.has(f.field) && !isEmptyValue(f.value)) covered.add(f.field);
      }
      for (const g of new Set(call.covers.map((f) => spec.fields.find((x) => x.field === f)?.group).filter(Boolean) as string[])) refreshedGroups.add(g);
      if (identityScore >= 0.92) claims.push(...mapped.relationships);
      calls.push(log);
    }
    if (anyBudgetStop) break;
  }

  let webCredits = 0;
  if (wantsWeb && !anyBudgetStop) {
    const needsDescription = ["description", "description_short", "description_long"].some((f) => targetNames.has(f) && !covered.has(f));
    if (needsDescription) {
      const w = await webResearch({
        runId: c.runId,
        entityType: options.entity,
        entityId: id,
        entity: options.entity as "firm" | "company",
        websiteUrl: (spec.websiteColumn ? (row[spec.websiteColumn] as string | null) : null) ?? (identity.domain ? `https://${identity.domain}` : null),
        port: options.allowBillable ? deps.webPort ?? null : null,
        budget: c.budget,
        ledger: deps.store,
        now: c.now(),
      });
      webCredits = w.credits;
      base.creditsActual += w.credits;
      calls.push({ provider: "web", capability: "scrape", disposition: w.facts.length ? "ok" : w.note.startsWith("budget") ? "budget" : options.allowBillable ? "error" : "would_call", credits: w.credits, estimatedCredits: 1, requestId: null, detail: w.note });
      for (const f of w.facts) facts.push({ ...f, identityScore: 1 });
    }
  }
  void webCredits;

  base.calls = calls;

  const decideCtx: DecideContext = {
    spec,
    row,
    identityScore: 0.95,
    provenance: (await deps.store.loadProvenance(options.entity, [id])).get(id) ?? {},
    allowContactLookups: options.allowContactLookups,
    forceRefresh: options.forceRefresh && options.forceAuthorized,
    refreshableFields: sel.refreshable,
  };
  const decisions = decideFields(facts, decideCtx);
  const counts = summarizeDecisions(decisions);
  const projected = { ...row };
  for (const d of decisions) if (d.action === "apply") projected[d.column] = d.after;

  const partial: Partial<RecordResult> = {
    calls,
    decisions: decisions.map((d) => toView(d, spec)),
    counts,
    completenessProjected: completenessScore(options.entity, projected),
    creditsActual: base.creditsActual,
  };

  const dealPlan = options.entity === "firm" ? planDeals(id, claims, { identityHigh: true }) : { upserts: [], heldForReview: [] };

  if (c.effectiveWrites) {
    const applied = decisions.filter((d) => d.action === "apply");
    const fieldChanges: FieldChange[] = applied.map((d) => ({
      column: d.column,
      before: d.before ?? null,
      after: d.after,
      provider: d.fact.provider,
      capability: d.fact.capability,
      confidenceLabel: d.confidence,
      confidenceScore: d.confidenceScore,
    }));
    let wrote = false;
    if (fieldChanges.length) {
      const res = await deps.store.applyRecordUpdate(c.batchId, c.runId, {
        entity: options.entity,
        table: spec.table,
        idColumn: spec.idColumn,
        id,
        touchColumn: spec.touchColumn,
        changes: fieldChanges,
      });
      if (res.conflict) {
        partial.note = "row changed during enrichment; nothing written, will retry next run";
        return finish("failed", partial.note, { ...partial, applied: [] });
      }
      wrote = res.applied;
      partial.applied = res.columns;
    }

    const provRows: ProvenanceWrite[] = [];
    const candRows: CandidateWrite[] = [];
    for (const d of decisions) {
      if (d.action === "skip") continue;
      const corroborating = [...new Set(facts.filter((f) => f.field === d.field && f.provider !== d.fact.provider).map((f) => `alexandria:${f.provider}`))];
      const isApplied = d.action === "apply" && wrote;
      provRows.push({
        entityType: options.entity,
        entityId: id,
        fieldName: d.column,
        oldValue: valueToText(d.before),
        newValue: valueToText(d.after),
        sourcePlatform: `alexandria:${d.fact.provider}`,
        sourceUrl: d.fact.sourceUrl ?? null,
        confidenceScore: d.confidenceScore,
        confidenceLabel: d.confidence,
        extractionMethod: `${d.fact.provider}/${d.fact.capability}`,
        matchMethod: identity.domain ? "domain" : identity.linkedinSlug ? "linkedin" : "name",
        reviewerRequired: d.action === "review",
        autoApplied: isApplied,
        rawSnippet: null,
        corroboratingSources: corroborating,
        factKind: d.fact.kind,
        verificationStatus: d.fact.verification,
        decision: `${d.action}: ${d.reason}`,
        provider: d.fact.provider,
        capability: d.fact.capability,
        creditsCost: null,
        runId: c.runId,
        batchId: c.batchId,
      });
      if (d.action === "review") {
        candRows.push({
          entityType: options.entity,
          entityId: id,
          fieldName: d.column,
          candidateValue: valueToText(d.after) ?? "",
          currentValue: valueToText(d.before),
          sourcePlatform: `alexandria:${d.fact.provider}`,
          sourceUrl: d.fact.sourceUrl ?? null,
          confidenceScore: d.confidenceScore,
          confidenceLabel: d.confidence,
          reason: d.reason,
          rawSnippet: null,
          runId: c.runId,
          provider: d.fact.provider,
          capability: d.fact.capability,
          factKind: d.fact.kind,
        });
      }
    }
    // Contact values are stored in provenance/candidates (service-role-only tables) but never surfaced in reports.
    if (provRows.length) await deps.store.saveProvenance(provRows);
    if (candRows.length) await deps.store.saveCandidates(candRows);

    if (options.entity === "firm") {
      for (const deal of dealPlan.upserts) {
        const r = await deps.store.upsertDeal(c.batchId, c.runId, deal);
        if (r === "inserted") partial.dealsInserted = (partial.dealsInserted ?? 0) + 1;
      }
      if (dealPlan.heldForReview.length) {
        await deps.store.enqueueReview({
          entityType: "firm",
          entityId: id,
          firmId: id,
          reason: "alexandria: portfolio relationships held for review (nested response shape not yet verified in a pilot)",
          reviewData: { claims: dealPlan.heldForReview.slice(0, 20).map((cl) => ({ company: cl.companyName, domain: cl.companyDomain, round: cl.roundType, date: cl.announcedOn, role: cl.role })), total: dealPlan.heldForReview.length },
        });
      }
    }
  }

  const refreshed: Record<string, string> = { ...(sel.state?.fieldLastRefreshed ?? {}) };
  for (const g of refreshedGroups) refreshed[g] = nowIso;
  const stateExtras: Partial<EnrichmentState> = { fieldLastRefreshed: refreshed };

  if (failedCalls > 0 && okCalls === 0) return finish("failed", calls.filter((x) => x.disposition === "error").map((x) => x.detail).join("; "), partial, stateExtras);
  if (anyBudgetStop && okCalls === 0) return finish("budget_stopped", "budget exhausted before this record could be enriched", partial, stateExtras);
  if (ambiguity && counts.apply === 0 && okCalls === 0) return finish("ambiguous", ambiguity, partial, stateExtras);
  if (!options.allowBillable && calls.every((x) => x.disposition === "would_call" || x.disposition === "terms_blocked") && facts.length === 0) {
    return finish("planned", "dry run: no lookups executed", partial, stateExtras);
  }
  if (noMatch > 0 && okCalls === noMatch) return finish("no_match", "provider returned a different entity", partial, stateExtras);
  if (ambiguity && counts.apply === 0) return finish("ambiguous", ambiguity, partial, stateExtras);
  if (partial.applied?.length || (!c.effectiveWrites && counts.apply > 0)) return finish("enriched", counts.review ? `${counts.review} field(s) queued for review` : null, { ...partial, applied: partial.applied ?? decisions.filter((d) => d.action === "apply").map((d) => d.column) }, stateExtras);
  return finish("unchanged", counts.review ? `${counts.review} field(s) queued for review` : "no change", partial, stateExtras);
}

function completenessFieldNames(spec: EntitySpec): Set<string> {
  return new Set(spec.fields.filter((f) => f.completeness && !f.contact).map((f) => f.field));
}

function buildReport(a: {
  runId: string;
  mode: JobReport["mode"];
  options: JobOptions;
  startedAt: Date;
  finishedAt: Date;
  selected: number;
  scanned: number;
  stoppedReason: JobReport["stoppedReason"];
  results: RecordResult[];
  budget: BudgetGuard;
  executor: AlexandriaExecutor;
  shapes: Record<string, unknown>;
  catalog: Catalog;
}): JobReport {
  const by: CreditSummary["byProvider"] = {};
  const bump = (p: string) => (by[p] ??= { calls: 0, estimated: 0, actual: 0, failures: 0, cacheHits: 0 });
  let plannedBase = 0;
  let plannedWorst = 0;
  for (const r of a.results) {
    plannedBase += r.plannedCredits.base;
    plannedWorst += r.plannedCredits.worstCase;
    for (const call of r.calls) {
      const b = bump(call.provider);
      if (call.disposition === "cache") b.cacheHits++;
      else if (call.disposition === "would_call") b.estimated += call.estimatedCredits;
      else if (call.disposition === "ok" || call.disposition === "not_matched" || call.disposition === "ambiguous") {
        b.calls++;
        b.actual += call.credits;
        b.estimated += call.estimatedCredits;
      } else if (call.disposition === "error") {
        b.calls++;
        b.failures++;
        b.actual += call.credits;
        b.estimated += call.estimatedCredits;
      }
    }
  }
  const sum = (f: (r: RecordResult) => number) => a.results.reduce((n, r) => n + f(r), 0);
  const count = (s: RecordResult["status"]) => a.results.filter((r) => r.status === s).length;
  const n = Math.max(1, a.results.length);
  const actual = a.budget.spent;
  const estimated = Object.values(by).reduce((x, p) => x + p.estimated, 0);
  return {
    runId: a.runId,
    mode: a.mode,
    entity: a.options.entity,
    startedAt: a.startedAt.toISOString(),
    finishedAt: a.finishedAt.toISOString(),
    options: sanitizedOptions(a.options),
    selected: a.selected,
    scanned: a.scanned,
    stoppedReason: a.stoppedReason,
    results: a.results,
    totals: {
      processed: a.results.length,
      enriched: count("enriched"),
      unchanged: count("unchanged"),
      noMatch: count("no_match"),
      ambiguous: count("ambiguous"),
      failed: count("failed"),
      skipped: count("skipped") + count("planned"),
      fieldsApplied: sum((r) => r.counts.apply),
      fieldsQueuedForReview: sum((r) => r.counts.review),
      completenessBeforeAvg: Math.round((sum((r) => r.completenessBefore) / n) * 10) / 10,
      completenessProjectedAvg: Math.round((sum((r) => r.completenessProjected) / n) * 10) / 10,
    },
    credits: { estimated, actual, byProvider: by, plannedBase, plannedWorstCase: plannedWorst },
    blockedProviders: a.executor.blockedProviders(),
    shapes: a.shapes,
  };
}
