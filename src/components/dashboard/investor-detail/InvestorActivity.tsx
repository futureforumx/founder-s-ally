import { useMemo, useState, useEffect, useCallback } from "react";
import {
  ArrowUpRight,
  Building2,
  Calendar,
  Clock,
  FileText,
  Loader2,
  Newspaper,
  Radar,
  RefreshCw,
  Sparkles,
  Users,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { FirmXPostsCard } from "./FirmXPostsCard";

// ── Types ──

type InvestorUpdateFilter =
  | "all"
  | "posts"
  | "investments"
  | "fund_news"
  | "team"
  | "other";

type UpdateCardType =
  | "Fund news"
  | "Investment"
  | "Team update"
  | "Thesis / Insight"
  | "Product update"
  | "Press / Media"
  | "Other";

type ImpactLevel = "high" | "medium" | "low";

interface UpdateCard {
  type: UpdateCardType;
  display_source: string;
  display_date: string;
  title: string;
  subtitle: string;
  why_it_matters: string;
  url: string;
  image_url: string | null;
  estimated_read_time_minutes: number;
  impact_level: ImpactLevel;
  display_tags: string[];
}

// ── Card type → filter mapping ──

const CARD_TYPE_TO_FILTER: Record<UpdateCardType, InvestorUpdateFilter> = {
  "Investment": "investments",
  "Fund news": "fund_news",
  "Team update": "team",
  "Thesis / Insight": "other",
  "Product update": "other",
  "Press / Media": "posts",
  "Other": "other",
};

// Treat "posts"-like types as rich blog cards; everything else as compact rows
const POST_TYPES: UpdateCardType[] = ["Thesis / Insight", "Press / Media", "Other"];

function cardMatchesFilter(card: UpdateCard, filter: InvestorUpdateFilter): boolean {
  if (filter === "all") return true;
  if (filter === "posts") return POST_TYPES.includes(card.type);
  return CARD_TYPE_TO_FILTER[card.type] === filter;
}

// ── Impact level styling ──

const IMPACT_CONFIG: Record<ImpactLevel, { label: string; dotClass: string; badgeClass: string }> = {
  high: {
    label: "High impact",
    dotClass: "bg-destructive",
    badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
  },
  medium: {
    label: "Medium",
    dotClass: "bg-warning",
    badgeClass: "bg-warning/10 text-warning border-warning/20",
  },
  low: {
    label: "Low",
    dotClass: "bg-muted-foreground/40",
    badgeClass: "bg-muted text-muted-foreground border-border",
  },
};

// ── Card type styling ──

const TYPE_CONFIG: Record<UpdateCardType, { icon: typeof Building2; badgeClass: string }> = {
  "Investment": { icon: Sparkles, badgeClass: "bg-accent/15 text-accent border-accent/25" },
  "Fund news": { icon: Building2, badgeClass: "bg-primary/10 text-primary border-primary/20" },
  "Team update": { icon: Users, badgeClass: "bg-success/10 text-success border-success/25" },
  "Thesis / Insight": { icon: Radar, badgeClass: "bg-warning/10 text-warning border-warning/25" },
  "Product update": { icon: Zap, badgeClass: "bg-accent/10 text-accent border-accent/20" },
  "Press / Media": { icon: Newspaper, badgeClass: "bg-muted text-muted-foreground border-border" },
  "Other": { icon: FileText, badgeClass: "bg-muted text-muted-foreground border-border" },
};

function formatDisplayDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function relativeOrShort(iso: string): string {
  const d = new Date(iso).getTime();
  const now = Date.now();
  const diff = now - d;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 14) return `${days}d ago`;
  return formatDisplayDate(iso);
}

// ── Filter chips ──

const FILTER_CHIPS: { key: InvestorUpdateFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "posts", label: "Posts" },
  { key: "investments", label: "Investments" },
  { key: "fund_news", label: "Fund News" },
  { key: "team", label: "Team Updates" },
  { key: "other", label: "Other" },
];

// ── Empty state ──

function UpdatesEmptyState({ filter }: { filter: InvestorUpdateFilter }) {
  const copy =
    filter === "posts"
      ? { title: "No posts in this view", body: "Try All to see the full intelligence feed, or check back as new thought leadership is indexed." }
      : filter === "investments"
        ? { title: "No investment activity", body: "Switch to All or Posts to explore recent content and signals for this investor." }
        : { title: "Nothing here yet", body: "Adjust the filter above or view All to see updates and signals together." };

  return (
    <div className="rounded-xl border border-dashed border-border/80 bg-secondary/20 px-6 py-10 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-card border border-border shadow-sm">
        <Newspaper className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="mt-4 text-sm font-semibold text-foreground">{copy.title}</p>
      <p className="mt-1.5 text-xs text-muted-foreground max-w-[280px] mx-auto leading-relaxed">{copy.body}</p>
    </div>
  );
}

// ── Rich post card ──

function RichPostCard({ card }: { card: UpdateCard }) {
  const impact = IMPACT_CONFIG[card.impact_level];
  const typeConf = TYPE_CONFIG[card.type];
  const TypeIcon = typeConf.icon;
  const hasLink = card.url && card.url.startsWith("http");

  return (
    <Card className="overflow-hidden border-border/80 shadow-sm border-l-[3px] border-l-accent/90 bg-card/95">
      <CardContent className="p-4 space-y-3">
        <div className="flex gap-3">
          {card.image_url && (
            <div className="shrink-0 h-14 w-14 overflow-hidden rounded-lg bg-secondary/40 mt-0.5">
              <img
                src={card.image_url}
                alt=""
                className="h-full w-full object-cover"
                onError={(e) => { (e.target as HTMLElement).parentElement!.style.display = "none"; }}
              />
            </div>
          )}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 font-semibold flex items-center gap-0.5", typeConf.badgeClass)}>
                <TypeIcon className="h-2.5 w-2.5" />
                {card.type}
              </Badge>
              {/* Impact dot */}
              <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", impact.dotClass)} title={impact.label} />
              <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3 opacity-70" />
                {card.display_date}
              </span>
              <span className="text-border">·</span>
              <span className="text-[10px] font-medium text-foreground/70">{card.display_source}</span>
              <span className="text-border">·</span>
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {card.estimated_read_time_minutes} min
              </span>
            </div>

            {/* Title + subtitle */}
            <div>
              <h4 className="text-base font-semibold text-foreground leading-snug tracking-tight">{card.title}</h4>
              {card.subtitle && (
                <p className="mt-1 text-sm text-muted-foreground leading-relaxed line-clamp-2">{card.subtitle}</p>
              )}
            </div>
          </div>
        </div>

        {/* Why it matters */}
        {card.why_it_matters && (
          <div className="rounded-lg bg-accent/8 border border-accent/15 px-3 py-2 flex items-start gap-2">
            <TrendingUp className="h-3.5 w-3.5 text-accent shrink-0 mt-0.5" />
            <p className="text-[11px] text-accent/90 leading-relaxed font-medium">{card.why_it_matters}</p>
          </div>
        )}

        {/* Tags + CTA */}
        <div className="flex items-center justify-between gap-2 pt-0.5">
          <div className="flex flex-wrap gap-1">
            {card.display_tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center rounded-full bg-secondary/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground border border-border/60"
              >
                {tag}
              </span>
            ))}
          </div>
          {hasLink && (
            <a
              href={card.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline underline-offset-4 shrink-0"
            >
              Read more <ArrowUpRight className="h-3 w-3" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Compact row card (investments, fund news, team, etc.) ──

function CompactCard({ card }: { card: UpdateCard }) {
  const impact = IMPACT_CONFIG[card.impact_level];
  const typeConf = TYPE_CONFIG[card.type];
  const TypeIcon = typeConf.icon;
  const hasLink = card.url && card.url.startsWith("http");
  const Row = hasLink ? "a" : "div";
  const rowProps = hasLink
    ? { href: card.url, target: "_blank" as const, rel: "noopener noreferrer" as const }
    : {};

  return (
    <Row
      {...rowProps}
      className={cn(
        "flex gap-3 px-3.5 py-3 transition-colors",
        hasLink && "cursor-pointer hover:bg-card/80 no-underline",
      )}
    >
      {card.image_url ? (
        <div className="mt-0.5 shrink-0 h-10 w-10 overflow-hidden rounded-lg bg-secondary/40">
          <img
            src={card.image_url}
            alt=""
            className="h-full w-full object-cover"
            onError={(e) => { (e.target as HTMLElement).parentElement!.style.display = "none"; }}
          />
        </div>
      ) : (
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-card border border-border/60">
          <TypeIcon className="h-3 w-3 text-muted-foreground/75" />
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className={cn("px-1.5 py-0 text-[9px] font-normal uppercase tracking-[0.12em]", typeConf.badgeClass)}>
            {card.type}
          </Badge>
          {/* Impact dot */}
          <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", impact.dotClass)} title={impact.label} />
          <span className="text-[10px] font-normal uppercase tracking-[0.12em] text-muted-foreground">{card.display_date}</span>
          <span className="text-border text-[10px]">·</span>
          <span className="text-[10px] font-normal uppercase tracking-[0.12em] text-muted-foreground">{card.display_source}</span>
        </div>
        <p className="text-sm font-medium text-foreground leading-snug">{card.title}</p>
        {card.subtitle && (
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{card.subtitle}</p>
        )}
        {card.why_it_matters && (
          <p className="text-[11px] text-accent/80 font-medium leading-relaxed flex items-center gap-1">
            <TrendingUp className="h-3 w-3 shrink-0" />
            {card.why_it_matters}
          </p>
        )}
        {card.display_tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {card.display_tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex rounded-full border border-border/60 bg-secondary/70 px-1.5 py-0 text-[10px] font-normal uppercase tracking-[0.12em] text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
      {hasLink && <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 mt-1" />}
    </Row>
  );
}

// ── Main component ──

export function InvestorActivity({
  firmName,
  firmId,
  xUrl,
}: {
  firmName: string;
  firmId?: string;
  /** Firm-level X profile (`firm_records.x_url` or `vc_firms.x_url`) for embedded timeline on Posts. */
  xUrl?: string | null;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());
  const [filter, setFilter] = useState<InvestorUpdateFilter>("all");
  const [liveCards, setLiveCards] = useState<UpdateCard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [dataSource, setDataSource] = useState<"ai" | "fallback" | "empty">("empty");

  // ── Fetch from edge function ──
  const fetchUpdates = useCallback(async () => {
    if (!firmName && !firmId) return;
    setIsLoading(true);
    try {
      const { data, error } = await invokeEdgeFunction("investor-updates", {
        body: { firmId: firmId ?? null, firmName: firmName ?? null },
        timeout: 120_000,
      });
      if (error) throw error;
      if (data?.cards && data.cards.length > 0) {
        setLiveCards(data.cards);
        setDataSource(data.source === "fallback" ? "fallback" : "ai");
      } else {
        setLiveCards([]);
        setDataSource("empty");
      }
    } catch (err) {
      console.warn("investor-updates fetch failed:", err);
      setLiveCards([]);
      setDataSource("empty");
    } finally {
      setIsLoading(false);
    }
  }, [firmId, firmName]);

  useEffect(() => {
    fetchUpdates();
  }, [fetchUpdates]);

  // Auto-refresh ticker
  useEffect(() => {
    const interval = setInterval(() => setLastRefreshed(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  const cards = liveCards;

  // ── Filtered views ──
  const visiblePosts = useMemo(
    () => cards.filter((c) => POST_TYPES.includes(c.type) && cardMatchesFilter(c, filter)),
    [cards, filter]
  );

  const visibleCompact = useMemo(
    () => cards.filter((c) => !POST_TYPES.includes(c.type) && cardMatchesFilter(c, filter)),
    [cards, filter]
  );

  const showPostsBlock = filter === "all" || filter === "posts"
    ? visiblePosts.length > 0
    : visiblePosts.length > 0;

  const showCompactBlock = filter !== "posts" && visibleCompact.length > 0;

  const isEmpty =
    filter !== "posts" && !showPostsBlock && !showCompactBlock;

  const compactTitle =
    filter === "all" ? "Deals, funds & team"
    : filter === "investments" ? "Investments"
    : filter === "fund_news" ? "Fund news"
    : filter === "team" ? "Team updates"
    : "Other signals";

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchUpdates().finally(() => {
      setLastRefreshed(new Date());
      setIsRefreshing(false);
    });
  };

  return (
    <div className="space-y-4">
      {/* Status bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {isLoading ? (
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          ) : (
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
            </span>
          )}
          <span className="text-[10px] text-muted-foreground font-medium truncate">
            {isLoading
              ? "Loading updates…"
              : dataSource === "ai"
                ? `Live · ${cards.length} updates · ${lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : dataSource === "fallback"
                  ? `Indexed feed · ${cards.length} updates · ${lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : `No live updates found · checked ${lastRefreshed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
          </span>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isRefreshing || isLoading}
          className="inline-flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 shrink-0"
        >
          {isRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_CHIPS.map(({ key, label }) => {
          const active = filter === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-semibold transition-all border",
                active
                  ? "bg-foreground text-background border-foreground shadow-sm"
                  : "bg-secondary/60 text-muted-foreground border-transparent hover:text-foreground hover:bg-secondary",
              )}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border/60 bg-secondary/20 p-4 space-y-2 animate-pulse">
              <div className="h-3 w-24 rounded bg-border/60" />
              <div className="h-4 w-3/4 rounded bg-border/60" />
              <div className="h-3 w-full rounded bg-border/40" />
              <div className="h-3 w-5/6 rounded bg-border/40" />
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      {!isLoading && (
        <>
          {isEmpty ? (
            <UpdatesEmptyState filter={filter} />
          ) : (
            <div className="space-y-6">
              {/* Official X profile timeline (free embed) — only under Updates → Posts */}
              {filter === "posts" && (
                <FirmXPostsCard xUrl={xUrl} firmName={firmName} />
              )}

              {/* Rich post cards */}
              {showPostsBlock && (
                <section className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Newspaper className="h-3.5 w-3.5 text-accent" />
                    <h3 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Latest posts</h3>
                  </div>
                  <div className="space-y-3">
                    {visiblePosts.map((card, i) => (
                      <RichPostCard key={`post-${i}`} card={card} />
                    ))}
                  </div>
                </section>
              )}

              {/* Compact signal rows */}
              {showCompactBlock && (
                <section className="space-y-2.5">
                  <div className="flex items-center gap-2 pt-1 border-t border-border/60">
                    <Radar className="h-3.5 w-3.5 text-muted-foreground" />
                    <h3 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{compactTitle}</h3>
                  </div>
                  <div className="rounded-xl border border-border/80 bg-secondary/25 divide-y divide-border/50 overflow-hidden">
                    {visibleCompact.map((card, i) => (
                      <CompactCard key={`compact-${i}`} card={card} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
