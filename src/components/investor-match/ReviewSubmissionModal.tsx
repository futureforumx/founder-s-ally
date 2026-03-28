import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, CheckCircle2, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase, supabaseVcDirectory } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import {
  buildReviewFormConfig,
  deriveNonInvestorScores,
  deriveInvestorScores,
} from "@/lib/buildReviewFormConfig";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ReviewSubmissionModalProps {
  open: boolean;
  onClose: () => void;
  firmName: string;
  /** `vc_firms.id` from the VC directory — used as FK in vc_ratings */
  vcFirmId?: string | null;
  /** Partner id (`vc_people.id`) — omit for firm-level rating */
  personId?: string;
  personName?: string;
  /**
   * Whether this firm is already mapped to the founder's company profile
   * (i.e., appears in their cap_table).
   *   true  → show investor relationship review
   *   false → show non-investor interaction review
   */
  investorIsMappedToProfile: boolean;
  /** cap_table.id of the matching row — null when not mapped */
  mappingRecordId: string | null;
  /** Founder's company id — stored in star_ratings JSONB for traceability */
  companyId?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function resolveVcFirmId(
  firmName: string,
  hint: string | null | undefined,
): Promise<string | null> {
  const trimmed = hint?.trim();
  if (trimmed) return trimmed;
  const { data, error } = await (
    supabaseVcDirectory as unknown as { from: (t: string) => any }
  )
    .from("vc_firms")
    .select("id")
    .ilike("firm_name", firmName.trim())
    .limit(1);
  if (error || !data?.[0]?.id) return null;
  return data[0].id as string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

/** Single-select radio pill group */
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

/** Multi-select toggle chip group */
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
      selected.includes(opt)
        ? selected.filter((s) => s !== opt)
        : [...selected, opt],
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

/** Numbered question block */
function QuestionBlock({
  index,
  label,
  optional,
  children,
}: {
  index: number;
  label: string;
  optional?: boolean;
  children: React.ReactNode;
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

// ─────────────────────────────────────────────────────────────────────────────
// Tag selector (non-investor form only)
// ─────────────────────────────────────────────────────────────────────────────

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
      selected.includes(tag)
        ? selected.filter((t) => t !== tag)
        : [...selected, tag],
    );

  return (
    <section className="space-y-2">
      <p className="text-xs font-bold text-foreground">Tags</p>
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

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ReviewSubmissionModal({
  open,
  onClose,
  firmName,
  vcFirmId,
  personId = "",
  personName,
  investorIsMappedToProfile,
  mappingRecordId,
  companyId = "",
}: ReviewSubmissionModalProps) {
  const { user } = useAuth();

  // Build form config from the mapping decision
  const formConfig = useMemo(
    () =>
      buildReviewFormConfig({
        firm_id: vcFirmId ?? "",
        company_id: companyId || user?.id || "",
        mapping_record_id: mappingRecordId,
        investor_is_mapped_to_profile: investorIsMappedToProfile,
        firm_name: firmName,
      }),
    [vcFirmId, companyId, mappingRecordId, investorIsMappedToProfile, firmName, user?.id],
  );

  // ── Answer state ──────────────────────────────────────────────────────────
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [anonymous, setAnonymous] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const setAnswer = useCallback((id: string, value: string | string[]) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }, []);

  // ── Reset on close ────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setAnswers({});
    setSelectedTags([]);
    setAnonymous(true);
    setSubmitted(false);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  // ── Validation ────────────────────────────────────────────────────────────
  const canSubmit = useMemo(() => {
    if (investorIsMappedToProfile) {
      // Investor form: Q1 + Q2 required
      return (
        typeof answers.work_with_them_rating === "string" &&
        answers.work_with_them_rating.length > 0 &&
        typeof answers.take_money_again === "string" &&
        answers.take_money_again.length > 0
      );
    } else {
      // Non-investor form: Q1–Q4 required
      return (
        typeof answers.interaction_type === "string" &&
        answers.interaction_type.length > 0 &&
        typeof answers.overall_interaction === "string" &&
        answers.overall_interaction.length > 0 &&
        typeof answers.response_time === "string" &&
        answers.response_time.length > 0 &&
        typeof answers.would_engage_again === "string" &&
        answers.would_engage_again.length > 0
      );
    }
  }, [answers, investorIsMappedToProfile]);

  // ── Submission ────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    setSubmitting(true);

    try {
      const resolvedFirmId = await resolveVcFirmId(firmName, vcFirmId);
      if (!resolvedFirmId) {
        throw new Error(
          "Could not resolve this firm in the VC directory. Open the investor from search so we have a match.",
        );
      }

      const pid = personId?.trim() || null;

      // Build structured payload stored in star_ratings JSONB
      const structuredAnswers = {
        form_version: "v2",
        review_type: formConfig.review_type,
        answers,
        tags: selectedTags,
      };

      // Derive legacy score columns for backward-compat with aggregation
      const scores = investorIsMappedToProfile
        ? deriveInvestorScores(answers)
        : deriveNonInvestorScores(answers);

      // interaction_type column: map the display answer to a key
      const interactionTypeValue = investorIsMappedToProfile
        ? "investor_relationship"
        : deriveInteractionTypeKey(answers.interaction_type as string);

      const payload = {
        author_user_id: user.id,
        vc_firm_id: resolvedFirmId,
        vc_person_id: pid,
        interaction_type: interactionTypeValue,
        interaction_detail: null,
        interaction_date: null,
        ...scores,
        comment: (answers.founder_note as string | undefined)?.trim() || null,
        anonymous,
        verified: false,
        star_ratings: structuredAnswers,
      };

      const { error } = await supabase.from("vc_ratings").insert(payload);
      if (error) throw error;

      setSubmitted(true);
      toast.success(
        anonymous
          ? "Thanks — your rating was submitted anonymously."
          : "Thanks — your rating was submitted.",
      );

      setTimeout(() => handleClose(), 1800);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit rating");
    } finally {
      setSubmitting(false);
    }
  };

  const subjectLine = personName ? `${personName} · ${firmName}` : firmName;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[60] bg-foreground/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              className="pointer-events-auto w-full max-w-lg max-h-[90vh] flex flex-col bg-card rounded-2xl border border-border shadow-2xl overflow-hidden"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-secondary/20 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-warning/10 shrink-0">
                    <Star className="h-4 w-4 text-warning" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-foreground truncate">
                      {formConfig.title}
                    </h3>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {subjectLine}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors shrink-0"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {/* Body */}
              {submitted ? (
                <SuccessState />
              ) : (
                <>
                  <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
                    {formConfig.questions.map((q, i) => (
                      <QuestionBlock
                        key={q.id}
                        index={i + 1}
                        label={q.label}
                        optional={q.optional}
                      >
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

                        {q.type === "text" && (
                          <div className="space-y-1">
                            <Textarea
                              value={(answers[q.id] as string) ?? ""}
                              onChange={(e) => setAnswer(q.id, e.target.value)}
                              placeholder='e.g. "Partner gave sharp GTM feedback…"'
                              rows={3}
                              maxLength={500}
                              className="resize-none text-sm"
                            />
                            <span className="text-[10px] text-muted-foreground tabular-nums">
                              {((answers[q.id] as string) ?? "").length}/500
                            </span>
                          </div>
                        )}
                      </QuestionBlock>
                    ))}

                    {/* Tag selector — only for non-investor form */}
                    {!investorIsMappedToProfile && (
                      <TagSelector
                        tags={formConfig.tags}
                        selected={selectedTags}
                        onChange={setSelectedTags}
                      />
                    )}

                    {/* Anonymous toggle */}
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
                      <Switch
                        id="review-anon"
                        checked={anonymous}
                        onCheckedChange={setAnonymous}
                      />
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border bg-secondary/10 shrink-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleClose}
                      className="text-muted-foreground"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSubmit}
                      disabled={!canSubmit || submitting}
                      className="gap-1.5 bg-accent text-accent-foreground hover:bg-accent/90 px-5"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting…
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5" /> Submit
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Success state
// ─────────────────────────────────────────────────────────────────────────────

function SuccessState() {
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-16 px-6"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/10 mb-4">
        <CheckCircle2 className="h-8 w-8 text-success" />
      </div>
      <h3 className="text-lg font-bold text-foreground mb-1">Thank you</h3>
      <p className="text-sm text-muted-foreground text-center">
        Your feedback helps founders choose the right investors.
      </p>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: map display label → interaction_type DB key
// ─────────────────────────────────────────────────────────────────────────────

function deriveInteractionTypeKey(label: string | undefined): string {
  switch (label) {
    case "Took meeting/call":
      return "meeting";
    case "Sent email/warm intro":
      return "email";
    case "Got intro":
      return "intro";
    case "Passed after meeting":
      return "passed";
    case "Ongoing conversation":
      return "ongoing";
    default:
      return "other";
  }
}
