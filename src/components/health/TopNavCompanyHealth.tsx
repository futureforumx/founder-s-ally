import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Building2,
  Minus,
  Shield,
  Target,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { HealthDashboard, getHealthBenchmarks, getHealthStatus } from "@/components/HealthDashboard";
import { cn } from "@/lib/utils";
import type { AnalysisResult } from "@/components/company-profile/types";
import {
  companyHealthStatus,
  deriveCompanyHealthSignals,
  getCachedCompanyHealthSignals,
  publishCompanyHealthSignals,
  type TopNavView,
} from "@/lib/companyHealthSignals";
import { fetchIntelligenceSummary, type IntelligenceSummaryStrip } from "@/lib/intelligenceFeedApi";
import { trackMixpanelEvent } from "@/lib/mixpanel";

type HealthTab = "overview" | "market" | "financial" | "gtm" | "defensibility";
type GaugeStatus = "healthy" | "warning" | "critical";

export interface TopNavCompanyHealthProps {
  score?: number | null;
  stage?: string | null;
  sector?: string | null;
  activeView: TopNavView;
  analysisResult?: AnalysisResult | null;
  companyName?: string | null;
  logoUrl?: string | null;
  hasProfile?: boolean;
}

const tabs: Array<{ id: HealthTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "market", label: "Market Position" },
  { id: "financial", label: "Financial Health" },
  { id: "gtm", label: "GTM" },
  { id: "defensibility", label: "Defensibility" },
];


function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const width = 180;
  const height = 48;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1, max - min);

  const points = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn("h-12 w-full", className)} aria-hidden>
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={points}
        className="opacity-80"
      />
    </svg>
  );
}

function viewContextNote(view: TopNavView) {
  if (["market-intelligence", "market-investors", "market-market", "market-tech", "market-network"].includes(view)) {
    return "Markets context: relative position and competitor pressure are folded into this score.";
  }
  if (["investors", "investor-search", "directory", "connections", "network"].includes(view)) {
    return "Raise readiness context: investor fit and momentum signals are weighted in this score.";
  }
  if (["data-room", "audit", "workspace"].includes(view)) {
    return "Workflows context: internal execution and benchmark discipline are reflected here.";
  }
  return "Pulse context: recent operating shifts are reflected across score drivers.";
}

export function TopNavCompanyHealth({
  score,
  stage,
  sector,
  activeView,
  analysisResult,
  companyName,
  logoUrl,
  hasProfile = false,
}: TopNavCompanyHealthProps) {
  const [hoverOpen, setHoverOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<HealthTab>("overview");
  const [tick, setTick] = useState(0);
  const [summary, setSummary] = useState<IntelligenceSummaryStrip | null>(null);
  const [scoreLineProgress, setScoreLineProgress] = useState(0);
  const [logoImgError, setLogoImgError] = useState(false);
  const trackedHoverOpenRef = useRef(false);
  const openTriggerRef = useRef<"hover" | "tap" | null>(null);
  const trackedModalOpenRef = useRef(false);
  const tabBurstTimerRef = useRef<number | null>(null);
  const actionTsRef = useRef<Record<string, number>>({});

  const derived = useMemo(
    () => deriveCompanyHealthSignals({ score, stage, sector, activeView, tick, summary, analysisResult }),
    [score, stage, sector, activeView, tick, summary, analysisResult],
  );

  const trackInteraction = useCallback(
    (action: string, props?: Record<string, unknown>) => {
      trackMixpanelEvent("Company Health Interaction", {
        action,
        score: derived.score,
        trendPct: derived.trendPct,
        activeView,
        stage,
        sector,
        ...props,
      });
    },
    [activeView, derived.score, derived.trendPct, sector, stage],
  );

  const trackInteractionThrottled = useCallback(
    (action: string, throttleMs: number, props?: Record<string, unknown>) => {
      const now = Date.now();
      const last = actionTsRef.current[action] ?? 0;
      if (now - last < throttleMs) return;
      actionTsRef.current[action] = now;
      trackInteraction(action, props);
    },
    [trackInteraction],
  );

  useEffect(() => {
    setLogoImgError(false);
  }, [logoUrl]);

  useEffect(() => {
    if (score != null) return;
    const cached = getCachedCompanyHealthSignals();
    if (cached?.score != null) {
      setTick((t) => t + 1);
    }
  }, [score]);

  useEffect(() => {
    publishCompanyHealthSignals(derived);
  }, [derived]);

  useEffect(() => {
    let cancelled = false;

    const loadSummary = async () => {
      try {
        const next = await fetchIntelligenceSummary({ hours: 24 });
        if (!cancelled) setSummary(next);
      } catch {
        if (!cancelled) {
          // Keep UI responsive even if intelligence feed is unavailable.
        setTick((t) => t + 1);
        }
      }
    };

    void loadSummary();
    const summaryTimer = window.setInterval(loadSummary, 120000);
    return () => {
      cancelled = true;
      window.clearInterval(summaryTimer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTick((t) => t + 1);
    }, 45000);
    return () => window.clearInterval(timer);
  }, []);

  const status = companyHealthStatus(derived.score);
  const topDrivers = derived.drivers.slice(0, 3);
  const canHover = typeof window !== "undefined" && window.matchMedia?.("(hover: hover)")?.matches;
  const familyImpact = useMemo(() => {
    const totals = {
      market: { sum: 0, count: 0 },
      financial: { sum: 0, count: 0 },
      gtm: { sum: 0, count: 0 },
      defensibility: { sum: 0, count: 0 },
    };

    for (const driver of derived.drivers) {
      totals[driver.family].sum += driver.impact;
      totals[driver.family].count += 1;
    }

    return {
      market: totals.market.count ? totals.market.sum / totals.market.count : 0,
      financial: totals.financial.count ? totals.financial.sum / totals.financial.count : 0,
      gtm: totals.gtm.count ? totals.gtm.sum / totals.gtm.count : 0,
      defensibility: totals.defensibility.count ? totals.defensibility.sum / totals.defensibility.count : 0,
    };
  }, [derived.drivers]);

  const marketBenchmarks = useMemo(() => getHealthBenchmarks("market", stage ?? undefined, sector ?? undefined), [stage, sector]);

  const tileStatuses = useMemo(
    () => ({
      market: getHealthStatus(derived.marketPosition, marketBenchmarks.market),
      financial: getHealthStatus(derived.financialHealth, marketBenchmarks.financial),
      gtm: getHealthStatus(derived.gtmStrength, marketBenchmarks.gtm),
      defensibility: getHealthStatus(derived.defensibility, marketBenchmarks.moat),
    }),
    [derived.marketPosition, derived.financialHealth, derived.gtmStrength, derived.defensibility, marketBenchmarks],
  );

  const tileTone = useCallback((statusLevel: GaugeStatus) => {
    if (statusLevel === "healthy") {
      return {
        bg: "bg-emerald-500/[0.03]",
        value: "text-emerald-600",
        badge: "bg-emerald-500/10 text-emerald-700/85",
      };
    }
    if (statusLevel === "warning") {
      return {
        bg: "bg-amber-500/[0.03]",
        value: "text-amber-600",
        badge: "bg-amber-500/10 text-amber-700/85",
      };
    }
    return {
      bg: "bg-rose-500/[0.03]",
      value: "text-rose-600",
      badge: "bg-rose-500/10 text-rose-700/85",
    };
  }, []);

  useEffect(() => {
    if (hoverOpen && !trackedHoverOpenRef.current) {
      trackedHoverOpenRef.current = true;
      trackInteraction("expand_opened", { trigger: openTriggerRef.current ?? "hover" });
    }
    if (!hoverOpen) {
      trackedHoverOpenRef.current = false;
      openTriggerRef.current = null;
    }
  }, [hoverOpen, trackInteraction]);

  useEffect(() => {
    if (modalOpen && !trackedModalOpenRef.current) {
      trackedModalOpenRef.current = true;
      trackInteraction("modal_opened", { tab: activeTab });
    }
    if (!modalOpen) {
      trackedModalOpenRef.current = false;
    }
  }, [activeTab, modalOpen, trackInteraction]);

  useEffect(() => {
    if (!modalOpen) {
      setScoreLineProgress(0);
      return;
    }

    const raf = window.requestAnimationFrame(() => {
      setScoreLineProgress(1);
    });

    return () => {
      window.cancelAnimationFrame(raf);
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    if (tabBurstTimerRef.current != null) window.clearTimeout(tabBurstTimerRef.current);
    tabBurstTimerRef.current = window.setTimeout(() => {
      trackInteraction("modal_tab_selected", { tab: activeTab, mode: "debounced_burst" });
      tabBurstTimerRef.current = null;
    }, 550);

    return () => {
      if (tabBurstTimerRef.current != null) {
        window.clearTimeout(tabBurstTimerRef.current);
      }
    };
  }, [activeTab, modalOpen, trackInteraction]);

  const trendIcon =
    derived.trendPct > 0 ? (
      <ArrowUpRight className="h-3.5 w-3.5" />
    ) : derived.trendPct < 0 ? (
      <ArrowDownRight className="h-3.5 w-3.5" />
    ) : (
      <Minus className="h-3.5 w-3.5" />
    );

  const trendText = `${derived.trendPct > 0 ? "+" : ""}${derived.trendPct}%`;

  return (
    <>
      <Popover
        open={hoverOpen}
        onOpenChange={(open) => {
          setHoverOpen(open);
        }}
      >
        <div
          onMouseEnter={() => {
            if (canHover) {
              openTriggerRef.current = "hover";
              setHoverOpen(true);
            }
          }}
          onMouseLeave={() => {
            if (canHover) setHoverOpen(false);
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="Open company health"
              onClick={() => {
                if (canHover) {
                  setModalOpen(true);
                  setHoverOpen(false);
                  trackInteractionThrottled("chip_clicked", 1000, { opens: "modal" });
                } else {
                  openTriggerRef.current = "tap";
                  setHoverOpen((v) => !v);
                  trackInteractionThrottled("chip_tapped", 1000, { opens: "expand" });
                }
              }}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold tabular-nums transition-all",
                "backdrop-blur-sm hover:shadow-sm",
                status.border,
                status.bg,
                status.text,
              )}
            >
              <span className="hidden text-[10px] font-medium uppercase tracking-wider text-muted-foreground md:inline">Health</span>
              <span className="text-sm leading-none">{derived.score}</span>
              <span className="inline-flex items-center gap-0.5 text-[11px] leading-none">
                {trendIcon}
                {trendText}
              </span>
              <span className={cn("h-1.5 w-1.5 rounded-full", status.dot)} />
            </button>
          </PopoverTrigger>

          <PopoverContent
            align="end"
            side="bottom"
            sideOffset={10}
            className="w-[min(94vw,360px)] rounded-2xl border border-border/60 bg-popover/95 p-3 shadow-xl backdrop-blur-xl"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Company Health</p>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-2xl font-semibold tabular-nums text-foreground">{derived.score}</span>
                    <span
                      className={cn(
                        "inline-flex items-center gap-0.5 text-xs font-semibold",
                        derived.trendPct >= 0 ? "text-emerald-600" : "text-rose-600",
                      )}
                    >
                      {trendIcon}
                      {trendText}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{status.label} · live signal layer</p>
                </div>
                <div className={cn("mt-1 h-2.5 w-2.5 rounded-full", status.dot)} />
              </div>

              <div className={cn("rounded-xl border px-2.5 py-2", status.border, status.bg, status.text)}>
                <Sparkline values={derived.sparkline} />
              </div>

              <ul className="space-y-1.5">
                {topDrivers.map((driver) => (
                  <li key={driver.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
                    <span className="text-[11px] text-foreground">{driver.label}</span>
                    <span
                      className={cn(
                        "text-[11px] font-semibold tabular-nums",
                        driver.impact >= 0 ? "text-emerald-600" : "text-rose-600",
                      )}
                    >
                      {driver.impact >= 0 ? "+" : ""}
                      {driver.impact.toFixed(1)}
                    </span>
                  </li>
                ))}
              </ul>

              <p className="text-[11px] leading-relaxed text-muted-foreground">{viewContextNote(activeView)}</p>

              <button
                type="button"
                onClick={() => {
                  setModalOpen(true);
                  setHoverOpen(false);
                  trackInteractionThrottled("expand_cta_clicked", 1000, { opens: "modal" });
                }}
                className="w-full rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent/90"
              >
                Open Company Health
              </button>
            </div>
          </PopoverContent>
        </div>
      </Popover>

      <Dialog
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setActiveTab("overview");
        }}
      >
        <DialogContent className="left-0 top-0 h-screen max-h-screen w-screen max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 p-0">
          <div className="flex h-full flex-col bg-background">
            <div className="border-b border-border/60 px-5 pt-1 pb-1">
              <div className="flex items-start justify-between gap-2 pr-8">
                <div>
                  <p className="m-0 inline-flex items-center gap-1.5 text-[10px] font-mono uppercase leading-none tracking-wide text-success/80">
                    <span
                      className="h-2 w-2 rounded-full bg-success animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite]"
                      aria-hidden
                    />
                    Always On Intelligence
                  </p>
                  <div className="mt-0 flex items-center gap-4">
                    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/30">
                      {logoUrl && !logoImgError ? (
                        <img
                          src={logoUrl}
                          alt=""
                          className="h-full w-full object-contain rounded-xl"
                          onError={() => setLogoImgError(true)}
                        />
                      ) : hasProfile ? (
                        <span className="text-base font-bold text-muted-foreground">
                          {companyName?.charAt(0).toUpperCase() || "?"}
                        </span>
                      ) : (
                        <Building2 className="h-6 w-6 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="space-y-1.5 py-0.5">
                      <h2 className="text-[1.5rem] font-bold leading-tight tracking-tight text-foreground">
                        {hasProfile ? companyName || "My Company" : "My Company"}
                      </h2>
                      <p className="text-xs uppercase leading-snug tracking-[0.08em] text-muted-foreground/80">Company Health</p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3 sm:auto-rows-fr">
                  <div
                    className={cn(
                      "relative col-span-2 overflow-hidden rounded-lg px-[0.675rem] py-[0.675rem] sm:col-span-1 sm:row-span-2",
                      "flex flex-col justify-between",
                      derived.score >= 70
                        ? "bg-emerald-500/[0.03]"
                        : derived.score >= 40
                          ? "bg-amber-500/[0.03]"
                          : "bg-rose-500/[0.03]",
                    )}
                  >
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Health</p>
                    <div className="mt-2 flex items-end justify-between gap-1.5">
                      <p className={cn("text-[1.75rem] font-extrabold tabular-nums leading-none", status.text)}>{derived.score}</p>
                      <span
                        className={cn(
                          "inline-flex rounded-sm px-1 py-px text-[9px] font-medium leading-none tabular-nums",
                          derived.trendPct > 0
                            ? "bg-emerald-500/10 text-emerald-700/85"
                            : derived.trendPct < 0
                              ? "bg-rose-500/10 text-rose-700/85"
                              : "bg-muted/70 text-muted-foreground",
                        )}
                      >
                        {derived.trendPct > 0 ? "+" : ""}
                        {derived.trendPct}%
                      </span>
                    </div>
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border/35" aria-hidden>
                      <span
                        className={cn(
                          "block h-full origin-left animate-pulse transition-transform duration-700 ease-out",
                          derived.score >= 70
                            ? "bg-gradient-to-r from-emerald-500/70 via-emerald-400/45 to-transparent"
                            : derived.score >= 40
                              ? "bg-gradient-to-r from-amber-500/70 via-amber-400/45 to-transparent"
                              : "bg-gradient-to-r from-rose-500/70 via-rose-400/45 to-transparent",
                        )}
                        style={{ transform: `scaleX(${scoreLineProgress})` }}
                      />
                    </span>
                  </div>
                  <div className={cn("relative overflow-hidden rounded-lg px-[0.675rem] py-[0.675rem]", tileTone(tileStatuses.market).bg)}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Market</p>
                    <div className="mt-1 flex items-center justify-between gap-1.5">
                      <p className={cn("text-[1.05rem] font-bold tabular-nums leading-none", tileTone(tileStatuses.market).value)}>{derived.marketPosition}</p>
                      <span
                        className={cn(
                          "inline-flex rounded-sm px-1 py-px text-[9px] font-medium leading-none tabular-nums",
                          tileTone(tileStatuses.market).badge,
                        )}
                      >
                        {familyImpact.market > 0 ? "+" : ""}
                        {familyImpact.market.toFixed(1)}
                      </span>
                    </div>
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border/35" aria-hidden>
                      <span
                        className="block h-full origin-left animate-pulse bg-gradient-to-r from-sky-500/70 via-sky-400/45 to-transparent transition-transform duration-700 ease-out"
                        style={{ transform: `scaleX(${scoreLineProgress})` }}
                      />
                    </span>
                  </div>
                  <div className={cn("relative overflow-hidden rounded-lg px-[0.675rem] py-[0.675rem]", tileTone(tileStatuses.financial).bg)}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Financial</p>
                    <div className="mt-1 flex items-center justify-between gap-1.5">
                      <p className={cn("text-[1.05rem] font-bold tabular-nums leading-none", tileTone(tileStatuses.financial).value)}>{derived.financialHealth}</p>
                      <span
                        className={cn(
                          "inline-flex rounded-sm px-1 py-px text-[9px] font-medium leading-none tabular-nums",
                          tileTone(tileStatuses.financial).badge,
                        )}
                      >
                        {familyImpact.financial > 0 ? "+" : ""}
                        {familyImpact.financial.toFixed(1)}
                      </span>
                    </div>
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border/35" aria-hidden>
                      <span
                        className="block h-full origin-left animate-pulse bg-gradient-to-r from-violet-500/70 via-violet-400/45 to-transparent transition-transform duration-700 ease-out"
                        style={{ transform: `scaleX(${scoreLineProgress})` }}
                      />
                    </span>
                  </div>
                  <div className={cn("relative overflow-hidden rounded-lg px-[0.675rem] py-[0.675rem]", tileTone(tileStatuses.gtm).bg)}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">GTM</p>
                    <div className="mt-1 flex items-center justify-between gap-1.5">
                      <p className={cn("text-[1.05rem] font-bold tabular-nums leading-none", tileTone(tileStatuses.gtm).value)}>{derived.gtmStrength}</p>
                      <span
                        className={cn(
                          "inline-flex rounded-sm px-1 py-px text-[9px] font-medium leading-none tabular-nums",
                          tileTone(tileStatuses.gtm).badge,
                        )}
                      >
                        {familyImpact.gtm > 0 ? "+" : ""}
                        {familyImpact.gtm.toFixed(1)}
                      </span>
                    </div>
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border/35" aria-hidden>
                      <span
                        className="block h-full origin-left animate-pulse bg-gradient-to-r from-orange-500/70 via-orange-400/45 to-transparent transition-transform duration-700 ease-out"
                        style={{ transform: `scaleX(${scoreLineProgress})` }}
                      />
                    </span>
                  </div>
                  <div className={cn("relative overflow-hidden rounded-lg px-[0.675rem] py-[0.675rem]", tileTone(tileStatuses.defensibility).bg)}>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Defensibility</p>
                    <div className="mt-1 flex items-center justify-between gap-1.5">
                      <p className={cn("text-[1.05rem] font-bold tabular-nums leading-none", tileTone(tileStatuses.defensibility).value)}>{derived.defensibility}</p>
                      <span
                        className={cn(
                          "inline-flex rounded-sm px-1 py-px text-[9px] font-medium leading-none tabular-nums",
                          tileTone(tileStatuses.defensibility).badge,
                        )}
                      >
                        {familyImpact.defensibility > 0 ? "+" : ""}
                        {familyImpact.defensibility.toFixed(1)}
                      </span>
                    </div>
                    <span className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border/35" aria-hidden>
                      <span
                        className="block h-full origin-left animate-pulse bg-gradient-to-r from-amber-500/70 via-amber-400/45 to-transparent transition-transform duration-700 ease-out"
                        style={{ transform: `scaleX(${scoreLineProgress})` }}
                      />
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-0 border-t border-border/60 bg-muted/15 pt-0.5">
                <div className="flex flex-wrap gap-1 rounded-xl bg-muted/35 p-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      activeTab === tab.id
                        ? "bg-background/95 text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-background/40 hover:text-foreground/90",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {activeTab === "overview" && (
                <HealthDashboard
                  stage={stage ?? undefined}
                  sector={sector ?? undefined}
                  analysisResult={analysisResult}
                  familyScores={{
                    market: derived.marketPosition,
                    financial: derived.financialHealth,
                    gtm: derived.gtmStrength,
                    defensibility: derived.defensibility,
                  }}
                />
              )}

              {activeTab !== "overview" && (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    {topDrivers
                      .filter((driver) => (activeTab === "market" ? driver.family === "market" : true))
                      .filter((driver) => (activeTab === "financial" ? driver.family === "financial" : true))
                      .filter((driver) => (activeTab === "gtm" ? driver.family === "gtm" : true))
                      .filter((driver) => (activeTab === "defensibility" ? driver.family === "defensibility" : true))
                      .map((driver) => (
                        <div key={driver.id} className="rounded-xl border border-border/60 bg-card/50 p-4">
                          <p className="text-sm font-medium text-foreground">{driver.label}</p>
                          <p
                            className={cn(
                              "mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                              driver.impact >= 0
                                ? "bg-emerald-500/10 text-emerald-600"
                                : "bg-rose-500/10 text-rose-600",
                            )}
                          >
                            {driver.impact >= 0 ? "+" : ""}
                            {driver.impact.toFixed(1)} impact
                          </p>
                        </div>
                      ))}
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                      <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                        <BarChart3 className="h-3.5 w-3.5" />
                        Pulse
                      </p>
                      <p className="mt-2 text-sm text-foreground">Health driver deltas feed Pulse alerts for high-priority shifts.</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                      <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                        <Target className="h-3.5 w-3.5" />
                        Markets
                      </p>
                      <p className="mt-2 text-sm text-foreground">Relative competitor pressure and category momentum refine positioning.</p>
                    </div>
                    <div className="rounded-xl border border-border/60 bg-card/50 p-4">
                      <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                        <Wallet className="h-3.5 w-3.5" />
                        Raise Readiness
                      </p>
                      <p className="mt-2 text-sm text-foreground">Financial + GTM signals update readiness narrative for investor conversations.</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                    <p className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <Shield className="h-3.5 w-3.5" />
                      {tabs.find((tab) => tab.id === activeTab)?.label}
                    </p>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                      {analysisResult?.executiveSummary ||
                        "This panel mirrors the same Company Health model used across dashboard, market intelligence, and workflows, with instant top-nav access."}
                    </p>
                    <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-foreground">
                      <TrendingUp className="h-3.5 w-3.5 text-emerald-600" />
                      {viewContextNote(activeView)}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}