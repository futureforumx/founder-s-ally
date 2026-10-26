/**
 * Read-only completeness / duplicate / freshness audit of the records the pipeline would enrich.
 * No provider calls, no writes.
 *
 *   pnpm alexandria:audit                    # all five entity types, live database (service role)
 *   pnpm alexandria:audit --entity firm      # one type
 *   pnpm alexandria:audit --fixtures scripts/alexandria-enrichment/fixtures/sample.json
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "../lib/loadEnvFiles";
import { MemoryStore } from "../../src/lib/alexandria/memoryStore";
import { SupabaseStore } from "../../src/lib/alexandria/supabaseStore";
import { ENTITY_SPECS, completenessScore, missingFields, staleGroups, completenessFields } from "../../src/lib/alexandria/fieldRegistry";
import { duplicateGroups, flagDuplicateIdentities, identityFromRow } from "../../src/lib/alexandria/identity";
import { isEmptyValue } from "../../src/lib/alexandria/normalize";
import { ENTITY_TYPES, type EntityType } from "../../src/lib/alexandria/types";
import type { EnrichmentStore } from "../../src/lib/alexandria/store";

loadEnvFiles([".env", ".env.local"]);

const { values: v } = parseArgs({
  options: {
    entity: { type: "string", default: "all" },
    fixtures: { type: "string" },
    out: { type: "string" },
    "scan-cap": { type: "string", default: "200000" },
  },
});

function makeStore(): EnrichmentStore {
  if (v.fixtures) {
    const s = new MemoryStore();
    const data = JSON.parse(readFileSync(v.fixtures as string, "utf8")) as Record<string, Array<Record<string, unknown>>>;
    for (const [t, rows] of Object.entries(data)) if (!t.startsWith("_")) s.seed(t, rows);
    return s;
  }
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --fixtures).");
    process.exit(2);
  }
  return new SupabaseStore(createClient(url, key, { auth: { persistSession: false } }));
}

async function auditEntity(store: EnrichmentStore, entity: EntityType) {
  const spec = ENTITY_SPECS[entity];
  const rows = await store.scanRecords(entity, { recordIds: null, scanCap: Number(v["scan-cap"]) });
  const parents = await store.loadParents(entity, rows);
  const identities = rows.map((r) => identityFromRow(spec, r, spec.parent ? parents.get(String(r[spec.parent.fkColumn])) ?? null : null));
  flagDuplicateIdentities(identities);

  const ids = rows.map((r) => String(r[spec.idColumn]));
  const states = new Map<string, Awaited<ReturnType<EnrichmentStore["loadStates"]>> extends Map<string, infer S> ? S : never>();
  let stateTableAvailable = true;
  try {
    for (let i = 0; i < ids.length; i += 200) for (const [k, s] of await store.loadStates(entity, ids.slice(i, i + 200))) states.set(k, s);
  } catch (e) {
    // The audit is read-only and must work before the Alexandria migration is applied.
    if (!/alexandria_enrichment_state/.test(String(e))) throw e;
    stateTableAvailable = false;
  }

  const fieldFill = completenessFields(entity).map((f) => {
    const filled = rows.filter((r) => !isEmptyValue(r[f.column])).length;
    return { field: f.field, column: f.column, contact: f.contact === true, filled, missing: rows.length - filled, fillRatePct: rows.length ? Math.round((filled / rows.length) * 1000) / 10 : 0 };
  });
  const now = new Date();
  const scores = rows.map((r) => completenessScore(entity, r));
  const avg = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;
  const dupes = duplicateGroups(identities);
  const bands = { "0-25": 0, "25-50": 0, "50-75": 0, "75-100": 0 };
  for (const s of scores) bands[s < 25 ? "0-25" : s < 50 ? "25-50" : s < 75 ? "50-75" : "75-100"]++;

  return {
    entity,
    table: spec.table,
    migrationApplied: stateTableAvailable,
    records: rows.length,
    avgCompletenessPct: avg,
    completenessBands: bands,
    recordsWithAnyMissing: rows.filter((r) => missingFields(entity, r).length > 0).length,
    fieldFill: fieldFill.sort((a, b) => a.fillRatePct - b.fillRatePct),
    duplicateIdentityGroups: dupes.length,
    recordsInDuplicateGroups: dupes.reduce((n, g) => n + g.ids.length, 0),
    withoutDomainOrLinkedin: identities.filter((i) => !i.domain && !i.linkedinSlug).length,
    enrichmentState: {
      tracked: states.size,
      neverAttempted: rows.length - states.size,
      withStaleGroups: [...states.values()].filter((s) => staleGroups(entity, s.fieldLastRefreshed, now).length > 0).length,
    },
  };
}

async function main() {
  const store = makeStore();
  const list = v.entity === "all" ? [...ENTITY_TYPES] : ((v.entity as string).split(",") as EntityType[]);
  const out = [];
  for (const e of list) {
    const r = await auditEntity(store, e);
    out.push(r);
    console.error(`${e.padEnd(9)} ${String(r.records).padStart(7)} records | avg completeness ${r.avgCompletenessPct}% | ${r.duplicateIdentityGroups} duplicate groups | ${r.withoutDomainOrLinkedin} lack domain/LinkedIn`);
  }
  const json = JSON.stringify({ generatedAt: new Date().toISOString(), entities: out }, null, 2);
  if (v.out) writeFileSync(v.out as string, json);
  console.log(json);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
