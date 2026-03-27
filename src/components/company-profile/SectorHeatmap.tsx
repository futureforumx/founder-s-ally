import { TrendingUp, ArrowRight } from "lucide-react";

const SECTOR_DATA: Record<string, { momentum: number; label: string; pulse: string }> = {
  "Construction & Real Estate": {
    momentum: 70,
    label: "Growing",
    pulse: "2026 Trend: ConTech platforms digitizing $13T global construction spend; modular and sustainable building methods attracting late-seed capital.",
  },
  "Industrial & Manufacturing": {
    momentum: 74,
    label: "Strong Interest",
    pulse: "2026 Trend: Industry 4.0 robotics and warehouse automation seeing accelerated deployment; reshoring driving domestic manufacturing tech demand.",
  },
  "Enterprise Software & SaaS": {
    momentum: 60,
    label: "Stable",
    pulse: "2026 Trend: Vertical SaaS outperforming horizontal; cybersecurity and LegalTech remain resilient as compliance complexity grows.",
  },
  "Artificial Intelligence": {
    momentum: 95,
    label: "High Momentum",
    pulse: "2026 Trend: Investors shifting from foundational models to Vertical AI agents with proven unit economics and Edge AI deployments.",
  },
  "Fintech": {
    momentum: 78,
    label: "Strong Interest",
    pulse: "2026 Trend: High interest in payments infrastructure and RWA tokenization; embedded finance becoming table stakes for vertical platforms.",
  },
  "Climate & Energy": {
    momentum: 72,
    label: "Growing",
    pulse: "2026 Trend: Grid optimization and energy storage attracting record rounds; carbon capture moving from pilot to commercial scale.",
  },
  "Health & Biotech": {
    momentum: 68,
    label: "Steady Growth",
    pulse: "2026 Trend: Neurotech and longevity science gaining institutional interest; digital health consolidating around AI-first platforms.",
  },
  "Consumer & Retail": {
    momentum: 40,
    label: "Consolidating",
    pulse: "2026 Trend: Social commerce and e-commerce infrastructure plays outperform traditional D2C; AdTech rebounding with privacy-first attribution.",
  },
  "Deep Tech & Space": {
    momentum: 62,
    label: "Emerging",
    pulse: "2026 Trend: Quantum computing pilots and satcom constellations drawing sovereign wealth fund interest; photonics enabling new compute paradigms.",
  },
  "Defense & GovTech": {
    momentum: 82,
    label: "High Interest",
    pulse: "2026 Trend: Dual-use tech and autonomous drones surging with government modernization budgets; public safety platforms scaling rapidly.",
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
          className="text-[10px] font-semibold px-2 py-0.5 rounded-md whitespace-nowrap"
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
