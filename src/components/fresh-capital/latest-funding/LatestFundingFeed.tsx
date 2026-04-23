import { useEffect, useMemo } from "react";
import { useRecentFundingFeed } from "@/hooks/useRecentFundingFeed";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import { buildDedupedSectorChoices, filterLatestFundingRows } from "@/lib/latestFundingFilters";
import type { FreshCapitalStageFilter } from "@/lib/freshCapitalPublic";
import { cn } from "@/lib/utils";

import { FundingFeedEmptyState } from "./FundingFeedEmptyState";
import { FundingFeedRow } from "./FundingFeedRow";
import { FundingFeedSkeleton } from "./FundingFeedSkeleton";
import { LATEST_FUNDING_DESKTOP_GRID_CLASS } from "./latestFundingLayout";

const PANEL = cn(
  "rounded-2xl border border-zinc-800 bg-[#000000] shadow-lg shadow-black/50 backdrop-blur-sm",
);

type Props = {
  stage: FreshCapitalStageFilter;
  sector: string | null;
  /** Called once (and on change) with the sorted unique non-empty sectors from the live feed. */
  onAvailableSectors?: (sectors: string[]) => void;
};

export function LatestFundingFeed({ stage, sector, onAvailableSectors }: Props) {
  const { rows: sourceRows, isLoading, error, ingestEmpty, dataSource } = useRecentFundingFeed({ limit: 120 });

  const filtered = useMemo(
    () => filterLatestFundingRows(sourceRows, stage, sector),
    [sourceRows, stage, sector],
  );

  /** Deduplicated sector labels (clustered) from the live feed for the parent sector Select. */
  const availableSectors = useMemo(() => {
    const raw: string[] = [];
    for (const row of sourceRows) {
      const s = row.sector?.trim();
      if (s && s !== "Unknown") raw.push(s);
    }
    return buildDedupedSectorChoices(raw);
  }, [sourceRows]);

  useEffect(() => {
    onAvailableSectors?.(availableSectors);
  }, [availableSectors, onAvailableSectors]);

  const rpcDegraded = Boolean(isSupabaseConfigured && error);
  const showSkeleton = isLoading && isSupabaseConfigured;

  const emptyVariant = useMemo(() => {
    if (rpcDegraded) return "load_failed" as const;
    if (ingestEmpty && filtered.length === 0) return "feed_empty" as const;
    return "filter_mismatch" as const;
  }, [rpcDegraded, ingestEmpty, filtered.length]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.info("[LatestFunding:view]", {
      dataSource,
      filteredCount: filtered.length,
      sourceCount: sourceRows.length,
      ingestEmpty,
      rpcError: Boolean(error),
    });
  }, [dataSource, filtered.length, sourceRows.length, ingestEmpty, error]);

  return (
    <div className={cn("overflow-hidden", PANEL)}>
      {rpcDegraded ? (
        <div className="border-b border-zinc-800 bg-[#0f0f0f] px-4 py-2.5 text-center text-[11px] leading-relaxed text-[#b3b3b3]">
          Couldn&apos;t load live funding announcements (network or database error). Nothing below is substituted
          from demo data when your Supabase keys are configured.
        </div>
      ) : null}

      {showSkeleton ? (
        <FundingFeedSkeleton />
      ) : filtered.length === 0 ? (
        <FundingFeedEmptyState variant={emptyVariant} />
      ) : (
        <>
          <div
            className={cn(
              "hidden gap-x-3 gap-y-2 border-b border-zinc-800 bg-[#0a0a0a] px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-[#b3b3b3] md:grid",
              LATEST_FUNDING_DESKTOP_GRID_CLASS,
            )}
          >
            <span>Company</span>
            <span>Round</span>
            <span>Amount</span>
            <span>Announced</span>
            <span>Sector</span>
            <span>Lead</span>
            <span>Co-investors</span>
          </div>
          <ul className="divide-y divide-zinc-800">
            {filtered.map((row) => (
              <FundingFeedRow key={row.id} row={row} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
