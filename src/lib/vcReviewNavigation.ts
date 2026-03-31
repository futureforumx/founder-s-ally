/** Dispatched from Settings → Activity (and similar) to open Investor Match with the review modal. */
export const VEKTA_OPEN_VC_REVIEW_EVENT = "vekta-open-vc-review";

export type VcReviewOpenDetail = {
  /** `vc_firms.id` — required for loading the saved `vc_ratings` row. */
  vcFirmId: string;
  firmName: string;
  vcPersonId?: string | null;
  /** `vc_ratings.id` — for debugging / future deep links; modal resolves by firm + person. */
  ratingId: string;
  investorDatabaseId?: string | null;
};
