import {
  isContextStepValidUnlinked,
  isEvaluationStepValidLinked,
  isNoteStepValid,
  isWouldEngageStepValidUnlinked,
  overallInteractionScoreValid,
} from "@/lib/reviewWizard";

export type ReviewWizardStep = 1 | 2 | 3 | 4 | 5;

/** Unlinked step 1: 1–10 experience + engage again (see ReviewWizardUnlinkedStep1). */
export function unlinkedStep1Complete(
  answers: Record<string, string | string[]>,
): boolean {
  return (
    overallInteractionScoreValid(answers.overall_interaction) &&
    isWouldEngageStepValidUnlinked(answers)
  );
}

/** Unlinked wizard step 2: characterize interaction through “How much engagement?” (ReviewWizardUnlinkedStep3). */
export function unlinkedStep3Complete(
  answers: Record<string, string | string[]>,
): boolean {
  return isContextStepValidUnlinked(answers);
}

/** Unlinked wizard step 3: optional remember-who + interaction tags (ReviewWizardUnlinkedStep4). */
export function unlinkedStep4Complete(): boolean {
  return true;
}

export function linkedStep1Complete(answers: Record<string, string | string[]>): boolean {
  return isEvaluationStepValidLinked(answers);
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
  if (step === 2) return unlinkedStep3Complete(answers);
  if (step === 3) return unlinkedStep4Complete();
  return true;
}

const LINKED_STEP_LABELS = ["Relationship", "Standout", "Note & submit"] as const;
const UNLINKED_STEP_LABELS = [
  "Your experience",
  "Interaction",
  "People & tags",
  "Note & submit",
] as const;

/** Short titles for the stepper UI (linked vs unlinked lengths match `totalSteps` in the modal). */
export function wizardProgressStepTitles(
  investorIsMappedToProfile: boolean,
): readonly string[] {
  return investorIsMappedToProfile ? LINKED_STEP_LABELS : UNLINKED_STEP_LABELS;
}

export function wizardProgressLabel(
  step: ReviewWizardStep,
  investorIsMappedToProfile: boolean,
): string {
  const titles = wizardProgressStepTitles(investorIsMappedToProfile);
  return titles[step - 1] ?? "";
}

export function formatUnlinkedContextSummary(
  answers: Record<string, string | string[]>,
  rememberWho: string,
): string {
  const intro = answers.interaction_intro as string | undefined;
  const how = answers.interaction_how as string[] | undefined;
  const depth = answers.interaction_meeting_depth as string | undefined;
  
  const parts: string[] = [];
  if (intro) parts.push(intro);
  if (how?.length) parts.push(how.join(", "));
  if (depth) parts.push(depth);
  const rw = rememberWho.trim();
  if (rw) parts.push(`Who: ${rw.length > 48 ? `${rw.slice(0, 45)}…` : rw}`);
  
  return parts.length ? parts.join(" · ") : "Not completed";
}

export function formatUnlinkedEvaluationSummary(answers: Record<string, string | string[]>): string {
  const o = answers.overall_interaction as string | undefined;
  const w = answers.would_engage_again as string | undefined;
  if (o && w) return `${o} · ${w}`;
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
