import { shouldShowFollowUpAfterEventQuestion } from "@/lib/buildReviewFormConfig";

export type ReviewWizardStep = 1 | 2 | 3;

export function unlinkedStep1Complete(
  answers: Record<string, string | string[]>,
): boolean {
  if (typeof answers.interaction_type !== "string" || !answers.interaction_type.length) {
    return false;
  }
  const followUpVisible = shouldShowFollowUpAfterEventQuestion(answers);
  if (
    !followUpVisible ||
    (typeof answers.follow_up_after_event === "string" && answers.follow_up_after_event.length > 0)
  ) {
    return true;
  }
  return false;
}

export function unlinkedStep2Complete(
  answers: Record<string, string | string[]>,
): boolean {
  return (
    typeof answers.overall_interaction === "string" &&
    answers.overall_interaction.length > 0 &&
    typeof answers.response_time === "string" &&
    answers.response_time.length > 0 &&
    typeof answers.would_engage_again === "string" &&
    answers.would_engage_again.length > 0
  );
}

export function linkedStep1Complete(answers: Record<string, string | string[]>): boolean {
  return (
    typeof answers.work_with_them_rating === "string" &&
    answers.work_with_them_rating.length > 0 &&
    typeof answers.take_money_again === "string" &&
    answers.take_money_again.length > 0
  );
}

export function canAdvanceWizardStep(
  step: ReviewWizardStep,
  investorIsMappedToProfile: boolean,
  answers: Record<string, string | string[]>,
): boolean {
  if (investorIsMappedToProfile) {
    if (step === 1) return linkedStep1Complete(answers);
    return true;
  }
  if (step === 1) return unlinkedStep1Complete(answers);
  if (step === 2) return unlinkedStep2Complete(answers);
  return true;
}

const STEP_LABELS = ["Context", "Evaluation", "Note & submit"] as const;

export function wizardProgressLabel(step: ReviewWizardStep): string {
  return STEP_LABELS[step - 1] ?? "";
}

/** Interaction type, optional follow-up row, optional remember-who (tags live in a separate summary row). */
export function formatUnlinkedContextSummary(
  answers: Record<string, string | string[]>,
  rememberWho: string,
): string {
  const parts: string[] = [];
  const it = answers.interaction_type as string | undefined;
  if (it) parts.push(it);
  const fu = answers.follow_up_after_event as string | undefined;
  if (fu && shouldShowFollowUpAfterEventQuestion(answers)) parts.push(`Follow-up: ${fu}`);
  const rw = rememberWho.trim();
  if (rw) parts.push(`Who: ${rw.length > 48 ? `${rw.slice(0, 45)}…` : rw}`);
  return parts.length ? parts.join(" · ") : "Not completed";
}

export function formatUnlinkedEvaluationSummary(answers: Record<string, string | string[]>): string {
  const o = answers.overall_interaction as string | undefined;
  const r = answers.response_time as string | undefined;
  const w = answers.would_engage_again as string | undefined;
  if (o && r && w) return `${o} · ${r} · ${w}`;
  return "Not completed";
}

export function formatLinkedEvaluationSummary(answers: Record<string, string | string[]>): string {
  const a = answers.work_with_them_rating as string | undefined;
  const b = answers.take_money_again as string | undefined;
  if (a && b) return `${a} · ${b}`;
  return "Not completed";
}

export function formatTagsSummary(selected: string[]): string {
  if (!selected.length) return "—";
  return selected.join(", ");
}

export function formatNoteSummary(note: string): string {
  const t = note.trim();
  return t.length > 0 ? "Added" : "No note";
}
