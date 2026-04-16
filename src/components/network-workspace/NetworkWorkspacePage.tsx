import { useEffect, useMemo, useState } from "react";
import { Activity, GitBranch, Inbox, Route, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  mockIntroducers,
  mockIntroRequests,
  mockOverviewMetrics,
  mockReachablePeople,
  mockSignals,
} from "./mockData";
import type { NetworkWorkspaceTabId, ReachablePerson, ReachablePersonCategory, RelationshipHop } from "./types";
import { NetworkMetricCard } from "./NetworkMetricCard";
import { ReachablePersonRow } from "./ReachablePersonRow";
import { NetworkIntroducerCard } from "./NetworkIntroducerCard";
import { NetworkRequestsBoard } from "./NetworkRequestsBoard";
import { NetworkRequestsTable } from "./NetworkRequestsTable";
import { NetworkSignalItem } from "./NetworkSignalItem";
import { NetworkGraphPlaceholder } from "./NetworkGraphPlaceholder";
import { NetworkPathDetailSheet } from "./NetworkPathDetailSheet";

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

export function NetworkWorkspacePage() {
  const [tab, setTab] = useState<NetworkWorkspaceTabId>("people");
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selected, setSelected] = useState<ReachablePerson | null>(null);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<ReachablePersonCategory | "all">("all");
  const [hop, setHop] = useState<RelationshipHop | "all">("all");
  const [sort, setSort] = useState<PeopleSort>("path");
  const [showGraphPreview, setShowGraphPreview] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setLoading(false), 420);
    return () => window.clearTimeout(t);
  }, []);

  const filteredPeople = useMemo(() => {
    let list = mockReachablePeople.filter((p) => matchesQuery(p, query));
    if (category !== "all") list = list.filter((p) => p.category === category);
    if (hop !== "all") list = list.filter((p) => p.hop === hop);
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
  }, [query, category, hop, sort]);

  const openPath = (p: ReachablePerson) => {
    setSelected(p);
    setSheetOpen(true);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-16">
      <header className="space-y-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Network</p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Relationship execution</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          See who you can reach, through whom, why the path is credible, and the next intro action — without leaving your workflow.
        </p>
      </header>

      <nav className="flex flex-wrap gap-1 border-b border-border/50 pb-px" aria-label="Network sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px rounded-t-lg px-3 py-2 text-[11px] font-semibold uppercase tracking-wide transition-colors",
              tab === t.id
                ? "border border-b-0 border-border/60 bg-card text-foreground shadow-[0_-1px_0_rgba(0,0,0,0.02)]"
                : "border border-transparent text-muted-foreground hover:text-foreground/90",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 rounded-2xl border border-border/50 bg-card/40 px-6 py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-foreground/50" aria-hidden />
          <p className="text-sm text-muted-foreground">Loading relationship workspace…</p>
        </div>
      ) : (
        <>
          {tab === "overview" && (
            <div className="space-y-6">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <NetworkMetricCard
                  label="Reachable investors"
                  value={mockOverviewMetrics.reachableInvestors}
                  hint="Unique investor nodes with a scored warm path."
                  icon={Users}
                />
                <NetworkMetricCard
                  label="Reachable operators"
                  value={mockOverviewMetrics.reachableOperators}
                  hint="Operators and senior IC adjacent to your graph."
                  icon={Activity}
                />
                <NetworkMetricCard
                  label="Best warm paths (7d)"
                  value={mockOverviewMetrics.bestWarmPathsThisWeek}
                  hint="Paths that cleared recency + confidence thresholds."
                  icon={Route}
                />
                <NetworkMetricCard
                  label="Pending intro requests"
                  value={mockOverviewMetrics.pendingIntroRequests}
                  hint="Waiting on intermediary or target response."
                  icon={Inbox}
                />
                <NetworkMetricCard
                  label="New relationship signals"
                  value={mockOverviewMetrics.newRelationshipSignals}
                  hint="Timing triggers worth acting on this week."
                  icon={GitBranch}
                />
              </div>
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                These metrics will map to aggregated graph queries (e.g. <span className="font-mono text-[11px]">GET /network/overview</span>).
              </p>
            </div>
          )}

          {tab === "people" && (
            <div className="space-y-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <Input
                  placeholder="Search by name, role, or firm…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="max-w-md rounded-xl border-border/60 bg-background/80"
                  aria-label="Search reachable people"
                />
                <div className="flex flex-wrap gap-2">
                  <Select value={category} onValueChange={(v) => setCategory(v as ReachablePersonCategory | "all")}>
                    <SelectTrigger className="h-9 w-[140px] rounded-lg text-xs">
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
                    <SelectTrigger className="h-9 w-[130px] rounded-lg text-xs">
                      <SelectValue placeholder="Hop" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All hops</SelectItem>
                      <SelectItem value="direct">Direct</SelectItem>
                      <SelectItem value="2-hop">2-hop</SelectItem>
                      <SelectItem value="3-hop">3-hop</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={sort} onValueChange={(v) => setSort(v as PeopleSort)}>
                    <SelectTrigger className="h-9 w-[160px] rounded-lg text-xs">
                      <SelectValue placeholder="Sort" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="path">Strongest path</SelectItem>
                      <SelectItem value="recent">Recent activity</SelectItem>
                      <SelectItem value="fit">Fit / relevance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {filteredPeople.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border/60 bg-muted/20 px-6 py-14 text-center">
                  <p className="text-sm font-medium text-foreground">No one matches these filters</p>
                  <p className="mt-1 text-[13px] text-muted-foreground">Try clearing search or widening hop distance.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredPeople.map((p) => (
                    <ReachablePersonRow key={p.id} person={p} onViewPath={openPath} />
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "introducers" && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mockIntroducers.map((i) => (
                <NetworkIntroducerCard key={i.id} introducer={i} />
              ))}
            </div>
          )}

          {tab === "requests" && (
            <div className="space-y-6">
              <p className="text-[12px] text-muted-foreground">Intro execution state — wire to your CRM or intro tracker when APIs are ready.</p>
              <NetworkRequestsBoard rows={mockIntroRequests} />
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">All requests</p>
                <NetworkRequestsTable rows={mockIntroRequests} />
              </div>
            </div>
          )}

          {tab === "signals" && (
            <div className="space-y-2">
              {mockSignals.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border/60 px-4 py-10 text-center text-sm text-muted-foreground">
                  No signals yet.
                </p>
              ) : (
                mockSignals.map((s) => <NetworkSignalItem key={s.id} signal={s} />)
              )}
            </div>
          )}

          {tab === "graph" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-card/50 px-4 py-3">
                <div className="space-y-0.5">
                  <Label htmlFor="nw-graph-toggle" className="text-sm font-medium text-foreground">
                    Graph preview
                  </Label>
                  <p className="text-[11px] text-muted-foreground">Optional — keep off for day-to-day execution.</p>
                </div>
                <Switch id="nw-graph-toggle" checked={showGraphPreview} onCheckedChange={setShowGraphPreview} />
              </div>
              {showGraphPreview ? (
                <NetworkGraphPlaceholder />
              ) : (
                <div className="flex min-h-[200px] flex-col items-center justify-center rounded-2xl border border-dashed border-border/55 bg-muted/15 px-6 py-12 text-center">
                  <p className="text-sm font-medium text-foreground">Graph preview is off</p>
                  <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">
                    Enable the toggle to see a placeholder layout. Primary work stays in People and Requests.
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      <NetworkPathDetailSheet person={selected} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}
