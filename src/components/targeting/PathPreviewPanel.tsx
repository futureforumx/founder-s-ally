import { ChevronRight, Route, AlertCircle, Plug } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { usePathsToOrg, type PathRow } from "@/hooks/usePathsToOrg";
import { setConnectorOAuthResumeView } from "@/lib/connectorClient";
import { formatDistanceToNow } from "date-fns";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreBar(score: number) {
  const pct = Math.min(100, Math.max(0, score));
  const color =
    pct >= 70
      ? "bg-emerald-500"
      : pct >= 40
        ? "bg-amber-400"
        : "bg-muted-foreground/40";

  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1 w-16 overflow-hidden rounded-full bg-muted/60">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-[10px] text-muted-foreground">{pct.toFixed(0)}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PathChain — visual hop display
// ---------------------------------------------------------------------------

function PathChain({
  hops,
}: {
  hops: { label: string; sub?: string }[];
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-0.5">
      {hops.map((hop, i) => (
        <span key={i} className="flex min-w-0 items-center gap-0.5">
          {i > 0 && (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/40" aria-hidden />
          )}
          <span className="flex min-w-0 flex-col">
            <span className="max-w-[8rem] truncate text-[11px] font-medium text-foreground/90">
              {hop.label}
            </span>
            {hop.sub && (
              <span className="text-[10px] text-muted-foreground">{hop.sub}</span>
            )}
          </span>
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PathCard
// ---------------------------------------------------------------------------

function PathCard({
  path,
  personNames,
}: {
  path: PathRow;
  personNames: Map<string, string>;
}) {
  const targetName = personNames.get(path.target_person_id) ?? path.target_person_id.slice(0, 8);
  const viaName = path.via_person_id ? (personNames.get(path.via_person_id) ?? "Unknown") : null;

  const isOnehop = path.path_type === "one_hop";
  const age = path.last_interaction_at
    ? formatDistanceToNow(new Date(path.last_interaction_at), { addSuffix: true })
    : null;

  const hops = isOnehop && viaName
    ? [{ label: "You" }, { label: viaName, sub: "via" }, { label: targetName }]
    : [{ label: "You" }, { label: targetName }];

  return (
    <div className="rounded-lg border border-border/40 bg-card/50 px-3 py-2.5 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Badge
          variant="outline"
          className={cn(
            "shrink-0 text-[10px] border",
            isOnehop
              ? "border-violet-500/30 bg-violet-500/10 text-violet-400"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
          )}
        >
          {isOnehop ? "1-hop" : "Direct"}
        </Badge>
        {scoreBar(path.path_score)}
      </div>
      <PathChain hops={hops} />
      {age && (
        <p className="text-[10px] text-muted-foreground">Last contact {age}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PathPreviewPanel
// ---------------------------------------------------------------------------

interface PathPreviewPanelProps {
  ownerContextId: string | null | undefined;
  orgId: string;
  orgName: string | null;
}

export function PathPreviewPanel({ ownerContextId, orgId, orgName }: PathPreviewPanelProps) {
  const { data, isLoading, isError, error } = usePathsToOrg(ownerContextId, orgId);

  const paths = data?.paths ?? [];
  const personNames = data?.personNames ?? new Map();
  const hasSelfPerson = data ? data.selfPersonId !== null : true; // don't flash error while loading

  const directPaths = paths.filter((p) => p.path_type === "direct");
  const onehopPaths = paths.filter((p) => p.path_type === "one_hop");

  return (
    <Card className="border-border/60 bg-card/70">
      <CardHeader className="pb-3 pt-4">
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4 shrink-0 text-muted-foreground" />
          <CardTitle className="text-sm font-medium text-foreground">
            Paths to{" "}
            <span className="text-foreground/80">{orgName ?? "org"}</span>
          </CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pb-4 pt-0">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : isError ? (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {(error as Error)?.message ?? "Failed to load paths."}
          </div>
        ) : !hasSelfPerson ? (
          <div className="flex flex-col items-start gap-2.5 rounded-lg border border-border/40 bg-muted/20 px-3 py-3">
            <p className="text-xs text-muted-foreground">
              No identity link found. Connect an account so Vekta can resolve your network paths.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={() => {
                setConnectorOAuthResumeView("targeting");
                window.dispatchEvent(new CustomEvent("navigate-view", { detail: "settings" }));
                window.history.replaceState(null, "", "?tab=network");
              }}
            >
              <Plug className="h-3.5 w-3.5" />
              Connect account
            </Button>
          </div>
        ) : paths.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No paths found to this org. Add connections or sync your email to surface them.
          </p>
        ) : (
          <>
            {directPaths.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Direct
                </p>
                <div className="space-y-1.5">
                  {directPaths.map((p) => (
                    <PathCard key={p.target_person_id} path={p} personNames={personNames} />
                  ))}
                </div>
              </div>
            )}
            {onehopPaths.length > 0 && (
              <div>
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  One hop
                </p>
                <div className="space-y-1.5">
                  {onehopPaths.map((p) => (
                    <PathCard
                      key={`${p.target_person_id}:${p.via_person_id}`}
                      path={p}
                      personNames={personNames}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
