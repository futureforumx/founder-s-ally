import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Calendar, ChevronDown, Loader2, RefreshCw, X } from "lucide-react";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { formatEdgeFunctionInvokeError } from "@/lib/supabaseFunctionErrors";
import { FilterSelect, filterTriggerClass } from "@/components/admin/FilterSelect";
import {
  DateRangePicker,
  DateRangePickerCalendar,
  DateRangePickerClear,
  DateRangePickerContent,
  DateRangePickerFooter,
  DateRangePickerGrid,
  DateRangePickerHeader,
  DateRangePickerSelection,
  DateRangePickerTrigger,
  useDateRangePicker,
  type DateRange,
} from "@/components/motion/date-range-picker";

type AnalyticsPreset = "1d" | "3d" | "7d" | "30d" | "90d" | "all";
type AnalyticsSelection = AnalyticsPreset | "custom";

type Breakdown = { label: string; count: number };

type AnalyticsKpi = {
  key: string;
  label: string;
  value: number;
  allTime: number;
  hint: string;
};

type SeriesPoint = {
  date: string;
  users: number;
  waitlist: number;
  clicks: number;
  interactions: number;
};

type RecentItem = {
  id: string;
  at: string;
  label: string;
  detail: string;
};

type AnalyticsPayload = {
  range: AnalyticsSelection;
  generatedAt: string;
  grain: "day" | "week";
  referrals: number;
  kpis: AnalyticsKpi[];
  onboarding: { inRange: number; allTime: number; profiles: number };
  series: SeriesPoint[];
  waitlistStatus: Breakdown[];
  waitlistSources: Breakdown[];
  waitlistRoles: Breakdown[];
  clickTypes: Breakdown[];
  interactionTypes: Breakdown[];
  profileTypes: Breakdown[];
  recent: RecentItem[];
};

const PRESET_DAYS: Record<Exclude<AnalyticsPreset, "all">, number> = {
  "1d": 1,
  "3d": 3,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const RANGES: { id: AnalyticsSelection; label: string }[] = [
  { id: "1d", label: "1D" },
  { id: "3d", label: "3D" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "90d", label: "90D" },
  { id: "all", label: "All time" },
  { id: "custom", label: "Custom" },
];

function utcToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function shiftUtcDay(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function presetDates(range: AnalyticsPreset): DateRange | null {
  if (range === "all") return null;
  const to = utcToday();
  return { from: shiftUtcDay(to, -(PRESET_DAYS[range] - 1)), to };
}

function formatAnalyticsDates(value: DateRange): string {
  const format = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
  const from = format.format(new Date(`${value.from}T00:00:00.000Z`));
  if (!value.to) return `${from} – …`;
  const to = format.format(new Date(`${value.to}T00:00:00.000Z`));
  return `${from} – ${to}`;
}

function AnalyticsDateTrigger() {
  const picker = useDateRangePicker();
  const summary = picker.value ? formatAnalyticsDates(picker.value) : "All time";

  return (
    <DateRangePickerTrigger className={filterTriggerClass} aria-label={`Dates: ${summary}`}>
      <Calendar className="h-3.5 w-3.5 shrink-0 text-neutral-400" aria-hidden />
      <span className="whitespace-nowrap font-normal text-neutral-500">Dates:</span>
      <span className="whitespace-nowrap font-medium text-neutral-200">{summary}</span>
      <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden />
    </DateRangePickerTrigger>
  );
}

function matchingPreset(range: DateRange): AnalyticsPreset | null {
  if (!range.to) return null;
  for (const preset of Object.keys(PRESET_DAYS) as Array<Exclude<AnalyticsPreset, "all">>) {
    const dates = presetDates(preset);
    if (dates && dates.from === range.from && dates.to === range.to) return preset;
  }
  return null;
}

const SERIES = [
  { key: "users", label: "App users", color: "#2EE6A6" },
  { key: "waitlist", label: "Waitlist", color: "#5B5CFF" },
  { key: "clicks", label: "Clicks", color: "#00D4FF" },
  { key: "interactions", label: "Investor actions", color: "#FFB800" },
] as const;

type SeriesKey = (typeof SERIES)[number]["key"];
type ChartView = "all" | "pipeline" | "engagement";

const CHART_VIEWS: { id: ChartView; label: string; keys: SeriesKey[] }[] = [
  { id: "all", label: "All", keys: ["users", "waitlist", "clicks", "interactions"] },
  { id: "pipeline", label: "Pipeline", keys: ["waitlist", "users"] },
  { id: "engagement", label: "Engagement", keys: ["clicks", "interactions"] },
];

const cardClass = "rounded-xl border border-neutral-800 bg-neutral-950 p-5";

function formatBucket(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return formatDistanceToNow(date, { addSuffix: true });
}

function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function activeSubtext(range: AnalyticsSelection): string {
  switch (range) {
    case "1d": return "Active (Last 24h)";
    case "3d": return "Active (Last 3d)";
    case "7d": return "Active (Last 7d / WAU)";
    case "30d": return "Active (Last 30d)";
    case "90d": return "Active (Last 90d)";
    case "all": return "Active across all time";
    default: return "Active in selected range";
  }
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return null;
  const width = 76;
  const height = 24;
  const max = Math.max(1, ...values);
  const step = width / (values.length - 1);
  const d = values
    .map((value, index) => {
      const x = index * step;
      const y = height - (value / max) * (height - 2) - 1;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0" aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function ActivityTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey?: string | number; name?: string; value?: number | string; color?: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-[168px] rounded-lg border border-neutral-800 bg-neutral-950/95 px-3 py-2 shadow-xl">
      <p className="mb-1.5 text-xs font-medium text-white/80">{label}</p>
      <div className="space-y-1">
        {payload.map((item) => (
          <div key={String(item.dataKey)} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-white/55">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: item.color }} />
              {item.name}
            </span>
            <span className="font-mono text-xs tabular-nums text-white/90">{Number(item.value ?? 0).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  note,
  rows,
}: {
  title: string;
  note?: string;
  rows: Breakdown[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <div className={cardClass}>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-white/80">{title}</h2>
        {note ? <p className="mt-1 text-xs text-white/35">{note}</p> : null}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-white/35">None in this range</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.label}>
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="truncate text-xs text-white/70">{row.label}</span>
                <span className="font-mono text-xs tabular-nums text-white/45">{row.count.toLocaleString()}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-success"
                  style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MetricCard({
  card,
}: {
  card: {
    key: string;
    title: string;
    value: number;
    subtext: string;
    spark?: number[];
    color?: string;
    badge?: string;
  };
}) {
  return (
    <div className={cardClass}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-white/75">{card.title}</p>
        {card.spark && card.color ? (
          <Sparkline values={card.spark} color={card.color} />
        ) : card.badge ? (
          <span className="rounded-full border border-neutral-800 px-2 py-0.5 text-[11px] text-white/55">{card.badge}</span>
        ) : null}
      </div>
      <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-white/90">{card.value.toLocaleString()}</p>
      <p className="mt-1 text-xs leading-relaxed text-white/40">{card.subtext}</p>
    </div>
  );
}

type AnalyticsQuery = { range: AnalyticsPreset } | { from: string; to: string };

export function AdminAnalytics({ onClose }: { onClose: () => void }) {
  const [range, setRange] = useState<AnalyticsSelection>("all");
  const [dates, setDates] = useState<DateRange | null>(null);
  const [payload, setPayload] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartView, setChartView] = useState<ChartView>("all");
  const [hiddenSeries, setHiddenSeries] = useState<SeriesKey[]>([]);
  const dateKey = dates?.from && dates.to ? `${dates.from}:${dates.to}` : "";

  const load = useCallback(async (query: AnalyticsQuery) => {
    setLoading(true);
    setError(null);
    const { data, error: invokeError } = await invokeEdgeFunction("admin-analytics", {
      preferClerkSessionToken: true,
      body: query,
    });
    if (invokeError) {
      setError(await formatEdgeFunctionInvokeError(invokeError));
      setLoading(false);
      return;
    }
    const body = data as AnalyticsPayload & { error?: string };
    if (body?.error) {
      setError(body.error);
      setLoading(false);
      return;
    }
    setPayload(body);
    setLoading(false);
  }, []);

  const currentQuery = useCallback((): AnalyticsQuery | null => {
    if (range === "custom") {
      return dates?.from && dates.to ? { from: dates.from, to: dates.to } : null;
    }
    return { range };
  }, [dates, range]);

  useEffect(() => {
    const query = range === "custom"
      ? (dateKey ? { from: dateKey.slice(0, 10), to: dateKey.slice(11) } : null)
      : { range };
    if (query) void load(query);
  }, [dateKey, load, range]);

  const chartData = (payload?.series ?? []).map((point) => ({
    ...point,
    label: formatBucket(point.date),
  }));
  const viewSeries = CHART_VIEWS.find((view) => view.id === chartView)?.keys ?? CHART_VIEWS[0].keys;
  const visibleSeries = SERIES.filter((series) => viewSeries.includes(series.key) && !hiddenSeries.includes(series.key));
  const hasActivity = chartData.some((point) => visibleSeries.some((series) => point[series.key] > 0));
  const tickInterval = chartData.length <= 8 ? 0 : Math.ceil(chartData.length / 7) - 1;
  const kpiByKey = useMemo(() => {
    const map = new Map((payload?.kpis ?? []).map((kpi) => [kpi.key, kpi]));
    return map;
  }, [payload]);

  const metricRows = useMemo(() => {
    if (!payload) return { pipeline: [], engagement: [] };
    const valueOf = (key: string) => kpiByKey.get(key)?.value ?? 0;
    const spark = (key: SeriesKey) => payload.series.map((point) => point[key]);
    const waitlist = valueOf("waitlist");
    const approved = valueOf("approved");
    const approvalRate = waitlist > 0 ? (approved / waitlist) * 100 : null;
    const onboardRate = payload.onboarding.profiles > 0
      ? (payload.onboarding.allTime / payload.onboarding.profiles) * 100
      : null;

    return {
      pipeline: [
        {
          key: "waitlist",
          title: "Waitlist",
          value: waitlist,
          subtext: "Applications received",
          spark: spark("waitlist"),
          color: "#5B5CFF",
        },
        {
          key: "approved",
          title: "Approved",
          value: approved,
          subtext: approvalRate == null ? "No applications in this range" : `${formatPercent(approvalRate)} of applications`,
        },
        {
          key: "users",
          title: "App Users",
          value: valueOf("users"),
          subtext: "Total onboarded accounts",
          spark: spark("users"),
          color: "#2EE6A6",
          badge: onboardRate == null ? undefined : `${formatPercent(onboardRate)} onboarded`,
        },
      ],
      engagement: [
        {
          key: "active",
          title: "Active Users",
          value: valueOf("active"),
          subtext: activeSubtext(range),
          badge: RANGES.find((item) => item.id === range)?.label ?? "Range",
        },
        {
          key: "interactions",
          title: "Investor Actions",
          value: valueOf("interactions"),
          subtext: "Founder actions on firms",
          spark: spark("interactions"),
          color: "#FFB800",
        },
        {
          key: "clicks",
          title: "Outbound Clicks",
          value: valueOf("clicks"),
          subtext: "External links clicked",
          spark: spark("clicks"),
          color: "#00D4FF",
        },
      ],
    };
  }, [kpiByKey, payload, range]);

  return (
    <div className="-mx-8">
      <div className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#050505] px-8 py-4">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <h1 className="text-xl font-semibold text-white/90">Analytics</h1>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <FilterSelect
                label="Range"
                icon={Calendar}
                value={range}
                options={RANGES.map((item) => ({ value: item.id, label: item.label }))}
                onValueChange={(value) => {
                  const next = RANGES.find((item) => item.id === value);

                  if (!next || next.id === "custom") return;

                  setRange(next.id);
                  setDates(presetDates(next.id));
                }}
              />
              <DateRangePicker
                label="Analytics dates"
                value={dates}
                max={utcToday()}
                closeOnSelect
                onValueChange={(next) => {
                  if (!next?.from) {
                    setDates(null);
                    setRange("all");
                    return;
                  }
                  setDates(next);
                  if (!next.to) return;
                  setRange(matchingPreset(next) ?? "custom");
                }}
              >
                <AnalyticsDateTrigger />
                <DateRangePickerContent>
                  <DateRangePickerCalendar className="w-full rounded-none border-0 bg-transparent p-1">
                    <DateRangePickerHeader />
                    <DateRangePickerGrid />
                    <DateRangePickerFooter>
                      <div className="flex items-center justify-between gap-2">
                        <DateRangePickerSelection />
                        <DateRangePickerClear />
                      </div>
                    </DateRangePickerFooter>
                  </DateRangePickerCalendar>
                </DateRangePickerContent>
              </DateRangePicker>
              <button
                type="button"
                onClick={() => {
                  const query = currentQuery();
                  if (query) void load(query);
                }}
                disabled={loading}
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-xs font-medium text-white/60 transition-colors hover:bg-white/5 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Back to overview"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/15 bg-white/[0.03] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-8 px-8 pb-8 pt-6">

      {error ? (
        <div className="rounded-xl border p-5" style={{ borderColor: "rgba(248,113,113,0.25)", background: "rgba(248,113,113,0.06)" }}>
          <p className="text-sm text-red-300">{error}</p>
          <button
            type="button"
            onClick={() => {
              const query = currentQuery();
              if (query) void load(query);
            }}
            className="mt-3 text-xs text-white/60 underline-offset-2 hover:underline"
          >
            Try again
          </button>
        </div>
      ) : null}

      {loading && !payload ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-5 w-5 animate-spin" style={{ color: "#2EE6A6" }} />
        </div>
      ) : null}

      {payload ? (
        <>
          <section className="space-y-3">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/35">Pipeline</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {metricRows.pipeline.map((card) => (
                <MetricCard key={card.key} card={card} />
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/35">Engagement</h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {metricRows.engagement.map((card) => (
                <MetricCard key={card.key} card={card} />
              ))}
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-5">
            <div className={`${cardClass} xl:col-span-3`}>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-white/80">Activity</h2>
                  <p className="mt-1 text-xs text-white/35">
                    {payload.grain === "week" ? "Weekly" : "Daily"} counts in this range
                  </p>
                </div>
                <div className="flex rounded-lg border border-neutral-800 p-0.5">
                  {CHART_VIEWS.map((view) => (
                    <button
                      key={view.id}
                      type="button"
                      onClick={() => {
                        setChartView(view.id);
                        setHiddenSeries([]);
                      }}
                      className="rounded-md px-2.5 py-1 text-xs font-medium transition-colors"
                      style={{
                        background: chartView === view.id ? "rgba(255,255,255,0.08)" : "transparent",
                        color: chartView === view.id ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)",
                      }}
                    >
                      {view.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mb-4 flex flex-wrap gap-2">
                {SERIES.filter((series) => viewSeries.includes(series.key)).map((series) => {
                  const off = hiddenSeries.includes(series.key);
                  return (
                    <button
                      key={series.key}
                      type="button"
                      aria-pressed={!off}
                      onClick={() => {
                        setHiddenSeries((current) => (
                          current.includes(series.key)
                            ? current.filter((key) => key !== series.key)
                            : [...current, series.key]
                        ));
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 px-2.5 py-1 text-xs text-white/70 transition-opacity"
                      style={{ opacity: off ? 0.4 : 1 }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: series.color }} />
                      {series.label}
                    </button>
                  );
                })}
              </div>
              {hasActivity ? (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={chartData} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis
                      dataKey="label"
                      interval={tickInterval}
                      tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11, fontFamily: "Inter, sans-serif" }}
                      axisLine={false}
                      tickLine={false}
                      tickMargin={8}
                    />
                    <YAxis
                      allowDecimals={false}
                      width={36}
                      tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 11, fontFamily: "ui-monospace, monospace" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ActivityTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
                    {visibleSeries.map((series) => (
                      <Bar key={series.key} dataKey={series.key} name={series.label} fill={series.color} fillOpacity={0.85} radius={[3, 3, 0, 0]} maxBarSize={22} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-16 text-center text-xs text-white/35">
                  {visibleSeries.length === 0 ? "Turn a metric back on to see the chart" : "No activity in this range"}
                </p>
              )}
            </div>

            <div className="xl:col-span-2">
              <BreakdownCard
                title="Waitlist status"
                note={payload.referrals > 0 ? `${payload.referrals} referred applicant${payload.referrals === 1 ? "" : "s"}` : "Applicants in this range"}
                rows={payload.waitlistStatus}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <BreakdownCard title="Waitlist sources" rows={payload.waitlistSources} />
            <BreakdownCard title="Applicant roles" rows={payload.waitlistRoles} />
            <BreakdownCard title="Outbound clicks" rows={payload.clickTypes} />
            <BreakdownCard title="Investor actions" rows={payload.interactionTypes} />
            <BreakdownCard title="New profile types" rows={payload.profileTypes} />
            <div className={cardClass}>
              <h2 className="text-sm font-semibold text-white/80">Onboarding</h2>
              <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-white/90">
                {payload.onboarding.inRange.toLocaleString()}
              </p>
              <p className="mt-1 text-xs text-white/35">
                Profiles created in this range that finished onboarding
              </p>
              <p className="mt-4 text-xs text-white/50">
                <span className="font-mono tabular-nums">{payload.onboarding.allTime.toLocaleString()}</span>
                {" of "}
                <span className="font-mono tabular-nums">{payload.onboarding.profiles.toLocaleString()}</span>
                {" profiles onboarded all time"}
              </p>
            </div>
          </div>

          <div className={cardClass}>
            <h2 className="text-sm font-semibold text-white/80">Recent activity</h2>
            {payload.recent.length === 0 ? (
              <p className="mt-4 text-xs text-white/35">None in this range</p>
            ) : (
              <div className="mt-4 divide-y divide-white/5">
                {payload.recent.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-white/80">{item.label}</p>
                      {item.detail ? (
                        <p className="mt-0.5 truncate text-xs text-white/40">{item.detail}</p>
                      ) : null}
                    </div>
                    <span className="shrink-0 text-[11px] text-white/35">
                      {formatWhen(item.at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      ) : null}
      </div>
    </div>
  );
}
