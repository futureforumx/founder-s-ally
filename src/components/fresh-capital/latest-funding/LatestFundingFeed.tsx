import { useEffect, useMemo, useState } from "react";
import { useRecentFundingFeed } from "@/hooks/useRecentFundingFeed";
import { useVCDirectory } from "@/hooks/useVCDirectory";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import { buildVcFirmMatchIndex, resolveMatchedVcFirm } from "@/lib/fundingFeedEntityMatch";
import {
  applyLatestFundingTableFilters,
  buildDedupedRoundChoices,
  buildDedupedSectorChoices,
  filterLatestFundingRows,
  latestFundingFiltersAreDefault,
  parseCustomAmountInput,
  type LatestFundingAmountPreset,
  type LatestFundingDateSort,
} from "@/lib/latestFundingFilters";
import type { FreshCapitalStageFilter } from "@/lib/freshCapitalPublic";
import { cn } from "@/lib/utils";

import { FundingFeedEmptyState } from "./FundingFeedEmptyState";
import { LatestFundingFilterBar } from "./LatestFundingFilterBar";
import { FundingFeedRow, LATEST_FUNDING_TABLE, LatestFundingTableHeader } from "./FundingFeedRow";
import { FundingFeedSkeleton } from "./FundingFeedSkeleton";

const PANEL = cn(
  "overflow-hidden rounded-2xl border border-zinc-800 bg-[#000000] shadow-lg shadow-black/50 backdrop-blur-sm",
);

type Props = {
  stage: FreshCapitalStageFilter;
  sector: string | null;
  /** Called once (and on change) with the sorted unique non-empty sectors from the live feed. */
  onAvailableSectors?: (sectors: string[]) => void;
};

export function LatestFundingFeed({ stage, sector, onAvailableSectors }: Props) {
  const { rows: sourceRows, isLoading, error, ingestEmpty, dataSource } = useRecentFundingFeed({ limit: 200 });
  const { firms } = useVCDirectory();
  const leadFirmIndex = useMemo(() => buildVcFirmMatchIndex(firms), [firms]);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);
  const [selectedRounds, setSelectedRounds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [amountPreset, setAmountPreset] = useState<LatestFundingAmountPreset>("all");
  const [customMinInput, setCustomMinInput] = useState("");
  const [customMaxInput, setCustomMaxInput] = useState("");
  const [dateSort, setDateSort] = useState<LatestFundingDateSort>("newest");

  const parentFiltered = useMemo(
    () => filterLatestFundingRows(sourceRows, stage, sector),
    [sourceRows, stage, sector],
  );
  const customMinUsd = useMemo(() => parseCustomAmountInput(customMinInput), [customMinInput]);
  const customMaxUsd = useMemo(() => parseCustomAmountInput(customMaxInput), [customMaxInput]);
  const filtersAreDefault = latestFundingFiltersAreDefault({
    query: searchQuery,
    sectors: selectedSectors,
    rounds: selectedRounds,
    amountPreset,
    dateSort,
  });

  const roundChoices = useMemo(() => buildDedupedRoundChoices(sourceRows), [sourceRows]);

  const filtered = useMemo(
    () =>
      applyLatestFundingTableFilters(parentFiltered, {
        query: searchQuery,
        sectors: selectedSectors,
        rounds: selectedRounds,
        amountPreset,
        customMinUsd,
        customMaxUsd,
        dateSort,
      }),
    [parentFiltered, searchQuery, selectedSectors, selectedRounds, amountPreset, customMinUsd, customMaxUsd, dateSort],
  );

  const resetFilters = () => {
    setSearchQuery("");
    setSelectedSectors([]);
    setSelectedRounds([]);
    setAmountPreset("all");
    setCustomMinInput("");
    setCustomMaxInput("");
    setDateSort("newest");
  };

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
    <div className={PANEL}>
      {rpcDegraded ? (
        <div className="border-b border-zinc-800 bg-[#0f0f0f] px-4 py-2.5 text-center text-[11px] leading-relaxed text-[#b3b3b3]">
          Couldn&apos;t load live funding announcements (network or database error). Nothing below is substituted
          from demo data when your Supabase keys are configured.
        </div>
      ) : null}

      <LatestFundingFilterBar
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        sectorChoices={availableSectors}
        selectedSectors={selectedSectors}
        onSectorsChange={setSelectedSectors}
        roundChoices={roundChoices}
        selectedRounds={selectedRounds}
        onRoundsChange={setSelectedRounds}
        amountPreset={amountPreset}
        onAmountPresetChange={setAmountPreset}
        customMinInput={customMinInput}
        customMaxInput={customMaxInput}
        onCustomMinInputChange={setCustomMinInput}
        onCustomMaxInputChange={setCustomMaxInput}
        customMinUsd={customMinUsd}
        customMaxUsd={customMaxUsd}
        dateSort={dateSort}
        onDateSortChange={setDateSort}
        filtersAreDefault={filtersAreDefault}
        onReset={resetFilters}
      />

      {showSkeleton ? (
        <div className="min-w-0 overflow-x-hidden">
          <FundingFeedSkeleton />
        </div>
      ) : filtered.length === 0 ? (
        <FundingFeedEmptyState variant={emptyVariant} />
      ) : (
        <div className="min-w-0 overflow-x-hidden">
          <table className={LATEST_FUNDING_TABLE}>
            <LatestFundingTableHeader />
            <tbody>
              {filtered.map((row) => (
                <FundingFeedRow
                  key={row.id}
                  row={row}
                  leadFirm={resolveMatchedVcFirm(row.leadInvestor, leadFirmIndex)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
