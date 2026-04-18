import { useQuery } from "@tanstack/react-query";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import {
  aggregateSectorHeatmap,
  fetchFreshCapitalLive,
  FreshCapitalMisconfiguredError,
  isFreshCapitalDemoDataEnabled,
  type FreshCapitalFundRow,
  type FreshCapitalStageFilter,
  type HeatmapBucket,
  type HeatmapSource,
  topSectorsForFilter,
} from "@/lib/freshCapitalPublic";

export type FreshCapitalPageQueryResult = {
  funds: FreshCapitalFundRow[];
  heatmapBuckets: HeatmapBucket[];
  heatmapSource: HeatmapSource;
  sectorChoices: string[];
  /** True only when demo RPC path is used (non-prod + VITE_FRESH_CAPITAL_DEMO=true + no Supabase URL/key). */
  usingDemoData: boolean;
};

export function useFreshCapitalPageData(stage: FreshCapitalStageFilter, sector: string | null) {
  return useQuery({
    queryKey: ["fresh-capital-page", stage, sector],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: (failureCount, err) => {
      if (err instanceof FreshCapitalMisconfiguredError) return false;
      return failureCount < 2;
    },
    queryFn: async (): Promise<FreshCapitalPageQueryResult> => {
      const usingDemoData = !isSupabaseConfigured && isFreshCapitalDemoDataEnabled();

      if (!sector) {
        const p = await fetchFreshCapitalLive({ stage, sector: null, fundLimit: 100, fundDays: 150 });
        const heatmapSource: HeatmapSource = p.heatmapFromRpc?.length ? "rpc" : "fallback_sector_tag_counts";
        return {
          funds: p.funds,
          heatmapBuckets: p.heatmapFromRpc ?? aggregateSectorHeatmap(p.funds, 8),
          heatmapSource,
          sectorChoices: topSectorsForFilter(p.funds, 12),
          usingDemoData,
        };
      }

      const [wide, narrow] = await Promise.all([
        fetchFreshCapitalLive({ stage, sector: null, fundLimit: 100, fundDays: 150 }),
        fetchFreshCapitalLive({ stage, sector, fundLimit: 80, fundDays: 150 }),
      ]);
      const canonical = narrow.heatmapFromRpc ?? wide.heatmapFromRpc;
      const heatmapSource: HeatmapSource = canonical?.length ? "rpc" : "fallback_sector_tag_counts";
      return {
        funds: narrow.funds,
        heatmapBuckets: canonical ?? aggregateSectorHeatmap(wide.funds, 8),
        heatmapSource,
        sectorChoices: topSectorsForFilter(wide.funds, 12),
        usingDemoData,
      };
    },
  });
}
