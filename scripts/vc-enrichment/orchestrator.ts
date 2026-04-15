/**
 * orchestrator.ts — Unified overnight enrichment scraper
 *
 * Runs all three source scrapers (Tracxn, CB Insights, Signal NFX) sequentially,
 * with full checkpointing, provenance, and resumability.
 *
 * Usage:
 *   npx tsx scripts/vc-enrichment/orchestrator.ts
 *   ENRICH_DRY_RUN=1 npx tsx scripts/vc-enrichment/orchestrator.ts
 *   ENRICH_SOURCES=tracxn,cb_insights npx tsx scripts/vc-enrichment/orchestrator.ts
 *   ENRICH_MAX_FIRMS=50 ENRICH_MAX_INVESTORS=100 npx tsx scripts/vc-enrichment/orchestrator.ts
 *   ENRICH_RESUME=enrich-2026-04-15T20-00-00 npx tsx scripts/vc-enrichment/orchestrator.ts
 *   ENRICH_SAMPLE=20 npx tsx scripts/vc-enrichment/orchestrator.ts   # dry-run on 20 records
 *
 * Env vars:
 *   ENRICH_DRY_RUN          — "1" to skip DB writes
 *   ENRICH_SOURCES          — comma-separated: tracxn,cb_insights,signal_nfx (default: all)
 *   ENRICH_MAX_FIRMS        — cap firm records per source (default: 999999)
 *   ENRICH_MAX_INVESTORS    — cap investor records per source (default: 999999)
 *   ENRICH_RESUME           — resume from a previous run_id
 *   ENRICH_SAMPLE           — if set, run dry-run on this many sample records
 *   ENRICH_FIRM_FILTER      — optional: only process firms matching this name substring
 *   ENRICH_INVESTOR_FILTER  — optional: only process investors matching this name substring
 *
 * Source-specific env vars (see individual scraper modules):
 *   TRACXN_EMAIL, TRACXN_PASSWORD, TRACXN_HEADLESS, TRACXN_DELAY_MS
 *   CBI_EMAIL, CBI_PASSWORD, CBI_HEADLESS, CBI_DELAY_MS
 *   SIGNAL_NFX_EMAIL, SIGNAL_NFX_PASSWORD, SIGNAL_NFX_HEADLESS, SIGNAL_NFX_DELAY_MS
 *
 * Required:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import {
  loadEnvFiles, env, envInt, envBool,
  getSupabase, log, setLogFile,
  generateRunId, createRun, finalizeRun,
  fetchIncompleteFirms, fetchIncompleteInvestors,
  fetchAllFirms, fetchAllInvestors,
  emptyStats,
  type SourceStats,
} from "./shared.js";

import { runTracxnScraper } from "./scrape-tracxn.js";
import { runCBInsightsScraper } from "./scrape-cb-insights.js";
import { runSignalNFXScraper } from "./scrape-signal-nfx.js";

// ── Load env ─────────────────────────────────────────────────────────────────

loadEnvFiles();

const DRY_RUN        = envBool("ENRICH_DRY_RUN");
const SAMPLE_SIZE    = envInt("ENRICH_SAMPLE", 0);
const MAX_FIRMS      = envInt("ENRICH_MAX_FIRMS", 999_999);
const MAX_INVESTORS  = envInt("ENRICH_MAX_INVESTORS", 999_999);
const RESUME_RUN_ID  = env("ENRICH_RESUME");
const FIRM_FILTER    = env("ENRICH_FIRM_FILTER").toLowerCase();
const INV_FILTER     = env("ENRICH_INVESTOR_FILTER").toLowerCase();

const SOURCES_RAW    = env("ENRICH_SOURCES") || "tracxn,cb_insights,signal_nfx";
const ENABLED_SOURCES = new Set(
  SOURCES_RAW.split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
);

const isDryRun = DRY_RUN || SAMPLE_SIZE > 0;

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const runId = RESUME_RUN_ID || generateRunId();
  setLogFile(runId);

  log("=".repeat(80));
  log(`  VC ENRICHMENT SCRAPER — ${isDryRun ? "DRY RUN" : "PRODUCTION"}`);
  log(`  Run ID: ${runId}`);
  log(`  Sources: ${[...ENABLED_SOURCES].join(", ")}`);
  log(`  Max firms per source: ${SAMPLE_SIZE || MAX_FIRMS}`);
  log(`  Max investors per source: ${SAMPLE_SIZE || MAX_INVESTORS}`);
  if (RESUME_RUN_ID) log(`  Resuming from: ${RESUME_RUN_ID}`);
  log("=".repeat(80));

  const supabase = getSupabase();

  // Register run
  if (!RESUME_RUN_ID) {
    await createRun(supabase, runId, isDryRun ? "dry_run" : "production", [...ENABLED_SOURCES]);
  }

  // ── Step 1: Load candidate queue ─────────────────────────────────────────

  log("\n--- Step 1: Loading incomplete firm and investor records ---\n");

  const maxF = SAMPLE_SIZE || MAX_FIRMS;
  const maxI = SAMPLE_SIZE || MAX_INVESTORS;

  let firmRecords = await fetchIncompleteFirms(supabase, Math.min(maxF * 3, 5000));
  let investorRecords = await fetchIncompleteInvestors(supabase, Math.min(maxI * 3, 10000));

  // Apply name filters if set
  if (FIRM_FILTER) {
    firmRecords = firmRecords.filter(r =>
      (r.firm_name || "").toLowerCase().includes(FIRM_FILTER)
    );
  }
  if (INV_FILTER) {
    investorRecords = investorRecords.filter(r => {
      const name = `${r.first_name || ""} ${r.last_name || ""}`.toLowerCase();
      return name.includes(INV_FILTER);
    });
  }

  // Cap to max
  firmRecords = firmRecords.slice(0, maxF);
  investorRecords = investorRecords.slice(0, maxI);

  log(`  Firms in queue: ${firmRecords.length}`);
  log(`  Investors in queue: ${investorRecords.length}`);

  // Also load ALL firms for matching purposes (scraped entities need to resolve to existing records)
  const allFirms = await fetchAllFirms(supabase, 5000);
  log(`  Total firms in DB (for matching): ${allFirms.length}`);

  // ── Step 2: Run each source scraper ──────────────────────────────────────

  const allStats: Record<string, SourceStats> = {};

  // Tracxn
  if (ENABLED_SOURCES.has("tracxn")) {
    log("\n" + "=".repeat(60));
    log("  SOURCE: TRACXN");
    log("=".repeat(60));

    const tracxnEmail = env("TRACXN_EMAIL");
    const tracxnPass  = env("TRACXN_PASSWORD");
    if (!tracxnEmail || !tracxnPass) {
      log("  TRACXN_EMAIL or TRACXN_PASSWORD not set — skipping Tracxn");
      allStats.tracxn = emptyStats();
    } else {
      try {
        allStats.tracxn = await runTracxnScraper({
          runId,
          dryRun: isDryRun,
          firmRecords,
          investorRecords,
          maxFirms: maxF,
          maxInvestors: maxI,
        });
      } catch (err: any) {
        log(`  TRACXN FATAL ERROR: ${err.message}`);
        allStats.tracxn = emptyStats();
        allStats.tracxn.errors = 1;
      }
    }
    logSourceSummary("Tracxn", allStats.tracxn);
  }

  // CB Insights
  if (ENABLED_SOURCES.has("cb_insights")) {
    log("\n" + "=".repeat(60));
    log("  SOURCE: CB INSIGHTS");
    log("=".repeat(60));

    const cbiEmail = env("CBI_EMAIL");
    const cbiPass  = env("CBI_PASSWORD");
    if (!cbiEmail || !cbiPass) {
      log("  CBI_EMAIL or CBI_PASSWORD not set — skipping CB Insights");
      allStats.cb_insights = emptyStats();
    } else {
      try {
        allStats.cb_insights = await runCBInsightsScraper({
          runId,
          dryRun: isDryRun,
          firmRecords,
          investorRecords,
          maxFirms: maxF,
          maxInvestors: maxI,
        });
      } catch (err: any) {
        log(`  CB INSIGHTS FATAL ERROR: ${err.message}`);
        allStats.cb_insights = emptyStats();
        allStats.cb_insights.errors = 1;
      }
    }
    logSourceSummary("CB Insights", allStats.cb_insights);
  }

  // Signal NFX
  if (ENABLED_SOURCES.has("signal_nfx")) {
    log("\n" + "=".repeat(60));
    log("  SOURCE: SIGNAL NFX");
    log("=".repeat(60));

    try {
      allStats.signal_nfx = await runSignalNFXScraper({
        runId,
        dryRun: isDryRun,
        firmRecords,
        investorRecords,
        maxFirms: maxF,
        maxInvestors: maxI,
      });
    } catch (err: any) {
      log(`  SIGNAL NFX FATAL ERROR: ${err.message}`);
      allStats.signal_nfx = emptyStats();
      allStats.signal_nfx.errors = 1;
    }
    logSourceSummary("Signal NFX", allStats.signal_nfx);
  }

  // ── Step 3: Generate final summary ───────────────────────────────────────

  const summary = generateFinalSummary(allStats);

  // Finalize run in DB
  await finalizeRun(supabase, runId, summary);

  // Print final summary
  printFinalSummary(summary, allStats);

  // Save summary to file
  const summaryPath = `data/enrichment-logs/${runId}-summary.json`;
  const { writeFileSync } = await import("node:fs");
  writeFileSync(summaryPath, JSON.stringify({ runId, mode: isDryRun ? "dry_run" : "production", ...summary, bySource: allStats }, null, 2));
  log(`\n  Summary saved to: ${summaryPath}`);
}

// ── Summary helpers ──────────────────────────────────────────────────────────

function logSourceSummary(name: string, stats: SourceStats): void {
  log(`\n  ${name} Summary:`);
  log(`    Firms searched:    ${stats.firmsSearched}`);
  log(`    Firms matched:     ${stats.firmsMatched}`);
  log(`    Firms updated:     ${stats.firmsUpdated}`);
  log(`    Firms not found:   ${stats.firmsNotFound}`);
  log(`    Investors searched: ${stats.investorsSearched}`);
  log(`    Investors matched:  ${stats.investorsMatched}`);
  log(`    Investors updated:  ${stats.investorsUpdated}`);
  log(`    Investors not found:${stats.investorsNotFound}`);
  log(`    Fields updated:     ${stats.fieldsUpdated}`);
  log(`    Fields queued:      ${stats.fieldsQueuedReview}`);
  log(`    Errors:             ${stats.errors}`);
}

function generateFinalSummary(allStats: Record<string, SourceStats>): Record<string, any> {
  let firmsProcessed = 0, investorsProcessed = 0;
  let firmsUpdated = 0, investorsUpdated = 0;
  let fieldsUpdated = 0, fieldsQueuedReview = 0;
  let errors = 0;
  const fieldsByType: Record<string, number> = {};
  const sourceCoverage: Record<string, { firms: number; investors: number }> = {};

  for (const [source, stats] of Object.entries(allStats)) {
    firmsProcessed += stats.firmsSearched;
    investorsProcessed += stats.investorsSearched;
    firmsUpdated += stats.firmsUpdated;
    investorsUpdated += stats.investorsUpdated;
    fieldsUpdated += stats.fieldsUpdated;
    fieldsQueuedReview += stats.fieldsQueuedReview;
    errors += stats.errors;
    sourceCoverage[source] = { firms: stats.firmsMatched, investors: stats.investorsMatched };

    for (const [field, count] of Object.entries(stats.fieldsByType)) {
      fieldsByType[field] = (fieldsByType[field] || 0) + count;
    }
  }

  return {
    firmsProcessed,
    investorsProcessed,
    firmsUpdated,
    investorsUpdated,
    fieldsUpdated,
    fieldsQueuedReview,
    duplicatesAvoided: 0,
    errors,
    fieldsByType,
    sourceCoverage,
  };
}

function printFinalSummary(summary: Record<string, any>, allStats: Record<string, SourceStats>): void {
  log("\n" + "=".repeat(80));
  log("  FINAL ENRICHMENT SUMMARY");
  log("=".repeat(80));
  log(`  Firms processed:       ${summary.firmsProcessed}`);
  log(`  Investors processed:   ${summary.investorsProcessed}`);
  log(`  Firms updated:         ${summary.firmsUpdated}`);
  log(`  Investors updated:     ${summary.investorsUpdated}`);
  log(`  Fields updated:        ${summary.fieldsUpdated}`);
  log(`  Fields queued review:  ${summary.fieldsQueuedReview}`);
  log(`  Errors:                ${summary.errors}`);

  log("\n  Source coverage:");
  for (const [source, cov] of Object.entries(summary.sourceCoverage as Record<string, any>)) {
    log(`    ${source}: ${cov.firms} firms, ${cov.investors} investors matched`);
  }

  if (Object.keys(summary.fieldsByType).length > 0) {
    log("\n  Fields updated by type:");
    const sorted = Object.entries(summary.fieldsByType as Record<string, number>)
      .sort(([, a], [, b]) => b - a);
    for (const [field, count] of sorted.slice(0, 30)) {
      log(`    ${field}: ${count}`);
    }
  }

  log("\n" + "=".repeat(80));
}

// ── Run ──────────────────────────────────────────────────────────────────────

main().catch(err => {
  log(`FATAL: ${err.message}`);
  console.error(err);
  process.exit(1);
});
