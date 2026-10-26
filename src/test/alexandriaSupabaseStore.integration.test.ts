// @vitest-environment node
/**
 * Integration test for SupabaseStore against a REAL Postgres/PostgREST (a throwaway or branch database
 * that has the Alexandria migration applied). Skipped unless both env vars are set:
 *
 *   ALEXANDRIA_IT_SUPABASE_URL=http://localhost:3111 ALEXANDRIA_IT_SERVICE_KEY=<service jwt> pnpm vitest run src/test/alexandriaSupabaseStore.integration
 *
 * It creates and deletes its own rows (ids prefixed with a random uuid namespace) and uses a fake
 * provider port: no Firecrawl credits are ever spent.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { loadCatalog } from "@/lib/alexandria";
import { defaultJobOptions, runEnrichmentJob } from "@/lib/alexandria/pipeline";
import { SupabaseStore } from "@/lib/alexandria/supabaseStore";
import { FakePort, ok } from "./helpers/alexandriaFakes";

const url = process.env.ALEXANDRIA_IT_SUPABASE_URL;
const key = process.env.ALEXANDRIA_IT_SERVICE_KEY;
const run = url && key ? describe : describe.skip;

run("SupabaseStore against a real database", () => {
  // A bare PostgREST serves at the root; hosted Supabase serves under /rest/v1.
  const stripRestPrefix = process.env.ALEXANDRIA_IT_BARE_POSTGREST !== "0";
  const db = createClient(url ?? "http://skipped.invalid", key ?? "skipped", {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) =>
        fetch(stripRestPrefix ? String(input).replace("/rest/v1", "") : input, init),
    },
  });
  const store = new SupabaseStore(db);
  const firmId = randomUUID();
  const manualFirmId = randomUUID();
  const created: string[] = [];
  const tag = randomUUID().slice(0, 8);
  const firmName = `Itest Capital ${tag}`;
  const firmDomain = `itest-${tag}.example`;

  const port = new FakePort(({ provider, capability }) => {
    if (provider === "fireround") {
      return ok(provider, capability, { name: firmName, domain: firmDomain, description: "Integration test firm.", headquarters: "Austin, United States", recent_rounds: [{ company_name: "Itest Robotics", date: "2026-03-01", round: "Seed", role: "lead" }] }, 5);
    }
    return ok(provider, capability, { companies: [{ name: firmName, domain: firmDomain, year_founded: 2016, headcount: 9 }] }, 5);
  });
  const deps = { store, catalog: loadCatalog(), port, sleep: async () => {} };

  afterAll(async () => {
    for (const id of [firmId, manualFirmId]) {
      await db.from("firm_recent_deals").delete().eq("firm_id", id);
      await db.from("firm_records").delete().eq("id", id);
    }
    await db.from("alexandria_enrichment_state").delete().in("entity_id", [firmId, manualFirmId]);
    await db.from("enrichment_field_provenance").delete().in("entity_id", [firmId, manualFirmId]);
    await db.from("enrichment_candidate_values").delete().in("entity_id", [firmId, manualFirmId]);
    for (const r of created) await db.from("enrichment_scrape_runs").delete().eq("run_id", r);
  });

  it("reads, writes with provenance + change log, replays from cache, and rolls back", async () => {
    const { error } = await db.from("firm_records").insert([
      { id: firmId, firm_name: firmName, domain: firmDomain, website_url: `https://${firmDomain}`, match_score: 99 },
      { id: manualFirmId, firm_name: "Manual Capital", domain: "manual-capital.example", description: "Hand curated", match_score: 1 },
    ]);
    expect(error).toBeNull();

    const options = defaultJobOptions("firm", { recordIds: [firmId], limit: 1, allowBillable: true, maxCredits: 50, dryRun: false, allowWrites: true });
    const report = await runEnrichmentJob(options, deps);
    created.push(report.runId);
    expect(report.results[0].status).toBe("enriched");
    expect(report.credits.actual).toBe(10);

    const { data: row } = await db.from("firm_records").select("*").eq("id", firmId).single();
    expect(row!.description).toBe("Integration test firm.");
    expect(row!.founded_year).toBe(2016);
    expect(row!.total_headcount).toBe(9);
    expect(row!.hq_city).toBeNull();
    expect(row!.last_enriched_at).toBeTruthy();

    const { data: prov } = await db.from("enrichment_field_provenance").select("*").eq("entity_id", firmId).eq("run_id", report.runId);
    expect(prov!.filter((p) => p.auto_applied).map((p) => p.field_name).sort()).toEqual(["description", "founded_year", "total_headcount"]);
    expect(prov!.every((p) => String(p.source_platform).startsWith("alexandria:") && p.batch_id)).toBe(true);

    const { data: state } = await db.from("alexandria_enrichment_state").select("*").eq("entity_id", firmId).single();
    expect(state).toMatchObject({ status: "enriched", last_run_id: report.runId });

    const { data: ledger } = await db.from("alexandria_credit_ledger").select("status, credits_actual").eq("run_id", report.runId);
    expect(ledger!.every((l) => l.status === "charged")).toBe(true);

    const { data: runRow } = await db.from("enrichment_scrape_runs").select("status, mode").eq("run_id", report.runId).single();
    expect(runRow).toMatchObject({ status: "completed", mode: "production" });

    // A second run replays the persisted provider cache: no new provider calls, no new credits.
    const callsBefore = port.calls.length;
    const again = await runEnrichmentJob(options, deps);
    created.push(again.runId);
    expect(port.calls.length).toBe(callsBefore);
    expect(again.credits.actual).toBe(0);

    const { data: report2 } = await db.rpc("alexandria_enrichment_report", { p_since: new Date(Date.now() - 3_600_000).toISOString() });
    expect(JSON.stringify(report2)).not.toContain("Integration test firm.");
    expect((report2 as { by_entity: Array<{ entity_type: string }> }).by_entity.some((e) => e.entity_type === "firm")).toBe(true);

    const [rb] = await store.rollbackBatch(report.runId, "itest", { force: false });
    expect(rb.reverted).toBe(3);
    const { data: restored } = await db.from("firm_records").select("description, founded_year, total_headcount").eq("id", firmId).single();
    expect(restored).toEqual({ description: null, founded_year: null, total_headcount: null });
  });

  it("does not overwrite a manually curated description", async () => {
    const options = defaultJobOptions("firm", { recordIds: [manualFirmId], limit: 1, allowBillable: true, maxCredits: 50, dryRun: false, allowWrites: true });
    const report = await runEnrichmentJob(options, { ...deps, port: new FakePort(() => ok("fireround", "investors/profile", { name: "Manual Capital", domain: "manual-capital.example", description: "Provider text" }, 5)) });
    created.push(report.runId);
    const { data } = await db.from("firm_records").select("description").eq("id", manualFirmId).single();
    expect(data!.description).toBe("Hand curated");
  });
});
