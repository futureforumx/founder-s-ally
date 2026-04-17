import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { NetworkQuickFilter } from "./types";

const QUICK: { id: NetworkQuickFilter; label: string }[] = [
  { id: "warmest", label: "Warmest intros" },
  { id: "investors", label: "Investors" },
  { id: "customers", label: "Customers" },
  { id: "one_hop", label: "1-hop only" },
  { id: "high_confidence", label: "High confidence" },
  { id: "recent_active", label: "Recently active" },
];

type SortKey = "path" | "recent" | "fit";

export function NetworkCommandBar({
  query,
  onQueryChange,
  quickFilters,
  onToggleQuick,
  sort,
  onSortChange,
  resultCount,
}: {
  query: string;
  onQueryChange: (q: string) => void;
  quickFilters: Set<NetworkQuickFilter>;
  onToggleQuick: (id: NetworkQuickFilter) => void;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
  resultCount: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 max-w-md flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/60" aria-hidden />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search name, role, firm…"
            className="h-9 rounded-md border-border/50 bg-muted/20 pl-8 pr-3 text-[13px] transition-[background-color,border-color,box-shadow] duration-150 ease-out focus-visible:border-foreground/20 focus-visible:ring-1 focus-visible:ring-foreground/10"
            aria-label="Search opportunities"
          />
        </div>
        <div
          className="inline-flex shrink-0 rounded-md border border-border/50 bg-muted/15 p-0.5"
          role="group"
          aria-label="Sort results"
        >
          {(
            [
              { id: "path" as const, label: "Rank" },
              { id: "recent" as const, label: "Recent" },
              { id: "fit" as const, label: "Fit" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSortChange(opt.id)}
              className={cn(
                "rounded-[5px] px-2.5 py-1.5 text-[11px] font-medium transition-[color,background-color,box-shadow] duration-150 ease-out",
                sort === opt.id
                  ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/10"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground/90",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5" role="toolbar" aria-label="Quick filters">
        {QUICK.map((q) => {
          const on = quickFilters.has(q.id);
          return (
            <button
              key={q.id}
              type="button"
              onClick={() => onToggleQuick(q.id)}
              className={cn(
                "rounded-md border px-2 py-1 text-[11px] font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                on
                  ? "border-foreground/20 bg-foreground/[0.06] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                  : "border-border/50 bg-transparent text-muted-foreground hover:border-border hover:bg-muted/25 hover:text-foreground/90",
              )}
            >
              {q.label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] tabular-nums text-muted-foreground">
        <span className="font-medium text-foreground/80">{resultCount}</span> opportunit{resultCount === 1 ? "y" : "ies"}
      </p>
    </div>
  );
}
