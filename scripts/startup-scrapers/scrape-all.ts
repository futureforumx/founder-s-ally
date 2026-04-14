/**
 * Startup Scraper Orchestrator
 * ==============================
 * Runs all startup scrapers in sequence (or a selected subset).
 *
 * Each source is isolated — a failure in one source does not block others.
 * Results are aggregated and printed at the end.
 *
 * Usage:
 *   npx tsx scripts/startup-scrapers/scrape-all.ts
 *   DRY_RUN=1 npx tsx scripts/startup-scrapers/scrape-all.ts
 *   SCRAPE_SOURCES=yc,seedtable npx tsx scripts/startup-scrapers/scrape-all.ts
 *   SCRAPE_SKIP=cbinsights,crunchbase npx tsx scripts/startup-scrapers/scrape-all.ts
 *
 * Environment variables:
 *   SCRAPE_SOURCES — Comma-separated list of sources to run (overrides all)
 *   SCRAPE_SKIP — Comma-separated list of sources to skip
 *   DRY_RUN=1 — Passed through to all scrapers
 *   SCRAPE_CONTINUE_ON_ERROR=1 — Continue even if a scraper fatally crashes (default: true)
 */

import { execFileSync } from "node:child_process";
import { join } from "node:path";

const SCRAPERS: Record<string, { script: string; requiresAuth: boolean; description: string }> = {
  yc: {
    script: "scrape-yc-companies.ts",
    requiresAuth: false,
    description: "YC Companies (ycombinator.com/companies)",
  },
  seedtable: {
    script: "scrape-seedtable.ts",
    requiresAuth: false,
    description: "SeedTable (seedtable.com)",
  },
  topstartups: {
    script: "scrape-topstartups.ts",
    requiresAuth: false,
    description: "TopStartups (topstartups.io)",
  },
  tinyteams: {
    script: "scrape-tinyteams.ts",
    requiresAuth: false,
    description: "TinyTeams (tinyteams.xyz)",
  },
  nextplay: {
    script: "scrape-nextplay.ts",
    requiresAuth: false,
    description: "NextPlay (nextplay.so/companies)",
  },
  gallery: {
    script: "scrape-startups-gallery.ts",
    requiresAuth: false,
    description: "Startups Gallery (startups.gallery)",
  },
  cbinsights: {
    script: "scrape-cbinsights.ts",
    requiresAuth: true,
    description: "CB Insights (cbinsights.com) — requires CBI_EMAIL + CBI_PASSWORD",
  },
  crunchbase: {
    script: "scrape-crunchbase.ts",
    requiresAuth: false,
    description: "Crunchbase (crunchbase.com) — API key recommended",
  },
};

const CONTINUE_ON_ERROR = process.env.SCRAPE_CONTINUE_ON_ERROR !== "0";
const DRY_RUN = process.env.DRY_RUN === "1";

function main(): void {
  console.log("=".repeat(60));
  console.log("  Startup Data Scraper — Orchestrator");
  console.log("=".repeat(60));
  console.log(`  DRY_RUN: ${DRY_RUN}`);
  console.log(`  Continue on error: ${CONTINUE_ON_ERROR}`);
  console.log();

  // Determine which sources to run
  let sourcesToRun: string[];
  if (process.env.SCRAPE_SOURCES) {
    sourcesToRun = process.env.SCRAPE_SOURCES.split(",").map((s) => s.trim().toLowerCase());
    const invalid = sourcesToRun.filter((s) => !SCRAPERS[s]);
    if (invalid.length > 0) {
      console.error(`Unknown sources: ${invalid.join(", ")}`);
      console.error(`Available: ${Object.keys(SCRAPERS).join(", ")}`);
      process.exit(1);
    }
  } else {
    sourcesToRun = Object.keys(SCRAPERS);
  }

  // Apply skip list
  if (process.env.SCRAPE_SKIP) {
    const skip = new Set(process.env.SCRAPE_SKIP.split(",").map((s) => s.trim().toLowerCase()));
    sourcesToRun = sourcesToRun.filter((s) => !skip.has(s));
  }

  console.log(`Sources to scrape: ${sourcesToRun.join(", ")}`);
  console.log();

  const results: Array<{ source: string; status: "success" | "skipped" | "error"; duration: number; error?: string }> = [];

  for (const source of sourcesToRun) {
    const scraper = SCRAPERS[source]!;
    const scriptPath = join(__dirname, scraper.script);

    console.log("-".repeat(60));
    console.log(`[${source}] ${scraper.description}`);

    if (scraper.requiresAuth) {
      // Check if auth env vars are available
      const hasAuth =
        source === "cbinsights"
          ? !!process.env.CBI_EMAIL && !!process.env.CBI_PASSWORD
          : source === "crunchbase"
          ? !!process.env.CRUNCHBASE_API_KEY
          : true;

      if (!hasAuth) {
        console.log(`[${source}] Skipping — missing required auth credentials`);
        results.push({ source, status: "skipped", duration: 0 });
        continue;
      }
    }

    const startTime = Date.now();
    try {
      execFileSync("npx", ["tsx", scriptPath], {
        stdio: "inherit",
        env: { ...process.env },
        timeout: 600_000, // 10 minute timeout per scraper
        maxBuffer: 64 * 1024 * 1024,
      });
      const duration = (Date.now() - startTime) / 1000;
      results.push({ source, status: "success", duration });
      console.log(`[${source}] Completed in ${duration.toFixed(1)}s`);
    } catch (err) {
      const duration = (Date.now() - startTime) / 1000;
      const msg = err instanceof Error ? err.message : String(err);
      results.push({ source, status: "error", duration, error: msg });
      console.error(`[${source}] Failed after ${duration.toFixed(1)}s: ${msg}`);

      if (!CONTINUE_ON_ERROR) {
        console.error("Aborting — set SCRAPE_CONTINUE_ON_ERROR=1 to continue past failures");
        process.exit(1);
      }
    }

    console.log();
  }

  // Summary
  console.log("=".repeat(60));
  console.log("  SCRAPE SUMMARY");
  console.log("=".repeat(60));

  const maxNameLen = Math.max(...results.map((r) => r.source.length));
  for (const r of results) {
    const status = r.status === "success" ? "OK" : r.status === "skipped" ? "SKIP" : "FAIL";
    const pad = " ".repeat(maxNameLen - r.source.length);
    const dur = r.duration > 0 ? `${r.duration.toFixed(1)}s` : "-";
    console.log(`  ${r.source}${pad}  ${status.padEnd(4)}  ${dur}`);
    if (r.error) {
      console.log(`  ${" ".repeat(maxNameLen)}  └─ ${r.error.slice(0, 100)}`);
    }
  }

  const successCount = results.filter((r) => r.status === "success").length;
  const errorCount = results.filter((r) => r.status === "error").length;
  const skipCount = results.filter((r) => r.status === "skipped").length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  console.log();
  console.log(`  Total: ${successCount} success, ${errorCount} errors, ${skipCount} skipped`);
  console.log(`  Time:  ${totalTime.toFixed(1)}s`);
  console.log("=".repeat(60));

  if (errorCount > 0 && !CONTINUE_ON_ERROR) {
    process.exit(1);
  }
}

main();
