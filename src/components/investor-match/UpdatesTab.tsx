import { Badge } from "@/components/ui/badge";
import { ArrowRight, Newspaper, Linkedin, Twitter, Users, TrendingUp, Star, Zap, ShieldCheck, Database, Clock } from "lucide-react";

interface ScoredInvestor {
  id: string;
  firm_name: string;
  score: number;
  preferred_stage: string | null;
  thesis_verticals: string[];
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
}

const ACTIVITY_FEED = [
  { icon: Twitter, source: "X", text: "Sequoia Capital posted a new climate-tech thesis update.", time: "2h ago" },
  { icon: Newspaper, source: "News", text: "Lightspeed closed a $150M deal in AI infrastructure.", time: "5h ago" },
  { icon: Linkedin, source: "LinkedIn", text: "Partner at a16z shared insights on developer tools market.", time: "8h ago" },
  { icon: Newspaper, source: "News", text: "Greylock announced a new $500M early-stage fund.", time: "1d ago" },
];

const COMMUNITY_FEED = [
  { icon: Star, text: "Most contacted investor this week: Andreessen Horowitz", time: "Updated today" },
  { icon: Users, text: "12 founders in your sector raised this month", time: "Weekly digest" },
  { icon: TrendingUp, text: "New community resource: 'Navigating Series A in 2026'", time: "3h ago" },
  { icon: Users, text: "3 founders in your cohort just closed rounds", time: "1d ago" },
];

function scoreColor(score: number): string {
  if (score >= 80) return "bg-emerald-100 text-emerald-700";
  if (score >= 60) return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
}

function SourceBadge({ source }: { source: "exa" | "gemini_grounded" | "local_db" }) {
  if (source === "exa") {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 animate-fade-in">
        <Zap className="h-2.5 w-2.5" /> Live Signal
      </span>
    );
  }
  if (source === "gemini_grounded") {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 animate-fade-in">
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

export function UpdatesTab({ topMatches, enrichedData, enrichingKeys }: UpdatesTabProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Card 1: New Matches */}
      <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-6 shadow-sm">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold text-foreground">New Matches</h3>
          <Badge variant="secondary" className="text-[10px] font-normal">Top 3</Badge>
        </div>
        <div className="space-y-3">
          {topMatches.slice(0, 3).map(inv => {
            const key = inv.firm_name.toLowerCase().trim();
            const enriched = enrichedData?.[key];
            const isEnriching = enrichingKeys?.has(key);
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
                    {enriched && <SourceBadge source={enriched.profile.source} />}
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
                  <Badge className={`text-[10px] font-semibold rounded-full px-2.5 py-0.5 border-0 ${scoreColor(inv.score)}`}>
                    {inv.score}%
                  </Badge>
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
        <h3 className="text-sm font-semibold text-foreground mb-5">Investor Activity</h3>
        <div className="space-y-1">
          {ACTIVITY_FEED.map((item, i) => (
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

      {/* Card 3: Community Activity */}
      <div className="rounded-2xl border border-border bg-card/80 backdrop-blur-sm p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-foreground mb-5">Community Activity</h3>
        <div className="space-y-1">
          {COMMUNITY_FEED.map((item, i) => (
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
  );
}
