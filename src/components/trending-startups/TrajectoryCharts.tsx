import { useState } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TrendingStartupRow } from "@/lib/trendingStartups/types";
import { cn } from "@/lib/utils";

const WINDOWS = [
  { id: "7d" as const, label: "7d" },
  { id: "30d" as const, label: "30d" },
  { id: "90d" as const, label: "90d" },
];

export function TrajectoryCharts({ row, className }: { row: TrendingStartupRow; className?: string }) {
  const [windowId, setWindowId] = useState<(typeof WINDOWS)[number]["id"]>("7d");
  const values = windowId === "7d" ? row.velocity7d : windowId === "30d" ? row.velocity30d : row.velocity90d;
  const data = values.map((value, i) => ({ i: i + 1, value }));

  return (
    <section className={cn("rounded-2xl border border-border bg-card p-5 shadow-sm", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Trajectory</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">Interactive velocity windows for the same composite series.</p>
        </div>
        <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5">
          {WINDOWS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setWindowId(item.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                windowId === item.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 h-52">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <XAxis dataKey="i" hide />
            <YAxis hide domain={["dataMin - 4", "dataMax + 4"]} />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: 12,
                fontSize: 12,
              }}
              labelFormatter={(label) => `Point ${label}`}
            />
            <Area type="monotone" dataKey="value" stroke="hsl(var(--success))" fill="hsl(var(--success))" fillOpacity={0.18} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
