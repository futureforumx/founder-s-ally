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

/**
 * `/fresh-capital` reads only the public-safe RPC layer:
 * `get_new_vc_funds(...)` + optional `get_capital_heatmap_backend(...)`.
 * Those map to canonical `vc_funds` + `firm_records`, not candidate staging or legacy `fund_records`.
 */
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
        if (import.meta.env.DEV) {
          // grep: [FreshCapital] heatmap_page_source — final UI heatmap path after merge (rpc vs fallback_sector_tag_counts).
          console.info(`[FreshCapital] heatmap_page_source=${heatmapSource} sector_filter=false`);
        }
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
      if (import.meta.env.DEV) {
        console.info(`[FreshCapital] heatmap_page_source=${heatmapSource} sector_filter=true`);
      }
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
