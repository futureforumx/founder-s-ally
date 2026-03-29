import { useState } from "react";
import { Lock, Sliders } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimeRange } from "./TimeRangeControl";

interface KPICardProps {
  label: string;
  value: string;
  change?: string;
  subtitle?: string;
  size?: "large" | "small";
  trend?: "up" | "neutral";
}

function KPICard({ label, value, change, subtitle, size = "small", trend = "neutral" }: KPICardProps) {
  const isLarge = size === "large";
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-[20px] border border-slate-700/40 p-6 transition-all duration-200 hover:border-slate-600/60 hover:shadow-lg",
        "bg-gradient-to-br from-slate-900/80 via-slate-900/70 to-slate-950/80",
        isLarge ? "col-span-2 row-span-1" : ""
      )}
    >
      {/* Subtle gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-400/5 via-transparent to-transparent pointer-events-none" />
      
      {/* Content */}
      <div className="relative z-10 flex flex-col h-full">
        <div className="flex items-start justify-between mb-8">
          <div className="flex-1">
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400/70 mb-1">
              {label}
            </p>
            {subtitle && (
              <p className="text-sm text-slate-300/60">{subtitle}</p>
            )}
          </div>
        </div>

        <div className="mt-auto">
          <div className="flex items-baseline gap-2 mb-2">
            <span className={cn(
              "font-semibold tracking-tight text-white",
              isLarge ? "text-4xl" : "text-3xl"
            )}>
              {value}
            </span>
            {change && (
              <span className={cn(
                "text-sm font-medium flex items-center gap-0.5",
                trend === "up" ? "text-emerald-400/80" : "text-slate-400/60"
              )}>
                {trend === "up" && "↑"}
                {change}
              </span>
            )}
          </div>
          {isLarge && (
            <p className="text-xs text-slate-400/50">vs last year</p>
          )}
        </div>
      </div>
    </div>
  );
}

interface VerificationBannerProps {
  isVerified: boolean;
  onNavigateToProfile: () => void;
}

function VerificationBanner({ isVerified, onNavigateToProfile }: VerificationBannerProps) {
  if (isVerified) return null;
  
  return (
    <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-50/5 px-4 py-3 backdrop-blur-sm">
      <Lock className="h-4 w-4 text-amber-500/60 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-200">
          Confirm your company profile to unlock full matching
        </p>
      </div>
      <button
        onClick={onNavigateToProfile}
        className="flex-shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 text-amber-400/90 hover:bg-amber-500/30 transition-colors"
      >
        Complete
      </button>
    </div>
  );
}

const TABS = [
  { id: "updates", label: "Updates" },
  { id: "matches", label: "Matches" },
  { id: "activity", label: "Activity" },
  { id: "my-investors", label: "My Investors" },
] as const;

interface InvestorMatchSectionProps {
  isVerified?: boolean;
  onNavigateToProfile?: () => void;
  investorsMatched?: number;
  investorsChange?: string;
  sectorHeat?: string;
  sectorStatus?: "accelerating" | "stable" | "cooling";
  capitalActivity?: string;
  capitalChange?: string;
  activeTab?: "updates" | "matches" | "activity" | "my-investors";
  onTabChange?: (tab: "updates" | "matches" | "activity" | "my-investors") => void;
  timeRange?: TimeRange;
  onTimeRangeChange?: (range: TimeRange) => void;
  onTuneClick?: () => void;
}

export function InvestorMatchSection({
  isVerified = false,
  onNavigateToProfile,
  investorsMatched = 147,
  investorsChange = "+52.1%",
  sectorHeat = "PropTech & Construction Tech",
  sectorStatus = "accelerating",
  capitalActivity = "Median Seed Check",
  capitalChange = "+$125K",
  activeTab = "matches",
  onTabChange,
  timeRange = "ytd",
  onTimeRangeChange,
  onTuneClick,
}: InvestorMatchSectionProps) {
  const [internalTab, setInternalTab] = useState(activeTab);
  const [internalTimeRange, setInternalTimeRange] = useState(timeRange);

  const handleTabChange = (tab: typeof internalTab) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  const handleTimeRangeChange = (range: TimeRange) => {
    setInternalTimeRange(range);
    onTimeRangeChange?.(range);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Verification Banner */}
      <VerificationBanner isVerified={isVerified} onNavigateToProfile={onNavigateToProfile || (() => {})} />

      {/* Header + Toolbar */}
      <div className="flex items-end justify-between gap-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-white mb-1">
            Investor Match
          </h1>
          <p className="text-sm text-slate-400">
            AI-driven investor discovery based on your profile and current cap table
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={onTuneClick}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700/40 bg-slate-900/40 text-xs font-medium text-slate-300 hover:bg-slate-800/60 hover:border-slate-600/40 transition-all"
          >
            <Sliders className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Tune</span>
          </button>

          {/* Time Range Buttons */}
          <div className="flex items-center gap-0.5 rounded-lg bg-slate-800/40 p-0.5 border border-slate-700/30">
            {(["week", "month", "quarter", "ytd"] as const).map((range) => (
              <button
                key={range}
                onClick={() => handleTimeRangeChange(range)}
                className={cn(
                  "px-2.5 py-1 text-[11px] font-medium rounded-md transition-all duration-200",
                  internalTimeRange === range
                    ? "bg-slate-700/60 text-white shadow-sm"
                    : "text-slate-400/70 hover:text-slate-300"
                )}
              >
                {range === "week"
                  ? "Week"
                  : range === "month"
                  ? "Month"
                  : range === "quarter"
                  ? "Quarter"
                  : "YTD"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Grid - 1 large + 2 small */}
      <div className="grid grid-cols-3 gap-4">
        <KPICard
          size="large"
          label="Investors Matched"
          value={investorsMatched.toString()}
          change={investorsChange}
          trend="up"
        />
        <KPICard
          size="small"
          label="Sector Heat"
          subtitle={sectorHeat}
          value={sectorStatus === "accelerating" ? "🔥 Accelerating" : sectorStatus === "stable" ? "→ Stable" : "❄️ Cooling"}
        />
        <KPICard
          size="small"
          label="Capital Activity"
          value={capitalActivity}
          change={capitalChange}
          trend="up"
        />
      </div>

      {/* Tabs */}
      <div>
        <div className="flex w-fit items-center gap-1 rounded-full border border-slate-700/70 bg-slate-900/55 p-1 shadow-sm backdrop-blur-sm">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id as typeof internalTab)}
              className={cn(
                "inline-flex items-center rounded-full px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] transition-all",
                internalTab === tab.id
                  ? "bg-slate-800 text-white shadow-sm ring-1 ring-slate-600/60"
                  : "text-slate-400/70 hover:bg-slate-800/50 hover:text-slate-200"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content Placeholder */}
      <div className="min-h-[400px] rounded-xl border border-slate-800/40 bg-slate-950/20 p-8 flex items-center justify-center">
        <p className="text-slate-400/50 text-sm">
          {internalTab === "matches" && "Investor matches will appear here"}
          {internalTab === "updates" && "Recent updates from your investors"}
          {internalTab === "activity" && "Your recent investor activity"}
          {internalTab === "my-investors" && "Your confirmed investors"}
        </p>
      </div>
    </div>
  );
}
