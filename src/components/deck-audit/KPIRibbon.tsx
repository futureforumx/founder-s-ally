import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, ChevronDown } from "lucide-react";
import { motion, useSpring, useTransform, useMotionValue } from "framer-motion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DimensionBars } from "./DimensionBars";
import type { MultiAxisScores, BenchmarkInsights } from "./types";

function getScoreColor(score: number) {
  if (score >= 80) return { text: "text-emerald-500", stroke: "hsl(var(--success))", glow: "hsl(var(--success) / 0.25)", pulse: false };
  if (score >= 50) return { text: "text-amber-500", stroke: "hsl(var(--warning))", glow: "hsl(var(--warning) / 0.25)", pulse: true };
  return { text: "text-rose-600", stroke: "hsl(var(--destructive))", glow: "hsl(var(--destructive) / 0.25)", pulse: true };
}

/* ── Animated Counter ── */
function AnimatedNumber({ value, suffix = "" }: { value: number; suffix?: string }) {
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness: 80, damping: 20 });
  const display = useTransform(spring, (v) => Math.round(v));
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    motionVal.set(value);
  }, [value, motionVal]);

  useEffect(() => {
    const unsub = display.on("change", (v) => setCurrent(v));
    return unsub;
  }, [display]);

  return <>{current}{suffix}</>;
}

/* ── Animated Progress Ring ── */
function MiniRadial({ score, size = 80 }: { score: number; size?: number }) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;
  const { text, stroke, glow, pulse } = getScoreColor(score);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const offset = mounted ? circumference - (score / 100) * circumference : circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth={strokeWidth} opacity={0.5} />
        <circle
          cx={center} cy={center} r={radius} fill="none"
          stroke={stroke} strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-[1500ms] ease-out"
          style={{ filter: `drop-shadow(0 0 6px ${glow})` }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={cn("text-2xl font-extrabold tabular-nums leading-none", text, pulse && "animate-pulse")}>
          <AnimatedNumber value={score} />
        </span>
      </div>
    </div>
  );
}

/* ── Sparkline SVG ── */
function Sparkline({ trend, color }: { trend: "up" | "down"; color: string }) {
  const upPath = "M0,40 Q15,38 30,32 T60,28 T90,18 T120,12 T150,8 T180,4 T200,2";
  const downPath = "M0,8 Q15,10 30,16 T60,22 T90,28 T120,34 T150,38 T180,42 T200,44";

  return (
    <svg
      viewBox="0 0 200 48"
      preserveAspectRatio="none"
      className="absolute bottom-0 left-0 right-0 z-0 h-12 w-full opacity-[0.15]"
    >
      <path
        d={trend === "up" ? upPath : downPath}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d={trend === "up" ? `${upPath} L200,48 L0,48 Z` : `${downPath} L200,48 L0,48 Z`}
        fill={color}
        opacity="0.15"
      />
    </svg>
  );
}

/* ── Card Shell ── */
function KPICard({ children, className, delay = 0, ...props }: React.HTMLAttributes<HTMLDivElement> & { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        "rounded-2xl border border-border/60 bg-card/50 backdrop-blur-sm p-5 relative overflow-hidden",
        "transition-all duration-300 ease-out",
        "hover:-translate-y-1 hover:shadow-xl hover:shadow-muted/50 hover:border-border hover:bg-card",
        className
      )}
      {...(props as any)}
    >
      {children}
    </motion.div>
  );
}

/* ── Ribbon Props ── */
interface KPIRibbonProps {
  scores: MultiAxisScores;
  benchmark: BenchmarkInsights;
}

export function KPIRibbon({ scores, benchmark }: KPIRibbonProps) {
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);
  const readiness = scores.readiness_score;
  const percentile = benchmark.percentile;

  const sectorRank = Math.max(10, percentile - 20);
  const communityRank = Math.min(95, percentile + 15);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-0">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 w-full relative">
          {/* Card 1: Investor Readiness */}
          <Tooltip>
            <TooltipTrigger asChild>
              <KPICard
                delay={0}
                onClick={() => setIsBreakdownOpen((v) => !v)}
                className={cn(
                  "cursor-pointer group",
                  isBreakdownOpen && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                )}
              >
                <p className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground mb-3">
                  Investor Readiness
                </p>
                <div className="flex items-center justify-between relative z-10">
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
          <KPICard delay={0.08}>
            <p className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground mb-3">
              Global Percentile
            </p>
            <div className="flex items-baseline gap-1.5 relative z-10">
              <span className="text-4xl font-extrabold tracking-tight text-foreground tabular-nums">
                Top <AnimatedNumber value={100 - percentile} suffix="%" />
              </span>
            </div>
            <p className="text-xs text-muted-foreground font-medium mt-1.5 relative z-10">Based on all funded decks</p>
          </KPICard>

          {/* Card 3: Sector Rank */}
          <KPICard delay={0.16}>
            <Sparkline trend="down" color="hsl(var(--destructive))" />
            <p className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground mb-3 relative z-10">
              Sector Rank
            </p>
            <div className="flex items-center gap-2 relative z-10">
              <span className="text-4xl font-extrabold tracking-tight text-foreground tabular-nums">
                {sectorRank > 50
                  ? <>Bottom <AnimatedNumber value={100 - sectorRank} suffix="%" /></>
                  : <>Top <AnimatedNumber value={sectorRank} suffix="%" /></>
                }
              </span>
              <TrendingDown className="h-4 w-4 text-destructive" />
            </div>
            <p className="text-xs text-muted-foreground font-medium mt-1.5 relative z-10">vs. 452 B2B SaaS decks</p>
          </KPICard>

          {/* Card 4: Community Rank */}
          <KPICard delay={0.24}>
            <Sparkline trend="up" color="hsl(var(--success))" />
            <p className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground mb-3 relative z-10">
              Community Rank
            </p>
            <div className="flex items-center gap-2 relative z-10">
              <span className="text-4xl font-extrabold tracking-tight text-foreground tabular-nums">
                Top <AnimatedNumber value={100 - communityRank} suffix="%" />
              </span>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="text-xs text-muted-foreground font-medium mt-1.5 relative z-10">vs. active Outbuild founders</p>
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
              <h4 className="text-[10px] font-medium tracking-[0.2em] uppercase text-muted-foreground">Dimension Breakdown</h4>
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
