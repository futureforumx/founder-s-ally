import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CompanySettingsLogo } from "@/components/ui/company-settings-logo";

export type HealthMetricKey = "market" | "financial" | "gtm" | "defensibility";

export type CompanyHealthMetric = {
  key: HealthMetricKey;
  label: string;
  score: number;
  delta: number;
};

/** Bloomberg-style panel + Linear restraint; optional extras for app integration */
export type CompanyHealthProps = {
  name: string;
  logoUrl?: string;
  websiteUrl?: string;
  overallHealth: { score: number; delta: number };
  metrics: CompanyHealthMetric[];
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  /** Right-aligned square control on the tab strip (linked data sources surface). */
  onDataClick?: () => void;
  /** When true, the Data control shows an active state (data surface open). */
  dataSurfaceActive?: boolean;
  /** e.g. "Updated today" / "5 live signals" — lives in identity stack with live dot */
  metadataLine?: string;
  /** Optional override for hover tooltip under metadata (default lists overall + metric pillars). */
  metadataLineTooltip?: ReactNode;
};

export type CompanyHealthHeaderProps = CompanyHealthProps & {
  /** When false, show generic building placeholder instead of initial */
  hasProfile?: boolean;
};

export type HealthScoreStatus = {
  label: string;
  tone: "good" | "neutralweak" | "weak";
};

/** Maps overall health score to a short qualitative status (score-driven). */
export function getHealthStatusFromScore(score: number): HealthScoreStatus {
  if (score >= 70) return { label: "Improving", tone: "good" };
  if (score >= 40) return { label: "Stable", tone: "neutralweak" };
  return { label: "Watch", tone: "weak" };
}

function DeltaBadge({
  delta,
  mode,
  className,
}: {
  delta: number;
  mode: "percent" | "points";
  className?: string;
}) {
  const up = delta > 0;
  const down = delta < 0;
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  const formatted =
    mode === "percent"
      ? `${up ? "+" : ""}${delta.toFixed(1)}%`
      : `${up ? "+" : down ? "" : ""}${delta.toFixed(1)}`;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded border px-1 py-px font-semibold tabular-nums text-[9px] leading-none tracking-normal transition-colors",
        up &&
          "border-emerald-500/25 bg-emerald-500/[0.07] text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-400",
        down &&
          "border-rose-500/25 bg-rose-500/[0.07] text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-400",
        !up && !down && "border-border/50 bg-muted/40 text-muted-foreground",
        className,
      )}
    >
      <Icon className="h-2.5 w-2.5 shrink-0 opacity-90" aria-hidden />
      {formatted}
    </span>
  );
}

function statusBadgeSurface(tone: HealthScoreStatus["tone"]) {
  if (tone === "good") {
    return "border-emerald-500/35 bg-emerald-500/14 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/12 dark:text-emerald-300";
  }
  if (tone === "neutralweak") {
    return "border-amber-500/35 bg-amber-500/16 text-amber-950 dark:border-amber-500/28 dark:bg-amber-500/14 dark:text-amber-200";
  }
  return "border-rose-500/35 bg-rose-500/14 text-rose-800 dark:border-rose-500/28 dark:bg-rose-500/12 dark:text-rose-300";
}

/** Grows left → right (scaleX); replays on width change and on track hover. */
function AnimatedSignalLine({
  widthPct,
  trackClassName,
  fillClassName,
}: {
  widthPct: number;
  trackClassName: string;
  fillClassName: string;
}) {
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    setReplay((n) => n + 1);
  }, [widthPct]);

  return (
    <div
      className={trackClassName}
      onMouseEnter={() => setReplay((n) => n + 1)}
      aria-hidden
    >
      <div
        key={replay}
        className={cn("health-overall-signal-fill h-full rounded-full", fillClassName)}
        style={{ width: `${widthPct}%` }}
      />
    </div>
  );
}

function OverallHealthSignalLine({ widthPct }: { widthPct: number }) {
  return (
    <AnimatedSignalLine
      widthPct={widthPct}
      trackClassName="group/signal mt-1 h-[2px] w-full cursor-default overflow-hidden rounded-full bg-black/[0.055] dark:bg-white/14"
      fillClassName="bg-amber-500/55 dark:bg-amber-400/50"
    />
  );
}

function MetricSignalLine({ widthPct }: { widthPct: number }) {
  return (
    <AnimatedSignalLine
      widthPct={widthPct}
      trackClassName="mt-1 h-px w-full cursor-default overflow-hidden rounded-full bg-black/[0.07] dark:bg-white/16"
      fillClassName="bg-foreground/16 dark:bg-foreground/30"
    />
  );
}

/** Single-surface instrument cluster: overall rail + 2×2 subdivisions (no outer mini-cards). */
function IntegratedSignalPanel({
  overallHealth,
  metrics,
}: {
  overallHealth: { score: number; delta: number };
  metrics: CompanyHealthMetric[];
}) {
  const status = getHealthStatusFromScore(overallHealth.score);
  const overallW = Math.min(100, Math.max(0, overallHealth.score));

  return (
    <div
      className={cn(
        "company-health-glass-surface flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-white/50 bg-white/80 backdrop-blur-md sm:flex-row",
        "dark:border-white/18 dark:bg-white/[0.11] dark:backdrop-blur-xl",
      )}
    >
      {/* Left segment — same material as metrics; divider only (no nested card). */}
      <div
        className={cn(
          "flex min-h-0 min-w-0 shrink-0 flex-col border-b border-black/[0.06] px-2.5 py-1.5 dark:border-white/14 sm:w-[min(100%,9.25rem)] sm:border-b-0 sm:border-e sm:px-3 sm:py-2 sm:pe-2.5",
        )}
      >
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="text-[9px] font-semibold uppercase leading-none tracking-[0.05em] text-foreground/65">
            Overall health
          </p>
          <div className="mt-1 flex min-h-[2.125rem] items-baseline justify-between gap-2.5">
            <span
              className={cn(
                "text-4xl font-semibold leading-none tracking-tight tabular-nums sm:text-[2.125rem]",
                "text-amber-950 dark:text-amber-300",
              )}
            >
              {Math.round(overallHealth.score)}
            </span>
            <DeltaBadge delta={overallHealth.delta} mode="percent" className="shrink-0 translate-y-px" />
          </div>
          <p className="mt-0.5 text-[9px] font-medium leading-none tabular-nums text-muted-foreground">this month</p>
          <OverallHealthSignalLine widthPct={overallW} />
        </div>
        <div className="mt-2 border-t border-black/[0.06] pt-1.5 dark:border-white/14">
          <span
            className={cn(
              "flex w-full items-center justify-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.07em] tabular-nums leading-none",
              statusBadgeSurface(status.tone),
            )}
          >
            {status.label.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Metrics — same frosted layer; gap = sole grid structure */}
      <div
        className={cn(
          "grid min-h-0 min-w-0 flex-1 grid-cols-2 [gap:1px]",
          "bg-black/[0.03] dark:bg-white/10",
        )}
      >
        {metrics.map((m) => (
          <div
            key={m.key}
            className={cn(
              "company-health-glass-cell group flex min-h-0 min-w-0 flex-col justify-between bg-white/82 px-2.5 py-1.5 backdrop-blur-sm",
              "dark:bg-white/[0.09]",
              "transition-[background-color,box-shadow] duration-200",
              "hover:bg-white/90 hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.65)]",
              "dark:hover:bg-white/[0.13] dark:hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]",
            )}
          >
            <p className="text-[9px] font-semibold uppercase leading-none tracking-[0.045em] text-foreground/65">
              {m.label}
            </p>
            <div className="mt-1 flex min-h-[1.375rem] items-baseline justify-between gap-2.5">
              <span className="flex-1 text-lg font-semibold tabular-nums leading-none text-foreground sm:text-xl">
                {Math.round(m.score)}
              </span>
              <DeltaBadge delta={m.delta} mode="points" className="shrink-0 translate-y-px" />
            </div>
            <div className="mt-auto pt-0.5">
              <MetricSignalLine widthPct={Math.min(100, Math.max(0, m.score))} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HealthControlTabs({
  tabs,
  activeTab,
  onTabChange,
  onDataClick,
  dataSurfaceActive,
}: {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  onDataClick?: () => void;
  dataSurfaceActive?: boolean;
}) {
  return (
    <div className="flex min-h-[2.25rem] items-stretch border-t border-border/40 bg-muted/10 dark:bg-muted/5">
      <nav
        className="flex min-w-0 flex-1 flex-wrap items-stretch gap-x-0.5 px-2"
        aria-label="Company health sections"
      >
        {tabs.map((tab) => {
          const active = tab === activeTab;
          return (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              className={cn(
                "relative px-2.5 py-1.5 text-[11px] font-medium transition-colors",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground/90",
              )}
            >
              <span className={cn(active && "font-semibold")}>{tab}</span>
              {active ? (
                <span
                  className="absolute bottom-0 left-2 right-2 h-px bg-foreground/50 dark:bg-foreground/45"
                  aria-hidden
                />
              ) : null}
            </button>
          );
        })}
      </nav>
      {onDataClick ? (
        <div className="flex shrink-0 items-center border-s border-border/40 px-2 py-1">
          <button
            type="button"
            onClick={onDataClick}
            className={cn(
              "flex size-9 items-center justify-center rounded-sm border text-[10px] font-semibold leading-none tracking-tight transition-colors",
              dataSurfaceActive
                ? "border-foreground/35 bg-foreground/10 text-foreground"
                : "border-border bg-background/60 text-foreground hover:border-foreground/25 hover:bg-muted/50 dark:bg-background/20 dark:hover:bg-muted/30",
            )}
            aria-pressed={dataSurfaceActive}
            aria-label="Data sources"
          >
            Data
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function CompanyHealthHeader({
  name,
  logoUrl,
  websiteUrl,
  hasProfile = true,
  overallHealth,
  metrics,
  tabs,
  activeTab,
  onTabChange,
  onDataClick,
  dataSurfaceActive,
  metadataLine = "5 live signals",
  metadataLineTooltip,
}: CompanyHealthHeaderProps) {
  const defaultLiveSignalsTooltip = useMemo(
    () => (
      <div className="space-y-2">
        <p className="text-xs font-semibold text-foreground">Five live signals</p>
        <ul className="list-disc space-y-1 pl-3 text-[11px] leading-snug text-muted-foreground">
          <li>Overall health score and month-over-month trend</li>
          {metrics.map((m) => (
            <li key={m.key}>
              {m.label}
              {m.key === "market"
                ? " — category and competitive positioning"
                : m.key === "financial"
                  ? " — burn, runway, and capital efficiency"
                  : m.key === "gtm"
                    ? " — channel mix and acquisition motion"
                    : " — moat, IP, and long-term defensibility"}
            </li>
          ))}
        </ul>
      </div>
    ),
    [metrics],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-muted/10 dark:bg-muted/10">
      <div className="px-3 py-2.5 sm:px-3.5 sm:py-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-stretch sm:gap-0">
          {/* Zone 1 — micro-label + one cohesive identity row (logo + text stack incl. live signals); centered vs metrics height on sm+ */}
          <div className="flex min-h-0 min-w-0 shrink-0 flex-col sm:h-full sm:max-w-[min(100%,17rem)] sm:justify-center sm:self-stretch">
            <div className="flex flex-col gap-1">
              <p className="text-[9px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                AI command center
              </p>
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "relative flex h-[4.2rem] w-[4.2rem] shrink-0 items-center justify-center overflow-hidden rounded-md sm:h-[4.7rem] sm:w-[4.7rem]",
                    "border border-border/22 bg-muted/20 shadow-none dark:border-white/[0.07] dark:bg-white/[0.04]",
                  )}
                >
                  <CompanySettingsLogo
                    companyName={name}
                    logoUrl={logoUrl}
                    websiteUrl={websiteUrl}
                    size={128}
                    hasProfile={hasProfile}
                    imgClassName="h-full w-full object-contain p-1 opacity-[0.97]"
                    initialClassName="text-lg font-semibold tabular-nums text-muted-foreground/90 sm:text-xl"
                    iconClassName="h-7 w-7 text-muted-foreground/40 sm:h-8 sm:w-8"
                  />
                </div>
                <div className="min-w-0 flex flex-col justify-center gap-0.5 leading-tight">
                  <h2 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{name}</h2>
                  <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-foreground/55">Company health</p>
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          className="flex w-fit max-w-full cursor-help items-center gap-1.5 rounded-sm text-left text-[9px] font-medium leading-none tabular-nums text-emerald-600 outline-none ring-offset-background transition-colors hover:text-emerald-700 focus-visible:ring-2 focus-visible:ring-ring dark:text-emerald-500 dark:hover:text-emerald-400"
                          aria-label={`${metadataLine}. Hover or focus for which signals are included.`}
                        >
                          <span className="relative inline-flex h-2 w-2 shrink-0 items-center justify-center" aria-hidden>
                            <span className="health-live-dot-pulse absolute h-1.5 w-1.5 rounded-full bg-emerald-500 opacity-90 dark:bg-emerald-500" />
                          </span>
                          {metadataLine}
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" align="start" className="max-w-[min(20rem,calc(100vw-2rem))] border-border/80 p-3">
                        {metadataLineTooltip ?? defaultLiveSignalsTooltip}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </div>
          </div>

          {/* Zone 2 — elastic connector */}
          <div className="hidden min-w-[0.75rem] shrink-[2] sm:block sm:min-h-0 sm:flex-1" aria-hidden />

          {/* Zone 3 — signal panel */}
          <div className="min-w-0 sm:max-w-[min(100%,20.5rem)] sm:flex-shrink-0 md:max-w-[min(100%,22rem)]">
            <IntegratedSignalPanel overallHealth={overallHealth} metrics={metrics} />
          </div>
        </div>
      </div>
      <HealthControlTabs
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={onTabChange}
        onDataClick={onDataClick}
        dataSurfaceActive={dataSurfaceActive}
      />
    </div>
  );
}

/**
 * ```tsx
 * const demo: CompanyHealthProps = {
 *   name: "Vekta",
 *   logoUrl: "/logo.svg",
 *   metadataLine: "Updated today",
 *   overallHealth: { score: 58, delta: -4.7 },
 *   metrics: [
 *     { key: "market", label: "Market", score: 51, delta: 1.1 },
 *     { key: "financial", label: "Financial", score: 52, delta: 0.7 },
 *     { key: "gtm", label: "GTM", score: 43, delta: -2.5 },
 *     { key: "defensibility", label: "Defensibility", score: 53, delta: -2.7 },
 *   ],
 *   tabs: ["Overview", "Market Position", "Financial Health", "GTM", "Defensibility"],
 *   activeTab: "Overview",
 *   onTabChange: () => {},
 * };
 *
 * <CompanyHealthHeader {...demo} hasProfile />
 * ```
 */
