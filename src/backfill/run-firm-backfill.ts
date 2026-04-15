#!/usr/bin/env tsx
/**
 * run-firm-backfill.ts
 * =====================
 * CLI entrypoint.
 *
 * Usage:
 *   pnpm tsx src/backfill/run-firm-backfill.ts \
 *     --limit=500 --offset=0 --source=all --commit=true
 *
 * Flags:
 *   --firm-id=UUID         Restrict to a single firm
 *   --source=NAME          one of: website, crunchbase, cbinsights, tracxn,
 *                          signal, openvc, vcsheet, startups_gallery,
 *                          wellfound, angellist, medium, substack, all
 *                          (can be repeated to pick multiple sources)
 *   --commit=true|false    Write to DB (default false → dry-run)
 *   --dry-run=true|false   Explicit dry-run (inverse of --commit)
 *   --limit=N              Number of firms to process (default 100)
 *   --offset=N             Offset into firm list (default 0)
 *   --only-missing=BOOL    Only include firms with missing fields (default true)
 *   --headless=BOOL        Playwright headless mode (default true)
 *   --storage-state=PATH   Override storage-state path for auth sessions
 *   --freshness-days=N     Skip firms verified within last N days (default 30)
 *   --concurrency=N        Concurrent firms (default 2)
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { runBackfill } from "./orchestrator";
import { createLogger } from "./logger";
import type { BackfillConfig, SourceName } from "./types";
import { SOURCE_NAMES } from "./types";

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq > 0) {
      const k = arg.slice(2, eq);
      const v = arg.slice(eq + 1);
      out[k] = v === "true" ? true : v === "false" ? false : v;
    } else {
      out[arg.slice(2)] = true;
    }
  }
  return out;
}

function parseSources(v: string | boolean | undefined): SourceName[] | "all" {
  if (!v || v === true || v === "all") return "all";
  const picks = String(v).split(",").map(s => s.trim()).filter(Boolean);
  const mapped: SourceName[] = [];
  for (const p of picks) {
    // Shorthand aliases
    const alias: Record<string, SourceName> = {
      signal: "signal_nfx",
      nfx: "signal_nfx",
      cb: "crunchbase",
      cbi: "cbinsights",
      sg: "startups_gallery",
    };
    const s = (alias[p] ?? p) as SourceName;
    if ((SOURCE_NAMES as readonly string[]).includes(s)) mapped.push(s);
    else console.warn(`⚠️  Unknown source: ${p}`);
  }
  return mapped.length ? mapped : "all";
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
    process.exit(1);
  }

  // Resolve commit vs dry_run
  const commit = args.commit === true || args.commit === "true";
  const dryRun = args["dry-run"] === true || args["dry-run"] === "true" ? true : !commit;

  const cfg: BackfillConfig = {
    sources:        parseSources(args.source),
    limit:          Number(args.limit ?? 100),
    offset:         Number(args.offset ?? 0),
    commit:         !dryRun,
    dry_run:        dryRun,
    only_missing:   args["only-missing"] === false ? false : true,
    firm_id:        typeof args["firm-id"] === "string" ? (args["firm-id"] as string) : undefined,
    headless:       !(process.env.PLAYWRIGHT_HEADLESS === "false" || args.headless === false || args.headless === "false"),
    storage_state_path: (args["storage-state"] as string | undefined) ?? process.env.PLAYWRIGHT_STORAGE_STATE,
    freshness_days: Number(args["freshness-days"] ?? 30),
    concurrency:    Number(args.concurrency ?? 2),
    max_retries:    Number(args["max-retries"] ?? 2),
  };

  const logger = createLogger({ pid: process.pid });
  logger.info("cli.start", { cfg });

  const db = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    const result = await runBackfill(db, cfg, logger);
    logger.info("cli.done", result);
    process.exit(result.failed > result.updated ? 1 : 0);
  } catch (e) {
    logger.error("cli.fatal", { err: (e as Error).message, stack: (e as Error).stack });
    process.exit(1);
  }
}

main();
