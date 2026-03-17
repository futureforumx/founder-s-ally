import { HealthGauge } from "./HealthGauge";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

const healthData = [
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

const metrics = [
  { label: "MRR", value: "$142K", change: "+12%", trend: "up" },
  { label: "Burn Rate", value: "$89K/mo", change: "+5%", trend: "up" },
  { label: "Runway", value: "14 mo", change: "-2 mo", trend: "down" },
  { label: "CAC", value: "$4,200", change: "0%", trend: "flat" },
  { label: "LTV", value: "$18,500", change: "+8%", trend: "up" },
  { label: "CAC/LTV", value: "4.4x", change: "+0.3x", trend: "up" },
];

export function HealthDashboard() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Company Health</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Real-time positioning against market benchmarks</p>
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
