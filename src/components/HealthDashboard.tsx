import { useState, useMemo } from "react";
import { HealthGauge } from "./HealthGauge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { AnalysisResult } from "./CompanyProfile";

const stageMultipliers: Record<string, number> = {
  "Pre-Seed": 0.8, "Seed": 0.9, "Series A": 1.0, "Series B": 1.1, "Series C+": 1.2,
};

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

function buildHealthData(mode: "market" | "community", stage?: string, sector?: string) {
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
    { label: "Market Positioning", value: baseValues.market, benchmark: benchmarks.market,
      description: mode === "market" ? `Category leadership${stage ? ` for ${stage}` : ""}${sector ? ` in ${sector}` : ""}` : `Rank vs ${prefix}peers${sector ? ` in ${sector}` : ""}`,
      status: getStatus(baseValues.market, benchmarks.market) },
    { label: "Financial Health", value: baseValues.financial, benchmark: benchmarks.financial,
      description: mode === "market" ? `Burn rate, runway, unit economics vs.${stage ? ` ${stage}` : ""} benchmarks` : `Burn & runway vs peers${stage ? ` at ${stage}` : ""}`,
      status: getStatus(baseValues.financial, benchmarks.financial) },
    { label: "GTM Strategy", value: baseValues.gtm, benchmark: benchmarks.gtm,
      description: mode === "market" ? `Channel efficiency, CAC payback${sector ? ` in ${sector}` : ""}` : `Channel mix vs founders${stage ? ` at ${stage}` : ""}`,
      status: getStatus(baseValues.gtm, benchmarks.gtm) },
    { label: "Defensibility", value: baseValues.moat, benchmark: benchmarks.moat,
      description: mode === "market" ? `Moat depth: IP, network effects${sector ? ` in ${sector}` : ""}` : `Moat strength vs peers${sector ? ` in ${sector}` : ""}`,
      status: getStatus(baseValues.moat, benchmarks.moat) },
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
  analysisResult?: AnalysisResult | null;
}

export function HealthDashboard({ stage, sector, analysisResult }: HealthDashboardProps) {
  const [mode, setMode] = useState<BenchmarkMode>("market");

  const healthData = useMemo(() => buildHealthData(mode, stage, sector), [mode, stage, sector]);

  // Override metrics if AI analysis provided real values
  const activeMetrics = useMemo(() => {
    const base = mode === "market" ? marketMetrics : communityMetrics;
    if (!analysisResult?.metrics) return base;
    const m = analysisResult.metrics;
    return base.map((item) => {
      if (item.label === "MRR" && m.mrr) return { ...item, value: m.mrr };
      if (item.label === "Burn Rate" && m.burnRate) return { ...item, value: m.burnRate };
      if (item.label === "Runway" && m.runway) return { ...item, value: m.runway };
      if (item.label === "CAC" && m.cac) return { ...item, value: m.cac };
      if (item.label === "LTV" && m.ltv) return { ...item, value: m.ltv };
      return item;
    });
  }, [mode, analysisResult]);

  // Use AI health score if available
  const overallScore = analysisResult?.healthScore ?? null;

  const contextLabel = stage && sector ? `${stage} · ${sector}` : stage || sector || null;

  return (
    <div className="space-y-6">
      {/* Overall Health Score from AI */}
      {overallScore !== null && (
        <div className="surface-card p-6 flex items-center gap-6">
          <div className="relative h-28 w-28 flex-shrink-0">
            <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
              <circle cx="50" cy="50" r="42" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
              <circle cx="50" cy="50" r="42" fill="none"
                stroke={overallScore >= 70 ? "hsl(var(--success))" : overallScore >= 40 ? "hsl(38, 92%, 50%)" : "hsl(var(--destructive))"}
                strokeWidth="8" strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 42}
                strokeDashoffset={2 * Math.PI * 42 * (1 - overallScore / 100)}
                className="transition-all duration-1000"
                style={{ animation: "gauge-fill 1.2s cubic-bezier(0.2, 0, 0, 1) forwards" }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold tracking-tight text-foreground">{overallScore}</span>
              <span className="text-[9px] font-mono text-muted-foreground uppercase">/ 100</span>
            </div>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Health Score</h2>
            <p className="text-xs text-muted-foreground mt-1">AI-generated score based on your website and pitch deck analysis</p>
            {analysisResult?.executiveSummary && (
              <p className="text-xs text-muted-foreground mt-3 leading-relaxed line-clamp-3">
                {analysisResult.executiveSummary}
              </p>
            )}
          </div>
        </div>
      )}

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
          <button onClick={() => setMode("market")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${mode === "market" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            Market
          </button>
          <button onClick={() => setMode("community")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${mode === "community" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            Community
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {healthData.map((gauge) => <HealthGauge key={gauge.label} {...gauge} />)}
      </div>

      <div className="surface-card p-5">
        <h3 className="text-sm font-semibold tracking-tight text-foreground mb-4">Key Metrics</h3>
        <div className="grid grid-cols-3 gap-4">
          {activeMetrics.map((m) => (
            <div key={m.label} className="rounded-lg bg-muted/40 px-3 py-3">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{m.label}</span>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-lg font-semibold tracking-tight text-foreground">{m.value}</span>
                <span className={`flex items-center gap-0.5 text-[11px] font-mono font-medium ${
                  m.trend === "up" ? "text-success" : m.trend === "down" ? "text-destructive" : "text-muted-foreground"
                }`}>
                  {m.trend === "up" ? <TrendingUp className="h-3 w-3" /> : m.trend === "down" ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                  {m.change}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Executive Summary */}
      {analysisResult?.executiveSummary && (
        <div className="surface-card p-5">
          <h3 className="text-sm font-semibold tracking-tight text-foreground mb-3">Executive Summary</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">{analysisResult.executiveSummary}</p>
          {analysisResult.valueProposition && (
            <div className="mt-3 rounded-lg bg-accent/5 px-3 py-2">
              <span className="text-[10px] font-mono uppercase tracking-wider text-accent">Value Proposition</span>
              <p className="text-sm text-foreground mt-1">{analysisResult.valueProposition}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
