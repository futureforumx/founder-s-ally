import { motion } from "framer-motion";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { FieldDef, StepDef } from "@/config/onboardingWorkflow";
import type { OnboardingState } from "./types";

interface GenericFormStepProps {
  step: StepDef;
  state: OnboardingState;
  update: (partial: Partial<OnboardingState>) => void;
  onNext: () => void;
  onBack?: () => void;
  isLast: boolean;
}

/**
 * Renders an admin-authored ("form") step from its field schema. Values are written
 * back into the onboarding state by field key so they persist with autosave.
 */
export function GenericFormStep({ step, state, update, onNext, onBack, isLast }: GenericFormStepProps) {
  const read = (key: string): unknown => (state as unknown as Record<string, unknown>)[key];
  const write = (key: string, value: unknown) => update({ [key]: value } as unknown as Partial<OnboardingState>);

  const missingRequired = step.fields
    .filter((f) => f.required)
    .some((f) => {
      const v = read(f.key);
      if (Array.isArray(v)) return v.length === 0;
      if (typeof v === "boolean") return false;
      return !v || String(v).trim() === "";
    });

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="w-full"
    >
      <div className="mb-7">
        {step.eyebrow && (
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">{step.eyebrow}</p>
        )}
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{step.title}</h1>
        {step.subtitle && <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">{step.subtitle}</p>}
      </div>

      <div className="space-y-5">
        {step.fields.map((field) => (
          <GenericField key={field.id} field={field} value={read(field.key)} onChange={(v) => write(field.key, v)} />
        ))}
      </div>

      <div className="mt-8 flex gap-3">
        {onBack && (
          <Button variant="outline" onClick={onBack} className="h-11 gap-2 px-4 text-sm">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
        )}
        <Button onClick={onNext} disabled={missingRequired} className="h-11 flex-1 gap-2 text-sm">
          {isLast ? "Finish" : "Continue"} <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </motion.div>
  );
}

function GenericField({
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
  const selectedMulti = Array.isArray(value) ? (value as string[]) : [];

  if (field.type === "textarea") {
    return (
      <div className="space-y-1.5">
        {label}
        <Textarea value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} disabled={field.readOnly} className="min-h-[88px]" />
        {field.helpText && <p className="text-[11px] text-muted-foreground">{field.helpText}</p>}
      </div>
    );
  }

  if (field.type === "boolean") {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border/70 bg-background/40 px-3 py-2.5">
        <div>
          {label}
          {field.helpText && <p className="mt-0.5 text-[11px] text-muted-foreground">{field.helpText}</p>}
        </div>
        <Switch checked={Boolean(value)} onCheckedChange={(c) => onChange(c)} />
      </div>
    );
  }

  if (field.type === "select" || field.type === "multiselect") {
    const isMulti = field.type === "multiselect";
    return (
      <div className="space-y-2">
        {label}
        <div className="flex flex-wrap gap-2">
          {(field.options ?? []).map((opt) => {
            const active = isMulti ? selectedMulti.includes(opt) : value === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() =>
                  isMulti
                    ? onChange(active ? selectedMulti.filter((o) => o !== opt) : [...selectedMulti, opt])
                    : onChange(opt)
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
        </div>
        {field.helpText && <p className="text-[11px] text-muted-foreground">{field.helpText}</p>}
      </div>
    );
  }

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
        className="h-11"
      />
      {field.helpText && <p className="text-[11px] text-muted-foreground">{field.helpText}</p>}
    </div>
  );
}
