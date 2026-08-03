import { useEffect, useMemo, useState } from "react";
import {
  Plus, Trash2, ChevronUp, ChevronDown, Eye, EyeOff, Save, RotateCcw,
  Loader2, Layers, GripVertical, PanelsTopLeft,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useOnboardingWorkflow } from "@/hooks/useOnboardingWorkflow";
import { WorkflowStepPreview } from "@/components/onboarding-wizard/WorkflowStepPreview";
import {
  DEFAULT_FOUNDER_WORKFLOW,
  activeSteps,
  newFieldId,
  newStepId,
  type FieldDef,
  type FieldType,
  type OnboardingWorkflowDef,
  type StepDef,
} from "@/config/onboardingWorkflow";

const FIELD_TYPES: FieldType[] = [
  "text", "textarea", "email", "url", "number", "select", "multiselect", "boolean", "date", "social",
];

// ── Dark-admin form primitives ──────────────────────────────────────────────────
const inputCls =
  "w-full rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[13px] text-white/85 outline-none placeholder:text-white/25 focus:border-emerald-500/40";
const labelCls = "block text-[10px] font-medium uppercase tracking-wider text-white/40 mb-1";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function AdminOnboarding() {
  const { definition, loading, saving, error, save } = useOnboardingWorkflow();
  const [draft, setDraft] = useState<OnboardingWorkflowDef>(() => clone(definition));
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(definition), [draft, definition]);

  // Re-sync from remote only while there are no unsaved local edits.
  useEffect(() => {
    if (!dirty) setDraft(clone(definition));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition]);

  useEffect(() => {
    if (!selectedStepId && draft.steps.length > 0) setSelectedStepId(draft.steps[0].id);
  }, [draft.steps, selectedStepId]);

  const selectedStep = draft.steps.find((s) => s.id === selectedStepId) ?? null;

  // ── Draft mutators ──
  const patchDraft = (partial: Partial<OnboardingWorkflowDef>) => setDraft((d) => ({ ...d, ...partial }));

  const patchStep = (id: string, partial: Partial<StepDef>) =>
    setDraft((d) => ({ ...d, steps: d.steps.map((s) => (s.id === id ? { ...s, ...partial } : s)) }));

  const patchField = (stepId: string, fieldId: string, partial: Partial<FieldDef>) =>
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((s) =>
        s.id === stepId
          ? { ...s, fields: s.fields.map((f) => (f.id === fieldId ? { ...f, ...partial } : f)) }
          : s,
      ),
    }));

  const moveStep = (id: string, dir: -1 | 1) =>
    setDraft((d) => {
      const idx = d.steps.findIndex((s) => s.id === id);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= d.steps.length) return d;
      const steps = [...d.steps];
      [steps[idx], steps[to]] = [steps[to], steps[idx]];
      return { ...d, steps };
    });

  const addStep = () => {
    const id = newStepId();
    const step: StepDef = {
      id,
      key: id,
      componentKey: "form",
      enabled: true,
      title: "New step",
      subtitle: "",
      progressLabel: "New step",
      fields: [],
    };
    setDraft((d) => ({ ...d, steps: [...d.steps, step] }));
    setSelectedStepId(id);
  };

  const deleteStep = (id: string) =>
    setDraft((d) => {
      const steps = d.steps.filter((s) => s.id !== id);
      if (selectedStepId === id) setSelectedStepId(steps[0]?.id ?? null);
      return { ...d, steps };
    });

  const addField = (stepId: string) => {
    const field: FieldDef = {
      id: newFieldId(),
      key: `field_${Math.random().toString(36).slice(2, 6)}`,
      label: "New field",
      type: "text",
      required: false,
    };
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((s) => (s.id === stepId ? { ...s, fields: [...s.fields, field] } : s)),
    }));
  };

  const deleteField = (stepId: string, fieldId: string) =>
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((s) =>
        s.id === stepId ? { ...s, fields: s.fields.filter((f) => f.id !== fieldId) } : s,
      ),
    }));

  const moveField = (stepId: string, fieldId: string, dir: -1 | 1) =>
    setDraft((d) => ({
      ...d,
      steps: d.steps.map((s) => {
        if (s.id !== stepId) return s;
        const idx = s.fields.findIndex((f) => f.id === fieldId);
        const to = idx + dir;
        if (idx < 0 || to < 0 || to >= s.fields.length) return s;
        const fields = [...s.fields];
        [fields[idx], fields[to]] = [fields[to], fields[idx]];
        return { ...s, fields };
      }),
    }));

  // ── Left-rail value props ──
  const patchRail = (partial: Partial<OnboardingWorkflowDef["leftRail"]>) =>
    setDraft((d) => ({ ...d, leftRail: { ...d.leftRail, ...partial } }));

  const patchValueProp = (i: number, partial: Partial<{ title: string; copy: string }>) =>
    setDraft((d) => ({
      ...d,
      leftRail: {
        ...d.leftRail,
        valueProps: d.leftRail.valueProps.map((v, idx) => (idx === i ? { ...v, ...partial } : v)),
      },
    }));

  const addValueProp = () =>
    patchRail({ valueProps: [...draft.leftRail.valueProps, { title: "New benefit", copy: "" }] });

  const removeValueProp = (i: number) =>
    patchRail({ valueProps: draft.leftRail.valueProps.filter((_, idx) => idx !== i) });

  // ── Persistence ──
  const handleSave = async () => {
    const res = await save(draft);
    if (res.ok) {
      toast({ title: "Onboarding workflow saved", description: "Live wizard and preview updated." });
      return;
    }
    const message = "error" in res ? res.error : "Unknown error";
    toast({ title: "Couldn't save workflow", description: message, variant: "destructive" });
  };

  const handleResetDefaults = () => {
    setDraft(clone(DEFAULT_FOUNDER_WORKFLOW));
    setSelectedStepId(DEFAULT_FOUNDER_WORKFLOW.steps[0].id);
  };

  const handleDiscard = () => setDraft(clone(definition));

  const previewLabels = activeSteps(draft).map((s) => s.progressLabel);
  const previewActiveIndex = selectedStep
    ? Math.max(0, activeSteps(draft).findIndex((s) => s.id === selectedStep.id))
    : 0;

  if (loading && !definition) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-500" />
      </div>
    );
  }

  return (
    <div className="max-w-[1400px]">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <PanelsTopLeft className="h-4 w-4 text-emerald-500" />
            <h1 className="text-lg font-semibold text-white">Onboarding Workflow</h1>
            {dirty && (
              <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-amber-400">
                Unsaved
              </span>
            )}
          </div>
          <p className="mt-1 text-[13px] text-white/45">
            View and edit the founder onboarding — steps, fields, order, and copy. Changes apply to every user after saving.
          </p>
          {error && <p className="mt-1 text-[12px] text-rose-400">Load error: {error}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-[12px] font-medium text-white/55 transition-colors hover:text-white/80"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset to defaults
          </button>
          {dirty && (
            <button
              type="button"
              onClick={handleDiscard}
              className="rounded-md border border-white/10 px-2.5 py-1.5 text-[12px] font-medium text-white/55 transition-colors hover:text-white/80"
            >
              Discard
            </button>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-40"
            style={{ background: "#2EE6A6", color: "#04120c" }}
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
        {/* ── Builder column ── */}
        <div className="space-y-5">
          {/* Steps list */}
          <section className="rounded-xl border border-white/[0.07] bg-[#0a0a0a] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white/70">
                <Layers className="h-4 w-4" />
                <h2 className="text-[13px] font-semibold">Steps</h2>
                <span className="text-[11px] text-white/35">
                  {activeSteps(draft).length} active · {draft.steps.length} total
                </span>
              </div>
              <button
                type="button"
                onClick={addStep}
                className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] font-medium text-white/60 hover:text-white/85"
              >
                <Plus className="h-3.5 w-3.5" /> Add step
              </button>
            </div>

            <div className="space-y-1.5">
              {draft.steps.map((step, i) => {
                const isSelected = step.id === selectedStepId;
                return (
                  <div
                    key={step.id}
                    className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                      isSelected ? "border-emerald-500/40 bg-emerald-500/[0.06]" : "border-white/[0.06] bg-white/[0.01] hover:border-white/15"
                    }`}
                  >
                    <div className="flex flex-col">
                      <button
                        type="button"
                        onClick={() => moveStep(step.id, -1)}
                        disabled={i === 0}
                        className="text-white/30 hover:text-white/70 disabled:opacity-20"
                        aria-label="Move step up"
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStep(step.id, 1)}
                        disabled={i === draft.steps.length - 1}
                        className="text-white/30 hover:text-white/70 disabled:opacity-20"
                        aria-label="Move step down"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button type="button" onClick={() => setSelectedStepId(step.id)} className="min-w-0 flex-1 text-left">
                      <div className="flex items-center gap-2">
                        <span className={`truncate text-[13px] font-medium ${step.enabled ? "text-white/85" : "text-white/35 line-through"}`}>
                          {i + 1}. {step.title || "Untitled"}
                        </span>
                      </div>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[10px] text-white/35">
                        <span className="rounded bg-white/[0.06] px-1 py-0.5 font-mono uppercase tracking-wider">
                          {step.componentKey === "form" ? "custom" : step.componentKey}
                        </span>
                        {step.fields.length} field{step.fields.length === 1 ? "" : "s"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => patchStep(step.id, { enabled: !step.enabled })}
                      className="text-white/40 hover:text-white/80"
                      aria-label={step.enabled ? "Disable step" : "Enable step"}
                      title={step.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
                    >
                      {step.enabled ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteStep(step.id)}
                      className="text-white/30 hover:text-rose-400"
                      aria-label="Delete step"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Selected step editor */}
          {selectedStep && (
            <section className="rounded-xl border border-white/[0.07] bg-[#0a0a0a] p-4">
              <h2 className="mb-3 text-[13px] font-semibold text-white/70">
                Edit step: <span className="text-white/90">{selectedStep.title || "Untitled"}</span>
              </h2>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Title</label>
                  <input className={inputCls} value={selectedStep.title} onChange={(e) => patchStep(selectedStep.id, { title: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Eyebrow (optional)</label>
                  <input className={inputCls} value={selectedStep.eyebrow ?? ""} onChange={(e) => patchStep(selectedStep.id, { eyebrow: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Progress label</label>
                  <input className={inputCls} value={selectedStep.progressLabel} onChange={(e) => patchStep(selectedStep.id, { progressLabel: e.target.value })} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Subtitle</label>
                  <textarea className={inputCls} rows={2} value={selectedStep.subtitle ?? ""} onChange={(e) => patchStep(selectedStep.id, { subtitle: e.target.value })} />
                </div>
              </div>

              {selectedStep.componentKey !== "form" && (
                <p className="mt-3 rounded-md border border-sky-500/25 bg-sky-500/[0.06] px-3 py-2 text-[11px] leading-relaxed text-sky-200/80">
                  This is a built-in step (<span className="font-mono">{selectedStep.componentKey}</span>) with custom UI —
                  logo search, OAuth connectors, uploads, etc. Its copy, order, and visibility are editable here; its inputs
                  are shown for reference and used in the preview.
                </p>
              )}

              {/* Fields */}
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-[12px] font-semibold text-white/60">Fields</h3>
                  <button
                    type="button"
                    onClick={() => addField(selectedStep.id)}
                    className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] font-medium text-white/60 hover:text-white/85"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add field
                  </button>
                </div>

                <div className="space-y-2.5">
                  {selectedStep.fields.map((field, fi) => (
                    <FieldEditor
                      key={field.id}
                      field={field}
                      isFirst={fi === 0}
                      isLast={fi === selectedStep.fields.length - 1}
                      onChange={(partial) => patchField(selectedStep.id, field.id, partial)}
                      onMove={(dir) => moveField(selectedStep.id, field.id, dir)}
                      onDelete={() => deleteField(selectedStep.id, field.id)}
                    />
                  ))}
                  {selectedStep.fields.length === 0 && (
                    <p className="rounded-md border border-dashed border-white/10 px-3 py-4 text-center text-[12px] text-white/35">
                      No fields yet. Add one above.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Left rail editor */}
          <section className="rounded-xl border border-white/[0.07] bg-[#0a0a0a] p-4">
            <h2 className="mb-3 text-[13px] font-semibold text-white/70">Left marketing rail</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Eyebrow</label>
                <input className={inputCls} value={draft.leftRail.eyebrow} onChange={(e) => patchRail({ eyebrow: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Heading</label>
                <input className={inputCls} value={draft.leftRail.heading} onChange={(e) => patchRail({ heading: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelCls}>Subheading</label>
                <textarea className={inputCls} rows={2} value={draft.leftRail.subheading} onChange={(e) => patchRail({ subheading: e.target.value })} />
              </div>
            </div>

            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[12px] font-semibold text-white/60">Value props</h3>
                <button
                  type="button"
                  onClick={addValueProp}
                  className="inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] font-medium text-white/60 hover:text-white/85"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>
              <div className="space-y-2">
                {draft.leftRail.valueProps.map((vp, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.01] p-2">
                    <GripVertical className="mt-2 h-3.5 w-3.5 shrink-0 text-white/20" />
                    <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                      <input className={inputCls} value={vp.title} placeholder="Title" onChange={(e) => patchValueProp(i, { title: e.target.value })} />
                      <input className={inputCls} value={vp.copy} placeholder="Copy" onChange={(e) => patchValueProp(i, { copy: e.target.value })} />
                    </div>
                    <button type="button" onClick={() => removeValueProp(i)} className="mt-1.5 text-white/30 hover:text-rose-400" aria-label="Remove value prop">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        {/* ── Live preview column ── */}
        <div className="xl:sticky xl:top-4 xl:self-start">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-white/40">
            <Eye className="h-3.5 w-3.5" /> Live preview
          </div>
          {selectedStep ? (
            selectedStep.enabled ? (
              <WorkflowStepPreview step={selectedStep} progressLabels={previewLabels} activeIndex={previewActiveIndex} />
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-[#0a0a0a] p-8 text-center text-[13px] text-white/40">
                This step is disabled and won’t appear in onboarding. Enable it to preview.
              </div>
            )
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-[#0a0a0a] p-8 text-center text-[13px] text-white/40">
              Select a step to preview.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Field editor row ────────────────────────────────────────────────────────
function FieldEditor({
  field,
  isFirst,
  isLast,
  onChange,
  onMove,
  onDelete,
}: {
  field: FieldDef;
  isFirst: boolean;
  isLast: boolean;
  onChange: (partial: Partial<FieldDef>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) {
  const hasOptions = field.type === "select" || field.type === "multiselect";
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.015] p-2.5">
      <div className="flex items-center gap-2">
        <div className="flex flex-col">
          <button type="button" onClick={() => onMove(-1)} disabled={isFirst} className="text-white/30 hover:text-white/70 disabled:opacity-20" aria-label="Move field up">
            <ChevronUp className="h-3 w-3" />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={isLast} className="text-white/30 hover:text-white/70 disabled:opacity-20" aria-label="Move field down">
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
        <input
          className={`${inputCls} flex-1`}
          value={field.label}
          placeholder="Field label"
          onChange={(e) => onChange({ label: e.target.value })}
        />
        <select
          className={`${inputCls} w-32`}
          value={field.type}
          onChange={(e) => onChange({ type: e.target.value as FieldType })}
        >
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t} className="bg-[#0a0a0a]">
              {t}
            </option>
          ))}
        </select>
        <label className="flex shrink-0 items-center gap-1 text-[11px] text-white/50">
          <input type="checkbox" checked={field.required} onChange={(e) => onChange({ required: e.target.checked })} className="accent-emerald-500" />
          req
        </label>
        <button type="button" onClick={onDelete} className="text-white/30 hover:text-rose-400" aria-label="Delete field">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          className={inputCls}
          value={field.key}
          placeholder="key (maps to profile field)"
          onChange={(e) => onChange({ key: e.target.value })}
        />
        <input
          className={inputCls}
          value={field.placeholder ?? ""}
          placeholder="Placeholder"
          onChange={(e) => onChange({ placeholder: e.target.value })}
        />
        <input
          className={`${inputCls} sm:col-span-2`}
          value={field.helpText ?? ""}
          placeholder="Help text (optional)"
          onChange={(e) => onChange({ helpText: e.target.value })}
        />
        {hasOptions && (
          <input
            className={`${inputCls} sm:col-span-2`}
            value={(field.options ?? []).join(", ")}
            placeholder="Options, comma-separated"
            onChange={(e) =>
              onChange({ options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean) })
            }
          />
        )}
      </div>
    </div>
  );
}

export default AdminOnboarding;
