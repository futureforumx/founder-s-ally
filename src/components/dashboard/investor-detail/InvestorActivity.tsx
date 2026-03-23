import { useState, useEffect, useRef } from "react";
import {
  CircleDollarSign, RefreshCw, Newspaper, ArrowUpRight, Loader2,
  Bookmark, Eye, UserPlus, MessageSquare, AtSign, Heart, Repeat2,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

// ── Types ──

interface NewsItem {
  title: string;
  source: string;
  type: "funding" | "article" | "hire" | "investment" | "thought_leadership";
  time: string;
  url: string;
}

interface TweetItem {
  handle: string;
  text: string;
  time: string;
  likes: number;
  retweets: number;
}

interface CommunityItem {
  action: "saved" | "viewed" | "added_to_cap_table" | "requested_intro";
  actor: string;
  time: string;
}

// ── Mock data ──

function getNewsItems(firmName: string): NewsItem[] {
  return [
    { title: `${firmName} closes $1.5B Fund III`, source: "TechCrunch", type: "funding", time: "6h" },
    { title: `GP publishes thesis on vertical AI infra`, source: "Substack", type: "thought_leadership", time: "2d" },
    { title: `${firmName} leads $12M Series A in Synthara Bio`, source: "Crunchbase", type: "investment", time: "3d" },
    { title: `${firmName} hires new Partner from Tiger Global`, source: "Bloomberg", type: "hire", time: "5d" },
    { title: `Mentioned in Forbes investor roundup`, source: "Forbes", type: "article", time: "1w" },
  ];
}

function getTweets(firmName: string): TweetItem[] {
  return [
    { handle: `@${firmName.replace(/\s/g, "").toLowerCase()}`, text: `Excited to announce our latest investment in AI-native developer tools.`, time: "3h", likes: 142, retweets: 38 },
    { handle: "@foundersclub", text: `Just got intro to ${firmName} — their thesis on vertical SaaS is incredibly sharp.`, time: "1d", likes: 67, retweets: 12 },
    { handle: "@techcrunch", text: `${firmName} reportedly in talks to lead a $20M round in stealth climate startup.`, time: "2d", likes: 234, retweets: 89 },
    { handle: `@${firmName.replace(/\s/g, "").toLowerCase()}`, text: `Our latest blog: why we believe agentic AI in healthcare will create the next wave of $1B+ outcomes.`, time: "4d", likes: 98, retweets: 31 },
  ];
}

const NEWS_TYPE_CONFIG: Record<NewsItem["type"], { label: string; cls: string }> = {
  funding: { label: "Funding", cls: "bg-success/10 text-success border-success/20" },
  article: { label: "Article", cls: "bg-muted text-muted-foreground border-border" },
  hire: { label: "Hire", cls: "bg-primary/10 text-primary border-primary/20" },
  investment: { label: "Deal", cls: "bg-accent/10 text-accent border-accent/20" },
  thought_leadership: { label: "Thought", cls: "bg-warning/10 text-warning border-warning/20" },
};

const COMMUNITY_ICONS: Record<CommunityItem["action"], typeof Bookmark> = {
  saved: Bookmark,
  viewed: Eye,
  added_to_cap_table: CircleDollarSign,
  requested_intro: MessageSquare,
};

const COMMUNITY_LABELS: Record<CommunityItem["action"], string> = {
  saved: "Saved this investor",
  viewed: "Viewed profile",
  added_to_cap_table: "Added to cap table",
  requested_intro: "Requested intro",
};

// ── Animated Number ──
function AnimatedNumber({ target, duration = 800 }: { target: number; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    const start = performance.now();
    const from = 0;
    const animate = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setDisplay(Math.round(from + (target - from) * eased));
      if (progress < 1) frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return <>{display}</>;
}

// ── Analytics Square Card ──
function StatCard({ value, label, trend }: { value: number; label: string; trend?: "up" | "down" | "flat" }) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="flex flex-col items-center justify-center w-[52px] h-[52px] rounded-lg bg-secondary/60 border border-border/50 p-1">
      <div className="flex items-center gap-0.5">
        <span className="text-sm font-bold text-foreground leading-none"><AnimatedNumber target={value} /></span>
        {trend && <TrendIcon className={`h-2.5 w-2.5 ${trendColor}`} />}
      </div>
      <span className="text-[7px] text-muted-foreground leading-none mt-0.5 text-center">{label}</span>
    </div>
  );
}

// ── Live Community Data Hook ──
function useCommunityStats(firmId?: string) {
  const [stats, setStats] = useState({ views: 0, saves: 0, intros: 0 });
  const [items, setItems] = useState<CommunityItem[]>([]);

  useEffect(() => {
    if (!firmId) return;
    (async () => {
      const { data, error } = await supabase
        .from("founder_vc_interactions")
        .select("action_type, created_at")
        .eq("firm_id", firmId)
        .order("created_at", { ascending: false })
        .limit(100);

      if (error || !data) return;

      const views = data.filter(r => r.action_type === "viewed").length;
      const saves = data.filter(r => r.action_type === "saved").length;
      const intros = data.filter(r => r.action_type === "requested_intro").length;
      const capTable = data.filter(r => r.action_type === "added_to_cap_table").length;
      setStats({ views, saves, intros });

      // Build timeline from real data
      const actionMap: Record<string, CommunityItem["action"]> = {
        saved: "saved",
        viewed: "viewed",
        added_to_cap_table: "added_to_cap_table",
        requested_intro: "requested_intro",
      };

      const grouped: Record<string, { count: number; latest: Date }> = {};
      for (const r of data) {
        const action = actionMap[r.action_type];
        if (!action) continue;
        if (!grouped[action]) grouped[action] = { count: 0, latest: new Date(r.created_at) };
        grouped[action].count++;
        const d = new Date(r.created_at);
        if (d > grouped[action].latest) grouped[action].latest = d;
      }

      const now = Date.now();
      const timeAgo = (d: Date) => {
        const diff = now - d.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `${mins}m`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h`;
        const days = Math.floor(hrs / 24);
        return `${days}d`;
      };

      const timeline: CommunityItem[] = Object.entries(grouped)
        .sort(([, a], [, b]) => b.latest.getTime() - a.latest.getTime())
        .slice(0, 4)
        .map(([action, info]) => ({
          action: action as CommunityItem["action"],
          actor: `${info.count} founder${info.count !== 1 ? "s" : ""}`,
          time: timeAgo(info.latest),
        }));

      setItems(timeline.length > 0 ? timeline : getDefaultCommunity());
    })();
  }, [firmId]);

  return { stats, items };
}

function getDefaultCommunity(): CommunityItem[] {
  return [
    { action: "saved", actor: "3 founders", time: "2h" },
    { action: "viewed", actor: "12 founders", time: "today" },
    { action: "added_to_cap_table", actor: "1 company", time: "1d" },
    { action: "requested_intro", actor: "2 founders", time: "3d" },
  ];
}

export function InvestorActivity({ firmName, firmId }: { firmName: string; firmId?: string }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setLastRefreshed(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const news = getNewsItems(firmName);
  const tweets = getTweets(firmName);
  const { stats: communityStats, items: communityItems } = useCommunityStats(firmId);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => { setLastRefreshed(new Date()); setIsRefreshing(false); }, 1200);
  };

  const totalEngagement = tweets.reduce((s, t) => s + t.likes + t.retweets, 0);

  return (
    <div className="space-y-2">
      {/* Refresh bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          <span className="text-[10px] text-muted-foreground font-medium">
            Live · {lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      {/* 3-Column Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* ── COL 1: NEWS ── */}
        <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Newspaper className="h-3 w-3" /> News
            </h4>
          </div>
          <div className="flex gap-1.5">
            <StatCard value={news.length} label="mentions" trend="up" />
            <StatCard value={3} label="sources" trend="flat" />
            <StatCard value={2} label="this week" trend="up" />
          </div>
          <div className="space-y-0">
            {news.map((item, i) => {
              const cfg = NEWS_TYPE_CONFIG[item.type];
              return (
                <div key={i} className="flex items-start gap-1.5 py-1 border-b border-border/40 last:border-0 group cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-medium text-foreground leading-tight line-clamp-1 group-hover:text-accent transition-colors">
                      {item.title}
                    </p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Badge className={`text-[7px] px-1 py-0 leading-tight ${cfg.cls}`}>{cfg.label}</Badge>
                      <span className="text-[8px] text-muted-foreground">{item.source}</span>
                      <span className="text-[8px] text-muted-foreground/50">·</span>
                      <span className="text-[8px] text-muted-foreground">{item.time}</span>
                    </div>
                  </div>
                  <ArrowUpRight className="h-2.5 w-2.5 text-muted-foreground/40 shrink-0 mt-0.5 group-hover:text-accent transition-colors" />
                </div>
              );
            })}
          </div>
        </div>

        {/* ── COL 2: SOCIAL ── */}
        <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <AtSign className="h-3 w-3" /> Social
            </h4>
          </div>
          <div className="flex gap-1.5">
            <StatCard value={totalEngagement} label="engagements" trend="up" />
            <StatCard value={tweets.length} label="posts" trend="flat" />
          </div>
          <div className="space-y-0">
            {tweets.map((tweet, i) => (
              <div key={i} className="py-1 border-b border-border/40 last:border-0">
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="text-[9px] font-semibold text-accent">{tweet.handle}</span>
                  <span className="text-[8px] text-muted-foreground/50">·</span>
                  <span className="text-[8px] text-muted-foreground">{tweet.time}</span>
                </div>
                <p className="text-[10px] text-foreground/80 leading-tight line-clamp-1">{tweet.text}</p>
                <div className="flex items-center gap-2.5 mt-0.5">
                  <span className="flex items-center gap-0.5 text-[8px] text-muted-foreground">
                    <Heart className="h-2 w-2" /> {tweet.likes}
                  </span>
                  <span className="flex items-center gap-0.5 text-[8px] text-muted-foreground">
                    <Repeat2 className="h-2 w-2" /> {tweet.retweets}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── COL 3: COMMUNITY ── */}
        <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
          <div className="flex items-center justify-between">
            <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <UserPlus className="h-3 w-3" /> Community
            </h4>
          </div>
          <div className="flex gap-1.5">
            <StatCard value={communityStats.views} label="views" trend="up" />
            <StatCard value={communityStats.saves} label="saves" trend="up" />
            <StatCard value={communityStats.intros} label="intros" trend="flat" />
          </div>
          <div className="space-y-0">
            {communityItems.map((item, i) => {
              const Icon = COMMUNITY_ICONS[item.action];
              return (
                <div key={i} className="flex items-center gap-1.5 py-1 relative">
                  {i < communityItems.length - 1 && (
                    <div className="absolute left-[7px] top-5 bottom-0 w-px bg-border" />
                  )}
                  <div className="flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full bg-secondary border border-border z-10">
                    <Icon className="h-2 w-2 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-foreground leading-tight">
                      <span className="font-semibold">{item.actor}</span>{" "}
                      <span className="text-muted-foreground">{COMMUNITY_LABELS[item.action].toLowerCase()}</span>
                      <span className="text-muted-foreground/50 ml-1">· {item.time}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
