import https from "node:https";
import type { SupabaseClient } from "@supabase/supabase-js";
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
    profilesVerified: false,
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
          profilesVerified: Boolean(record.payload.profilesVerified),
          twitter: record.payload.profilesVerified ? record.payload.twitter : null,
          linkedin: record.payload.profilesVerified ? record.payload.linkedin : null,
          github: record.payload.profilesVerified ? record.payload.github : null,
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

function supabaseRestConfig(): { origin: string; key: string } {
  const origin = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!origin || !key) throw new Error("Supabase is not configured");
  return { origin, key };
}

function restRequest(method: string, pathAndQuery: string, body?: unknown): Promise<{ status: number; text: string }> {
  const { origin, key } = supabaseRestConfig();
  const target = new URL(pathAndQuery, `${origin}/`);
  const payload = body === undefined ? undefined : Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal,resolution=merge-duplicates",
          ...(payload ? { "Content-Length": String(payload.length) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

export async function upsertTrendingCache(
  _client: SupabaseClient,
  records: TrendingCacheRecord[],
): Promise<number> {
  const upsert = await restRequest("POST", `/rest/v1/${TRENDING_CACHE_TABLE}?on_conflict=id`, records);
  if (upsert.status >= 400) throw new Error(`upsert ${upsert.status}: ${upsert.text}`);

  const listed = await restRequest("GET", `/rest/v1/${TRENDING_CACHE_TABLE}?select=id`);
  if (listed.status >= 400) throw new Error(`select ${listed.status}: ${listed.text}`);
  const existing = JSON.parse(listed.text || "[]") as Array<{ id: string }>;
  const keep = new Set(records.map((row) => row.id));
  const stale = existing.map((row) => row.id).filter((id) => !keep.has(id));
  if (stale.length > 0) {
    const filter = stale.map((id) => `"${id}"`).join(",");
    const removed = await restRequest("DELETE", `/rest/v1/${TRENDING_CACHE_TABLE}?id=in.(${filter})`);
    if (removed.status >= 400) throw new Error(`delete ${removed.status}: ${removed.text}`);
  }

  return records.length;
}
