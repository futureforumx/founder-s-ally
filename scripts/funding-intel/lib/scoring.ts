/**
 * Transparent scoring for firm / investor market intel (formula_version intel_v1).
 * All intermediate values are returned for persistence in *_components_json.
 */

export type PaceLabel = "accelerating" | "steady" | "slowing" | "insufficient_data";

export type ActivityComponentsV1 = {
  deals_weighted_365: number;
  deals_weighted_90: number;
  deals_weighted_30: number;
  leads_weighted_90: number;
  participants_weighted_90: number;
  article_corroboration_90: number;
  /** Caps used in normalization */
  cap_deals_weighted: number;
  cap_leads_weighted: number;
};

export type MomentumComponentsV1 = {
  pace_recent: number;
  pace_prior: number;
  /** prior window = weighted deal activity in days 31–90 */
  deals_weighted_30_90: number;
};

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

function norm(x: number, cap: number): number {
  if (cap <= 0) return 0;
  return clamp(x / cap, 0, 1);
}

/** Exponential recency weight: more recent deals count more. */
export function recencyWeight(eventDate: Date, asOf: Date): number {
  const ms = asOf.getTime() - eventDate.getTime();
  const days = ms / (86_400_000);
  if (days < 0) return 1;
  return Math.exp(-days / 90);
}

/**
 * activity_score ∈ [0,100] — weighted blend of recency-weighted deal volume,
 * lead intensity, participant breadth, and article corroboration.
 */
export function computeActivityScoreV1(c: ActivityComponentsV1): { score: number; components: ActivityComponentsV1 } {
  const nd = norm(c.deals_weighted_365, c.cap_deals_weighted);
  const nl = norm(c.leads_weighted_90, c.cap_leads_weighted);
  const np = norm(c.participants_weighted_90, c.cap_leads_weighted * 1.5);
  const nc = norm(c.article_corroboration_90, 12);
  const score = 100 * clamp(0.45 * nd + 0.3 * nl + 0.15 * np + 0.1 * nc, 0, 1);
  return { score, components: c };
}

/**
 * momentum_score ∈ [0,100] — compares last 30d weighted activity vs 31–90d window.
 */
export function computeMomentumScoreV1(m: MomentumComponentsV1): {
  score: number;
  components: MomentumComponentsV1 & { momentum_ratio: number | null };
  pace: PaceLabel;
} {
  const prior = Math.max(m.pace_prior, 1e-6);
  const recent = m.pace_recent;
  const ratio = recent <= 0 && m.deals_weighted_30_90 <= 0 ? null : recent / prior;

  let pace: PaceLabel = "insufficient_data";
  let score = 50;
  if (ratio != null && Number.isFinite(ratio)) {
    if (ratio > 1.25) pace = "accelerating";
    else if (ratio < 0.75) pace = "slowing";
    else pace = "steady";
    score = 50 + 50 * Math.tanh(ratio - 1);
    score = clamp(score, 0, 100);
  }

  return { score, components: { ...m, momentum_ratio: ratio }, pace };
}

export function topBuckets(counts: Record<string, number>, n = 5): { key: string; count: number }[] {
  return Object.entries(counts)
    .filter(([k]) => k && k.length)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }));
}
