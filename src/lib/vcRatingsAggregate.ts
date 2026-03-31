/** Row shape from `public.vc_ratings` (PostgREST / Prisma @@map). */
export type VcRatingRow = {
  id: string;
  author_user_id: string | null;
  interaction_type: string;
  interaction_date: string | null;
  interaction_detail: string | null;
  score_resp: number | null;
  score_respect: number | null;
  score_feedback: number | null;
  score_follow_thru: number | null;
  score_value_add: number | null;
  nps: number | null;
  comment: string | null;
  anonymous: boolean;
  verified: boolean;
  is_draft?: boolean;
  created_at: string;
};

export const INTERACTION_DISPLAY: Record<string, string> = {
  meeting: "Meeting / event",
  email: "Email / outbound",
  intro: "Intro",
  passed: "Passed",
  ongoing: "Ongoing",
  other: "Other",
  investor_relationship: "Investor relationship",
  review_draft: "Draft review",
  review_draft_investor: "Draft review",
};

export function rowDimensionalAvg(row: VcRatingRow): number | null {
  const vals = [
    row.score_resp,
    row.score_respect,
    row.score_feedback,
    row.score_follow_thru,
    row.score_value_add,
  ].filter((v): v is number => typeof v === "number" && v >= 1 && v <= 5);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Classic NPS: % promoters (9–10) minus % detractors (0–6), −100…100. */
export function npsIndex(npsScores: number[]): number {
  if (npsScores.length === 0) return 0;
  const promoters = npsScores.filter((s) => s >= 9).length;
  const detractors = npsScores.filter((s) => s <= 6).length;
  return Math.round(((promoters - detractors) / npsScores.length) * 100);
}

export function aggregateVcRatings(rows: VcRatingRow[]) {
  const published = rows.filter((r) => !r.is_draft);
  const byType = new Map<string, VcRatingRow[]>();
  for (const r of published) {
    const k = r.interaction_type || "other";
    const arr = byType.get(k) ?? [];
    arr.push(r);
    byType.set(k, arr);
  }
  const avgs = published.map(rowDimensionalAvg).filter((x): x is number => x != null);
  const overallStars = avgs.length ? avgs.reduce((a, b) => a + b, 0) / avgs.length : null;
  const npsScores = published
    .filter((r) => typeof r.nps === "number")
    .map((r) => r.nps as number);
  const breakdown = [...byType.entries()]
    .map(([interactionType, list]) => {
      const das = list.map(rowDimensionalAvg).filter((x): x is number => x != null);
      const avgStars = das.length ? das.reduce((a, b) => a + b, 0) / das.length : null;
      return { interactionType, count: list.length, avgStars };
    })
    .sort((a, b) => b.count - a.count);
  return {
    count: published.length,
    overallStars,
    nps: npsIndex(npsScores),
    breakdown,
  };
}
