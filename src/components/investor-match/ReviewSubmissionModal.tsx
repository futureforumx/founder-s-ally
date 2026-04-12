import { useState, useMemo, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase, supabaseVcDirectory } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { FirmLogo } from "@/components/ui/firm-logo";
import {
  buildReviewFormConfig,
  deriveNonInvestorScores,
  deriveInvestorScores,
  shouldShowFollowUpAfterEventQuestion,
} from "@/lib/buildReviewFormConfig";
import {
  canAdvanceWizardStep,
  formatLinkedEvaluationSummary,
  formatNoteSummary,
  formatTagsSummary,
  formatUnlinkedContextSummary,
  formatUnlinkedEvaluationSummary,
  type ReviewWizardStep,
} from "@/lib/reviewModalWizard";
import {
  ReviewWizardBody,
  ReviewWizardFooter,
  ReviewWizardProgressBar,
  ReviewWizardSummaryPanel,
} from "./review-modal/ReviewWizardSections";
import {
  ReviewWizardLinkedStep1,
  ReviewWizardLinkedStep2,
  ReviewWizardNoteStep,
  ReviewWizardUnlinkedStep1,
  ReviewWizardUnlinkedStep2,
} from "./review-modal/ReviewWizardStepPanels";

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

export interface ReviewSubmissionModalProps {
  open: boolean;
  onClose: () => void;
  firmName: string;
  /** Firm mark for the header; if omitted and `vcFirmId` is set, logo is loaded from the directory. */
  firmLogoUrl?: string | null;
  /** Helps resolve brand logo when `firmLogoUrl` is missing (Clearbit / known domains). */
  firmWebsiteUrl?: string | null;
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

/** Widely searched partners — dashed chips under Remember who (deduped with firm context). */
const POPULAR_INVESTOR_CHIPS = [
  "Marc Andreessen",
  "Ben Horowitz",
  "Reid Hoffman",
  "Roelof Botha",
  "Alfred Lin",
  "Mary Meeker",
  "Bill Gurley",
  "Ann Miura-Ko",
  "Aileen Lee",
  "Jenny Lee",
  "Kirsten Green",
  "Keith Rabois",
] as const;

function formatVcPersonChipName(row: {
  preferred_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string | null {
  const pref = row.preferred_name?.trim();
  if (pref) return pref;
  const a = row.first_name?.trim() ?? "";
  const b = row.last_name?.trim() ?? "";
  const full = `${a} ${b}`.trim();
  return full.length > 0 ? full : null;
}

async function resolveVcFirmId(
  firmName: string,
  hint: string | null | undefined,
): Promise<string | null> {
  const trimmed = hint?.trim();
  if (trimmed) return trimmed;
  const name = firmName.trim();
  // Try vc_firms first (VC directory)
  const { data: vcData, error: vcError } = await (
    supabaseVcDirectory as unknown as { from: (t: string) => any }
  )
    .from("vc_firms")
    .select("id")
    .ilike("firm_name", name)
    .limit(1);
  if (!vcError && vcData?.[0]?.id) return vcData[0].id as string;
  // Fallback: try investor_database (main app table)
  const { data: dbData, error: dbError } = await supabase
    .from("investor_database")
    .select("id")
    .ilike("firm_name", name)
    .limit(1);
  if (!dbError && (dbData as any)?.[0]?.id) return (dbData as any)[0].id as string;
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ReviewSubmissionModal({
  open,
  onClose,
  firmName,
  firmLogoUrl: firmLogoUrlProp,
  firmWebsiteUrl,
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
  const [rememberWho, setRememberWho] = useState("");
  const [firmPartnerNames, setFirmPartnerNames] = useState<string[]>([]);
  const [anonymous, setAnonymous] = useState(true);
  const [currentStep, setCurrentStep] = useState<ReviewWizardStep>(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fetchedHeaderFirm, setFetchedHeaderFirm] = useState<{
    logo: string | null;
    website: string | null;
    name: string | null;
  } | null>(null);

  const logoUrlFromProp = useMemo(() => {
    if (firmLogoUrlProp == null) return null;
    const t = String(firmLogoUrlProp).trim();
    return t.length > 0 ? t : null;
  }, [firmLogoUrlProp]);

  const rememberWhoChipNames = useMemo(() => {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (raw: string | null | undefined) => {
      const t = raw?.trim();
      if (!t) return;
      const k = t.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push(t);
    };
    add(personName);
    for (const n of firmPartnerNames) add(n);
    for (const n of POPULAR_INVESTOR_CHIPS) {
      if (out.length >= 14) break;
      add(n);
    }
    return out;
  }, [personName, firmPartnerNames]);

  const applyRememberWhoChip = useCallback((name: string) => {
    setRememberWho((prev) => {
      const t = prev.trim();
      if (!t) return name;
      if (t.toLowerCase().includes(name.toLowerCase())) return t;
      return `${t}, ${name}`;
    });
  }, []);

  useEffect(() => {
    if (!open || !vcFirmId) {
      setFirmPartnerNames([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await (supabaseVcDirectory as unknown as { from: (t: string) => any })
          .from("vc_people")
          .select("first_name, last_name, preferred_name")
          .eq("firm_id", vcFirmId)
          .is("deleted_at", null)
          .limit(12);
        if (cancelled || error) return;
        const names = (data ?? [])
          .map((row: { first_name?: string; last_name?: string; preferred_name?: string }) =>
            formatVcPersonChipName(row),
          )
          .filter((n: string | null): n is string => Boolean(n));
        const uniq: string[] = [];
        const s = new Set<string>();
        for (const n of names) {
          const k = n.toLowerCase();
          if (s.has(k)) continue;
          s.add(k);
          uniq.push(n);
        }
        if (!cancelled) setFirmPartnerNames(uniq);
      } catch {
        if (!cancelled) setFirmPartnerNames([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, vcFirmId]);

  useEffect(() => {
    if (!open) {
      setFetchedHeaderFirm(null);
      return;
    }
    if (logoUrlFromProp && firmName.trim()) {
      setFetchedHeaderFirm(null);
      return;
    }
    if (!vcFirmId) {
      setFetchedHeaderFirm(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await (supabaseVcDirectory as unknown as { from: (t: string) => any })
          .from("vc_firms")
          .select("firm_name, logo_url, website_url")
          .eq("id", vcFirmId)
          .is("deleted_at", null)
          .maybeSingle();
        if (cancelled || error) return;
        const logo =
          typeof data?.logo_url === "string" && data.logo_url.trim().length > 0 ? data.logo_url.trim() : null;
        const website =
          typeof data?.website_url === "string" && data.website_url.trim().length > 0
            ? data.website_url.trim()
            : null;
        const name =
          typeof data?.firm_name === "string" && data.firm_name.trim().length > 0
            ? data.firm_name.trim()
            : null;
        if (!cancelled) setFetchedHeaderFirm({ logo, website, name });
      } catch {
        if (!cancelled) setFetchedHeaderFirm(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, vcFirmId, logoUrlFromProp, firmName]);

  const headerLogoUrlResolved = logoUrlFromProp ?? fetchedHeaderFirm?.logo ?? null;
  const headerWebsiteResolved =
    (firmWebsiteUrl && firmWebsiteUrl.trim()) || fetchedHeaderFirm?.website || undefined;
  const headerFirmDisplayName =
    (firmName && firmName.trim()) || fetchedHeaderFirm?.name?.trim() || "Firm";

  const setAnswer = useCallback((id: string, value: string | string[]) => {
    setAnswers((prev) => {
      const next: Record<string, string | string[]> = { ...prev, [id]: value };
      if (id === "interaction_type" && prev.interaction_type !== value) {
        delete next.follow_up_after_event;
      }
      return next;
    });
  }, []);

  // ── Reset on close ────────────────────────────────────────────────────────
  const reset = useCallback(() => {
    setAnswers({});
    setSelectedTags([]);
    setRememberWho("");
    setFirmPartnerNames([]);
    setFetchedHeaderFirm(null);
    setAnonymous(true);
    setCurrentStep(1);
    setSubmitted(false);
  }, []);

  useEffect(() => {
    if (!investorIsMappedToProfile && selectedTags.length === 0) {
      setRememberWho("");
      setAnswers((prev) => {
        if (!prev.founder_note) return prev;
        const next = { ...prev };
        delete next.founder_note;
        return next;
      });
    }
  }, [selectedTags.length, investorIsMappedToProfile]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const showFounderNote = investorIsMappedToProfile || selectedTags.length > 0;

  const founderNoteQuestion = useMemo(
    () => formConfig.questions.find((q) => q.id === "founder_note"),
    [formConfig.questions],
  );

  const onWizardNext = useCallback(() => {
    setCurrentStep((s) => (s < 3 ? ((s + 1) as ReviewWizardStep) : s));
  }, []);

  const onWizardBack = useCallback(() => {
    setCurrentStep((s) => (s > 1 ? ((s - 1) as ReviewWizardStep) : s));
  }, []);

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
      const followUpVisible = shouldShowFollowUpAfterEventQuestion(answers);
      const followUpOk =
        !followUpVisible ||
        (typeof answers.follow_up_after_event === "string" &&
          answers.follow_up_after_event.length > 0);
      // Non-investor form: interaction type + follow-up (when shown) + Q3–Q5 required
      return (
        typeof answers.interaction_type === "string" &&
        answers.interaction_type.length > 0 &&
        followUpOk &&
        typeof answers.overall_interaction === "string" &&
        answers.overall_interaction.length > 0 &&
        typeof answers.response_time === "string" &&
        answers.response_time.length > 0 &&
        typeof answers.would_engage_again === "string" &&
        answers.would_engage_again.length > 0
      );
    }
  }, [answers, investorIsMappedToProfile]);

  const canGoNext = useMemo(
    () => canAdvanceWizardStep(currentStep, investorIsMappedToProfile, answers),
    [currentStep, investorIsMappedToProfile, answers],
  );

  const founderNoteVal = (answers.founder_note as string) ?? "";

  const summaryAside = useMemo(() => {
    const standout = (Array.isArray(answers.standout_tags) ? answers.standout_tags : []) as string[];
    if (investorIsMappedToProfile) {
      return (
        <ReviewWizardSummaryPanel
          investorIsMappedToProfile
          contextLine={formatLinkedEvaluationSummary(answers)}
          evaluationLine={formatTagsSummary(standout)}
          noteLine={formatNoteSummary(founderNoteVal)}
        />
      );
    }
    return (
      <ReviewWizardSummaryPanel
        investorIsMappedToProfile={false}
        contextLine={formatUnlinkedContextSummary(answers, rememberWho)}
        evaluationLine={formatUnlinkedEvaluationSummary(answers)}
        tagsLine={formatTagsSummary(selectedTags)}
        noteLine={formatNoteSummary(founderNoteVal)}
      />
    );
  }, [investorIsMappedToProfile, answers, rememberWho, selectedTags, founderNoteVal]);

  useEffect(() => {
    if (!open || submitted) return;
    const id = requestAnimationFrame(() => {
      const el = document.querySelector("[data-review-wizard-step]");
      if (el instanceof HTMLElement) el.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [currentStep, open, submitted]);

  // ── Submission ────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!user) {
      toast.error("Sign in to submit a review.");
      return;
    }
    if (!canSubmit) return;
    setSubmitting(true);

    try {
      const resolvedFirmId = await resolveVcFirmId(firmName, vcFirmId);

      const pid = personId?.trim() || null;

      // Build structured payload stored in star_ratings JSONB
      const structuredAnswers = {
        form_version: "v2",
        review_type: formConfig.review_type,
        answers,
        tags: selectedTags,
        remember_who: rememberWho.trim() || undefined,
        // Preserve firm name so ratings can be linked even when vc_firm_id is null
        firm_name: firmName.trim() || undefined,
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

  const modalLayer = (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop — portaled to body so we are not clipped/stacked under main / other modals */}
          <motion.div
            className="fixed inset-0 z-[300] bg-foreground/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-[310] flex items-start justify-center overflow-y-auto p-4 pt-8 sm:pt-10 pointer-events-none">
            <motion.div
              data-vekta-review-modal="true"
              className="pointer-events-auto flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl"
              style={{
                // Definite height so nested flex-1 / min-h-0 scroll regions work (max-h-only flex parents collapse).
                height: "min(90dvh, calc(100dvh - 2.5rem))",
                maxHeight: "min(90dvh, calc(100dvh - 2.5rem))",
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-border bg-secondary/20 px-5 py-4">
                <div className="flex items-center gap-3 min-w-0">
                  <FirmLogo
                    firmName={headerFirmDisplayName}
                    logoUrl={headerLogoUrlResolved}
                    websiteUrl={headerWebsiteResolved}
                    size="md"
                    className="bg-background"
                  />
                  <h3 className="text-sm font-bold text-foreground truncate min-w-0">{headerFirmDisplayName}</h3>
                </div>
                <button
                  type="button"
                  onClick={handleClose}
                  className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-secondary transition-colors shrink-0"
                >
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>

              {submitted ? (
                <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
                  <SuccessState />
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div className="shrink-0 border-b border-border/60 bg-secondary/10 px-5 pb-3 pt-1">
                    <ReviewWizardProgressBar step={currentStep} />
                  </div>

                  <ReviewWizardBody step={currentStep} summary={summaryAside}>
                    {investorIsMappedToProfile ? (
                      <>
                        {currentStep === 1 ? (
                          <ReviewWizardLinkedStep1
                            formConfig={formConfig}
                            answers={answers}
                            setAnswer={setAnswer}
                          />
                        ) : null}
                        {currentStep === 2 ? (
                          <ReviewWizardLinkedStep2
                            formConfig={formConfig}
                            answers={answers}
                            setAnswer={setAnswer}
                          />
                        ) : null}
                      </>
                    ) : (
                      <>
                        {currentStep === 1 ? (
                          <ReviewWizardUnlinkedStep1
                            formConfig={formConfig}
                            answers={answers}
                            setAnswer={setAnswer}
                            selectedTags={selectedTags}
                            setSelectedTags={setSelectedTags}
                            rememberWho={rememberWho}
                            setRememberWho={setRememberWho}
                            rememberWhoChipNames={rememberWhoChipNames}
                            applyRememberWhoChip={applyRememberWhoChip}
                          />
                        ) : null}
                        {currentStep === 2 ? (
                          <ReviewWizardUnlinkedStep2
                            formConfig={formConfig}
                            answers={answers}
                            setAnswer={setAnswer}
                          />
                        ) : null}
                      </>
                    )}

                    {currentStep === 3 ? (
                      <ReviewWizardNoteStep
                        formConfig={formConfig}
                        founderNoteQuestion={founderNoteQuestion}
                        answers={answers}
                        setAnswer={setAnswer}
                        showFounderNote={showFounderNote}
                        anonymous={anonymous}
                        setAnonymous={setAnonymous}
                      />
                    ) : null}
                  </ReviewWizardBody>

                  <ReviewWizardFooter
                    step={currentStep}
                    canGoNext={canGoNext}
                    canSubmit={canSubmit}
                    submitting={submitting}
                    onBack={onWizardBack}
                    onNext={onWizardNext}
                    onSubmit={handleSubmit}
                    onCancel={handleClose}
                  />
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );

  if (typeof document === "undefined") return null;
  return createPortal(modalLayer, document.body);
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
