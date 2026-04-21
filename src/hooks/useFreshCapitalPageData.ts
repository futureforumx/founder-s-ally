import { useQuery } from "@tanstack/react-query";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import {
  aggregateSectorHeatmap,
  fetchFreshCapitalLive,
  fetchNewVcFundSectorOptions,
  FreshCapitalMisconfiguredError,
  isFreshCapitalDemoDataEnabled,
  resolveFreshCapitalSectorChoices,
  type FreshCapitalFundRow,
  type FreshCapitalStageFilter,
  type HeatmapBucket,
  type HeatmapSource,
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
        const [p, sectorsFromDb] = await Promise.all([
          fetchFreshCapitalLive({ stage, sector: null, fundLimit: 200, fundDays: 365 }),
          fetchNewVcFundSectorOptions({ stage, fundDays: 365, limit: 120 }),
        ]);
        const heatmapSource: HeatmapSource = p.heatmapFromRpc?.length ? "rpc" : "fallback_sector_tag_counts";
        if (import.meta.env.DEV) {
          // grep: [FreshCapital] heatmap_page_source — final UI heatmap path after merge (rpc vs fallback_sector_tag_counts).
          console.info(`[FreshCapital] heatmap_page_source=${heatmapSource} sector_filter=false`);
        }
        return {
          funds: p.funds,
          heatmapBuckets: p.heatmapFromRpc ?? aggregateSectorHeatmap(p.funds, 8),
          heatmapSource,
          sectorChoices: resolveFreshCapitalSectorChoices({
            fromRpc: sectorsFromDb,
            fundRowsForFallback: p.funds,
            selectedSector: null,
          }),
          usingDemoData,
        };
      }

      const [wide, narrow, sectorsFromDb] = await Promise.all([
        fetchFreshCapitalLive({ stage, sector: null, fundLimit: 200, fundDays: 365 }),
        fetchFreshCapitalLive({ stage, sector, fundLimit: 200, fundDays: 365 }),
        fetchNewVcFundSectorOptions({ stage, fundDays: 365, limit: 120 }),
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
        sectorChoices: resolveFreshCapitalSectorChoices({
          fromRpc: sectorsFromDb,
          fundRowsForFallback: wide.funds,
          selectedSector: sector,
        }),
        usingDemoData,
      };
    },
  });
}
