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
// Non-investor interaction tags
// ---------------------------------------------------------------------------
export const NON_INVESTOR_TAGS = [
  "Responsive",
  "Helpful",
  "Clear thesis",
  "Fast pass",
  "No follow-up",
  "Hard to read",
  "Strong feedback",
] as const;

// ---------------------------------------------------------------------------
// Investor relationship tags (also used as multi_select options for Q3)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------
export function buildReviewFormConfig(params: BuildReviewFormParams): ReviewFormConfig {
  const { firm_id, company_id, mapping_record_id, investor_is_mapped_to_profile, firm_name } = params;

  // ── A: Non-investor interaction review ───────────────────────────────────
  if (!investor_is_mapped_to_profile) {
    return {
      firm_id,
      company_id,
      mapping_record_id,
      investor_is_mapped_to_profile: false,
      review_type: "non_investor_interaction_review",
      title: "Rate your interaction",
      subtitle: firm_name,
      questions: [
        {
          id: "interaction_type",
          label: "What type of interaction did you have?",
          type: "single_select",
          options: [
            "Took meeting/call",
            "Sent email/warm intro",
            "Got intro",
            "Passed after meeting",
            "Ongoing conversation",
            "Other",
          ],
        },
        {
          id: "overall_interaction",
          label: "How was the interaction overall?",
          type: "single_select",
          options: ["Great", "Good", "Mixed", "Poor"],
        },
        {
          id: "response_time",
          label: "Did they respond in a reasonable time?",
          type: "single_select",
          options: ["Yes", "Somewhat", "No"],
        },
        {
          id: "would_engage_again",
          label: "Would you engage again?",
          type: "single_select",
          options: ["Yes", "No", "Not sure"],
        },
        {
          id: "founder_note",
          label: "Anything another founder should know?",
          type: "text",
          optional: true,
        },
      ],
      tags: [...NON_INVESTOR_TAGS],
      category_mapping: {
        responsiveness: {
          source_fields: ["response_time", "Responsive", "No follow-up"],
          confidence: "high",
        },
        transparency: {
          source_fields: ["overall_interaction", "Clear thesis", "Fast pass", "Hard to read"],
          confidence: "high",
        },
        founder_friendliness: {
          source_fields: ["overall_interaction", "would_engage_again", "Helpful", "Fast pass"],
          confidence: "medium",
        },
        strategic_value: {
          source_fields: ["Helpful", "Strong feedback", "overall_interaction"],
          confidence: "low",
        },
        operational_value_add_credibility: {
          source_fields: ["Helpful", "founder_note"],
          confidence: "low",
        },
        network_quality: {
          source_fields: ["interaction_type", "founder_note"],
          confidence: "low",
        },
        follow_through: {
          source_fields: ["response_time", "Responsive", "No follow-up", "Fast pass"],
          confidence: "high",
        },
        domain_industry_expertise: {
          source_fields: ["Strong feedback", "Clear thesis", "founder_note"],
          confidence: "low",
        },
        trustworthiness: {
          source_fields: ["would_engage_again", "Clear thesis", "No follow-up", "Hard to read", "Fast pass"],
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
    title: "Rate your investor relationship",
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
        label: "What stood out most?",
        type: "multi_select",
        options: [...INVESTOR_TAGS],
      },
      {
        id: "founder_note",
        label: "Anything another founder should know?",
        type: "text",
        optional: true,
      },
    ],
    tags: [...INVESTOR_TAGS],
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

const RESPONSE_SCORE: Record<string, number> = {
  Yes: 5,
  Somewhat: 3,
  No: 1,
};

const ENGAGE_NPS: Record<string, number> = {
  Yes: 10,
  "Not sure": 6,
  No: 0,
};

export function deriveNonInvestorScores(answers: Record<string, string | string[]>) {
  return {
    score_resp: RESPONSE_SCORE[answers.response_time as string] ?? null,
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
