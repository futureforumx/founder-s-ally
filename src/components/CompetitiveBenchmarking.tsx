import { TrendingUp, TrendingDown, Minus, AlertTriangle, CheckCircle2, XCircle, Shield, ShieldAlert, ShieldQuestion } from "lucide-react";
import type { ConfidenceLevel } from "./CompanyProfile";

interface MetricRow {
  metric: string;
  value: string;
  benchmark: string;
  status: "healthy" | "warning" | "critical";
  confidence?: ConfidenceLevel;
}

// 2026 SaaS benchmarks
const saas2026Benchmarks: MetricRow[] = [
  { metric: "Net Revenue Retention (NRR)", value: "—", benchmark: "≥ 110%", status: "warning" },
  { metric: "Gross Margin", value: "—", benchmark: "≥ 75%", status: "warning" },
  { metric: "CAC Payback (months)", value: "—", benchmark: "≤ 12 mo", status: "warning" },
  { metric: "LTV / CAC Ratio", value: "—", benchmark: "≥ 3.0x", status: "warning" },
  { metric: "Rule of 40", value: "—", benchmark: "≥ 40%", status: "warning" },
  { metric: "Burn Multiple", value: "—", benchmark: "≤ 2.0x", status: "warning" },
  { metric: "Magic Number", value: "—", benchmark: "≥ 0.75", status: "warning" },
  { metric: "Logo Retention", value: "—", benchmark: "≥ 90%", status: "warning" },
];

const statusConfig = {
  healthy: { icon: CheckCircle2, color: "text-success", bg: "bg-success/10", label: "On Track" },
  warning: { icon: AlertTriangle, color: "text-amber-500", bg: "bg-amber-500/10", label: "Monitor" },
  critical: { icon: XCircle, color: "text-destructive", bg: "bg-destructive/10", label: "At Risk" },
};

interface CompetitiveBenchmarkingProps {
  metricTable?: MetricRow[];
}

export function CompetitiveBenchmarking({ metricTable }: CompetitiveBenchmarkingProps) {
  // Merge AI-extracted metrics with 2026 benchmarks
  const displayMetrics = metricTable && metricTable.length > 0
    ? metricTable
    : saas2026Benchmarks;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Competitive Benchmarking</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Your extracted metrics compared against 2026 SaaS benchmarks
        </p>
      </div>

      <div className="surface-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-left text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Metric</th>
              <th className="px-4 py-3 text-left text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Your Value</th>
              <th className="px-4 py-3 text-left text-[11px] font-mono uppercase tracking-wider text-muted-foreground">2026 Target</th>
              <th className="px-4 py-3 text-right text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Status</th>
            </tr>
          </thead>
          <tbody>
            {displayMetrics.map((row, i) => {
              const cfg = statusConfig[row.status];
              const StatusIcon = cfg.icon;
              return (
                <tr key={i} className="border-b border-border/50 last:border-none hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-foreground">{row.metric}</td>
                  <td className="px-4 py-3 text-sm font-mono text-foreground">{row.value}</td>
                  <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{row.benchmark}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-mono font-medium uppercase tracking-wider ${cfg.bg} ${cfg.color}`}>
                      <StatusIcon className="h-3 w-3" />
                      {cfg.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 2026 SaaS Benchmark Reference */}
      <div className="surface-card p-5">
        <h3 className="text-sm font-semibold tracking-tight text-foreground mb-3">2026 SaaS Benchmark Targets</h3>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Target NRR", value: "≥ 110%", icon: TrendingUp },
            { label: "Gross Margin", value: "≥ 75%", icon: TrendingUp },
            { label: "CAC Payback", value: "≤ 12 mo", icon: TrendingDown },
            { label: "Rule of 40", value: "≥ 40%", icon: TrendingUp },
          ].map((b) => (
            <div key={b.label} className="rounded-lg bg-muted/40 px-3 py-3">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{b.label}</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <span className="text-lg font-semibold tracking-tight text-foreground">{b.value}</span>
                <b.icon className="h-3 w-3 text-accent" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
