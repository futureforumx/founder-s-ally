import { useState, useMemo } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";

interface SectorAlignmentProps {
  vcSectors: string[];
  primarySector?: string | null;
  secondarySectors?: string[];
  isExpanded?: boolean;
  onToggleExpand?: () => void;
}

type TimeRange = "6m" | "18m" | "all";

const TIME_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "6m", label: "6M" },
  { value: "18m", label: "18M" },
  { value: "all", label: "All Time" },
];

const CANONICAL_SECTORS = [
  "Enterprise SaaS", "Fintech", "AI / ML", "Health & Bio",
  "Climate Tech", "PropTech", "Consumer", "Deep Tech",
  "Defense", "EdTech", "Logistics", "Web3",
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
  0: "bg-violet-50 dark:bg-violet-950/20",
  1: "bg-violet-100 dark:bg-violet-900/30",
  2: "bg-violet-200 dark:bg-violet-800/40",
  3: "bg-violet-400 dark:bg-violet-600",
  4: "bg-violet-600 dark:bg-violet-500",
};

const TIER_TEXT: Record<number, string> = {
  0: "text-violet-400",
  1: "text-violet-600",
  2: "text-violet-700",
  3: "text-white",
  4: "text-white",
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
  isExpanded = false,
  onToggleExpand,
}: SectorAlignmentProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  const sectorData = useMemo(() => {
    const seed = seedHash(vcSectors.join(",") || "default");
    return CANONICAL_SECTORS.map((sector, i) => {
      const isActive = vcSectors.some(
        (v) => v.toLowerCase().includes(sector.split(" ")[0].toLowerCase()) ||
               sector.toLowerCase().includes(v.split(" ")[0].toLowerCase())
      );
      const base = isActive ? 40 + ((seed * (i + 3) * 17) % 160) : ((seed * (i + 7) * 13) % 30);
      const mult = timeRange === "6m" ? 0.3 : timeRange === "18m" ? 0.65 : 1;
      const amount = Math.round(base * mult);
      const isPrimary = primarySector?.toLowerCase().includes(sector.split(" ")[0].toLowerCase()) || false;
      const isSecondary = secondarySectors.some((s) => s.toLowerCase().includes(sector.split(" ")[0].toLowerCase()));
      return { name: sector, amount, isPrimary, isSecondary, isActive };
    });
  }, [vcSectors, primarySector, secondarySectors, timeRange]);

  const maxAmount = Math.max(...sectorData.map((d) => d.amount), 1);
  const totalDeployed = sectorData.reduce((sum, d) => sum + d.amount, 0);

  const cols = isExpanded ? 4 : 3;
  const cellH = isExpanded ? "min-h-[56px]" : "min-h-[36px]";
  const fontSize = isExpanded ? "text-[10px]" : "text-[8px]";

  return (
    <TooltipProvider delayDuration={0}>
      <div className={`rounded-xl border border-border bg-card p-3 flex flex-col ${isExpanded ? "h-[calc(100vh-280px)] max-h-[520px]" : "h-full"}`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[10px] font-bold text-muted-foreground/60 tracking-[0.2em] uppercase">
            Sector Alignment
          </h4>
          <div className="flex items-center gap-2">
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
            {onToggleExpand && (
              <button onClick={onToggleExpand} className="text-muted-foreground hover:text-foreground transition-colors">
                {isExpanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>

        {/* Heatmap Grid */}
        <div className={`grid grid-cols-${cols} gap-1 flex-1`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {sectorData.map((d) => {
            const tier = intensityTier(d.amount, maxAmount);
            return (
              <Tooltip key={d.name}>
                <TooltipTrigger asChild>
                  <div
                    className={`relative rounded-lg ${TIER_BG[tier]} flex items-center justify-center p-1 ${cellH} cursor-default transition-all hover:ring-1 hover:ring-violet-400/40`}
                  >
                    <span className={`${fontSize} font-semibold leading-tight text-center ${TIER_TEXT[tier]}`}>
                      {d.name}
                    </span>
                    {d.isPrimary && (
                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[hsl(var(--success))]" />
                    )}
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="bg-violet-900 text-white text-[11px] px-3 py-2 border-0 shadow-lg max-w-[180px]"
                >
                  <p className="font-bold">{d.name}</p>
                  <p className="text-violet-200 mt-0.5">{formatDollars(d.amount)} deployed</p>
                  <p className="text-violet-300/70 text-[9px] mt-1">Total capital invested in this sector over the selected period</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1.5 mt-1">
          <p className="text-[9px] text-muted-foreground">{formatDollars(totalDeployed)} total deployed</p>
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
