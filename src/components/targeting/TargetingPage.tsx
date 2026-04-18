import { useState, useCallback, useLayoutEffect, useRef } from "react";
import { RefreshCw, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useActiveContext } from "@/context/ActiveContext";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { isOwnerContextUuid } from "@/lib/connectorContextStorage";
import { RECS_QUERY_KEY } from "@/hooks/useRecommendations";
import { TARGETS_QUERY_KEY } from "@/hooks/useInvestorTargets";
import { InvestorTargetingPanel } from "./InvestorTargetingPanel";
import { RecommendationsPanel } from "./RecommendationsPanel";
import { PathPreviewPanel } from "./PathPreviewPanel";

// ---------------------------------------------------------------------------
// TargetingPage
// ---------------------------------------------------------------------------
// Minimal two-column layout:
//   Left  — Investor targets list + path preview for selected org
//   Right — Open recommendations split by kind
//
// No redesign. No new routing. Fits inside the existing Index.tsx view shell.
// ---------------------------------------------------------------------------

export function TargetingPage() {
  const { activeContextId } = useActiveContext();
  const qc = useQueryClient();
  const [selectedOrg, setSelectedOrg] = useState<{ id: string; name: string | null } | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const refreshInFlight = useRef(false);

  useLayoutEffect(() => {
    setSelectedOrg(null);
    setRefreshError(null);
  }, [activeContextId]);

  const handleSelectOrg = (orgId: string | null, orgName: string | null) => {
    setSelectedOrg(orgId ? { id: orgId, name: orgName } : null);
  };

  const handleRefresh = useCallback(async () => {
    const oc = activeContextId?.trim() ?? "";
    if (!isOwnerContextUuid(oc) || refreshInFlight.current) return;
    refreshInFlight.current = true;
    setIsRefreshing(true);
    setRefreshError(null);
    try {
      const { error } = await invokeEdgeFunction("backfill-phase4-recommendations", {
        body: { ownerContextId: oc },
      });
      if (error) throw new Error(typeof error === "object" && "message" in error ? (error as Error).message : String(error));
      await Promise.all([
        qc.invalidateQueries({ queryKey: [RECS_QUERY_KEY, oc] }),
        qc.invalidateQueries({ queryKey: [TARGETS_QUERY_KEY, oc] }),
        qc.invalidateQueries({ queryKey: ["paths_to_org", oc] }),
      ]);
    } catch (err) {
      setRefreshError((err as Error).message ?? "Refresh failed.");
    } finally {
      refreshInFlight.current = false;
      setIsRefreshing(false);
    }
  }, [activeContextId, qc]);

  return (
    <div className="space-y-0">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Investor Targeting
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Track targets, surface connection paths, and act on recommendations.
          </p>
        </div>
        {isOwnerContextUuid(activeContextId?.trim() ?? "") && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={handleRefresh}
            disabled={isRefreshing}
            title="Refresh recommendations"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", isRefreshing && "animate-spin")} />
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </Button>
        )}
      </div>

      {refreshError && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          {refreshError}
        </div>
      )}

      {/* Two-column layout: targets+paths left, recommendations right */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2" key={activeContextId ?? "none"}>
        {/* Left column */}
        <div className="space-y-4">
          <InvestorTargetingPanel
            ownerContextId={activeContextId}
            selectedOrgId={selectedOrg?.id ?? null}
            onSelectOrg={handleSelectOrg}
          />

          {selectedOrg && (
            <PathPreviewPanel
              key={`${activeContextId ?? ""}:${selectedOrg.id}`}
              ownerContextId={activeContextId}
              orgId={selectedOrg.id}
              orgName={selectedOrg.name}
            />
          )}
        </div>

        {/* Right column */}
        <RecommendationsPanel ownerContextId={activeContextId} />
      </div>
    </div>
  );
}
