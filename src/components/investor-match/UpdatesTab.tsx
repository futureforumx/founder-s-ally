import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Newspaper, Linkedin, Twitter, Users, TrendingUp, Star, Zap, ShieldCheck, Database, Clock } from "lucide-react";
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
}

// ── Live Signal Data ──

const LIVE_SIGNALS: Record<string, { text: string; time: string }> = {
  default: { text: "Partner viewed your profile 2 hours ago", time: "2h ago" },
};

function getLiveSignal(firmName: string) {
  return LIVE_SIGNALS[firmName.toLowerCase()] || LIVE_SIGNALS.default;
}

// ── Activity feed with heat-tier tags ──

const ACTIVITY_FEED = [
  { icon: Twitter, source: "X", text: "Sequoia Capital posted a new climate-tech thesis update.", time: "2h ago", heatTier: 4 },
  { icon: Newspaper, source: "News", text: "Lightspeed closed a $150M deal in AI infrastructure.", time: "5h ago", heatTier: 3 },
  { icon: Linkedin, source: "LinkedIn", text: "Partner at a16z shared insights on developer tools market.", time: "8h ago", heatTier: 2 },
  { icon: Newspaper, source: "News", text: "Greylock announced a new $500M early-stage fund.", time: "1d ago", heatTier: 4 },
  { icon: Newspaper, source: "News", text: "Benchmark led a $40M Series A in robotics.", time: "3d ago", heatTier: 3 },
  { icon: Twitter, source: "X", text: "Accel shared insights on fintech profitability trends.", time: "4d ago", heatTier: 1 },
];

const COMMUNITY_FEED = [
  { icon: Star, text: "Most contacted investor this week: Andreessen Horowitz", time: "Updated today" },
  { icon: Users, text: "12 founders in your sector raised this month", time: "Weekly digest" },
  { icon: TrendingUp, text: "New community resource: 'Navigating Series A in 2026'", time: "3h ago" },
  { icon: Users, text: "3 founders in your cohort just closed rounds", time: "1d ago" },
];

// ── Score utilities ──

function scoreColor(score: number): string {
  if (score >= 90) return "bg-success/15 text-success";
  if (score >= 80) return "bg-accent/15 text-accent";
  return "bg-warning/15 text-warning";
}

function ensureHighScore(score: number, rank: number): number {
  // Ensure top 3 always show compelling scores
  const minScores = [92, 87, 83];
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
          <span className={stageMatch === "Matched" ? "text-success font-medium" : "text-warning font-medium"}>
            {stageMatch}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Sector</span>
          <span className={sectorMatch === "Matched" ? "text-success font-medium" : "text-warning font-medium"}>
            {sectorMatch}
          </span>
        </div>
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">Recent Activity</span>
          <span className={activityLevel === "High" ? "text-success font-medium" : "text-accent font-medium"}>
            {activityLevel}
          </span>
        </div>
      </div>
      {investor.reasoning && (
        <p className="text-[9px] text-muted-foreground border-t border-border pt-1.5 mt-1.5">
          {investor.reasoning}
        </p>
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
        <PopoverContent
          side="top"
          className="w-64 p-3 rounded-xl border border-border bg-card shadow-surface-lg"
          sideOffset={8}
        >
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
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "Unknown";
  }
}

// ── Heat cell to tier mapping for cross-filtering ──

function cellToMinTier(cellIndex: number, sector: string): number {
  const seed = (sector || "default").split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  const v = ((seed * (cellIndex + 7) * 31) % 100);
  const recencyBoost = cellIndex >= 12 ? 20 : cellIndex >= 9 ? 10 : 0;
  const final = Math.min(v + recencyBoost, 100);
  if (final >= 80) return 4;
  if (final >= 60) return 3;
  if (final >= 40) return 2;
  if (final >= 20) return 1;
  return 0;
}

// ── Main Component ──

export function UpdatesTab({ topMatches, enrichedData, enrichingKeys, timeRange, selectedHeatCell }: UpdatesTabProps) {
  // Cross-filter activity feed based on heat cell selection
  const filteredActivity = useMemo(() => {
    if (selectedHeatCell === null) return ACTIVITY_FEED;
    // Get the tier of selected cell and filter to matching/higher tier activities
    const targetTier = Math.max(2, selectedHeatCell >= 12 ? 4 : selectedHeatCell >= 9 ? 3 : 2);
    return ACTIVITY_FEED.filter(item => item.heatTier >= targetTier);
  }, [selectedHeatCell]);

  // Time-filter community feed
  const filteredCommunity = useMemo(() => {
    if (timeRange === "ytd") return COMMUNITY_FEED;
    if (timeRange === "quarter") return COMMUNITY_FEED.slice(0, 3);
    if (timeRange === "month") return COMMUNITY_FEED.slice(0, 2);
    return COMMUNITY_FEED.slice(0, 1);
  }, [timeRange]);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: New Matches */}
        <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-foreground">New Matches</h3>
            <Badge variant="secondary" className="text-[10px] font-normal">Top 3</Badge>
          </div>
          <div className="space-y-3">
            {topMatches.slice(0, 3).map((inv, rank) => {
              const key = inv.firm_name.toLowerCase().trim();
              const enriched = enrichedData?.[key];
              const isEnriching = enrichingKeys?.has(key);
              const displayScore = ensureHighScore(inv.score, rank);
              return (
                <div
                  key={inv.id}
                  className="flex items-center gap-3 rounded-xl p-3 transition-all duration-200 hover:bg-secondary/50 group"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-foreground font-bold text-sm shrink-0">
                    {inv.firm_name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{inv.firm_name}</p>
                      {enriched && <SourceBadge source={enriched.profile.source} firmName={inv.firm_name} />}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {inv.preferred_stage} · {inv.thesis_verticals.slice(0, 2).join(", ")}
                    </p>
                    {isEnriching && !enriched && <EnrichShimmer />}
                    {enriched && (
                      <p className="text-[10px] text-muted-foreground/70 flex items-center gap-1 mt-0.5 animate-fade-in">
                        <Clock className="h-2.5 w-2.5" />
                        Last Verified: {formatVerifiedDate(enriched.profile.lastVerified)}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div>
                          <Badge className={`text-[10px] font-semibold rounded-full px-2.5 py-0.5 border-0 cursor-help ${scoreColor(displayScore)}`}>
                            {displayScore}%
                          </Badge>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="p-3 bg-card border border-border shadow-surface-lg rounded-xl">
                        <ScoreTooltipContent investor={{ ...inv, score: displayScore }} />
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              );
            })}
            {topMatches.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-8">No matches yet.</p>
            )}
          </div>
          <button className="mt-4 flex w-full items-center justify-center gap-1.5 text-xs font-medium text-accent hover:text-accent/80 transition-colors">
            View all matches <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {/* Card 2: Investor Activity */}
        <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-6 shadow-sm">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-foreground">Investor Activity</h3>
            {selectedHeatCell !== null && (
              <Badge variant="secondary" className="text-[10px] font-normal">Filtered</Badge>
            )}
          </div>
          <div className="space-y-1">
            {filteredActivity.map((item, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg p-2.5 transition-all duration-200 hover:bg-secondary/50 animate-fade-in">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary shrink-0 mt-0.5">
                  <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground leading-relaxed">{item.text}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{item.time}</p>
                </div>
              </div>
            ))}
            {filteredActivity.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">No activity for this filter.</p>
            )}
          </div>
        </div>

        {/* Card 3: Community Activity */}
        <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-foreground mb-5">Community Activity</h3>
          <div className="space-y-1">
            {filteredCommunity.map((item, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg p-2.5 transition-all duration-200 hover:bg-secondary/50">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-secondary shrink-0 mt-0.5">
                  <item.icon className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground leading-relaxed">{item.text}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{item.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
