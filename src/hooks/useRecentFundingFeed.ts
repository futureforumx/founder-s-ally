import { useQuery } from "@tanstack/react-query";
import {
  isSupabaseConfigured,
  supabasePublicDirectory,
  supabaseVcDirectory,
} from "@/integrations/supabase/client";
import { RECENT_FUNDING_ROUNDS, type RecentFundingRound } from "@/lib/recentFundingSeed";

type RpcRow = {
  id: string;
  company_name: string;
  website_url: string | null;
  sector: string;
  round_kind: string;
  amount_label: string;
  announced_at: string;
  lead_investor: string;
  lead_website_url: string | null;
  co_investors: string[] | null;
  source_url: string | null;
};

/** Match RPC / ingest cleanup — belt-and-suspenders if DB function is stale. */
function stripPublicationFromInvestorDisplay(s: string): string {
  const t = s
    .replace(/\s*\|\s*(TechCrunch|GeekWire|AlleyWatch)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length ? t : "Unknown";
}

function mapRow(r: RpcRow): RecentFundingRound {
  return {
    id: r.id,
    companyName: r.company_name,
    websiteUrl: r.website_url || "",
    sector: r.sector,
    roundKind: r.round_kind,
    amountLabel: r.amount_label,
    announcedAt: r.announced_at,
    leadInvestor: stripPublicationFromInvestorDisplay(r.lead_investor || "Unknown"),
    leadWebsiteUrl: r.lead_website_url?.trim() || null,
    coInvestors: Array.isArray(r.co_investors)
      ? r.co_investors.filter(Boolean).map(stripPublicationFromInvestorDisplay)
      : [],
    sourceUrl: (r.source_url && String(r.source_url).trim()) || "",
  };
}

function rpcRowsFromPayload(data: unknown): RpcRow[] {
  if (Array.isArray(data)) return data as RpcRow[];
  if (data && typeof data === "object" && !Array.isArray(data)) return [data as RpcRow];
  return [];
}

/** Drop stub / partial rows so we do not treat an all-null response as “live”. */
function isRenderableDeal(r: RecentFundingRound): boolean {
  return (
    Boolean(String(r.id ?? "").trim()) &&
    Boolean(String(r.companyName ?? "").trim()) &&
    Boolean(String(r.sourceUrl ?? "").trim())
  );
}

/**
 * Reads `get_recent_funding_feed` (SECURITY DEFINER) via the anon-safe client first.
 * If that fails (some deployments block anon RPC), retry with the VC-directory client
 * that forwards the Clerk JWT → `authenticated` role.
 */
async function fetchRecentFundingFeed(limit: number): Promise<RecentFundingRound[]> {
  const mapValid = (data: unknown) =>
    rpcRowsFromPayload(data).map(mapRow).filter(isRenderableDeal);

  const pub = await supabasePublicDirectory.rpc("get_recent_funding_feed", { p_limit: limit });
  if (!pub.error) {
    return mapValid(pub.data);
  }

  const vc = await supabaseVcDirectory.rpc("get_recent_funding_feed", { p_limit: limit });
  if (vc.error) {
    throw pub.error;
  }
  return mapValid(vc.data);
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
