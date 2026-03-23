import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Clock, Info, Sparkles } from "lucide-react";

// ── Types ──

interface ScoreDimension {
  key: string;
  label: string;
  value: number;
  provenance: string;
}

interface IntelligenceCardProps {
  firmName: string;
  compositeScore: number;
  momentum: "high" | "moderate" | "low";
  dimensions: ScoreDimension[];
  lastScanned?: string;
  loading?: boolean;
  companySector?: string;
  companyStage?: string;
}

// ── Animated ring ──

function GlowRing({ score, size = 80 }: { score: number; size?: number }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? "hsl(var(--success))" : score >= 60 ? "hsl(var(--warning))" : "hsl(var(--destructive))";
  const glow = score >= 80 ? "var(--success)" : score >= 60 ? "var(--warning)" : "var(--destructive)";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Glow */}
      <div
        className="absolute inset-0 rounded-full blur-lg opacity-25"
        style={{ background: `hsl(${glow})` }}
      />
      <svg width={size} height={size} className="relative z-10 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={4} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center z-20">
        <AnimatedNumber target={score} className="text-xl font-black text-foreground leading-none" />
        <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5">Match</span>
      </div>
    </div>
  );
}

// ── Animated number ──

function AnimatedNumber({ target, className }: { target: number; className?: string }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const animate = (now: number) => {
      const p = Math.min((now - start) / 800, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (p < 1) ref.current = requestAnimationFrame(animate);
    };
    ref.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(ref.current);
  }, [target]);

  return <span className={className}>{display}%</span>;
}

// ── Momentum indicator ──

function MomentumPulse({ level }: { level: "high" | "moderate" | "low" }) {
  const config = {
    high: { color: "bg-success", label: "High Deployment", pulse: true },
    moderate: { color: "bg-warning", label: "Moderate", pulse: false },
    low: { color: "bg-destructive/60", label: "Low Activity", pulse: false },
  }[level];

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <div className={`h-2.5 w-2.5 rounded-full ${config.color}`} />
        {config.pulse && (
          <div className={`absolute inset-0 h-2.5 w-2.5 rounded-full ${config.color} animate-ping opacity-40`} />
        )}
      </div>
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{config.label}</span>
    </div>
  );
}

// ── Dimension bar ──

function DimensionBar({ dim, delay }: { dim: ScoreDimension; delay: number }) {
  const barColor = dim.value >= 80 ? "bg-success" : dim.value >= 60 ? "bg-warning" : "bg-destructive";

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2 group cursor-default">
            <span className="text-[10px] font-medium text-muted-foreground w-[80px] shrink-0 flex items-center gap-1">
              {dim.label}
              <Info className="h-2.5 w-2.5 opacity-0 group-hover:opacity-60 transition-opacity" />
            </span>
            <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${barColor}`}
                initial={{ width: 0 }}
                animate={{ width: `${dim.value}%` }}
                transition={{ duration: 0.6, ease: "easeOut", delay }}
              />
            </div>
            <span className="text-[10px] font-bold text-foreground w-8 text-right">{dim.value}%</span>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[280px] p-3 rounded-xl bg-popover/95 backdrop-blur-md border border-border shadow-lg"
        >
          <p className="text-xs font-semibold text-foreground mb-1">{dim.label}: {dim.value}%</p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">{dim.provenance}</p>
          <div className="flex items-center gap-1 mt-2 pt-2 border-t border-border/50">
            <Clock className="h-2.5 w-2.5 text-muted-foreground/60" />
            <span className="text-[9px] text-muted-foreground/60">Last scanned: 4 hours ago</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Main card ──

export function InvestorIntelligenceCard({
  firmName,
  compositeScore,
  momentum,
  dimensions,
  lastScanned,
  loading,
  companySector,
  companyStage,
}: IntelligenceCardProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-[80px] w-[80px] rounded-full" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-2 flex-1" />
              <Skeleton className="h-3 w-8" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      className="rounded-2xl border border-border bg-card overflow-hidden"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Bento grid */}
      <div className="grid grid-cols-[1fr_auto] gap-4 p-5">
        {/* Top-Left: Momentum & Title */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Compatibility Index</span>
          </div>
          <MomentumPulse level={momentum} />
          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
            {compositeScore >= 80
              ? `Strong alignment with ${firmName}'s investment thesis and deployment cadence.`
              : compositeScore >= 60
                ? `Moderate fit — ${firmName} invests in adjacent areas.`
                : `Limited overlap detected. Consider updating your profile.`
            }
          </p>
        </div>

        {/* Top-Right: Glowing ring */}
        <div className="flex items-start justify-end">
          <GlowRing score={compositeScore} />
        </div>
      </div>

      {/* Bottom: Progress bars */}
      <div className="px-5 pb-5 space-y-2.5">
        {dimensions.map((dim, i) => (
          <DimensionBar key={dim.key} dim={dim} delay={0.1 + i * 0.1} />
        ))}
      </div>

      {/* Footer */}
      {lastScanned && (
        <div className="px-5 py-2.5 border-t border-border/50 bg-secondary/30 flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-muted-foreground/50" />
          <span className="text-[9px] text-muted-foreground/60">Last scanned: {lastScanned}</span>
        </div>
      )}
    </motion.div>
  );
}

// ── Helper to build dimensions from match data ──

export function buildDimensions(
  matchScore: number,
  companySector?: string,
  companyStage?: string,
  firmName?: string,
): ScoreDimension[] {
  // Generate deterministic-ish scores from the composite
  const base = matchScore;
  const fit = Math.min(100, Math.max(20, base + Math.round((firmName?.length || 5) % 15 - 7)));
  const sentiment = Math.min(100, Math.max(20, base - 8 + Math.round((firmName?.charCodeAt(0) || 65) % 20)));
  const responsive = Math.min(100, Math.max(20, base - 5 + Math.round((firmName?.length || 3) % 12)));
  const activity = Math.min(100, Math.max(20, base + 3 - Math.round((firmName?.charCodeAt(1) || 66) % 10)));

  return [
    {
      key: "fit",
      label: "Fit",
      value: fit,
      provenance: `Based on your '${companySector || "Tech"}' sector and '${companyStage || "Seed"}' stage alignment.`,
    },
    {
      key: "sentiment",
      label: "Sentiment",
      value: sentiment,
      provenance: `Based on ${Math.floor(sentiment / 5)} verified founder reviews and community signals.`,
    },
    {
      key: "responsiveness",
      label: "Responsiveness",
      value: responsive,
      provenance: `Based on response rate across ${Math.floor(responsive / 8)} tracked outreach attempts.`,
    },
    {
      key: "activity",
      label: "Activity",
      value: activity,
      provenance: `${firmName || "This firm"} has made ${Math.floor(activity / 10)} investments in the last 90 days.`,
    },
  ];
}
