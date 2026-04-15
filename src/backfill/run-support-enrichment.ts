#!/usr/bin/env tsx

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { createLogger } from "./logger";
import { runSupportEnrichment, type SupportEnrichmentConfig } from "./support-enrichment";

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq > 0) {
      const key = arg.slice(2, eq);
      const value = arg.slice(eq + 1);
      out[key] = value === "true" ? true : value === "false" ? false : value;
    } else {
      out[arg.slice(2)] = true;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
    process.exit(1);
  }

  const commit = args.commit === true || args.commit === "true";
  const dryRun = args["dry-run"] === true || args["dry-run"] === "true" ? true : !commit;

  const cfg: SupportEnrichmentConfig = {
    limit: Number(args.limit ?? 100),
    offset: Number(args.offset ?? 0),
    commit: !dryRun,
    dry_run: dryRun,
    concurrency: Number(args.concurrency ?? 2),
    headless: !(process.env.PLAYWRIGHT_HEADLESS === "false" || args.headless === false || args.headless === "false"),
    storage_state_path: (args["storage-state"] as string | undefined) ?? process.env.PLAYWRIGHT_STORAGE_STATE,
    firm_id: typeof args["firm-id"] === "string" ? (args["firm-id"] as string) : undefined,
    freshness_days: Number(args["freshness-days"] ?? 0),
  };

  const logger = createLogger({ pid: process.pid, cli: "support_enrichment" });
  logger.info("cli.start", { cfg });

  const db = createClient(SUPABASE_URL, SUPABASE_KEY);
  try {
    const result = await runSupportEnrichment(db, cfg, logger);
    logger.info("cli.done", result);
    process.exit(result.failed > 0 ? 1 : 0);
  } catch (error) {
    logger.error("cli.fatal", {
      err: (error as Error).message,
      stack: (error as Error).stack,
    });
    process.exit(1);
  }
}

main();
