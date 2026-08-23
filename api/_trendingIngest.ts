import type { SupabaseClient } from "@supabase/supabase-js";
import { shouldExcludeStartup } from "./_trendingAntiGaming.js";
import { catalogToCacheRecords, revalidateTrendingStartupsPath, upsertTrendingCache } from "./_trendingCache.js";
import { buildTrendingCatalog } from "./_trendingCatalog.js";
import { TRENDING_SEED_STARTUPS } from "./_trendingSignals.js";
import type { RawStartupSignal, TrendingCatalogResponse } from "./_trendingTypes.js";

export type RawMetricDelta = RawStartupSignal & {
  metrics: {
    githubStars: number;
    xMentions: number;
    phLaunches: number;
  };
};

export type TrendingIngestResult = {
  success: true;
  updated_count: number;
  timestamp: string;
};

/**
 * Background fetch of raw 24h metric deltas.
 * Seed adapters stand in for GitHub stars, X mentions, and Product Hunt launches
 * until live source jobs are wired.
 */
export async function fetchRawMetricDeltas(): Promise<RawMetricDelta[]> {
  return TRENDING_SEED_STARTUPS.map((row) => ({
    ...row,
    metrics: {
      githubStars: row.current24h.developer,
      xMentions: row.current24h.social,
      phLaunches: row.current24h.launch,
    },
  }));
}

/** Discard companies with >50 employees, >$15M raised, or domain age >4 years. */
export function filterFirmographicGates(rows: RawStartupSignal[], now: Date): RawStartupSignal[] {
  return rows.filter((row) => !shouldExcludeStartup(row, now));
}

export function scoreRelativeGrowthAndGravity(
  rows: RawStartupSignal[],
  now: Date,
): TrendingCatalogResponse {
  return buildTrendingCatalog(rows, now);
}

export async function computeTrendingLeaderboard(now = new Date()) {
  const raw = await fetchRawMetricDeltas();
  const gated = filterFirmographicGates(raw, now);
  const catalog = scoreRelativeGrowthAndGravity(raw, now);
  const records = catalogToCacheRecords(catalog, now.toISOString());
  return { raw, gated, catalog, records };
}

export async function runTrendingLeaderboardPipeline(
  client: SupabaseClient,
  now = new Date(),
): Promise<TrendingIngestResult> {
  const { records } = await computeTrendingLeaderboard(now);
  const updated_count = await upsertTrendingCache(client, records);
  await revalidateTrendingStartupsPath();
  return {
    success: true,
    updated_count,
    timestamp: now.toISOString(),
  };
}

export function authorizeCronRequest(
  authorization: string | string[] | undefined,
  secret = process.env.CRON_SECRET,
): boolean {
  if (!secret) return false;
  const header = Array.isArray(authorization) ? authorization[0] : authorization;
  return (header ?? "").trim() === `Bearer ${secret}`;
}
