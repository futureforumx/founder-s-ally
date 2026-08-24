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
import { useFundingFeedApp } from "./fundingFeedSurface";

function controlClass(app: boolean) {
  return app
    ? cn(
        "h-9 rounded-md border border-border bg-background text-xs text-foreground shadow-none",
        "hover:border-border hover:bg-muted/50",
        "focus:border-ring/50 focus-visible:border-ring/50 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
      )
    : cn(
        "h-9 rounded-md border border-zinc-800 bg-zinc-900 text-xs text-zinc-200 shadow-none",
        "hover:border-zinc-700 hover:bg-zinc-900",
        "focus:border-zinc-700 focus-visible:border-zinc-700 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0",
      );
}

function menuClass(app: boolean) {
  return app
    ? "max-h-64 overflow-y-auto border-border bg-popover text-popover-foreground"
    : "max-h-64 overflow-y-auto border-zinc-800 bg-zinc-900 text-zinc-200";
}

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
  const app = useFundingFeedApp();
  return (
    <span className="min-w-0 truncate">
      <span className={app ? "text-muted-foreground" : "text-zinc-500"}>{name}:</span>{" "}
      <span className={app ? "text-foreground" : "text-zinc-200"}>{value}</span>
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
  const app = useFundingFeedApp();
  const summary =
    selected.length === 0 ? "All" : selected.length === 1 ? selected[0] : `${selected.length} selected`;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(controlClass(app), "inline-flex min-w-[8.5rem] items-center justify-between gap-2 px-2.5")}
          aria-label={`Filter by ${label.toLowerCase()}`}
        >
          <TriggerLabel name={label} value={summary} />
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0", app ? "text-muted-foreground" : "text-zinc-500")} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className={cn("w-56", menuClass(app))}>
        <DropdownMenuCheckboxItem
          checked={selected.length === 0}
          onCheckedChange={() => onChange([])}
          onSelect={(event) => event.preventDefault()}
          className={cn(
            "text-xs",
            app
              ? "text-foreground focus:bg-muted focus:text-foreground"
              : "text-zinc-200 focus:bg-zinc-800 focus:text-white",
          )}
        >
          All
        </DropdownMenuCheckboxItem>
        {choices.map((choice) => (
          <DropdownMenuCheckboxItem
            key={choice}
            checked={selected.includes(choice)}
            onCheckedChange={() => onChange(toggleValue(selected, choice))}
            onSelect={(event) => event.preventDefault()}
            className={cn(
              "text-xs",
              app
                ? "text-foreground focus:bg-muted focus:text-foreground"
                : "text-zinc-200 focus:bg-zinc-800 focus:text-white",
            )}
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
  const app = useFundingFeedApp();
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
          className={cn(controlClass(app), "inline-flex min-w-[9.5rem] items-center justify-between gap-2 px-2.5")}
          aria-label="Filter by amount"
        >
          <TriggerLabel name="Amount" value={valueLabel} />
          <ChevronDown className={cn("h-3.5 w-3.5 shrink-0", app ? "text-muted-foreground" : "text-zinc-500")} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          "w-56 p-1.5",
          app ? "border-border bg-popover text-popover-foreground" : "border-zinc-800 bg-zinc-900 text-zinc-200",
        )}
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
                preset === item.id
                  ? app
                    ? "bg-muted text-foreground"
                    : "bg-zinc-800 text-white"
                  : app
                    ? "text-muted-foreground hover:bg-muted hover:text-foreground"
                    : "text-zinc-300 hover:bg-zinc-800/70 hover:text-white",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
        {preset === "custom" ? (
          <div className={cn("mt-1.5 grid grid-cols-2 gap-1.5 px-1 pb-1 pt-2", app ? "border-t border-border" : "border-t border-zinc-800")}>
            <label className="space-y-1">
              <span className={cn("block text-[10px]", app ? "text-muted-foreground" : "text-zinc-500")}>Min ($M)</span>
              <input
                value={customMinInput}
                onChange={(event) => onCustomMinInputChange(event.target.value)}
                inputMode="decimal"
                placeholder="0"
                className={cn(controlClass(app), "w-full px-2")}
              />
            </label>
            <label className="space-y-1">
              <span className={cn("block text-[10px]", app ? "text-muted-foreground" : "text-zinc-500")}>Max ($M)</span>
              <input
                value={customMaxInput}
                onChange={(event) => onCustomMaxInputChange(event.target.value)}
                inputMode="decimal"
                placeholder="Any"
                className={cn(controlClass(app), "w-full px-2")}
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
  const app = useFundingFeedApp();
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 border-b px-3 py-2",
        app ? "border-border/60 bg-muted/30" : "border-zinc-800/60 bg-[#0a0a0a]",
        className,
      )}
      role="group"
      aria-label={groupAriaLabel}
    >
      <label className={cn(controlClass(app), "relative flex min-w-[12rem] flex-1 items-center")}>
        <Search
          className={cn("pointer-events-none absolute left-2.5 h-3.5 w-3.5", app ? "text-muted-foreground" : "text-zinc-500")}
          aria-hidden
        />
        <input
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchAriaLabel}
          className={cn(
            "h-full w-full rounded-md bg-transparent py-0 pl-8 pr-2.5 text-xs outline-none",
            app ? "text-foreground placeholder:text-muted-foreground" : "text-zinc-200 placeholder:text-zinc-500",
          )}
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
        className={cn(controlClass(app), "inline-flex w-9 items-center justify-center px-0")}
      >
        <span className="flex flex-col items-center leading-none" aria-hidden>
          <ChevronUp
            className={cn(
              "h-3 w-3 -mb-0.5",
              dateSort === "oldest"
                ? app
                  ? "text-foreground"
                  : "text-zinc-200"
                : app
                  ? "text-muted-foreground/40"
                  : "text-zinc-600",
            )}
          />
          <ChevronDown
            className={cn(
              "h-3 w-3 -mt-0.5",
              dateSort === "newest"
                ? app
                  ? "text-foreground"
                  : "text-zinc-200"
                : app
                  ? "text-muted-foreground/40"
                  : "text-zinc-600",
            )}
          />
        </span>
      </button>

      {!filtersAreDefault ? (
        <button
          type="button"
          onClick={onReset}
          className={cn(
            "shrink-0 text-xs transition-colors",
            app ? "text-muted-foreground hover:text-foreground" : "text-zinc-400 hover:text-white",
          )}
        >
          Reset
        </button>
      ) : null}
    </div>
  );
}
