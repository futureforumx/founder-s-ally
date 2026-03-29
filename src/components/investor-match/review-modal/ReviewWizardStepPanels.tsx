import type { ReactNode } from "react";
import {
  CalendarDays,
  Check,
  Handshake,
  Inbox,
  Link2,
  Mail,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Send,
  Share2,
  Users,
  UsersRound,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import type { FormQuestion, ReviewFormConfig } from "@/lib/buildReviewFormConfig";
import {
  EngageSentimentScale,
  OverallInteractionScale,
} from "@/components/investor-match/review-modal/ReviewWizardParts";
// Imports removed for unused functions (replaced with direct logic)
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SmartCombobox, type ComboboxOption } from "@/components/ui/smart-combobox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { RELATIONSHIP_ORIGIN_OTHER_SUGGESTIONS } from "@/lib/reviewFormContent";
import { cn } from "@/lib/utils";
import {
  reviewWizardChipFocus,
  reviewWizardChipIdle,
  reviewWizardChipSelected,
  reviewWizardOptionRow,
  reviewWizardOptionRowBtn,
  reviewWizardOptionRowBtnCompact,
  reviewWizardOptionRowCompact,
  reviewWizardQuestionLabelClass,
} from "@/components/investor-match/review-modal/reviewWizardUi";

const UNLINKED_CONTEXT_TEXT_IDS = new Set([
  "interaction_intro_other",
  "interaction_cold_inbound_social_other",
  "interaction_event_type_other",
]);

const RELATIONSHIP_ORIGIN_OTHER_COMBO_OPTIONS: ComboboxOption[] =
  RELATIONSHIP_ORIGIN_OTHER_SUGGESTIONS.map((s) => ({ value: s, label: s }));

function RelationshipOriginOtherField({
  value,
  onChange,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  return (
    <SmartCombobox
      value={value}
      onChange={onChange}
      options={RELATIONSHIP_ORIGIN_OTHER_COMBO_OPTIONS}
      placeholder="Select a suggestion or type your own"
      required
      maxLength={200}
      className={cn(
        "w-full max-w-md",
        compact && "[&_input]:h-8 [&_input]:py-1 [&_input]:text-xs",
      )}
    />
  );
}

const REMEMBER_WHO_LEVEL_OPTIONS = [
  "Associate",
  "Principal",
  "General Partner",
  "Managing Partner",
] as const;

const RELATIONSHIP_ORIGIN_ICONS: Record<string, LucideIcon> = {
  "Warm intro": Handshake,
  "Cold inbound": Inbox,
  "Cold outbound": Send,
  Event: CalendarDays,
  Community: UsersRound,
  "Existing relationship": Link2,
  Other: MoreHorizontal,
};

function RelationshipOriginSelect({
  options,
  value,
  onChange,
  compact,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid w-full grid-cols-4",
        compact ? "gap-1.5" : "gap-2",
      )}
      role="listbox"
      aria-label="Relationship origin"
    >
      {options.map((opt) => {
        const Icon = RELATIONSHIP_ORIGIN_ICONS[opt];
        const selected = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="option"
            aria-selected={selected}
            title={opt}
            onClick={() => onChange(opt)}
            className={cn(
              "flex min-h-0 min-w-0 w-full flex-col items-center justify-center rounded-xl border text-center font-medium transition-all duration-150",
              compact
                ? "gap-0.5 px-1 py-1.5 text-[9px] leading-tight sm:text-[10px]"
                : "gap-1 px-1.5 py-2 text-[10px] leading-tight sm:px-2 sm:py-2 sm:text-[11px]",
              reviewWizardChipFocus,
              selected ? reviewWizardChipSelected : reviewWizardChipIdle,
            )}
          >
            {Icon ? (
              <Icon
                className={cn("shrink-0 opacity-90", compact ? "h-3 w-3" : "h-3.5 w-3.5")}
                aria-hidden
              />
            ) : null}
            <span className="max-w-full [text-wrap:balance]">{opt}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Yes / No with check and × for event follow-up question. */
function EventFollowUpYesNoSelect({
  options,
  value,
  onChange,
  compact,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  const iconFor = (opt: string): LucideIcon | null => {
    if (opt === "Yes") return Check;
    if (opt === "No") return X;
    return null;
  };

  return (
    <div
      className={compact ? reviewWizardOptionRowCompact : reviewWizardOptionRow}
      role="listbox"
      aria-label="Follow-up after the event"
    >
      {options.map((opt) => {
        const Icon = iconFor(opt);
        const selected = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="option"
            aria-selected={selected}
            aria-label={opt}
            onClick={() => onChange(opt)}
            className={cn(
              "flex flex-1 flex-col items-center justify-center rounded-lg border px-1 transition-all duration-150",
              compact
                ? "min-h-9 gap-0.5 py-1 sm:min-h-9"
                : "min-h-[2.75rem] gap-1 py-2 sm:min-h-11",
              reviewWizardChipFocus,
              selected ? reviewWizardChipSelected : reviewWizardChipIdle,
            )}
          >
            {Icon ? (
              <Icon
                className={cn("shrink-0 opacity-90", compact ? "h-3 w-3" : "h-3.5 w-3.5")}
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                "font-medium leading-none",
                compact ? "text-[10px] sm:text-[11px]" : "text-[11px] sm:text-xs",
              )}
            >
              {opt}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SingleSelect({
  options,
  value,
  onChange,
  ariaLabel,
  compact,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
  /** Falls back to first option context. */
  ariaLabel?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={compact ? reviewWizardOptionRowCompact : reviewWizardOptionRow}
      role="listbox"
      aria-label={ariaLabel ?? "Choose one"}
    >
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          role="option"
          aria-selected={value === opt}
          title={opt}
          onClick={() => onChange(opt)}
          className={cn(
            compact ? reviewWizardOptionRowBtnCompact : reviewWizardOptionRowBtn,
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

const INTERACTION_HOW_ICONS: Record<string, LucideIcon> = {
  "In-Person": MapPin,
  Video,
  Group: Users,
  "1:1": MessageSquare,
  Email: Mail,
  Social: Share2,
  Phone,
};

function InteractionHowMultiSelect({
  options,
  selected,
  onChange,
  compact,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  compact?: boolean;
}) {
  const toggle = (opt: string) => {
    onChange(
      selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt],
    );
  };

  return (
    <div
      className={compact ? reviewWizardOptionRowCompact : reviewWizardOptionRow}
      role="group"
      aria-label="How did you interact"
    >
      {options.map((opt) => {
        const Icon = INTERACTION_HOW_ICONS[opt];
        const isOn = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={isOn}
            aria-label={opt}
            title={opt}
            onClick={() => toggle(opt)}
            className={cn(
              "flex min-w-0 flex-1 flex-col items-center justify-center rounded-lg border text-center transition-all duration-150",
              compact
                ? "min-h-10 gap-0 px-0.5 py-1 sm:min-h-10 sm:py-1"
                : "min-h-[3.25rem] gap-0.5 px-0.5 py-1.5 sm:min-h-[3.5rem] sm:gap-1 sm:px-1",
              reviewWizardChipFocus,
              isOn ? reviewWizardChipSelected : reviewWizardChipIdle,
            )}
          >
            {Icon ? (
              <Icon
                className={cn(
                  "shrink-0 opacity-90",
                  compact ? "h-2.5 w-2.5 sm:h-3 sm:w-3" : "h-3 w-3 sm:h-3.5 sm:w-3.5",
                )}
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                "font-medium leading-tight",
                compact ? "text-[8px] sm:text-[9px]" : "text-[9px] sm:text-[10px]",
              )}
            >
              {opt}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function MultiSelect({
  options,
  selected,
  onChange,
  ariaLabel,
  compact,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  ariaLabel?: string;
  compact?: boolean;
}) {
  const toggle = (opt: string) => {
    onChange(
      selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt],
    );
  };

  return (
    <div
      className={compact ? reviewWizardOptionRowCompact : reviewWizardOptionRow}
      role="group"
      aria-label={ariaLabel ?? "Select any"}
    >
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          aria-pressed={selected.includes(opt)}
          title={opt}
          onClick={() => toggle(opt)}
          className={cn(
            compact ? reviewWizardOptionRowBtnCompact : reviewWizardOptionRowBtn,
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

function QuestionBlock({
  index,
  label,
  optional,
  children,
  showIndex = true,
  compact,
}: {
  index: number;
  label: string;
  optional?: boolean;
  children: ReactNode;
  /** When false, only the label row is shown (e.g. sub-prompts under a numbered section). */
  showIndex?: boolean;
  compact?: boolean;
}) {
  return (
    <section className={compact ? "space-y-1" : "space-y-2"}>
      <p className={cn("flex items-start", compact ? "gap-1" : "gap-1.5")}>
        {showIndex ? (
          <span
            className={cn(
              "font-bold leading-none shrink-0 tabular-nums text-muted-foreground",
              compact ? "text-[10px] pt-0" : "text-[11px] pt-0.5",
            )}
          >
            {index}.
          </span>
        ) : null}
        <span
          className={cn(
            reviewWizardQuestionLabelClass,
            compact && "text-[9px] leading-tight tracking-[0.06em]",
          )}
        >
          <span className="uppercase">{label}</span>
          {optional ? (
            <span className="ml-1.5 font-normal normal-case tracking-normal text-[9px] text-muted-foreground">
              (optional)
            </span>
          ) : null}
        </span>
      </p>
      {children}
    </section>
  );
}

function renderNonTextQuestion(
  q: FormQuestion,
  displayIndex: number,
  answers: Record<string, string | string[]>,
  setAnswer: (id: string, value: string | string[]) => void,
  opts?: { showQuestionNumber?: boolean; compact?: boolean },
) {
  const showQuestionNumber = opts?.showQuestionNumber !== false;
  const compact = opts?.compact === true;
  return (
    <QuestionBlock
      key={q.id}
      index={displayIndex}
      label={q.label}
      optional={q.optional}
      showIndex={showQuestionNumber}
      compact={compact}
    >
      {q.type === "single_select" &&
        (q.id === "interaction_intro" ? (
          <RelationshipOriginSelect
            options={q.options ?? []}
            value={(answers[q.id] as string) ?? null}
            onChange={(v) => setAnswer(q.id, v)}
            compact={compact}
          />
        ) : q.id === "interaction_event_followup" ? (
          <EventFollowUpYesNoSelect
            options={q.options ?? []}
            value={(answers[q.id] as string) ?? null}
            onChange={(v) => setAnswer(q.id, v)}
            compact={compact}
          />
        ) : (
          <SingleSelect
            options={q.options ?? []}
            value={(answers[q.id] as string) ?? null}
            onChange={(v) => setAnswer(q.id, v)}
            ariaLabel={q.label}
            compact={compact}
          />
        ))}
      {q.type === "multi_select" &&
        (q.id === "interaction_how" ? (
          <InteractionHowMultiSelect
            options={q.options ?? []}
            selected={(answers[q.id] as string[]) ?? []}
            onChange={(v) => setAnswer(q.id, v)}
            compact={compact}
          />
        ) : (
          <MultiSelect
            options={q.options ?? []}
            selected={(answers[q.id] as string[]) ?? []}
            onChange={(v) => setAnswer(q.id, v)}
            ariaLabel={q.label}
            compact={compact}
          />
        ))}
      {q.type === "text" && q.id === "interaction_intro_other" && (
        <RelationshipOriginOtherField
          value={(answers.interaction_intro_other as string) ?? ""}
          onChange={(v) => setAnswer("interaction_intro_other", v)}
          compact={compact}
        />
      )}
      {q.type === "text" && q.id !== "interaction_intro_other" && (
        <Input
          value={(answers[q.id] as string) ?? ""}
          onChange={(e) => setAnswer(q.id, e.target.value)}
          className={cn("text-sm max-w-md", compact ? "h-8 text-xs" : "h-9")}
          maxLength={200}
        />
      )}
    </QuestionBlock>
  );
}

function TagSelector({
  tags,
  selected,
  onChange,
}: {
  tags: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (tag: string) =>
    onChange(
      selected.includes(tag) ? selected.filter((t) => t !== tag) : [...selected, tag],
    );

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <p className={cn(reviewWizardQuestionLabelClass, "leading-none")}>Interaction tags</p>
        <span className="text-[9px] font-medium normal-case tracking-normal text-muted-foreground leading-none">
          Select all that apply
        </span>
      </div>
      <div className="flex w-full max-w-full flex-nowrap gap-1 overflow-x-auto py-0.5 [scrollbar-gutter:stable] sm:gap-1.5">
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            aria-pressed={selected.includes(tag)}
            title={tag}
            onClick={() => toggle(tag)}
            className={cn(
              "shrink-0 max-w-[6rem] rounded-lg border px-2 py-2 text-center text-[9px] font-medium leading-tight transition-all duration-150 [text-wrap:balance] sm:max-w-[7rem] sm:px-2.5 sm:text-[10px] sm:leading-snug",
              reviewWizardChipFocus,
              selected.includes(tag) ? reviewWizardChipSelected : reviewWizardChipIdle,
            )}
          >
            {tag}
          </button>
        ))}
      </div>
    </section>
  );
}

export type RememberWhoChipOption = { name: string; vcPersonId?: string };

function RememberWhoInputBlock({
  rememberWho,
  setRememberWho,
  rememberWhoChips,
  applyRememberWhoChip,
  onRememberWhoRoleFallback,
}: {
  rememberWho: string;
  setRememberWho: (v: string) => void;
  rememberWhoChips: RememberWhoChipOption[];
  applyRememberWhoChip: (name: string, vcPersonId?: string) => void;
  onRememberWhoRoleFallback?: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <p className="text-xs font-bold text-foreground leading-none">Remember who?</p>
        <span className="text-[10px] font-medium text-muted-foreground leading-none">Optional</span>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <Input
          value={rememberWho}
          onChange={(e) => setRememberWho(e.target.value)}
          placeholder="Partner, associate, or contact name"
          className="h-9 min-w-0 flex-1 text-sm"
          maxLength={200}
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 whitespace-nowrap px-3 text-xs font-medium sm:h-auto"
            >
              don&apos;t remember?
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="z-[400] w-56">
            <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">I met with a:</p>
            {REMEMBER_WHO_LEVEL_OPTIONS.map((level) => (
              <DropdownMenuItem
                key={level}
                className="text-sm"
                onSelect={() => {
                  setRememberWho(`I met with a: ${level}`);
                  onRememberWhoRoleFallback?.();
                }}
              >
                {level}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <RememberWhoSmartChips chips={rememberWhoChips} onPick={applyRememberWhoChip} />
    </div>
  );
}

function RememberWhoSmartChips({
  chips,
  onPick,
}: {
  chips: RememberWhoChipOption[];
  onPick: (name: string, vcPersonId?: string) => void;
}) {
  if (chips.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-[10px] font-medium text-muted-foreground">People at this firm</p>
      <div className="flex w-full max-w-full flex-nowrap gap-1 overflow-x-auto py-0.5 sm:gap-1.5">
        {chips.map((chip) => (
          <button
            key={chip.vcPersonId ?? chip.name}
            type="button"
            title={chip.name}
            onClick={() => onPick(chip.name, chip.vcPersonId)}
            className={cn(
              "shrink-0 rounded-lg border border-dashed px-2.5 py-1.5 text-[10px] font-medium transition-colors",
              "border-muted-foreground/40 bg-transparent text-muted-foreground",
              "hover:border-primary/35 hover:bg-primary/5 hover:text-foreground",
            )}
          >
            {chip.name}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ReviewWizardLinkedStep1({
  formConfig,
  answers,
  setAnswer,
}: {
  formConfig: ReviewFormConfig;
  answers: Record<string, string | string[]>;
  setAnswer: (id: string, value: string | string[]) => void;
}) {
  return (
    <div className="space-y-6">
      {(["work_with_them_rating", "take_money_again"] as const).map((id, i) => {
        const q = formConfig.questions.find((x) => x.id === id);
        if (!q || q.type === "text") return null;
        return renderNonTextQuestion(q, i + 1, answers, setAnswer);
      })}
    </div>
  );
}

export function ReviewWizardLinkedStep2({
  formConfig,
  answers,
  setAnswer,
  rememberWho,
  setRememberWho,
  rememberWhoChips,
  applyRememberWhoChip,
  onRememberWhoRoleFallback,
}: {
  formConfig: ReviewFormConfig;
  answers: Record<string, string | string[]>;
  setAnswer: (id: string, value: string | string[]) => void;
  rememberWho: string;
  setRememberWho: (v: string) => void;
  rememberWhoChips: RememberWhoChipOption[];
  applyRememberWhoChip: (name: string, vcPersonId?: string) => void;
  onRememberWhoRoleFallback?: () => void;
}) {
  return (
    <div className="space-y-6">
      <RememberWhoInputBlock
        rememberWho={rememberWho}
        setRememberWho={setRememberWho}
        rememberWhoChips={rememberWhoChips}
        applyRememberWhoChip={applyRememberWhoChip}
        onRememberWhoRoleFallback={onRememberWhoRoleFallback}
      />
      {formConfig.questions
        .filter((q) => q.id === "standout_tags")
        .map((q) => renderNonTextQuestion(q, 1, answers, setAnswer))}
    </div>
  );
}

export function ReviewWizardUnlinkedStep1({
  formConfig,
  answers,
  setAnswer,
  firmDisplayName,
}: {
  formConfig: ReviewFormConfig;
  answers: Record<string, string | string[]>;
  setAnswer: (id: string, value: string | string[]) => void;
  /** Resolved firm name for the first question (matches modal header when possible). */
  firmDisplayName: string;
}) {
  const name = firmDisplayName.trim() || "this firm";
  const engageQuestion = formConfig.questions.find((q) => q.id === "would_engage_again");
  const engageOptions = engageQuestion?.options ?? [
    "Definitely yes",
    "Likely yes",
    "Maybe",
    "Probably not",
    "Definitely not",
  ];

  return (
    <div className="space-y-6 lg:space-y-10">
      <section className="space-y-3">
        <p className="text-sm font-bold leading-snug text-foreground">
          <span className="text-muted-foreground">1.</span> How was your experience with {name}?
        </p>
        <OverallInteractionScale
          value={(answers.overall_interaction as string) ?? null}
          onChange={(v) => setAnswer("overall_interaction", v)}
        />
      </section>
      <section className="space-y-3">
        <p className="text-sm font-bold leading-snug text-foreground">
          <span className="text-muted-foreground">2.</span> Would you engage with this investor again?
        </p>
        <EngageSentimentScale
          options={engageOptions}
          value={(answers.would_engage_again as string) ?? null}
          onChange={(v) => setAnswer("would_engage_again", v)}
          ariaLabel="Would you engage with this investor again?"
        />
      </section>
    </div>
  );
}

function unlinkedContextQuestions(
  formConfig: ReviewFormConfig,
  answers: Record<string, string | string[]>,
): FormQuestion[] {
  return formConfig.questions.filter((q) => {
    if (q.type === "text" && q.id !== "founder_note" && !UNLINKED_CONTEXT_TEXT_IDS.has(q.id))
      return false;
    if (
      ["overall_interaction", "would_engage_again", "work_with_them_rating", "take_money_again", "standout_tags"].includes(
        q.id,
      )
    ) {
      return false;
    }

    const intro = answers.interaction_intro as string | undefined;

    if (["interaction_intro"].includes(q.id)) return true;
    if (q.id === "interaction_intro_other" && intro === "Other") return true;

    if (q.id === "interaction_warm_intro_who" && intro === "Warm intro") return true;
    if (q.id === "interaction_cold_inbound_discovery" && intro === "Cold inbound") return true;
    if (
      q.id === "interaction_cold_inbound_social_platform" &&
      ((answers.interaction_cold_inbound_discovery as string) ?? "").toLowerCase() === "social"
    )
      return true;
    if (q.id === "interaction_cold_inbound_social_other" && (answers.interaction_cold_inbound_social_platform as string) === "other")
      return true;

    if (q.id === "interaction_event_type" && intro === "Event") return true;
    if (q.id === "interaction_event_type_other" && (answers.interaction_event_type as string) === "other") return true;
    if (q.id === "interaction_event_followup" && intro === "Event") return true;
    if (
      q.id === "interaction_event_followup_first" &&
      intro === "Event" &&
      (answers.interaction_event_followup as string) === "Yes"
    ) {
      return true;
    }

    if (["interaction_how", "interaction_meeting_depth"].includes(q.id)) return true;

    return false;
  });
}

export function ReviewWizardUnlinkedStep3({
  formConfig,
  answers,
  setAnswer,
}: {
  formConfig: ReviewFormConfig;
  answers: Record<string, string | string[]>;
  setAnswer: (id: string, value: string | string[]) => void;
}) {
  const stepQuestions = unlinkedContextQuestions(formConfig, answers);

  return (
    <div className="space-y-6">
      <section className="space-y-6">
        <p className="text-sm font-bold leading-snug text-foreground">
          <span className="text-muted-foreground">2.</span> Characterize your interaction.
        </p>
        <div className="flex flex-col gap-5 sm:gap-6">
          {stepQuestions.map((q, i) =>
            renderNonTextQuestion(q, i + 1, answers, setAnswer, {
              showQuestionNumber: false,
            }),
          )}
        </div>
      </section>
    </div>
  );
}

export function ReviewWizardUnlinkedStep4({
  formConfig,
  answers,
  selectedTags,
  setSelectedTags,
  rememberWho,
  setRememberWho,
  rememberWhoChips,
  applyRememberWhoChip,
  onRememberWhoRoleFallback,
}: {
  formConfig: ReviewFormConfig;
  answers: Record<string, string | string[]>;
  selectedTags: string[];
  setSelectedTags: (tags: string[]) => void;
  rememberWho: string;
  setRememberWho: (v: string) => void;
  rememberWhoChips: RememberWhoChipOption[];
  applyRememberWhoChip: (name: string, vcPersonId?: string) => void;
  /** Clear linked `vc_person` ids when user picks a seniority instead of a name. */
  onRememberWhoRoleFallback?: () => void;
}) {
  return (
    <div className="space-y-6">
      <p className="text-sm font-bold leading-snug text-foreground">
        <span className="text-muted-foreground">3.</span> People &amp; tags
      </p>
      <RememberWhoInputBlock
        rememberWho={rememberWho}
        setRememberWho={setRememberWho}
        rememberWhoChips={rememberWhoChips}
        applyRememberWhoChip={applyRememberWhoChip}
        onRememberWhoRoleFallback={onRememberWhoRoleFallback}
      />

      <TagSelector tags={formConfig.tags} selected={selectedTags} onChange={setSelectedTags} />
    </div>
  );
}

export function ReviewWizardNoteStep({
  formConfig,
  founderNoteQuestion,
  answers,
  setAnswer,
  showFounderNote,
  anonymous,
  setAnonymous,
}: {
  formConfig: ReviewFormConfig;
  founderNoteQuestion: FormQuestion | undefined;
  answers: Record<string, string | string[]>;
  setAnswer: (id: string, value: string | string[]) => void;
  showFounderNote: boolean;
  anonymous: boolean;
  setAnonymous: (v: boolean) => void;
}) {
  return (
    <div className="space-y-6">
      {showFounderNote && founderNoteQuestion ? (
        <QuestionBlock
          key={founderNoteQuestion.id}
          index={formConfig.questions.findIndex((fq) => fq.id === founderNoteQuestion.id) + 1}
          label={founderNoteQuestion.label}
          optional={founderNoteQuestion.optional}
        >
          <div className="space-y-1">
            <Textarea
              value={(answers[founderNoteQuestion.id] as string) ?? ""}
              onChange={(e) => setAnswer(founderNoteQuestion.id, e.target.value)}
              placeholder='e.g. "Partner gave sharp GTM feedback…"'
              rows={3}
              maxLength={500}
              className="resize-none text-sm"
            />
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {((answers[founderNoteQuestion.id] as string) ?? "").length}/500
            </span>
          </div>
        </QuestionBlock>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Check the summary panel, then submit when you are ready.
      </p>
      <div className="flex items-center justify-between gap-3 pt-4 border-t border-border">
        <div className="space-y-0.5">
          <Label
            htmlFor="review-anon"
            className="text-sm font-semibold text-foreground cursor-pointer"
          >
            Submit anonymously
          </Label>
          <p className="text-[10px] text-muted-foreground">
            {anonymous
              ? "Your name won't appear on the public feed."
              : "Your name may be visible to verified founders."}
          </p>
        </div>
        <Switch id="review-anon" checked={anonymous} onCheckedChange={setAnonymous} />
      </div>
    </div>
  );
}
