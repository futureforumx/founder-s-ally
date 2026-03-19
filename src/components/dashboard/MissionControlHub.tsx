import { useState } from "react";
import { Briefcase, Target, TrendingUp, Users, ArrowRight, X, Sparkles, Activity } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  onNavigate: (view: string) => void;
  profileHealthScore?: number;
}

const GLANCE_CARDS = [
  {
    id: "investors",
    view: "investors",
    icon: Briefcase,
    title: "Investors & Cap Table",
    snippet: "4 Pending AI Matches",
    hasPulse: true,
    accentVar: "accent",
  },
  {
    id: "competitors",
    view: "benchmarks",
    icon: Target,
    title: "Competitor Intel",
    snippet: "Tracking 2 direct rivals",
    hasPulse: false,
    accentVar: "warning",
  },
  {
    id: "market",
    view: "dashboard-industry",
    icon: TrendingUp,
    title: "Market & Sector",
    snippet: "Subsector momentum rising",
    hasPulse: false,
    accentVar: "success",
  },
  {
    id: "community",
    view: "dashboard-community",
    icon: Users,
    title: "Community Intros",
    snippet: "2 Warm Intro pathways found",
    hasPulse: true,
    accentVar: "accent",
  },
] as const;

// Tiny sparkline SVG for Market card
function MiniSparkline() {
  return (
    <svg viewBox="0 0 64 20" className="h-4 w-16 mt-1" fill="none">
      <polyline
        points="0,16 8,14 16,12 24,15 32,8 40,10 48,4 56,6 64,2"
        stroke="hsl(var(--success))"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity="0.2" />
        <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity="0" />
      </linearGradient>
      <polygon
        points="0,16 8,14 16,12 24,15 32,8 40,10 48,4 56,6 64,2 64,20 0,20"
        fill="url(#spark-fill)"
      />
    </svg>
  );
}

function HealthRing({ score }: { score: number }) {
  const radius = 20;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative flex items-center justify-center">
      <svg width="52" height="52" className="-rotate-90">
        <circle
          cx="26" cy="26" r={radius}
          stroke="hsl(var(--muted))"
          strokeWidth="4" fill="none"
        />
        <circle
          cx="26" cy="26" r={radius}
          stroke="hsl(var(--accent))"
          strokeWidth="4" fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="absolute text-xs font-bold text-foreground">{score}%</span>
    </div>
  );
}

export function MissionControlHub({ onNavigate, profileHealthScore = 85 }: Props) {
  const { user } = useAuth();
  const [showBriefing, setShowBriefing] = useState(true);

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Founder";

  const handleCardClick = (view: string) => {
    if (view.startsWith("dashboard-")) {
      // For sub-views, navigate to dashboard and set the sub-view
      window.dispatchEvent(new CustomEvent("navigate-dashboard-view", { detail: view.replace("dashboard-", "") }));
      return;
    }
    onNavigate(view);
  };

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <HealthRing score={profileHealthScore} />
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Welcome back, {displayName}.
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
              <Activity className="h-3 w-3" />
              Profile Health Score: {profileHealthScore}%
            </p>
          </div>
        </div>
      </div>

      {/* AI Daily Briefing */}
      {showBriefing && (
        <div className="relative rounded-xl border border-accent/20 bg-accent/5 px-5 py-3.5 backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 mt-0.5">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-accent mb-0.5">AI Daily Briefing</p>
              <p className="text-xs text-foreground/80">
                ✨ Exa found 2 new Series A rounds in ConTech this week. Check the Market Pulse for details.
              </p>
            </div>
            <button
              onClick={() => setShowBriefing(false)}
              className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Bento Grid — Glance Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {GLANCE_CARDS.map((card) => (
          <Card
            key={card.id}
            onClick={() => handleCardClick(card.view)}
            className="group cursor-pointer border-border/60 bg-card hover:-translate-y-1 hover:shadow-lg hover:border-accent/30 transition-all duration-300 ease-out"
          >
            <CardContent className="p-5 flex flex-col justify-between h-full min-h-[160px]">
              <div>
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-${card.accentVar}/10 mb-3`}>
                  <card.icon className={`h-4.5 w-4.5 text-${card.accentVar}`} style={{ width: 18, height: 18 }} />
                </div>
                <h3 className="text-sm font-semibold text-foreground mb-1.5">{card.title}</h3>
                <div className="flex items-center gap-1.5">
                  {card.hasPulse && (
                    <span className="flex h-2 w-2 shrink-0">
                      <span className="absolute inline-flex h-2 w-2 animate-ping rounded-full bg-success opacity-60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
                    </span>
                  )}
                  <p className="text-[11px] text-muted-foreground">{card.snippet}</p>
                </div>
                {card.id === "market" && <MiniSparkline />}
              </div>
              <div className="flex items-center gap-1 mt-3 text-[10px] font-medium text-accent opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                View Details
                <ArrowRight className="h-3 w-3" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
