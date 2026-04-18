#!/usr/bin/env tsx
/**
 * run-person-refresh.ts
 * ======================
 * CLI runner: refresh enrichment for a specific person or batch of people.
 *
 * Usage:
 *   pnpm tsx src/services/people-intel/runners/run-person-refresh.ts \
 *     --entity-type=firm_investor --entity-id=<uuid>
 *
 *   # Force refresh (ignore freshness window):
 *   pnpm tsx ... --force
 *
 *   # Dry run (no writes):
 *   pnpm tsx ... --dry-run
 *
 *   # Batch: all firm_investors needing refresh:
 *   pnpm tsx ... --entity-type=firm_investor --limit=50
 *
 *   # From a LinkedIn seed URL:
 *   pnpm tsx ... --linkedin-url=https://linkedin.com/in/...
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "../../../scripts/lib/loadEnvFiles.ts";
import { enrichPerson } from "../person-enrichment.service.ts";
import { resolveCanonicalPerson, attachPersonExternalIdentity } from "../identity-resolution.service.ts";
import { createJsonLogger } from "../types.ts";

loadEnvFiles([".env", ".env.local"]);

const SUPA_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "";
const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
if (!SUPA_URL || !SUPA_KEY) {
  console.error(JSON.stringify({ error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }));
  process.exit(1);
}

const db     = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
const logger = createJsonLogger("run_person_refresh");

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const arg of argv.slice(2)) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq > 0) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else {
      out[arg.slice(2)] = true;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const dryRun      = args["dry-run"] === true || args["dry-run"] === "true";
  const forceRefresh = args["force"] === true;
  const entityType  = String(args["entity-type"] ?? "firm_investor");
  const entityId    = args["entity-id"] ? String(args["entity-id"]) : undefined;
  const linkedInUrl = args["linkedin-url"] ? String(args["linkedin-url"]) : undefined;
  const limit       = parseInt(String(args["limit"] ?? "10"), 10);

  // ── Mode A: from LinkedIn seed ─────────────────────────────────────────────
  if (linkedInUrl) {
    logger.info("refresh.linkedin_seed.start", { linkedInUrl });
    const resolved = await resolveCanonicalPerson(db, { linkedin_url: linkedInUrl }, logger);
    if (!resolved) {
      logger.warn("refresh.linkedin_seed.no_match", { linkedInUrl });
    } else {
      await attachPersonExternalIdentity(db, {
        entity_type: resolved.entity_type,
        entity_id:   resolved.entity_id,
        provider:    "linkedin",
        external_url: linkedInUrl,
        confidence:  resolved.confidence,
        is_primary:  true,
      }, { dryRun, logger });
      const result = await enrichPerson(db, resolved.entity_type, resolved.entity_id, { dryRun, forceRefresh, logger });
      logger.info("refresh.linkedin_seed.done", { ...result, entity_id: resolved.entity_id });
    }
    return;
  }

  // ── Mode B: specific entity ────────────────────────────────────────────────
  if (entityId) {
    const result = await enrichPerson(db, entityType, entityId, { dryRun, forceRefresh, logger });
    logger.info("refresh.single.done", { entityType, entityId, ...result });
    return;
  }

  // ── Mode C: batch sweep ────────────────────────────────────────────────────
  logger.info("refresh.batch.start", { entityType, limit, dryRun });

  const table = entityType === "firm_investor" ? "firm_investors" : "operator_profiles";
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
      const result = await enrichPerson(db, entityType, String(row.id), { dryRun, forceRefresh, logger });
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
