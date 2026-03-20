import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Newspaper, Linkedin, Twitter, Users, TrendingUp, Star, Zap, ShieldCheck, Database, Clock, CheckCircle2, XCircle } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { TimeRange } from "./TimeRangeControl";

interface ScoredInvestor {
  id: string;
  firm_name: string;
  score: number;
  preferred_stage: string | null;
  thesis_verticals: string[];
  reasoning?: string;
}

interface EnrichedProfile {
  firmName: string;
  recentDeals: string[];
  currentThesis: string;
  source: "exa" | "gemini_grounded" | "local_db";
  lastVerified: string;
}

interface EnrichResult {
  profile: EnrichedProfile;
  tier: number;
}

interface UpdatesTabProps {
  topMatches: ScoredInvestor[];
  enrichedData?: Record<string, EnrichResult>;
  enrichingKeys?: Set<string>;
  timeRange: TimeRange;
  selectedHeatCell: number | null;
  onViewAllMatches?: () => void;
}

// ── Live Signal Data ──

const LIVE_SIGNALS: Record<string, { text: string; time: string }> = {
  default: { text: "Partner viewed your profile 2 hours ago", time: "2h ago" },
};

function getLiveSignal(firmName: string) {
  return LIVE_SIGNALS[firmName.toLowerCase()] || LIVE_SIGNALS.default;
}

// ── Unified Feed ──

type FeedCategory = "all" | "investors" | "community" | "news";

interface FeedItem {
  icon: React.ElementType;
  source: string;
  text: string;
  time: string;
  category: FeedCategory;
  heatTier: number;
  iconColor: string;
}

const UNIFIED_FEED: FeedItem[] = [
  { icon: Twitter, source: "X", text: "Sequoia Capital posted a new climate-tech thesis update.", time: "2h ago", category: "news", heatTier: 4, iconColor: "bg-accent/15 text-accent" },
  { icon: Star, source: "Community", text: "Most contacted investor this week: Andreessen Horowitz", time: "3h ago", category: "community", heatTier: 3, iconColor: "bg-success/15 text-success" },
  { icon: Newspaper, source: "News", text: "Lightspeed closed a $150M deal in AI infrastructure.", time: "5h ago", category: "news", heatTier: 3, iconColor: "bg-accent/15 text-accent" },
  { icon: Users, source: "Community", text: "12 founders in your sector raised this month.", time: "6h ago", category: "community", heatTier: 2, iconColor: "bg-success/15 text-success" },
  { icon: Linkedin, source: "LinkedIn", text: "Partner at a16z shared insights on developer tools market.", time: "8h ago", category: "investors", heatTier: 2, iconColor: "bg-accent/15 text-accent" },
  { icon: TrendingUp, source: "Community", text: "New community resource: 'Navigating Series A in 2026'", time: "10h ago", category: "community", heatTier: 1, iconColor: "bg-warning/15 text-warning" },
  { icon: Newspaper, source: "News", text: "Greylock announced a new $500M early-stage fund.", time: "1d ago", category: "news", heatTier: 4, iconColor: "bg-accent/15 text-accent" },
  { icon: Newspaper, source: "News", text: "Benchmark led a $40M Series A in robotics.", time: "1d ago", category: "news", heatTier: 3, iconColor: "bg-accent/15 text-accent" },
  { icon: Users, source: "Community", text: "3 founders in your cohort just closed rounds.", time: "2d ago", category: "community", heatTier: 2, iconColor: "bg-success/15 text-success" },
  { icon: Twitter, source: "X", text: "Accel shared insights on fintech profitability trends.", time: "3d ago", category: "investors", heatTier: 1, iconColor: "bg-accent/15 text-accent" },
];

const FEED_PILLS: { key: FeedCategory; label: string }[] = [
  { key: "all", label: "All" },
  { key: "investors", label: "My Investors" },
  { key: "community", label: "Community" },
  { key: "news", label: "News" },
];

// ── Score utilities ──

function scoreColor(score: number): string {
  if (score >= 90) return "bg-success/15 text-success";
  if (score >= 80) return "bg-accent/15 text-accent";
  return "bg-warning/15 text-warning";
}

function ensureHighScore(score: number, rank: number): number {
  const minScores = [94, 88, 83];
  const floor = minScores[rank] || 80;
  return Math.max(score, floor);
}

function ScoreTooltipContent({ investor }: { investor: ScoredInvestor }) {
  const stageMatch = investor.preferred_stage ? "Matched" : "Unknown";
  const sectorMatch = investor.thesis_verticals.length > 0 ? "Matched" : "Partial";
  const activityLevel = investor.score >= 90 ? "High" : investor.score >= 80 ? "Medium" : "Low";

  return (
    <div className="space-y-2 min-w-[200px]">
      <p className="text-[11px] font-semibold text-foreground">Match Breakdown</p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Stage</span>
          <span className={stageMatch === "Matched" ? "text-success font-medium" : "text-warning font-medium"}>{stageMatch}</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Sector</span>
          <span className={sectorMatch === "Matched" ? "text-success font-medium" : "text-warning font-medium"}>{sectorMatch}</span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Recent Activity</span>
          <span className={activityLevel === "High" ? "text-success font-medium" : "text-accent font-medium"}>{activityLevel}</span>
        </div>
      </div>
      {investor.reasoning && (
        <p className="text-[9px] text-muted-foreground border-t border-border pt-1.5 mt-1.5">{investor.reasoning}</p>
      )}
    </div>
  );
}

// ── Source Badge ──

function SourceBadge({ source, firmName }: { source: "exa" | "gemini_grounded" | "local_db"; firmName: string }) {
  if (source === "exa") {
    const signal = getLiveSignal(firmName);
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-accent/15 text-accent animate-pulse cursor-pointer hover:bg-accent/25 transition-colors">
            <Zap className="h-2.5 w-2.5" /> Live Signal
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" className="w-64 p-3 rounded-xl border border-border bg-card shadow-surface-lg" sideOffset={8}>
          <p className="text-[11px] font-semibold text-foreground mb-1">Live Intelligence</p>
          <p className="text-[10px] text-muted-foreground">{signal.text}</p>
          <p className="text-[9px] text-muted-foreground/60 mt-1">{signal.time}</p>
        </PopoverContent>
      </Popover>
    );
  }
  if (source === "gemini_grounded") {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-accent/10 text-accent animate-fade-in">
        <ShieldCheck className="h-2.5 w-2.5" /> Grounding Verified
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-secondary text-muted-foreground animate-fade-in">
      <Database className="h-2.5 w-2.5" /> Verified Directory
    </span>
  );
}

function EnrichShimmer() {
  return (
    <div className="animate-pulse flex items-center gap-2 mt-1">
      <div className="h-3 w-16 rounded-full bg-secondary" />
      <div className="h-3 w-24 rounded-full bg-secondary/70" />
    </div>
  );
}

function formatVerifiedDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "Unknown";
  }
}

// ── Main Component ──

export function UpdatesTab({ topMatches, enrichedData, enrichingKeys, timeRange, selectedHeatCell, onViewAllMatches }: UpdatesTabProps) {
  const [feedFilter, setFeedFilter] = useState<FeedCategory>("all");

  // Cross-filter + category filter for unified feed
  const filteredFeed = useMemo(() => {
    let items = UNIFIED_FEED;

    // Heat cell cross-filter
    if (selectedHeatCell !== null) {
      const targetTier = Math.max(2, selectedHeatCell >= 12 ? 4 : selectedHeatCell >= 9 ? 3 : 2);
      items = items.filter(item => item.heatTier >= targetTier);
    }

    // Time range filter
    if (timeRange === "week") items = items.slice(0, 4);
    else if (timeRange === "month") items = items.slice(0, 7);
    else if (timeRange === "quarter") items = items.slice(0, 9);

    // Category filter
    if (feedFilter !== "all") {
      items = items.filter(item => item.category === feedFilter);
    }

    return items;
  }, [selectedHeatCell, timeRange, feedFilter]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* ── Left: Match Inbox (5 cols) ── */}
        <div className="lg:col-span-5">
          <div className="rounded-2xl border border-border bg-card p-6 shadow-surface-md">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-sm font-semibold text-foreground">New Matches</h3>
              <Badge variant="secondary" className="text-[10px] font-normal">Top 3</Badge>
            </div>

            <div className="space-y-2">
              {topMatches.slice(0, 3).map((inv, rank) => {
                const key = inv.firm_name.toLowerCase().trim();
                const enriched = enrichedData?.[key];
                const isEnriching = enrichingKeys?.has(key);
                const displayScore = ensureHighScore(inv.score, rank);
                return (
                  <div
                    key={inv.id}
                    className="rounded-xl border border-border/60 p-4 transition-all duration-200 hover:border-accent/30 hover:shadow-surface group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary text-foreground font-bold text-sm shrink-0">
                        {inv.firm_name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">{inv.firm_name}</p>
                            {enriched && <SourceBadge source={enriched.profile.source} firmName={inv.firm_name} />}
                          </div>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div>
                                <Badge className={`text-[10px] font-semibold rounded-full px-2.5 py-0.5 border-0 cursor-help shrink-0 ${scoreColor(displayScore)}`}>
                                  {displayScore}%
                                </Badge>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="left" className="p-3 bg-card border border-border shadow-surface-lg rounded-xl">
                              <ScoreTooltipContent investor={{ ...inv, score: displayScore }} />
                            </TooltipContent>
                          </Tooltip>
                        </div>

                        <p className="text-[11px] text-muted-foreground mt-1">
                          {inv.preferred_stage} · {inv.thesis_verticals.slice(0, 2).join(", ")}
                        </p>

                        {isEnriching && !enriched && <EnrichShimmer />}
                        {enriched && (
                          <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1 mt-1 animate-fade-in">
                            <Clock className="h-2.5 w-2.5" />
                            Verified: {formatVerifiedDate(enriched.profile.lastVerified)}
                          </p>
                        )}

                        {/* Quick Actions */}
                        <div className="flex items-center gap-4 mt-3 pt-2 border-t border-border/40">
                          <button className="inline-flex items-center gap-1.5 text-[11px] font-medium text-accent hover:text-accent/80 transition-colors">
                            <CheckCircle2 className="h-3 w-3" />
                            Review Match
                          </button>
                          <button className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                            <XCircle className="h-3 w-3" />
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              {topMatches.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-8">No matches yet.</p>
              )}
            </div>

            <button className="mt-5 flex w-full items-center justify-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80 transition-colors">
              View all matches <ArrowRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* ── Right: Unified Intelligence Feed (7 cols) ── */}
        <div className="lg:col-span-7">
          <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-6">
            {/* Header + Filter Pills */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-foreground">Intelligence Feed</h3>
                {selectedHeatCell !== null && (
                  <Badge variant="secondary" className="text-[10px] font-normal">Heat Filtered</Badge>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {FEED_PILLS.map(pill => (
                  <button
                    key={pill.key}
                    onClick={() => setFeedFilter(pill.key)}
                    className={`px-3 py-1.5 text-[11px] font-medium rounded-lg transition-all duration-200 ${
                      feedFilter === pill.key
                        ? "bg-foreground text-background shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/70"
                    }`}
                  >
                    {pill.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Timeline Feed */}
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[17px] top-3 bottom-3 w-px bg-border" />

              <div className="space-y-0.5">
                {filteredFeed.map((item, i) => (
                  <div
                    key={`${item.text}-${i}`}
                    className="relative flex items-start gap-4 rounded-lg p-3 -mx-3 transition-colors duration-150 hover:bg-secondary/40 cursor-pointer group"
                  >
                    {/* Icon node */}
                    <div className={`relative z-10 flex h-[34px] w-[34px] items-center justify-center rounded-full shrink-0 ${item.iconColor} ring-4 ring-card/80`}>
                      <item.icon className="h-3.5 w-3.5" />
                    </div>

                    <div className="flex-1 min-w-0 pt-0.5">
                      <p className="text-[13px] text-foreground leading-relaxed group-hover:text-foreground/90">{item.text}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground">{item.time}</span>
                        <span className="text-[10px] text-muted-foreground/40">·</span>
                        <span className="text-[10px] text-muted-foreground/60 capitalize">{item.source}</span>
                      </div>
                    </div>

                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/0 group-hover:text-muted-foreground/40 transition-colors mt-1.5 shrink-0" />
                  </div>
                ))}
                {filteredFeed.length === 0 && (
                  <div className="text-center py-10">
                    <p className="text-xs text-muted-foreground">No updates match the current filters.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
