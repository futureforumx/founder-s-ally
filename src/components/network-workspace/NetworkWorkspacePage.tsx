import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, GitBranch, Inbox, Route, Users } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import {
  mockIntroducers,
  mockIntroRequests,
  mockOverviewMetrics,
  mockReachablePeople,
  mockSignals,
} from "./mockData";
import type {
  NetworkQuickFilter,
  NetworkWorkspaceTabId,
  ReachablePerson,
  ReachablePersonCategory,
  RelationshipHop,
} from "./types";
import { NetworkMetricCard } from "./NetworkMetricCard";
import { NetworkIntroducerCard } from "./NetworkIntroducerCard";
import { NetworkRequestsBoard } from "./NetworkRequestsBoard";
import { NetworkRequestsTable } from "./NetworkRequestsTable";
import { NetworkSignalItem } from "./NetworkSignalItem";
import { NetworkGraphPlaceholder } from "./NetworkGraphPlaceholder";
import { NetworkCommandBar } from "./NetworkCommandBar";
import { NetworkOpportunityList } from "./NetworkOpportunityList";
import { NetworkRelationshipDetailPanel } from "./NetworkRelationshipDetailPanel";
import { nwTransition } from "./networkMotion";

const TABS: { id: NetworkWorkspaceTabId; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "people", label: "People" },
  { id: "introducers", label: "Introducers" },
  { id: "requests", label: "Requests" },
  { id: "signals", label: "Signals" },
  { id: "graph", label: "Graph" },
];

type PeopleSort = "path" | "recent" | "fit";

function matchesQuery(p: ReachablePerson, q: string) {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    p.fullName.toLowerCase().includes(s) ||
    p.role.toLowerCase().includes(s) ||
    p.firmName.toLowerCase().includes(s)
  );
}

function applyQuickFilters(list: ReachablePerson[], quick: Set<NetworkQuickFilter>): ReachablePerson[] {
  let out = [...list];
  if (quick.has("investors")) out = out.filter((p) => p.category === "investor");
  if (quick.has("customers")) out = out.filter((p) => p.category === "customer");
  if (quick.has("one_hop")) out = out.filter((p) => p.hop === "direct");
  if (quick.has("high_confidence")) out = out.filter((p) => (p.bestPath.confidence ?? 0) >= 0.78);
  if (quick.has("recent_active")) {
    const cutoff = Date.now() - 14 * 86400000;
    out = out.filter((p) => p.lastSignalAt && new Date(p.lastSignalAt).getTime() >= cutoff);
  }
  if (quick.has("warmest")) {
    out.sort((a, b) => (b.warmth ?? 0) - (a.warmth ?? 0));
  }
  return out;
}

export function NetworkWorkspacePage() {
  const [tab, setTab] = useState<NetworkWorkspaceTabId>("people");
  const [loading, setLoading] = useState(true);
  const [narrow, setNarrow] = useState(false);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ReachablePersonCategory | "all">("all");
  const [hop, setHop] = useState<RelationshipHop | "all">("all");
  const [sort, setSort] = useState<PeopleSort>("path");
  const [quickFilters, setQuickFilters] = useState<Set<NetworkQuickFilter>>(() => new Set());
  const [showGraphPreview, setShowGraphPreview] = useState(false);
  const [selected, setSelected] = useState<ReachablePerson | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 520);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const fn = () => setNarrow(mq.matches);
    fn();
    mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);

  useEffect(() => {
    if (!narrow) setMobileSheetOpen(false);
  }, [narrow]);

  useEffect(() => {
    if (!selected) setMobileSheetOpen(false);
  }, [selected]);

  const basePeople = useMemo(() => {
    let list = mockReachablePeople.filter((p) => matchesQuery(p, query));
    if (category !== "all") list = list.filter((p) => p.category === category);
    if (hop !== "all") list = list.filter((p) => p.hop === hop);
    return list;
  }, [query, category, hop]);

  const filteredPeople = useMemo(() => {
    let list = applyQuickFilters(basePeople, quickFilters);
    if (quickFilters.has("warmest")) return list;
    const next = [...list];
    if (sort === "path") next.sort((a, b) => b.bestPath.score - a.bestPath.score);
    else if (sort === "fit") next.sort((a, b) => (b.fitRelevance ?? -1) - (a.fitRelevance ?? -1));
    else
      next.sort((a, b) => {
        const ta = a.lastSignalAt ? new Date(a.lastSignalAt).getTime() : 0;
        const tb = b.lastSignalAt ? new Date(b.lastSignalAt).getTime() : 0;
        return tb - ta;
      });
    return next;
  }, [basePeople, quickFilters, sort]);

  useEffect(() => {
    if (tab !== "people") return;
    setSelected((prev) => {
      if (filteredPeople.length === 0) return null;
      if (!prev || !filteredPeople.some((p) => p.id === prev.id)) return filteredPeople[0];
      return prev;
    });
  }, [filteredPeople, tab]);

  const toggleQuick = useCallback((id: NetworkQuickFilter) => {
    setQuickFilters((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const clearPeopleFilters = useCallback(() => {
    setQuery("");
    setCategory("all");
    setHop("all");
    setQuickFilters(new Set());
    setSort("path");
  }, []);

  const handleSelectPerson = useCallback(
    (p: ReachablePerson) => {
      setSelected(p);
      if (narrow) setMobileSheetOpen(true);
    },
    [narrow],
  );

  return (
    <div className="mx-auto max-w-[1360px] pb-20 pt-1">
      <header className="mb-6 border-b border-border/35 pb-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Execution</p>
        <h1 className="mt-1 text-[1.35rem] font-semibold leading-tight tracking-tight text-foreground sm:text-xl">
          Relationship command center
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
          Ranked paths, credibility, and the next move — built for founders running investor, customer, and operator relationships.
        </p>
      </header>

      <nav className="mb-4 flex flex-wrap gap-px rounded-lg border border-border/45 bg-muted/15 p-px" aria-label="Network sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "rounded-[6px] px-3 py-2 text-[11px] font-semibold tracking-wide transition-[background-color,color,box-shadow] duration-150 ease-out",
              tab === t.id
                ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/10"
                : "text-muted-foreground hover:bg-background/50 hover:text-foreground/90",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={nwTransition}
        >
          {tab === "overview" && (
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                <NetworkMetricCard
                  label="Reachable investors"
                  value={mockOverviewMetrics.reachableInvestors}
                  hint="Scored warm paths in your graph."
                  icon={Users}
                />
                <NetworkMetricCard
                  label="Reachable operators"
                  value={mockOverviewMetrics.reachableOperators}
                  hint="Bench adjacent to your company."
                  icon={Activity}
                />
                <NetworkMetricCard
                  label="Best warm paths (7d)"
                  value={mockOverviewMetrics.bestWarmPathsThisWeek}
                  hint="Crossed recency + confidence thresholds."
                  icon={Route}
                />
                <NetworkMetricCard
                  label="Pending intro requests"
                  value={mockOverviewMetrics.pendingIntroRequests}
                  hint="Awaiting intermediary or target."
                  icon={Inbox}
                />
                <NetworkMetricCard
                  label="New relationship signals"
                  value={mockOverviewMetrics.newRelationshipSignals}
                  hint="Timing triggers worth acting on."
                  icon={GitBranch}
                />
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Metrics will map to aggregated graph endpoints (e.g. <span className="font-mono text-[10px]">GET /network/overview</span>).
              </p>
            </div>
          )}

          {tab === "people" && (
            <div className="flex flex-col gap-0 lg:min-h-[min(72vh,640px)]">
              <div className="sticky top-0 z-20 -mx-1 mb-3 border-b border-border/40 bg-background/90 px-1 py-2.5 backdrop-blur-md supports-[backdrop-filter]:bg-background/75">
                <NetworkCommandBar
                  query={query}
                  onQueryChange={setQuery}
                  quickFilters={quickFilters}
                  onToggleQuick={toggleQuick}
                  sort={sort}
                  onSortChange={setSort}
                  resultCount={filteredPeople.length}
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Select value={category} onValueChange={(v) => setCategory(v as ReachablePersonCategory | "all")}>
                    <SelectTrigger className="h-8 w-[128px] rounded-md border-border/50 bg-muted/15 text-[11px]">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All categories</SelectItem>
                      <SelectItem value="investor">Investor</SelectItem>
                      <SelectItem value="founder">Founder</SelectItem>
                      <SelectItem value="operator">Operator</SelectItem>
                      <SelectItem value="customer">Customer</SelectItem>
                      <SelectItem value="advisor">Advisor</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={hop} onValueChange={(v) => setHop(v as RelationshipHop | "all")}>
                    <SelectTrigger className="h-8 w-[118px] rounded-md border-border/50 bg-muted/15 text-[11px]">
                      <SelectValue placeholder="Hop" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All hops</SelectItem>
                      <SelectItem value="direct">1-hop</SelectItem>
                      <SelectItem value="2-hop">2-hop</SelectItem>
                      <SelectItem value="3-hop">3-hop</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid flex-1 grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1fr)_min(420px,40%)] lg:gap-0 lg:divide-x lg:divide-border/35">
                <div className="min-h-0 min-w-0 lg:pr-4">
                  {!loading && filteredPeople.length === 0 ? (
                    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border/50 bg-muted/10 px-4 py-10">
                      <p className="text-[13px] font-medium text-foreground">No opportunities match</p>
                      <p className="max-w-sm text-[12px] leading-relaxed text-muted-foreground">
                        Loosen filters or clear the command bar to repopulate ranked paths from your graph.
                      </p>
                      <Button type="button" variant="secondary" size="sm" className="h-8 rounded-md text-[12px] font-semibold" onClick={clearPeopleFilters}>
                        Clear filters
                      </Button>
                    </div>
                  ) : (
                    <NetworkOpportunityList
                      people={filteredPeople}
                      selectedId={selected?.id ?? null}
                      onSelect={handleSelectPerson}
                      loading={loading}
                    />
                  )}
                </div>

                <aside className="relative mt-4 hidden min-h-0 min-w-0 lg:mt-0 lg:block lg:pl-4">
                  <div className="lg:sticky lg:top-2">
                    {selected ? (
                      <div className="overflow-hidden rounded-lg border border-border/45 bg-muted/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.02)]">
                        <NetworkRelationshipDetailPanel person={selected} />
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-border/45 bg-muted/10 px-4 py-12 text-[12px] text-muted-foreground">
                        Select a row to inspect path strength, evidence, and intro copy.
                      </div>
                    )}
                  </div>
                </aside>
              </div>
            </div>
          )}

          {tab === "introducers" && (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {mockIntroducers.map((i) => (
                <NetworkIntroducerCard key={i.id} introducer={i} />
              ))}
            </div>
          )}

          {tab === "requests" && (
            <div className="space-y-5">
              <p className="text-[12px] text-muted-foreground">Intro execution — connect to CRM when APIs are ready.</p>
              <NetworkRequestsBoard rows={mockIntroRequests} />
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">All requests</p>
                <NetworkRequestsTable rows={mockIntroRequests} />
              </div>
            </div>
          )}

          {tab === "signals" && (
            <div className="space-y-1.5">
              {mockSignals.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border/50 px-4 py-10 text-center text-[12px] text-muted-foreground">
                  No signals yet.
                </p>
              ) : (
                mockSignals.map((s) => <NetworkSignalItem key={s.id} signal={s} />)
              )}
            </div>
          )}

          {tab === "graph" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border/45 bg-muted/10 px-3 py-2.5">
                <div>
                  <Label htmlFor="nw-graph-toggle" className="text-[12px] font-medium text-foreground">
                    Graph preview
                  </Label>
                  <p className="text-[11px] text-muted-foreground">Optional — lists stay primary.</p>
                </div>
                <Switch id="nw-graph-toggle" checked={showGraphPreview} onCheckedChange={setShowGraphPreview} />
              </div>
              {showGraphPreview ? (
                <NetworkGraphPlaceholder />
              ) : (
                <div className="flex min-h-[180px] flex-col justify-center rounded-lg border border-dashed border-border/45 bg-muted/10 px-4 py-8">
                  <p className="text-[12px] font-medium text-foreground">Preview off</p>
                  <p className="mt-1 max-w-md text-[11px] leading-relaxed text-muted-foreground">
                    Enable for an exploratory layout. Execution stays in People and Requests.
                  </p>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[90vh] rounded-t-xl border-border/50 p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {selected ? (
            <NetworkRelationshipDetailPanel person={selected} showClose onClose={() => setMobileSheetOpen(false)} />
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
