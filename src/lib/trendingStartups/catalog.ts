import { sanitizeRawSignals, shouldExcludeStartup } from "./antiGaming.js";
import { applyEarlyStageSignalMask } from "./earlyStageGate.js";
import { isSameStartupEntity, normalizeDomain } from "./entityResolution.js";
import { TRENDING_SEED_STARTUPS } from "./mockSignals.js";
import { gravityScore, normalizeScoresToHundred, relativeGrowthDeltas } from "./score.js";
import {
  GRAVITY_EXPONENT,
  GRAVITY_OFFSET_HOURS,
  GROWTH_DELTA_OFFSET,
  MAX_DOMAIN_AGE_YEARS,
  MAX_EARLY_STAGE_EMPLOYEES,
  MAX_EARLY_STAGE_FUNDING_USD,
  MAX_GITHUB_REPO_AGE_MONTHS,
  PLATFORM_WEIGHTS,
  PUBLIC_UNLOCKED_COUNT,
  type RawStartupSignal,
  type TrendingCatalogResponse,
  type TrendingStartupRow,
} from "./types";

export const TRENDING_CATALOG_NOW = new Date("2026-08-22T19:00:00.000Z");

export function trendingAlgorithmMeta(): TrendingCatalogResponse["algorithm"] {
  return {
    scoring: "relative_growth_delta",
    weights: PLATFORM_WEIGHTS,
    gravityExponent: GRAVITY_EXPONENT,
    gravityOffsetHours: GRAVITY_OFFSET_HOURS,
    publicUnlockedCount: PUBLIC_UNLOCKED_COUNT,
    growthDeltaOffset: GROWTH_DELTA_OFFSET,
    earlyStageGate: {
      maxEmployees: MAX_EARLY_STAGE_EMPLOYEES,
      maxTotalFundingUsd: MAX_EARLY_STAGE_FUNDING_USD,
      maxDomainAgeYears: MAX_DOMAIN_AGE_YEARS,
      maxGithubRepoAgeMonths: MAX_GITHUB_REPO_AGE_MONTHS,
      socialRequiresEarlyStageInvestorMention: true,
    },
  };
}

export function emptyTrendingCatalog(generatedAt: string): TrendingCatalogResponse {
  return { generatedAt, algorithm: trendingAlgorithmMeta(), startups: [] };
}

function signalStrength(row: RawStartupSignal): number {
  return row.raw.launch + row.raw.social + row.raw.developer + row.raw.traction;
}

export function dedupeStartups(rows: RawStartupSignal[]): RawStartupSignal[] {
  const kept: RawStartupSignal[] = [];
  for (const row of rows) {
    const matchIdx = kept.findIndex((existing) => isSameStartupEntity(existing, row));
    if (matchIdx === -1) {
      kept.push({ ...row, domain: normalizeDomain(row.domain) || row.domain });
      continue;
    }
    const current = kept[matchIdx]!;
    kept[matchIdx] = signalStrength(row) > signalStrength(current)
      ? {
          ...row,
          domain: normalizeDomain(row.domain) || current.domain,
          brandAliases: [...new Set([...current.brandAliases, ...row.brandAliases, current.name])],
        }
      : {
          ...current,
          brandAliases: [...new Set([...current.brandAliases, ...row.brandAliases, row.name])],
        };
  }
  return kept;
}

export function buildTrendingCatalog(
  rows: RawStartupSignal[] = TRENDING_SEED_STARTUPS,
  now: Date = TRENDING_CATALOG_NOW,
): TrendingCatalogResponse {
  const eligible = dedupeStartups(rows)
    .filter((row) => !shouldExcludeStartup(row, now))
    .map((row) => ({ ...row, raw: sanitizeRawSignals(row) }));

  const scored = eligible.map((row) => {
    const growthDeltas = applyEarlyStageSignalMask(
      relativeGrowthDeltas(row.current24h, row.baseline30d),
      row,
      now,
    );
    const gravity = gravityScore({
      zScores: growthDeltas,
      sentiment: row.sentiment,
      hoursElapsed: row.hoursElapsed,
    });
    return { row, zScores: growthDeltas, gravity };
  });

  scored.sort((a, b) => b.gravity.score - a.gravity.score);
  const composites = normalizeScoresToHundred(scored.map((item) => item.gravity.score));

  const startups: TrendingStartupRow[] = scored.map((item, index) => ({
    id: item.row.id,
    rank: index + 1,
    name: item.row.name,
    domain: item.row.domain,
    website: item.row.website,
    logoUrl: item.row.logoUrl,
    microCategory: item.row.microCategory,
    fundingStage: item.row.fundingStage,
    hqLocation: item.row.hqLocation,
    compositeScore: composites[index] ?? 0,
    gravityScore: item.gravity.score,
    hoursElapsed: item.row.hoursElapsed,
    sentiment: item.row.sentiment,
    sentimentMultiplier: item.gravity.multiplier,
    zScores: item.zScores,
    weighted: item.gravity.weighted,
    velocity24h: item.row.velocity24h,
    velocity7d: item.row.velocity7d,
    velocity30d: item.row.velocity30d,
    velocity90d: item.row.velocity90d,
    catalyst: item.row.catalyst,
    twitter: item.row.twitter,
    linkedin: item.row.linkedin,
    github: item.row.github,
    teardown: item.row.teardown,
    locked: index >= PUBLIC_UNLOCKED_COUNT,
  }));

  return {
    generatedAt: now.toISOString(),
    algorithm: trendingAlgorithmMeta(),
    startups,
  };
}

export function findTrendingStartup(
  id: string,
  catalog: TrendingCatalogResponse,
): TrendingStartupRow | null {
  const needle = id.trim().toLowerCase();
  return catalog.startups.find((row) => row.id === needle || row.domain === needle) ?? null;
}
