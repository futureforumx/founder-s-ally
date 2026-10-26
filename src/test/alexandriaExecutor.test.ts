import { describe, expect, it } from "vitest";
import { loadCatalog } from "@/lib/alexandria";
import { CatalogError } from "@/lib/alexandria/catalog";
import { FakePort, httpError, limits, makeExecutor, ok } from "./helpers/alexandriaFakes";

const ctx = { entityType: "company", entityId: "c-1" };
const profile = { id: "domain.example" };

describe("alexandria catalog", () => {
  const catalog = loadCatalog();

  it("exposes only capabilities returned by discovery, with listed prices", () => {
    expect(catalog.has("fireround", "companies/profile")).toBe(true);
    expect(catalog.price("fireround", "companies/profile")).toBe(5);
    expect(catalog.price("people-data-labs", "company/enrich")).toBe(50);
    expect(catalog.has("fireround", "made/up")).toBe(false);
  });

  it("rejects invented capabilities, unknown options, wrong types and missing identifiers", () => {
    expect(() => catalog.validateCall("fireround", "made/up", {})).toThrow(CatalogError);
    expect(() => catalog.validateCall("fireround", "companies/profile", { id: "x", bogus: 1 })).toThrow(/no option "bogus"/);
    expect(() => catalog.validateCall("fireround", "companies/profile", { id: 5 })).toThrow(/must be string/);
    expect(() => catalog.validateCall("fireround", "companies/profile", {})).toThrow(/requires option "id"/);
    expect(() => catalog.validateCall("fullenrich", "companies/lookup", {})).toThrow(/identifying input/);
    expect(() => catalog.validateCall("fullenrich", "companies/lookup", { domain: "a.example" })).not.toThrow();
  });

  it("flags Apollo as terms-gated in the snapshot", () => {
    expect(catalog.termsRequired("apollo")).toBe(true);
  });
});

describe("alexandria executor", () => {
  it("refuses every provider call unless billable calls are authorised", async () => {
    const { executor, port } = makeExecutor({ config: { allowBillable: false } });
    const out = await executor.call("fireround", "companies/profile", profile, ctx);
    expect(out).toMatchObject({ ok: false, reason: "not_authorized" });
    expect(port!.calls).toHaveLength(0);
  });

  it("refuses when no SDK port is configured even if billable is on", async () => {
    const { executor } = makeExecutor({ port: null });
    expect(await executor.call("fireround", "companies/profile", profile, ctx)).toMatchObject({ ok: false, reason: "not_authorized" });
  });

  it("rejects invalid calls before any spend", async () => {
    const { executor, port } = makeExecutor({});
    const out = await executor.call("fireround", "nope/nope", {}, ctx);
    expect(out).toMatchObject({ ok: false, reason: "invalid_call" });
    expect(port!.calls).toHaveLength(0);
  });

  it("charges the listed price once and caches the response (second call is free)", async () => {
    const { executor, port, budget, store } = makeExecutor({ responder: () => ok("fireround", "companies/profile", { name: "X" }, 5) });
    const first = await executor.call("fireround", "companies/profile", profile, ctx);
    const second = await executor.call("fireround", "companies/profile", profile, ctx);
    expect(first).toMatchObject({ ok: true, source: "provider", credits: 5 });
    expect(second).toMatchObject({ ok: true, source: "cache", credits: 0 });
    expect(port!.calls).toHaveLength(1);
    expect(budget.spent).toBe(5);
    expect([...store.ledger.values()].map((l) => l.status).sort()).toEqual(["cache_hit", "charged"]);
  });

  it("enforces the job credit cap before calling the provider", async () => {
    const { executor, port } = makeExecutor({ budget: limits({ maxCredits: 7 }) });
    const a = await executor.call("fireround", "companies/profile", { id: "a.example" }, ctx);
    const b = await executor.call("fireround", "companies/profile", { id: "b.example" }, ctx);
    expect(a.ok).toBe(true);
    expect(b).toMatchObject({ ok: false, reason: "budget" });
    expect((b as { error: { scope: string } }).error.scope).toBe("job");
    expect(port!.calls).toHaveLength(1);
  });

  it("enforces provider, daily and per-record caps", async () => {
    const provider = makeExecutor({ budget: limits({ providerCaps: { fireround: 4 } }) });
    expect(await provider.executor.call("fireround", "companies/profile", profile, ctx)).toMatchObject({ ok: false, reason: "budget" });

    const daily = makeExecutor({ budget: limits({ dailyCap: 100, dailySpentBefore: 98 }) });
    const d = await daily.executor.call("fireround", "companies/profile", profile, ctx);
    expect(d).toMatchObject({ ok: false, reason: "budget" });
    expect((d as { error: { scope: string } }).error.scope).toBe("daily");

    const rec = makeExecutor({ budget: limits({ maxRecordCredits: 5 }), responder: () => ok("fireround", "companies/profile", {}, 5) });
    await rec.executor.call("fireround", "companies/profile", { id: "a.example" }, ctx);
    const r2 = await rec.executor.call("fireround", "companies/profile", { id: "b.example" }, ctx);
    expect((r2 as { error: { scope: string } }).error.scope).toBe("record");
    expect(rec.port!.calls).toHaveLength(1);
  });

  it("retries 5xx with exponential backoff and the SAME request id (idempotent replay)", async () => {
    const { executor, port, sleeps, budget } = makeExecutor({
      responder: (_req, attempt) => (attempt < 3 ? httpError(503) : ok("fireround", "companies/profile", { name: "X" }, 5)),
    });
    const out = await executor.call("fireround", "companies/profile", profile, ctx);
    expect(out).toMatchObject({ ok: true, credits: 5 });
    expect(port!.calls).toHaveLength(3);
    expect(new Set(port!.calls.map((c) => c.requestId)).size).toBe(1);
    expect(sleeps).toEqual([1000, 2000]);
    expect(budget.spent).toBe(5);
  });

  it("honours the provider's retry-after on rate limits, keeps the same request id, and does not charge", async () => {
    const msg = "ERR_BAD_REQUEST: Rate limit exceeded. Consumed (req/min): 17, Remaining (req/min): 0. please retry after 37s, resets soon";
    const { executor, port, sleeps, budget } = makeExecutor({
      responder: (_req, attempt) => (attempt < 3 ? httpError(429, msg) : ok("fireround", "companies/profile", { name: "X" }, 5)),
    });
    const out = await executor.call("fireround", "companies/profile", profile, ctx);
    expect(out).toMatchObject({ ok: true, credits: 5 });
    expect(sleeps).toEqual([38_000, 38_000]);
    expect(new Set(port!.calls.map((c) => c.requestId)).size).toBe(1);
    expect(budget.spent).toBe(5);
  });

  it("detects rate limits from the message even without an HTTP status, and caps the wait", async () => {
    const msg = "Rate limit exceeded. please retry after 600s";
    const { executor, sleeps } = makeExecutor({
      responder: (_req, attempt) => (attempt < 2 ? new Error(msg) : ok("fireround", "companies/profile", { name: "X" }, 5)),
      config: { maxRateLimitWaitMs: 90_000 },
    });
    expect(await executor.call("fireround", "companies/profile", profile, ctx)).toMatchObject({ ok: true });
    expect(sleeps).toEqual([90_000]);
  });

  it("gives up after the rate-limit retry budget without booking any cost", async () => {
    const { executor, port, budget, store } = makeExecutor({
      responder: () => httpError(429, "Rate limit exceeded. please retry after 1s"),
      config: { maxRateLimitRetries: 2 },
    });
    const out = await executor.call("fireround", "companies/profile", profile, ctx);
    expect(out).toMatchObject({ ok: false, reason: "provider_error", uncertain: false });
    expect(port!.calls).toHaveLength(3);
    expect(budget.spent).toBe(0);
    expect([...store.ledger.values()][0].status).toBe("failed");
  });

  it("does not retry client errors and does not charge for them", async () => {
    const { executor, port, budget, store } = makeExecutor({ responder: () => httpError(400, "bad request") });
    const out = await executor.call("fireround", "companies/profile", profile, ctx);
    expect(out).toMatchObject({ ok: false, reason: "provider_error", uncertain: false });
    expect(port!.calls).toHaveLength(1);
    expect(budget.spent).toBe(0);
    expect([...store.ledger.values()][0].status).toBe("failed");
  });

  it("books the estimated cost when a 5xx outcome is uncertain after retries", async () => {
    const { executor, port, budget, store } = makeExecutor({ responder: () => httpError(503), config: { maxAttempts: 2 } });
    const out = await executor.call("fireround", "companies/profile", profile, ctx);
    expect(out).toMatchObject({ ok: false, reason: "provider_error", uncertain: true });
    expect(port!.calls).toHaveLength(2);
    expect(budget.spent).toBe(5);
    expect([...store.ledger.values()][0].status).toBe("unknown");
  });

  it("derives request ids deterministically so a resumed run replays instead of re-charging", async () => {
    const a = makeExecutor({});
    const b = makeExecutor({});
    await a.executor.call("fireround", "companies/profile", profile, ctx);
    await b.executor.call("fireround", "companies/profile", profile, ctx);
    expect(a.port!.calls[0].requestId).toBe(b.port!.calls[0].requestId);
    const c = makeExecutor({});
    await c.executor.call("fireround", "companies/profile", { id: "other.example" }, ctx);
    expect(c.port!.calls[0].requestId).not.toBe(a.port!.calls[0].requestId);
  });

  it("blocks a provider whose terms are not accepted and never retries or charges it", async () => {
    const terms = Object.assign(new Error("terms"), { code: "THIRD_PARTY_DATA_TERMS_REQUIRED", requiresAction: { type: "accept_terms", url: "https://example.test/terms" } });
    const { executor, port, budget } = makeExecutor({ responder: () => terms });
    const first = await executor.call("fullenrich", "companies/lookup", { domain: "a.example" }, ctx);
    const second = await executor.call("fullenrich", "companies/lookup", { domain: "b.example" }, ctx);
    expect(first).toMatchObject({ ok: false, reason: "terms_required", termsUrl: "https://example.test/terms" });
    expect(second).toMatchObject({ ok: false, reason: "terms_required" });
    expect(port!.calls).toHaveLength(1);
    expect(budget.spent).toBe(0);
    expect(executor.isBlocked("fullenrich")).toBe(true);
  });

  it("treats a per-call error entry as an error and honours the charge", async () => {
    const { executor, budget } = makeExecutor({
      responder: () =>
        ({ scrapeId: "s", requestId: "r", creditsCost: 0, alexandria: [{ error: { status: 404, code: "not_found", message: "no such company" } }] }),
    });
    const out = await executor.call("fireround", "companies/profile", profile, ctx);
    expect(out).toMatchObject({ ok: false, reason: "provider_error", code: "not_found" });
    expect(budget.spent).toBe(0);
  });

  it("never calls providers pre-marked as terms-pending (Apollo) in a dry catalog block", async () => {
    const { executor, port } = makeExecutor({});
    executor.blockFromCatalog("apollo");
    const out = await executor.call("apollo", "companies/enrich", { domain: "a.example" }, ctx);
    expect(out).toMatchObject({ ok: false, reason: "terms_required" });
    expect(port!.calls).toHaveLength(0);
  });
});

describe("FakePort sanity", () => {
  it("is injectable without network", () => {
    expect(new FakePort(() => ok("a", "b", {}, 0))).toBeInstanceOf(FakePort);
  });
});
