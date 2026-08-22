import {
  canonicalGeoTagsForDisplay,
  fundNameForDisplay,
  geographyFocusForDisplay,
  sectorFocusForDisplay,
  stageFocusForDisplay,
  type FreshCapitalFundRow,
} from "@/lib/freshCapitalPublic";
import {
  buildDedupedSectorChoices,
  formatRoundKind,
  latestFundingFiltersAreDefault,
  matchesUsdAmountPreset,
  sectorClusterKey,
  type LatestFundingTableFilters,
} from "@/lib/latestFundingFilters";

export type FundWatchTableFilters = LatestFundingTableFilters;

export function fundSizeUsdForFilter(
  row: Pick<FreshCapitalFundRow, "final_size_usd" | "target_size_usd">,
): number | null {
  const value = row.final_size_usd ?? row.target_size_usd;
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value < 1_000_000 ? value * 1_000_000 : value;
}

export function fundWatchStageLabels(
  row: Pick<FreshCapitalFundRow, "firm_name" | "fund_name" | "stage_focus">,
): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const raw of stageFocusForDisplay(row)) {
    const label = formatRoundKind(raw).trim();
    if (!label || label === "—") continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    labels.push(label);
  }
  return labels;
}

export function buildFundWatchStageChoices(rows: FreshCapitalFundRow[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    for (const label of fundWatchStageLabels(row)) {
      const key = label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

export function buildFundWatchSectorChoices(rows: FreshCapitalFundRow[]): string[] {
  const raw: string[] = [];
  for (const row of rows) {
    raw.push(...sectorFocusForDisplay(row));
  }
  return buildDedupedSectorChoices(raw);
}

function announcedMs(row: Pick<FreshCapitalFundRow, "announced_date" | "close_date">): number {
  return Date.parse(row.announced_date || row.close_date || "") || 0;
}

function matchesFundWatchSearch(row: FreshCapitalFundRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    row.firm_name,
    row.fund_name,
    fundNameForDisplay(row),
    ...sectorFocusForDisplay(row),
    ...fundWatchStageLabels(row),
    ...canonicalGeoTagsForDisplay(geographyFocusForDisplay(row) ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function matchesFundWatchSectors(row: FreshCapitalFundRow, sectors: string[]): boolean {
  if (!sectors.length) return true;
  const keys = new Set(sectorFocusForDisplay(row).map((tag) => sectorClusterKey(tag)).filter(Boolean));
  return sectors.some((sector) => keys.has(sectorClusterKey(sector)));
}

function matchesFundWatchStages(row: FreshCapitalFundRow, stages: string[]): boolean {
  if (!stages.length) return true;
  const labels = new Set(fundWatchStageLabels(row).map((label) => label.toLowerCase()));
  return stages.some((stage) => labels.has(formatRoundKind(stage).trim().toLowerCase()));
}

export function applyFundWatchTableFilters(
  rows: FreshCapitalFundRow[],
  filters: FundWatchTableFilters,
): FreshCapitalFundRow[] {
  const filtered = rows.filter(
    (row) =>
      matchesFundWatchSearch(row, filters.query) &&
      matchesFundWatchSectors(row, filters.sectors) &&
      matchesFundWatchStages(row, filters.rounds) &&
      matchesUsdAmountPreset(
        fundSizeUsdForFilter(row),
        filters.amountPreset,
        filters.customMinUsd,
        filters.customMaxUsd,
      ),
  );
  const sign = filters.dateSort === "oldest" ? 1 : -1;
  return [...filtered].sort((a, b) => sign * (announcedMs(a) - announcedMs(b)));
}

export function fundWatchFiltersAreDefault(
  filters: Pick<FundWatchTableFilters, "query" | "sectors" | "rounds" | "amountPreset" | "dateSort">,
): boolean {
  return latestFundingFiltersAreDefault(filters);
}
