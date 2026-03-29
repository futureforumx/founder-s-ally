/**
 * Shared visual tokens for the review submission wizard (chips + question labels).
 */

/** Selected chip: solid fill + light text (theme primary ≈ navy). */
export const reviewWizardChipSelected =
  "border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:text-primary-foreground";

export const reviewWizardChipIdle =
  "border-border bg-secondary/40 text-muted-foreground hover:bg-secondary/65 hover:text-foreground";

export const reviewWizardChipFocus =
  "outline-none focus-visible:ring-2 focus-visible:ring-primary/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Sub-question / field labels (metadata style). */
export const reviewWizardQuestionLabelClass =
  "text-[10px] font-semibold uppercase tracking-[0.08em] text-foreground leading-snug";

/** Full-width single row of equal segments (relationship origin keeps its own wrap layout). */
export const reviewWizardOptionRow =
  "flex w-full max-w-full flex-nowrap gap-1 sm:gap-1.5";

export const reviewWizardOptionRowCompact =
  "flex w-full max-w-full flex-nowrap gap-0.5 sm:gap-1";

export const reviewWizardOptionRowBtn =
  "min-h-[2.5rem] min-w-0 flex-1 rounded-lg border px-0.5 py-2 text-center text-[10px] font-medium leading-snug transition-all duration-150 sm:min-h-11 sm:px-1 sm:text-[11px]";

/** Denser row buttons for characterize / tags steps (fit without scrolling). */
export const reviewWizardOptionRowBtnCompact =
  "min-h-8 min-w-0 flex-1 rounded-lg border px-0.5 py-0.5 text-center text-[8px] font-medium leading-tight transition-all duration-150 sm:min-h-8 sm:px-0.5 sm:text-[9px] sm:leading-snug";
