import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "@/lib/alexandria";
import { MemoryStore } from "@/lib/alexandria/memoryStore";
import { OptionsError, defaultJobOptions, runEnrichmentJob, validateJobOptions } from "@/lib/alexandria/pipeline";
import type { EntityType, JobOptions } from "@/lib/alexandria/types";
import { FakePort, httpError, ok, type FakeResponder } from "./helpers/alexandriaFakes";

const fixtures = JSON.parse(readFileSync(join(process.cwd(), "scripts/alexandria-enrichment/fixtures/sample.json"), "utf8")) as Record<string, Array<Record<string, unknown>>>;
const NOW = new Date("2026-10-26T12:00:00Z");

const NORTHWIND = {
  id: "fr-1",
  name: "Northwind Ventures",
  domain: "northwind.example",
  description: "Northwind backs seed-stage fintech founders.",
  headquarters: "Austin, United States",
  sectors: [{ name: "Fintech" }],
  stages: [{ name: "Seed" }],
  co_investors: [{ name: "Atlas Fund" }],
  recent_rounds: [{ company_name: "Lumen Robotics", date: "2026-03-01", round: "Seed", role: "lead" }],
};

const FULLENRICH_NORTHWIND = { companies: [{ name: "Northwind Ventures", domain: "northwind.example", website: "https://northwind.example", year_founded: 2015, headcount: 12, logo_url: "https://northwind.example/logo.png" }] };

const responder: FakeResponder = ({ provider, capability }) => {
  if (provider === "fireround" && capability === "investors/profile") return ok(provider, capability, NORTHWIND, 5);
  if (provider === "fullenrich" && capability === "companies/lookup") return ok(provider, capability, FULLENRICH_NORTHWIND, 5);
  return ok(provider, capability, {}, 0);
};

function world(opts: { responder?: FakeResponder; seed?: Record<string, Array<Record<string, unknown>>> } = {}) {
  const store = new MemoryStore();
  for (const [t, rows] of Object.entries(opts.seed ?? fixtures)) if (!t.startsWith("_")) store.seed(t, rows);
  const port = new FakePort(opts.responder ?? responder);
  const deps = { store, catalog: loadCatalog(), port, now: () => NOW, sleep: async () => {} };
  return { store, port, deps };
}

const job = (entity: EntityType, over: Partial<JobOptions> = {}) => defaultJobOptions(entity, { limit: 10, minIntervalMs: 0, ...over } as Partial<JobOptions>);
const live = (entity: EntityType, over: Partial<JobOptions> = {}) => job(entity, { allowBillable: true, maxCredits: 200, ...over });
const apply = (entity: EntityType, over: Partial<JobOptions> = {}) => live(entity, { dryRun: false, allowWrites: true, ...over });
const only = (id: string) => ({ recordIds: [id] });

describe("option validation", () => {
  it("defaults to a dry run with no spend and no writes", () => {
    const o = defaultJobOptions("firm");
    expect(o).toMatchObject({ dryRun: true, allowBillable: false, allowWrites: false, maxCredits: 0, forceRefresh: false, allowContactLookups: false });
    expect(() => validateJobOptions(o)).not.toThrow();
  });

  it.each([
    ["billable without a credit budget", { allowBillable: true, maxCredits: 0 }, /max-credits/],
    ["writes while dry-run is on", { allowWrites: true }, /dry-run/],
    ["dry-run off without write authorisation", { dryRun: false }, /authorisation/],
    ["force refresh without authorisation", { forceRefresh: true }, /force-refresh/],
    ["web research without billable authorisation", { allowWebResearch: true }, /billable/],
  ])("rejects %s", (_label, over, pattern) => {
    expect(() => validateJobOptions(defaultJobOptions("firm", over as Partial<JobOptions>))).toThrow(pattern);
  });
});

describe("dry run (default)", () => {
  it("plans calls and estimates cost but never calls a provider or writes anything", async () => {
    const { store, port, deps } = world();
    const before = JSON.stringify([...store.tables.entries()]);
    const report = await runEnrichmentJob(job("firm"), deps);
    expect(port.calls).toHaveLength(0);
    expect(JSON.stringify([...store.tables.entries()])).toBe(before);
    expect(store.provenance).toHaveLength(0);
    expect(store.states.size).toBe(0);
    expect(store.ledger.size).toBe(0);
    expect(store.runs.size).toBe(0);
    expect(report.mode).toBe("dry_run");
    expect(report.credits.actual).toBe(0);
    expect(report.credits.plannedBase).toBeGreaterThan(0);
    expect(report.credits.plannedWorstCase).toBeGreaterThanOrEqual(report.credits.plannedBase);
    expect(report.blockedProviders.map((b) => b.provider)).toContain("apollo");
  });

  it("ranks the most incomplete, highest-priority records first", async () => {
    const { deps } = world();
    const report = await runEnrichmentJob(job("firm"), deps);
    expect(report.results[0].id).toBe("f-1");
    expect(report.results.map((r) => r.id)).not.toContain("f-3");
  });

  it("does not spend on duplicate existing records", async () => {
    const { deps, port } = world();
    const report = await runEnrichmentJob(job("firm"), deps);
    const dupes = report.results.filter((r) => ["f-4", "f-5"].includes(r.id));
    expect(dupes).toHaveLength(2);
    expect(dupes.every((r) => r.status === "ambiguous" && r.calls.length === 0)).toBe(true);
    expect(port.calls).toHaveLength(0);
  });

  it("covers all five entity types on the sample data without paid calls", async () => {
    const { deps, port } = world();
    for (const entity of ["firm", "investor", "company", "founder", "operator"] as EntityType[]) {
      const report = await runEnrichmentJob(job(entity), deps);
      expect(report.mode).toBe("dry_run");
      expect(report.totals.processed).toBeGreaterThan(0);
    }
    expect(port.calls).toHaveLength(0);
  });
});

describe("billable lookups without writes (pilot)", () => {
  it("fetches, caches and proposes a diff but does not touch entity data", async () => {
    const { store, port, deps } = world();
    const before = JSON.stringify(store.tables.get("firm_records"));
    const report = await runEnrichmentJob(live("firm", only("f-1")), deps);
    expect(report.mode).toBe("lookup_only");
    expect(port.calls.map((c) => `${c.provider}/${c.capability}`)).toEqual(["fireround/investors/profile", "fullenrich/companies/lookup"]);
    expect(JSON.stringify(store.tables.get("firm_records"))).toBe(before);
    expect(store.provenance).toHaveLength(0);
    expect(store.states.size).toBe(0);
    expect(store.cache.size).toBe(2);
    expect(report.credits.actual).toBe(10);
    const r = report.results[0];
    expect(r.decisions.find((d) => d.field === "description")).toMatchObject({ action: "apply", provider: "fireround" });
    expect(r.completenessProjected).toBeGreaterThan(r.completenessBefore);
  });
});

describe("apply", () => {
  it("writes only high-confidence fields, records provenance and a rollback log, and queues the rest", async () => {
    const { store, deps } = world();
    const report = await runEnrichmentJob(apply("firm", only("f-1")), deps);
    const row = store.row("firm_records", "f-1")!;

    expect(row.description).toBe(NORTHWIND.description);
    expect(row.founded_year).toBe(2015);
    expect(row.total_headcount).toBe(12);
    expect(row.logo_url).toBe("https://northwind.example/logo.png");
    expect(row.last_enriched_at).toBeTruthy();

    // Undocumented nested shapes and inferred facts are not written.
    expect(row.hq_city).toBeNull();
    expect(row.sector_focus).toEqual([]);
    expect(row.last_5_investments).toBeNull();

    const applied = store.provenance.filter((p) => p.autoApplied).map((p) => p.fieldName).sort();
    expect(applied).toEqual(["description", "founded_year", "logo_url", "total_headcount"]);
    expect(store.provenance.every((p) => p.sourcePlatform.startsWith("alexandria:") && p.runId && p.batchId)).toBe(true);
    expect(store.provenance.find((p) => p.fieldName === "description")).toMatchObject({ provider: "fireround", capability: "investors/profile", confidenceLabel: "high", verificationStatus: "provider_reported", factKind: "explicit" });

    const reviewFields = store.candidates.map((c) => c.fieldName);
    expect(reviewFields).toEqual(expect.arrayContaining(["hq_city", "sector_focus", "stage_focus", "co_investor_patterns"]));
    expect(store.candidates.find((c) => c.fieldName === "sector_focus")).toMatchObject({ factKind: "inferred" });

    expect(store.changes.filter((c) => c.op === "update")).toHaveLength(4);
    expect(store.states.get("firm:f-1")).toMatchObject({ status: "enriched", lastRunId: report.runId });
    expect(store.states.get("firm:f-1")!.fieldLastRefreshed.firmographics).toBe(NOW.toISOString());
    expect(report.totals.enriched).toBe(1);
    expect(store.runs.get(report.runId)?.summary?.creditsActual).toBe(10);
    expect([...store.ledger.values()].every((l) => l.status === "charged")).toBe(true);
  });

  it("is idempotent: a second run replays cached responses and charges nothing", async () => {
    const { store, port, deps } = world();
    await runEnrichmentJob(apply("firm", only("f-1")), deps);
    const callsAfterFirst = port.calls.length;
    const changesAfterFirst = store.changes.length;
    const second = await runEnrichmentJob(apply("firm", only("f-1")), deps);
    expect(port.calls.length).toBe(callsAfterFirst);
    expect(second.credits.actual).toBe(0);
    expect(store.changes.length).toBe(changesAfterFirst);
    expect(second.results[0].status).toBe("unchanged");
  });

  it("preserves manually curated values", async () => {
    const seed = structuredClone(fixtures);
    seed.firm_records[0].description = "Curated by hand";
    const { store, deps } = world({ seed });
    await runEnrichmentJob(apply("firm", only("f-1")), deps);
    expect(store.row("firm_records", "f-1")!.description).toBe("Curated by hand");
    expect(store.candidates.find((c) => c.fieldName === "description")).toMatchObject({ candidateValue: NORTHWIND.description });
  });

  it("rolls a batch back to the exact prior values", async () => {
    const { store, deps } = world();
    const original = JSON.stringify(store.row("firm_records", "f-1"));
    const report = await runEnrichmentJob(apply("firm", only("f-1")), deps);
    expect(JSON.stringify(store.row("firm_records", "f-1"))).not.toBe(original);
    const [res] = await store.rollbackBatch(report.runId, "test", { force: false });
    expect(res.reverted).toBe(4);
    const restored = store.row("firm_records", "f-1")!;
    expect(restored.description).toBeNull();
    expect(restored.founded_year ?? null).toBeNull();
  });

  it("refuses to roll back a value someone edited afterwards", async () => {
    const { store, deps } = world();
    const report = await runEnrichmentJob(apply("firm", only("f-1")), deps);
    store.row("firm_records", "f-1")!.description = "Edited by an admin later";
    const [res] = await store.rollbackBatch(report.runId, "test", { force: false });
    expect(res.skippedConflicts).toBe(1);
    expect(store.row("firm_records", "f-1")!.description).toBe("Edited by an admin later");
  });

  it("writes nothing when the row changes between read and write", async () => {
    const { store, deps } = world();
    store.beforeApply = () => {
      store.row("firm_records", "f-1")!.description = "Changed concurrently";
    };
    const report = await runEnrichmentJob(apply("firm", only("f-1")), deps);
    expect(store.row("firm_records", "f-1")!.description).toBe("Changed concurrently");
    expect(store.changes).toHaveLength(0);
    expect(report.results[0].status).toBe("failed");
  });

  it("never touches contact fields without explicit authorisation", async () => {
    const people: FakeResponder = ({ provider, capability }) =>
      provider === "fullenrich" && capability === "people/lookup"
        ? ok(provider, capability, { people: [{ full_name: "Ada Example", description: "Partner at Northwind.", social_profiles: { linkedin: { url: "https://www.linkedin.com/in/ada-example" } } }] }, 5)
        : ok(provider, capability, { results: [{ contact_info: { most_probable_work_email: { email: "ada@northwind.example", status: "VALID" } } }] }, 20);
    const a = world({ responder: people });
    const r1 = await runEnrichmentJob(apply("investor", only("i-1")), a.deps);
    expect(a.port.calls.some((c) => c.capability === "contacts/work-email")).toBe(false);
    expect(a.store.row("firm_investors", "i-1")!.email).toBeNull();
    expect(r1.results[0].calls.every((c) => c.capability !== "contacts/work-email")).toBe(true);
    expect(a.store.row("firm_investors", "i-1")!.bio).toBe("Partner at Northwind.");

    const b = world({ responder: people });
    const r2 = await runEnrichmentJob(apply("investor", { ...only("i-1"), allowContactLookups: true }), b.deps);
    expect(b.port.calls.some((c) => c.capability === "contacts/work-email")).toBe(true);
    // Undocumented contact response shape: stays a review candidate, never auto-written.
    expect(b.store.row("firm_investors", "i-1")!.email).toBeNull();
    expect(b.store.candidates.some((c) => c.fieldName === "email")).toBe(true);
    expect(JSON.stringify(r2)).not.toContain("ada@northwind.example");
  });
});

describe("identity, failure and budget handling", () => {
  it("queues an ambiguous provider match for review and writes nothing", async () => {
    const wrong: FakeResponder = ({ provider, capability }) => ok(provider, capability, { name: "Northwind Ventures", domain: "unrelated.example", description: "Not us" }, 5);
    const { store, deps } = world({ responder: wrong });
    const report = await runEnrichmentJob(apply("firm", only("f-1")), deps);
    expect(store.row("firm_records", "f-1")!.description).toBeNull();
    expect(store.provenance.filter((p) => p.autoApplied)).toHaveLength(0);
    expect(["ambiguous", "no_match"]).toContain(report.results[0].status);
    expect(store.failures.length + store.reviews.length).toBeGreaterThan(0);
  });

  it("records a no_match and applies a retry cooldown", async () => {
    const other: FakeResponder = ({ provider, capability }) => ok(provider, capability, { name: "Completely Different Co", domain: "different.example", companies: [{ name: "Completely Different Co", domain: "different.example" }] }, 5);
    const { store, deps } = world({ responder: other });
    const first = await runEnrichmentJob(apply("firm", only("f-1")), deps);
    expect(first.results[0].status).toBe("no_match");
    expect(store.failures.length).toBeGreaterThan(0);
    const state = store.states.get("firm:f-1")!;
    expect(new Date(state.retryAfter!).getTime()).toBeGreaterThan(NOW.getTime());
    const second = await runEnrichmentJob(apply("firm"), deps);
    expect(second.results.map((r) => r.id)).not.toContain("f-1");
  });

  it("marks failed provider requests as failed, books uncertain spend, and does not write", async () => {
    const down: FakeResponder = () => httpError(503, "upstream down");
    const { store, deps } = world({ responder: down });
    const report = await runEnrichmentJob(apply("firm", { ...only("f-1"), maxCredits: 50 }), deps);
    expect(report.results[0].status).toBe("failed");
    expect(store.row("firm_records", "f-1")!.description).toBeNull();
    expect(store.states.get("firm:f-1")!.retryAfter).toBeTruthy();
    expect([...store.ledger.values()].every((l) => l.status === "unknown")).toBe(true);
  });

  it("stops before exceeding the job budget", async () => {
    const { port, deps } = world();
    const report = await runEnrichmentJob(live("firm", { maxCredits: 5, limit: 4, batchSize: 1, concurrency: 1 }), deps);
    expect(report.credits.actual).toBeLessThanOrEqual(5);
    expect(port.calls.length).toBeLessThanOrEqual(1);
    expect(report.stoppedReason).toBe("budget");
    expect(report.results.some((r) => r.status === "budget_stopped")).toBe(true);
  });

  it("enforces the daily cap using spend already on the ledger", async () => {
    const { store, port, deps } = world();
    await store.upsertLedger({ requestId: "earlier", runId: "r0", provider: "fireround", capability: "companies/profile", creditsEstimated: 95, creditsActual: 95, status: "charged", attemptCount: 1 });
    await runEnrichmentJob(live("firm", { ...only("f-1"), dailyCreditCap: 100 }), deps);
    expect(port.calls.length).toBeLessThanOrEqual(1);
  });

  it("never calls a terms-gated provider even when explicitly selected", async () => {
    const { port, deps } = world();
    const report = await runEnrichmentJob(live("firm", { ...only("f-1"), providers: ["apollo"] }), deps);
    expect(port.calls).toHaveLength(0);
    expect(report.results[0].status).not.toBe("enriched");
  });

  it("skips operators without any strong identifier instead of guessing from a name", async () => {
    const { port, deps } = world();
    const report = await runEnrichmentJob(live("operator", only("o-2")), deps);
    expect(report.results[0].status).toBe("skipped");
    expect(port.calls).toHaveLength(0);
  });
});

describe("relationships", () => {
  it("holds portfolio claims for review while the nested shape is unverified", async () => {
    const { store, deps } = world();
    await runEnrichmentJob(apply("firm", only("f-1")), deps);
    expect(store.deals).toHaveLength(0);
    const review = store.reviews.find((r) => r.reason.includes("relationships held for review"));
    expect(review).toBeTruthy();
    expect(JSON.stringify(review)).toContain("Lumen Robotics");
  });

  it("inserts firm->company deals (never person-level) once the shape is trusted, idempotently and reversibly", async () => {
    const { store, deps } = world();
    const trusted = { trustedShapes: ["fireround/investors/profile"] };
    const report = await runEnrichmentJob(apply("firm", { ...only("f-1"), ...trusted }), deps);
    expect(store.deals).toHaveLength(1);
    expect(store.deals[0]).toMatchObject({ firmId: "f-1", companyName: "Lumen Robotics", normalizedCompanyName: expect.any(String) });
    await runEnrichmentJob(apply("firm", { ...only("f-1"), ...trusted }), deps);
    expect(store.deals).toHaveLength(1);
    const [res] = await store.rollbackBatch(report.runId, "test", { force: false });
    expect(res.deletedRows).toBe(1);
    expect(store.deals).toHaveLength(0);
  });
});

describe("resumability", () => {
  it("resumes a run without re-processing finished records", async () => {
    const { deps } = world();
    const first = await runEnrichmentJob(apply("firm", { limit: 2, batchSize: 1 }), deps);
    const done = new Set(first.results.map((r) => r.id));
    const second = await runEnrichmentJob(apply("firm", { limit: 5, resumeRunId: first.runId }), deps);
    for (const r of second.results) expect(done.has(r.id) && r.status !== "ambiguous").toBe(false);
  });
});
