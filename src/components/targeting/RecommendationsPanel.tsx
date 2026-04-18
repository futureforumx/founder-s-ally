import { CheckCheck, BellOff, ArrowRight, Inbox, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  useRecommendations,
  useRecommendationAction,
  type RecommendationRow,
} from "@/hooks/useRecommendations";
import { isOwnerContextUuid } from "@/lib/connectorContextStorage";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scoreColor(score: number): string {
  if (score >= 70) return "text-emerald-400";
  if (score >= 40) return "text-amber-400";
  return "text-muted-foreground";
}

function formatScore(score: number): string {
  return score.toFixed(0);
}

// ---------------------------------------------------------------------------
// RecCard
// ---------------------------------------------------------------------------

function RecCard({
  rec,
  onDismiss,
  onSnooze,
  onActed,
  isPending,
}: {
  rec: RecommendationRow;
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  onActed: (id: string) => void;
  isPending: boolean;
}) {
  const title = rec.org_name ?? rec.subject_organization_id?.slice(0, 8) ?? "Unknown org";

  return (
    <div className="group rounded-lg border border-border/50 bg-card px-3 py-2.5 transition-colors hover:border-border/80 hover:bg-accent/30">
      <div className="flex items-start gap-3">
        {/* Score bubble */}
        <div
          className={cn(
            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted/60 text-xs font-semibold tabular-nums",
            scoreColor(rec.score),
          )}
        >
          {formatScore(rec.score)}
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-sm font-medium leading-snug text-foreground">{title}</p>
          {rec.kind === "ask_intro" && rec.via_person_name && (
            <p className="truncate text-xs text-muted-foreground">
              via{" "}
              <span className="font-medium text-foreground/80">{rec.via_person_name}</span>
            </p>
          )}
          {rec.kind === "reach_out" && (
            <p className="text-xs text-muted-foreground">Direct outreach</p>
          )}
        </div>

        {/* Actions — visible on hover */}
        <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            title="Mark acted"
            disabled={isPending}
            onClick={() => onActed(rec.id)}
          >
            <CheckCheck className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            title="Snooze 7 days"
            disabled={isPending}
            onClick={() => onSnooze(rec.id)}
          >
            <BellOff className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-muted-foreground hover:text-red-400"
            title="Dismiss"
            disabled={isPending}
            onClick={() => onDismiss(rec.id)}
          >
            <ArrowRight className="h-3.5 w-3.5 rotate-45" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecSection
// ---------------------------------------------------------------------------

function RecSection({
  label,
  recs,
  onDismiss,
  onSnooze,
  onActed,
  isPending,
}: {
  label: string;
  recs: RecommendationRow[];
  onDismiss: (id: string) => void;
  onSnooze: (id: string) => void;
  onActed: (id: string) => void;
  isPending: boolean;
}) {
  if (recs.length === 0) return null;

  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="space-y-1.5">
        {recs.map((rec) => (
          <RecCard
            key={rec.id}
            rec={rec}
            onDismiss={onDismiss}
            onSnooze={onSnooze}
            onActed={onActed}
            isPending={isPending}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// RecommendationsPanel
// ---------------------------------------------------------------------------

export function RecommendationsPanel({
  ownerContextId,
}: {
  ownerContextId: string | null | undefined;
}) {
  const { data: recs = [], isLoading, isError, error } = useRecommendations(ownerContextId);
  const { mutate: act, isPending } = useRecommendationAction(ownerContextId);

  const notConfigured = !isOwnerContextUuid(ownerContextId?.trim() ?? "");

  const askIntroRecs = recs.filter((r) => r.kind === "ask_intro");
  const reachOutRecs = recs.filter((r) => r.kind === "reach_out");

  const handleDismiss = (id: string) => act({ recId: id, action: "dismissed" });
  const handleSnooze = (id: string) => act({ recId: id, action: "snoozed" });
  const handleActed = (id: string) => act({ recId: id, action: "acted" });

  return (
    <Card className="border-border/60 bg-card/70">
      <CardHeader className="pb-3 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-foreground">Recommendations</CardTitle>
          {recs.length > 0 && (
            <Badge
              variant="outline"
              className="border-border/60 text-[10px] text-muted-foreground"
            >
              {recs.length} open
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pb-4 pt-0">
        {notConfigured ? (
          <p className="text-xs text-muted-foreground">
            Select a workspace context to view recommendations.
          </p>
        ) : isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
            <Skeleton className="h-12 w-full rounded-lg" />
          </div>
        ) : isError ? (
          <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>
              {(error as Error)?.message ?? "Failed to load recommendations."}
            </span>
          </div>
        ) : recs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">
              No open recommendations. Add investor targets and run a backfill to generate them.
            </p>
          </div>
        ) : (
          <>
            <RecSection
              label="Ask intro"
              recs={askIntroRecs}
              onDismiss={handleDismiss}
              onSnooze={handleSnooze}
              onActed={handleActed}
              isPending={isPending}
            />
            <RecSection
              label="Reach out"
              recs={reachOutRecs}
              onDismiss={handleDismiss}
              onSnooze={handleSnooze}
              onActed={handleActed}
              isPending={isPending}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
}
