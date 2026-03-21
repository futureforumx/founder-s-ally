import { useState, useEffect } from "react";
import {
  CircleDollarSign, RefreshCw, Newspaper, ArrowUpRight, Loader2,
  Calendar, Bookmark, Eye, UserPlus, MessageSquare, AtSign, Heart, Repeat2,
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

function getCommunityItems(firmName: string): CommunityItem[] {
  return [
    { action: "saved", actor: "3 founders", time: "2h" },
    { action: "viewed", actor: "12 founders", time: "today" },
    { action: "added_to_cap_table", actor: "1 company", time: "1d" },
    { action: "requested_intro", actor: "2 founders", time: "3d" },
    { action: "viewed", actor: "8 founders", time: "this week" },
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

export function InvestorActivity({ firmName }: { firmName: string }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setLastRefreshed(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const news = getNewsItems(firmName);
  const tweets = getTweets(firmName);
  const community = getCommunityItems(firmName);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => { setLastRefreshed(new Date()); setIsRefreshing(false); }, 1200);
  };

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
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <Newspaper className="h-3 w-3" /> News
          </h4>
          <div className="space-y-1.5">
            {news.map((item, i) => {
              const cfg = NEWS_TYPE_CONFIG[item.type];
              return (
                <div
                  key={i}
                  className="flex items-start gap-2 py-1.5 border-b border-border/50 last:border-0 group cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-foreground leading-tight line-clamp-2 group-hover:text-accent transition-colors">
                      {item.title}
                    </p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge className={`text-[8px] px-1 py-0 leading-tight ${cfg.cls}`}>{cfg.label}</Badge>
                      <span className="text-[9px] text-muted-foreground">{item.source}</span>
                      <span className="text-[9px] text-muted-foreground/50">·</span>
                      <span className="text-[9px] text-muted-foreground">{item.time}</span>
                    </div>
                  </div>
                  <ArrowUpRight className="h-3 w-3 text-muted-foreground/40 shrink-0 mt-0.5 group-hover:text-accent transition-colors" />
                </div>
              );
            })}
          </div>
        </div>

        {/* ── COL 2: SOCIAL (X/Twitter) ── */}
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <AtSign className="h-3 w-3" /> Social
          </h4>
          <div className="space-y-1.5">
            {tweets.map((tweet, i) => (
              <div
                key={i}
                className="py-1.5 border-b border-border/50 last:border-0"
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-semibold text-accent">{tweet.handle}</span>
                  <span className="text-[9px] text-muted-foreground/50">·</span>
                  <span className="text-[9px] text-muted-foreground">{tweet.time}</span>
                </div>
                <p className="text-[11px] text-foreground/80 leading-tight line-clamp-2">
                  {tweet.text}
                </p>
                <div className="flex items-center gap-3 mt-1">
                  <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                    <Heart className="h-2.5 w-2.5" /> {tweet.likes}
                  </span>
                  <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                    <Repeat2 className="h-2.5 w-2.5" /> {tweet.retweets}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── COL 3: COMMUNITY ── */}
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <UserPlus className="h-3 w-3" /> Community
          </h4>
          <div className="space-y-0">
            {community.map((item, i) => {
              const Icon = COMMUNITY_ICONS[item.action];
              return (
                <div
                  key={i}
                  className="flex items-start gap-2 py-2 relative"
                >
                  {i < community.length - 1 && (
                    <div className="absolute left-[9px] top-7 bottom-0 w-px bg-border" />
                  )}
                  <div className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-secondary border border-border z-10">
                    <Icon className="h-2.5 w-2.5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] text-foreground leading-tight">
                      <span className="font-semibold">{item.actor}</span>{" "}
                      <span className="text-muted-foreground">{COMMUNITY_LABELS[item.action].toLowerCase()}</span>
                    </p>
                    <p className="text-[9px] text-muted-foreground mt-0.5">{item.time}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mini stats */}
          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border">
            <div className="text-center py-1">
              <p className="text-sm font-bold text-foreground">27</p>
              <p className="text-[9px] text-muted-foreground">Views this week</p>
            </div>
            <div className="text-center py-1">
              <p className="text-sm font-bold text-foreground">5</p>
              <p className="text-[9px] text-muted-foreground">Saves this week</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
