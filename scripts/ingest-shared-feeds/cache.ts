import { createHash } from "node:crypto";
import type { FundingIngestSourceKey, Prisma } from "@prisma/client";
import { getPipelinePrisma } from "../lib/pipelineDb.js";
import { canonicalizeArticleUrl } from "../funding-ingest/url.js";
import { fetchAlleywatchFunding, fetchTechcrunchVenture } from "../funding-ingest/sources.js";
import type { ListingItem } from "../funding-ingest/types.js";

export const SHARED_FEED_SOURCE_KEYS = ["TECHCRUNCH_VENTURE", "ALLEYWATCH_FUNDING"] as const;
export type SharedFeedSourceKey = (typeof SHARED_FEED_SOURCE_KEYS)[number];

export const DEFAULT_SHARED_FEED_MAX_AGE_MS = 20 * 60 * 60 * 1000;

export type RawListingRow = {
  source_key: FundingIngestSourceKey;
  canonical_url: string;
  article_url: string;
  listing_url: string | null;
  title: string;
  published_at: Date | null;
  summary: string | null;
};

export function shouldSkipSharedFeedFetch(
  lastFetchedAt: Date | null,
  now: Date,
  maxAgeMs: number,
  force: boolean,
): boolean {
  if (force) return false;
  if (!lastFetchedAt) return false;
  return now.getTime() - lastFetchedAt.getTime() < maxAgeMs;
}

export function rawListingContentHash(
  item: Pick<ListingItem, "articleUrl" | "title" | "publishedAt" | "summary">,
): string {
  return createHash("sha256")
    .update(
      [item.articleUrl, item.title, item.publishedAt?.toISOString() ?? "", item.summary ?? ""].join("\n"),
      "utf8",
    )
    .digest("hex");
}

export function listingItemFromRawRow(row: RawListingRow): ListingItem {
  return {
    sourceKey: row.source_key,
    listingPageUrl: row.listing_url,
    articleUrl: row.article_url || row.canonical_url,
    title: row.title,
    publishedAt: row.published_at,
    summary: row.summary,
  };
}

function envInt(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

function envMsFromHours(name: string, defMs: number): number {
  const hours = envInt(name, Number.NaN);
  if (!Number.isFinite(hours) || hours <= 0) return defMs;
  return hours * 60 * 60 * 1000;
}

export async function latestSharedFeedFetchedAt(
  sourceKey: SharedFeedSourceKey,
): Promise<Date | null> {
  const prisma = getPipelinePrisma();
  const row = await prisma.rawSourceArticle.findFirst({
    where: { source_key: sourceKey },
    orderBy: { fetched_at: "desc" },
    select: { fetched_at: true },
  });
  return row?.fetched_at ?? null;
}

export async function upsertRawListings(
  items: ListingItem[],
  log: (s: string) => void = () => undefined,
): Promise<{ inserted: number; updated: number }> {
  const prisma = getPipelinePrisma();
  const dry = process.env.INGEST_DRY_RUN === "1";
  let inserted = 0;
  let updated = 0;
  const now = new Date();

  for (const item of items) {
    const canonical = canonicalizeArticleUrl(item.articleUrl);
    if (!canonical) continue;
    const contentHash = rawListingContentHash({ ...item, articleUrl: canonical });
    const payload: Prisma.InputJsonValue = {
      source_key: item.sourceKey,
      canonical_url: canonical,
      article_url: item.articleUrl,
      listing_url: item.listingPageUrl ?? null,
      title: item.title,
      published_at: item.publishedAt?.toISOString() ?? null,
      summary: item.summary ?? null,
    };

    if (dry) {
      updated += 1;
      continue;
    }

    const existing = await prisma.rawSourceArticle.findUnique({
      where: {
        source_key_canonical_url: { source_key: item.sourceKey, canonical_url: canonical },
      },
      select: { id: true },
    });

    await prisma.rawSourceArticle.upsert({
      where: {
        source_key_canonical_url: { source_key: item.sourceKey, canonical_url: canonical },
      },
      create: {
        source_key: item.sourceKey,
        canonical_url: canonical,
        article_url: item.articleUrl,
        listing_url: item.listingPageUrl ?? null,
        title: item.title,
        published_at: item.publishedAt,
        summary: item.summary ?? null,
        raw_payload: payload,
        content_hash: contentHash,
        fetched_at: now,
      },
      update: {
        article_url: item.articleUrl,
        listing_url: item.listingPageUrl ?? null,
        title: item.title,
        published_at: item.publishedAt,
        summary: item.summary ?? null,
        raw_payload: payload,
        content_hash: contentHash,
        fetched_at: now,
      },
    });
    if (existing) updated += 1;
    else inserted += 1;
  }

  if (items.length) {
    log(`upserted raw listings inserted=${inserted} updated=${updated} dry=${dry}`);
  }
  return { inserted, updated };
}

export async function listCachedListings(
  sourceKey: FundingIngestSourceKey,
  since: Date | null,
  maxItems: number,
): Promise<ListingItem[]> {
  const prisma = getPipelinePrisma();
  const rows = await prisma.rawSourceArticle.findMany({
    where: {
      source_key: sourceKey,
      ...(since ? { published_at: { gt: since } } : {}),
    },
    orderBy: [{ published_at: "desc" }, { fetched_at: "desc" }],
    take: Math.max(1, maxItems),
  });
  return rows.map(listingItemFromRawRow);
}

export async function cachedListingCount(sourceKey: FundingIngestSourceKey): Promise<number> {
  const prisma = getPipelinePrisma();
  return prisma.rawSourceArticle.count({ where: { source_key: sourceKey } });
}

type NetworkFetch = (
  since: Date | null,
  maxItems: number,
  log: (s: string) => void,
) => Promise<ListingItem[]>;

/**
 * Prefer `raw_source_articles` when the source has been cached at least once.
 * Live-fetch + write-through only when the cache is empty or unreadable.
 */
export async function listCachedListingsOrFetch(
  sourceKey: SharedFeedSourceKey,
  since: Date | null,
  maxItems: number,
  log: (s: string) => void,
  networkFetch: NetworkFetch,
): Promise<ListingItem[]> {
  try {
    const stored = await cachedListingCount(sourceKey);
    if (stored > 0) {
      const items = await listCachedListings(sourceKey, since, maxItems);
      log(`[${sourceKey}] raw cache hit (${items.length} new of ${stored} stored)`);
      return items;
    }
    log(`[${sourceKey}] raw cache empty — fetching live feed`);
  } catch (error) {
    log(
      `[${sourceKey}] raw cache read failed (${error instanceof Error ? error.message : String(error)}) — fetching live feed`,
    );
  }

  const items = await networkFetch(since, maxItems, log);
  try {
    await upsertRawListings(items, log);
  } catch (error) {
    log(
      `[${sourceKey}] cache write-through failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return items;
}

const NETWORK_FETCHERS: Record<SharedFeedSourceKey, NetworkFetch> = {
  TECHCRUNCH_VENTURE: fetchTechcrunchVenture,
  ALLEYWATCH_FUNDING: fetchAlleywatchFunding,
};

export async function syncSharedFeeds(log: (s: string) => void): Promise<{
  skipped: SharedFeedSourceKey[];
  fetched: SharedFeedSourceKey[];
  inserted: number;
  updated: number;
}> {
  const maxAgeMs = envMsFromHours("INGEST_SHARED_FEEDS_MAX_AGE_HOURS", DEFAULT_SHARED_FEED_MAX_AGE_MS);
  const force = process.env.INGEST_SHARED_FEEDS_FORCE === "1";
  const maxItems = envInt("INGEST_SHARED_FEEDS_MAX_ITEMS", 80);
  const now = new Date();
  const skipped: SharedFeedSourceKey[] = [];
  const fetched: SharedFeedSourceKey[] = [];
  let inserted = 0;
  let updated = 0;

  for (const sourceKey of SHARED_FEED_SOURCE_KEYS) {
    const lastFetchedAt = await latestSharedFeedFetchedAt(sourceKey);
    if (shouldSkipSharedFeedFetch(lastFetchedAt, now, maxAgeMs, force)) {
      const ageHours = lastFetchedAt
        ? ((now.getTime() - lastFetchedAt.getTime()) / 3_600_000).toFixed(1)
        : "?";
      log(`[${sourceKey}] skip HTTP — cache age ${ageHours}h < ${(maxAgeMs / 3_600_000).toFixed(0)}h`);
      skipped.push(sourceKey);
      continue;
    }

    log(`[${sourceKey}] fetching live RSS (max=${maxItems})`);
    const items = await NETWORK_FETCHERS[sourceKey](null, maxItems, log);
    const result = await upsertRawListings(items, log);
    inserted += result.inserted;
    updated += result.updated;
    fetched.push(sourceKey);
    log(`[${sourceKey}] cached ${items.length} listing(s)`);
  }

  return { skipped, fetched, inserted, updated };
}
