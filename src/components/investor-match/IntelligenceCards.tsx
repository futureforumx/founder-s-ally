import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { SectorClassification } from "@/components/SectorTags";
import { CompanyData } from "@/components/CompanyProfile";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { TimeRange, timeMultiplier } from "./TimeRangeControl";

interface IntelligenceCardsProps {
  matchCount: number;
  animatedTotal: number;
  totalRaised: number;
  sectorClassification?: SectorClassification | null;
  companyData?: CompanyData | null;
  formatCurrency: (n: number) => string;
  timeRange: TimeRange;
}

// ── Dark Metric Card ──

function MetricCard({
  label,
  value,
  subtitle,
  trendValue,
  trendLabel,
  accentColor = "hsl(var(--success))",
  icon,
}: {
  label: string;
  value: string;
  subtitle?: string;
  trendValue: number;
  trendLabel: string;
  accentColor?: string;
  icon?: React.ReactNode;
}) {
  const isPositive = trendValue >= 0;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <div
      className="relative rounded-2xl p-6 overflow-hidden"
      style={{
        background: "hsl(var(--primary))",
        border: "1px solid hsl(var(--border) / 0.15)",
      }}
    >
      {/* Subtle glow */}
      <div
        className="absolute -top-12 -right-12 w-32 h-32 rounded-full blur-3xl opacity-10 pointer-events-none"
        style={{ background: accentColor }}
      />

      <div className="relative z-10">
        {/* Label row */}
        <div className="flex items-center gap-2 mb-4">
          {icon}
          <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary-foreground/60">
            {label}
          </span>
        </div>

        {/* Big value */}
        <p className="text-4xl font-extrabold text-primary-foreground tracking-tight font-mono leading-none">
          {value}
        </p>

        {subtitle && (
          <p className="text-xs text-primary-foreground/40 mt-1.5 font-medium">{subtitle}</p>
        )}

        {/* Trend row */}
        <div className="flex items-center gap-2 mt-4">
          <span
            className="inline-flex items-center gap-1 text-xs font-semibold"
            style={{ color: isPositive ? "hsl(var(--success))" : "hsl(var(--destructive))" }}
          >
            <TrendIcon className="h-3 w-3" />
            {isPositive ? "↑" : "↓"}{Math.abs(trendValue).toFixed(1)}%
          </span>
          <span className="text-[10px] text-primary-foreground/30 font-medium">{trendLabel}</span>
        </div>
      </div>
    </div>
  );
}

// ── Sector Heatmap ──

const MONTH_LABELS = [
  "Oct 24", "Nov 24", "Dec 24", "Jan 25", "Feb 25", "Mar 25",
  "Apr 25", "May 25", "Jun 25", "Jul 25", "Aug 25", "Sep 25",
  "Oct 25", "Nov 25", "Dec 25", "Jan 26", "Feb 26", "Mar 26",
];

function intensityTier(v: number): 0 | 1 | 2 | 3 | 4 {
  if (v >= 80) return 4;
  if (v >= 60) return 3;
  if (v >= 40) return 2;
  if (v >= 20) return 1;
  return 0;
}

const TIER_CLASS: Record<number, string> = {
  0: "bg-heat-0",
  1: "bg-heat-1",
  2: "bg-heat-2",
  3: "bg-heat-3",
  4: "bg-heat-4",
};

function deploymentAmount(v: number, seed: number): string {
  const base = Math.round(((v / 100) * 800 + (seed % 200)) / 10) * 10;
  return `$${base}M`;
}

function SectorHeatmapCard({ sector, timeRange }: { sector: string | undefined; timeRange: TimeRange }) {
  const cells = useMemo(() => {
    const seed = (sector || "default").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
    const mult = timeMultiplier(timeRange);
    return Array.from({ length: 18 }, (_, i) => {
      const v = ((seed * (i + 7) * 31) % 100);
      const recencyBoost = i >= 12 ? 20 : i >= 9 ? 10 : 0;
      return Math.min(Math.round((v + recencyBoost) * mult), 100);
    });
  }, [sector, timeRange]);

  const seed = useMemo(() => (sector || "default").split("").reduce((a, c) => a + c.charCodeAt(0), 0), [sector]);

  const recentAvg = cells.slice(12).reduce((a, b) => a + b, 0) / 6;
  const olderAvg = cells.slice(0, 6).reduce((a, b) => a + b, 0) / 6;
  const trendPct = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;
  const momentum = recentAvg >= 60
    ? { label: "🔥 Accelerating" }
    : recentAvg >= 35
    ? { label: "📈 Growing" }
    : { label: "➡️ Steady" };

  return (
    <div
      className="relative rounded-2xl p-6 overflow-hidden"
      style={{
        background: "hsl(var(--primary))",
        border: "1px solid hsl(var(--border) / 0.15)",
      }}
    >
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-primary-foreground/60">
            Sector Heat
          </span>
          <Badge variant="secondary" className="text-[9px] font-medium border-0 rounded-md px-2 py-0.5 bg-primary-foreground/10 text-primary-foreground/70">
            {momentum.label}
          </Badge>
        </div>

        <TooltipProvider delayDuration={0}>
          <div className="grid grid-cols-6 gap-[2px]">
            {cells.map((v, i) => {
              const tier = intensityTier(v);
              return (
                <Tooltip key={i}>
                  <TooltipTrigger asChild>
                    <div
                      className={`h-6 w-full rounded-sm cursor-default transition-all ${TIER_CLASS[tier]} hover:ring-2 hover:ring-offset-1 hover:ring-accent`}
                    />
                  </TooltipTrigger>
                  <TooltipContent
                    side="top"
                    className="bg-primary text-primary-foreground text-[11px] font-mono px-2.5 py-1.5 border-0 shadow-lg"
                  >
                    <span className="font-semibold">{MONTH_LABELS[i]}</span>
                    <span className="mx-1.5 text-primary-foreground/50">·</span>
                    <span>{deploymentAmount(v, seed)} deployed</span>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </TooltipProvider>

        <div className="flex justify-between mt-1.5">
          <span className="text-[8px] font-mono text-primary-foreground/30 uppercase tracking-widest">18 mo ago</span>
          <span className="text-[8px] font-mono text-primary-foreground/30 uppercase tracking-widest">Current</span>
        </div>

        <div className="flex items-center justify-between mt-3">
          <p className="text-[10px] text-primary-foreground/40">
            <span className="font-medium text-primary-foreground/60">{sector || "Your sector"}</span>
          </p>
          <div className="flex items-center gap-1">
            <span className="text-[7px] font-mono text-primary-foreground/30 mr-0.5">Cold</span>
            {[0, 1, 2, 3, 4].map(t => (
              <div key={t} className={`h-2.5 w-2.5 rounded-sm ${TIER_CLASS[t]}`} />
            ))}
            <span className="text-[7px] font-mono text-primary-foreground/30 ml-0.5">Hot</span>
          </div>
        </div>

        {/* Trend */}
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-primary-foreground/5">
          <span
            className="inline-flex items-center gap-1 text-xs font-semibold"
            style={{ color: trendPct >= 0 ? "hsl(var(--success))" : "hsl(var(--destructive))" }}
          >
            {trendPct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trendPct >= 0 ? "↑" : "↓"}{Math.abs(trendPct).toFixed(1)}%
          </span>
          <span className="text-[10px] text-primary-foreground/30 font-medium">vs prior 6 months</span>
        </div>
      </div>
    </div>
  );
}

// ── Main ──

export function IntelligenceCards({
  matchCount,
  animatedTotal,
  totalRaised,
  sectorClassification,
  companyData,
  formatCurrency,
  timeRange,
}: IntelligenceCardsProps) {
  const sector = sectorClassification?.primary_sector || companyData?.sector;
  const mult = timeMultiplier(timeRange);
  const adjustedMatchCount = Math.max(1, Math.round(matchCount * mult));
  const adjustedTotal = Math.round(animatedTotal * mult);
  const formattedAmount = formatCurrency(adjustedTotal);

  const timeLabel = timeRange === "week" ? "vs last week" : timeRange === "month" ? "vs last month" : timeRange === "quarter" ? "vs last quarter" : "vs last year";

  const matchTrend = timeRange === "week" ? 8.3 : timeRange === "month" ? 19.6 : timeRange === "quarter" ? 34.2 : 52.1;
  const capitalTrend = timeRange === "week" ? 4.7 : timeRange === "month" ? 12.4 : timeRange === "quarter" ? 28.9 : 45.3;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      <MetricCard
        label="Investors Matched"
        value={adjustedMatchCount.toLocaleString()}
        subtitle="Institutional matches found"
        trendValue={matchTrend}
        trendLabel={timeLabel}
        accentColor="hsl(var(--accent))"
        icon={<Sparkles className="h-3 w-3 text-success" />}
      />

      <SectorHeatmapCard sector={sector} timeRange={timeRange} />

      <MetricCard
        label="Capital Track"
        value={formattedAmount}
        subtitle="Total raised to date"
        trendValue={capitalTrend}
        trendLabel={timeLabel}
        accentColor="hsl(var(--success))"
        icon={<ArrowRight className="h-3 w-3 text-success" />}
      />
    </div>
  );
}
