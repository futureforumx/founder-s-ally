import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  Bell,
  Bookmark,
  Building2,
  ChevronDown,
  Loader2,
  Network,
  Radar,
  Search,
  Sparkles,
  Tags,
  TrendingUp,
  User,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  fetchIntelligenceFeed,
  fetchIntelligenceSummary,
  filterFallbackEvents,
  INTELLIGENCE_FALLBACK_EVENTS,
  INTELLIGENCE_FALLBACK_SIDE_RAIL,
  intelligenceAction,
  type IntelligenceFeedEvent,
  type IntelligenceSummaryStrip,
} from "@/lib/intelligenceFeedApi";

/** Top-nav lanes on `/intelligence` — API `category` string (null = full Brief). */
export type IntelligenceVariant = "brief" | "category" | "funding" | "regulatory" | "customer" | "ma";

const TIMEFRAMES = [
  { id: "24h", hours: 24, label: "24h" },
  { id: "7d", hours: 24 * 7, label: "7d" },
  { id: "30d", hours: 24 * 30, label: "30d" },
] as const;

const INTELLIGENCE_OFFLINE_SUMMARY_FALLBACK: IntelligenceSummaryStrip = {
  highSignal24h: 2,
  investorActivity: 1,
  competitorMoves: 1,
  peopleMoves: 0,
  newFunds: 0,
  productLaunches: 0,
  regulatory: 0,
};

const ENTITY_TYPES = [
  { value: "", label: "Any entity" },
  { value: "company", label: "Company" },
  { value: "fund", label: "Fund" },
  { value: "investor", label: "Investor" },
  { value: "person", label: "Person" },
  { value: "technology", label: "Technology" },
];

function categoryChipClass(cat: string): string {
  switch (cat) {
    case "investors":
    case "funding":
      return "bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/25";
    case "market":
    case "category":
    case "customer":
      return "bg-sky-500/15 text-sky-800 dark:text-sky-200 border-sky-500/25";
    case "tech":
      return "bg-emerald-500/15 text-emerald-800 dark:text-emerald-200 border-emerald-500/25";
    case "network":
    case "ma":
      return "bg-amber-500/15 text-amber-900 dark:text-amber-200 border-amber-500/30";
    case "regulatory":
      return "bg-rose-500/10 text-rose-800 dark:text-rose-200 border-rose-500/25";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function signalMeter(score: number): { label: string; className: string } {
  if (score >= 0.8) return { label: "High", className: "text-emerald-600" };
  if (score >= 0.55) return { label: "Med", className: "text-amber-600" };
  return { label: "Low", className: "text-muted-foreground" };
}

function SummaryStrip({ data }: { data: IntelligenceSummaryStrip | null }) {
  if (!data) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-1 animate-pulse">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 min-w-[120px] rounded-xl bg-muted/60" />
        ))}
      </div>
    );
  }
  const cells = [
    { k: "High-signal (24h)", v: data.highSignal24h, icon: Zap },
    { k: "Investor activity", v: data.investorActivity, icon: TrendingUp },
    { k: "Competitor moves", v: data.competitorMoves, icon: Radar },
    { k: "People moves", v: data.peopleMoves, icon: User },
    { k: "New funds", v: data.newFunds, icon: Building2 },
    { k: "Product launches", v: data.productLaunches, icon: Sparkles },
    { k: "Regulatory", v: data.regulatory, icon: Activity },
  ];
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
      {cells.map((c) => (
        <div
          key={c.k}
          className="flex shrink-0 items-center gap-2 rounded-xl border border-border/60 bg-card/80 px-3 py-2 min-w-[128px]"
        >
          <c.icon className="h-4 w-4 text-muted-foreground shrink-0" />
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground leading-tight">
              {c.k}
            </p>
            <p className="text-lg font-semibold tabular-nums text-foreground leading-tight">{c.v}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function IntelligenceCard({
  ev,
  onDismiss,
  onSave,
  onWatchlist,
  onNote,
  onAlert,
  categoryLane,
}: {
  ev: IntelligenceFeedEvent;
  onDismiss: (id: string) => void;
  onSave: (id: string) => void;
  onWatchlist: (id: string) => void;
  onNote: (id: string) => void;
  onAlert: (id: string) => void;
  categoryLane?: boolean;
}) {
  const imp = signalMeter(Number(ev.importance_score));
  const rel = signalMeter(Number(ev.relevance_score));
  const when = ev.last_seen_at || ev.first_seen_at;
  const entities = ev.entities || [];

  return (
    <article
      className={cn(
        "rounded-2xl border border-border/70 bg-card p-4 shadow-sm hover:border-border transition-colors",
        categoryLane && "border-l-[3px] border-l-sky-500/50 pl-[calc(1rem-3px)]",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span
          className={cn(
            "inline-flex items-center rounded-lg border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            categoryChipClass(ev.category),
          )}
        >
          {ev.category}
        </span>
        <time className="text-[11px] text-muted-foreground tabular-nums">
          {when ? formatDistanceToNow(new Date(when), { addSuffix: true }) : "—"}
        </time>
      </div>
      <h3 className="mt-2 text-sm font-semibold text-foreground leading-snug">{ev.title}</h3>
      {entities.length > 0 && (
        <p className="mt-1.5 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Entities: </span>
          {entities.map((e) => e.name).join(" · ")}
        </p>
      )}
      <p className="mt-2 text-xs text-foreground/85 leading-relaxed line-clamp-2">{ev.summary}</p>
      <div className="mt-3 rounded-lg bg-muted/40 border border-border/40 px-3 py-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          Why it matters
        </p>
        <p className="text-xs text-foreground/90 leading-relaxed">{ev.why_it_matters}</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span>
          Sources: <span className="font-medium text-foreground">{ev.source_count}</span>
        </span>
        <span className={imp.className}>
          Importance: <span className="font-medium">{imp.label}</span>
        </span>
        <span className={rel.className}>
          Relevance: <span className="font-medium">{rel.label}</span>
        </span>
        {ev.saved && (
          <span className="text-violet-600 dark:text-violet-400 font-medium flex items-center gap-0.5">
            <Bookmark className="h-3 w-3" /> Saved
          </span>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => onSave(ev.id)}>
          {ev.saved ? "Saved" : "Save"}
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => onDismiss(ev.id)}>
          <X className="h-3 w-3 mr-1" /> Dismiss
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => onWatchlist(ev.id)}>
          Watchlist
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => onNote(ev.id)}>
          Notes
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px]" onClick={() => onAlert(ev.id)}>
          <Bell className="h-3 w-3 mr-1" /> Alert
        </Button>
      </div>
    </article>
  );
}

function SideRail({
  trendingInvestors,
  newFunds,
  peopleMoves,
  risingTopics,
}: {
  trendingInvestors: { id: string; name: string; type: string }[];
  newFunds: { id: string; name: string; type: string }[];
  peopleMoves: { id: string; name: string; type: string }[];
  risingTopics: string[];
}) {
  const Block = ({
    title,
    icon: Icon,
    children,
  }: {
    title: string;
    icon: typeof TrendingUp;
    children: React.ReactNode;
  }) => (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-xs font-semibold uppercase tracking-wide text-foreground">{title}</h4>
      </div>
      {children}
    </div>
  );

  return (
    <div className="space-y-4">
      <Block title="Trending investors" icon={TrendingUp}>
        <ul className="space-y-2 text-sm">
          {trendingInvestors.map((x) => (
            <li key={x.id} className="text-foreground/90 truncate">
              {x.name}
            </li>
          ))}
          {!trendingInvestors.length && <li className="text-xs text-muted-foreground">No data yet</li>}
        </ul>
      </Block>
      <Block title="New funds" icon={Building2}>
        <ul className="space-y-2 text-sm">
          {newFunds.map((x) => (
            <li key={x.id} className="text-foreground/90 truncate">
              {x.name}
            </li>
          ))}
          {!newFunds.length && <li className="text-xs text-muted-foreground">No data yet</li>}
        </ul>
      </Block>
      <Block title="People on the move" icon={User}>
        <ul className="space-y-2 text-sm">
          {peopleMoves.map((x) => (
            <li key={x.id} className="text-foreground/90 truncate">
              {x.name}
            </li>
          ))}
          {!peopleMoves.length && <li className="text-xs text-muted-foreground">No data yet</li>}
        </ul>
      </Block>
      <Block title="Rising topics" icon={Network}>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          {risingTopics.map((t) => (
            <li key={t} className="flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-accent shrink-0" />
              {t}
            </li>
          ))}
        </ul>
      </Block>
    </div>
  );
}

interface IntelligencePageProps {
  variant: IntelligenceVariant;
}

export function IntelligencePage({ variant }: IntelligencePageProps) {
  const [events, setEvents] = useState<IntelligenceFeedEvent[]>([]);
  const [sideRail, setSideRail] = useState<{
    trendingInvestors: { id: string; name: string; type: string }[];
    newFunds: { id: string; name: string; type: string }[];
    peopleMoves: { id: string; name: string; type: string }[];
    risingTopics: string[];
  } | null>(null);
  const [summary, setSummary] = useState<IntelligenceSummaryStrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const [timeframe, setTimeframe] = useState<(typeof TIMEFRAMES)[number]>(TIMEFRAMES[1]);
  const [watchlistOnly, setWatchlistOnly] = useState(false);
  const [highSignalOnly, setHighSignalOnly] = useState(false);
  const [entityType, setEntityType] = useState("");
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");

  const [noteOpen, setNoteOpen] = useState(false);
  const [noteEventId, setNoteEventId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [projectLabel, setProjectLabel] = useState("");

  const [watchOpen, setWatchOpen] = useState(false);
  const [watchEventId, setWatchEventId] = useState<string | null>(null);
  const [watchKeyword, setWatchKeyword] = useState("");
  const [watchEntityId, setWatchEntityId] = useState<string | null>(null);

  const categoryFilter = useMemo(() => {
    if (variant === "brief") return null;
    return variant;
  }, [variant]);

  const fetchPage = useCallback(
    async (offset: number, replace: boolean) => {
      if (replace) setLoading(true);
      else setLoadingMore(true);
      try {
        try {
          const feed = await fetchIntelligenceFeed({
            category: categoryFilter,
            watchlistOnly,
            highSignalOnly,
            hours: timeframe.hours,
            entityType: entityType || null,
            search: search || null,
            limit: 15,
            offset,
          });
          setSideRail(feed.sideRail);
          if (replace) {
            setEvents(feed.events);
            setNextOffset(feed.events.length);
          } else {
            setEvents((prev) => [...prev, ...feed.events]);
            setNextOffset(offset + feed.events.length);
          }
          setHasMore(feed.events.length >= 15);
        } catch (e) {
          console.warn("[intelligence] feed request failed; using offline preview", e);
          if (replace) {
            const fb = filterFallbackEvents(categoryFilter, INTELLIGENCE_FALLBACK_EVENTS);
            setEvents(fb);
            setNextOffset(fb.length);
            setSideRail(INTELLIGENCE_FALLBACK_SIDE_RAIL);
            setHasMore(false);
          } else {
            setHasMore(false);
          }
        }

        try {
          const sum = await fetchIntelligenceSummary({ hours: 24 });
          setSummary(sum);
        } catch (e) {
          console.warn("[intelligence] summary request failed; using defaults", e);
          if (replace) setSummary(INTELLIGENCE_OFFLINE_SUMMARY_FALLBACK);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [categoryFilter, watchlistOnly, highSignalOnly, timeframe.hours, entityType, search],
  );

  useEffect(() => {
    setNextOffset(0);
    fetchPage(0, true);
  }, [categoryFilter, watchlistOnly, highSignalOnly, timeframe.id, entityType, search, fetchPage]);

  const loadMore = () => {
    if (!hasMore || loadingMore) return;
    fetchPage(nextOffset, false);
  };

  const applySearch = () => {
    setSearch(searchDraft.trim());
  };

  const handleDismiss = async (id: string) => {
    try {
      await intelligenceAction({ action: "dismiss", eventId: id });
      setEvents((prev) => prev.filter((e) => e.id !== id));
      toast.success("Dismissed");
    } catch {
      toast.error("Could not dismiss");
    }
  };

  const handleSave = async (id: string) => {
    try {
      await intelligenceAction({ action: "save", eventId: id });
      setEvents((prev) => prev.map((e) => (e.id === id ? { ...e, saved: true } : e)));
      toast.success("Saved to intelligence");
    } catch {
      toast.error("Could not save");
    }
  };

  const handleAlert = async (id: string) => {
    try {
      await intelligenceAction({ action: "alert", eventId: id });
      toast.success("Alert created");
    } catch {
      toast.error("Could not create alert");
    }
  };

  const openNote = (id: string) => {
    setNoteEventId(id);
    setNoteOpen(true);
  };

  const submitNote = async () => {
    if (!noteEventId) return;
    try {
      await intelligenceAction({
        action: "note",
        eventId: noteEventId,
        notes: noteText,
        projectLabel: projectLabel || null,
      });
      toast.success("Saved to notes / project");
      setNoteOpen(false);
      setNoteText("");
      setProjectLabel("");
    } catch {
      toast.error("Could not save notes");
    }
  };

  const openWatch = (id: string) => {
    const ev = events.find((e) => e.id === id);
    setWatchEventId(id);
    setWatchKeyword("");
    const first = ev?.entities?.[0];
    setWatchEntityId(first?.id || null);
    setWatchOpen(true);
  };

  const submitWatchlist = async () => {
    try {
      await intelligenceAction({
        action: "watchlist_add",
        entityId: watchEntityId || undefined,
        keyword: watchKeyword.trim() || undefined,
        watchlistCategory: categoryFilter,
      });
      toast.success("Added to watchlist");
      setWatchOpen(false);
    } catch {
      toast.error("Could not add watchlist");
    }
  };

  const watchEntities = watchEventId ? events.find((e) => e.id === watchEventId)?.entities || [] : [];

  const headline =
    variant === "brief"
      ? "Brief"
      : variant === "category"
        ? "Category"
        : variant === "funding"
          ? "Funding"
          : variant === "regulatory"
            ? "Regulatory"
            : variant === "customer"
              ? "Customer"
              : "M&A / Strategic Moves";

  const subcopy =
    variant === "category"
      ? "Sector composition, taxonomy shifts, and category-defining moves — surfaced as ranked signals, not noise."
      : "Structured events ranked by relevance — not raw headlines. Act on what changes your strategy.";

  const summaryEyebrow =
    variant === "category" ? "Category pulse — last 24 hours" : "Last 24 hours — snapshot";

  const isCategoryLane = variant === "category";

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                isCategoryLane
                  ? "bg-sky-500/15 text-sky-700 dark:text-sky-300"
                  : "bg-accent/15 text-accent",
              )}
            >
              {isCategoryLane ? <Tags className="h-4 w-4" /> : <Radar className="h-4 w-4" />}
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{headline}</h1>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl leading-relaxed">{subcopy}</p>
            </div>
          </div>
        </div>
        {isCategoryLane && (
          <div className="mt-4 rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/[0.06] to-transparent px-4 py-3 dark:from-sky-500/10 dark:to-transparent">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-800 dark:text-sky-200">
              Market lane · Category
            </p>
            <p className="mt-1 text-xs text-foreground/85 leading-relaxed">
              Use filters to narrow by entity and timeframe. High-signal and watchlist toggles help you stay inside
              the moves that reframe how buyers and investors think about your space.
            </p>
          </div>
        )}
      </div>

      <section aria-label="Signal summary">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
          {summaryEyebrow}
        </p>
        <SummaryStrip data={summary} />
      </section>

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
        <div className="flex-1 min-w-0 space-y-4">
          <div
            className={cn(
              "flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center",
              isCategoryLane && "rounded-2xl border border-border/50 bg-card/40 p-3 sm:p-4",
            )}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                  Timeframe: {timeframe.label}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {TIMEFRAMES.map((t) => (
                  <DropdownMenuItem key={t.id} onClick={() => setTimeframe(t)}>
                    {t.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1 text-xs">
                  Entity: {ENTITY_TYPES.find((e) => e.value === entityType)?.label}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {ENTITY_TYPES.map((e) => (
                  <DropdownMenuItem key={e.value || "any"} onClick={() => setEntityType(e.value)}>
                    {e.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox checked={watchlistOnly} onCheckedChange={(c) => setWatchlistOnly(c === true)} />
              Watchlist only
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <Checkbox checked={highSignalOnly} onCheckedChange={(c) => setHighSignalOnly(c === true)} />
              High signal
            </label>

            <div className="flex flex-1 min-w-[200px] gap-1">
              <Input
                placeholder="Keyword search…"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && applySearch()}
                className="h-8 text-xs"
              />
              <Button type="button" variant="secondary" size="sm" className="h-8 px-2" onClick={applySearch}>
                <Search className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              {isCategoryLane
                ? "No category signals match these filters. Widen the timeframe, clear watchlist-only, or try a different entity type."
                : "No events match these filters. Try another timeframe or clear watchlist-only."}
            </div>
          ) : (
            <div className="space-y-4">
              {events.map((ev) => (
                <IntelligenceCard
                  key={ev.id}
                  ev={ev}
                  onDismiss={handleDismiss}
                  onSave={handleSave}
                  onWatchlist={openWatch}
                  onNote={openNote}
                  onAlert={handleAlert}
                  categoryLane={isCategoryLane}
                />
              ))}
              {hasMore && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={loadingMore}
                  onClick={loadMore}
                >
                  {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load more"}
                </Button>
              )}
            </div>
          )}
        </div>

        <aside className="w-full lg:w-72 shrink-0 space-y-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            {isCategoryLane ? "Category context" : "Context"}
          </p>
          <SideRail
            trendingInvestors={sideRail?.trendingInvestors || []}
            newFunds={sideRail?.newFunds || []}
            peopleMoves={sideRail?.peopleMoves || []}
            risingTopics={sideRail?.risingTopics || []}
          />
        </aside>
      </div>

      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to notes / project</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="intel-note">Notes</Label>
              <Input
                id="intel-note"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Your take, next steps…"
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="intel-project">Project label (optional)</Label>
              <Input
                id="intel-project"
                value={projectLabel}
                onChange={(e) => setProjectLabel(e.target.value)}
                placeholder="e.g. Series A prep"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setNoteOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submitNote}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={watchOpen} onOpenChange={setWatchOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add to watchlist</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Follow an entity from this event, or add a keyword to track across the feed.
            </p>
            {watchEntities.length > 0 && (
              <div>
                <Label>Entity</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="w-full mt-1 justify-between">
                      {watchEntityId
                        ? watchEntities.find((e) => e.id === watchEntityId)?.name || "Select"
                        : "Select entity"}
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-[var(--radix-dropdown-menu-trigger-width)]">
                    {watchEntities.map((e) => (
                      <DropdownMenuItem key={e.id} onClick={() => setWatchEntityId(e.id)}>
                        {e.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}
            <div>
              <Label htmlFor="watch-kw">Keyword (optional)</Label>
              <Input
                id="watch-kw"
                value={watchKeyword}
                onChange={(e) => setWatchKeyword(e.target.value)}
                placeholder="e.g. LatticeMind"
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setWatchOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={submitWatchlist} disabled={!watchEntityId && !watchKeyword.trim()}>
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
