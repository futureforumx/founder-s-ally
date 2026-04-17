import { useQuery } from "@tanstack/react-query";
import { isSupabaseConfigured, supabasePublicDirectory } from "@/integrations/supabase/client";
import { RECENT_FUNDING_ROUNDS, type RecentFundingRound } from "@/lib/recentFundingSeed";

type RpcRow = {
  id: string;
  company_name: string;
  website_url: string;
  sector: string;
  round_kind: string;
  amount_label: string;
  announced_at: string;
  lead_investor: string;
  lead_website_url: string | null;
  co_investors: string[] | null;
  source_url: string;
};

function mapRow(r: RpcRow): RecentFundingRound {
  return {
    id: r.id,
    companyName: r.company_name,
    websiteUrl: r.website_url || "",
    sector: r.sector,
    roundKind: r.round_kind,
    amountLabel: r.amount_label,
    announcedAt: r.announced_at,
    leadInvestor: r.lead_investor,
    leadWebsiteUrl: r.lead_website_url?.trim() || null,
    coInvestors: Array.isArray(r.co_investors) ? r.co_investors.filter(Boolean) : [],
    sourceUrl: r.source_url,
  };
}

async function fetchRecentFundingFeed(limit: number): Promise<RecentFundingRound[]> {
  const { data, error } = await supabasePublicDirectory.rpc("get_recent_funding_feed", { p_limit: limit });
  if (error) throw error;
  if (!data || !Array.isArray(data)) return [];
  return (data as RpcRow[]).map(mapRow);
}

export function useRecentFundingFeed(options?: { limit?: number; refetchMs?: number }) {
  const limit = options?.limit ?? 80;
  const refetchMs = options?.refetchMs ?? 120_000;

  const query = useQuery({
    queryKey: ["recent-funding-feed", limit],
    enabled: isSupabaseConfigured,
    queryFn: () => fetchRecentFundingFeed(limit),
    staleTime: 60_000,
    refetchInterval: refetchMs,
    retry: 1,
  });

  const liveRows = query.data ?? [];
  const initialPending = isSupabaseConfigured && query.isPending;
  const useLive = isSupabaseConfigured && liveRows.length > 0;

  let rows: RecentFundingRound[];
  let dataSource: "ingest" | "seed";
  if (initialPending) {
    rows = [];
    dataSource = "ingest";
  } else if (useLive) {
    rows = liveRows;
    dataSource = "ingest";
  } else {
    rows = RECENT_FUNDING_ROUNDS;
    dataSource = "seed";
  }

  const ingestEmpty =
    isSupabaseConfigured && !initialPending && !query.isError && liveRows.length === 0;

  return {
    rows,
    dataSource,
    isLoading: initialPending,
    isFetching: query.isFetching,
    error: query.error,
    ingestEmpty,
  };
}
