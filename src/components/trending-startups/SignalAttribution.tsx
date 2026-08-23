import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { PLATFORM_WEIGHTS, type TrendingStartupRow } from "@/lib/trendingStartups/types";
import { cn } from "@/lib/utils";

const BARS: Array<{ key: keyof typeof PLATFORM_WEIGHTS; label: string; hint: string }> = [
  { key: "launch", label: "Launch platforms", hint: "30%" },
  { key: "social", label: "Social chatter", hint: "30%" },
  { key: "developer", label: "Dev / product velocity", hint: "20%" },
  { key: "traction", label: "Hiring / web growth", hint: "20%" },
];

export function SignalAttribution({ row, className }: { row: TrendingStartupRow; className?: string }) {
  const radar = BARS.map((bar) => ({
    label: bar.label,
    value: Math.max(0, row.zScores[bar.key] + 2) * 18,
    weight: PLATFORM_WEIGHTS[bar.key] * 100,
  }));

  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm", className)}>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Signal attribution</h2>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Platform weights on 24h vs 30-day relative growth — not raw mention or star volume.
      </p>
      <div className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,220px)_1fr]">
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radar} cx="50%" cy="50%" outerRadius="72%">
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="label" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }} />
              <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.28} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-3">
          {BARS.map((bar) => {
            const z = row.zScores[bar.key];
            const width = Math.min(100, Math.max(8, 50 + z * 12));
            return (
              <div key={bar.key}>
                <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
                  <span className="text-foreground">{bar.label}</span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    {bar.hint} · Δ {z.toFixed(2)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${width}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
