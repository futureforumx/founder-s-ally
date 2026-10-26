import type { AlexandriaScrapeData } from "@mendable/firecrawl-js";
import { loadCatalog } from "@/lib/alexandria";
import { BudgetGuard, type BudgetLimits } from "@/lib/alexandria/budget";
import { AlexandriaExecutor, DEFAULT_EXECUTOR_CONFIG, type AlexandriaScrapePort, type ExecutorConfig } from "@/lib/alexandria/executor";
import { MemoryStore } from "@/lib/alexandria/memoryStore";

export type FakeResponder = (req: { provider: string; capability: string; options: Record<string, unknown>; requestId?: string }, attempt: number) => unknown;

/** Scripted Alexandria port. Never touches the network; records every request for assertions. */
export class FakePort implements AlexandriaScrapePort {
  calls: Array<{ provider: string; capability: string; options: Record<string, unknown>; requestId?: string }> = [];
  private attempts = new Map<string, number>();
  constructor(private readonly responder: FakeResponder) {}

  async scrape(request: Parameters<AlexandriaScrapePort["scrape"]>[0]): Promise<AlexandriaScrapeData> {
    const { provider, capability, options = {} } = request.alexandria;
    this.calls.push({ provider, capability, options, requestId: request.requestId });
    const key = request.requestId ?? `${provider}/${capability}`;
    const attempt = (this.attempts.get(key) ?? 0) + 1;
    this.attempts.set(key, attempt);
    const out = this.responder({ provider, capability, options, requestId: request.requestId }, attempt);
    if (out instanceof Error) throw out;
    return out as AlexandriaScrapeData;
  }
}

export function ok(provider: string, capability: string, data: unknown, creditsCost: number): AlexandriaScrapeData {
  return { scrapeId: "scrape-test", requestId: "req-test", creditsCost, alexandria: [{ provider, capability, creditsCost, data }] } as AlexandriaScrapeData;
}

export function httpError(status: number, message = "boom", extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), { status }, extra);
}

export function limits(over: Partial<BudgetLimits> = {}): BudgetLimits {
  return { maxCredits: 100, dailyCap: null, dailySpentBefore: 0, providerCaps: {}, maxRecordCredits: Number.POSITIVE_INFINITY, ...over };
}

export function makeExecutor(opts: {
  responder?: FakeResponder;
  port?: AlexandriaScrapePort | null;
  budget?: BudgetLimits;
  config?: Partial<ExecutorConfig>;
  store?: MemoryStore;
}) {
  const store = opts.store ?? new MemoryStore();
  const port = opts.port === undefined ? new FakePort(opts.responder ?? (() => ok("fireround", "companies/profile", {}, 5))) : opts.port;
  const budget = new BudgetGuard(opts.budget ?? limits());
  const sleeps: number[] = [];
  const executor = new AlexandriaExecutor({
    port,
    catalog: loadCatalog(),
    budget,
    ledger: store,
    cache: store,
    config: { ...DEFAULT_EXECUTOR_CONFIG, runId: "run-test", allowBillable: true, minIntervalMs: 0, ...opts.config },
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0,
  });
  return { executor, store, port: port as FakePort | null, budget, sleeps };
}
