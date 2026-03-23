import { useState, useMemo } from "react";
import { Check, Maximize2, Minimize2 } from "lucide-react";
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

function formatDollars(v: number): string {
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}B`;
  if (v >= 1) return `$${v.toFixed(0)}M`;
  return `$${(v * 1000).toFixed(0)}K`;
}

type Recency = "recent" | "older" | "none";
type ActivityLevel = "active" | "inactive";

interface SectorBadgeData {
  name: string;
  isUserMatch: boolean;
  recency: Recency;
  dealCount: number;
  activityLevel: ActivityLevel;
  amount: number;
}

function computeSectorData(
  vcSectors: string[],
  primarySector: string | null | undefined,
  secondarySectors: string[],
  timeRange: TimeRange,
): SectorBadgeData[] {
  const seed = seedHash(vcSectors.join(",") || "default");
  const userSectors = [primarySector, ...secondarySectors].filter(Boolean).map(s => s!.toLowerCase());

  return CANONICAL_SECTORS.map((sector, i) => {
    const isActive = vcSectors.some(
      (v) => v.toLowerCase().includes(sector.split(" ")[0].toLowerCase()) ||
             sector.toLowerCase().includes(v.split(" ")[0].toLowerCase())
    );

    const isUserMatch = userSectors.some(
      (u) => u.includes(sector.split(" ")[0].toLowerCase()) ||
             sector.toLowerCase().includes(u.split(" ")[0].toLowerCase())
    );

    const base = isActive ? 40 + ((seed * (i + 3) * 17) % 160) : ((seed * (i + 7) * 13) % 30);
    const mult = timeRange === "6m" ? 0.3 : timeRange === "18m" ? 0.65 : 1;
    const amount = Math.round(base * mult);

    // Simulate recency based on seed
    const recencyScore = (seed * (i + 11) * 23) % 100;
    let recency: Recency = "none";
    if (isActive) {
      recency = recencyScore > 40 ? "recent" : "older";
    }

    const dealCount = isActive
      ? Math.max(1, Math.round((recencyScore / 20) * (timeRange === "6m" ? 0.4 : timeRange === "18m" ? 0.7 : 1)))
      : 0;

    return {
      name: sector,
      isUserMatch: isUserMatch && isActive,
      recency,
      dealCount,
      activityLevel: isActive ? "active" : "inactive",
      amount,
    };
  });
}

function RecencyDot({ recency }: { recency: Recency }) {
  if (recency === "none") return null;
  return (
    <span
      className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-card ${
        recency === "recent" ? "bg-emerald-500" : "bg-muted-foreground/40"
      }`}
    />
  );
}

function FitIndicator({ matched, total }: { matched: number; total: number }) {
  const dots = Array.from({ length: total }, (_, i) => i < matched);
  const label = matched === total ? "Strong fit" : matched > 0 ? "Partial fit" : "No match";

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-muted-foreground">
        <span className="font-semibold text-foreground">{matched}</span> of {total} sectors match
      </span>
      <span className="flex items-center gap-0.5">
        {dots.map((filled, i) => (
          <span
            key={i}
            className={`w-1.5 h-1.5 rounded-full ${filled ? "bg-emerald-500" : "bg-muted-foreground/25"}`}
          />
        ))}
      </span>
      <span className={`text-[10px] font-semibold ${
        matched === total ? "text-emerald-600" : matched > 0 ? "text-amber-600" : "text-muted-foreground"
      }`}>
        {label}
      </span>
    </div>
  );
}

export function SectorAlignment({
  vcSectors,
  primarySector,
  secondarySectors = [],
  isExpanded = false,
  onToggleExpand,
}: SectorAlignmentProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>("all");

  const sectorData = useMemo(
    () => computeSectorData(vcSectors, primarySector, secondarySectors, timeRange),
    [vcSectors, primarySector, secondarySectors, timeRange],
  );

  const totalDeployed = sectorData.reduce((sum, d) => sum + d.amount, 0);
  const userSectorCount = [primarySector, ...secondarySectors].filter(Boolean).length || 3;
  const matchedCount = sectorData.filter(d => d.isUserMatch).length;
  const activeCount = sectorData.filter(d => d.activityLevel === "active").length;

  const pace = activeCount >= 8 ? "High" : activeCount >= 5 ? "Medium" : "Low";

  return (
    <TooltipProvider delayDuration={0}>
      <div className={`rounded-xl border border-border bg-card p-3 flex flex-col ${
        isExpanded ? "h-[calc(100vh-280px)] max-h-[520px]" : "h-full"
      }`}>
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

        {/* Match summary bar */}
        <div className="mb-3 pb-2 border-b border-border">
          <FitIndicator matched={matchedCount} total={Math.min(userSectorCount, 3)} />
        </div>

        {/* Badge grid */}
        <div className={`flex flex-wrap gap-1.5 flex-1 content-start ${isExpanded ? "gap-2" : ""}`}>
          {sectorData.map((d) => {
            // State 1: Match
            if (d.isUserMatch) {
              return (
                <Tooltip key={d.name}>
                  <TooltipTrigger asChild>
                    <span className="relative inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold cursor-default transition-all hover:shadow-sm bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                      <Check className="h-3 w-3" />
                      {d.name}
                      <RecencyDot recency={d.recency} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-emerald-900 text-white text-[11px] px-3 py-2 border-0 shadow-lg max-w-[200px]">
                    <p className="font-bold">Matches your profile</p>
                    <p className="text-emerald-200 mt-0.5">{d.dealCount} deal{d.dealCount !== 1 ? "s" : ""} in selected period</p>
                    <p className="text-emerald-300/60 text-[9px] mt-1">{formatDollars(d.amount)} deployed</p>
                  </TooltipContent>
                </Tooltip>
              );
            }

            // State 2: Active but no match
            if (d.activityLevel === "active") {
              return (
                <Tooltip key={d.name}>
                  <TooltipTrigger asChild>
                    <span className="relative inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold cursor-default transition-all hover:shadow-sm bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
                      {d.name}
                      <RecencyDot recency={d.recency} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-violet-900 text-white text-[11px] px-3 py-2 border-0 shadow-lg max-w-[200px]">
                    <p className="font-bold">Active sector</p>
                    <p className="text-violet-200 mt-0.5">{d.dealCount} deal{d.dealCount !== 1 ? "s" : ""} · Not in your profile</p>
                    <p className="text-violet-300/60 text-[9px] mt-1">{formatDollars(d.amount)} deployed</p>
                  </TooltipContent>
                </Tooltip>
              );
            }

            // State 3: Inactive
            return (
              <Tooltip key={d.name}>
                <TooltipTrigger asChild>
                  <span className="relative inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-medium cursor-default transition-all border border-border text-muted-foreground/50">
                    {d.name}
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-popover text-popover-foreground text-[11px] px-3 py-2 shadow-lg max-w-[200px]">
                  <p className="font-bold">No recent activity</p>
                  <p className="text-muted-foreground text-[9px] mt-0.5">No recent activity in this sector</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mt-2 pt-1.5 text-[8px] text-muted-foreground/50">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> active last 6mo
          </span>
          <span className="flex items-center gap-1">
            <Check className="h-2.5 w-2.5" /> matches your profile
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-2.5 rounded-sm border border-muted-foreground/30" /> inactive
          </span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-border">
          <p className="text-[9px] text-muted-foreground">{formatDollars(totalDeployed)} total deployed</p>
          <p className="text-[9px] text-muted-foreground">
            Deployment pace: <span className={`font-semibold ${
              pace === "High" ? "text-emerald-600" : pace === "Medium" ? "text-amber-600" : "text-muted-foreground"
            }`}>{pace}</span>
          </p>
        </div>
      </div>
    </TooltipProvider>
  );
}
