/**
 * Edit linked vs unlinked review copy here.
 *
 * Linked   = firm name matches a row on the founder’s cap table.
 * Unlinked = no cap-table match (prospect, intro, etc.).
 *
 * Question `id` values are stable API keys — keep them when changing labels/options
 * so submissions and score derivation (`deriveNonInvestorScores` / `deriveInvestorScores`) stay valid.
 *
 * Participant memory (unlinked, `star_ratings.answers`):
 * - `interaction_remembered_who_names` / `interaction_remembered_who_vc_person_ids` — known people
 * - `interaction_remembered_who_roles` — role chips (see `reviewParticipantMemory.ts`)
 * - `interaction_remembered_who_included_unknown_others` — `"true"` when checkbox on
 * - `interaction_participant_memory_mode` — computed at save: names_only | roles_only | names_and_roles | unknown
 */

/** Unlinked Q1 — `interaction_intro` (+ follow-ups), `interaction_how` (multi). `interaction_how` excludes In-Person when intro is Event. */
export const CHARACTERIZE_INTERACTION_HOW = [
  "In-Person",
  "Video",
  "Group",
  "1:1",
  "Email",
  "Social",
  "Phone",
] as const;

export const CHARACTERIZE_INTRO_OPTIONS = [
  "Warm intro",
  "Cold inbound",
  "Cold outbound",
  "Event",
  "Existing relationship",
  "Other",
] as const;

/** Shown when relationship origin is "Warm intro" — stored as `answers.interaction_warm_intro_who`. */
export const CHARACTERIZE_WARM_INTRO_WHO_INITIATED = [
  "Investor initiated",
  "Founder initiated",
  "Mutual / unclear",
] as const;

/** Shown when relationship origin is "Cold inbound" — stored as `answers.interaction_cold_inbound_discovery`. */
export const CHARACTERIZE_COLD_INBOUND_DISCOVERY = [
  "inbound email",
  "website",
  "referral chain",
  "social",
  "unknown",
] as const;

/** When cold inbound discovery is "social" — `answers.interaction_cold_inbound_social_platform` (+ `interaction_cold_inbound_social_other` if "other"). */
export const CHARACTERIZE_COLD_INBOUND_SOCIAL_PLATFORMS = [
  "X",
  "LinkedIn",
  "Substack",
  "other",
] as const;

/** Shown when relationship origin is "Event" — `answers.interaction_event_type` (+ `interaction_event_type_other` if "other"). */
export const CHARACTERIZE_EVENT_TYPES = [
  "conference",
  "demo day",
  "dinner",
  "private gathering",
  "office hours",
  "other",
] as const;

/** Tile / summary labels for `CHARACTERIZE_EVENT_TYPES` (stored answers stay lowercase keys above). */
export const EVENT_TYPE_DISPLAY_LABELS: Record<
  (typeof CHARACTERIZE_EVENT_TYPES)[number],
  string
> = {
  conference: "Conference",
  "demo day": "Demo day",
  dinner: "Dinner",
  "private gathering": "Private gathering",
  "office hours": "Office hours",
  other: "Other",
};

export const CHARACTERIZE_EVENT_FOLLOWUP = ["Yes", "No"] as const;

/** When follow-up is Yes — `answers.interaction_event_followup_first`. */
export const CHARACTERIZE_EVENT_FOLLOWUP_FIRST = ["founder", "investor"] as const;

/**
 * Optional review tags for the unlinked flow, keyed to Q1 overall score (1–10).
 * Shown only after the user picks a score; changing the score updates the chip list.
 */
export const NON_INVESTOR_SCORE_TAG_TIERS = {
  "10": [
    "Founder-first",
    "Sharp",
    "Insightful",
    "Responsive",
    "Strategic",
    "Trustworthy",
    "Candid",
    "Prepared",
    "Proactive",
    "Immediate",
  ],
  "9": [
    "Strong",
    "Thoughtful",
    "Helpful",
    "Reliable",
    "Clear",
    "Respectful",
    "Smart",
    "Supportive",
    "Engaged",
    "Prompt",
  ],
  "8": [
    "Solid",
    "Useful",
    "Professional",
    "Knowledgeable",
    "Constructive",
    "Dependable",
    "Organized",
    "Credible",
    "Timely",
    "Attentive",
  ],
  "7": [
    "Good",
    "Positive",
    "Fair",
    "Capable",
    "Smooth",
    "Reasonable",
    "Decent",
    "Competent",
    "Pleasant",
    "Responsive-enough",
  ],
  "5-6": [
    "Mixed",
    "Uneven",
    "Average",
    "Transactional",
    "Forgettable",
    "Generic",
    "Spotty",
    "Inconsistent",
    "Fine",
    "Slowish",
  ],
  "4": [
    "Slow",
    "Vague",
    "Disorganized",
    "Surface-level",
    "Frustrating",
    "Passive",
    "Distracted",
    "Misaligned",
    "Unclear",
    "Delayed",
  ],
  "3": [
    "Low-signal",
    "Unhelpful",
    "Dismissive",
    "Unreliable",
    "Confusing",
    "Shallow",
    "Sloppy",
    "Cold",
    "Unresponsive",
    "Poor",
  ],
  "2": [
    "Difficult",
    "Misleading",
    "Defensive",
    "Reactive",
    "Disrespectful",
    "Unprepared",
    "Chaotic",
    "Painful",
    "Disappointing",
    "Ghosty",
  ],
  "1": [
    "Toxic",
    "Harmful",
    "Manipulative",
    "Condescending",
    "Dishonest",
    "Political",
    "Hostile",
    "Trust-breaking",
    "Exploitative",
    "Ghosted",
  ],
} as const;

export type NonInvestorScoreTierKey = keyof typeof NON_INVESTOR_SCORE_TAG_TIERS;

/** Tags offered for a valid 1–10 overall score string; empty if unset or invalid. */
export function nonInvestorTagsForOverallScore(raw: string | null | undefined): string[] {
  if (raw == null || typeof raw !== "string") return [];
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1 || n > 10 || String(n) !== raw) return [];
  if (n === 10) return [...NON_INVESTOR_SCORE_TAG_TIERS["10"]];
  if (n === 9) return [...NON_INVESTOR_SCORE_TAG_TIERS["9"]];
  if (n === 8) return [...NON_INVESTOR_SCORE_TAG_TIERS["8"]];
  if (n === 7) return [...NON_INVESTOR_SCORE_TAG_TIERS["7"]];
  if (n === 5 || n === 6) return [...NON_INVESTOR_SCORE_TAG_TIERS["5-6"]];
  if (n === 4) return [...NON_INVESTOR_SCORE_TAG_TIERS["4"]];
  if (n === 3) return [...NON_INVESTOR_SCORE_TAG_TIERS["3"]];
  if (n === 2) return [...NON_INVESTOR_SCORE_TAG_TIERS["2"]];
  return [...NON_INVESTOR_SCORE_TAG_TIERS["1"]];
}

/** Full tag vocabulary (all tiers), for config / exports. */
export const NON_INVESTOR_TAGS = [
  ...NON_INVESTOR_SCORE_TAG_TIERS["10"],
  ...NON_INVESTOR_SCORE_TAG_TIERS["9"],
  ...NON_INVESTOR_SCORE_TAG_TIERS["8"],
  ...NON_INVESTOR_SCORE_TAG_TIERS["7"],
  ...NON_INVESTOR_SCORE_TAG_TIERS["5-6"],
  ...NON_INVESTOR_SCORE_TAG_TIERS["4"],
  ...NON_INVESTOR_SCORE_TAG_TIERS["3"],
  ...NON_INVESTOR_SCORE_TAG_TIERS["2"],
  ...NON_INVESTOR_SCORE_TAG_TIERS["1"],
] as const;

export const INVESTOR_TAGS = [
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

export const reviewFormCopy = {
  unlinked: {
    title: "Rate your interaction",
    review_type: "non_investor_interaction_review" as const,
    questions: [
      {
        id: "overall_interaction",
        label: "How was your experience with this firm?",
        type: "single_select" as const,
        /** Stored as string digits; UI renders 1–10 scale with tier copy (see ReviewSubmissionModal). */
        options: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
      },
      {
        id: "would_engage_again",
        label: "Would you engage with this investor again?",
        type: "segmented_select" as const,
        options: [
          "Definitely yes",
          "Likely yes",
          "Maybe",
          "Probably not",
          "Definitely not",
        ],
      },
      {
        id: "characterize_interaction",
        label: "Characterize your interaction.",
        type: "characterize_interaction" as const,
      },
      {
        id: "founder_note",
        label: "Anything another founder should know?",
        type: "text" as const,
        optional: true as const,
      },
    ],
    tags: [...NON_INVESTOR_TAGS],
    category_mapping: {
      responsiveness: {
        source_fields: ["overall_interaction", "would_engage_again", "founder_note"],
        confidence: "high" as const,
      },
      transparency: {
        source_fields: ["overall_interaction", "founder_note"],
        confidence: "high" as const,
      },
      founder_friendliness: {
        source_fields: ["overall_interaction", "would_engage_again", "founder_note"],
        confidence: "medium" as const,
      },
      strategic_value: {
        source_fields: ["overall_interaction", "founder_note"],
        confidence: "low" as const,
      },
      operational_value_add_credibility: {
        source_fields: ["founder_note", "overall_interaction"],
        confidence: "low" as const,
      },
      network_quality: {
        source_fields: [
          "interaction_intro",
          "interaction_intro_other",
          "interaction_warm_intro_who",
          "interaction_cold_inbound_discovery",
          "interaction_cold_inbound_social_platform",
          "interaction_cold_inbound_social_other",
          "interaction_event_type",
          "interaction_event_type_other",
          "interaction_event_followup",
          "interaction_event_followup_first",
          "interaction_how",
          "interaction_remembered_who_names",
          "interaction_remembered_who_vc_person_ids",
          "interaction_remembered_who_roles",
          "interaction_remembered_who_included_unknown_others",
          "interaction_participant_memory_mode",
          "founder_note",
        ],
        confidence: "low" as const,
      },
      follow_through: {
        source_fields: [
          "overall_interaction",
          "would_engage_again",
          "founder_note",
          "interaction_event_followup",
          "interaction_event_followup_first",
        ],
        confidence: "high" as const,
      },
      domain_industry_expertise: {
        source_fields: ["overall_interaction", "founder_note"],
        confidence: "low" as const,
      },
      trustworthiness: {
        source_fields: [
          "would_engage_again",
          "overall_interaction",
          "founder_note",
          "interaction_event_followup",
          "interaction_event_followup_first",
        ],
        confidence: "medium" as const,
      },
    },
  },
  linked: {
    title: "Rate your investor relationship",
    review_type: "investor_relationship_review" as const,
    questions: [
      {
        id: "work_with_them_rating",
        label: "How has this investor been to work with?",
        type: "single_select" as const,
        options: ["Great", "Good", "Mixed", "Poor"],
      },
      {
        id: "take_money_again",
        label: "Would you take money from them again?",
        type: "single_select" as const,
        options: ["Yes", "No", "Not sure"],
      },
      {
        id: "standout_tags",
        label: "What stood out most?",
        type: "multi_select" as const,
        options: [...INVESTOR_TAGS],
      },
      {
        id: "founder_note",
        label: "Anything another founder should know?",
        type: "text" as const,
        optional: true as const,
      },
    ],
    tags: [...INVESTOR_TAGS],
    category_mapping: {
      responsiveness: {
        source_fields: ["Responsive", "Hard to reach"],
        confidence: "high" as const,
      },
      transparency: {
        source_fields: ["Transparent"],
        confidence: "high" as const,
      },
      founder_friendliness: {
        source_fields: ["Founder-friendly"],
        confidence: "high" as const,
      },
      strategic_value: {
        source_fields: ["Strategic"],
        confidence: "high" as const,
      },
      operational_value_add_credibility: {
        source_fields: ["Helpful operator", "Limited value-add"],
        confidence: "high" as const,
      },
      network_quality: {
        source_fields: ["Strong network"],
        confidence: "high" as const,
      },
      follow_through: {
        source_fields: ["Follows through", "Low follow-through"],
        confidence: "high" as const,
      },
      domain_industry_expertise: {
        source_fields: ["Deep domain expertise"],
        confidence: "high" as const,
      },
      trustworthiness: {
        source_fields: [
          "work_with_them_rating",
          "take_money_again",
          "Transparent",
          "Follows through",
          "Helpful in hard times",
        ],
        confidence: "high" as const,
      },
    },
  },
} as const;
