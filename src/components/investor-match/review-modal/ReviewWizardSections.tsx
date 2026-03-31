import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";
import type { ReviewWizardStep } from "@/lib/reviewModalWizard";
import { wizardProgressLabel } from "@/lib/reviewModalWizard";
import { cn } from "@/lib/utils";

export function ReviewWizardProgressBar({ step }: { step: ReviewWizardStep }) {
  const pct = (step / 3) * 100;
  return (
    <div className="mt-2 space-y-1" role="status" aria-live="polite">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="font-semibold text-foreground">
          Step {step} of 3
        </span>
        <span className="truncate pl-2">{wizardProgressLabel(step)}</span>
      </div>
      <div className="h-1 w-full rounded-full bg-border/80 overflow-hidden" aria-hidden>
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out animate-progress-bar-pulse"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ReviewWizardSummaryPanel({
  investorIsMappedToProfile,
  contextLine,
  evaluationLine,
  tagsLine,
  noteLine,
}: {
  investorIsMappedToProfile: boolean;
  contextLine: string;
  /** Unlinked: overall / response / engage. Linked: standout tag chips. */
  evaluationLine: string;
  /** Unlinked only: interaction tag chips */
  tagsLine?: string;
  noteLine: string;
}) {
  return (
    <aside
      className={cn(
        "rounded-xl border border-border/70 bg-secondary/20 p-3.5 space-y-3 text-left text-[11px] leading-snug",
        "lg:bg-secondary/10 lg:border-border/50",
      )}
    >
      <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
        Summary
      </p>
      <div className="space-y-2.5">
        <div>
          <p className="font-semibold text-foreground mb-0.5">
            {investorIsMappedToProfile ? "Ratings" : "Context"}
          </p>
          <p className="text-muted-foreground">{contextLine}</p>
        </div>
        <div>
          <p className="font-semibold text-foreground mb-0.5">
            {investorIsMappedToProfile ? "Standout tags" : "Evaluation"}
          </p>
          <p className="text-muted-foreground">{evaluationLine}</p>
        </div>
        {!investorIsMappedToProfile && tagsLine != null ? (
          <div>
            <p className="font-semibold text-foreground mb-0.5">Interaction tags</p>
            <p className="text-muted-foreground">{tagsLine}</p>
          </div>
        ) : null}
        <div>
          <p className="font-semibold text-foreground mb-0.5">Note</p>
          <p className="text-muted-foreground">{noteLine}</p>
        </div>
      </div>
    </aside>
  );
}

export function ReviewWizardFooter({
  step,
  canGoNext,
  canSubmit,
  submitting,
  onBack,
  onNext,
  onSubmit,
  onCancel,
}: {
  step: ReviewWizardStep;
  canGoNext: boolean;
  canSubmit: boolean;
  submitting: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const isLast = step === 3;
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-secondary/10 px-5 py-3.5">
      <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="text-muted-foreground">
        Cancel
      </Button>
      <div className="flex items-center gap-2">
        {step > 1 ? (
          <Button type="button" variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">
            Back
          </Button>
        ) : null}
        {!isLast ? (
          <Button type="button" size="sm" onClick={onNext} disabled={!canGoNext} className="px-4">
            Next
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={onSubmit}
            disabled={!canSubmit || submitting}
            className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90 px-5"
          >
            {submitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting…
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" /> Submit review
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Two-column on lg: scrollable step + sticky summary; single column stacks summary above. */
export function ReviewWizardBody({
  step,
  summary,
  children,
}: {
  step: ReviewWizardStep;
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      <div className="lg:hidden shrink-0 border-b border-border/60 px-5 py-3 bg-secondary/5">
        {summary}
      </div>
      <div
        className="flex-1 min-h-0 min-w-0 overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]"
        data-review-wizard-step={step}
        tabIndex={-1}
      >
        <div className="max-w-lg mx-auto lg:mx-0">{children}</div>
      </div>
      <div className="hidden lg:flex lg:w-[272px] shrink-0 border-l border-border/60 overflow-y-auto p-4 bg-secondary/5">
        {summary}
      </div>
    </div>
  );
}
