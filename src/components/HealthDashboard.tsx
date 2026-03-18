import { useState, useMemo } from "react";
import { HealthGauge } from "./HealthGauge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

// Stage multipliers — later stages have higher benchmarks
const stageMultipliers: Record<string, number> = {
  "Pre-Seed": 0.8,
  "Seed": 0.9,
  "Series A": 1.0,
  "Series B": 1.1,
  "Series C+": 1.2,
};

// Sector offsets — some sectors naturally score differently
const sectorOffsets: Record<string, { financial: number; gtm: number; market: number; moat: number }> = {
  "SaaS / B2B Software": { financial: 5, gtm: 3, market: 0, moat: 2 },
  "Fintech": { financial: 8, gtm: 0, market: 2, moat: 5 },
  "Health Tech": { financial: -3, gtm: -2, market: 5, moat: 8 },
  "Consumer / D2C": { financial: -5, gtm: 5, market: 3, moat: -3 },
  "AI / ML": { financial: 0, gtm: -3, market: 8, moat: 10 },
  "Climate Tech": { financial: -8, gtm: -5, market: 3, moat: 6 },
  "Marketplace": { financial: -3, gtm: 8, market: 5, moat: 3 },
  "Developer Tools": { financial: 3, gtm: -2, market: 2, moat: 7 },
  "Edtech": { financial: -5, gtm: 2, market: 0, moat: -2 },
  "Other": { financial: 0, gtm: 0, market: 0, moat: 0 },
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function buildHealthData(
  mode: "market" | "community",
  stage?: string,
  sector?: string
) {
  const mult = stageMultipliers[stage || ""] ?? 1.0;
  const offsets = sectorOffsets[sector || ""] ?? { financial: 0, gtm: 0, market: 0, moat: 0 };

  const baseBenchmarks = mode === "market"
    ? { market: 65, financial: 70, gtm: 60, moat: 55 }
    : { market: 58, financial: 48, gtm: 53, moat: 60 };

  const baseValues = mode === "market"
    ? { market: 72, financial: 45, gtm: 61, moat: 78 }
    : { market: 68, financial: 52, gtm: 55, moat: 82 };

  const benchmarks = {
    market: clamp(baseBenchmarks.market * mult + offsets.market),
    financial: clamp(baseBenchmarks.financial * mult + offsets.financial),
    gtm: clamp(baseBenchmarks.gtm * mult + offsets.gtm),
    moat: clamp(baseBenchmarks.moat * mult + offsets.moat),
  };

  const getStatus = (val: number, bench: number) => {
    if (val >= bench + 5) return "healthy" as const;
    if (val >= bench - 10) return "warning" as const;
    return "critical" as const;
  };

  const prefix = mode === "market" ? "" : "community ";

  return [
    {
      label: "Market Positioning",
      value: baseValues.market,
      benchmark: benchmarks.market,
      description: mode === "market"
        ? `Category leadership & brand authority${stage ? ` for ${stage} companies` : ""}${sector ? ` in ${sector}` : ""}`
        : `How you rank against ${prefix}peers${sector ? ` in ${sector}` : ""}${stage ? ` at ${stage} stage` : ""}`,
      status: getStatus(baseValues.market, benchmarks.market),
    },
    {
      label: "Financial Health",
      value: baseValues.financial,
      benchmark: benchmarks.financial,
      description: mode === "market"
        ? `Burn rate, runway, unit economics vs.${stage ? ` ${stage}` : ""} stage benchmarks`
        : `Burn rate & runway compared to peer founders${stage ? ` at ${stage}` : ""}`,
      status: getStatus(baseValues.financial, benchmarks.financial),
    },
    {
      label: "GTM Strategy",
      value: baseValues.gtm,
      benchmark: benchmarks.gtm,
      description: mode === "market"
        ? `Channel efficiency, CAC payback, pipeline velocity${sector ? ` in ${sector}` : ""}`
        : `Channel mix & CAC payback vs. ${prefix}founders${stage ? ` at ${stage}` : ""}`,
      status: getStatus(baseValues.gtm, benchmarks.gtm),
    },
    {
      label: "Defensibility",
      value: baseValues.moat,
      benchmark: benchmarks.moat,
      description: mode === "market"
        ? `Moat depth: IP, network effects, switching costs${sector ? ` in ${sector}` : ""}`
        : `Moat strength relative to ${prefix}peers${sector ? ` in ${sector}` : ""}`,
      status: getStatus(baseValues.moat, benchmarks.moat),
    },
  ];
}

const marketMetrics = [
  { label: "MRR", value: "$142K", change: "+12%", trend: "up" },
  { label: "Burn Rate", value: "$89K/mo", change: "+5%", trend: "up" },
  { label: "Runway", value: "14 mo", change: "-2 mo", trend: "down" },
  { label: "CAC", value: "$4,200", change: "0%", trend: "flat" },
  { label: "LTV", value: "$18,500", change: "+8%", trend: "up" },
  { label: "CAC/LTV", value: "4.4x", change: "+0.3x", trend: "up" },
];

const communityMetrics = [
  { label: "MRR", value: "$142K", change: "+18% vs peers", trend: "up" },
  { label: "Burn Rate", value: "$89K/mo", change: "-12% vs peers", trend: "up" },
  { label: "Runway", value: "14 mo", change: "+3 mo vs peers", trend: "up" },
  { label: "CAC", value: "$4,200", change: "-8% vs peers", trend: "up" },
  { label: "LTV", value: "$18,500", change: "+22% vs peers", trend: "up" },
  { label: "CAC/LTV", value: "4.4x", change: "+0.6x vs peers", trend: "up" },
];

type BenchmarkMode = "market" | "community";

interface HealthDashboardProps {
  stage?: string;
  sector?: string;
}

export function HealthDashboard({ stage, sector }: HealthDashboardProps) {
  const [mode, setMode] = useState<BenchmarkMode>("market");

  const healthData = useMemo(
    () => buildHealthData(mode, stage, sector),
    [mode, stage, sector]
  );
  const activeMetrics = mode === "market" ? marketMetrics : communityMetrics;

  const contextLabel = stage && sector
    ? `${stage} · ${sector}`
    : stage || sector || null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Company Health</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {mode === "market"
              ? `Real-time positioning against up-to-date market data${contextLabel ? ` for ${contextLabel}` : ""}`
              : `Positioning against similar founders on the platform${contextLabel ? ` (${contextLabel})` : ""}`}
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-lg bg-muted p-1">
          <button
            onClick={() => setMode("market")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              mode === "market"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Market
          </button>
          <button
            onClick={() => setMode("community")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              mode === "community"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Community
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {healthData.map((gauge) => (
          <HealthGauge key={gauge.label} {...gauge} />
        ))}
      </div>

      <div className="surface-card p-5">
        <h3 className="text-sm font-semibold tracking-tight text-foreground mb-4">Key Metrics</h3>
        <div className="grid grid-cols-3 gap-4">
          {activeMetrics.map((m) => (
            <div key={m.label} className="rounded-lg bg-muted/40 px-3 py-3">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                {m.label}
              </span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-lg font-semibold tracking-tight text-foreground">{m.value}</span>
                <span className={`flex items-center gap-0.5 text-[11px] font-mono font-medium ${
                  m.trend === "up" ? "text-success" : m.trend === "down" ? "text-destructive" : "text-muted-foreground"
                }`}>
                  {m.trend === "up" ? <TrendingUp className="h-3 w-3" /> : 
                   m.trend === "down" ? <TrendingDown className="h-3 w-3" /> : 
                   <Minus className="h-3 w-3" />}
                  {m.change}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
