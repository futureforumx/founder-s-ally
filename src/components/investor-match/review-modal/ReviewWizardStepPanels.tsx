import type { ReactNode } from "react";
import type { FormQuestion, ReviewFormConfig } from "@/lib/buildReviewFormConfig";
import {
  shouldShowFollowUpAfterEventQuestion,
  shouldShowRememberWhoSection,
} from "@/lib/buildReviewFormConfig";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function SingleSelect({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150",
            value === opt
              ? "border-accent bg-accent/10 text-accent"
              : "border-border bg-secondary/40 text-muted-foreground hover:border-accent/40 hover:bg-secondary/70",
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function MultiSelect({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (opt: string) => {
    onChange(
      selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt],
    );
  };

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => toggle(opt)}
          className={cn(
            "px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150",
            selected.includes(opt)
              ? "border-accent bg-accent/10 text-accent"
              : "border-border bg-secondary/40 text-muted-foreground hover:border-accent/40 hover:bg-secondary/70",
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
}: {
  index: number;
  label: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <p className="text-xs font-bold text-foreground flex items-start gap-1.5">
        <span className="text-base leading-none shrink-0">{index}.</span>
        <span>
          {label}
          {optional && (
            <span className="font-normal text-muted-foreground ml-1">(optional)</span>
          )}
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
) {
  return (
    <QuestionBlock key={q.id} index={displayIndex} label={q.label} optional={q.optional}>
      {q.type === "single_select" && (
        <SingleSelect
          options={q.options ?? []}
          value={(answers[q.id] as string) ?? null}
          onChange={(v) => setAnswer(q.id, v)}
        />
      )}
      {q.type === "multi_select" && (
        <MultiSelect
          options={q.options ?? []}
          selected={(answers[q.id] as string[]) ?? []}
          onChange={(v) => setAnswer(q.id, v)}
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
        <p className="text-xs font-bold text-foreground leading-none">How did you interact?</p>
        <span className="text-[10px] font-medium text-muted-foreground leading-none">
          Select all that apply
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <button
            key={tag}
            type="button"
            onClick={() => toggle(tag)}
            className={cn(
              "px-2.5 py-1 rounded-md text-[11px] font-medium border transition-all duration-150",
              selected.includes(tag)
                ? "border-warning/60 bg-warning/10 text-warning-foreground"
                : "border-border bg-secondary/30 text-muted-foreground hover:border-warning/30 hover:bg-secondary/60",
            )}
          >
            {tag}
          </button>
        ))}
      </div>
    </section>
  );
}

function RememberWhoSmartChips({
  names,
  onPick,
}: {
  names: string[];
  onPick: (name: string) => void;
}) {
  if (names.length === 0) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <p className="text-[10px] font-medium text-muted-foreground">Popular investors</p>
      <div className="flex flex-wrap gap-1.5">
        {names.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onPick(name)}
            className={cn(
              "rounded-full border border-dashed px-2.5 py-1 text-[11px] font-medium transition-colors",
              "border-muted-foreground/40 bg-transparent text-muted-foreground",
              "hover:border-accent/55 hover:bg-accent/5 hover:text-foreground",
            )}
          >
            {name}
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
}: {
  formConfig: ReviewFormConfig;
  answers: Record<string, string | string[]>;
  setAnswer: (id: string, value: string | string[]) => void;
}) {
  return (
    <div className="space-y-6">
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
  selectedTags,
  setSelectedTags,
  rememberWho,
  setRememberWho,
  rememberWhoChipNames,
  applyRememberWhoChip,
}: {
  formConfig: ReviewFormConfig;
  answers: Record<string, string | string[]>;
  setAnswer: (id: string, value: string | string[]) => void;
  selectedTags: string[];
  setSelectedTags: (v: string[]) => void;
  rememberWho: string;
  setRememberWho: (v: string) => void;
  rememberWhoChipNames: string[];
  applyRememberWhoChip: (name: string) => void;
}) {
  return (
    <div className="space-y-6">
      {formConfig.questions
        .filter((q) => q.type !== "text")
        .filter(
          (q) =>
            q.id === "interaction_type" ||
            (q.id === "follow_up_after_event" && shouldShowFollowUpAfterEventQuestion(answers)),
        )
        .map((q, i) => renderNonTextQuestion(q, i + 1, answers, setAnswer))}
      <TagSelector tags={formConfig.tags} selected={selectedTags} onChange={setSelectedTags} />
      {shouldShowRememberWhoSection(selectedTags) ? (
        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <p className="text-xs font-bold text-foreground leading-none">Remember who?</p>
            <span className="text-[10px] font-medium text-muted-foreground leading-none">
              Optional
            </span>
          </div>
          <Input
            value={rememberWho}
            onChange={(e) => setRememberWho(e.target.value)}
            placeholder="Partner, associate, or contact name"
            className="h-9 text-sm"
            maxLength={200}
          />
          <RememberWhoSmartChips names={rememberWhoChipNames} onPick={applyRememberWhoChip} />
        </section>
      ) : null}
    </div>
  );
}

export function ReviewWizardUnlinkedStep2({
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
      {formConfig.questions
        .filter((q) => ["overall_interaction", "response_time", "would_engage_again"].includes(q.id))
        .map((q, i) => renderNonTextQuestion(q, i + 1, answers, setAnswer))}
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
