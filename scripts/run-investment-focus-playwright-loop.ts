#!/usr/bin/env tsx
/**
 * Long-running Playwright backfill: enrich `firm_records` investment-focus fields
 * (thesis_verticals, thesis_orientation, sector_scope, strategy_classifications, geo, etc.)
 * from OpenVC, Startups Gallery, Signal NFX, and CB Insights adapters.
 *
 * Prerequisites:
 *   - SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   - Playwright auth storage states for gated sources (see `src/backfill/browser/sessions.ts`)
 *     e.g. data/sessions/cbinsights.json, data/signal-nfx-auth.json
 *
 * Usage:
 *   RUN_HOURS=8 BATCH_LIMIT=35 COMMIT=true npx tsx scripts/run-investment-focus-playwright-loop.ts
 *
 * Env:
 *   RUN_HOURS           Max wall time (default 6)
 *   BATCH_LIMIT         Firms per inner run / page (default 30)
 *   SLEEP_MS            Pause between batches (default 8000)
 *   CONCURRENCY         Parallel firms (default 1 — safest for Playwright)
 *   SOURCES             Comma list (default openvc,startups_gallery,signal_nfx,cbinsights)
 *   COMMIT              true|false (default false = dry-run)
 *   FRESHNESS_DAYS      Passed to backfill (default 0 = always eligible)
 *   PLAYWRIGHT_HEADLESS false to debug visually
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { runBackfill } from "../src/backfill/orchestrator";
import { createLogger } from "../src/backfill/logger";
import type { BackfillConfig, SourceName } from "../src/backfill/types";
import { SOURCE_NAMES } from "../src/backfill/types";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseSources(raw: string | undefined): SourceName[] {
  const picks = String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const alias: Record<string, SourceName> = {
    signal: "signal_nfx",
    nfx: "signal_nfx",
    sg: "startups_gallery",
    cbi: "cbinsights",
  };
  const out: SourceName[] = [];
  for (const p of picks.length ? picks : ["openvc", "startups_gallery", "signal_nfx", "cbinsights"]) {
    const s = (alias[p] ?? p) as SourceName;
    if ((SOURCE_NAMES as readonly string[]).includes(s)) out.push(s);
    else console.warn(`[investment-focus-loop] unknown source skipped: ${p}`);
  }
  return out;
}

async function main(): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const runHours = Math.max(0.25, Number(process.env.RUN_HOURS ?? 6));
  const deadline = Date.now() + runHours * 3_600_000;
  const batchLimit = Math.max(1, Math.floor(Number(process.env.BATCH_LIMIT ?? 30)));
  const sleepMs = Math.max(0, Math.floor(Number(process.env.SLEEP_MS ?? 8000)));
  const concurrency = Math.max(1, Math.floor(Number(process.env.CONCURRENCY ?? 1)));
  const commit = process.env.COMMIT === "true" || process.env.COMMIT === "1";
  const freshnessDays = Math.max(0, Number(process.env.FRESHNESS_DAYS ?? 0));
  const headless = process.env.PLAYWRIGHT_HEADLESS !== "false";

  const sources = parseSources(process.env.SOURCES);
  const logger = createLogger({ pid: process.pid, job: "investment-focus-loop" });

  logger.info("loop.start", {
    run_hours: runHours,
    batch_limit: batchLimit,
    sleep_ms: sleepMs,
    concurrency,
    commit,
    sources,
    freshness_days: freshnessDays,
    headless,
  });

  const db = createClient(url, key);

  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalFailed = 0;
  let batches = 0;
  let emptyStreak = 0;

  const onStop = () => {
    logger.info("loop.sigint", { totalProcessed, totalUpdated, totalFailed, batches });
    process.exit(0);
  };
  process.on("SIGINT", onStop);
  process.on("SIGTERM", onStop);

  while (Date.now() < deadline) {
    const cfg: BackfillConfig = {
      sources,
      limit: batchLimit,
      offset: 0,
      commit,
      dry_run: !commit,
      only_missing: false,
      investment_focus_gaps: true,
      headless,
      storage_state_path: process.env.PLAYWRIGHT_STORAGE_STATE,
      freshness_days: freshnessDays,
      concurrency,
      max_retries: Math.max(1, Number(process.env.MAX_RETRIES ?? 2)),
    };

    const r = await runBackfill(db, cfg, logger);
    totalProcessed += r.processed;
    totalUpdated += r.updated;
    totalFailed += r.failed;
    batches++;

    logger.info("loop.batch", { ...r, batches, until_deadline_ms: deadline - Date.now() });

    if (r.processed === 0) {
      emptyStreak++;
      if (emptyStreak >= 12) {
        logger.info("loop.exhausted", { emptyStreak, message: "No gap firms in scan window — stopping." });
        break;
      }
      if (sleepMs) await sleep(Math.min(sleepMs, 4000));
      continue;
    }
    emptyStreak = 0;
    if (Date.now() >= deadline) break;
    if (sleepMs) await sleep(sleepMs);
  }

  logger.info("loop.done", { totalProcessed, totalUpdated, totalFailed, batches });
  process.exit(totalFailed > totalUpdated ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
