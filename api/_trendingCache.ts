import type { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { emptyTrendingCatalog, trendingAlgorithmMeta } from "./_trendingCatalog.js";
import { PUBLIC_UNLOCKED_COUNT, TRENDING_PAGE_LIMIT, TRENDING_REVALIDATE_SECONDS } from "./_trendingConstants.js";
import type { TrendingCatalogResponse, TrendingStartupRow } from "./_trendingTypes.js";

export const TRENDING_CACHE_TABLE = "trending_cache";

export type TrendingCacheRecord = {
  id: string;
  rank: number;
  startup_name: string;
  domain: string;
  category: string;
  score: number;
  velocity_sparkline: number[];
  why_trending: string;
  updated_at: string;
  payload: TrendingStartupRow | Record<string, unknown>;
};

export function trendingCacheControlHeader(): string {
  return `public, s-maxage=${TRENDING_REVALIDATE_SECONDS}, stale-while-revalidate=${TRENDING_REVALIDATE_SECONDS}`;
}

/**
 * Vite + Vercel Node analog of Next.js `revalidatePath('/trending-startups')`.
 * The SPA HTML is already static; GET /api/trending is the cached data surface.
 */
export async function revalidateTrendingStartupsPath(): Promise<void> {
  return;
}

function isStartupRow(value: unknown): value is TrendingStartupRow {
  if (!value || typeof value !== "object") return false;
  const row = value as TrendingStartupRow;
  return typeof row.id === "string" && typeof row.name === "string" && Array.isArray(row.velocity7d);
}

function sevenDaySparkline(values: number[]): number[] {
  return values.slice(-7);
}

export function catalogToCacheRecords(
  catalog: TrendingCatalogResponse,
  updatedAt = catalog.generatedAt,
): TrendingCacheRecord[] {
  return catalog.startups.map((row) => ({
    id: row.id,
    rank: row.rank,
    startup_name: row.name,
    domain: row.domain,
    category: row.microCategory,
    score: row.compositeScore,
    velocity_sparkline: sevenDaySparkline(row.velocity7d),
    why_trending: row.catalyst,
    updated_at: updatedAt,
    payload: row,
  }));
}

function slimToStartupRow(record: TrendingCacheRecord): TrendingStartupRow {
  const spark = Array.isArray(record.velocity_sparkline) ? record.velocity_sparkline : [];
  return {
    id: record.id,
    rank: record.rank,
    name: record.startup_name,
    domain: record.domain,
    website: `https://${record.domain}`,
    logoUrl: null,
    microCategory: record.category,
    fundingStage: "",
    hqLocation: "",
    compositeScore: record.score,
    gravityScore: record.score,
    hoursElapsed: 0,
    sentiment: "neutral",
    sentimentMultiplier: 1,
    zScores: { launch: 0, social: 0, developer: 0, traction: 0 },
    weighted: { launch: 0, social: 0, developer: 0, traction: 0 },
    velocity24h: spark,
    velocity7d: spark,
    velocity30d: spark,
    velocity90d: spark,
    catalyst: record.why_trending,
    twitter: null,
    linkedin: null,
    github: null,
    teardown: { marketDrivers: [], techStack: [], competitors: [] },
    locked: record.rank > PUBLIC_UNLOCKED_COUNT,
  };
}

export function cacheRecordsToCatalog(
  records: TrendingCacheRecord[],
  generatedAt?: string,
): TrendingCatalogResponse {
  const startups = [...records]
    .sort((a, b) => a.rank - b.rank)
    .map((record) => {
      if (isStartupRow(record.payload)) {
        return {
          ...record.payload,
          rank: record.rank,
          locked: record.rank > PUBLIC_UNLOCKED_COUNT,
        };
      }
      return slimToStartupRow(record);
    });

  return {
    generatedAt: generatedAt ?? records[0]?.updated_at ?? new Date().toISOString(),
    algorithm: trendingAlgorithmMeta(),
    startups,
  };
}

export async function readTrendingCache(
  client: SupabaseClient,
  options: { id?: string; limit?: number } = {},
): Promise<TrendingCatalogResponse> {
  const limit = options.limit ?? TRENDING_PAGE_LIMIT;
  let query = client
    .from(TRENDING_CACHE_TABLE)
    .select("id, rank, startup_name, domain, category, score, velocity_sparkline, why_trending, updated_at, payload")
    .order("rank", { ascending: true });

  if (options.id?.trim()) {
    const needle = options.id.trim();
    query = query.or(`id.eq.${needle},domain.eq.${needle}`);
  } else {
    query = query.limit(limit);
  }

  const { data, error } = await query;
  if (error || !data?.length) {
    return emptyTrendingCatalog(new Date().toISOString());
  }

  return cacheRecordsToCatalog(data as TrendingCacheRecord[], data[0]?.updated_at);
}

function postgresUrl(): string | null {
  return process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.DATABASE_URL || null;
}

function postgresClientConfig() {
  const raw = postgresUrl()!;
  const url = new URL(raw);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("ssl");
  return {
    connectionString: url.toString(),
    ssl: { rejectUnauthorized: false as const },
  };
}

async function upsertTrendingCacheWithPostgres(records: TrendingCacheRecord[]): Promise<number> {
  const client = new Client(postgresClientConfig());
  await client.connect();
  try {
    await client.query("BEGIN");
    for (const row of records) {
      await client.query(
        `INSERT INTO public.trending_cache
          (id, rank, startup_name, domain, category, score, velocity_sparkline, why_trending, updated_at, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9::timestamptz, $10::jsonb)
         ON CONFLICT (id) DO UPDATE SET
          rank = EXCLUDED.rank,
          startup_name = EXCLUDED.startup_name,
          domain = EXCLUDED.domain,
          category = EXCLUDED.category,
          score = EXCLUDED.score,
          velocity_sparkline = EXCLUDED.velocity_sparkline,
          why_trending = EXCLUDED.why_trending,
          updated_at = EXCLUDED.updated_at,
          payload = EXCLUDED.payload`,
        [
          row.id,
          row.rank,
          row.startup_name,
          row.domain,
          row.category,
          row.score,
          JSON.stringify(row.velocity_sparkline),
          row.why_trending,
          row.updated_at,
          JSON.stringify(row.payload),
        ],
      );
    }
    const ids = records.map((row) => row.id);
    await client.query("DELETE FROM public.trending_cache WHERE NOT (id = ANY($1::text[]))", [ids]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
  return records.length;
}

export async function upsertTrendingCache(
  client: SupabaseClient,
  records: TrendingCacheRecord[],
): Promise<number> {
  if (postgresUrl()) {
    return upsertTrendingCacheWithPostgres(records);
  }

  const { error } = await client.from(TRENDING_CACHE_TABLE).upsert(records, { onConflict: "id" });
  if (error) throw new Error(error.message);

  const { data: existing, error: existingError } = await client.from(TRENDING_CACHE_TABLE).select("id");
  if (existingError) throw new Error(existingError.message);

  const keep = new Set(records.map((row) => row.id));
  const stale = (existing ?? []).map((row) => row.id).filter((id) => !keep.has(id));
  if (stale.length > 0) {
    const { error: deleteError } = await client.from(TRENDING_CACHE_TABLE).delete().in("id", stale);
    if (deleteError) throw new Error(deleteError.message);
  }

  return records.length;
}
