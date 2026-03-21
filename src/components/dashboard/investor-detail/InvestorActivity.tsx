import { useState, useEffect } from "react";
import {
  CircleDollarSign, RefreshCw, Newspaper, ArrowUpRight, Loader2,
  Bookmark, Eye, UserPlus, MessageSquare, AtSign, Heart, Repeat2,
  TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ── Types ──

interface NewsItem {
  title: string;
  source: string;
  type: "funding" | "article" | "hire" | "investment" | "thought_leadership";
  time: string;
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
    { handle: `@${firmName.replace(/\s/g, "").toLowerCase()}`, text: `Excited to announce our latest investment in AI-native developer tools. The future of software is being rebuilt from the ground up.`, time: "3h", likes: 142, retweets: 38 },
    { handle: "@foundersclub", text: `Just got intro to ${firmName} — their thesis on vertical SaaS is incredibly sharp. Highly recommend.`, time: "1d", likes: 67, retweets: 12 },
    { handle: "@techcrunch", text: `${firmName} reportedly in talks to lead a $20M round in stealth climate startup.`, time: "2d", likes: 234, retweets: 89 },
    { handle: `@${firmName.replace(/\s/g, "").toLowerCase()}`, text: `Our latest blog: why we believe agentic AI in healthcare will create the next wave of $1B+ outcomes.`, time: "4d", likes: 98, retweets: 31 },
  ];
}

function getCommunityItems(): CommunityItem[] {
  return [
    { action: "saved", actor: "3 founders", time: "2h" },
    { action: "viewed", actor: "12 founders", time: "today" },
    { action: "added_to_cap_table", actor: "1 company", time: "1d" },
    { action: "requested_intro", actor: "2 founders", time: "3d" },
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

// ── Analytics Pill ──
function StatPill({ value, label, trend }: { value: string; label: string; trend?: "up" | "down" | "flat" }) {
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
  const trendColor = trend === "up" ? "text-success" : trend === "down" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-secondary/60 border border-border/50">
      <span className="text-xs font-bold text-foreground leading-none">{value}</span>
      <span className="text-[9px] text-muted-foreground leading-none">{label}</span>
      {trend && <TrendIcon className={`h-2.5 w-2.5 ${trendColor}`} />}
    </div>
  );
}

export function InvestorActivity({ firmName }: { firmName: string }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setLastRefreshed(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const news = getNewsItems(firmName);
  const tweets = getTweets(firmName);
  const community = getCommunityItems();

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
          {/* Analytics row */}
          <div className="flex flex-wrap gap-1.5">
            <StatPill value="5" label="mentions" trend="up" />
            <StatPill value="3" label="sources" trend="flat" />
            <StatPill value="2" label="this week" trend="up" />
          </div>
          {/* Feed */}
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
          {/* Analytics row */}
          <div className="flex flex-wrap gap-1.5">
            <StatPill value={String(totalEngagement)} label="engagements" trend="up" />
            <StatPill value={String(tweets.length)} label="posts" trend="flat" />
          </div>
          {/* Feed */}
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
          {/* Analytics row */}
          <div className="flex flex-wrap gap-1.5">
            <StatPill value="27" label="views" trend="up" />
            <StatPill value="5" label="saves" trend="up" />
            <StatPill value="2" label="intros" trend="flat" />
          </div>
          {/* Timeline */}
          <div className="space-y-0">
            {community.map((item, i) => {
              const Icon = COMMUNITY_ICONS[item.action];
              return (
                <div key={i} className="flex items-center gap-1.5 py-1 relative">
                  {i < community.length - 1 && (
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
