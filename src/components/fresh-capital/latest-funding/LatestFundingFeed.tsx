import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRecentFundingFeed } from "@/hooks/useRecentFundingFeed";
import { useVCDirectory } from "@/hooks/useVCDirectory";
import { isSupabaseConfigured, supabaseVcDirectory } from "@/integrations/supabase/client";
import { buildVcFirmMatchIndex, firmDisplayMatchKeys, resolveMatchedVcFirm } from "@/lib/fundingFeedEntityMatch";
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
import { FundingFeedSurfaceProvider, type FundingFeedSurface } from "./fundingFeedSurface";
import { LatestFundingFilterBar } from "./LatestFundingFilterBar";
import { FundingFeedRow, LATEST_FUNDING_TABLE, LatestFundingTableHeader } from "./FundingFeedRow";
import { FundingFeedSkeleton } from "./FundingFeedSkeleton";

const PUBLIC_PANEL = cn(
  "overflow-hidden rounded-2xl border border-zinc-800 bg-[#000000] shadow-lg shadow-black/50 backdrop-blur-sm",
);
const APP_PANEL = "overflow-hidden rounded-xl border border-border/60 bg-card/50";

type Props = {
  stage: FreshCapitalStageFilter;
  sector: string | null;
  /** Called once (and on change) with the sorted unique non-empty sectors from the live feed. */
  onAvailableSectors?: (sectors: string[]) => void;
  surface?: FundingFeedSurface;
};

export function LatestFundingFeed({ stage, sector, onAvailableSectors, surface = "public" }: Props) {
  const { rows: sourceRows, isLoading, error, ingestEmpty, dataSource } = useRecentFundingFeed({ limit: 200 });
  const { firms } = useVCDirectory();
  const investorRecordNames = useMemo(() => {
    const leadKeys = new Set(sourceRows.flatMap((row) => firmDisplayMatchKeys(row.leadInvestor)));
    const names = new Set<string>();
    for (const row of sourceRows) {
      const name = row.leadInvestor.trim();
      if (name && name.toLowerCase() !== "unknown") names.add(name);
    }
    for (const firm of firms) {
      if (firmDisplayMatchKeys(firm.name).some((key) => leadKeys.has(key))) names.add(firm.name);
    }
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [sourceRows, firms]);
  const investorRecordsQuery = useQuery({
    queryKey: ["latest-funding-investor-records", investorRecordNames],
    queryFn: async () => {
      if (investorRecordNames.length === 0) return [];
      const chunks: string[][] = [];
      for (let index = 0; index < investorRecordNames.length; index += 50) {
        chunks.push(investorRecordNames.slice(index, index + 50));
      }
      const batches = await Promise.all(
        chunks.map(async (names) => {
          const columns = "id, firm_name, aliases, logo_url, website_url, linkedin_url";
          const aliasNames = [...new Set(names.flatMap((name) => [name, name.toLowerCase(), name.toUpperCase()]))];
          const [byName, byAlias] = await Promise.all([
            supabaseVcDirectory
              .from("firm_records")
              .select(columns)
              .in("firm_name", names)
              .is("deleted_at", null),
            supabaseVcDirectory
              .from("firm_records")
              .select(columns)
              .overlaps("aliases", aliasNames)
              .is("deleted_at", null),
          ]);
          if (byName.error) throw byName.error;
          if (byAlias.error) throw byAlias.error;
          return [...(byName.data ?? []), ...(byAlias.data ?? [])];
        }),
      );
      return batches.flat().map((record) => ({
        id: record.id,
        name: record.firm_name,
        aliases: record.aliases,
        logo_url: record.logo_url,
        website_url: record.website_url,
        linkedin_url: record.linkedin_url,
      }));
    },
    enabled: isSupabaseConfigured && investorRecordNames.length > 0,
    staleTime: 5 * 60_000,
    retry: 0,
  });
  const leadFirmIndex = useMemo(
    () => buildVcFirmMatchIndex([...(investorRecordsQuery.data ?? []), ...firms]),
    [firms, investorRecordsQuery.data],
  );
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

  const app = surface === "app";

  return (
    <FundingFeedSurfaceProvider surface={surface}>
    <div className={app ? APP_PANEL : PUBLIC_PANEL}>
      {rpcDegraded ? (
        <div
          className={cn(
            "border-b px-4 py-2.5 text-center text-[11px] leading-relaxed",
            app
              ? "border-border bg-muted/40 text-muted-foreground"
              : "border-zinc-800 bg-[#0f0f0f] text-[#b3b3b3]",
          )}
        >
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
    </FundingFeedSurfaceProvider>
  );
}
