import { useEffect, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Building2, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

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
  overallHealth: { score: number; delta: number };
  metrics: CompanyHealthMetric[];
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  /** e.g. "Updated today" / "5 live signals" — tight metadata under identity */
  metadataLine?: string;
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

function statusTextClass(tone: HealthScoreStatus["tone"]) {
  if (tone === "good") return "text-emerald-600 dark:text-emerald-400";
  if (tone === "neutralweak") return "text-amber-800 dark:text-amber-300";
  return "text-rose-600 dark:text-rose-400";
}

function MetricProgressRule({ score }: { score: number }) {
  const w = Math.min(100, Math.max(0, score));
  return (
    <div
      className="mt-1 h-px w-full overflow-hidden rounded-full bg-border/45 dark:bg-border/50"
      aria-hidden
    >
      <div
        className="h-full rounded-full bg-foreground/18 transition-[width] duration-300 dark:bg-foreground/22"
        style={{ width: `${w}%` }}
      />
    </div>
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
        "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-border/50 bg-muted/30 dark:bg-muted/[0.12] sm:flex-row",
        "shadow-[0_1px_0_rgba(0,0,0,0.04)] dark:shadow-[0_1px_0_rgba(255,255,255,0.03)]",
      )}
    >
      {/* Left rail — overall */}
      <div
        className={cn(
          "flex shrink-0 flex-col justify-center border-border/40 border-b px-3 py-1.5 sm:w-[min(100%,9.25rem)] sm:border-b-0 sm:border-e sm:py-2 sm:pe-3",
        )}
      >
        <p className="text-[9px] font-semibold uppercase tracking-[0.05em] text-foreground/65">Overall health</p>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span
            className={cn(
              "text-4xl font-semibold leading-none tracking-tight tabular-nums sm:text-[2.125rem]",
              "text-amber-950 dark:text-amber-300",
            )}
          >
            {Math.round(overallHealth.score)}
          </span>
          <DeltaBadge delta={overallHealth.delta} mode="percent" className="shrink-0" />
        </div>
        <p className="mt-0.5 text-[9px] font-medium leading-none tabular-nums text-muted-foreground">this month</p>
        <div
          className="mt-1 h-px w-full overflow-hidden rounded-full bg-border/50 dark:bg-border/45"
          aria-hidden
        >
          <div
            className="h-full rounded-full bg-amber-500/55 transition-[width] duration-500 dark:bg-amber-400/50"
            style={{ width: `${overallW}%` }}
          />
        </div>
        <div className="mt-1">
          <span
            className={cn(
              "inline-flex items-center rounded border border-current/20 px-1.5 py-px text-[10px] font-semibold tabular-nums leading-none",
              statusTextClass(status.tone),
            )}
          >
            {status.label}
          </span>
        </div>
      </div>

      {/* Right matrix */}
      <div className="grid min-w-0 flex-1 grid-cols-2 bg-border/[0.18] dark:bg-border/25 [gap:1px]">
        {metrics.map((m) => (
          <div
            key={m.key}
            className={cn(
              "group flex min-w-0 flex-col justify-center bg-muted/25 px-2.5 py-1.5 dark:bg-muted/20",
              "transition-[background-color,box-shadow] duration-200",
              "hover:bg-muted/40",
              "hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] dark:hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)]",
            )}
          >
            <p className="text-[9px] font-semibold uppercase tracking-[0.05em] text-foreground/65">{m.label}</p>
            <div className="mt-0.5 flex items-baseline justify-between gap-2">
              <span className="text-lg font-semibold tabular-nums leading-none text-foreground sm:text-xl">
                {Math.round(m.score)}
              </span>
              <DeltaBadge delta={m.delta} mode="points" className="shrink-0" />
            </div>
            <MetricProgressRule score={m.score} />
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
}: {
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  return (
    <nav
      className="flex flex-wrap items-stretch gap-x-0.5 border-t border-border/40 bg-muted/10 px-2 dark:bg-muted/5"
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
  );
}

export function CompanyHealthHeader({
  name,
  logoUrl,
  hasProfile = true,
  overallHealth,
  metrics,
  tabs,
  activeTab,
  onTabChange,
  metadataLine = "5 live signals",
}: CompanyHealthHeaderProps) {
  const [logoErr, setLogoErr] = useState(false);

  useEffect(() => {
    setLogoErr(false);
  }, [logoUrl]);

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-muted/10 dark:bg-muted/10">
      <div className="px-3 py-2.5 sm:px-3.5 sm:py-3">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-stretch sm:gap-0">
          {/* Zone 1 — identity: micro label / main row (logo + name block) / metadata */}
          <div className="flex min-w-0 shrink-0 flex-col gap-1 sm:max-w-[min(100%,17rem)]">
            <p className="text-[9px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
              AI command center
            </p>
            <div className="flex items-center gap-2.5">
              <div className="relative flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/45 bg-background sm:h-20 sm:w-20">
                {logoUrl && !logoErr ? (
                  <img
                    src={logoUrl}
                    alt=""
                    className="h-full w-full object-contain p-1"
                    onError={() => setLogoErr(true)}
                  />
                ) : hasProfile ? (
                  <span className="text-xl font-semibold tabular-nums text-muted-foreground sm:text-2xl">
                    {name.charAt(0).toUpperCase() || "?"}
                  </span>
                ) : (
                  <Building2 className="h-8 w-8 text-muted-foreground/45 sm:h-9 sm:w-9" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex flex-col justify-center gap-0.5 leading-tight">
                <h2 className="truncate text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{name}</h2>
                <p className="text-[10px] font-medium uppercase tracking-[0.06em] text-foreground/55">Company health</p>
              </div>
            </div>
            <p className="pt-0.5 text-[9px] font-medium tabular-nums text-muted-foreground">{metadataLine}</p>
          </div>

          {/* Zone 2 — elastic connector */}
          <div className="hidden min-w-[0.75rem] shrink-[2] sm:block sm:min-h-0 sm:flex-1" aria-hidden />

          {/* Zone 3 — signal panel */}
          <div className="min-w-0 sm:max-w-[min(100%,20.5rem)] sm:flex-shrink-0 md:max-w-[min(100%,22rem)]">
            <IntegratedSignalPanel overallHealth={overallHealth} metrics={metrics} />
          </div>
        </div>
      </div>
      <HealthControlTabs tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />
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
