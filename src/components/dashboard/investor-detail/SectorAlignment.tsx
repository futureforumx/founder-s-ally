import { useState, useMemo } from "react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

interface SectorAlignmentProps {
  vcSectors: string[];
  primarySector?: string | null;
  secondarySectors?: string[];
}

type TimeRange = "6m" | "18m" | "all";

const TIME_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "6m", label: "6M" },
  { value: "18m", label: "18M" },
  { value: "all", label: "All Time" },
];

// Canonical sectors for the heatmap grid
const CANONICAL_SECTORS = [
  "Enterprise SaaS",
  "Fintech",
  "AI / ML",
  "Health & Bio",
  "Climate Tech",
  "PropTech",
  "Consumer",
  "Deep Tech",
  "Defense",
  "EdTech",
  "Logistics",
  "Web3",
];

function seedHash(s: string): number {
  return s.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
}

function intensityTier(v: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (max === 0) return 0;
  const pct = v / max;
  if (pct >= 0.75) return 4;
  if (pct >= 0.5) return 3;
  if (pct >= 0.25) return 2;
  if (pct > 0) return 1;
  return 0;
}

const TIER_BG: Record<number, string> = {
  0: "bg-primary/5",
  1: "bg-primary/15",
  2: "bg-primary/30",
  3: "bg-primary/50",
  4: "bg-primary/75",
};

function formatDollars(v: number): string {
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}B`;
  if (v >= 1) return `$${v.toFixed(0)}M`;
  return `$${(v * 1000).toFixed(0)}K`;
}

export function SectorAlignment({
  vcSectors,
  primarySector,
  secondarySectors = [],
}: SectorAlignmentProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  // Generate deterministic investment data per sector + time range
  const sectorData = useMemo(() => {
    const seed = seedHash(vcSectors.join(",") || "default");
    return CANONICAL_SECTORS.map((sector, i) => {
      const isActive = vcSectors.some(
        (v) => v.toLowerCase().includes(sector.split(" ")[0].toLowerCase()) ||
               sector.toLowerCase().includes(v.split(" ")[0].toLowerCase())
      );
      const base = isActive
        ? 40 + ((seed * (i + 3) * 17) % 160)
        : ((seed * (i + 7) * 13) % 30);

      const mult = timeRange === "6m" ? 0.3 : timeRange === "18m" ? 0.65 : 1;
      const amount = Math.round(base * mult);

      const isPrimary = primarySector?.toLowerCase().includes(sector.split(" ")[0].toLowerCase()) || false;
      const isSecondary = secondarySectors.some(
        (s) => s.toLowerCase().includes(sector.split(" ")[0].toLowerCase())
      );

      return { name: sector, amount, isPrimary, isSecondary, isActive };
    });
  }, [vcSectors, primarySector, secondarySectors, timeRange]);

  const maxAmount = Math.max(...sectorData.map((d) => d.amount), 1);
  const totalDeployed = sectorData.reduce((sum, d) => sum + d.amount, 0);

  return (
    <TooltipProvider delayDuration={0}>
      <div className="rounded-xl border border-border bg-card p-4 space-y-3 h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h4 className="text-[10px] font-bold text-muted-foreground/60 tracking-[0.2em] uppercase">
            Sector Alignment
          </h4>
          <div className="flex items-center gap-0.5 bg-secondary rounded-md p-0.5">
            {TIME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTimeRange(opt.value)}
                className={`px-2 py-0.5 text-[9px] font-semibold rounded transition-all ${
                  timeRange === opt.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Heatmap Grid */}
        <div className="grid grid-cols-3 gap-1 flex-1">
          {sectorData.map((d) => {
            const tier = intensityTier(d.amount, maxAmount);
            return (
              <Tooltip key={d.name}>
                <TooltipTrigger asChild>
                  <div
                    className={`relative rounded-lg ${TIER_BG[tier]} flex items-center justify-center p-1.5 min-h-[44px] cursor-default transition-all hover:ring-1 hover:ring-primary/30`}
                  >
                    <span
                      className={`text-[8px] font-semibold leading-tight text-center ${
                        tier >= 3 ? "text-primary-foreground" : "text-foreground/70"
                      }`}
                    >
                      {d.name}
                    </span>
                    {d.isPrimary && (
                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[hsl(var(--success))]" />
                    )}
                    {d.isSecondary && !d.isPrimary && (
                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-accent" />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="bg-primary text-primary-foreground text-[11px] px-3 py-2 border-0 shadow-lg max-w-[180px]"
                >
                  <p className="font-bold">{d.name}</p>
                  <p className="text-primary-foreground/70 mt-0.5">
                    {formatDollars(d.amount)} deployed
                  </p>
                  <p className="text-primary-foreground/50 text-[9px] mt-1">
                    Total capital invested in this sector over the selected period
                  </p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1">
          <p className="text-[9px] text-muted-foreground">
            {formatDollars(totalDeployed)} total deployed
          </p>
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-mono text-muted-foreground">Low</span>
            {[0, 1, 2, 3, 4].map((t) => (
              <div key={t} className={`h-2.5 w-2.5 rounded-sm ${TIER_BG[t]}`} />
            ))}
            <span className="text-[8px] font-mono text-muted-foreground">High</span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
