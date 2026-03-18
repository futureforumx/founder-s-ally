import { TrendingUp, ArrowRight } from "lucide-react";

const SECTOR_DATA: Record<string, { momentum: number; label: string; pulse: string }> = {
  "Artificial Intelligence": {
    momentum: 95,
    label: "High Momentum",
    pulse: "2026 Trend: Investors are shifting focus from foundational models to Vertical AI agents with proven unit economics.",
  },
  "Fintech": {
    momentum: 78,
    label: "Strong Interest",
    pulse: "2026 Trend: High interest in cross-border payment infrastructure and RWA (Real World Asset) tokenization.",
  },
  "Climate & Energy": {
    momentum: 72,
    label: "Growing",
    pulse: "2026 Trend: Carbon credit markets and grid-scale battery storage are attracting record Series A rounds.",
  },
  "Health & Biotech": {
    momentum: 68,
    label: "Steady Growth",
    pulse: "2026 Trend: GLP-1 adjacencies and AI-driven drug discovery platforms dominate new fund mandates.",
  },
  "Enterprise Software": {
    momentum: 55,
    label: "Stable",
    pulse: "2026 Trend: Cybersecurity and DevTools remain resilient; HRTech facing valuation compression.",
  },
  "Deep Tech & Space": {
    momentum: 62,
    label: "Emerging",
    pulse: "2026 Trend: Quantum computing pilots and satellite constellations drawing sovereign wealth fund interest.",
  },
  "Consumer & Retail": {
    momentum: 40,
    label: "Consolidating",
    pulse: "2026 Trend: Social commerce and creator-economy plays outperform traditional D2C models.",
  },
};

function momentumColor(pct: number): string {
  // Light blue (stable) → Deep purple (high momentum)
  if (pct >= 85) return "hsl(270 60% 50%)";
  if (pct >= 70) return "hsl(260 50% 55%)";
  if (pct >= 55) return "hsl(240 45% 58%)";
  if (pct >= 40) return "hsl(220 55% 60%)";
  return "hsl(200 60% 65%)";
}

function barBg(pct: number): string {
  if (pct >= 85) return "linear-gradient(90deg, hsl(220 55% 60%), hsl(270 60% 50%))";
  if (pct >= 70) return "linear-gradient(90deg, hsl(210 55% 62%), hsl(260 50% 55%))";
  if (pct >= 55) return "linear-gradient(90deg, hsl(200 55% 65%), hsl(240 45% 58%))";
  if (pct >= 40) return "linear-gradient(90deg, hsl(195 55% 70%), hsl(220 55% 60%))";
  return "linear-gradient(90deg, hsl(195 60% 75%), hsl(200 60% 65%))";
}

interface SectorHeatmapProps {
  sector: string;
  onNavigateBenchmarks?: () => void;
}

export function SectorHeatmap({ sector, onNavigateBenchmarks }: SectorHeatmapProps) {
  const data = SECTOR_DATA[sector];
  if (!data) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            Investor Interest · {sector}
          </span>
        </div>
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{
            color: momentumColor(data.momentum),
            backgroundColor: `${momentumColor(data.momentum)}15`,
          }}
        >
          {data.label}
        </span>
      </div>

      {/* Heatmap bar */}
      <div className="relative h-2.5 w-full rounded-full bg-secondary overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${data.momentum}%`,
            background: barBg(data.momentum),
          }}
        />
      </div>
      <div className="flex items-center justify-between text-[9px] text-muted-foreground font-mono">
        <span>Stable</span>
        <span>{data.momentum}%</span>
        <span>High Momentum</span>
      </div>

      {/* Market Pulse */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {data.pulse}
      </p>

      {/* Benchmarks link */}
      {onNavigateBenchmarks && (
        <button
          onClick={onNavigateBenchmarks}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline transition-colors"
        >
          View 2026 {sector} Benchmarks
          <ArrowRight className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
