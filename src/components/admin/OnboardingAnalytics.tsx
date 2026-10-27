import { useCallback, useEffect, useState, type ReactNode } from "react";
import { formatDistanceToNow } from "date-fns";
import { Calendar, Check, Eye, Loader2, Mail, TriangleAlert } from "lucide-react";
import { BouncingDots } from "@/components/loading-ui/bouncing-dots";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { formatEdgeFunctionInvokeError } from "@/lib/supabaseFunctionErrors";
import { FilterSelect } from "@/components/admin/FilterSelect";
import { AdminStickyHeader } from "@/components/admin/AdminStickyHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export type OnboardingAnalyticsRange = "1d" | "3d" | "7d" | "30d" | "90d" | "all";
type AnalyticsRange = OnboardingAnalyticsRange;

type StepRow = {
  index: number;
  key: string;
  title: string;
  code: string;
  fieldCount: number;
  reached: number;
  percent: number;
  dropOff: number | null;
  medianMs: number | null;
  highestDropOff: boolean;
};

type PersonaRow = {
  label: string;
  started: number;
  completed: number;
  conversion: number | null;
};

type DraftFields = {
  firstName: unknown;
  lastName: unknown;
  email: unknown;
  userType: unknown;
  title: unknown;
  companyName: unknown;
  websiteUrl: unknown;
  stage: unknown;
  sectors: unknown;
  connectedIntegrations: unknown;
  step: unknown;
};

export type OnboardingStalledRow = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  persona: string;
  status: "incomplete" | "stalled";
  furthestStep: number;
  furthestStepTitle: string;
  furthestStepKey: string;
  fieldsCompleted: number;
  fieldsTotal: number;
  stalledAt: string;
  draft: DraftFields;
};

export type OnboardingAnalyticsPayload = {
  range: AnalyticsRange;
  kpis: {
    started: number;
    completed: number;
    completionRate: number | null;
    completionRateDelta: number | null;
    medianCompleteMs: number | null;
  };
  steps: StepRow[];
  personas: PersonaRow[];
  stalled: OnboardingStalledRow[];
};
type AnalyticsPayload = OnboardingAnalyticsPayload;
type StalledRow = OnboardingStalledRow;

const RANGES: { value: AnalyticsRange; label: string }[] = [
  { value: "1d", label: "1D" },
  { value: "3d", label: "3D" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
  { value: "all", label: "All time" },
];

const cardClass = "rounded-xl border border-neutral-800 bg-neutral-950 p-5";

function isAnalyticsRange(value: string): value is AnalyticsRange {
  return value === "1d" || value === "3d" || value === "7d" || value === "30d" || value === "90d" || value === "all";
}

function formatPercent(value: number | null): string {
  if (value == null) return "—";

  const rounded = Math.round(value * 10) / 10;

  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";

  const sec = Math.round(ms / 1000);

  if (sec < 60) return `${Math.max(1, sec)}s`;

  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;

  if (minutes < 60) return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

function formatDelta(value: number | null): string | null {
  if (value == null) return null;

  const rounded = Math.round(value * 10) / 10;
  const label = `${rounded > 0 ? "+" : ""}${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}pp`;

  return label;
}

function initials(name: string, email: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();

  if (parts[0]) return parts[0].slice(0, 2).toUpperCase();

  return (email[0] || "?").toUpperCase();
}

function stepShort(code: string): string {
  if (code === "PERSONAL-DETAILS") return "Details";

  if (code === "PATH") return "Path";

  if (code === "COMPANY") return "Company";

  if (code === "CONNECTIONS") return "Connections";

  if (code === "MATERIALS") return "Materials";

  return code;
}

function draftValue(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value) && value.length > 0) return value.map(String).join(", ");

  return "—";
}

function MetricCard({
  title,
  value,
  subtext,
  delta,
}: {
  title: string;
  value: string;
  subtext: string;
  delta?: string | null;
}) {
  const up = delta?.startsWith("+") ?? false;

  return (
    <div className={cardClass}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-white/75">{title}</p>
        {delta ? (
          <span className={`font-mono text-[11px] tabular-nums ${up ? "text-emerald-300" : "text-neutral-500"}`}>
            {delta}
          </span>
        ) : null}
      </div>
      <p className="mt-3 font-mono text-2xl font-semibold tabular-nums text-white/90">{value}</p>
      <p className="mt-1 text-xs leading-relaxed text-white/40">{subtext}</p>
    </div>
  );
}

function FunnelStep({ step, started }: { step: StepRow; started: number }) {
  const width = started > 0 ? Math.max(4, step.percent) : 0;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-neutral-500">{step.index}</span>
            <p className="font-sans text-sm font-medium text-neutral-100">{step.title}</p>
            {step.highestDropOff ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-300">
                <TriangleAlert className="h-3 w-3" />
                Highest drop-off
              </span>
            ) : null}
          </div>
          <p className="mt-1 font-mono text-xs text-neutral-500">
            {step.code} · {step.fieldCount} {step.fieldCount === 1 ? "field" : "fields"}
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-sm tabular-nums text-neutral-200">
            {step.reached.toLocaleString()}
            <span className="ml-1.5 text-xs text-neutral-500">{formatPercent(step.percent)}</span>
          </p>
          <p className="mt-1 text-xs text-neutral-500">
            {step.index === 5
              ? "Last step"
              : step.dropOff == null
                ? "—"
                : step.dropOff <= 0
                  ? "0% drop"
                  : `−${formatPercent(step.dropOff)} drop`}
            <span className="mx-1.5 text-neutral-700">·</span>
            {formatDuration(step.medianMs)}
          </p>
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-emerald-500"
          style={{ width: `${Math.min(100, width)}%` }}
        />
      </div>
    </div>
  );
}

function DraftDialog({
  row,
  onClose,
}: {
  row: StalledRow | null;
  onClose: () => void;
}) {
  const fields = [
    ["Name", [row?.draft.firstName, row?.draft.lastName].filter(Boolean).join(" ") || "—"],
    ["Email", draftValue(row?.draft.email)],
    ["Path", draftValue(row?.draft.userType)],
    ["Title", draftValue(row?.draft.title)],
    ["Company", draftValue(row?.draft.companyName)],
    ["Website", draftValue(row?.draft.websiteUrl)],
    ["Stage", draftValue(row?.draft.stage)],
    ["Sectors", draftValue(row?.draft.sectors)],
    ["Connections", draftValue(row?.draft.connectedIntegrations)],
  ] as const;

  return (
    <Dialog open={row != null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="border-neutral-800 bg-neutral-950 text-neutral-100 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-sans text-base">Draft responses</DialogTitle>
        </DialogHeader>
        {row ? (
          <div className="space-y-3">
            <p className="text-xs text-neutral-500">
              Step {row.furthestStep}: {row.furthestStepTitle} · {row.fieldsCompleted}/{row.fieldsTotal} fields
            </p>
            <div className="divide-y divide-neutral-800 rounded-lg border border-neutral-800">
              {fields.map(([label, value]) => (
                <div key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2.5">
                  <span className="text-xs text-neutral-500">{label}</span>
                  <span className="truncate text-sm text-neutral-200">{value}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function OnboardingAnalytics({
  tabs,
  loadPayload,
}: {
  tabs: ReactNode;
  loadPayload?: (range: AnalyticsRange) => AnalyticsPayload | Promise<AnalyticsPayload>;
}) {
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const [payload, setPayload] = useState<AnalyticsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draft, setDraft] = useState<StalledRow | null>(null);

  const load = useCallback(async (nextRange: AnalyticsRange) => {
    setLoading(true);
    setError(null);

    if (loadPayload) {
      setPayload(await loadPayload(nextRange));
      setLoading(false);
      return;
    }

    const { data, error: invokeError } = await invokeEdgeFunction("admin-onboarding-analytics", {
      preferClerkSessionToken: true,
      body: { range: nextRange },
    });

    if (invokeError) {
      setError(await formatEdgeFunctionInvokeError(invokeError));
      setLoading(false);

      return;
    }

    const body = data as AnalyticsPayload & { error?: string };

    if (body?.error) {
      setError(body.error);
      setLoading(false);

      return;
    }

    setPayload(body);
    setLoading(false);
  }, [loadPayload]);

  useEffect(() => {
    void load(range);
  }, [load, range]);

  const runAction = async (action: "nudge" | "force_approve", row: StalledRow) => {
    if (action === "force_approve") {
      const confirmed = window.confirm(`Activate ${row.name === "Profile incomplete" ? row.email : row.name} and skip remaining fields?`);

      if (!confirmed) return;
    }

    setBusyId(`${action}:${row.id}`);

    if (loadPayload) {
      if (action === "force_approve") {
        setPayload((current) => current
          ? { ...current, stalled: current.stalled.filter((item) => item.id !== row.id) }
          : current);
      }
      toast.success(action === "nudge" ? "Nudge sent" : "Account activated");
      setBusyId(null);
      return;
    }

    const { data, error: invokeError } = await invokeEdgeFunction("admin-onboarding-analytics", {
      preferClerkSessionToken: true,
      body: { action, userId: row.id, range },
    });

    if (invokeError) {
      toast.error(action === "nudge" ? "Could not send nudge" : "Could not approve", {
        description: await formatEdgeFunctionInvokeError(invokeError),
      });
      setBusyId(null);

      return;
    }

    const body = data as { error?: string };

    if (body?.error) {
      toast.error(body.error);
      setBusyId(null);

      return;
    }

    toast.success(action === "nudge" ? "Nudge sent" : "Account activated");
    setBusyId(null);
    void load(range);
  };

  return (
    <div className="space-y-4">
      <AdminStickyHeader className="flex flex-col gap-4">
        <h1 className="font-sans text-lg font-semibold text-neutral-100">Onboarding</h1>
        <div className="flex flex-wrap items-center gap-2">
          {tabs}
          <FilterSelect
            label="Range"
            icon={Calendar}
            value={range}
            options={RANGES}
            onValueChange={(value) => {
              if (isAnalyticsRange(value)) setRange(value);
            }}
            className="h-8"
          />
        </div>
      </AdminStickyHeader>

      {error ? (
        <div className="rounded-xl border border-red-500/25 bg-red-500/10 p-5">
          <p className="text-sm text-red-300">{error}</p>
          <button
            type="button"
            onClick={() => void load(range)}
            className="mt-3 text-xs text-white/60 underline-offset-2 hover:underline"
          >
            Try again
          </button>
        </div>
      ) : null}

      {loading && !payload ? (
        <div className="flex items-center justify-center py-24">
          <BouncingDots />
        </div>
      ) : null}

      {payload ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              title="Started"
              value={payload.kpis.started.toLocaleString()}
              subtext="Began Step 1 in this range"
            />
            <MetricCard
              title="Completed"
              value={payload.kpis.completed.toLocaleString()}
              subtext="Finished Step 5 in this range"
            />
            <MetricCard
              title="Completion rate"
              value={formatPercent(payload.kpis.completionRate)}
              subtext="Completed / started in this range"
              delta={formatDelta(payload.kpis.completionRateDelta)}
            />
            <MetricCard
              title="Avg time to complete"
              value={formatDuration(payload.kpis.medianCompleteMs)}
              subtext="Median across completions in this range"
            />
          </div>

          <div className={`${cardClass} space-y-5`}>
            <div>
              <h2 className="text-sm font-semibold text-white/80">Step funnel</h2>
              <p className="mt-1 text-xs text-white/35">
                {payload.kpis.started.toLocaleString()} started in this range
              </p>
            </div>
            {payload.steps.map((step) => (
              <FunnelStep key={step.key} step={step} started={payload.kpis.started} />
            ))}
          </div>

          <div className={cardClass}>
            <h2 className="text-sm font-semibold text-white/80">Path</h2>
            <p className="mt-1 text-xs text-white/35">Conversion after Welcome to Vekta</p>
            {payload.personas.length === 0 ? (
              <p className="mt-4 text-xs text-white/35">No path selections in this range</p>
            ) : (
              <div className="mt-4 space-y-3">
                {payload.personas.map((row) => {
                  const max = Math.max(1, ...payload.personas.map((item) => item.started));

                  return (
                    <div key={row.label}>
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="truncate text-xs text-white/70">{row.label}</span>
                        <span className="font-mono text-xs tabular-nums text-white/45">
                          {formatPercent(row.conversion)} · {row.completed}/{row.started}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                        <div
                          className="h-full rounded-full bg-emerald-500"
                          style={{ width: `${Math.max(4, (row.started / max) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-xl border border-neutral-800 bg-neutral-950">
            <div className="border-b border-neutral-800 px-5 py-4">
              <h2 className="text-sm font-semibold text-white/80">Stalled applications</h2>
              <p className="mt-1 text-xs text-white/35">Incomplete and stalled profiles across all time</p>
            </div>
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="border-b border-neutral-800">
                  <th className="px-5 py-2.5 font-sans text-xs font-medium text-neutral-500">Applicant</th>
                  <th className="px-3 py-2.5 font-sans text-xs font-medium text-neutral-500">Path</th>
                  <th className="px-3 py-2.5 font-sans text-xs font-medium text-neutral-500">Furthest step</th>
                  <th className="px-3 py-2.5 font-sans text-xs font-medium text-neutral-500">Time stalled</th>
                  <th className="px-5 py-2.5 text-right font-sans text-xs font-medium text-neutral-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {payload.stalled.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center text-sm text-neutral-500">
                      No incomplete profiles
                    </td>
                  </tr>
                ) : (
                  payload.stalled.map((row) => (
                    <tr key={row.id} className="border-b border-neutral-800/70 last:border-0">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2.5">
                          {row.avatarUrl ? (
                            <img src={row.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" />
                          ) : (
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 font-sans text-[11px] font-semibold text-neutral-300">
                              {initials(row.name, row.email)}
                            </span>
                          )}
                          <div className="min-w-0">
                            <p className={`truncate text-sm ${row.name === "Profile incomplete" ? "italic text-neutral-500" : "text-neutral-100"}`}>
                              {row.name}
                            </p>
                            <p className="truncate text-xs text-neutral-500">{row.email || "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-neutral-300">{row.persona}</td>
                      <td className="px-3 py-3">
                        <p className="text-sm text-neutral-200">Step {row.furthestStep}: {stepShort(row.furthestStepKey)}</p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {row.fieldsCompleted}/{row.fieldsTotal} fields completed
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <p className="text-sm text-neutral-300">
                          {row.status === "stalled" ? "Stalled" : "Active"}{" "}
                          {formatDistanceToNow(new Date(row.stalledAt), { addSuffix: true }).replace(/^about /, "")}
                        </p>
                      </td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busyId != null}
                            onClick={() => void runAction("nudge", row)}
                            className="h-8 rounded-md border-neutral-800 bg-transparent px-2.5 font-sans text-xs text-neutral-200 hover:bg-white/5"
                          >
                            {busyId === `nudge:${row.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />}
                            Send nudge
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDraft(row)}
                            className="h-8 rounded-md border-neutral-800 bg-transparent px-2.5 font-sans text-xs text-neutral-200 hover:bg-white/5"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View draft
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busyId != null}
                            onClick={() => void runAction("force_approve", row)}
                            className="h-8 rounded-md border-neutral-800 bg-transparent px-2.5 font-sans text-xs text-neutral-200 hover:bg-white/5"
                          >
                            {busyId === `force_approve:${row.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            Force approve
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <DraftDialog row={draft} onClose={() => setDraft(null)} />
    </div>
  );
}
