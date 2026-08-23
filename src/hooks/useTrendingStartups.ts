import { useQuery } from "@tanstack/react-query";
import { isSupabaseConfigured, supabasePublicDirectory } from "@/integrations/supabase/client";
import { cacheRecordsToCatalog, type TrendingCacheRecord } from "@/lib/trendingStartups/cache";
import { emptyTrendingCatalog, findTrendingStartup } from "@/lib/trendingStartups/catalog";
import { TRENDING_PAGE_LIMIT, TRENDING_REVALIDATE_SECONDS } from "@/lib/trendingStartups/types";
import type { TrendingCatalogResponse, TrendingStartupRow } from "@/lib/trendingStartups/types";

const CACHE_COLUMNS =
  "id, rank, startup_name, domain, category, score, velocity_sparkline, why_trending, updated_at, payload";

function toCacheRecords(rows: unknown[] | null): TrendingCacheRecord[] {
  return (rows ?? []) as TrendingCacheRecord[];
}

async function fetchTrendingCatalog(): Promise<TrendingCatalogResponse> {
  if (!isSupabaseConfigured) {
    return emptyTrendingCatalog(new Date().toISOString());
  }

  const { data, error } = await supabasePublicDirectory
    .from("trending_cache")
    .select(CACHE_COLUMNS)
    .order("rank", { ascending: true })
    .limit(TRENDING_PAGE_LIMIT);

  if (error || !data?.length) {
    return emptyTrendingCatalog(new Date().toISOString());
  }

  return cacheRecordsToCatalog(toCacheRecords(data));
}

async function fetchTrendingStartup(id: string): Promise<TrendingStartupRow | null> {
  if (!isSupabaseConfigured) return null;

  const { data, error } = await supabasePublicDirectory
    .from("trending_cache")
    .select(CACHE_COLUMNS)
    .or(`id.eq.${id},domain.eq.${id}`)
    .maybeSingle();

  if (error || !data) return null;
  const catalog = cacheRecordsToCatalog(toCacheRecords([data]));
  return catalog.startups[0] ?? findTrendingStartup(id, catalog);
}

export function useTrendingStartups() {
  return useQuery({
    queryKey: ["trending-startups"],
    queryFn: fetchTrendingCatalog,
    staleTime: TRENDING_REVALIDATE_SECONDS * 1000,
  });
}

export function useTrendingStartup(id: string | undefined) {
  const catalog = useTrendingStartups();
  const listed = id && catalog.data ? findTrendingStartup(id, catalog.data) : null;
  const detail = useQuery({
    queryKey: ["trending-startup", id],
    enabled: Boolean(id) && !listed && !catalog.isLoading,
    queryFn: () => fetchTrendingStartup(id!),
    staleTime: TRENDING_REVALIDATE_SECONDS * 1000,
  });

  return {
    ...catalog,
    isLoading: catalog.isLoading || detail.isLoading,
    startup: listed ?? detail.data ?? null,
  };
}
