#!/usr/bin/env tsx
/**
 * run-org-refresh.ts
 * ===================
 * CLI runner: refresh enrichment for a specific org or batch.
 *
 * Usage:
 *   pnpm tsx src/services/people-intel/runners/run-org-refresh.ts \
 *     --entity-type=firm_record --entity-id=<uuid>
 *
 *   pnpm tsx ... --entity-type=firm_record --limit=50 --dry-run
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "../../../scripts/lib/loadEnvFiles.ts";
import { enrichOrganization } from "../organization-enrichment.service.ts";
import { createJsonLogger } from "../types.ts";

loadEnvFiles([".env", ".env.local"]);

const SUPA_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPA_URL || !SUPA_KEY) {
  console.error(JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }));
  process.exit(1);
}

const db     = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
const logger = createJsonLogger("run_org_refresh");

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    out[eq > 0 ? arg.slice(2, eq) : arg.slice(2)] = eq > 0 ? arg.slice(eq + 1) : true;
  }
  return out;
}

const TABLE_MAP: Record<string, string> = {
  firm_record:       "firm_records",
  organization:      "organizations",
  startup:           "startups",
  portfolio_company: "portfolio_companies",
};

async function main(): Promise<void> {
  const args        = parseArgs(process.argv);
  const dryRun      = args["dry-run"] === true || args["dry-run"] === "true";
  const forceRefresh = args["force"] === true;
  const entityType  = String(args["entity-type"] ?? "firm_record");
  const entityId    = args["entity-id"] ? String(args["entity-id"]) : undefined;
  const limit       = parseInt(String(args["limit"] ?? "10"), 10);

  if (entityId) {
    const result = await enrichOrganization(db, entityType, entityId, { dryRun, forceRefresh, logger });
    logger.info("refresh.single.done", { entityType, entityId, ...result });
    return;
  }

  // Batch sweep
  const table = TABLE_MAP[entityType] ?? "firm_records";
  logger.info("refresh.batch.start", { entityType, table, limit, dryRun });

  const { data: rows, error } = await db
    .from(table)
    .select("id")
    .is("deleted_at", null)
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (error) { logger.error("refresh.batch.query_failed", { err: error.message }); process.exit(1); }

  let ok = 0, failed = 0, skipped = 0;
  for (const row of rows ?? []) {
    try {
      const result = await enrichOrganization(db, entityType, String(row.id), { dryRun, forceRefresh, logger });
      if (result.status === "skipped") skipped++;
      else ok++;
    } catch (err) {
      failed++;
      logger.error("refresh.batch.item_failed", { entity_id: row.id, err: String(err) });
    }
  }
  logger.info("refresh.batch.done", { total: (rows ?? []).length, ok, failed, skipped });
}

main().catch(err => {
  console.error(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
