import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Check, Clock3, Mail, Network, Upload, Users } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useActiveContext } from "@/context/ActiveContext";
import {
  INTRO_OUTCOMES,
  INTRO_ROUTES,
  useAddInvestorTarget,
  useOrgSearch,
  useInvestorTargets,
  useUpdateInvestorIntro,
  type InvestorIntroOutcome,
  type InvestorIntroRoute,
} from "@/hooks/useInvestorTargets";
import { usePathsToOrg } from "@/hooks/usePathsToOrg";
import { CONNECTOR_MANAGE_DENIED_MESSAGE } from "@/lib/connectorPermissions";
import {
  invalidateConnectorSurfaceQueries,
  startGoogleOAuthRedirect,
  uploadLinkedinCsv,
} from "@/lib/connectorClient";
import { isOwnerContextUuid } from "@/lib/connectorContextStorage";
import { safeLower } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface IntroPathfinderProps {
  investorName: string;
}

export function IntroPathfinder({ investorName }: IntroPathfinderProps) {
  const { activeContextId, canManageConnectorIntegrations } = useActiveContext();
  const { getAccessToken: getToken } = useAuth();
  const queryClient = useQueryClient();
  const csvInputRef = useRef<HTMLInputElement>(null);
  const { data: orgCandidates = [], isLoading: orgsLoading } = useOrgSearch(investorName);
  const organization = useMemo(() => {
    const exactName = safeLower(investorName);
    return orgCandidates.find((org) => safeLower(org.name) === exactName) ?? null;
  }, [investorName, orgCandidates]);
  const { data: targets = [] } = useInvestorTargets(activeContextId);
  const target = organization
    ? targets.find((item) => item.organization_id === organization.id) ?? null
    : null;
  const { data: graph, isLoading: pathsLoading, isError: pathsError } = usePathsToOrg(
    activeContextId,
    organization?.id,
  );
  const addTarget = useAddInvestorTarget();
  const updateIntro = useUpdateInvestorIntro();
  const [selectedRoute, setSelectedRoute] = useState<InvestorIntroRoute>("thesis_content");
  const [selectedOutcome, setSelectedOutcome] = useState<InvestorIntroOutcome | "none">("none");

  const directPath = graph?.paths.find((path) => path.path_type === "direct") ?? null;
  const oneHopPath = graph?.paths.find((path) => path.path_type === "one_hop") ?? null;
  const suggestedRoute: InvestorIntroRoute = directPath
    ? "direct_outreach"
    : oneHopPath
      ? "ask_intro"
      : "thesis_content";

  useEffect(() => {
    setSelectedRoute((target?.intro_route as InvestorIntroRoute | null) ?? suggestedRoute);
    setSelectedOutcome((target?.intro_outcome as InvestorIntroOutcome | null) ?? "none");
  }, [suggestedRoute, target?.intro_route, target?.intro_outcome]);

  const canTrack = isOwnerContextUuid(activeContextId?.trim() ?? "");
  const activePath = directPath ?? oneHopPath;
  const routeContactId = activePath?.path_type === "one_hop"
    ? activePath.via_person_id
    : activePath?.target_person_id;
  const routeContactName = routeContactId ? graph?.personNames.get(routeContactId) : null;

  const ensureTarget = async () => {
    if (target) return target.id;
    if (!organization || !canTrack || !activeContextId) {
      throw new Error("Link this investor to an organization and select a workspace to track the approach.");
    }
    return addTarget.mutateAsync({
      ownerContextId: activeContextId,
      organizationId: organization.id,
      pipelineStage: "researching",
    });
  };

  const saveTracking = async (route: InvestorIntroRoute, outcome: InvestorIntroOutcome | null) => {
    const targetId = await ensureTarget();
    if (!activeContextId) throw new Error("Select a workspace context to track this approach.");
    await updateIntro.mutateAsync({
      ownerContextId: activeContextId,
      targetId,
      route,
      outcome,
    });
  };

  const onRouteChange = async (value: string) => {
    const route = value as InvestorIntroRoute;
    setSelectedRoute(route);
    if (!canTrack) return;
    try {
      await saveTracking(route, selectedOutcome === "none" ? null : selectedOutcome);
      toast.success("Approach saved to Investor Targets");
    } catch (error) {
      toast.error("Could not save approach", { description: error instanceof Error ? error.message : undefined });
    }
  };

  const onOutcomeChange = async (value: string) => {
    const outcome = value === "none" ? null : value as InvestorIntroOutcome;
    setSelectedOutcome(outcome ?? "none");
    if (!canTrack) return;
    try {
      await saveTracking(selectedRoute, outcome);
      toast.success("Outcome saved to Investor Targets");
    } catch (error) {
      toast.error("Could not save outcome", { description: error instanceof Error ? error.message : undefined });
    }
  };

  const onGmailSyncClick = async () => {
    if (!canManageConnectorIntegrations) {
      toast.error(CONNECTOR_MANAGE_DENIED_MESSAGE);
      return;
    }
    const result = await startGoogleOAuthRedirect({
      connector: "gmail",
      ownerContextId: activeContextId,
      getToken,
    });
    if (!result.ok) {
      toast.error("Gmail connect", { description: result.message });
      return;
    }
    toast.message("Redirecting to Google", { description: "Complete sign-in to link Gmail for this context." });
  };

  const onCsvChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!canManageConnectorIntegrations) {
      toast.error(CONNECTOR_MANAGE_DENIED_MESSAGE);
      return;
    }
    const result = await uploadLinkedinCsv({ ownerContextId: activeContextId, file, getToken });
    if (!result.ok) {
      toast.error("LinkedIn CSV upload", { description: result.message });
      return;
    }
    invalidateConnectorSurfaceQueries(queryClient, activeContextId);
    toast.success("LinkedIn CSV uploaded", {
      description: `${file.name} — about ${result.approxDataRows} data rows recorded for this context.`,
    });
  };

  const routeExplanation = directPath
    ? `Your network graph shows a direct path to ${routeContactName ?? "a person at this firm"}.`
    : oneHopPath
      ? `Your network graph shows a one-person path through ${routeContactName ?? "a shared contact"}.`
      : organization
        ? "No direct or one-person relationship is in the connected network yet. Build familiarity around the firm's stated thesis before asking for an introduction."
        : "This firm is not linked to the organization directory, so VEKTA cannot verify a network path yet.";

  const pathAge = activePath?.last_interaction_at
    ? formatDistanceToNow(new Date(activePath.last_interaction_at), { addSuffix: true })
    : null;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <input ref={csvInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onCsvChange} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold text-foreground">A credible path to {investorName}</h3>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{routeExplanation}</p>
        </div>
        <span className="shrink-0 rounded-full border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground">
          {directPath ? "Direct connection" : oneHopPath ? "1-person path" : "No verified path"}
        </span>
      </div>

      {(orgsLoading || pathsLoading) ? (
        <p className="text-xs text-muted-foreground">Checking the connected network…</p>
      ) : pathsError ? (
        <p className="text-xs text-destructive">Could not load the relationship graph. Connect or refresh your network data and try again.</p>
      ) : activePath ? (
        <div className="flex items-center gap-3 rounded-xl border border-primary/15 bg-primary/[0.04] p-3">
          <Users className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {directPath
                ? `You ↔ ${graph?.personNames.get(directPath.target_person_id) ?? "Investor contact"}`
                : `You → ${routeContactName ?? "Shared contact"} → ${graph?.personNames.get(oneHopPath!.target_person_id) ?? "Investor contact"}`}
            </p>
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
              {pathAge && <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" />Last interaction {pathAge}</span>}
              <span>Graph strength {Math.round(Number(activePath.path_score))}/100</span>
            </div>
          </div>
          {directPath && <Check className="h-4 w-4 shrink-0 text-emerald-500" />}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recommended approach{target?.intro_route ? " · saved" : ""}
          </span>
          <Select value={selectedRoute} onValueChange={onRouteChange} disabled={!canTrack || updateIntro.isPending || addTarget.isPending}>
            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {INTRO_ROUTES.map((route) => (
                <SelectItem key={route.value} value={route.value} className="text-xs">
                  {route.label}{route.value === suggestedRoute ? " · suggested" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Latest outcome</span>
          <Select value={selectedOutcome} onValueChange={onOutcomeChange} disabled={!canTrack || updateIntro.isPending || addTarget.isPending}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Not contacted yet" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-xs">Not contacted yet</SelectItem>
              {INTRO_OUTCOMES.map((outcome) => (
                <SelectItem key={outcome.value} value={outcome.value} className="text-xs">{outcome.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      {!canTrack && (
        <p className="text-[11px] text-muted-foreground">Select a workspace context to save an approach and track its outcome.</p>
      )}
      {canTrack && !organization && !orgsLoading && (
        <p className="text-[11px] text-muted-foreground">The investor is not linked to the organization directory yet, so approach tracking is unavailable from this profile.</p>
      )}
      {canTrack && organization && !target && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs"
          disabled={addTarget.isPending}
          onClick={async () => {
            try {
              await saveTracking(selectedRoute, selectedOutcome === "none" ? null : selectedOutcome);
              toast.success("Investor added to Investor Targets");
            } catch (error) {
              toast.error("Could not track this investor", { description: error instanceof Error ? error.message : undefined });
            }
          }}
        >
          <ArrowRight className="h-3 w-3" /> Track in Investor Targets
        </Button>
      )}

      <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
        <span className="mr-auto text-[10px] text-muted-foreground">Improve path coverage with your network data.</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 px-2 text-[10px]"
          disabled={!canManageConnectorIntegrations}
          title={!canManageConnectorIntegrations ? CONNECTOR_MANAGE_DENIED_MESSAGE : undefined}
          onClick={onGmailSyncClick}
        ><Mail className="h-3 w-3" /> Sync Gmail</Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 px-2 text-[10px]"
          disabled={!canManageConnectorIntegrations}
          title={!canManageConnectorIntegrations ? CONNECTOR_MANAGE_DENIED_MESSAGE : undefined}
          onClick={() => csvInputRef.current?.click()}
        ><Upload className="h-3 w-3" /> Upload LinkedIn CSV</Button>
      </div>
    </section>
  );
}
