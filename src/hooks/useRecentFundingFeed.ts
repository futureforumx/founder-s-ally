import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  isSupabaseConfigured,
  supabasePublicDirectory,
  supabaseVcDirectory,
} from "@/integrations/supabase/client";
import { roundKindStageBucket, formatRoundKind } from "@/lib/latestFundingFilters";
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
  /** Forward-compatible optional columns when RPC evolves. */
  source_type?: string | null;
  confidence_score?: number | null;
  rumor_status?: string | null;
  confirmation_status?: string | null;
};

/** Match RPC / ingest cleanup — belt-and-suspenders if DB function is stale. */
function stripPublicationFromInvestorDisplay(s: string): string {
  const t = s
    .replace(/\s*\|\s*(TechCrunch|GeekWire|AlleyWatch)\s*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.length ? t : "Unknown";
}

function mapConfirmationStatus(
  raw: string | null | undefined,
): RecentFundingRound["confirmationStatus"] | undefined {
  if (!raw?.trim()) return undefined;
  const k = raw.trim().toLowerCase();
  if (k === "rumor" || k === "rumoured" || k === "unconfirmed") return "rumor";
  if (k === "confirmed" || k === "verified") return "confirmed";
  if (k === "unverified") return "unverified";
  return undefined;
}

function mapRow(r: RpcRow): RecentFundingRound {
  const rumorFromRpc = r.rumor_status ?? r.confirmation_status;
  return {
    id: r.id,
    companyName: r.company_name,
    websiteUrl: r.website_url || "",
    sector: r.sector,
    roundKind: formatRoundKind(r.round_kind),
    amountLabel: r.amount_label,
    announcedAt: r.announced_at,
    leadInvestor: stripPublicationFromInvestorDisplay(r.lead_investor || "Unknown"),
    leadWebsiteUrl: r.lead_website_url?.trim() || null,
    coInvestors: Array.isArray(r.co_investors)
      ? r.co_investors.filter(Boolean).map(stripPublicationFromInvestorDisplay)
      : [],
    sourceUrl: (r.source_url && String(r.source_url).trim()) || "",
    sourceType: r.source_type?.trim() || undefined,
    confidenceScore:
      typeof r.confidence_score === "number" && Number.isFinite(r.confidence_score)
        ? r.confidence_score
        : undefined,
    confirmationStatus: mapConfirmationStatus(rumorFromRpc),
  };
}

function rpcRowsFromPayload(data: unknown): RpcRow[] {
  if (Array.isArray(data)) return data as RpcRow[];
  if (data && typeof data === "object" && !Array.isArray(data)) return [data as RpcRow];
  return [];
}

function canonicalDealKey(r: RecentFundingRound): string {
  const company = String(r.companyName ?? "").trim().toLowerCase();
  const amount = String(r.amountLabel ?? "").trim().toLowerCase();
  const date = String(r.announcedAt ?? "").trim().slice(0, 10);
  const lead = String(r.leadInvestor ?? "").trim().toLowerCase();
  return `${company}__${amount}__${date}__${lead}`;
}

function announcedAtTs(dateLike: string): number {
  const t = Date.parse(dateLike);
  return Number.isFinite(t) ? t : 0;
}

function mergeRecentFundingRows(primary: RecentFundingRound[], fallback: RecentFundingRound[]): RecentFundingRound[] {
  const merged = new Map<string, RecentFundingRound>();

  for (const row of fallback) {
    if (!isRenderableDeal(row)) continue;
    merged.set(canonicalDealKey(row), row);
  }
  for (const row of primary) {
    if (!isRenderableDeal(row)) continue;
    const key = canonicalDealKey(row);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, row);
      continue;
    }

    // Ingest rows win overall, but keep curated fields when ingest values are empty.
    merged.set(key, {
      ...existing,
      ...row,
      websiteUrl: row.websiteUrl?.trim() ? row.websiteUrl : existing.websiteUrl,
      companyGallerySlug: row.companyGallerySlug?.trim() ? row.companyGallerySlug : existing.companyGallerySlug,
      sourceUrl: row.sourceUrl?.trim() ? row.sourceUrl : existing.sourceUrl,
      leadWebsiteUrl: row.leadWebsiteUrl?.trim() ? row.leadWebsiteUrl : existing.leadWebsiteUrl,
      coInvestors:
        Array.isArray(row.coInvestors) && row.coInvestors.length > 0
          ? row.coInvestors
          : existing.coInvestors,
    });
  }

  return [...merged.values()].sort((a, b) => announcedAtTs(b.announcedAt) - announcedAtTs(a.announcedAt));
}

/** Drop stub rows; deals without article URLs are kept and shown as non-clickable in the UI. */
function isRenderableDeal(r: RecentFundingRound): boolean {
  return Boolean(String(r.id ?? "").trim()) && Boolean(String(r.companyName ?? "").trim());
}

/**
 * Reads `get_recent_funding_feed` (SECURITY DEFINER) via the anon-safe client first.
 * If that fails (some deployments block anon RPC), retry with the VC-directory client
 * that forwards the Clerk JWT → `authenticated` role.
 */
function logRpcIngestStats(data: unknown, label: "public" | "vc_retry"): void {
  if (!import.meta.env.DEV) return;
  const parsed = rpcRowsFromPayload(data).map(mapRow);
  const missingArticle = parsed.filter((r) => !String(r.sourceUrl ?? "").trim()).length;
  console.info("[LatestFunding:rpc-ingest]", {
    client: label,
    rawRpcRows: rpcRowsFromPayload(data).length,
    afterMap: parsed.length,
    rowsMissingArticleUrl: missingArticle,
  });
}

async function fetchRecentFundingFeed(limit: number): Promise<RecentFundingRound[]> {
  const mapValid = (data: unknown) =>
    rpcRowsFromPayload(data).map(mapRow).filter(isRenderableDeal);

  const pub = await supabasePublicDirectory.rpc("get_recent_funding_feed", { p_limit: limit });
  if (!pub.error) {
    logRpcIngestStats(pub.data, "public");
    return mapValid(pub.data);
  }

  const vc = await supabaseVcDirectory.rpc("get_recent_funding_feed", { p_limit: limit });
  if (vc.error) {
    throw pub.error;
  }
  logRpcIngestStats(vc.data, "vc_retry");
  return mapValid(vc.data);
}

export type RecentFundingDataSource = "ingest" | "seed_dev" | "ingest_plus_seed" | "seed_fallback";

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

  /**
   * We always keep curated startups.gallery rows in the set for Latest Funding coverage,
   * then overlay ingest rows on top when available.
   */
  let rows: RecentFundingRound[];
  let dataSource: RecentFundingDataSource;

  if (!isSupabaseConfigured) {
    rows = RECENT_FUNDING_ROUNDS;
    dataSource = "seed_dev";
  } else if (query.isError) {
    rows = RECENT_FUNDING_ROUNDS;
    dataSource = "seed_fallback";
  } else if (query.isLoading) {
    rows = RECENT_FUNDING_ROUNDS;
    dataSource = "ingest";
  } else {
    rows = mergeRecentFundingRows(liveRows, RECENT_FUNDING_ROUNDS);
    dataSource = liveRows.length > 0 ? "ingest_plus_seed" : "seed_fallback";
  }

  const ingestEmpty = isSupabaseConfigured && query.isSuccess && liveRows.length === 0;

  useEffect(() => {
    if (!import.meta.env.DEV || !isSupabaseConfigured || !query.isSuccess || liveRows.length === 0) return;
    const sectorCounts = new Map<string, number>();
    const otherRoundKinds = new Map<string, number>();
    for (const r of liveRows) {
      sectorCounts.set(r.sector, (sectorCounts.get(r.sector) ?? 0) + 1);
      if (roundKindStageBucket(r.roundKind) === "other") {
        otherRoundKinds.set(r.roundKind, (otherRoundKinds.get(r.roundKind) ?? 0) + 1);
      }
    }
    const topSectors = [...sectorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14);
    const topOtherRounds = [...otherRoundKinds.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 18);
    console.info("[LatestFunding:rpc-profile]", {
      sectorLabelCounts: Object.fromEntries(topSectors),
      roundKindMappedToOtherTop: Object.fromEntries(topOtherRounds),
    });
  }, [isSupabaseConfigured, query.isSuccess, liveRows]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const mode: "seed_local" | "rpc_error" | "loading" | "live_empty" | "live" = !isSupabaseConfigured
      ? "seed_local"
      : query.isError
        ? "rpc_error"
        : query.isLoading
          ? "loading"
          : liveRows.length === 0
            ? "live_empty"
            : "live";
    console.info("[LatestFunding:data]", {
      mode,
      dataSource,
      rpcRowCount: liveRows.length,
      queryStatus: query.status,
    });
  }, [isSupabaseConfigured, query.isError, query.isLoading, query.status, dataSource, liveRows.length]);

  return {
    rows,
    dataSource,
    isLoading: isSupabaseConfigured && query.isLoading,
    isFetching: isSupabaseConfigured && query.isFetching,
    error: query.error,
    ingestEmpty,
  };
}
