// ---------------------------------------------------------------------------
// buildReviewFormConfig.ts
// Assembles ReviewFormConfig from `reviewFormContent.ts` + request context.
// Which branch is used depends on `investor_is_mapped_to_profile` (cap table match).
// ---------------------------------------------------------------------------

import { reviewFormCopy, NON_INVESTOR_TAGS, INVESTOR_TAGS } from "@/lib/reviewFormContent";

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
  type: "single_select" | "segmented_select" | "multi_select" | "text" | "characterize_interaction";
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

export { NON_INVESTOR_TAGS, INVESTOR_TAGS };

export function buildReviewFormConfig(params: BuildReviewFormParams): ReviewFormConfig {
  const { firm_id, company_id, mapping_record_id, investor_is_mapped_to_profile, firm_name } = params;

  if (!investor_is_mapped_to_profile) {
    const c = reviewFormCopy.unlinked;
    return {
      firm_id,
      company_id,
      mapping_record_id,
      investor_is_mapped_to_profile: false,
      review_type: c.review_type,
      title: c.title,
      subtitle: firm_name,
      questions: c.questions.map((q) => ({ ...q })),
      tags: [...c.tags],
      category_mapping: c.category_mapping as ReviewFormConfig["category_mapping"],
    };
  }

  const c = reviewFormCopy.linked;
  return {
    firm_id,
    company_id,
    mapping_record_id,
    investor_is_mapped_to_profile: true,
    review_type: c.review_type,
    title: c.title,
    subtitle: firm_name,
    questions: c.questions.map((q) => ({ ...q })),
    tags: [...c.tags],
    category_mapping: c.category_mapping as ReviewFormConfig["category_mapping"],
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

/** Map intro + meetings characterization → `vc_ratings.interaction_type` bucket. */
export function deriveInteractionTypeFromCharacterization(
  intro: string | undefined,
  _meetings: string | undefined,
): string {
  switch (intro) {
    case "Warm intro":
    case "Cold inbound":
      return "intro";
    case "Cold outbound":
      return "email";
    case "Event":
      return "meeting";
    case "Existing relationship":
      return "ongoing";
    case "Other":
      return "other";
    default:
      return "other";
  }
}

/** Map 1–10 overall score → legacy `score_respect` (1–5) for aggregation (`vcRatingsAggregate`). */
export function mapOverallTenToRespectScore(n: number): number | null {
  if (!Number.isFinite(n) || n < 1 || n > 10) return null;
  return Math.round(1 + ((n - 1) * 4) / 9);
}

const RESPONSE_SCORE: Record<string, number> = {
  Yes: 5,
  Somewhat: 3,
  No: 1,
};

const ENGAGE_NPS: Record<string, number> = {
  Yes: 10,
  "Not sure": 6,
  No: 0,
  "Definitely yes": 10,
  "Likely yes": 8,
  Maybe: 5,
  "Probably not": 2,
  "Definitely not": 0,
};

export function deriveNonInvestorScores(answers: Record<string, string | string[]>) {
  const overallRaw = answers.overall_interaction as string | undefined;
  const overallN = overallRaw != null ? parseInt(overallRaw, 10) : NaN;
  const score_respect =
    Number.isFinite(overallN) && overallN >= 1 && overallN <= 10
      ? mapOverallTenToRespectScore(overallN)
      : (RATING_SCORE[overallRaw as string] ?? null);

  return {
    score_resp: RESPONSE_SCORE[answers.response_time as string] ?? null,
    score_respect,
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
