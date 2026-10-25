import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Tooltip as HoverTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  formatShare,
  resolveInvestorReviewRatings,
  resolveInvestorReviewStats,
  resolveNavSectionStats,
  resolveTopInvestorPeople,
  resolveTopInvestorRecords,
  type NavSectionStat,
  type ReviewBreakdownKind,
  type TopInvestorRecord,
  type TopRecordKind,
} from "./engagementAnalytics";

export const ENGAGEMENT_CARD =
  "rounded-2xl border border-neutral-800 bg-neutral-900/30 p-5 backdrop-blur-sm";

export type AnalyticsBreakdown = { label: string; count: number };

export type EngagementSeriesKey = "clicks" | "searches" | "uploads" | "logins";

export const ENGAGEMENT_SERIES: Array<{
  key: EngagementSeriesKey;
  label: string;
  color: string;
  hint: string;
}> = [
  { key: "clicks", label: "Clicks", color: "#00D4FF", hint: "Outbound links opened from the product" },
  { key: "searches", label: "Searches", color: "#5B5CFF", hint: "Top nav and AI home searches" },
  { key: "uploads", label: "Uploads", color: "#2EE6A6", hint: "Pitch decks and files uploaded" },
  { key: "logins", label: "Logins", color: "#FFB800", hint: "Users who signed in during this range" },
];

export type EngagementChartPoint = {
  date: string;
  label: string;
  clicks: number;
  searches: number;
  uploads: number;
  logins: number;
};

export type EngagementMetricCard = {
  key: string;
  title: string;
  value: number;
  displayValue?: string;
  valueSuffix?: string;
  subtext: string;
  spark?: number[];
  color?: string;
  badge?: string;
};

export interface AnalyticsEngagementProps {
  grain: "day" | "week";
  metricCards: EngagementMetricCard[];
  chartData: EngagementChartPoint[];
  clickTypes: AnalyticsBreakdown[];
  navSectionStats?: NavSectionStat[];
  investorReviewStats?: NavSectionStat[];
  investorReviewRatings?: NavSectionStat[];
  topInvestorRecords?: TopInvestorRecord[];
  topInvestorPeople?: TopInvestorRecord[];
  hiddenSeries: EngagementSeriesKey[];
  onToggleSeries: (key: EngagementSeriesKey) => void;
  onOpenFirmRecord?: (firmId: string, firmName: string) => void;
  onOpenPersonRecord?: (personId: string, personName: string) => void;
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

export function AnalyticsMetricCard({ card }: { card: EngagementMetricCard }) {
  return (
    <div className={ENGAGEMENT_CARD}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium leading-snug text-white/75">{card.title}</p>
        {card.spark && card.color ? (
          <Sparkline values={card.spark} color={card.color} />
        ) : card.badge ? (
          <span className="rounded-full border border-neutral-800 px-2 py-0.5 text-[11px] text-white/55">
            {card.badge}
          </span>
        ) : null}
      </div>
      <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-white/90">
        {card.displayValue ?? card.value.toLocaleString()}
        {card.valueSuffix ? (
          <span className="ml-1.5 text-lg font-medium text-white/40"> {card.valueSuffix}</span>
        ) : null}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-white/40">{card.subtext}</p>
    </div>
  );
}

export function AnalyticsBreakdownCard({
  title,
  note,
  rows,
}: {
  title: string;
  note?: string;
  rows: AnalyticsBreakdown[];
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    <div className={ENGAGEMENT_CARD}>
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
                <span className="font-mono text-xs tabular-nums text-white/45">
                  {row.count.toLocaleString()}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
                <div
                  className="h-full rounded-full bg-emerald-500"
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
            <span className="font-mono text-xs tabular-nums text-white/90">
              {Number(item.value ?? 0).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureUtilizationCard({ rows }: { rows: NavSectionStat[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count));

  return (
    <div className={ENGAGEMENT_CARD}>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-white/80">Feature Utilization</h2>
        <p className="mt-1 text-xs text-white/35">Pageviews and tool visits in this range</p>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-white/35">None in this range</p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.name}>
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="truncate text-sm text-neutral-300">{row.name}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-neutral-400">
                  {row.count.toLocaleString()}
                  <span className="ml-2 text-neutral-500">{formatShare(row.percentage)}</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
                <div
                  className={cn(
                    "h-full rounded-full",
                    index % 2 === 0 ? "bg-emerald-500" : "bg-cyan-500",
                  )}
                  style={{ width: row.count === 0 ? "0%" : `${Math.max(4, (row.count / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CardSegmentedToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <div
      className="inline-flex shrink-0 rounded-lg border border-neutral-800 bg-neutral-950/70 p-0.5"
      role="tablist"
      aria-label={label}
    >
      {options.map((item) => {
        const selected = value === item.id;

        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            className={cn(
              "inline-flex h-7 items-center rounded-md px-2.5 font-sans text-xs transition-colors",
              selected
                ? "border border-neutral-700 bg-neutral-900 text-neutral-100"
                : "border border-transparent text-neutral-500 hover:text-neutral-300",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

const REVIEW_BREAKDOWN_KINDS: Array<{ id: ReviewBreakdownKind; label: string }> = [
  { id: "origins", label: "Origins" },
  { id: "ratings", label: "Ratings" },
];

function InvestorReviewsCard({
  originRows,
  ratingRows,
}: {
  originRows: NavSectionStat[];
  ratingRows: NavSectionStat[];
}) {
  const [kind, setKind] = useState<ReviewBreakdownKind>("origins");
  const showingRatings = kind === "ratings";
  const rows = (showingRatings ? ratingRows : originRows).filter((row) => row.count > 0);
  const max = Math.max(1, ...rows.map((row) => row.count));
  const total = (showingRatings ? ratingRows : originRows).reduce((sum, row) => sum + row.count, 0);

  return (
    <div className={ENGAGEMENT_CARD}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white/80">Investor Reviews</h2>
          <p className="mt-1 text-xs text-white/35">
            {showingRatings ? "Star ratings submitted in this range" : "Founder reviews submitted in this range"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <CardSegmentedToggle
            label="Review breakdown"
            value={kind}
            options={REVIEW_BREAKDOWN_KINDS}
            onChange={setKind}
          />
          <span className="font-mono text-sm tabular-nums text-neutral-300">{total.toLocaleString()}</span>
        </div>
      </div>
      {rows.length === 0 || total === 0 ? (
        <p className="text-sm text-neutral-400">
          {showingRatings
            ? "No investor ratings recorded in this timeframe."
            : "No investor reviews recorded in this timeframe."}
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <div key={row.name}>
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="truncate text-sm text-neutral-300">{row.name}</span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-neutral-400">
                  {row.count.toLocaleString()}
                  <span className="ml-2 text-neutral-500">{formatShare(row.percentage)}</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
                <div
                  className={cn(
                    "h-full rounded-full",
                    index % 2 === 0 ? "bg-emerald-500" : "bg-cyan-500",
                  )}
                  style={{ width: row.count === 0 ? "0%" : `${Math.max(4, (row.count / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const TOP_RECORD_KINDS: Array<{ id: TopRecordKind; label: string }> = [
  { id: "firms", label: "Firms" },
  { id: "investors", label: "Investors" },
];

function TopInvestorRecordsCard({
  firmRows,
  peopleRows,
  onOpenFirmRecord,
  onOpenPersonRecord,
}: {
  firmRows: TopInvestorRecord[];
  peopleRows: TopInvestorRecord[];
  onOpenFirmRecord?: (firmId: string, firmName: string) => void;
  onOpenPersonRecord?: (personId: string, personName: string) => void;
}) {
  const [kind, setKind] = useState<TopRecordKind>("firms");
  const showingPeople = kind === "investors";
  const rows = showingPeople ? peopleRows : firmRows;
  const openRecord = showingPeople ? onOpenPersonRecord : onOpenFirmRecord;

  return (
    <div className={ENGAGEMENT_CARD}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white/80">Top Investor Records</h2>
          <p className="mt-1 text-xs text-white/35">
            {showingPeople ? "Most viewed and actioned investors" : "Most viewed and actioned firms"}
          </p>
        </div>
        <CardSegmentedToggle
          label="Top records"
          value={kind}
          options={TOP_RECORD_KINDS}
          onChange={setKind}
        />
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-400">
          {showingPeople
            ? "No investor record interactions recorded in this timeframe."
            : "No firm record interactions recorded in this timeframe."}
        </p>
      ) : (
        <ol className="divide-y divide-neutral-800/80">
          {rows.map((row, index) => (
            <li key={row.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-neutral-500">
                #{index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate font-medium text-sm text-neutral-200">{row.name}</p>
                  {row.stage ? (
                    <span className="shrink-0 rounded-md border border-neutral-800 bg-neutral-950 px-1.5 py-0.5 text-[10px] text-neutral-400">
                      {row.stage}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 font-mono text-xs tabular-nums text-neutral-400">
                  {row.views.toLocaleString()} views
                  <span className="mx-1.5 text-neutral-700">·</span>
                  {row.outboundClicks.toLocaleString()} clicks
                </p>
              </div>
              {openRecord && /^[0-9a-f-]{36}$/i.test(row.id) ? (
                <button
                  type="button"
                  onClick={() => openRecord(row.id, row.name)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-neutral-800 text-neutral-500 transition-colors hover:border-neutral-700 hover:bg-neutral-900 hover:text-neutral-200"
                  aria-label={`Open ${row.name} in Investor Records`}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function AnalyticsEngagement({
  grain,
  metricCards,
  chartData,
  clickTypes,
  navSectionStats,
  investorReviewStats,
  investorReviewRatings,
  topInvestorRecords,
  topInvestorPeople,
  hiddenSeries,
  onToggleSeries,
  onOpenFirmRecord,
  onOpenPersonRecord,
}: AnalyticsEngagementProps) {
  const navRows = resolveNavSectionStats(navSectionStats);
  const reviewRows = resolveInvestorReviewStats(investorReviewStats);
  const ratingRows = resolveInvestorReviewRatings(investorReviewRatings);
  const firmRows = resolveTopInvestorRecords(topInvestorRecords);
  const peopleRows = resolveTopInvestorPeople(topInvestorPeople);
  const visibleSeries = ENGAGEMENT_SERIES.filter((series) => !hiddenSeries.includes(series.key));
  const hasActivity = chartData.some((point) => visibleSeries.some((series) => (point[series.key] ?? 0) > 0));
  const tickInterval = chartData.length <= 8 ? 0 : Math.ceil(chartData.length / 7) - 1;

  return (
    <div className="space-y-4">
      <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {metricCards.map((card) => (
          <AnalyticsMetricCard key={card.key} card={card} />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className={`${ENGAGEMENT_CARD} lg:col-span-3`}>
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-white/80">Activity</h2>
            <p className="mt-1 text-xs text-white/35">
              {grain === "week" ? "Weekly" : "Daily"} counts in this range
            </p>
          </div>
          <TooltipProvider delayDuration={200}>
            <div className="mb-4 flex flex-wrap gap-2">
              {ENGAGEMENT_SERIES.map((series) => {
                const off = hiddenSeries.includes(series.key);

                return (
                  <HoverTooltip key={series.key}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-pressed={!off}
                        aria-label={`${series.label}. ${series.hint}`}
                        onClick={() => onToggleSeries(series.key)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-neutral-800 px-2.5 py-1 text-xs text-white/70 transition-opacity"
                        style={{ opacity: off ? 0.4 : 1 }}
                      >
                        <span className="h-2 w-2 rounded-full" style={{ background: series.color }} />
                        {series.label}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent
                      side="bottom"
                      className="max-w-[220px] border-neutral-800 bg-neutral-950/95 p-2 text-neutral-200 backdrop-blur-md"
                    >
                      <p className="text-[11px] leading-relaxed text-neutral-400">
                        <span className="font-semibold text-neutral-100">{series.label}</span>
                        {" — "}
                        {series.hint}
                      </p>
                    </TooltipContent>
                  </HoverTooltip>
                );
              })}
            </div>
          </TooltipProvider>
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
                  <Bar
                    key={series.key}
                    dataKey={series.key}
                    name={series.label}
                    fill={series.color}
                    fillOpacity={0.85}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={22}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-16 text-center text-xs text-white/35">
              {visibleSeries.length === 0 ? "Turn a metric back on to see the chart" : "No activity in this range"}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-4 lg:col-span-2">
          <FeatureUtilizationCard rows={navRows} />
          <InvestorReviewsCard originRows={reviewRows} ratingRows={ratingRows} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TopInvestorRecordsCard
          firmRows={firmRows}
          peopleRows={peopleRows}
          onOpenFirmRecord={onOpenFirmRecord}
          onOpenPersonRecord={onOpenPersonRecord}
        />
        <AnalyticsBreakdownCard
          title="Outbound clicks"
          note="Funding Article, Firm Website, Lead Investor"
          rows={clickTypes}
        />
      </section>
    </div>
  );
}

export default AnalyticsEngagement;
