/**
 * 3-step review wizard: validation, draft-shaped view model, and summary strings.
 * Canonical persisted state remains `answers` + `selectedTags` on the modal.
 */

import {
  countRememberedNames,
  getRememberedRoleKeysFromAnswers,
  PARTICIPANT_ROLE_LABEL_BY_VALUE,
  type ParticipantRoleKey,
} from "@/lib/reviewParticipantMemory";
import { EVENT_TYPE_DISPLAY_LABELS } from "@/lib/reviewFormContent";

export type ReviewStep = 1 | 2 | 3 | 4 | 5;

export type ReviewDraftRelationshipOrigin = 
  | "warm_intro" 
  | "cold_inbound" 
  | "cold_outbound" 
  | "event" 
  | "community"
  | "existing_relationship" 
  | "other" 
  | null;

export type ReviewDraftEventType = 
  | "conference" 
  | "demo_day" 
  | "dinner" 
  | "private_gathering" 
  | "office_hours" 
  | "other" 
  | null;

export type ReviewDraftInitiator = "investor" | "founder" | "mutual_unclear" | null;

export type ReviewDraftInteractionChannel =
  | "in_person"
  | "video"
  | "group"
  | "one_on_one"
  | "email"
  | "social"
  | "phone";

export type ReviewDraftMeetingDepth =
  | "once"
  | "few_times"
  | "several_times"
  | "many"
  /** Legacy stored answers before four-tier engagement options */
  | "email_only"
  | "single_meeting"
  | "multiple_meetings"
  | null;

export type ReviewDraft = {
  /** Relationship origin (Characterize your interaction) */
  relationshipOrigin: ReviewDraftRelationshipOrigin;

  /** Only if origin = event */
  eventType: ReviewDraftEventType;
  hadEventFollowUp: boolean | null;
  eventFollowUpFirstBy: "founder" | "investor" | null;

  /** Who initiated the interaction */
  initiatedBy: ReviewDraftInitiator;

  /** How they interacted / meeting format (multi-select) */
  interactionChannels: ReviewDraftInteractionChannel[];

  /** Who was involved */
  participantNames: string[];
  participantRolesRemembered: ParticipantRoleKey[];
  participantMemoryMode: "names_only" | "roles_only" | "names_and_roles" | "unknown" | null;

  /** Depth of engagement */
  meetingDepth: ReviewDraftMeetingDepth;

  /** Overall evaluation score (1-10 for unlinked, or rating text for linked) */
  overallRating: string | number | null;

  /** Evaluative tags / qualitative descriptors */
  interactionTags: string[];

  /** Optional founder note */
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
      if (coldInboundDiscoveryValue.toLowerCase() === "social") {
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

/**
 * Relationship origin is chosen and any branch follow-ups are done (who initiated, cold inbound
 * path, event details, Other text, etc.). Used to reveal "How did you interact?" only after this block.
 */
export function isUnlinkedRelationshipOriginComplete(
  answers: Record<string, string | string[]>,
): boolean {
  const introOk =
    typeof answers.interaction_intro === "string" && answers.interaction_intro.trim().length > 0;
  if (!introOk) return false;
  return introFollowupsCompleteFromAnswers(answers);
}

export function isContextStepValidUnlinked(answers: Record<string, string | string[]>): boolean {
  if (!isUnlinkedRelationshipOriginComplete(answers)) return false;
  const howOk = Array.isArray(answers.interaction_how) && answers.interaction_how.length > 0;
  if (!howOk) return false;
  const depthOk =
    typeof answers.interaction_meeting_depth === "string" && answers.interaction_meeting_depth.length > 0;
  if (!depthOk) return false;
  // “Remember who?” is optional free text + firm-linked chips; `remember_who` + optional
  // `remember_who_vc_person_ids` on save (see ReviewSubmissionModal), not
  // `interaction_remembered_who_*` in answers — do not block step 1 on participant-memory fields.
  return true;
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

/** Step 2 of unlinked wizard (after experience + context on step 1). */
export function isWouldEngageStepValidUnlinked(answers: Record<string, string | string[]>): boolean {
  return typeof answers.would_engage_again === "string" && answers.would_engage_again.length > 0;
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
  if (step === 1) {
    return overallInteractionScoreValid(answers.overall_interaction);
  }
  if (step === 2) {
    return isWouldEngageStepValidUnlinked(answers);
  }
  if (step === 3) {
    return isContextStepValidUnlinked(answers);
  }
  if (step === 4) {
    return true;
  }
  return isNoteStepValid({} as ReviewDraft);
}

/** Derive a draft-shaped snapshot for summaries (read-only). */
export function deriveReviewDraftFromAnswers(
  answers: Record<string, string | string[]>,
  selectedTags: string[],
  investorIsMappedToProfile: boolean,
): ReviewDraft {
  // ── Relationship origin and conditionals ────────────────────────────────
  const introRaw = (answers.interaction_intro as string | undefined)?.trim();
  let relationshipOrigin: ReviewDraftRelationshipOrigin = null;
  let eventType: ReviewDraftEventType = null;
  let hadEventFollowUp: boolean | null = null;
  let eventFollowUpFirstBy: "founder" | "investor" | null = null;

  if (introRaw === "Warm intro") {
    relationshipOrigin = "warm_intro";
  } else if (introRaw === "Cold inbound") {
    relationshipOrigin = "cold_inbound";
  } else if (introRaw === "Cold outbound") {
    relationshipOrigin = "cold_outbound";
  } else if (introRaw === "Event") {
    relationshipOrigin = "event";
    const eventTypeRaw = (answers.interaction_event_type as string | undefined)?.trim();
    if (eventTypeRaw === "conference") {
      eventType = "conference";
    } else if (eventTypeRaw === "demo day") {
      eventType = "demo_day";
    } else if (eventTypeRaw === "dinner") {
      eventType = "dinner";
    } else if (eventTypeRaw === "private gathering") {
      eventType = "private_gathering";
    } else if (eventTypeRaw === "office hours") {
      eventType = "office_hours";
    } else if (eventTypeRaw === "other") {
      eventType = "other";
    }

    const followUpRaw = (answers.interaction_event_followup as string | undefined)?.trim();
    hadEventFollowUp = followUpRaw === "Yes" ? true : followUpRaw === "No" ? false : null;

    if (hadEventFollowUp) {
      const firstByRaw = (answers.interaction_event_followup_first as string | undefined)?.trim();
      eventFollowUpFirstBy = firstByRaw === "founder" ? "founder" : firstByRaw === "investor" ? "investor" : null;
    }
  } else if (introRaw === "Community") {
    relationshipOrigin = "community";
  } else if (introRaw === "Existing relationship") {
    relationshipOrigin = "existing_relationship";
  } else if (introRaw === "Other") {
    relationshipOrigin = "other";
  }

  // ── Who initiated ──────────────────────────────────────────────────────
  let initiatedBy: ReviewDraftInitiator = null;
  const initiatorRaw = (answers.interaction_warm_intro_who as string | undefined)?.trim();
  if (initiatorRaw === "Investor initiated") {
    initiatedBy = "investor";
  } else if (initiatorRaw === "Founder initiated") {
    initiatedBy = "founder";
  } else if (initiatorRaw === "Mutual / unclear") {
    initiatedBy = "mutual_unclear";
  }

  // ── How did you interact (channels) ────────────────────────────────────
  const howArr = Array.isArray(answers.interaction_how) ? (answers.interaction_how as string[]) : [];
  const interactionChannels = howArr
    .map((h) => HOW_LABEL_TO_CHANNEL[h])
    .filter(Boolean) as ReviewDraftInteractionChannel[];

  // ── Participant memory ─────────────────────────────────────────────────
  const names = answers.interaction_remembered_who_names;
  const participantNames = Array.isArray(names)
    ? names.map((n) => String(n).trim()).filter(Boolean)
    : [];
  const participantRolesRemembered = getRememberedRoleKeysFromAnswers(answers);
  const participantMemoryMode = deriveParticipantMemoryMode(participantNames, participantRolesRemembered);

  // ── Meeting depth ──────────────────────────────────────────────────────
  let meetingDepth: ReviewDraftMeetingDepth = null;
  const depthRaw = (answers.interaction_meeting_depth as string | undefined)?.trim();
  if (depthRaw === "Once") {
    meetingDepth = "once";
  } else if (depthRaw === "A few times") {
    meetingDepth = "few_times";
  } else if (depthRaw === "Several times") {
    meetingDepth = "several_times";
  } else if (depthRaw === "Many") {
    meetingDepth = "many";
  } else if (depthRaw === "Email only") {
    meetingDepth = "email_only";
  } else if (depthRaw === "Single meeting") {
    meetingDepth = "single_meeting";
  } else if (depthRaw === "Multiple meetings") {
    meetingDepth = "multiple_meetings";
  }

  // ── Evaluation rating ──────────────────────────────────────────────────
  const overallRating = investorIsMappedToProfile
    ? ((answers.work_with_them_rating as string) ?? null)
    : ((answers.overall_interaction as string) ?? null);

  // ── Tags ───────────────────────────────────────────────────────────────
  const interactionTags = investorIsMappedToProfile
    ? (Array.isArray(answers.standout_tags) ? (answers.standout_tags as string[]) : [])
    : selectedTags;

  // ── Note ───────────────────────────────────────────────────────────────
  const note = (answers.founder_note as string) ?? "";

  return {
    relationshipOrigin,
    eventType,
    hadEventFollowUp,
    eventFollowUpFirstBy,
    initiatedBy,
    interactionChannels,
    participantNames,
    participantRolesRemembered,
    participantMemoryMode,
    meetingDepth,
    overallRating,
    interactionTags,
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

  const bits: string[] = [];

  // ── Relationship origin ────────────────────────────────────────────────
  const originLabel = draft.relationshipOrigin === "warm_intro" ? "Warm intro"
    : draft.relationshipOrigin === "cold_inbound" ? "Cold inbound"
    : draft.relationshipOrigin === "cold_outbound" ? "Cold outbound"
    : draft.relationshipOrigin === "event" ? "Event"
    : draft.relationshipOrigin === "community" ? "Community"
    : draft.relationshipOrigin === "existing_relationship" ? "Existing relationship"
    : draft.relationshipOrigin === "other" ? (answers.interaction_intro_other as string | undefined)?.trim() || "Other"
    : null;
  if (originLabel) bits.push(originLabel);

  // ── Event-specific info ────────────────────────────────────────────────
  if (draft.relationshipOrigin === "event" && draft.eventType) {
    const eventLabel = EVENT_TYPE_DISPLAY_LABELS[draft.eventType] ?? draft.eventType;
    bits.push(`Event: ${eventLabel}`);
    if (draft.hadEventFollowUp !== null) {
      bits.push(`Follow-up: ${draft.hadEventFollowUp ? "Yes" : "No"}`);
      if (draft.hadEventFollowUp && draft.eventFollowUpFirstBy) {
        const firstLabel = draft.eventFollowUpFirstBy === "founder" ? "Founder" : "Investor";
        bits.push(`First follow-up: ${firstLabel}`);
      }
    }
  }

  // ── Who initiated (only for warm intros) ────────────────────────────────
  if (draft.relationshipOrigin === "warm_intro") {
    const initiatorLabel = formatInitiator(draft.initiatedBy);
    if (initiatorLabel !== "—") bits.push(initiatorLabel);
  }

  // ── Interaction channels ───────────────────────────────────────────────
  const channelLabel = formatInteractionChannels(draft.interactionChannels);
  if (channelLabel !== "—") bits.push(channelLabel);

  // ── Meeting depth ─────────────────────────────────────────────────────
  if (draft.meetingDepth) {
    const depthLabel =
      draft.meetingDepth === "once"
        ? "Once"
        : draft.meetingDepth === "few_times"
          ? "A few times"
          : draft.meetingDepth === "several_times"
            ? "Several times"
            : draft.meetingDepth === "many"
              ? "Many"
              : draft.meetingDepth === "email_only"
                ? "Email only"
                : draft.meetingDepth === "single_meeting"
                  ? "Single meeting"
                  : draft.meetingDepth === "multiple_meetings"
                    ? "Multiple meetings"
                    : null;
    if (depthLabel) bits.push(depthLabel);
  }

  // ── Participants ───────────────────────────────────────────────────────
  const participantLabel = formatParticipantsSummary(answers, draft);
  if (participantLabel !== "—") bits.push(participantLabel);

  return bits.filter(Boolean).join(" · ") || "Not completed";
}

export function formatInteractionChannels(values: ReviewDraftInteractionChannel[]): string {
  if (!values.length) return "—";
  return values.map((v) => CHANNEL_DISPLAY[v]).join(", ");
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
