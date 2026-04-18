#!/usr/bin/env tsx
/**
 * run-needs-refresh-sweep.ts
 * ===========================
 * Sweeps all people and orgs that haven't been enriched in FRESHNESS_DAYS
 * and queues them for enrichment. Safe to run on a cron (e.g. nightly).
 *
 * Usage:
 *   pnpm tsx src/services/people-intel/runners/run-needs-refresh-sweep.ts \
 *     --freshness-days=7 --limit=200 --dry-run
 *
 *   pnpm tsx ... --high-value   # only firm_investors at top firms
 */

import "dotenv/config";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "../../../scripts/lib/loadEnvFiles.ts";
import { enrichPerson } from "../person-enrichment.service.ts";
import { enrichOrganization } from "../organization-enrichment.service.ts";
import { createJsonLogger, type Logger } from "../types.ts";

loadEnvFiles([".env", ".env.local"]);

const SUPA_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPA_URL || !SUPA_KEY) {
  console.error(JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }));
  process.exit(1);
}

const db     = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
const logger = createJsonLogger("needs_refresh_sweep");

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    out[eq > 0 ? arg.slice(2, eq) : arg.slice(2)] = eq > 0 ? arg.slice(eq + 1) : true;
  }
  return out;
}

// ─── Fetch entity IDs that need refresh ──────────────────────────────────────

async function findNeedsRefresh(
  supabase: SupabaseClient,
  entityType: string,
  table: string,
  idCol: string,
  freshnessCutoff: string,
  limit: number,
  highValueOnly: boolean,
): Promise<string[]> {

  // Get IDs that already have a recent successful run
  const { data: recentRuns } = await supabase
    .from("pig_enrichment_runs")
    .select("entity_id")
    .eq("entity_type", entityType)
    .in("status", ["completed", "partial"])
    .gte("started_at", freshnessCutoff);

  const recentIds = new Set((recentRuns ?? []).map(r => r.entity_id));

  let query = supabase.from(table).select(idCol).is("deleted_at", null).limit(limit * 3);
  if (highValueOnly && entityType === "firm_investor") {
    // Prefer primary contacts at larger firms
    query = query.not("firm_id", "is", null);
  }

  const { data: rows, error } = await query;
  if (error) {
    logger.error("sweep.query_failed", { entityType, err: error.message });
    return [];
  }

  return (rows ?? [])
    .map(r => String(r[idCol]))
    .filter(id => !recentIds.has(id))
    .slice(0, limit);
}

async function main(): Promise<void> {
  const args         = parseArgs(process.argv);
  const dryRun       = args["dry-run"] === true || args["dry-run"] === "true";
  const highValue    = args["high-value"] === true;
  const freshnessDays = parseInt(String(args["freshness-days"] ?? "7"), 10);
  const limit        = parseInt(String(args["limit"] ?? "100"), 10);

  const freshnessCutoff = new Date(Date.now() - freshnessDays * 24 * 3_600_000).toISOString();
  logger.info("sweep.start", { freshnessDays, limit, dryRun, highValue });

  let totalOk = 0, totalFailed = 0, totalSkipped = 0;

  // ── People ──────────────────────────────────────────────────────────────────
  const personBatches: Array<{ entityType: string; table: string; idCol: string }> = [
    { entityType: "firm_investor",   table: "firm_investors",  idCol: "id" },
    { entityType: "operator_profile", table: "operator_profiles", idCol: "id" },
  ];

  for (const { entityType, table, idCol } of personBatches) {
    const ids = await findNeedsRefresh(db, entityType, table, idCol, freshnessCutoff, Math.ceil(limit / 2), highValue);
    logger.info("sweep.person_batch", { entityType, count: ids.length });

    for (const id of ids) {
      try {
        const result = await enrichPerson(db, entityType, id, { dryRun, logger });
        if (result.status === "skipped") totalSkipped++;
        else totalOk++;
      } catch (err) {
        totalFailed++;
        logger.error("sweep.person.failed", { entityType, entity_id: id, err: String(err) });
      }
    }
  }

  // ── Orgs ────────────────────────────────────────────────────────────────────
  const orgBatches: Array<{ entityType: string; table: string }> = [
    { entityType: "firm_record", table: "firm_records" },
  ];

  for (const { entityType, table } of orgBatches) {
    const ids = await findNeedsRefresh(db, entityType, table, "id", freshnessCutoff, Math.ceil(limit / 2), highValue);
    logger.info("sweep.org_batch", { entityType, count: ids.length });

    for (const id of ids) {
      try {
        const result = await enrichOrganization(db, entityType, id, { dryRun, logger });
        if (result.status === "skipped") totalSkipped++;
        else totalOk++;
      } catch (err) {
        totalFailed++;
        logger.error("sweep.org.failed", { entityType, entity_id: id, err: String(err) });
      }
    }
  }

  logger.info("sweep.done", { totalOk, totalFailed, totalSkipped });
}

main().catch(err => {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
