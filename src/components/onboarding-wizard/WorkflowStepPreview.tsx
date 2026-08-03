import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import type { FieldDef, StepDef } from "@/config/onboardingWorkflow";

interface WorkflowStepPreviewProps {
  step: StepDef;
  /** Progress labels for the mini stepper shown above the card. */
  progressLabels: string[];
  activeIndex: number;
  className?: string;
}

/**
 * Renders a workflow step from its schema in the app's wizard surface. Used by the
 * admin live preview so edits are visible immediately. Interactions are local-only.
 */
export function WorkflowStepPreview({ step, progressLabels, activeIndex, className }: WorkflowStepPreviewProps) {
  const [values, setValues] = useState<Record<string, unknown>>({});

  const setValue = (key: string, value: unknown) => setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <div className={cn("rounded-2xl border border-border/70 bg-card/85 p-5 shadow-lg sm:p-7", className)}>
      {/* Mini progress bar */}
      <div className="mb-6 flex items-center gap-2">
        {progressLabels.map((label, i) => (
          <div key={`${label}-${i}`} className="flex flex-1 items-center gap-2 last:flex-none">
            <div
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold",
                i === activeIndex
                  ? "border-primary bg-primary text-primary-foreground"
                  : i < activeIndex
                    ? "border-primary bg-primary/80 text-primary-foreground"
                    : "border-border bg-muted/50 text-muted-foreground",
              )}
            >
              {i + 1}
            </div>
            {i < progressLabels.length - 1 && <div className="h-px flex-1 bg-border" />}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="mb-6">
        {step.eyebrow && (
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">{step.eyebrow}</p>
        )}
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{step.title}</h1>
        {step.subtitle && <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{step.subtitle}</p>}
      </div>

      {/* Fields */}
      <div className="space-y-5">
        {step.fields.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border/70 px-4 py-6 text-center text-xs text-muted-foreground">
            No fields on this step yet.
          </p>
        ) : (
          step.fields.map((field) => (
            <PreviewField
              key={field.id}
              field={field}
              value={values[field.key]}
              onChange={(v) => setValue(field.key, v)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PreviewField({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const label = (
    <label className="flex items-center gap-1 text-xs font-medium text-foreground">
      {field.label}
      {field.required && <span className="text-primary">*</span>}
    </label>
  );

  const selectedMulti = useMemo(() => (Array.isArray(value) ? (value as string[]) : []), [value]);

  switch (field.type) {
    case "textarea":
      return (
        <div className="space-y-1.5">
          {label}
          <Textarea
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={field.readOnly}
            className="min-h-[88px]"
          />
          {field.helpText && <p className="text-[11px] text-muted-foreground">{field.helpText}</p>}
        </div>
      );

    case "boolean":
      return (
        <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/40 px-3 py-2.5">
          <div>
            {label}
            {field.helpText && <p className="mt-0.5 text-[11px] text-muted-foreground">{field.helpText}</p>}
          </div>
          <Switch checked={Boolean(value)} onCheckedChange={(c) => onChange(c)} />
        </div>
      );

    case "select":
      return (
        <div className="space-y-2">
          {label}
          <div className="flex flex-wrap gap-2">
            {(field.options ?? []).map((opt) => {
              const active = value === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => onChange(opt)}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border/80 bg-background/60 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                >
                  {opt}
                </button>
              );
            })}
            {(field.options ?? []).length === 0 && (
              <span className="text-[11px] text-muted-foreground">No options configured.</span>
            )}
          </div>
          {field.helpText && <p className="text-[11px] text-muted-foreground">{field.helpText}</p>}
        </div>
      );

    case "multiselect":
      return (
        <div className="space-y-2">
          {label}
          <div className="flex flex-wrap gap-2">
            {(field.options ?? []).map((opt) => {
              const active = selectedMulti.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() =>
                    onChange(active ? selectedMulti.filter((o) => o !== opt) : [...selectedMulti, opt])
                  }
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    active
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border/80 bg-background/60 text-muted-foreground hover:border-primary/30 hover:text-foreground",
                  )}
                >
                  {opt}
                </button>
              );
            })}
            {(field.options ?? []).length === 0 && (
              <span className="text-[11px] text-muted-foreground">No options configured.</span>
            )}
          </div>
          {field.helpText && <p className="text-[11px] text-muted-foreground">{field.helpText}</p>}
        </div>
      );

    default: {
      const inputType =
        field.type === "email" ? "email" : field.type === "number" ? "number" : field.type === "date" ? "date" : "text";
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            type={inputType}
            value={typeof value === "string" || typeof value === "number" ? String(value) : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            disabled={field.readOnly}
            inputMode={field.type === "url" ? "url" : undefined}
          />
          {field.helpText && <p className="text-[11px] text-muted-foreground">{field.helpText}</p>}
        </div>
      );
    }
  }
}
