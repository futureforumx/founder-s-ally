/**
 * r2-headshot-backfill.ts
 *
 * Backfill R2 headshots for investors already in the DB (or in the JSONL cache).
 *
 * Strategy:
 *   1. Load investors from Supabase firm_investors that have avatar_url set
 *      but no corresponding headshot_assets row yet (efficient via LEFT JOIN).
 *   2. Fetch + upload each avatar to R2 with concurrency control.
 *   3. Insert pending rows into headshot_assets.
 *
 * Modes:
 *   BACKFILL_SOURCE=db    (default) — query Supabase for investors missing headshots
 *   BACKFILL_SOURCE=jsonl           — re-process /tmp/signal-nfx-investors.jsonl (faster if DB IDs are needed)
 *   BACKFILL_LIMIT=500              — stop after N uploads (useful for testing)
 *   BACKFILL_CONCURRENCY=8          — parallel fetch+upload goroutines (default: 6)
 *   BACKFILL_DRY_RUN=1              — print what would be uploaded without doing it
 *
 * Usage:
 *   npx tsx scripts/r2-headshot-backfill.ts
 *   BACKFILL_LIMIT=50 BACKFILL_DRY_RUN=1 npx tsx scripts/r2-headshot-backfill.ts
 *   BACKFILL_CONCURRENCY=12 npx tsx scripts/r2-headshot-backfill.ts
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, appendFileSync } from "node:fs";
import { loadEnvFiles } from "./lib/loadEnvFiles";
import { uploadHeadshot } from "./r2-image-upload";

loadEnvFiles([".env", ".env.local"]);

// ── Config ────────────────────────────────────────────────────────────────────

function e(n: string) { return (process.env[n] || "").trim(); }
function eInt(n: string, fb: number) { const v = parseInt(e(n), 10); return isFinite(v) && v > 0 ? v : fb; }
function eBool(n: string) { return ["1","true","yes"].includes(e(n).toLowerCase()); }

const SUPA_URL    = e("SUPABASE_URL") || e("NEXT_PUBLIC_SUPABASE_URL");
const SUPA_KEY    = e("SUPABASE_SERVICE_ROLE_KEY");
const SOURCE      = e("BACKFILL_SOURCE") || "db";
const LIMIT       = eInt("BACKFILL_LIMIT", Infinity as any);
const CONCURRENCY = eInt("BACKFILL_CONCURRENCY", 6);
const DRY_RUN     = eBool("BACKFILL_DRY_RUN");
const JSONL_FILE  = e("BACKFILL_JSONL") || "/tmp/signal-nfx-investors.jsonl";
const LOG_FILE    = "/tmp/r2-headshot-backfill.log";

if (!SUPA_URL) throw new Error("SUPABASE_URL not set");
if (!SUPA_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");

const supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

// ── Logging ───────────────────────────────────────────────────────────────────

function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + "\n");
}

// ── Investor record types ─────────────────────────────────────────────────────

interface InvestorToProcess {
  id: string;         // firm_investors.id (UUID)
  slug: string;       // used for R2 key path
  full_name: string;
  avatar_url: string;
}

// ── Load from Supabase DB (skipping those already in headshot_assets) ─────────

async function loadFromDB(): Promise<InvestorToProcess[]> {
  log("Loading investors with avatar_url from Supabase (missing headshot_assets)...");

  const results: InvestorToProcess[] = [];
  let offset = 0;
  const PAGE = 1000;

  while (true) {
    // Get investors that have an avatar_url but no approved/pending headshot yet
    const { data, error } = await supabase
      .from("firm_investors")
      .select("id, slug, full_name, avatar_url")
      .not("avatar_url", "is", null)
      .neq("avatar_url", "")
      .range(offset, offset + PAGE - 1);

    if (error) throw new Error(`DB load error: ${error.message}`);
    if (!data || data.length === 0) break;

    // Filter out those already in headshot_assets
    const ids = data.map((r: any) => r.id);
    const { data: existing } = await supabase
      .from("headshot_assets")
      .select("investor_id")
      .in("investor_id", ids);

    const done = new Set((existing || []).map((r: any) => r.investor_id));

    for (const row of data) {
      if (!done.has(row.id) && row.avatar_url) {
        results.push({
          id: row.id,
          slug: row.slug || row.full_name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          full_name: row.full_name,
          avatar_url: row.avatar_url,
        });
      }
    }

    log(`  Loaded page offset=${offset}: ${data.length} rows, ${results.length} pending so far`);

    if (data.length < PAGE) break;
    offset += PAGE;

    if (results.length >= LIMIT) break;
  }

  return results.slice(0, LIMIT);
}

// ── Load from JSONL cache (maps slug → avatar_url, then looks up DB ids) ──────

async function loadFromJSONL(): Promise<InvestorToProcess[]> {
  if (!existsSync(JSONL_FILE)) {
    throw new Error(`JSONL file not found: ${JSONL_FILE}. Run scrape-signal-nfx-api.ts first.`);
  }

  log(`Loading from JSONL: ${JSONL_FILE}`);

  const lines = readFileSync(JSONL_FILE, "utf8").split("\n").filter(Boolean);
  log(`  ${lines.length} lines in JSONL`);

  // Parse slugs and avatar_urls from JSONL
  const slugsWithAvatars: Array<{ slug: string; full_name: string; avatar_url: string }> = [];
  for (const line of lines) {
    try {
      const inv = JSON.parse(line);
      if (inv.avatar_url && inv.slug) {
        slugsWithAvatars.push({ slug: inv.slug, full_name: inv.full_name, avatar_url: inv.avatar_url });
      }
    } catch { /* skip malformed */ }
  }

  log(`  ${slugsWithAvatars.length} investors with avatar_url`);

  // Batch-resolve DB UUIDs by slug
  const results: InvestorToProcess[] = [];
  const BATCH = 500;

  for (let i = 0; i < slugsWithAvatars.length; i += BATCH) {
    const batch = slugsWithAvatars.slice(i, i + BATCH);
    const slugs = batch.map(b => b.slug);

    const { data: rows, error } = await supabase
      .from("firm_investors")
      .select("id, slug")
      .in("slug", slugs);

    if (error) { log(`  Warning: slug lookup failed: ${error.message}`); continue; }

    const slugToId = new Map((rows || []).map((r: any) => [r.slug, r.id]));

    for (const inv of batch) {
      const id = slugToId.get(inv.slug);
      if (id) {
        results.push({ id, slug: inv.slug, full_name: inv.full_name, avatar_url: inv.avatar_url });
      }
    }

    if (results.length >= LIMIT) break;
  }

  // Filter already-uploaded
  const allIds = results.map(r => r.id);
  const { data: existing } = await supabase
    .from("headshot_assets")
    .select("investor_id")
    .in("investor_id", allIds);
  const done = new Set((existing || []).map((r: any) => r.investor_id));

  return results.filter(r => !done.has(r.id)).slice(0, LIMIT);
}

// ── Concurrency pool ──────────────────────────────────────────────────────────

async function runWithConcurrency<T>(
  items: T[],
  fn: (item: T, index: number) => Promise<void>,
  concurrency: number,
): Promise<void> {
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  appendFileSync(LOG_FILE, `\n=== R2 Headshot Backfill — ${new Date().toISOString()} ===\n`);
  log(`SOURCE=${SOURCE}  LIMIT=${LIMIT}  CONCURRENCY=${CONCURRENCY}  DRY_RUN=${DRY_RUN}`);

  const investors = SOURCE === "jsonl" ? await loadFromJSONL() : await loadFromDB();
  log(`\n${investors.length} investors to process`);

  if (investors.length === 0) {
    log("Nothing to do.");
    return;
  }

  if (DRY_RUN) {
    log("\n[DRY RUN] Would upload:");
    investors.slice(0, 10).forEach(inv => log(`  ${inv.full_name} → ${inv.avatar_url}`));
    if (investors.length > 10) log(`  ... and ${investors.length - 10} more`);
    return;
  }

  let uploaded = 0, skipped = 0, failed = 0;
  const startTime = Date.now();

  await runWithConcurrency(investors, async (inv, idx) => {
    try {
      const result = await uploadHeadshot({
        investorId: inv.id,
        slug: inv.slug,
        sourceUrl: inv.avatar_url,
        source: "signal_nfx",
      });

      if (result) {
        uploaded++;
        if ((idx + 1) % 100 === 0 || idx + 1 === investors.length) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const rate = (uploaded / parseFloat(elapsed)).toFixed(1);
          log(`  [${idx + 1}/${investors.length}] uploaded=${uploaded} skipped=${skipped} failed=${failed} (${rate}/s)`);
        }
      } else {
        skipped++;
      }
    } catch (err: any) {
      failed++;
      log(`  ❌ ${inv.full_name} (${inv.id}): ${err.message}`);
    }
  }, CONCURRENCY);

  const totalSec = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`\n✅  Done in ${totalSec}s — uploaded=${uploaded} skipped=${skipped} failed=${failed}`);
  log(`  Log: ${LOG_FILE}`);
}

main().catch(err => {
  log(`FATAL: ${err.message}\n${err.stack}`);
  process.exit(1);
});
