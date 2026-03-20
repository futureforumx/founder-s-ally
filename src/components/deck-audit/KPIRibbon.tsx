import { useState } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, ChevronDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DimensionBars } from "./DimensionBars";
import type { MultiAxisScores, BenchmarkInsights } from "./types";

function getScoreColor(score: number) {
  if (score >= 80) return { text: "text-emerald-500", stroke: "#10b981", pulse: false };
  if (score >= 50) return { text: "text-amber-500", stroke: "#f59e0b", pulse: true };
  return { text: "text-rose-600", stroke: "#e11d48", pulse: true };
}

interface KPIRibbonProps {
  scores: MultiAxisScores;
  benchmark: BenchmarkInsights;
}

function MiniRadial({ score, size = 80 }: { score: number; size?: number }) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const center = size / 2;
  const { text, stroke, pulse } = getScoreColor(score);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth} />
        <circle
          cx={center} cy={center} r={radius} fill="none"
          stroke={stroke} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-1000 ease-out"
          style={{ filter: `drop-shadow(0 0 4px ${stroke}40)` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("text-2xl font-extrabold tabular-nums leading-none", text, pulse && "animate-pulse")}>
          {score}
        </span>
      </div>
    </div>
  );
}

function KPICard({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-5 transition-all duration-200",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function KPIRibbon({ scores, benchmark }: KPIRibbonProps) {
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const readiness = scores.readiness_score;
  const percentile = benchmark.percentile;

  // Derive mock sector/community ranks from percentile
  const sectorRank = Math.max(10, percentile - 20);
  const communityRank = Math.min(95, percentile + 15);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-0">
        {/* 4-column KPI Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 w-full relative">
          {/* Card 1: Investor Readiness (Trigger) */}
          <Tooltip>
            <TooltipTrigger asChild>
              <KPICard
                onClick={() => setIsBreakdownOpen((v) => !v)}
                className={cn(
                  "cursor-pointer hover:shadow-md hover:border-primary/30 group",
                  isBreakdownOpen && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                )}
              >
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Investor Readiness</p>
                <div className="flex items-center justify-between">
                  <MiniRadial score={readiness} />
                  <div className="flex flex-col items-end gap-1">
                    <span className={cn("text-xs font-medium", readiness >= 80 ? "text-emerald-500" : readiness >= 50 ? "text-amber-500" : "text-rose-500")}>
                      {readiness >= 80 ? "Strong" : readiness >= 50 ? "Needs Work" : "Weak"}
                    </span>
                    <ChevronDown className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform duration-200",
                      isBreakdownOpen && "rotate-180"
                    )} />
                  </div>
                </div>
              </KPICard>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[240px]">
              <p className="text-xs font-semibold">Evaluates your overall probability of raising capital.</p>
              <p className="text-[11px] text-primary font-medium mt-1">✨ Click to view dimension breakdown</p>
            </TooltipContent>
          </Tooltip>

          {/* Card 2: Global Percentile */}
          <KPICard>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Global Percentile</p>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-foreground tabular-nums">Top {100 - percentile}%</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">Based on all funded decks</p>
          </KPICard>

          {/* Card 3: Sector Rank */}
          <KPICard>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Sector Rank</p>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-extrabold text-foreground tabular-nums">
                {sectorRank > 50 ? `Bottom ${100 - sectorRank}%` : `Top ${sectorRank}%`}
              </span>
              <TrendingDown className="h-4 w-4 text-destructive" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">vs. 452 B2B SaaS decks</p>
          </KPICard>

          {/* Card 4: Community Rank */}
          <KPICard>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Community Rank</p>
            <div className="flex items-center gap-2">
              <span className="text-3xl font-extrabold text-foreground tabular-nums">Top {100 - communityRank}%</span>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">vs. active Outbuild founders</p>
          </KPICard>
        </div>

        {/* Expanding Breakdown Tray */}
        <div
          className={cn(
            "w-full overflow-hidden transition-all duration-300 ease-out",
            isBreakdownOpen ? "max-h-[500px] opacity-100 mt-4" : "max-h-0 opacity-0 mt-0"
          )}
        >
          <div className="w-full rounded-xl border border-border bg-muted/30 p-6 shadow-inner">
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dimension Breakdown</h4>
              <button
                onClick={() => setIsBreakdownOpen(false)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Collapse
              </button>
            </div>
            <DimensionBars scores={scores.dimensions} />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
