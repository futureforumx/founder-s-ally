/**
 * 3-step review wizard: validation, draft-shaped view model, and summary strings.
 * Canonical persisted state remains `answers` + `selectedTags` on the modal.
 */

import {
  countRememberedNames,
  getRememberedRoleKeysFromAnswers,
  rememberWhoSubsectionSatisfied,
  PARTICIPANT_ROLE_LABEL_BY_VALUE,
  type ParticipantRoleKey,
} from "@/lib/reviewParticipantMemory";
import { EVENT_TYPE_DISPLAY_LABELS } from "@/lib/reviewFormContent";

export type ReviewStep = 1 | 2 | 3;

export type ReviewDraftInitiator = "investor" | "founder" | "mutual_unclear" | null;

export type ReviewDraftInteractionChannel =
  | "in_person"
  | "video"
  | "group"
  | "one_on_one"
  | "email"
  | "social"
  | "phone";

export type ReviewDraft = {
  initiator: ReviewDraftInitiator;
  interactionTypes: ReviewDraftInteractionChannel[];
  participantNames: string[];
  participantRolesRemembered: ParticipantRoleKey[];
  participantMemoryMode: "names_only" | "roles_only" | "names_and_roles" | "unknown" | null;
  overallRating: string | number | null;
  tags: string[];
  note: string;
};

const HOW_LABEL_TO_CHANNEL: Record<string, ReviewDraftInteractionChannel> = {
  "In-Person": "in_person",
  Video: "video",
  Group: "group",
  "1:1": "one_on_one",
  Email: "email",
  Social: "social",
  Phone: "phone",
};

const CHANNEL_DISPLAY: Record<ReviewDraftInteractionChannel, string> = {
  in_person: "In-person",
  video: "Video",
  group: "Group",
  one_on_one: "1:1",
  email: "Email",
  social: "Social",
  phone: "Phone",
};

export function relationshipOriginFollowupsComplete(
  introValue: string | null,
  introOtherValue: string,
  warmIntroWhoValue: string | null,
  coldInboundDiscoveryValue: string | null,
  coldInboundSocialPlatformValue: string | null,
  coldInboundSocialOtherValue: string,
  eventTypeValue: string | null,
  eventTypeOtherValue: string,
  eventFollowupValue: string | null,
  eventFollowupFirstValue: string | null,
): boolean {
  if (!introValue) return false;
  switch (introValue) {
    case "Warm intro":
      return Boolean(warmIntroWhoValue);
    case "Cold inbound":
      if (!coldInboundDiscoveryValue) return false;
      if (coldInboundDiscoveryValue === "social") {
        if (!coldInboundSocialPlatformValue) return false;
        if (
          coldInboundSocialPlatformValue === "other" &&
          !coldInboundSocialOtherValue.trim()
        ) {
          return false;
        }
      }
      return true;
    case "Event":
      if (!eventTypeValue) return false;
      if (eventTypeValue === "other" && !eventTypeOtherValue.trim()) return false;
      if (!eventFollowupValue) return false;
      if (eventFollowupValue === "Yes" && !eventFollowupFirstValue) return false;
      return true;
    case "Other":
      return introOtherValue.trim().length > 0;
    default:
      return true;
  }
}

function introFollowupsCompleteFromAnswers(answers: Record<string, string | string[]>): boolean {
  return relationshipOriginFollowupsComplete(
    (answers.interaction_intro as string | undefined)?.trim() || null,
    (answers.interaction_intro_other as string) ?? "",
    (answers.interaction_warm_intro_who as string | undefined)?.trim() || null,
    (answers.interaction_cold_inbound_discovery as string | undefined)?.trim() || null,
    (answers.interaction_cold_inbound_social_platform as string | undefined)?.trim() || null,
    (answers.interaction_cold_inbound_social_other as string) ?? "",
    (answers.interaction_event_type as string | undefined)?.trim() || null,
    (answers.interaction_event_type_other as string) ?? "",
    (answers.interaction_event_followup as string | undefined)?.trim() || null,
    (answers.interaction_event_followup_first as string | undefined)?.trim() || null,
  );
}

export function isContextStepValidUnlinked(answers: Record<string, string | string[]>): boolean {
  const introOk =
    typeof answers.interaction_intro === "string" && answers.interaction_intro.length > 0;
  if (!introOk) return false;
  if (!introFollowupsCompleteFromAnswers(answers)) return false;
  const howOk = Array.isArray(answers.interaction_how) && answers.interaction_how.length > 0;
  if (!howOk) return false;
  return rememberWhoSubsectionSatisfied(answers);
}

export function overallInteractionScoreValid(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 1 && n <= 10 && String(n) === v;
}

export function isEvaluationStepValidUnlinked(answers: Record<string, string | string[]>): boolean {
  return (
    overallInteractionScoreValid(answers.overall_interaction) &&
    typeof answers.would_engage_again === "string" &&
    answers.would_engage_again.length > 0
  );
}

export function isEvaluationStepValidLinked(answers: Record<string, string | string[]>): boolean {
  return (
    typeof answers.work_with_them_rating === "string" &&
    answers.work_with_them_rating.length > 0 &&
    typeof answers.take_money_again === "string" &&
    answers.take_money_again.length > 0
  );
}

export function isNoteStepValid(_draft: ReviewDraft): boolean {
  return true;
}

export function canAdvanceStep(
  step: ReviewStep,
  investorIsMappedToProfile: boolean,
  answers: Record<string, string | string[]>,
): boolean {
  if (investorIsMappedToProfile) {
    if (step === 1) return isEvaluationStepValidLinked(answers);
    if (step === 2) return true;
    return isNoteStepValid({} as ReviewDraft);
  }
  if (step === 1) return isContextStepValidUnlinked(answers);
  if (step === 2) return isEvaluationStepValidUnlinked(answers);
  return isNoteStepValid({} as ReviewDraft);
}

/** Derive a draft-shaped snapshot for summaries (read-only). */
export function deriveReviewDraftFromAnswers(
  answers: Record<string, string | string[]>,
  selectedTags: string[],
  investorIsMappedToProfile: boolean,
): ReviewDraft {
  const warm = (answers.interaction_warm_intro_who as string | undefined)?.trim();
  let initiator: ReviewDraftInitiator = null;
  if (warm === "Investor initiated") initiator = "investor";
  else if (warm === "Founder initiated") initiator = "founder";
  else if (warm === "Mutual / unclear") initiator = "mutual_unclear";

  const howArr = Array.isArray(answers.interaction_how) ? (answers.interaction_how as string[]) : [];
  const interactionTypes = howArr
    .map((h) => HOW_LABEL_TO_CHANNEL[h])
    .filter(Boolean) as ReviewDraftInteractionChannel[];

  const names = answers.interaction_remembered_who_names;
  const participantNames = Array.isArray(names)
    ? names.map((n) => String(n).trim()).filter(Boolean)
    : [];
  const participantRolesRemembered = getRememberedRoleKeysFromAnswers(answers);

  const participantMemoryMode = deriveParticipantMemoryMode(participantNames, participantRolesRemembered);

  const overallRating = investorIsMappedToProfile
    ? ((answers.work_with_them_rating as string) ?? null)
    : ((answers.overall_interaction as string) ?? null);

  const tags = investorIsMappedToProfile
    ? (Array.isArray(answers.standout_tags) ? (answers.standout_tags as string[]) : [])
    : selectedTags;

  const note = (answers.founder_note as string) ?? "";

  return {
    initiator,
    interactionTypes,
    participantNames,
    participantRolesRemembered,
    participantMemoryMode,
    overallRating,
    tags,
    note,
  };
}

export function deriveParticipantMemoryMode(
  names: string[],
  roles: ParticipantRoleKey[],
): ReviewDraft["participantMemoryMode"] {
  const concrete = roles.filter((r) => r !== "not_sure");
  const hasNotSure = roles.includes("not_sure");
  if (names.length > 0 && concrete.length > 0) return "names_and_roles";
  if (names.length > 0) return "names_only";
  if (concrete.length > 0) return "roles_only";
  if (hasNotSure) return "unknown";
  return null;
}

// ── Display formatters for ReviewSummaryPanel ───────────────────────────────

export function formatInitiator(value: ReviewDraftInitiator): string {
  if (value === "investor") return "Investor initiated";
  if (value === "founder") return "Founder initiated";
  if (value === "mutual_unclear") return "Mutual / unclear";
  return "—";
}

export function formatInteractionTypes(values: ReviewDraftInteractionChannel[]): string {
  if (!values.length) return "—";
  return values.map((v) => CHANNEL_DISPLAY[v]).join(", ");
}

export function formatIntroLine(answers: Record<string, string | string[]>): string {
  const intro = answers.interaction_intro as string | undefined;
  if (!intro) return "Not completed";
  if (intro === "Other") {
    const o = (answers.interaction_intro_other as string | undefined)?.trim();
    return o || "Other";
  }
  return intro;
}

export function formatParticipantsSummary(
  answers: Record<string, string | string[]>,
  draft: ReviewDraft,
): string {
  if (!isContextStepValidUnlinked(answers) && countRememberedNames(answers) === 0) {
    const roles = getRememberedRoleKeysFromAnswers(answers);
    if (roles.length === 0) return "Not completed";
  }
  const names = draft.participantNames;
  const concreteRoles = draft.participantRolesRemembered.filter((r) => r !== "not_sure");
  const parts: string[] = [];
  if (names.length) parts.push(names.join(", "));
  if (concreteRoles.length) {
    parts.push(
      concreteRoles.map((r) => PARTICIPANT_ROLE_LABEL_BY_VALUE[r]).join(", "),
    );
  }
  if (draft.participantRolesRemembered.includes("not_sure")) parts.push("Not sure");
  return parts.length ? parts.join(" · ") : "—";
}

const RATING_LABELS: Record<string, string> = {
  Great: "Great",
  Good: "Good",
  Mixed: "Mixed",
  Poor: "Poor",
};

const OVERALL_NUM_LABEL: Record<number, string> = {
  10: "Exceptional",
  9: "Great",
  8: "Strong",
  7: "Good",
  6: "Mixed",
  5: "Mixed",
  4: "Weak",
  3: "Poor",
  2: "Rough",
  1: "Terrible",
};

export function formatRating(
  value: string | number | null,
  investorIsMappedToProfile: boolean,
): string {
  if (value == null || value === "") return "—";
  if (investorIsMappedToProfile) {
    const s = String(value);
    return RATING_LABELS[s] ?? s;
  }
  const s = String(value);
  const n = parseInt(s, 10);
  if (overallInteractionScoreValid(s)) {
    return `${s} — ${OVERALL_NUM_LABEL[n] ?? s}`;
  }
  return s;
}

export function formatTags(tags: string[]): string {
  if (!tags.length) return "—";
  return tags.join(", ");
}

export function formatNoteStatus(note: string): string {
  const t = note.trim();
  return t.length > 0 ? "Added" : "No note";
}

export function formatContextSectionUnlinked(
  answers: Record<string, string | string[]>,
  draft: ReviewDraft,
): string {
  if (!isContextStepValidUnlinked(answers)) return "Not completed";
  const intro = formatIntroLine(answers);
  const how = formatInteractionTypes(draft.interactionTypes);
  const who = formatParticipantsSummary(answers, draft);
  const init =
    (answers.interaction_intro as string) === "Warm intro"
      ? formatInitiator(draft.initiator)
      : null;
  const bits = [intro, how, who];
  if (init && init !== "—") bits.splice(1, 0, init);
  return bits.filter((b) => b && b !== "—").join(" · ");
}

export function formatEvaluationSectionUnlinked(answers: Record<string, string | string[]>): string {
  if (!isEvaluationStepValidUnlinked(answers)) return "Not completed";
  const r = formatRating(answers.overall_interaction as string, false);
  const e = answers.would_engage_again as string;
  return `${r} · ${e}`;
}

export function formatEvaluationSectionLinked(answers: Record<string, string | string[]>): string {
  if (!isEvaluationStepValidLinked(answers)) return "Not completed";
  const a = answers.work_with_them_rating as string;
  const b = answers.take_money_again as string;
  return `${a} · ${b}`;
}

export function eventTypePretty(
  eventType: string | null | undefined,
  other: string,
): string {
  if (!eventType) return "";
  if (eventType === "other" && other.trim()) return other.trim();
  return EVENT_TYPE_DISPLAY_LABELS[eventType as keyof typeof EVENT_TYPE_DISPLAY_LABELS] ?? eventType;
}
