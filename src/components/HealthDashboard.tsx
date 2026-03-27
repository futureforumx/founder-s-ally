import { useState, useMemo } from "react";
import { HealthGauge } from "./HealthGauge";
import { TrendingUp, TrendingDown, Minus, Pencil, Check, X, Shield, ShieldAlert, ShieldQuestion } from "lucide-react";
import type { AnalysisResult, ConfidenceLevel, MetricWithConfidence } from "./CompanyProfile";

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

const confidenceConfig: Record<ConfidenceLevel, { icon: typeof Shield; color: string; bg: string; label: string }> = {
  high: { icon: Shield, color: "text-success", bg: "bg-success/10", label: "High" },
  medium: { icon: ShieldAlert, color: "text-amber-500", bg: "bg-amber-500/10", label: "Med" },
  low: { icon: ShieldQuestion, color: "text-destructive", bg: "bg-destructive/10", label: "Low" },
};

interface MetricCardProps {
  label: string;
  metricData: MetricWithConfidence;
  change: string;
  trend: string;
  onEdit: (newValue: string) => void;
}

function MetricCard({ label, metricData, change, trend, onEdit }: MetricCardProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(metricData.value || "—");
  const conf = confidenceConfig[metricData.confidence] || confidenceConfig.low;
  const ConfIcon = conf.icon;

  const save = () => {
    onEdit(editValue);
    setEditing(false);
  };

  return (
    <div className="rounded-lg bg-muted/40 px-3 py-3 relative group">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-mono ${conf.bg} ${conf.color}`}>
          <ConfIcon className="h-2.5 w-2.5" />
          {conf.label}
        </span>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        {editing ? (
          <div className="flex items-center gap-1">
            <input
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-24 rounded border border-input bg-background px-1.5 py-0.5 text-sm font-semibold text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
            <button onClick={save} className="text-success hover:text-success/80"><Check className="h-3.5 w-3.5" /></button>
            <button onClick={() => setEditing(false)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
          </div>
        ) : (
          <>
            <span className="text-lg font-semibold tracking-tight text-foreground">{metricData.value || "—"}</span>
            {metricData.confidence === "low" && (
              <button
                onClick={() => { setEditValue(metricData.value || ""); setEditing(true); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                title="Edit value"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
          </>
        )}
        {!editing && (
          <span className={`flex items-center gap-0.5 text-[11px] font-mono font-medium ${
            trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground"
          }`}>
            {trend === "up" ? <TrendingUp className="h-3 w-3" /> : trend === "down" ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
            {change}
          </span>
        )}
      </div>
    </div>
  );
}

const defaultMetrics: { label: string; key: keyof AnalysisResult["metrics"]; change: string; trend: string }[] = [
  { label: "MRR", key: "mrr", change: "+12%", trend: "up" },
  { label: "Burn Rate", key: "burnRate", change: "+5%", trend: "up" },
  { label: "Runway", key: "runway", change: "-2 mo", trend: "down" },
  { label: "CAC", key: "cac", change: "0%", trend: "flat" },
  { label: "LTV", key: "ltv", change: "+8%", trend: "up" },
];

type BenchmarkMode = "market" | "community";

interface HealthDashboardProps {
  stage?: string;
  sector?: string;
  analysisResult?: AnalysisResult | null;
  onMetricEdit?: (key: string, value: string) => void;
}

export function HealthDashboard({ stage, sector, analysisResult, onMetricEdit }: HealthDashboardProps) {
  const [mode, setMode] = useState<BenchmarkMode>("market");

  const healthData = useMemo(() => buildHealthData(mode, stage, sector), [mode, stage, sector]);

  const overallScore = analysisResult?.healthScore ?? null;
  const contextLabel = stage && sector ? `${stage} · ${sector}` : stage || sector || null;

  return (
    <div className="space-y-6">
      {overallScore !== null && (
        <div className="surface-card p-6 space-y-5">
          <div className="flex items-start justify-between">
            <h2 className="text-sm font-normal tracking-tight text-foreground">Health Score</h2>
            <button className="text-muted-foreground hover:text-foreground transition-colors">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
            </button>
          </div>

          <div className="flex items-start justify-between gap-6">
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold tracking-tight text-foreground">{overallScore}%</span>
              <div className="flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5 text-success" />
                <span className="text-sm font-medium text-success">+8%</span>
              </div>
            </div>
            <div className="text-right">
              <span className="text-xs text-muted-foreground">{Math.round((overallScore / 100) * 100)}% to target</span>
            </div>
          </div>

          {/* Progress bar with segments */}
          <div className="flex gap-1">
            {Array.from({ length: 25 }).map((_, i) => {
              const segmentFilled = (i / 25) * 100 < overallScore;
              return (
                <div
                  key={i}
                  className={`flex-1 h-2 rounded-xs transition-colors ${
                    segmentFilled ? "bg-blue-500/80" : "bg-muted/40"
                  }`}
                />
              );
            })}
          </div>

          {analysisResult?.executiveSummary && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {analysisResult.executiveSummary}
            </p>
          )}
        </div>
      )}

      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Company Health</h2>
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
            Network
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {healthData.map((gauge) => <HealthGauge key={gauge.label} {...gauge} />)}
      </div>

      <div className="surface-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold tracking-tight text-foreground">Key Metrics</h3>
          <div className="flex items-center gap-3 text-[10px] font-mono text-muted-foreground">
            <span className="text-[9px] font-light tracking-widest uppercase text-muted-foreground/60 mr-1">CONFIDENCE</span>
            <span className="flex items-center gap-1"><Shield className="h-3 w-3 text-success" /> High</span>
            <span className="flex items-center gap-1"><ShieldAlert className="h-3 w-3 text-amber-500" /> Medium</span>
            <span className="flex items-center gap-1"><ShieldQuestion className="h-3 w-3 text-destructive" /> Low (editable)</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {defaultMetrics.map((m) => {
            const metricData: MetricWithConfidence = analysisResult?.metrics?.[m.key] ?? { value: null, confidence: "medium" };
            return (
              <MetricCard
                key={m.label}
                label={m.label}
                metricData={metricData}
                change={m.change}
                trend={m.trend}
                onEdit={(val) => onMetricEdit?.(m.key, val)}
              />
            );
          })}
        </div>
      </div>

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

      {/* Agent Mode Results */}
      {analysisResult?.agentData && (
        <div className="surface-card p-5">
          <h3 className="text-sm font-semibold tracking-tight text-foreground mb-3 flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-md bg-accent/10">
              <Shield className="h-3 w-3 text-accent" />
            </span>
            Agent Verified Data
          </h3>
          <div className="grid grid-cols-3 gap-3">
            {analysisResult.agentData.teamSize && (
              <div className="rounded-lg bg-muted/40 px-3 py-3">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Team Size</span>
                <p className="text-sm font-semibold text-foreground mt-1">{analysisResult.agentData.teamSize}</p>
              </div>
            )}
            {analysisResult.agentData.lastFunding && (
              <div className="rounded-lg bg-muted/40 px-3 py-3">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Latest Round</span>
                <p className="text-sm font-semibold text-foreground mt-1">{analysisResult.agentData.lastFunding}</p>
              </div>
            )}
            {analysisResult.agentData.fundingAmount && (
              <div className="rounded-lg bg-muted/40 px-3 py-3">
                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Amount Raised</span>
                <p className="text-sm font-semibold text-foreground mt-1">{analysisResult.agentData.fundingAmount}</p>
              </div>
            )}
          </div>
          {analysisResult.agentData.sources.length > 0 && (
            <p className="text-[10px] text-muted-foreground mt-3 font-mono">
              Sources: {analysisResult.agentData.sources.join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
