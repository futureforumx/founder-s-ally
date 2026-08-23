import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Search } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import {
  formatUsdCompact,
  LATEST_FUNDING_AMOUNT_PRESETS,
  type LatestFundingAmountPreset,
  type LatestFundingDateSort,
} from "@/lib/latestFundingFilters";
import { cn } from "@/lib/utils";

const CONTROL = cn(
  "h-9 rounded-md border border-zinc-800 bg-zinc-900 text-xs text-zinc-200 shadow-none",
  "hover:border-zinc-700 hover:bg-zinc-900",
  "focus:border-zinc-700 focus-visible:border-zinc-700 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
);

const MENU = "max-h-64 overflow-y-auto border-zinc-800 bg-zinc-900 text-zinc-200";

type Props = {
  searchQuery: string;
  onSearchQueryChange: (next: string) => void;
  searchPlaceholder?: string;
  searchAriaLabel?: string;
  sectorLabel?: string;
  roundLabel?: string;
  groupAriaLabel?: string;
  sectorChoices: string[];
  selectedSectors: string[];
  onSectorsChange: (next: string[]) => void;
  roundChoices: string[];
  selectedRounds: string[];
  onRoundsChange: (next: string[]) => void;
  amountPreset: LatestFundingAmountPreset;
  onAmountPresetChange: (next: LatestFundingAmountPreset) => void;
  customMinInput: string;
  customMaxInput: string;
  onCustomMinInputChange: (next: string) => void;
  onCustomMaxInputChange: (next: string) => void;
  customMinUsd: number | null;
  customMaxUsd: number | null;
  dateSort: LatestFundingDateSort;
  onDateSortChange: (next: LatestFundingDateSort) => void;
  filtersAreDefault: boolean;
  onReset: () => void;
  className?: string;
};

function toggleValue(current: string[], value: string): string[] {
  return current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
}

function TriggerLabel({ name, value }: { name: string; value: string }) {
  return (
    <span className="min-w-0 truncate">
      <span className="text-zinc-500">{name}:</span> <span className="text-zinc-200">{value}</span>
    </span>
  );
}

function MultiSelectFilter({
  label,
  choices,
  selected,
  onChange,
}: {
  label: string;
  choices: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const summary =
    selected.length === 0 ? "All" : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(CONTROL, "inline-flex min-w-[8.5rem] items-center justify-between gap-2 px-2.5")}
          aria-label={`Filter by ${label.toLowerCase()}`}
        >
          <TriggerLabel name={label} value={summary} />
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={cn("w-56", MENU)}>
        <DropdownMenuCheckboxItem
          checked={selected.length === 0}
          onCheckedChange={() => onChange([])}
          onSelect={(event) => event.preventDefault()}
          className="text-xs text-zinc-200 focus:bg-zinc-800 focus:text-white"
        >
          All
        </DropdownMenuCheckboxItem>
        {choices.map((choice) => (
          <DropdownMenuCheckboxItem
            key={choice}
            checked={selected.includes(choice)}
            onCheckedChange={() => onChange(toggleValue(selected, choice))}
            onSelect={(event) => event.preventDefault()}
            className="text-xs text-zinc-200 focus:bg-zinc-800 focus:text-white"
          >
            {choice}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AmountFilter({
  preset,
  onPresetChange,
  customMinInput,
  customMaxInput,
  onCustomMinInputChange,
  onCustomMaxInputChange,
  customMinUsd,
  customMaxUsd,
}: {
  preset: LatestFundingAmountPreset;
  onPresetChange: (next: LatestFundingAmountPreset) => void;
  customMinInput: string;
  customMaxInput: string;
  onCustomMinInputChange: (next: string) => void;
  onCustomMaxInputChange: (next: string) => void;
  customMinUsd: number | null;
  customMaxUsd: number | null;
}) {
  const [open, setOpen] = useState(false);

  const valueLabel = useMemo(() => {
    if (preset === "all") return "All";
    if (preset !== "custom") {
      return LATEST_FUNDING_AMOUNT_PRESETS.find((item) => item.id === preset)?.label ?? "All";
    }
    if (customMinUsd != null && customMaxUsd != null) {
      return `${formatUsdCompact(customMinUsd)} – ${formatUsdCompact(customMaxUsd)}`;
    }
    if (customMinUsd != null) return `${formatUsdCompact(customMinUsd)}+`;
    if (customMaxUsd != null) return `≤ ${formatUsdCompact(customMaxUsd)}`;
    return "Custom";
  }, [preset, customMinUsd, customMaxUsd]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(CONTROL, "inline-flex min-w-[9.5rem] items-center justify-between gap-2 px-2.5")}
          aria-label="Filter by amount"
        >
          <TriggerLabel name="Amount" value={valueLabel} />
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-56 border-zinc-800 bg-zinc-900 p-1.5 text-zinc-200"
        sideOffset={6}
      >
        <div className="flex flex-col gap-0.5">
          {LATEST_FUNDING_AMOUNT_PRESETS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onPresetChange(item.id);
                if (item.id !== "custom") setOpen(false);
              }}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
                preset === item.id ? "bg-zinc-800 text-white" : "text-zinc-300 hover:bg-zinc-800/70 hover:text-white",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {preset === "custom" ? (
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 border-t border-zinc-800 px-1 pb-1 pt-2">
            <label className="space-y-1">
              <span className="block text-[10px] text-zinc-500">Min ($M)</span>
              <input
                value={customMinInput}
                onChange={(event) => onCustomMinInputChange(event.target.value)}
                inputMode="decimal"
                placeholder="0"
                className={cn(CONTROL, "w-full px-2")}
              />
            </label>
            <label className="space-y-1">
              <span className="block text-[10px] text-zinc-500">Max ($M)</span>
              <input
                value={customMaxInput}
                onChange={(event) => onCustomMaxInputChange(event.target.value)}
                inputMode="decimal"
                placeholder="Any"
                className={cn(CONTROL, "w-full px-2")}
              />
            </label>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

export function LatestFundingFilterBar({
  searchQuery,
  onSearchQueryChange,
  searchPlaceholder = "Search company, investor...",
  searchAriaLabel = "Search company or investor",
  sectorLabel = "Sector",
  roundLabel = "Round",
  groupAriaLabel = "Filter latest funding",
  sectorChoices,
  selectedSectors,
  onSectorsChange,
  roundChoices,
  selectedRounds,
  onRoundsChange,
  amountPreset,
  onAmountPresetChange,
  customMinInput,
  customMaxInput,
  onCustomMinInputChange,
  onCustomMaxInputChange,
  customMinUsd,
  customMaxUsd,
  dateSort,
  onDateSortChange,
  filtersAreDefault,
  onReset,
  className,
}: Props) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2 border-b border-zinc-800/60 bg-[#0a0a0a] px-3 py-2", className)}
      role="group"
      aria-label={groupAriaLabel}
    >
      <label className={cn(CONTROL, "relative flex min-w-[12rem] flex-1 items-center")}>
        <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-zinc-500" aria-hidden />
        <input
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchAriaLabel}
          className="h-full w-full rounded-md bg-transparent py-0 pl-8 pr-2.5 text-xs text-zinc-200 placeholder:text-zinc-500 outline-none"
        />
      </label>

      <MultiSelectFilter
        label={sectorLabel}
        choices={sectorChoices}
        selected={selectedSectors}
        onChange={onSectorsChange}
      />
      <MultiSelectFilter
        label={roundLabel}
        choices={roundChoices}
        selected={selectedRounds}
        onChange={onRoundsChange}
      />
      <AmountFilter
        preset={amountPreset}
        onPresetChange={onAmountPresetChange}
        customMinInput={customMinInput}
        customMaxInput={customMaxInput}
        onCustomMinInputChange={onCustomMinInputChange}
        onCustomMaxInputChange={onCustomMaxInputChange}
        customMinUsd={customMinUsd}
        customMaxUsd={customMaxUsd}
      />

      <button
        type="button"
        onClick={() => onDateSortChange(dateSort === "newest" ? "oldest" : "newest")}
        aria-label={
          dateSort === "newest"
            ? "Date sorted latest first. Click to sort earliest first."
            : "Date sorted earliest first. Click to sort latest first."
        }
        title={dateSort === "newest" ? "Latest first" : "Earliest first"}
        className={cn(CONTROL, "inline-flex w-9 items-center justify-center px-0")}
      >
        <span className="flex flex-col items-center leading-none" aria-hidden>
          <ChevronUp className={cn("h-3 w-3 -mb-0.5", dateSort === "oldest" ? "text-zinc-200" : "text-zinc-600")} />
          <ChevronDown className={cn("h-3 w-3 -mt-0.5", dateSort === "newest" ? "text-zinc-200" : "text-zinc-600")} />
        </span>
      </button>

      {!filtersAreDefault ? (
        <button
          type="button"
          onClick={onReset}
          className="shrink-0 text-xs text-zinc-400 transition-colors hover:text-white"
        >
          Reset
        </button>
      ) : null}
    </div>
  );
}
