import { describe, expect, it } from "vitest";
import { hasDuplicateIpSpike, isTooNewAccount, sanitizeRawSignals, shouldExcludeStartup } from "@/lib/trendingStartups/antiGaming";
import { cacheRecordsToCatalog, catalogToCacheRecords } from "@/lib/trendingStartups/cache";
import { buildTrendingCatalog, emptyTrendingCatalog, findTrendingStartup, TRENDING_CATALOG_NOW } from "@/lib/trendingStartups/catalog";
import { authorizeCronRequest, computeTrendingLeaderboard } from "@/lib/trendingStartups/ingest";
import { TRENDING_PAGE_LIMIT, TRENDING_REVALIDATE_SECONDS } from "@/lib/trendingStartups/types";
import { applyEarlyStageSignalMask, isEstablishedTechCompany, passesEarlyStageGate } from "@/lib/trendingStartups/earlyStageGate";
import { brandSimilarity, isSameStartupEntity, normalizeDomain } from "@/lib/trendingStartups/entityResolution";
import { TRENDING_SEED_STARTUPS, TRENDING_TEST_FIXTURES } from "@/lib/trendingStartups/mockSignals";
import { buildStartupLogoCandidates, startupLogoSrc } from "@/lib/trendingStartups/logos";
import { gravityScore, relativeGrowthDelta, zScore } from "@/lib/trendingStartups/score";
import { PUBLIC_UNLOCKED_COUNT, type RawStartupSignal } from "@/lib/trendingStartups/types";

function sampleRow(overrides: Partial<RawStartupSignal> = {}): RawStartupSignal {
  return {
    id: "sample",
    name: "Sample Labs",
    brandAliases: [],
    domain: "samplelabs.dev",
    website: "https://samplelabs.dev",
    logoUrl: null,
    microCategory: "Test",
    fundingStage: "Pre-Seed",
    hqLocation: "San Francisco",
    twitter: null,
    linkedin: null,
    github: "https://github.com/samplelabs",
    accountCreatedAt: "2024-06-01T00:00:00.000Z",
    hoursElapsed: 12,
    sentiment: "neutral",
    raw: { launch: 40, social: 40, developer: 40, traction: 40 },
    upvoteIps: ["198.51.100.1", "203.0.113.2"],
    employeeCount: 12,
    totalFundingUsd: 2_000_000,
    domainRegisteredAt: "2023-04-01T00:00:00.000Z",
    githubRepoCreatedAt: "2025-02-01T00:00:00.000Z",
    mentionedByEarlyStageInvestors: true,
    current24h: { launch: 40, social: 40, developer: 40, traction: 40 },
    baseline30d: { launch: 10, social: 10, developer: 10, traction: 10 },
    velocity24h: [10, 20, 40],
    velocity7d: [10, 12],
    velocity30d: [8, 9, 10],
    velocity90d: [6, 7, 8],
    catalyst: "Test catalyst",
    teardown: { marketDrivers: [], techStack: [], competitors: [] },
    ...overrides,
  };
}

describe("trending startups engine", () => {
  it("applies z-scores, sentiment, and time-decay gravity", () => {
    expect(zScore(80, 50, 10)).toBe(3);
    const praise = gravityScore({
      zScores: { launch: 1, social: 1, developer: 1, traction: 1 },
      sentiment: "praise",
      hoursElapsed: 2,
    });
    const negative = gravityScore({
      zScores: { launch: 1, social: 1, developer: 1, traction: 1 },
      sentiment: "negative",
      hoursElapsed: 2,
    });
    expect(praise.multiplier).toBe(1.2);
    expect(negative.multiplier).toBe(0.5);
    expect(praise.score).toBeCloseTo((1 * 1.2) / 4 ** 1.5, 8);
    expect(praise.score).toBeGreaterThan(negative.score);
    expect(relativeGrowthDelta(40, 10)).toBeCloseTo(30 / 110, 8);
    expect(relativeGrowthDelta(90, 80)).toBeLessThan(relativeGrowthDelta(40, 5));
  });

  it("resolves duplicate brands and domains", () => {
    expect(normalizeDomain("https://www.lumenagents.ai/blog")).toBe("lumenagents.ai");
    expect(brandSimilarity("Lumen Agents Inc", "Lumen Agents")).toBeGreaterThan(0.9);
    expect(
      isSameStartupEntity(
        { name: "Lumen Agents Inc", domain: "www.lumenagents.ai", brandAliases: ["Lumen Agents"] },
        { name: "Lumen", domain: "lumenagents.ai" },
      ),
    ).toBe(true);
  });

  it("excludes too-new accounts and damps duplicate-IP launch spikes", () => {
    const [flash, dupe] = TRENDING_TEST_FIXTURES;
    expect(flash && isTooNewAccount(flash.accountCreatedAt, TRENDING_CATALOG_NOW)).toBe(true);
    expect(flash && hasDuplicateIpSpike(flash.upvoteIps)).toBe(true);
    expect(flash && sanitizeRawSignals(flash).launch).toBeLessThan(flash.raw.launch);
    expect(dupe?.name).toMatch(/Lumen Agents/i);
  });

  it("applies the early-stage pre-filter before scoring", () => {
    expect(isEstablishedTechCompany({ name: "Vercel", domain: "vercel.com", brandAliases: [] })).toBe(true);
    expect(passesEarlyStageGate(sampleRow({ employeeCount: 51 }), TRENDING_CATALOG_NOW)).toBe(false);
    expect(passesEarlyStageGate(sampleRow({ totalFundingUsd: 15_000_001 }), TRENDING_CATALOG_NOW)).toBe(false);
    expect(passesEarlyStageGate(sampleRow({ domainRegisteredAt: "2019-01-01T00:00:00.000Z" }), TRENDING_CATALOG_NOW)).toBe(false);
    expect(shouldExcludeStartup(sampleRow({ name: "Linear", domain: "linear.app" }), TRENDING_CATALOG_NOW)).toBe(true);
    expect(passesEarlyStageGate(sampleRow(), TRENDING_CATALOG_NOW)).toBe(true);

    const masked = applyEarlyStageSignalMask(
      { launch: 1, social: 1, developer: 1, traction: 1 },
      sampleRow({ mentionedByEarlyStageInvestors: false, githubRepoCreatedAt: "2022-01-01T00:00:00.000Z" }),
      TRENDING_CATALOG_NOW,
    );
    expect(masked.social).toBe(0);
    expect(masked.developer).toBe(0);
    expect(masked.launch).toBe(1);
  });

  it("ranks a public top 20 and locks the rest after entity cleanup", () => {
    const catalog = buildTrendingCatalog(TRENDING_SEED_STARTUPS, TRENDING_CATALOG_NOW);
    expect(catalog.algorithm.scoring).toBe("relative_growth_delta");
    expect(catalog.startups.some((row) => row.id === "flash-upvote")).toBe(false);
    expect(catalog.startups.some((row) => ["vercel", "figma", "anthropic", "supabase", "linear"].includes(row.id))).toBe(false);
    expect(catalog.startups.filter((row) => row.id === "lumen-agents").length).toBe(1);
    expect(catalog.startups.some((row) => row.id === "lumen-agents-dupe")).toBe(false);
    expect(catalog.startups.length).toBeGreaterThan(PUBLIC_UNLOCKED_COUNT);
    expect(catalog.startups.slice(0, PUBLIC_UNLOCKED_COUNT).every((row) => !row.locked)).toBe(true);
    expect(catalog.startups.filter((row) => row.locked).length).toBeGreaterThan(0);
    expect(catalog.startups[0]!.compositeScore).toBeGreaterThanOrEqual(catalog.startups.at(-1)!.compositeScore);
    expect(catalog.startups.every((row) => row.fundingStage && row.hqLocation)).toBe(true);

    const loudIncumbent = sampleRow({
      id: "loud-volume",
      name: "Loud Volume",
      domain: "loudvolume.dev",
      current24h: { launch: 90, social: 90, developer: 90, traction: 90 },
      baseline30d: { launch: 80, social: 80, developer: 80, traction: 80 },
    });
    const quietSpike = sampleRow({
      id: "quiet-spike",
      name: "Quiet Spike",
      domain: "quietspike.dev",
      current24h: { launch: 40, social: 40, developer: 40, traction: 40 },
      baseline30d: { launch: 5, social: 5, developer: 5, traction: 5 },
    });
    const ranked = buildTrendingCatalog([loudIncumbent, quietSpike], TRENDING_CATALOG_NOW);
    expect(ranked.startups[0]?.id).toBe("quiet-spike");
  });
});

describe("startup logos", () => {
  it("uses a stored first-party mark when present", () => {
    expect(
      startupLogoSrc({
        logoUrl: "https://cdn.forgekit.dev/mark.png",
        websiteUrl: "https://forgekit.dev",
        domain: "forgekit.dev",
      }),
    ).toBe("https://cdn.forgekit.dev/mark.png");
  });

  it("falls through Google, gstatic, DuckDuckGo, then a monogram", () => {
    const urls = buildStartupLogoCandidates({
      name: "Lumen Agents",
      websiteUrl: "https://lumenagents.ai",
      domain: "lumenagents.ai",
    });
    expect(urls[0]).toBe("https://www.google.com/s2/favicons?domain=lumenagents.ai&sz=128");
    expect(urls[1]).toContain("gstatic.com/faviconV2");
    expect(urls[2]).toBe("https://icons.duckduckgo.com/ip3/lumenagents.ai.ico");
    expect(urls.at(-1)).toMatch(/^data:image\/svg\+xml/);
    expect(decodeURIComponent(urls.at(-1) ?? "")).toContain(">L<");
  });
});

describe("daily trending ingest and cache", () => {
  it("rejects cron calls without Bearer CRON_SECRET", () => {
    expect(authorizeCronRequest("Bearer secret", "secret")).toBe(true);
    expect(authorizeCronRequest("Bearer wrong", "secret")).toBe(false);
    expect(authorizeCronRequest(undefined, "secret")).toBe(false);
    expect(authorizeCronRequest("Bearer secret", undefined)).toBe(false);
  });

  it("gates incumbents, scores relative growth, and upserts a ranked cache snapshot", async () => {
    const { raw, gated, catalog, records } = await computeTrendingLeaderboard(TRENDING_CATALOG_NOW);
    expect(raw.length).toBeGreaterThan(gated.length);
    expect(gated.every((row) => row.employeeCount <= 50)).toBe(true);
    expect(gated.every((row) => row.totalFundingUsd <= 15_000_000)).toBe(true);
    expect(catalog.startups[0]?.rank).toBe(1);
    expect(records[0]).toMatchObject({
      id: catalog.startups[0]?.id,
      rank: 1,
      startup_name: catalog.startups[0]?.name,
      why_trending: catalog.startups[0]?.catalyst,
    });
    expect(records[0]?.velocity_sparkline.length).toBeLessThanOrEqual(7);

    const restored = cacheRecordsToCatalog(records);
    expect(restored.startups.map((row) => row.id)).toEqual(catalog.startups.map((row) => row.id));
    expect(restored.startups[0]?.teardown).toEqual(catalog.startups[0]?.teardown);
    expect(catalogToCacheRecords(emptyTrendingCatalog(TRENDING_CATALOG_NOW.toISOString()))).toEqual([]);
    expect(findTrendingStartup(catalog.startups[0]!.id, restored)?.name).toBe(catalog.startups[0]?.name);
    expect(TRENDING_PAGE_LIMIT).toBe(20);
    expect(TRENDING_REVALIDATE_SECONDS).toBe(86_400);
  });

  it("does not score when reconstructing a page payload from cache rows", () => {
    const records = catalogToCacheRecords(buildTrendingCatalog(TRENDING_SEED_STARTUPS, TRENDING_CATALOG_NOW));
    const page = cacheRecordsToCatalog(records.slice(0, TRENDING_PAGE_LIMIT));
    expect(page.startups).toHaveLength(TRENDING_PAGE_LIMIT);
    expect(page.startups.every((row) => row.rank >= 1 && row.compositeScore > 0)).toBe(true);
  });
});
