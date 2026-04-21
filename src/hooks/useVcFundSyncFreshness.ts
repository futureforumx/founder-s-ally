import { useQuery } from "@tanstack/react-query";
import { isSupabaseConfigured, supabasePublicDirectory } from "@/integrations/supabase/client";

type SyncFreshnessResult = {
  completedAt: string | null;
};

/**
 * Fetches the `completed_at` timestamp of the latest successful daily VC fund sync
 * from `public.v_latest_vc_fund_sync`. Used to display a subtle "last updated" line
 * on the Fresh Capital page.
 *
 * Returns `completedAt: null` when Supabase is not configured, the view returns no
 * rows, or the query errors — all handled gracefully by the UI.
 */
export function useVcFundSyncFreshness() {
  return useQuery<SyncFreshnessResult>({
    queryKey: ["vc-fund-sync-freshness"],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: isSupabaseConfigured,
    retry: false,
    queryFn: async (): Promise<SyncFreshnessResult> => {
      const { data } = await (supabasePublicDirectory as any)
        .from("v_latest_vc_fund_sync")
        .select("completed_at")
        .maybeSingle();
      return { completedAt: (data as { completed_at: string } | null)?.completed_at ?? null };
    },
  });
}
