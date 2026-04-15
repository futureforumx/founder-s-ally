/**
 * orchestrator.ts
 * ================
 * Runs the full backfill for a set of firms.
 *
 * For each firm:
 *   1. Discover source URLs (in parallel, bounded by rate limits)
 *   2. Extract profiles from each source
 *   3. Normalize + merge results
 *   4. Run classification parser on merged text
 *   5. Write firm_records patch + provenance + tags + stage_focus
 *   6. Log to backfill_runs
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AdapterContext,
  AdapterResult,
  BackfillConfig,
  ExtractedProfile,
  FirmSeed,
  Logger,
  ProvenanceEntry,
  SourceAdapter,
  SourceName,
} from "./types";
import { ADAPTERS_BY_NAME, DEFAULT_RUN_ORDER } from "./adapters";
import { BrowserManager } from "./browser/playwright";
import { RateLimiter } from "./browser/rate-limit";
import { resolveStoragePaths } from "./browser/sessions";
import { normalizeProfile } from "./normalizers";
import { mergeAdapterResults } from "./merge";
import {
  buildFirmPatch,
  profileToFirmPatch,
  upsertFirm,
  DERIVED_CLASSIFICATION_KEYS,
  INVESTMENT_FOCUS_KEYS,
} from "./supabase/upsert-firm";
import { applyInvestmentIntelToProfile, needsInvestmentFocus } from "./parsers/investment-intel";
import { upsertProvenance } from "./supabase/upsert-provenance";
import { upsertStageFocus } from "./supabase/upsert-stage-focus";
import { upsertTags } from "./supabase/upsert-tags";
import { classifyFirm, toClassificationInput } from "./parsers/firm-classification";
import { extractDomain } from "./parsers/url-parser";

// ─── Firm selection ─────────────────────────────────────────────────────────

export interface FirmRow {
  id: string;
  firm_name: string;
  website_url?: string | null;
  crunchbase_url?: string | null;
  cb_insights_url?: string | null;
  tracxn_url?: string | null;
  signal_nfx_url?: string | null;
  openvc_url?: string | null;
  vcsheet_url?: string | null;
  startups_gallery_url?: string | null;
  angellist_url?: string | null;
  wellfound_url?: string | null;
  medium_url?: string | null;
  substack_url?: string | null;
  linkedin_url?: string | null;
  description?: string | null;
  hq_city?: string | null;
  hq_country?: string | null;
  founded_year?: number | null;
  stage_focus?: string[] | null;
  last_verified_at?: string | null;
  thesis_verticals?: string[] | null;
  thesis_orientation?: string | null;
  sector_scope?: string | null;
  strategy_classifications?: string[] | null;
  geo_focus?: string[] | null;
}

/** Query firm_records for candidates matching the run config. */
export async function selectFirms(
  db: SupabaseClient,
  cfg: BackfillConfig,
  logger: Logger,
): Promise<FirmRow[]> {
  const selectCols = [
    "id", "firm_name",
    "website_url", "crunchbase_url", "cb_insights_url", "tracxn_url", "signal_nfx_url",
    "openvc_url", "vcsheet_url", "startups_gallery_url", "angellist_url", "wellfound_url",
    "medium_url", "substack_url", "linkedin_url",
    "description", "hq_city", "hq_country", "founded_year", "stage_focus",
    "last_verified_at",
    "thesis_verticals", "thesis_orientation", "sector_scope", "strategy_classifications", "geo_focus",
  ].join(",");

  let q = db.from("firm_records").select(selectCols).order("firm_name");

  if (cfg.firm_id) {
    q = q.eq("id", cfg.firm_id);
  } else {
    // Skip individual-investor placeholders and require a website so adapters
    // have something to work with. Removes 90s-per-firm dead-end searches.
    q = q.not("firm_name", "ilike", "%(Individual)%")
         .not("website_url", "is", null);
  }
  const want = Math.max(1, cfg.limit || 100);
  if (cfg.investment_focus_gaps && !cfg.firm_id) {
    // Scan a wider window then filter — sparse gaps otherwise return 0 rows from a tight range().
    const scan = Math.min(2500, Math.max(want * 40, 400));
    q = q.range(cfg.offset, cfg.offset + scan - 1);
  } else if (cfg.limit) {
    q = q.range(cfg.offset, cfg.offset + cfg.limit - 1);
  }

  const { data, error } = await q;
  if (error) { logger.error("select.firms.failed", { err: error.message }); return []; }
  if (!data) return [];

  let rows = data as unknown as FirmRow[];

  if (cfg.investment_focus_gaps) {
    rows = rows.filter(needsInvestmentFocus).slice(0, want);
  } else if (cfg.only_missing) {
    rows = rows.filter(isFirmMissingFields);
  }

  if (cfg.freshness_days > 0) {
    const threshold = Date.now() - cfg.freshness_days * 86_400_000;
    rows = rows.filter(f => !f.last_verified_at || new Date(f.last_verified_at).getTime() < threshold);
  }

  return rows;
}

/** A firm is "missing fields" if any of these are empty. */
export function isFirmMissingFields(f: FirmRow): boolean {
  const empties = [
    !f.description?.trim(),
    !f.hq_city?.trim(),
    !f.hq_country?.trim(),
    f.founded_year == null,
    !f.stage_focus?.length,
    !f.crunchbase_url?.trim(),
    !f.cb_insights_url?.trim(),
    !f.tracxn_url?.trim(),
    !f.signal_nfx_url?.trim(),
    !f.openvc_url?.trim(),
    !f.linkedin_url?.trim(),
  ];
  return empties.filter(Boolean).length >= 2;  // at least 2 missing
}

// ─── Main backfill loop ─────────────────────────────────────────────────────

export async function runBackfill(
  db: SupabaseClient,
  cfg: BackfillConfig,
  logger: Logger,
): Promise<{ processed: number; updated: number; failed: number }> {
  const firms = await selectFirms(db, cfg, logger);
  logger.info("backfill.selected", { count: firms.length });

  const sources = (cfg.sources === "all" ? DEFAULT_RUN_ORDER : cfg.sources) as SourceName[];
  const adapters = sources
    .map((s) => ADAPTERS_BY_NAME[s])
    .filter((a): a is SourceAdapter => !!a);

  const browser = new BrowserManager({
    headless: cfg.headless,
    storageStatePaths: resolveStoragePaths(cfg.storage_state_path ? { website: cfg.storage_state_path } : {}),
    defaultTimeoutMs: 30_000,
    logger,
  });
  await browser.start();

  const rateLimiter = new RateLimiter();

  const ctx: AdapterContext = {
    getPage:     (src) => browser.getPage(src),
    releasePage: (src, p) => browser.releasePage(src, p),
    throttle:    async (src) => { await rateLimiter.acquire(src); rateLimiter.release(src); },
    logger,
    dryRun:      cfg.dry_run,
  };

  let processed = 0, updated = 0, failed = 0;
  const concurrency = Math.max(1, cfg.concurrency);
  const queue = [...firms];

  async function worker() {
    while (queue.length) {
      const firm = queue.shift();
      if (!firm) break;
      try {
        await processFirm(db, firm, adapters, ctx, cfg, rateLimiter, logger);
        updated++;
      } catch (e) {
        failed++;
        logger.error("firm.failed", { firm: firm.firm_name, err: (e as Error).message });
      } finally {
        processed++;
        if (processed % 10 === 0) logger.info("backfill.progress", { processed, total: firms.length, updated, failed });
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  await browser.stop();

  logger.info("backfill.done", { processed, updated, failed });
  return { processed, updated, failed };
}

// ─── Single-firm pipeline ───────────────────────────────────────────────────

async function processFirm(
  db: SupabaseClient,
  firm: FirmRow,
  adapters: SourceAdapter[],
  ctx: AdapterContext,
  cfg: BackfillConfig,
  rateLimiter: RateLimiter,
  logger: Logger,
): Promise<void> {
  const start = Date.now();
  const firmLogger = logger.child({ firm: firm.firm_name, firm_id: firm.id });

  const seed: FirmSeed = {
    id: firm.id,
    firm_name: firm.firm_name,
    website_url: firm.website_url,
    linkedin_url: firm.linkedin_url,
    crunchbase_url: firm.crunchbase_url,
    domain: extractDomain(firm.website_url ?? null) ?? undefined,
    known_urls: {
      website: firm.website_url ?? undefined,
      crunchbase: firm.crunchbase_url ?? undefined,
      cbinsights: firm.cb_insights_url ?? undefined,
      tracxn: firm.tracxn_url ?? undefined,
      signal_nfx: firm.signal_nfx_url ?? undefined,
      openvc: firm.openvc_url ?? undefined,
      vcsheet: firm.vcsheet_url ?? undefined,
      startups_gallery: firm.startups_gallery_url ?? undefined,
      angellist: firm.angellist_url ?? undefined,
      wellfound: firm.wellfound_url ?? undefined,
      medium: firm.medium_url ?? undefined,
      substack: firm.substack_url ?? undefined,
      linkedin: firm.linkedin_url ?? undefined,
    },
  };

  // ── Run adapters (sequential per firm but parallelized via outer workers) ──
  const results: AdapterResult[] = [];
  for (const adapter of adapters) {
    try {
      const url = await rateLimiter.run(adapter.name, () => adapter.discoverFirmUrl(seed, ctx));
      if (!url) { firmLogger.debug("adapter.no_url", { source: adapter.name }); continue; }

      const res = await rateLimiter.run(adapter.name, () => adapter.extractFirmProfile(url, seed, ctx));
      if (res && res.match_confidence >= 0.55) {
        res.profile = normalizeProfile(res.profile);
        results.push(res);
        firmLogger.debug("adapter.ok", { source: adapter.name, match: res.match_confidence.toFixed(2) });
      } else if (res) {
        firmLogger.debug("adapter.low_match", { source: adapter.name, match: res.match_confidence.toFixed(2) });
      }
    } catch (e) {
      firmLogger.warn("adapter.error", { source: adapter.name, err: (e as Error).message });
    }
  }

  if (!results.length) {
    await recordRun(db, firm, "skipped", [], start, cfg.dry_run);
    return;
  }

  // ── Merge + classify ──
  const merged = mergeAdapterResults(results);

  // Run classification parser on merged profile (derived source)
  const classification = classifyFirm(toClassificationInput(merged.profile, {
    source_tags: [
      ...(merged.profile.sectors ?? []),
      ...(merged.profile.themes ?? []),
    ],
  }));

  const classProv: ProvenanceEntry[] = [];
  const derivedPatch: Record<string, unknown> = {};
  const now = new Date();
  for (const [field, entry] of Object.entries(classification)) {
    if (!entry) continue;
    derivedPatch[field] = entry.value;
    classProv.push({
      field_name: field,
      source_name: "classification",
      value: entry.value,
      confidence: entry.confidence,
      source_url: null,
      extracted_at: now,
    });
  }

  // Merge classification fields into profile when firm_records value is null
  const classified = { ...merged.profile, ...derivedPatch } as ExtractedProfile;
  const finalProfile = applyInvestmentIntelToProfile(classified);

  // ── Fetch current row to avoid overwriting non-null fields ──
  const { data: existingRow } = await db
    .from("firm_records")
    .select("*")
    .eq("id", firm.id)
    .maybeSingle();

  // ── Write firm_records patch ──
  const patch = profileToFirmPatch(finalProfile);
  const { updated: fieldsWritten, diff } = await upsertFirm(
    db,
    {
      firmId: firm.id,
      patch,
      existing: existingRow as Record<string, unknown> | null,
      // Classification fields are derived — allow later runs to update them
      // even when an existing value is present. Hard facts (URLs, HQ, etc.)
      // are still protected by the no-overwrite-non-null rule.
      forceOverwriteKeys: [...DERIVED_CLASSIFICATION_KEYS, ...INVESTMENT_FOCUS_KEYS],
    },
    { dryRun: cfg.dry_run, logger: firmLogger },
  );
  if (cfg.dry_run) firmLogger.info("firm.dry_diff", { firm: firm.firm_name, diff });

  // Set manual_review_status if merge detected conflicts
  if (merged.conflicted_fields.length && !cfg.dry_run) {
    await db.from("firm_records").update({ manual_review_status: "needs_review" }).eq("id", firm.id);
  }

  // ── Write provenance (merged + classification) ──
  const allProv = [...merged.provenance, ...classProv];
  await upsertProvenance(db, { firmId: firm.id, entries: allProv }, { dryRun: cfg.dry_run, logger: firmLogger });

  // ── Write tags + stage_focus ──
  if (finalProfile.stages?.length) {
    await upsertStageFocus(db, { firmId: firm.id, stages: finalProfile.stages }, { dryRun: cfg.dry_run, logger: firmLogger });
  }
  if (finalProfile.sectors?.length) {
    await upsertTags(db, {
      firmId: firm.id, namespace: "sector", values: finalProfile.sectors,
      source: dominantSource(results), confidence: 0.7,
    }, { dryRun: cfg.dry_run, logger: firmLogger });
  }
  if (finalProfile.themes?.length) {
    await upsertTags(db, {
      firmId: firm.id, namespace: "theme", values: finalProfile.themes,
      source: dominantSource(results), confidence: 0.7,
    }, { dryRun: cfg.dry_run, logger: firmLogger });
  }
  if (finalProfile.geographies?.length) {
    await upsertTags(db, {
      firmId: firm.id, namespace: "geo", values: finalProfile.geographies,
      source: dominantSource(results), confidence: 0.7,
    }, { dryRun: cfg.dry_run, logger: firmLogger });
  }

  await recordRun(db, firm, fieldsWritten.length ? "ok" : "partial", fieldsWritten, start, cfg.dry_run);
  firmLogger.info("firm.done", { fields_written: fieldsWritten.length, sources: results.length, conflicts: merged.conflicted_fields.length, duration_ms: Date.now() - start });
}

function dominantSource(results: AdapterResult[]): SourceName {
  if (!results.length) return "website";
  return results.sort((a, b) => b.match_confidence - a.match_confidence)[0].source;
}

async function recordRun(
  db: SupabaseClient,
  firm: FirmRow,
  status: "ok" | "failed" | "partial" | "skipped",
  fieldsWritten: string[],
  start: number,
  dryRun: boolean,
): Promise<void> {
  if (dryRun) return;
  try {
    await db.from("backfill_runs").insert({
      firm_id: firm.id,
      firm_name: firm.firm_name,
      status,
      fields_written: fieldsWritten,
      duration_ms: Date.now() - start,
      finished_at: new Date().toISOString(),
    });
  } catch { /* best effort */ }
}
