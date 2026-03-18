import { useState } from "react";
import { HealthGauge } from "./HealthGauge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const marketHealthData = [
  {
    label: "Market Positioning",
    value: 72,
    benchmark: 65,
    description: "Category leadership & brand authority relative to competitors",
    status: "healthy" as const,
  },
  {
    label: "Financial Health",
    value: 45,
    benchmark: 70,
    description: "Burn rate, runway, unit economics vs. stage benchmarks",
    status: "critical" as const,
  },
  {
    label: "GTM Strategy",
    value: 61,
    benchmark: 60,
    description: "Channel efficiency, CAC payback, pipeline velocity",
    status: "warning" as const,
  },
  {
    label: "Defensibility",
    value: 78,
    benchmark: 55,
    description: "Moat depth: IP, network effects, switching costs, data advantages",
    status: "healthy" as const,
  },
];

const communityHealthData = [
  {
    label: "Market Positioning",
    value: 68,
    benchmark: 58,
    description: "How you rank against community peers in your sector & stage",
    status: "healthy" as const,
  },
  {
    label: "Financial Health",
    value: 52,
    benchmark: 48,
    description: "Burn rate & runway compared to peer founders on the platform",
    status: "warning" as const,
  },
  {
    label: "GTM Strategy",
    value: 55,
    benchmark: 53,
    description: "Channel mix & CAC payback vs. community founders at your stage",
    status: "warning" as const,
  },
  {
    label: "Defensibility",
    value: 82,
    benchmark: 60,
    description: "Moat strength relative to community peers in your sector",
    status: "healthy" as const,
  },
];

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

const metrics = marketMetrics;

type BenchmarkMode = "market" | "community";

export function HealthDashboard() {
  const [mode, setMode] = useState<BenchmarkMode>("market");

  const healthData = mode === "market" ? marketHealthData : communityHealthData;
  const activeMetrics = mode === "market" ? marketMetrics : communityMetrics;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Company Health</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {mode === "market"
              ? "Real-time positioning against up-to-date market data"
              : "Positioning against similar founders on the platform"}
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
          {metrics.map((m) => (
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
