export type InteractionKey = "meeting" | "email" | "intro" | "other";

function z(n: unknown): number | null {
  return typeof n === "number" && n >= 1 && n <= 5 ? n : null;
}

/** Maps UI star keys into the five nullable `vc_ratings.score_*` columns. */
export function mapReviewStarsToVcRatingScores(
  interactionType: InteractionKey,
  starRatings: Record<string, number>,
): {
  score_resp: number | null;
  score_respect: number | null;
  score_feedback: number | null;
  score_follow_thru: number | null;
  score_value_add: number | null;
} {
  switch (interactionType) {
    case "meeting":
      return {
        score_resp: z(starRatings.timeliness),
        score_respect: z(starRatings.respect),
        score_feedback: z(starRatings.feedback_quality),
        score_follow_thru: z(starRatings.follow_through),
        score_value_add: z(starRatings.value_add),
      };
    case "email":
      return {
        score_resp: z(starRatings.response_time),
        score_respect: z(starRatings.professionalism),
        score_feedback: z(starRatings.helpfulness),
        score_follow_thru: null,
        score_value_add: null,
      };
    case "intro":
      return {
        score_resp: z(starRatings.intro_quality),
        score_respect: z(starRatings.responsiveness),
        score_feedback: null,
        score_follow_thru: null,
        score_value_add: null,
      };
    case "other":
      return {
        score_resp: z(starRatings.overall),
        score_respect: null,
        score_feedback: null,
        score_follow_thru: null,
        score_value_add: null,
      };
    default:
      return {
        score_resp: null,
        score_respect: null,
        score_feedback: null,
        score_follow_thru: null,
        score_value_add: null,
      };
  }
}
