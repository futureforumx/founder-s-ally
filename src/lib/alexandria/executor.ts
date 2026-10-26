import type { AlexandriaScrapeData, AlexandriaScrapeResult } from "@mendable/firecrawl-js";
import { BudgetExceededError, type BudgetGuard } from "./budget";
import type { Catalog } from "./catalog";
import { CatalogError } from "./catalog";
import { deterministicUuid, sha256Hex, stableStringify } from "./stable";

/** Minimal slice of the Firecrawl SDK the executor depends on (injectable for tests). */
export interface AlexandriaScrapePort {
  scrape(request: {
    alexandria: { provider: string; capability: string; options?: Record<string, unknown> };
    requestId?: string;
    timeout?: number;
    integration?: string;
  }): Promise<AlexandriaScrapeData>;
}

export type LedgerStatus = "reserved" | "charged" | "no_charge" | "failed" | "unknown" | "cache_hit" | "blocked_terms";

export interface LedgerEntry {
  requestId: string;
  runId: string;
  batchId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  provider: string;
  capability: string;
  creditsEstimated: number;
  creditsActual?: number | null;
  status: LedgerStatus;
  errorCode?: string | null;
  scrapeId?: string | null;
  attemptCount: number;
}

export interface CachedResponse {
  cacheKey: string;
  provider: string;
  capability: string;
  response: unknown;
  creditsCost: number;
  requestId?: string | null;
  retrievedAt: string;
  expiresAt: string;
}

export interface LedgerPort {
  upsertLedger(entry: LedgerEntry): Promise<void>;
}

export interface CachePort {
  getCache(cacheKey: string, now: Date): Promise<CachedResponse | null>;
  putCache(entry: CachedResponse): Promise<void>;
}

export type CallOutcome =
  | { ok: true; source: "provider" | "cache"; result: AlexandriaScrapeResult & { data: unknown }; credits: number; requestId: string }
  | { ok: false; reason: "terms_required"; provider: string; termsUrl: string | null; requestId: string }
  | { ok: false; reason: "budget"; error: BudgetExceededError }
  | { ok: false; reason: "invalid_call"; error: CatalogError }
  | { ok: false; reason: "provider_error"; code: string; message: string; credits: number; uncertain: boolean; requestId: string }
  | { ok: false; reason: "not_authorized"; message: string };

export interface ExecutorConfig {
  runId: string;
  /** Without this the executor refuses every provider call (dry runs, unit tests). */
  allowBillable: boolean;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  /** Max provider calls in flight. */
  concurrency: number;
  /** Minimum spacing between call starts (ms). */
  minIntervalMs: number;
  timeoutMs: number;
  cacheTtlMs: number;
  integrationTag: string;
}

export const DEFAULT_EXECUTOR_CONFIG: Omit<ExecutorConfig, "runId"> = {
  allowBillable: false,
  maxAttempts: 4,
  baseDelayMs: 1_000,
  maxDelayMs: 30_000,
  concurrency: 2,
  minIntervalMs: 250,
  timeoutMs: 60_000,
  cacheTtlMs: 30 * 24 * 3_600_000,
  integrationTag: "_vekta-enrichment",
};

export interface ExecutorDeps {
  port: AlexandriaScrapePort | null;
  catalog: Catalog;
  budget: BudgetGuard;
  ledger: LedgerPort;
  cache: CachePort | null;
  config: ExecutorConfig;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  random?: () => number;
}

export interface CallContext {
  entityType: string;
  entityId: string;
  batchId?: string | null;
}

/** Extract an HTTP-ish status/code from the SDK error without depending on its class identity. */
function describeError(err: unknown): { status?: number; code?: string; message: string; chargeId?: string; requiresAction?: { type?: string; url?: string } } {
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- provider error shapes vary
  const e = err as Record<string, any> | null;
  return {
    status: typeof e?.status === "number" ? e.status : undefined,
    code: typeof e?.code === "string" ? e.code : undefined,
    message: err instanceof Error ? err.message : String(err),
    chargeId: typeof e?.chargeId === "string" ? e.chargeId : undefined,
    requiresAction: e?.requiresAction ?? e?.details?.requiresAction,
  };
}

function isTermsError(d: ReturnType<typeof describeError>): boolean {
  return d.code === "THIRD_PARTY_DATA_TERMS_REQUIRED" || d.requiresAction?.type === "accept_terms";
}

function isRetryable(d: { status?: number; code?: string; message: string }): boolean {
  if (d.status !== undefined) return d.status === 408 || d.status === 429 || d.status >= 500;
  if (d.code && /timeout|rate_limit|temporar|unavailable|upstream/i.test(d.code)) return true;
  return /timeout|timed out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|fetch failed|network|socket hang up/i.test(d.message);
}

class Semaphore {
  private waiters: Array<() => void> = [];
  private active = 0;
  constructor(private readonly max: number) {}
  async acquire(): Promise<void> {
    if (this.active < this.max) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active++;
  }
  release(): void {
    this.active--;
    this.waiters.shift()?.();
  }
}

export function cacheKeyFor(provider: string, capability: string, options: Record<string, unknown>): string {
  return sha256Hex(`${provider}\n${capability}\n${stableStringify(options)}`);
}

/**
 * Deterministic idempotency key. The same run + entity + call + options always yields the same
 * request id, so a retry (or a resumed run) replays instead of charging again.
 */
export function requestIdFor(runId: string, ctx: CallContext, provider: string, capability: string, options: Record<string, unknown>): string {
  return deterministicUuid(`${runId}\n${ctx.entityType}:${ctx.entityId}\n${provider}/${capability}\n${stableStringify(options)}`);
}

export class AlexandriaExecutor {
  private readonly sem: Semaphore;
  private lastStart = 0;
  private readonly blocked = new Map<string, string | null>();
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;
  private readonly random: () => number;
  private gate: Promise<void> = Promise.resolve();
  private cacheHits = 0;

  constructor(private readonly deps: ExecutorDeps) {
    this.sem = new Semaphore(Math.max(1, deps.config.concurrency));
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = deps.now ?? (() => new Date());
    this.random = deps.random ?? Math.random;
  }

  isBlocked(provider: string): boolean {
    return this.blocked.has(provider);
  }

  blockedProviders(): Array<{ provider: string; termsUrl: string | null }> {
    return [...this.blocked.entries()].map(([provider, termsUrl]) => ({ provider, termsUrl }));
  }

  /** Mark a provider as blocked from catalog metadata (terms known to be pending) without calling it. */
  blockFromCatalog(provider: string): void {
    if (this.deps.catalog.termsRequired(provider) === true && !this.blocked.has(provider)) {
      this.blocked.set(provider, this.deps.catalog.snapshot.providers[provider]?.termsUrl ?? null);
    }
  }

  private async paceStart(): Promise<void> {
    const prev = this.gate;
    let release!: () => void;
    this.gate = new Promise<void>((r) => (release = r));
    await prev;
    const wait = this.lastStart + this.deps.config.minIntervalMs - Date.now();
    if (wait > 0) await this.sleep(wait);
    this.lastStart = Date.now();
    release();
  }

  async call(
    provider: string,
    capability: string,
    options: Record<string, unknown>,
    ctx: CallContext,
  ): Promise<CallOutcome> {
    const { catalog, budget, ledger, cache, config } = this.deps;

    try {
      catalog.validateCall(provider, capability, options);
    } catch (err) {
      if (err instanceof CatalogError) return { ok: false, reason: "invalid_call", error: err };
      throw err;
    }

    const requestId = requestIdFor(config.runId, ctx, provider, capability, options);
    const estimated = catalog.price(provider, capability, 1);
    const base: Omit<LedgerEntry, "status" | "attemptCount"> = {
      requestId,
      runId: config.runId,
      batchId: ctx.batchId ?? null,
      entityType: ctx.entityType,
      entityId: ctx.entityId,
      provider,
      capability,
      creditsEstimated: estimated,
    };

    if (this.blocked.has(provider)) {
      return { ok: false, reason: "terms_required", provider, termsUrl: this.blocked.get(provider) ?? null, requestId };
    }

    const key = cacheKeyFor(provider, capability, options);
    if (cache) {
      const hit = await cache.getCache(key, this.now());
      if (hit) {
        // A cache hit must never reuse the paid call's request id, or it would overwrite the charge in the ledger.
        const hitId = deterministicUuid(`cache\n${requestId}\n${this.now().toISOString()}\n${this.cacheHits++}`);
        await ledger.upsertLedger({ ...base, requestId: hitId, creditsEstimated: 0, creditsActual: 0, status: "cache_hit", attemptCount: 0 });
        return {
          ok: true,
          source: "cache",
          result: { provider, capability, creditsCost: 0, data: hit.response } as AlexandriaScrapeResult & { data: unknown },
          credits: 0,
          requestId,
        };
      }
    }

    if (!config.allowBillable || !this.deps.port) {
      return {
        ok: false,
        reason: "not_authorized",
        message: "Billable Alexandria calls are not authorized for this run (dry run or ALEXANDRIA_ALLOW_BILLABLE not set).",
      };
    }

    let reservation;
    try {
      reservation = budget.reserve(provider, estimated, `${ctx.entityType}:${ctx.entityId}`);
    } catch (err) {
      if (err instanceof BudgetExceededError) return { ok: false, reason: "budget", error: err };
      throw err;
    }

    await ledger.upsertLedger({ ...base, status: "reserved", attemptCount: 0 });

    await this.sem.acquire();
    try {
      let attempt = 0;
      let lastError: ReturnType<typeof describeError> | null = null;
      while (attempt < config.maxAttempts) {
        attempt++;
        await this.paceStart();
        try {
          const data = await this.deps.port.scrape({
            alexandria: { provider, capability, options },
            requestId,
            timeout: config.timeoutMs,
            integration: config.integrationTag,
          });
          const result = (data.alexandria ?? [])[0] as AlexandriaScrapeResult | undefined;
          const total = typeof data.creditsCost === "number" ? data.creditsCost : 0;

          if (!result) {
            budget.commit(reservation, total);
            await ledger.upsertLedger({ ...base, creditsActual: total, status: total > 0 ? "charged" : "no_charge", errorCode: "empty_result", scrapeId: data.scrapeId, attemptCount: attempt });
            return { ok: false, reason: "provider_error", code: "empty_result", message: "Alexandria returned no result entry.", credits: total, uncertain: false, requestId };
          }

          if ("error" in result && result.error) {
            const perCall = result.error;
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- provider error shapes vary
            const d = { status: perCall.status, code: perCall.code, message: perCall.message, chargeId: perCall.chargeId, requiresAction: (perCall as any).requiresAction };
            if (isTermsError(d)) {
              this.blocked.set(provider, d.requiresAction?.url ?? null);
              budget.release(reservation);
              await ledger.upsertLedger({ ...base, creditsActual: 0, status: "blocked_terms", errorCode: d.code ?? "terms_required", attemptCount: attempt });
              return { ok: false, reason: "terms_required", provider, termsUrl: d.requiresAction?.url ?? null, requestId };
            }
            if (isRetryable(d) && attempt < config.maxAttempts) {
              lastError = d;
              await this.backoff(attempt);
              continue;
            }
            const charged = total > 0 || Boolean(d.chargeId);
            budget.commit(reservation, charged ? Math.max(total, 0) || estimated : 0);
            await ledger.upsertLedger({ ...base, creditsActual: charged ? total || null : 0, status: charged ? "charged" : "failed", errorCode: d.code, scrapeId: data.scrapeId, attemptCount: attempt });
            return { ok: false, reason: "provider_error", code: d.code ?? "provider_error", message: d.message, credits: total, uncertain: charged && total === 0, requestId };
          }

          const okResult = result as AlexandriaScrapeResult & { data: unknown };
          const credits = typeof okResult.creditsCost === "number" ? okResult.creditsCost : total;
          budget.commit(reservation, credits);
          await ledger.upsertLedger({ ...base, creditsActual: credits, status: credits > 0 ? "charged" : "no_charge", scrapeId: data.scrapeId, attemptCount: attempt });
          if (cache && okResult.data !== undefined && okResult.data !== null) {
            const now = this.now();
            await cache.putCache({
              cacheKey: key,
              provider,
              capability,
              response: okResult.data,
              creditsCost: credits,
              requestId,
              retrievedAt: now.toISOString(),
              expiresAt: new Date(now.getTime() + config.cacheTtlMs).toISOString(),
            });
          }
          return { ok: true, source: "provider", result: okResult, credits, requestId };
        } catch (err) {
          const d = describeError(err);
          if (isTermsError(d)) {
            this.blocked.set(provider, d.requiresAction?.url ?? null);
            budget.release(reservation);
            await ledger.upsertLedger({ ...base, creditsActual: 0, status: "blocked_terms", errorCode: d.code ?? "terms_required", attemptCount: attempt });
            return { ok: false, reason: "terms_required", provider, termsUrl: d.requiresAction?.url ?? null, requestId };
          }
          lastError = d;
          if (isRetryable(d) && attempt < config.maxAttempts) {
            await this.backoff(attempt);
            continue;
          }
          break;
        }
      }

      const d = lastError ?? { message: "unknown error" };
      const mayHaveCharged = Boolean(d.chargeId) || d.status === undefined || d.status >= 500 || d.status === 408;
      budget.commit(reservation, mayHaveCharged ? estimated : 0);
      await ledger.upsertLedger({
        ...base,
        creditsActual: mayHaveCharged ? null : 0,
        status: mayHaveCharged ? "unknown" : "failed",
        errorCode: d.code ?? (d.status ? String(d.status) : "error"),
        attemptCount: attempt,
      });
      return { ok: false, reason: "provider_error", code: d.code ?? "error", message: d.message, credits: 0, uncertain: mayHaveCharged, requestId };
    } finally {
      this.sem.release();
    }
  }

  private async backoff(attempt: number): Promise<void> {
    const { baseDelayMs, maxDelayMs } = this.deps.config;
    const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1));
    const jitter = exp * 0.25 * this.random();
    await this.sleep(exp + jitter);
  }
}
