import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";
import type { ReviewWizardStep } from "@/lib/reviewModalWizard";
import { wizardProgressLabel, wizardProgressStepTitles } from "@/lib/reviewModalWizard";
import { cn } from "@/lib/utils";

export function ReviewWizardProgressBar({
  step,
  totalSteps,
  investorIsMappedToProfile,
  compact = false,
}: {
  step: ReviewWizardStep;
  totalSteps: number;
  investorIsMappedToProfile: boolean;
  /** Tighter vertical rhythm on step 2 so the main column can avoid scrolling. */
  compact?: boolean;
}) {
  const titles = wizardProgressStepTitles(investorIsMappedToProfile).slice(0, totalSteps);
  const currentTitle = wizardProgressLabel(step, investorIsMappedToProfile);

  return (
    <div
      className={cn(compact ? "mt-1 space-y-1.5" : "mt-2 space-y-2.5")}
      role="navigation"
      aria-label="Review steps"
    >
      <p className="sr-only">
        Step {step} of {totalSteps}: {currentTitle}
      </p>

      {/* Segmented track: each step is a pill; completed + current are filled */}
      <div className="flex w-full gap-1 sm:gap-1.5" aria-hidden>
        {titles.map((_, i) => {
          const n = i + 1;
          const done = step > n;
          const current = step === n;
          return (
            <div
              key={n}
              className={cn(
                "min-w-0 flex-1 rounded-full transition-all duration-300 ease-out",
                current ? "h-1.5 sm:h-2 bg-accent ring-2 ring-accent/25 ring-offset-2 ring-offset-background" : "h-1 sm:h-1.5",
                done && !current && "bg-accent",
                !done && !current && "bg-border/90 dark:bg-border/70",
              )}
            />
          );
        })}
      </div>

      {/* Step titles — full flow visible */}
      <ol
        className="m-0 grid w-full list-none gap-x-0.5 sm:gap-x-1 p-0 text-center"
        style={{ gridTemplateColumns: `repeat(${totalSteps}, minmax(0, 1fr))` }}
      >
        {titles.map((title, i) => {
          const n = i + 1;
          const done = step > n;
          const current = step === n;
          return (
            <li key={n} className="min-w-0 px-0.5" aria-current={current ? "step" : undefined}>
              <span
                className={cn(
                  "block text-[8px] font-medium leading-snug sm:text-[9px]",
                  current && "font-semibold text-foreground",
                  done && !current && "text-muted-foreground",
                  !done && !current && "text-muted-foreground/65",
                )}
              >
                {title}
              </span>
            </li>
          );
        })}
      </ol>
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
  const rowLabel =
    "mb-0 text-[9px] font-semibold text-foreground sm:mb-0.5 sm:text-[11px]";
  const rowBody =
    "text-muted-foreground text-[9px] leading-tight sm:text-[11px] sm:leading-snug line-clamp-2 sm:line-clamp-none";

  return (
    <aside
      className={cn(
        "w-full",
        "rounded-lg border border-border/70 bg-secondary/20 text-left sm:rounded-xl",
        "p-2 space-y-1.5 sm:p-3 sm:space-y-2 lg:p-3.5 lg:space-y-3",
        "text-[10px] leading-tight sm:text-[11px] sm:leading-snug",
        "lg:bg-secondary/10 lg:border-border/50",
      )}
    >
      <p className="text-[8px] font-mono font-bold uppercase tracking-wider text-muted-foreground sm:text-[10px]">
        Summary
      </p>
      <div className="space-y-1.5 sm:space-y-2 lg:space-y-2.5">
        <div>
          <p className={rowLabel}>{investorIsMappedToProfile ? "Ratings" : "Context"}</p>
          <p className={rowBody}>{contextLine}</p>
        </div>
        <div>
          <p className={rowLabel}>
            {investorIsMappedToProfile ? "Standout tags" : "Evaluation"}
          </p>
          <p className={rowBody}>{evaluationLine}</p>
        </div>
        {!investorIsMappedToProfile && tagsLine != null ? (
          <div>
            <p className={rowLabel}>Interaction tags</p>
            <p className={rowBody}>{tagsLine}</p>
          </div>
        ) : null}
        <div>
          <p className={rowLabel}>Note</p>
          <p className={rowBody}>{noteLine}</p>
        </div>
      </div>
    </aside>
  );
}

export function ReviewWizardFooter({
  step,
  totalSteps,
  canGoNext,
  canSubmit,
  submitting,
  onBack,
  onNext,
  onSubmit,
  onCancel,
  compact = false,
}: {
  step: ReviewWizardStep;
  totalSteps: number;
  canGoNext: boolean;
  canSubmit: boolean;
  submitting: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  onCancel: () => void;
  compact?: boolean;
}) {
  const isLast = step === totalSteps;
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-between gap-2 border-t border-border bg-secondary/10",
        compact ? "px-4 py-2" : "px-5 py-3.5",
      )}
    >
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
  /** Tighter padding + less vertical rhythm so step 2 fits without scrolling. */
  compactMainColumn = false,
  /** Step 2: hide the stacked summary on small screens to free vertical space (summary stays on lg sidebar). */
  hideMobileSummary = false,
  /**
   * Step 2: hide the lg summary column so the form uses full modal width (less vertical stacking).
   */
  omitDesktopSummary = false,
}: {
  step: ReviewWizardStep;
  summary: ReactNode;
  children: ReactNode;
  compactMainColumn?: boolean;
  hideMobileSummary?: boolean;
  omitDesktopSummary?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      {!hideMobileSummary ? (
        <div
          className={cn(
            "lg:hidden shrink-0 border-b border-border/60 bg-secondary/5",
            compactMainColumn ? "px-3 py-1.5" : "px-4 py-2 sm:px-5 sm:py-3",
          )}
        >
          {summary}
        </div>
      ) : null}
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col",
          compactMainColumn
            ? "overflow-y-auto overscroll-y-contain px-3 py-1.5 sm:px-4 sm:py-2 scrollbar-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            : "overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]",
        )}
        data-review-wizard-step={step}
        tabIndex={-1}
      >
        <div
          className={cn(
            "mx-auto min-w-0 w-full",
            omitDesktopSummary ? "max-w-none" : "max-w-lg lg:mx-0",
          )}
        >
          {children}
        </div>
      </div>
      {!omitDesktopSummary ? (
        <div className="hidden lg:flex lg:w-[272px] shrink-0 border-l border-border/60 overflow-y-auto p-4 bg-secondary/5">
          {summary}
        </div>
      ) : null}
    </div>
  );
}
