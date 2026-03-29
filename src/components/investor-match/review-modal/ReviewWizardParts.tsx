import { useState, useRef, type CSSProperties, type ReactNode } from "react";
import { motion } from "framer-motion";
import { X, Star, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { ReviewStep } from "@/lib/reviewWizard";
import {
  deriveReviewDraftFromAnswers,
  formatContextSectionUnlinked,
  formatEvaluationSectionLinked,
  formatNoteStatus,
  formatRating,
  formatTags,
  isContextStepValidUnlinked,
  isEvaluationStepValidLinked,
  isWouldEngageStepValidUnlinked,
  overallInteractionScoreValid,
} from "@/lib/reviewWizard";
import {
  reviewWizardChipFocus,
  reviewWizardChipIdle,
  reviewWizardChipSelected,
  reviewWizardOptionRow,
  reviewWizardOptionRowBtn,
} from "@/components/investor-match/review-modal/reviewWizardUi";

const OVERALL_GRADIENT_STYLE: CSSProperties = {
  background:
    "linear-gradient(90deg, rgb(185 28 28) 0%, rgb(234 88 12) 22%, rgb(250 204 21) 45%, rgb(163 230 53) 72%, rgb(22 163 74) 100%)",
};

const OVERALL_SCALE_TIERS: Record<number, { label: string; description: string }> = {
  10: {
    label: "Exceptional / A+ interaction",
    description: "Felt sharp, respectful, and genuinely high-signal from start to finish.",
  },
  9: {
    label: "Great / Above expectations",
    description: "Very strong interaction with clear thinking and minimal friction.",
  },
  8: {
    label: "Strong",
    description: "Solid, useful, and better than most.",
  },
  7: {
    label: "Good",
    description: "Worked well overall, with only minor rough edges.",
  },
  6: {
    label: "Mixed / Okay",
    description: "Some useful parts, some friction, nothing especially memorable.",
  },
  5: {
    label: "Mixed / Okay",
    description: "Some useful parts, some friction, nothing especially memorable.",
  },
  4: {
    label: "Weak",
    description: "More frustrating than helpful; expectations weren't fully met.",
  },
  3: {
    label: "Poor",
    description: "Low-signal interaction with noticeable issues.",
  },
  2: {
    label: "Rough",
    description: "Hard to work with, unclear, or disappointing.",
  },
  1: {
    label: "Toxic / Terrible",
    description: "A bad experience; would actively warn other founders.",
  },
};

const OVERALL_SCALE_NUMS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** Light fill + border keyed to selected 1–10 (matches scale gradient: low red → high green). */
function scoreMeaningPanelClass(n: number | null): string {
  if (n == null) {
    return cn(
      "border-border/45 bg-muted/25 text-foreground dark:border-border/60 dark:bg-muted/15",
    );
  }
  if (n <= 2) {
    return "border-red-200/40 bg-red-50/45 dark:border-red-900/30 dark:bg-red-950/20";
  }
  if (n <= 4) {
    return "border-orange-200/40 bg-orange-50/40 dark:border-orange-900/28 dark:bg-orange-950/18";
  }
  if (n <= 6) {
    return "border-amber-200/40 bg-amber-50/40 dark:border-amber-900/28 dark:bg-amber-950/18";
  }
  if (n <= 8) {
    return "border-lime-200/35 bg-lime-50/35 dark:border-lime-900/25 dark:bg-lime-950/16";
  }
  return "border-emerald-200/40 bg-emerald-50/40 dark:border-emerald-900/28 dark:bg-emerald-950/18";
}

export function SegmentedPillRow({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex w-full flex-nowrap gap-1 sm:gap-1.5"
    >
      {options.map((opt) => {
        const selected = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={selected}
            title={opt}
            onClick={() => onChange(opt)}
            className={cn(
              "min-h-[2.65rem] min-w-0 flex-1 rounded-lg border px-1 py-1.5 text-center text-[9px] font-semibold leading-snug transition-colors duration-150 sm:min-h-[2.5rem] sm:px-1.5 sm:text-[10px] sm:leading-tight",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? "border-transparent bg-foreground text-background shadow-sm"
                : "border-border bg-background text-muted-foreground hover:border-foreground/20 hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <span className="block">{opt}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Sentiment strip: positive (left) → negative (right), gradient track + compact chips. */
const ENGAGE_TRACK_GRADIENT: CSSProperties = {
  background:
    "linear-gradient(90deg, rgb(22 163 74 / 0.14) 0%, rgb(163 163 163 / 0.12) 50%, rgb(220 38 38 / 0.14) 100%)",
};

const ENGAGE_RAIL_GRADIENT: CSSProperties = {
  background:
    "linear-gradient(90deg, rgb(16 185 129) 0%, rgb(163 163 163) 50%, rgb(239 68 68) 100%)",
};

/** Bottom accent for selected chip by index (0 = most positive … 4 = most negative). */
const ENGAGE_SELECTED_RAIL: readonly string[] = [
  "shadow-[inset_0_-3px_0_0_rgb(16,185,129)]",
  "shadow-[inset_0_-3px_0_0_rgb(132,204,22)]",
  "shadow-[inset_0_-3px_0_0_rgb(161,161,170)]",
  "shadow-[inset_0_-3px_0_0_rgb(249,115,22)]",
  "shadow-[inset_0_-3px_0_0_rgb(239,68,68)]",
];

export function EngageSentimentScale({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  /** Order: most positive first (left) → most negative (right). */
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
  ariaLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div
        className={cn(
          "relative overflow-hidden rounded-[8px] border border-border/60 p-1",
          "shadow-sm dark:border-border/80",
        )}
      >
        <div
          className="pointer-events-none absolute inset-0 dark:opacity-[0.22]"
          style={ENGAGE_TRACK_GRADIENT}
          aria-hidden
        />
        {/* Thin sentiment rail under the row */}
        <div
          className="pointer-events-none absolute bottom-1 left-1 right-1 h-px rounded-full opacity-35 dark:opacity-45"
          style={ENGAGE_RAIL_GRADIENT}
          aria-hidden
        />
        <div
          role="radiogroup"
          aria-label={ariaLabel}
          className="relative z-[1] flex w-full flex-nowrap gap-1"
        >
          {options.map((opt, i) => {
            const selected = value === opt;
            return (
              <button
                key={opt}
                type="button"
                role="radio"
                aria-checked={selected}
                title={opt}
                onClick={() => onChange(opt)}
                className={cn(
                  "min-h-9 min-w-0 flex-1 rounded-[8px] border px-1.5 py-1.5 text-center text-[10px] font-medium leading-snug tracking-wide transition-all duration-150 sm:min-h-[2.35rem] sm:text-[11px]",
                  "outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  selected
                    ? cn(
                        "z-[2] border-transparent bg-foreground text-background",
                        "shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_2px_8px_rgba(0,0,0,0.14)]",
                        "dark:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_10px_rgba(0,0,0,0.35)]",
                        ENGAGE_SELECTED_RAIL[i] ?? ENGAGE_SELECTED_RAIL[2],
                      )
                    : cn(
                        "border-neutral-200 bg-white text-muted-foreground",
                        "hover:border-neutral-300 hover:text-foreground",
                        "dark:border-border dark:bg-background dark:hover:border-muted-foreground/30",
                      ),
                )}
              >
                <span className="block hyphens-none">{opt}</span>
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-[10px] leading-snug text-muted-foreground px-0.5">
        Choose the option that best reflects your experience.
      </p>
    </div>
  );
}

export function SingleSelect({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div className={reviewWizardOptionRow} role="listbox" aria-label={ariaLabel ?? "Choose one"}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          role="option"
          aria-selected={value === opt}
          title={opt}
          onClick={() => onChange(opt)}
          className={cn(
            reviewWizardOptionRowBtn,
            reviewWizardChipFocus,
            value === opt ? reviewWizardChipSelected : reviewWizardChipIdle,
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export function MultiSelect({
  options,
  selected,
  onChange,
  ariaLabel,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  ariaLabel?: string;
}) {
  const toggle = (opt: string) => {
    onChange(
      selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt],
    );
  };

  return (
    <div className={reviewWizardOptionRow} role="group" aria-label={ariaLabel ?? "Select any"}>
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          aria-pressed={selected.includes(opt)}
          title={opt}
          onClick={() => toggle(opt)}
          className={cn(
            reviewWizardOptionRowBtn,
            reviewWizardChipFocus,
            selected.includes(opt) ? reviewWizardChipSelected : reviewWizardChipIdle,
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export function OverallInteractionScale({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string) => void;
}) {
  const selectedN = value != null ? parseInt(value, 10) : NaN;
  const hasSelection = Number.isFinite(selectedN) && selectedN >= 1 && selectedN <= 10;
  /** Score meaning panel: selected value only (not hover preview). */
  const meaningN = hasSelection ? selectedN : null;
  const meaningTier = meaningN != null ? OVERALL_SCALE_TIERS[meaningN] : null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/70 bg-secondary/20 p-3">
        <p className="sr-only" id="overall-scale-desc">
          Choose from 1 (toxic or terrible) to 10 (exceptional). The bar runs from low on the left to
          high on the right.
        </p>
        <div className="relative px-0.5 pt-1" aria-describedby="overall-scale-desc">
          <div
            className="relative h-3 w-full overflow-hidden rounded-full shadow-inner ring-1 ring-black/5 dark:ring-white/10"
            style={OVERALL_GRADIENT_STYLE}
            aria-hidden
          >
            <div className="absolute inset-0 flex">
              {OVERALL_SCALE_NUMS.map((n) => (
                <div
                  key={n}
                  className={cn(
                    "flex-1 border-l border-white/25 first:border-l-0 dark:border-black/20",
                    hasSelection && selectedN === n && "bg-white/25 dark:bg-black/20",
                  )}
                  style={{ flexGrow: 1 }}
                />
              ))}
            </div>
          </div>
          <div className="mt-2 flex justify-between gap-0">
            {OVERALL_SCALE_NUMS.map((n) => {
              const active = hasSelection && selectedN === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange(String(n))}
                  aria-label={`${n} — ${OVERALL_SCALE_TIERS[n].label}`}
                  aria-pressed={active}
                  className={cn(
                    "flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md py-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                    active ? "text-accent" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold tabular-nums",
                      active
                        ? "bg-accent text-accent-foreground shadow-sm"
                        : "bg-card ring-1 ring-border/80 hover:ring-accent/40",
                    )}
                  >
                    {n}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-1 flex justify-between px-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>Terrible</span>
            <span>Mixed</span>
            <span>Exceptional</span>
          </div>
        </div>
      </div>

      <div>
        <div
          role="region"
          aria-label="Score meaning"
          aria-live="polite"
          className={cn(
            "min-h-[3.25rem] rounded-xl border px-3 py-2.5 shadow-sm transition-colors duration-200",
            scoreMeaningPanelClass(meaningN),
          )}
        >
          {meaningTier && meaningN != null ? (
            <div className="leading-snug">
              <p className="text-[12px] font-semibold text-foreground">
                {meaningN} — {meaningTier.label}
              </p>
              <p className="mt-1 text-[11px] font-normal text-muted-foreground">{meaningTier.description}</p>
            </div>
          ) : (
            <p className="text-[11px] leading-snug text-muted-foreground">
              Choose a score on the scale above to see what it means.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

const TAG_PREVIEW_COUNT = 8;

function UnlinkedTagPicker({
  tags,
  selected,
  onChange,
  emptyHint,
}: {
  tags: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  emptyHint?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const toggle = (tag: string) =>
    onChange(
      selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag],
    );

  if (tags.length === 0) {
    return (
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {emptyHint ?? "No tags to show."}
      </p>
    );
  }

  const visible = expanded ? tags : tags.slice(0, TAG_PREVIEW_COUNT);
  const hasMore = tags.length > TAG_PREVIEW_COUNT;

  return (
    <section className="space-y-2">
      <p className="text-xs font-bold text-foreground">Tags</p>
      <p className="text-[10px] text-muted-foreground">Optional — pick any that fit.</p>
      <div className="flex w-full max-w-full flex-nowrap gap-1 overflow-x-auto py-0.5 [scrollbar-gutter:stable] sm:gap-1.5">
        {visible.map((tag) => (
          <button
            key={tag}
            type="button"
            aria-pressed={selected.includes(tag)}
            title={tag}
            onClick={() => toggle(tag)}
            className={cn(
              "shrink-0 max-w-[6rem] rounded-lg border px-2 py-2 text-center text-[9px] font-medium leading-tight transition-all duration-150 [text-wrap:balance] sm:max-w-[7rem] sm:px-2.5 sm:text-[10px] sm:leading-snug",
              reviewWizardChipFocus,
              selected.includes(tag)
                ? reviewWizardChipSelected
                : reviewWizardChipIdle,
            )}
          >
            {tag}
          </button>
        ))}
      </div>
      {hasMore && !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-[11px] font-medium text-accent hover:underline underline-offset-2"
        >
          Show more tags
        </button>
      ) : null}
    </section>
  );
}

// ── Shell & chrome ───────────────────────────────────────────────────────────

export function ReviewModalShell({
  title,
  subtitle,
  onClose,
  headerExtra,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  headerExtra?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <motion.div
      className="pointer-events-auto w-full max-w-4xl max-h-[min(90vh,880px)] flex flex-col min-h-0 bg-card rounded-2xl border border-border shadow-2xl overflow-hidden"
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: 20 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
    >
      <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border bg-secondary/20 shrink-0">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-warning/10 shrink-0">
            <Star className="h-4 w-4 text-warning" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-foreground truncate">{title}</h3>
            <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
            {headerExtra}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors shrink-0"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
      </header>
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">{children}</div>
      {footer}
    </motion.div>
  );
}

export function ReviewProgress({ currentStep, totalSteps }: { currentStep: ReviewStep; totalSteps: number }) {
  const labels = ["Context", "Evaluation", "Optional detail"];
  const pct = (currentStep / totalSteps) * 100;
  return (
    <div className="mt-2 space-y-1.5" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
        <span className="font-semibold text-foreground">
          Step {currentStep} of {totalSteps}
        </span>
        <span className="truncate">{labels[currentStep - 1] ?? ""}</span>
      </div>
      <div
        className="h-1 w-full rounded-full bg-border/80 overflow-hidden"
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function ReviewFooterNav({
  currentStep,
  totalSteps,
  canGoNext,
  onBack,
  onNext,
  onSubmit,
  onCancel,
  isSubmitting,
  canSubmit,
}: {
  currentStep: ReviewStep;
  totalSteps: number;
  canGoNext: boolean;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  onCancel: () => void;
  isSubmitting: boolean;
  canSubmit: boolean;
}) {
  const isLast = currentStep === totalSteps;
  return (
    <footer className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-border bg-secondary/10 shrink-0">
      <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="text-muted-foreground">
        Cancel
      </Button>
      <div className="flex items-center gap-2">
        {currentStep > 1 ? (
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
            disabled={!canSubmit || isSubmitting}
            className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90 px-5"
          >
            {isSubmitting ? (
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
    </footer>
  );
}

export function ReviewSummaryPanel({
  currentStep,
  investorIsMappedToProfile,
  answers,
  selectedTags,
  firmName,
}: {
  currentStep: ReviewStep;
  investorIsMappedToProfile: boolean;
  answers: Record<string, string | string[]>;
  selectedTags: string[];
  firmName: string;
}) {
  const draft = deriveReviewDraftFromAnswers(answers, selectedTags, investorIsMappedToProfile);

  const experienceDone = investorIsMappedToProfile
    ? true
    : overallInteractionScoreValid(answers.overall_interaction);

  const experienceLine = investorIsMappedToProfile
    ? "Cap table investor"
    : experienceDone
      ? formatRating(answers.overall_interaction as string, false)
      : "Not completed";

  const detailsDone = investorIsMappedToProfile
    ? isEvaluationStepValidLinked(answers)
    : isContextStepValidUnlinked(answers) && isWouldEngageStepValidUnlinked(answers);

  const detailsLine = investorIsMappedToProfile
    ? formatEvaluationSectionLinked(answers) +
      (Array.isArray(answers.standout_tags) && (answers.standout_tags as string[]).length
        ? ` · ${formatTags(answers.standout_tags as string[])}`
        : "")
    : detailsDone
      ? `${formatContextSectionUnlinked(answers, draft)} · ${answers.would_engage_again as string}${
          selectedTags.length ? ` · ${formatTags(selectedTags)}` : ""
        }`
      : "Not completed";

  const noteLine = formatNoteStatus(draft.note);

  return (
    <aside className="rounded-xl border border-border/70 bg-secondary/15 p-4 space-y-4 text-left">
      <p className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
        Review summary
      </p>
      <div className="space-y-3 text-[11px] leading-snug">
        <div>
          <p className="font-semibold text-foreground mb-0.5">
            {investorIsMappedToProfile ? "Relationship" : "Experience"}
          </p>
          <p className={cn("text-muted-foreground", !experienceDone && "italic")}>
            {experienceLine}
          </p>
        </div>
        <div>
          <p className="font-semibold text-foreground mb-0.5">
            {investorIsMappedToProfile ? "Evaluation" : "Context & engagement"}
          </p>
          <p className={cn("text-muted-foreground", !detailsDone && "italic")}>
            {detailsLine}
          </p>
        </div>
        <div>
          <p className="font-semibold text-foreground mb-0.5">Note</p>
          <p className="text-muted-foreground">{noteLine}</p>
        </div>
      </div>
      <p className="text-[9px] text-muted-foreground/80 pt-1 border-t border-border/50">
        {firmName.trim() || "This firm"}
      </p>
    </aside>
  );
}

export function ReviewStepEvaluationUnlinked({
  firmName,
  answers,
  setAnswer,
  nonInvestorTagOptions,
  selectedTags,
  setSelectedTags,
}: {
  firmName: string;
  answers: Record<string, string | string[]>;
  setAnswer: (id: string, value: string | string[]) => void;
  nonInvestorTagOptions: string[];
  selectedTags: string[];
  setSelectedTags: (v: string[]) => void;
}) {
  const engageOptions = [
    "Definitely yes",
    "Likely yes",
    "Maybe",
    "Probably not",
    "Definitely not",
  ] as const;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <p className="text-sm font-bold leading-snug text-foreground">
          How was your experience with {firmName.trim() || "this firm"}?
        </p>
        <OverallInteractionScale
          value={(answers.overall_interaction as string) ?? null}
          onChange={(v) => setAnswer("overall_interaction", v)}
        />
      </section>
      <section className="space-y-2">
        <p className="text-xs font-bold text-foreground">Would you engage with this investor again?</p>
        <EngageSentimentScale
          ariaLabel="Engage again"
          options={[...engageOptions]}
          value={(answers.would_engage_again as string) ?? null}
          onChange={(v) => setAnswer("would_engage_again", v)}
        />
      </section>
      <UnlinkedTagPicker
        tags={nonInvestorTagOptions}
        selected={selectedTags}
        onChange={setSelectedTags}
        emptyHint="Set your overall score above to see tags that match how the interaction felt."
      />
    </div>
  );
}

const LINKED_TAG_OPTIONS = [
  "Responsive",
  "Transparent",
  "Founder-friendly",
  "Strategic",
  "Strong network",
  "Helpful operator",
  "Deep domain expertise",
  "Follows through",
  "Helpful in hard times",
  "Hard to reach",
  "Low follow-through",
  "Limited value-add",
] as const;

/** Linked wizard step 1 — ratings only */
export function ReviewStepLinkedRatings({
  answers,
  setAnswer,
}: {
  answers: Record<string, string | string[]>;
  setAnswer: (id: string, value: string | string[]) => void;
}) {
  const workOpts = ["Great", "Good", "Mixed", "Poor"];
  const moneyOpts = ["Yes", "No", "Not sure"];

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <p className="text-xs font-bold text-foreground">How has this investor been to work with?</p>
        <SingleSelect
          options={workOpts}
          value={(answers.work_with_them_rating as string) ?? null}
          onChange={(v) => setAnswer("work_with_them_rating", v)}
          ariaLabel="How has this investor been to work with"
        />
      </section>
      <section className="space-y-2">
        <p className="text-xs font-bold text-foreground">Would you take money from them again?</p>
        <SingleSelect
          options={moneyOpts}
          value={(answers.take_money_again as string) ?? null}
          onChange={(v) => setAnswer("take_money_again", v)}
          ariaLabel="Would you take money from them again"
        />
      </section>
    </div>
  );
}

/** Linked wizard step 2 — optional standout tags */
export function ReviewStepLinkedTags({
  answers,
  setAnswer,
}: {
  answers: Record<string, string | string[]>;
  setAnswer: (id: string, value: string | string[]) => void;
}) {
  const selected = (Array.isArray(answers.standout_tags) ? answers.standout_tags : []) as string[];

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <p className="text-xs font-bold text-foreground">What stood out most?</p>
        <p className="text-[10px] text-muted-foreground">Optional — select any that apply.</p>
        <MultiSelect
          options={[...LINKED_TAG_OPTIONS]}
          selected={selected}
          onChange={(v) => setAnswer("standout_tags", v)}
          ariaLabel="Standout tags"
        />
      </section>
    </div>
  );
}

export function ReviewStepNote({
  note,
  onNoteChange,
  anonymous,
  onAnonymousChange,
  investorIsMappedToProfile,
  answers,
  selectedTags,
  firmName,
}: {
  note: string;
  onNoteChange: (v: string) => void;
  anonymous: boolean;
  onAnonymousChange: (v: boolean) => void;
  investorIsMappedToProfile: boolean;
  answers: Record<string, string | string[]>;
  selectedTags: string[];
  firmName: string;
}) {
  const draft = deriveReviewDraftFromAnswers(answers, selectedTags, investorIsMappedToProfile);
  const summaryBits: string[] = [];
  if (investorIsMappedToProfile) {
    summaryBits.push(formatEvaluationSectionLinked(answers));
    if (draft.tags.length) summaryBits.push(formatTags(draft.tags));
  } else {
    summaryBits.push(formatContextSectionUnlinked(answers, draft));
    summaryBits.push(formatEvaluationSectionUnlinked(answers));
    if (selectedTags.length) summaryBits.push(formatTags(selectedTags));
  }

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <p className="text-xs font-bold text-foreground">
          Anything another founder should know?{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </p>
        <Textarea
          value={note}
          onChange={(e) => onNoteChange(e.target.value)}
          placeholder='e.g. "Partner gave sharp GTM feedback…"'
          rows={3}
          maxLength={500}
          className="resize-none text-sm min-h-[4.5rem]"
        />
        <span className="text-[10px] text-muted-foreground tabular-nums">{note.length}/500</span>
      </section>
      <div className="rounded-lg border border-border/60 bg-card/50 p-3 space-y-1.5">
        <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Final summary
        </p>
        <p className="text-xs text-foreground leading-relaxed">{summaryBits.filter(Boolean).join(" · ")}</p>
      </div>
      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="space-y-0.5 min-w-0">
          <Label htmlFor="review-anon" className="text-sm font-semibold text-foreground cursor-pointer">
            Submit anonymously
          </Label>
          <p className="text-[10px] text-muted-foreground">
            {anonymous
              ? "Your name won't appear on the public feed."
              : "Your name may be visible to verified founders."}
          </p>
        </div>
        <Switch id="review-anon" checked={anonymous} onCheckedChange={onAnonymousChange} />
      </div>
    </div>
  );
}

export function ReviewWizardMain({
  currentStep,
  stepContent,
  summary,
}: {
  currentStep: ReviewStep;
  stepContent: ReactNode;
  summary: ReactNode;
}) {
  const mainRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={mainRef}
      className="flex-1 min-h-0 flex flex-col lg:flex-row gap-0 lg:gap-0 overflow-hidden"
    >
      <div
        className="flex-1 min-h-0 min-w-0 overflow-y-auto px-5 py-4 lg:py-5 lg:pr-4 [scrollbar-gutter:stable]"
        tabIndex={-1}
        data-review-wizard-step={currentStep}
      >
        <div className="max-w-xl mx-auto lg:mx-0">{stepContent}</div>
      </div>
      <div className="hidden lg:flex lg:w-[280px] xl:w-[300px] shrink-0 border-l border-border/60 bg-secondary/5 overflow-y-auto px-4 py-5">
        {summary}
      </div>
      <div className="lg:hidden border-t border-border/60 px-5 py-3 bg-secondary/10 shrink-0 max-h-[40vh] overflow-y-auto">
        {summary}
      </div>
    </div>
  );
}
