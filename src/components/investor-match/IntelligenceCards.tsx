import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Link2, Sparkles } from "lucide-react";
import { SectorClassification } from "@/components/SectorTags";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { CompanyData } from "@/components/CompanyProfile";
import { TimeRange, timeMultiplier } from "./TimeRangeControl";

interface IntelligenceCardsProps {
  matchCount: number;
  animatedTotal: number;
  totalRaised: number;
  sectorClassification?: SectorClassification | null;
  companyData?: CompanyData | null;
  formatCurrency: (n: number) => string;
  timeRange: TimeRange;
  selectedHeatCell: number | null;
  onHeatCellSelect: (index: number | null) => void;
}

// ── Shared card wrapper ──

function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative rounded-[24px] p-8 backdrop-blur-xl ${className}`}
      style={{
        background: "hsla(0, 0%, 100%, 0.70)",
        border: "1px solid hsla(var(--border), 0.5)",
        borderTop: "1px solid hsla(0, 0%, 100%, 0.8)",
        boxShadow: "0 20px 50px hsla(var(--accent), 0.05)",
      }}
    >
      {children}
    </div>
  );
}

// ── Odometer Digit ──

function OdometerDigit({ digit }: { digit: string }) {
  return (
    <span className="inline-block overflow-hidden h-[1.2em] relative">
      <span
        className="inline-block transition-transform duration-700 ease-out"
        style={{ transform: `translateY(-${(parseInt(digit) || 0) * 10}%)` }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
          <span key={n} className="block h-[1.2em] leading-[1.2em]">{n}</span>
        ))}
      </span>
    </span>
  );
}

function OdometerNumber({ value }: { value: number }) {
  const digits = String(value).split("");
  return (
    <span className="inline-flex font-mono text-5xl font-extrabold text-foreground tracking-tight">
      {digits.map((d, i) => (
        <OdometerDigit key={`${i}-${d}`} digit={d} />
      ))}
    </span>
  );
}

// ── Radar Pulse ──

function RadarPulse() {
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden rounded-[24px]">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="absolute rounded-full border border-accent/10 animate-ping"
          style={{
            width: `${100 + i * 80}px`,
            height: `${100 + i * 80}px`,
            animationDelay: `${i * 0.6}s`,
            animationDuration: "2.4s",
            opacity: 0.15 - i * 0.04,
          }}
        />
      ))}
    </div>
  );
}

// ── Sector Heatmap (Interactive) ──

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

function deploymentAmount(v: number, seed: number, _i: number): string {
  const base = Math.round(((v / 100) * 800 + (seed % 200)) / 10) * 10;
  return `$${base}M`;
}

interface SectorHeatmapProps {
  sector: string | undefined;
  timeRange: TimeRange;
  selectedCell: number | null;
  onCellSelect: (index: number | null) => void;
}

function SectorHeatmap({ sector, timeRange, selectedCell, onCellSelect }: SectorHeatmapProps) {
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
  const momentum = recentAvg >= 60
    ? { label: "🔥 Accelerating", gradient: true }
    : recentAvg >= 35
    ? { label: "📈 Growing", gradient: false }
    : { label: "➡️ Steady", gradient: false };

  return (
    <TooltipProvider delayDuration={0}>
      <div>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.15em]">
            Sector Heat
          </p>
          <div className="flex items-center gap-2">
            {momentum.gradient ? (
              <span
                className="text-[10px] font-semibold text-white px-3 py-1 rounded-md"
                style={{ background: "linear-gradient(135deg, hsl(25 95% 53%), hsl(0 84% 60%))" }}
              >
                {momentum.label}
              </span>
            ) : (
              <Badge variant="secondary" className="text-[10px] font-medium border-0 rounded-md px-3 py-1">
                {momentum.label}
              </Badge>
            )}
          </div>
        </div>

        {/* Dense grid */}
        <div className="grid grid-cols-6 gap-[2px]">
          {cells.map((v, i) => {
            const tier = intensityTier(v);
            return (
              <Tooltip key={i}>
                <TooltipTrigger asChild>
                  <div
                    className={`h-7 w-full rounded-sm cursor-default transition-all ${TIER_CLASS[tier]} hover:ring-2 hover:ring-offset-1 hover:ring-accent`}
                  />
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="bg-primary text-primary-foreground text-[11px] font-mono px-2.5 py-1.5 border-0 shadow-lg"
                >
                  <span className="font-semibold">{MONTH_LABELS[i]}</span>
                  <span className="mx-1.5 text-primary-foreground/50">·</span>
                  <span>{deploymentAmount(v, seed, i)} deployed</span>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>

        {/* X-axis */}
        <div className="flex justify-between mt-1.5">
          <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">18 mo ago</span>
          <span className="text-[9px] font-mono text-muted-foreground uppercase tracking-widest">Current</span>
        </div>

        {/* Footer with legend */}
        <div className="flex items-center justify-between mt-3">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Capital deployment in{" "}
            <span className="font-medium text-foreground">{sector || "your sector"}</span>
          </p>
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-mono text-muted-foreground mr-1">Cold</span>
            {[0, 1, 2, 3, 4].map(t => (
              <div key={t} className={`h-3 w-3 rounded-sm ${TIER_CLASS[t]}`} />
            ))}
            <span className="text-[8px] font-mono text-muted-foreground ml-1">Hot</span>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

// ── Glow Progress Bar ──

function GlowProgress({ value }: { value: number }) {
  return (
    <div className="relative w-full h-2 rounded-full bg-secondary overflow-hidden">
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
        style={{
          width: `${value}%`,
          background: "linear-gradient(90deg, hsl(var(--success)), hsl(var(--accent)))",
        }}
      >
        <span
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 h-3.5 w-3.5 rounded-full animate-pulse"
          style={{
            background: "hsl(0 0% 100%)",
            boxShadow: "0 0 8px 3px hsla(var(--accent), 0.5), 0 0 16px 6px hsla(var(--accent), 0.2)",
          }}
        />
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
  selectedHeatCell,
  onHeatCellSelect,
}: IntelligenceCardsProps) {
  const sector = sectorClassification?.primary_sector || companyData?.sector;
  const roundTarget = totalRaised > 0 ? Math.max(totalRaised * 2, 1_000_000) : 1_000_000;
  const roundProgress = totalRaised > 0 ? Math.min((totalRaised / roundTarget) * 100, 100) : 0;

  // Time-adjusted values
  const mult = timeMultiplier(timeRange);
  const adjustedMatchCount = Math.max(1, Math.round(matchCount * mult));
  const adjustedTotal = Math.round(animatedTotal * mult);

  const formattedAmount = formatCurrency(adjustedTotal);
  const match = formattedAmount.match(/^(\$[\d,.]+)(\.?\d*)([A-Za-z]*)$/);
  const numPart = match ? match[1] + match[2] : formattedAmount;
  const suffix = match ? match[3] : "";

  const newToday = timeRange === "week" ? 1 : timeRange === "month" ? 3 : timeRange === "quarter" ? 7 : 12;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
      {/* Card 1: The Pulse */}
      <GlassCard>
        <RadarPulse />
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.15em]">
              Investors Matched
            </p>
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-accent-foreground bg-foreground px-3 py-1 rounded-full">
              <Sparkles className="h-2.5 w-2.5 text-accent" />
              +{newToday} New Today
            </span>
          </div>
          <OdometerNumber value={adjustedMatchCount} />
          <p className="text-xs text-muted-foreground mt-3">
            Institutional matches found.
          </p>
        </div>
      </GlassCard>

      {/* Card 2: Sector Momentum */}
      <GlassCard>
        <SectorHeatmap
          sector={sector}
          timeRange={timeRange}
          selectedCell={selectedHeatCell}
          onCellSelect={onHeatCellSelect}
        />
      </GlassCard>

      {/* Card 3: Capital Track */}
      <GlassCard>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-[0.15em]">
            Capital Track
          </p>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-success border border-success/20 px-2.5 py-0.5 rounded-full">
            <Link2 className="h-3 w-3" />
            Profile Synced
          </span>
        </div>
        <p className="text-5xl font-extrabold text-foreground tracking-tight font-mono">
          {numPart}
          {suffix && (
            <span className="text-[0.8em] font-light text-muted-foreground">{suffix}</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-1.5 mb-5">
          Total raised to date
        </p>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Round progress</span>
            <span className="font-medium text-foreground">{Math.round(roundProgress)}%</span>
          </div>
          <GlowProgress value={roundProgress} />
        </div>
      </GlassCard>
    </div>
  );
}
