import { useState } from "react";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

interface DimensionDelta {
  label: string;
  previous: number;
  current: number;
}

const MOCK_DELTAS: DimensionDelta[] = [
  { label: "Story & Flow", previous: 60, current: 72 },
  { label: "Clarity & Density", previous: 62, current: 58 },
  { label: "Market & Financials", previous: 38, current: 45 },
  { label: "Team Credibility", previous: 78, current: 81 },
  { label: "Design & Scannability", previous: 55, current: 67 },
];

const MOCK_READTIME = [
  { slide: "1", actual: 8, predicted: 6 },
  { slide: "2", actual: 14, predicted: 12 },
  { slide: "3", actual: 18, predicted: 15 },
  { slide: "4", actual: 6, predicted: 20 },
  { slide: "5", actual: 22, predicted: 16 },
  { slide: "6", actual: 20, predicted: 14 },
  { slide: "7", actual: 10, predicted: 10 },
  { slide: "8", actual: 5, predicted: 12 },
];

interface VersionComparisonProps {
  compareMode: boolean;
  onToggleCompare: (val: boolean) => void;
}

export function VersionComparison({ compareMode, onToggleCompare }: VersionComparisonProps) {
  return (
    <div className="space-y-6">
      {/* Toggle */}
      <div className="flex items-center gap-3">
        <span className={cn("text-xs font-semibold", !compareMode ? "text-foreground" : "text-muted-foreground")}>Current Version</span>
        <Switch checked={compareMode} onCheckedChange={onToggleCompare} />
        <span className={cn("text-xs font-semibold", compareMode ? "text-foreground" : "text-muted-foreground")}>Compare to Previous</span>
      </div>

      {compareMode && (
        <div className="space-y-6">
          {/* Delta Table */}
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h4 className="text-xs font-semibold text-foreground">Score Delta — v2 vs v1</h4>
            </div>
            <div className="divide-y divide-border">
              {MOCK_DELTAS.map((d) => {
                const delta = d.current - d.previous;
                return (
                  <div key={d.label} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-xs font-medium text-foreground">{d.label}</span>
                    <div className="flex items-center gap-4">
                      <span className="text-[10px] font-mono text-muted-foreground tabular-nums">{d.previous}</span>
                      <span className="text-muted-foreground/40">→</span>
                      <span className="text-[10px] font-mono text-foreground tabular-nums">{d.current}</span>
                      <span className={cn(
                        "flex items-center gap-0.5 text-[10px] font-bold tabular-nums",
                        delta > 0 ? "text-success" : delta < 0 ? "text-destructive" : "text-muted-foreground"
                      )}>
                        {delta > 0 ? <ArrowUp className="h-3 w-3" /> : delta < 0 ? <ArrowDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                        {delta > 0 ? "+" : ""}{delta}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Read-Time Analytics */}
          <div className="rounded-xl border border-border bg-card p-5 space-y-4">
            <div>
              <h4 className="text-xs font-semibold text-foreground">Read-Time Analytics</h4>
              <p className="text-[10px] text-muted-foreground mt-0.5">Actual investor read time vs. AI predicted optimal time (seconds per slide)</p>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={MOCK_READTIME} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="slide" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} unit="s" />
                  <Tooltip
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }}
                    labelFormatter={(v) => `Slide ${v}`}
                  />
                  <Line type="monotone" dataKey="predicted" stroke="hsl(var(--accent))" strokeWidth={2} dot={false} strokeDasharray="4 4" name="Predicted" />
                  <Line type="monotone" dataKey="actual" stroke="hsl(var(--destructive))" strokeWidth={2} dot={{ r: 3, fill: "hsl(var(--destructive))" }} name="Actual" />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-1.5">
                <div className="h-0.5 w-4 bg-accent rounded" />
                <span className="text-[10px] text-muted-foreground">Predicted</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-0.5 w-4 bg-destructive rounded" />
                <span className="text-[10px] text-muted-foreground">Actual</span>
              </div>
              <span className="text-[10px] text-muted-foreground/60 ml-auto">⚠ Slide 4 & 8: likely drop-off points</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
