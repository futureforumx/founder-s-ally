import {
  CHARACTERIZE_INTERACTION_HOW,
  CHARACTERIZE_MEETING_DEPTH_OPTIONS,
  CHARACTERIZE_INTRO_OPTIONS,
  CHARACTERIZE_WARM_INTRO_WHO_INITIATED,
  CHARACTERIZE_COLD_INBOUND_DISCOVERY,
  CHARACTERIZE_COLD_INBOUND_SOCIAL_PLATFORMS,
  CHARACTERIZE_EVENT_TYPES,
  CHARACTERIZE_EVENT_FOLLOWUP,
  CHARACTERIZE_EVENT_FOLLOWUP_FIRST,
  NON_INVESTOR_SCORE_TAG_TIERS,
} from "@/lib/reviewFormContent";

// ---------------------------------------------------------------------------
// buildReviewFormConfig.ts
// Builds the full review form JSON config for a given investor/firm context.
// The source-of-truth for which form to show is `investor_is_mapped_to_profile`.
//   true  → investor relationship review  (firm is in founder's cap table)
//   false → non-investor interaction review (prospect / intro / outreach)
// ---------------------------------------------------------------------------

export type ReviewCategory =
  | "responsiveness"
  | "transparency"
  | "founder_friendliness"
  | "strategic_value"
  | "operational_value_add_credibility"
  | "network_quality"
  | "follow_through"
  | "domain_industry_expertise"
  | "trustworthiness";

export type ConfidenceLevel = "high" | "medium" | "low";

export interface FormQuestion {
  id: string;
  label: string;
  type: "single_select" | "multi_select" | "text";
  options?: string[];
  optional?: true;
}

export interface CategoryMapping {
  source_fields: string[];
  confidence: ConfidenceLevel;
}

export interface ReviewFormConfig {
  firm_id: string;
  company_id: string;
  mapping_record_id: string | null;
  investor_is_mapped_to_profile: boolean;
  review_type: "non_investor_interaction_review" | "investor_relationship_review";
  title: string;
  subtitle: string;
  questions: FormQuestion[];
  tags: string[];
  category_mapping: Record<ReviewCategory, CategoryMapping>;
}

export interface BuildReviewFormParams {
  firm_id: string;
  company_id: string;
  mapping_record_id: string | null;
  investor_is_mapped_to_profile: boolean;
  /** Display name used as the subtitle */
  firm_name: string;
}

// ---------------------------------------------------------------------------
// Show conditions for conditional fields
// ---------------------------------------------------------------------------

/** Show origin-specific follow-up questions based on interaction_intro value */
export function shouldShowOriginFollowUps(
  introValue: string | undefined,
): boolean {
  return introValue !== undefined && introValue !== "" &&
    introValue !== "Existing relationship";
}

/** Show follow-up after event question only when origin = Event */
export function shouldShowFollowUpAfterEventQuestion(
  answers: Record<string, string | string[] | undefined>,
): boolean {
  const intro = answers.interaction_intro;
  return typeof intro === "string" && intro === "Event";
}

/** Show remember-who section after at least one channel is selected */
export function shouldShowRememberWhoSection(selectedChannels: string[]): boolean {
  return selectedChannels.length > 0;
}

// ---------------------------------------------------------------------------
// Non-investor interaction review
// ---------------------------------------------------------------------------

export function buildReviewFormConfig(params: BuildReviewFormParams): ReviewFormConfig {
  const { firm_id, company_id, mapping_record_id, investor_is_mapped_to_profile, firm_name } = params;
  const firmEngagementLabel = `How much have you engaged with ${firm_name.trim() || "this firm"}?`;

  // ── A: Non-investor interaction review ───────────────────────────────────
  if (!investor_is_mapped_to_profile) {
    return {
      firm_id,
      company_id,
      mapping_record_id,
      investor_is_mapped_to_profile: false,
      review_type: "non_investor_interaction_review",
      title: "How was your interaction?",
      subtitle: firm_name,
      questions: [
        {
          id: "interaction_intro",
          label: "Relationship origin:",
          type: "single_select",
          options: [...CHARACTERIZE_INTRO_OPTIONS],
        },
        {
          id: "interaction_intro_other",
          label: "How did you connect?",
          type: "text",
        },
        // Warm intro follow-up
        {
          id: "interaction_warm_intro_who",
          label: "Who initiated?",
          type: "single_select",
          options: [...CHARACTERIZE_WARM_INTRO_WHO_INITIATED],
        },
        // Cold inbound follow-ups
        {
          id: "interaction_cold_inbound_discovery",
          label: "How did they reach out?",
          type: "single_select",
          options: [...CHARACTERIZE_COLD_INBOUND_DISCOVERY],
        },
        {
          id: "interaction_cold_inbound_social_platform",
          label: "Which platform?",
          type: "single_select",
          options: [...CHARACTERIZE_COLD_INBOUND_SOCIAL_PLATFORMS],
        },
        {
          id: "interaction_cold_inbound_social_other",
          label: "Other platform",
          type: "text",
          optional: true,
        },
        // Event follow-ups
        {
          id: "interaction_event_type",
          label: "What type of event?",
          type: "single_select",
          options: [...CHARACTERIZE_EVENT_TYPES],
        },
        {
          id: "interaction_event_type_other",
          label: "Please specify",
          type: "text",
          optional: true,
        },
        {
          id: "interaction_event_followup",
          label: "Was there follow-up after the event?",
          type: "single_select",
          options: [...CHARACTERIZE_EVENT_FOLLOWUP],
        },
        {
          id: "interaction_event_followup_first",
          label: "Who followed up first?",
          type: "single_select",
          options: [...CHARACTERIZE_EVENT_FOLLOWUP_FIRST],
        },
        // Core context questions
        {
          id: "interaction_how",
          label: "How did you interact?",
          type: "multi_select",
          options: [...CHARACTERIZE_INTERACTION_HOW],
        },
        {
          id: "interaction_meeting_depth",
          label: firmEngagementLabel,
          type: "single_select",
          options: [...CHARACTERIZE_MEETING_DEPTH_OPTIONS],
        },
        // Evaluation questions  
        {
          id: "overall_interaction",
          label: "Overall experience (1–10)",
          type: "single_select",
          options: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"],
        },
        {
          id: "would_engage_again",
          label: "Would you engage with this investor again?",
          type: "single_select",
          options: [
            "Definitely yes",
            "Likely yes",
            "Maybe",
            "Probably not",
            "Definitely not",
          ],
        },
        // Note
        {
          id: "founder_note",
          label: "Anything another founder should know?",
          type: "text",
          optional: true,
        },
      ],
      tags: [
        ...Object.values(NON_INVESTOR_SCORE_TAG_TIERS)
          .flat()
          .filter((tag, i, arr) => arr.indexOf(tag) === i), // dedup
      ],
      category_mapping: {
        responsiveness: {
          source_fields: ["Responsive", "overall_interaction"],
          confidence: "high",
        },
        transparency: {
          source_fields: ["Clear thesis", "Hard to read", "overall_interaction"],
          confidence: "high",
        },
        founder_friendliness: {
          source_fields: ["overall_interaction", "would_engage_again", "Helpful"],
          confidence: "medium",
        },
        strategic_value: {
          source_fields: ["Helpful", "Strong feedback"],
          confidence: "low",
        },
        operational_value_add_credibility: {
          source_fields: ["Helpful", "founder_note"],
          confidence: "low",
        },
        network_quality: {
          source_fields: ["interaction_how", "founder_note"],
          confidence: "low",
        },
        follow_through: {
          source_fields: ["Responsive", "No follow-up", "overall_interaction"],
          confidence: "high",
        },
        domain_industry_expertise: {
          source_fields: ["Strong feedback", "Clear thesis"],
          confidence: "low",
        },
        trustworthiness: {
          source_fields: ["would_engage_again", "overall_interaction"],
          confidence: "medium",
        },
      },
    };
  }

  // ── B: Investor relationship review ──────────────────────────────────────
  return {
    firm_id,
    company_id,
    mapping_record_id,
    investor_is_mapped_to_profile: true,
    review_type: "investor_relationship_review",
    title: "How has this partnership been?",
    subtitle: firm_name,
    questions: [
      {
        id: "work_with_them_rating",
        label: "How has this investor been to work with?",
        type: "single_select",
        options: ["Great", "Good", "Mixed", "Poor"],
      },
      {
        id: "take_money_again",
        label: "Would you take money from them again?",
        type: "single_select",
        options: ["Yes", "No", "Not sure"],
      },
      {
        id: "standout_tags",
        label: "What stood out most? (optional)",
        type: "multi_select",
        options: [
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
        ],
      },
      {
        id: "founder_note",
        label: "Anything another founder should know?",
        type: "text",
        optional: true,
      },
    ],
    tags: [
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
    ],
    category_mapping: {
      responsiveness: {
        source_fields: ["Responsive", "Hard to reach"],
        confidence: "high",
      },
      transparency: {
        source_fields: ["Transparent"],
        confidence: "high",
      },
      founder_friendliness: {
        source_fields: ["Founder-friendly"],
        confidence: "high",
      },
      strategic_value: {
        source_fields: ["Strategic"],
        confidence: "high",
      },
      operational_value_add_credibility: {
        source_fields: ["Helpful operator", "Limited value-add"],
        confidence: "high",
      },
      network_quality: {
        source_fields: ["Strong network"],
        confidence: "high",
      },
      follow_through: {
        source_fields: ["Follows through", "Low follow-through"],
        confidence: "high",
      },
      domain_industry_expertise: {
        source_fields: ["Deep domain expertise"],
        confidence: "high",
      },
      trustworthiness: {
        source_fields: [
          "work_with_them_rating",
          "take_money_again",
          "Transparent",
          "Follows through",
          "Helpful in hard times",
        ],
        confidence: "high",
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Score helpers — map categorical answers → legacy vc_ratings score columns
// so existing aggregation logic (vcRatingsAggregate.ts) keeps working.
// ---------------------------------------------------------------------------

const RATING_SCORE: Record<string, number> = {
  Great: 5,
  Good: 4,
  Mixed: 2,
  Poor: 1,
};

const ENGAGE_NPS: Record<string, number> = {
  "Definitely yes": 10,
  "Likely yes": 8,
  Maybe: 5,
  "Probably not": 2,
  "Definitely not": 0,
  // Legacy stored answers
  Yes: 10,
  "Not sure": 6,
  No: 0,
};

export function deriveNonInvestorScores(answers: Record<string, string | string[]>) {
  return {
    score_resp: null,
    score_respect: RATING_SCORE[answers.overall_interaction as string] ?? null,
    score_feedback: null,
    score_follow_thru: null,
    score_value_add: null,
    nps: ENGAGE_NPS[answers.would_engage_again as string] ?? null,
  };
}

export function deriveInvestorScores(answers: Record<string, string | string[]>) {
  const rating = RATING_SCORE[answers.work_with_them_rating as string] ?? null;
  return {
    score_resp: rating,
    score_respect: rating,
    score_feedback: null,
    score_follow_thru: null,
    score_value_add: null,
    nps: ENGAGE_NPS[answers.take_money_again as string] ?? null,
  };
}
