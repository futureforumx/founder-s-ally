import { useId, useMemo, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, ChevronDown, Minus, TrendingDown, TrendingUp } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { buildHealthTrendDataset, type HealthTimeframe } from "@/lib/healthScoreTrendModel";

const ACCENT = "hsl(239, 100%, 68%)";
const MUTED_LINE = "hsl(215, 16%, 47%, 0.35)";

const TIMEFRAMES: { id: HealthTimeframe; label: string }[] = [
  { id: "1M", label: "1M" },
  { id: "3M", label: "3M" },
  { id: "6M", label: "6M" },
  { id: "12M", label: "12M" },
  { id: "ALL", label: "All" },
];

function formatShortDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ChartTooltip({
  active,
  payload,
  label,
  benchmark,
}: {
  active?: boolean;
  payload?: Array<{ value?: number }>;
  label?: string;
  benchmark: number;
}) {
  if (!active || !payload?.length || label == null) return null;
  const v = payload[0].value ?? 0;
  const vs = v - benchmark;
  return (
    <div className="rounded-xl border border-border/60 bg-popover/95 px-3 py-2.5 shadow-lg backdrop-blur-md">
      <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{formatShortDate(label)}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight text-foreground">{v.toFixed(1)}</p>
      <p className={cn("mt-1 text-[11px] font-medium tabular-nums", vs >= 0 ? "text-success" : "text-destructive")}>
        {vs >= 0 ? "+" : ""}
        {vs.toFixed(1)} vs peer benchmark
      </p>
    </div>
  );
}

function MiniSpark({ values, positive }: { values: number[]; positive: boolean }) {
  const uid = useId().replace(/:/g, "");
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = max === min ? 1 : (max - min) * 0.15;
  const data = values.map((v, i) => ({ i, v: v - min + pad }));
  const stroke = positive ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 44%)";
  const gid = `spark-${uid}`;
  return (
    <div className="h-8 w-[72px] shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.25} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={stroke}
            strokeWidth={1.5}
            fill={`url(#${gid})`}
            isAnimationActive
            animationDuration={600}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface HealthScoreTrendDropdownProps {
  currentScore: number;
  seedKey: string;
  /** Typically the health score value control (must be a single element for `asChild`). */
  children: ReactNode;
}

export function HealthScoreTrendDropdown({ currentScore, seedKey, children }: HealthScoreTrendDropdownProps) {
  const [timeframe, setTimeframe] = useState<HealthTimeframe>("3M");

  const dataset = useMemo(
    () => buildHealthTrendDataset(currentScore, timeframe, seedKey),
    [currentScore, timeframe, seedKey],
  );

  const { series, benchmark, annotations, drivers, changelog, rangeDelta, vsPriorPeriod } = dataset;
  const chartData = useMemo(() => series.map((p) => ({ ...p, bench: benchmark })), [series, benchmark]);

  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        collisionPadding={16}
        className={cn(
          "z-[60] w-[min(calc(100vw-1.5rem),460px)] max-h-[min(72vh,620px)] overflow-hidden p-0",
          "rounded-2xl border-border/70 bg-popover/98 shadow-xl backdrop-blur-md",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2",
        )}
      >
        <p className="sr-only">Health score history, drivers, and recent changes</p>

        <div className="border-b border-border/60 px-4 pb-3 pt-4">
          <div className="flex items-start justify-between gap-3 pr-6">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground">Health Score</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">Trends & drivers</p>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Current</p>
              <div className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{currentScore}</span>
                <span className="text-xs font-medium text-muted-foreground">/ 100</span>
              </div>
            </div>
            <div className="text-right">
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Vs prior period</p>
              <div
                className={cn(
                  "mt-0.5 flex items-center justify-end gap-1 text-sm font-semibold tabular-nums",
                  vsPriorPeriod > 0 ? "text-success" : vsPriorPeriod < 0 ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {vsPriorPeriod > 0 ? (
                  <ArrowUpRight className="h-3.5 w-3.5" />
                ) : vsPriorPeriod < 0 ? (
                  <ArrowDownRight className="h-3.5 w-3.5" />
                ) : (
                  <Minus className="h-3.5 w-3.5" />
                )}
                {vsPriorPeriod > 0 ? "+" : ""}
                {vsPriorPeriod.toFixed(1)} pts
              </div>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {rangeDelta >= 0 ? "+" : ""}
                {rangeDelta.toFixed(1)} over range
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1 rounded-lg bg-muted/60 p-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.id}
                type="button"
                onClick={() => setTimeframe(tf.id)}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-all duration-200",
                  timeframe === tf.id
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>

        <ScrollArea className="max-h-[min(52vh,480px)]">
          <div className="space-y-6 px-4 py-4 pb-5">
            <div className="overflow-hidden rounded-xl border border-border/50 bg-card/40 shadow-sm">
              <div className="border-b border-border/40 px-3 py-2.5">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Trajectory</p>
                <p className="text-xs text-muted-foreground">Score over time · peer benchmark</p>
              </div>
              <div className="h-[200px] w-full px-1.5 pb-2 pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="healthScoreFillDd" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={ACCENT} stopOpacity={0.28} />
                        <stop offset="100%" stopColor={ACCENT} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 8" vertical={false} stroke={MUTED_LINE} />
                    <XAxis
                      dataKey="t"
                      tickFormatter={formatShortDate}
                      tick={{ fontSize: 9, fill: "hsl(215, 16%, 47%)" }}
                      axisLine={false}
                      tickLine={false}
                      minTickGap={24}
                    />
                    <YAxis
                      domain={[0, 100]}
                      width={28}
                      tick={{ fontSize: 9, fill: "hsl(215, 16%, 47%)" }}
                      axisLine={false}
                      tickLine={false}
                      tickCount={5}
                    />
                    <Tooltip
                      content={<ChartTooltip benchmark={benchmark} />}
                      cursor={{ stroke: ACCENT, strokeWidth: 1, strokeDasharray: "4 4" }}
                    />
                    <ReferenceLine
                      y={benchmark}
                      stroke={MUTED_LINE}
                      strokeDasharray="6 6"
                      label={{
                        value: `Peer ${benchmark}`,
                        position: "insideTopRight",
                        fill: "hsl(215, 16%, 47%)",
                        fontSize: 9,
                      }}
                    />
                    {annotations.map((a) => (
                      <ReferenceLine
                        key={`${a.t}-${a.label}`}
                        x={a.t}
                        stroke="hsl(239 100% 68% / 0.22)"
                        strokeDasharray="3 6"
                        label={{
                          value: a.label,
                          position: "top",
                          fill: "hsl(215, 16%, 40%)",
                          fontSize: 8,
                        }}
                      />
                    ))}
                    <Area
                      type="monotone"
                      dataKey="score"
                      stroke={ACCENT}
                      strokeWidth={2}
                      fill="url(#healthScoreFillDd)"
                      isAnimationActive
                      animationDuration={800}
                      animationEasing="ease-out"
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: ACCENT }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Score drivers</p>
              <ul className="mt-3 space-y-2">
                {drivers.map((d) => {
                  const pos = d.delta >= 0;
                  return (
                    <li
                      key={d.id}
                      className="flex items-center gap-2 rounded-lg border border-border/50 bg-muted/20 px-2.5 py-2.5 shadow-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-foreground">{d.label}</p>
                        <div className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold tabular-nums">
                          {pos ? (
                            <TrendingUp className="h-3 w-3 text-success" />
                          ) : (
                            <TrendingDown className="h-3 w-3 text-destructive" />
                          )}
                          <span className={pos ? "text-success" : "text-destructive"}>
                            {pos ? "+" : ""}
                            {d.delta.toFixed(1)} pts
                          </span>
                        </div>
                      </div>
                      <MiniSpark values={d.sparkline} positive={pos} />
                    </li>
                  );
                })}
              </ul>
            </div>

            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Recent changes</p>
              <ul className="relative mt-3 space-y-0 border-l border-border/80 pl-3">
                {changelog.map((c, i) => (
                  <li key={`${c.t}-${i}`} className="relative pb-4 last:pb-0">
                    <span
                      className={cn(
                        "absolute -left-[15px] top-1 h-1.5 w-1.5 rounded-full ring-2 ring-popover",
                        c.change === 0 ? "bg-muted-foreground/50" : c.kind === "up" ? "bg-success" : "bg-destructive",
                      )}
                    />
                    <p className="font-mono text-[10px] text-muted-foreground">{formatShortDate(c.t)}</p>
                    <p className="mt-0.5 text-xs leading-snug text-foreground">{c.title}</p>
                    <p
                      className={cn(
                        "mt-0.5 text-[11px] font-semibold tabular-nums",
                        c.change >= 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {c.change >= 0 ? "+" : ""}
                      {c.change.toFixed(1)} pts
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}

/** Trigger affordance: score + chevron, styled as a subtle dropdown control */
export function HealthScoreDropdownTrigger({
  score,
  trendLabel,
  className,
}: {
  score: number;
  trendLabel: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "group flex items-baseline gap-2 rounded-xl border border-transparent bg-transparent px-2 py-1 text-left transition-all",
        "hover:border-border/60 hover:bg-muted/30",
        "data-[state=open]:border-border/50 data-[state=open]:bg-muted/25 data-[state=open]:shadow-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card",
        className,
      )}
      aria-haspopup="dialog"
    >
      <span className="text-4xl font-bold tabular-nums tracking-tight text-foreground">{score}%</span>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground opacity-60 transition-transform duration-200 group-data-[state=open]:rotate-180" />
      <div className="flex items-center gap-1">{trendLabel}</div>
    </button>
  );
}
