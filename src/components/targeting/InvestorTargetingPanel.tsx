import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { Plus, Building2, ChevronDown, X, Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  useInvestorTargets,
  useAddInvestorTarget,
  useUpdateTargetStage,
  useOrgSearch,
  PIPELINE_STAGES,
  type InvestorTarget,
  type PipelineStage,
} from "@/hooks/useInvestorTargets";
import { isOwnerContextUuid } from "@/lib/connectorContextStorage";

// ---------------------------------------------------------------------------
// Pipeline stage badge colours
// ---------------------------------------------------------------------------

const stageStyle: Record<PipelineStage, string> = {
  researching: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  reaching_out: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  met: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  passed: "border-border/60 bg-muted/40 text-muted-foreground",
  committed: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
};

// ---------------------------------------------------------------------------
// OrgCombobox  — minimal inline search + select
// ---------------------------------------------------------------------------

function OrgCombobox({
  value,
  onChange,
}: {
  value: { id: string; name: string } | null;
  onChange: (org: { id: string; name: string } | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const { data: results = [], isFetching } = useOrgSearch(query);

  const handleSelect = (org: { id: string; name: string }) => {
    onChange(org);
    setQuery("");
    setOpen(false);
  };

  const handleClear = () => {
    onChange(null);
    setQuery("");
  };

  return (
    <div ref={wrapRef} className="relative">
      {value ? (
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-1.5 text-sm">
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate text-foreground">{value.name}</span>
          <button
            type="button"
            onClick={handleClear}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Input
            placeholder="Search organizations…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="h-8 pl-3 text-sm"
          />
          {isFetching && (
            <Loader2 className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
      )}

      {open && !value && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border border-border/80 bg-popover shadow-md">
          {results.map((org) => (
            <button
              key={org.id}
              type="button"
              onClick={() => handleSelect(org)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/50"
            >
              <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate text-foreground">{org.name}</span>
              {org.domain && (
                <span className="shrink-0 text-[10px] text-muted-foreground">{org.domain}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddTargetForm
// ---------------------------------------------------------------------------

function AddTargetForm({
  ownerContextId,
  onDone,
}: {
  ownerContextId: string;
  onDone: () => void;
}) {
  const [selectedOrg, setSelectedOrg] = useState<{ id: string; name: string } | null>(null);
  const [stage, setStage] = useState<PipelineStage>("researching");

  const { mutate: addTarget, isPending, error } = useAddInvestorTarget();

  const handleSubmit = () => {
    if (!selectedOrg) return;
    addTarget(
      { ownerContextId, organizationId: selectedOrg.id, pipelineStage: stage },
      { onSuccess: onDone },
    );
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-3">
      <OrgCombobox value={selectedOrg} onChange={setSelectedOrg} />

      <Select value={stage} onValueChange={(v) => setStage(v as PipelineStage)}>
        <SelectTrigger className="h-8 text-sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PIPELINE_STAGES.map((s) => (
            <SelectItem key={s.value} value={s.value} className="text-sm">
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {error && (
        <p className="text-[11px] text-destructive">
          {(error as Error).message.includes("23505")
            ? "This org is already in your targets."
            : (error as Error).message}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          onClick={onDone}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs"
          onClick={handleSubmit}
          disabled={!selectedOrg || isPending}
        >
          {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Add target"}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TargetRow
// ---------------------------------------------------------------------------

function TargetRow({
  target,
  selected,
  onSelect,
}: {
  target: InvestorTarget;
  selected: boolean;
  onSelect: (t: InvestorTarget) => void;
}) {
  const { mutate: updateStage } = useUpdateTargetStage();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(target)}
      onKeyDown={(e) => e.key === "Enter" && onSelect(target)}
      className={cn(
        "group flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors",
        selected
          ? "border-border bg-accent/40"
          : "border-border/40 bg-card/50 hover:border-border/70 hover:bg-accent/20",
      )}
    >
      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />

      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="truncate text-sm font-medium text-foreground">
          {target.org_name ?? target.organization_id.slice(0, 8)}
        </p>
        {target.org_domain && (
          <p className="truncate text-[10px] text-muted-foreground">{target.org_domain}</p>
        )}
      </div>

      {/* Stage badge — click to cycle */}
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="button"
        tabIndex={0}
      >
        <Select
          value={target.pipeline_stage ?? "researching"}
          onValueChange={(v) => updateStage({ id: target.id, stage: v as PipelineStage })}
        >
          <SelectTrigger
            className={cn(
              "h-6 gap-1 border px-2 py-0 text-[10px] font-medium",
              target.pipeline_stage ? stageStyle[target.pipeline_stage] : stageStyle["researching"],
            )}
          >
            <SelectValue />
            <ChevronDown className="h-3 w-3 opacity-60" />
          </SelectTrigger>
          <SelectContent>
            {PIPELINE_STAGES.map((s) => (
              <SelectItem key={s.value} value={s.value} className="text-xs">
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InvestorTargetingPanel
// ---------------------------------------------------------------------------

interface InvestorTargetingPanelProps {
  ownerContextId: string | null | undefined;
  selectedOrgId: string | null;
  onSelectOrg: (orgId: string | null, orgName: string | null) => void;
}

export function InvestorTargetingPanel({
  ownerContextId,
  selectedOrgId,
  onSelectOrg,
}: InvestorTargetingPanelProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const { data: targets = [], isLoading, isError, error } = useInvestorTargets(ownerContextId);

  useLayoutEffect(() => {
    setShowAddForm(false);
  }, [ownerContextId]);

  const notConfigured = !isOwnerContextUuid(ownerContextId?.trim() ?? "");

  const handleSelectTarget = (t: InvestorTarget) => {
    // Toggle — clicking the selected row deselects it
    if (selectedOrgId === t.organization_id) {
      onSelectOrg(null, null);
    } else {
      onSelectOrg(t.organization_id, t.org_name);
    }
  };

  return (
    <Card className="border-border/60 bg-card/70">
      <CardHeader className="pb-3 pt-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-foreground">Investor Targets</CardTitle>
          {!notConfigured && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1 text-[10px] text-muted-foreground hover:text-foreground"
              onClick={() => setShowAddForm((v) => !v)}
            >
              <Plus className="h-3 w-3" />
              Add
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-2 pb-4 pt-0">
        {notConfigured ? (
          <p className="text-xs text-muted-foreground">
            Select a workspace context to manage investor targets.
          </p>
        ) : (
          <>
            {showAddForm && (
              <AddTargetForm
                ownerContextId={ownerContextId!}
                onDone={() => setShowAddForm(false)}
              />
            )}

            {isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-12 w-full rounded-lg" />
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            ) : isError ? (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-xs text-destructive">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{(error as Error)?.message ?? "Failed to load targets."}</span>
              </div>
            ) : targets.length === 0 ? (
              <p className="py-4 text-center text-xs text-muted-foreground">
                No investor targets yet. Click Add to track an organization.
              </p>
            ) : (
              <div className="space-y-1.5">
                {targets.map((t) => (
                  <TargetRow
                    key={t.id}
                    target={t}
                    selected={selectedOrgId === t.organization_id}
                    onSelect={handleSelectTarget}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
