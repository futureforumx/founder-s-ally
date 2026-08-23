import {
  GRAVITY_EXPONENT,
  GRAVITY_OFFSET_HOURS,
  GROWTH_DELTA_OFFSET,
  PLATFORM_WEIGHTS,
  SENTIMENT_MULTIPLIER,
  type SentimentTone,
  type SignalBreakdown,
  type SignalKey,
} from "./types";

const SIGNAL_KEYS = Object.keys(PLATFORM_WEIGHTS) as SignalKey[];

export function zScore(value: number, mean: number, std: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(mean)) return 0;
  if (!Number.isFinite(std) || std <= 0) return 0;
  return (value - mean) / std;
}

export function meanAndStd(values: number[]): { mean: number; std: number } {
  if (values.length === 0) return { mean: 0, std: 0 };
  const mean = values.reduce((sum, n) => sum + n, 0) / values.length;
  if (values.length === 1) return { mean, std: 0 };
  const variance = values.reduce((sum, n) => sum + (n - mean) ** 2, 0) / (values.length - 1);
  return { mean, std: Math.sqrt(variance) };
}

export function zScoresAgainstBaseline(
  raw: SignalBreakdown,
  baseline: Record<SignalKey, { mean: number; std: number }>,
): SignalBreakdown {
  const out = { launch: 0, social: 0, developer: 0, traction: 0 };
  for (const key of SIGNAL_KEYS) {
    out[key] = zScore(raw[key], baseline[key].mean, baseline[key].std);
  }
  return out;
}

export function baselineFromObservations(rows: SignalBreakdown[]): Record<SignalKey, { mean: number; std: number }> {
  const baseline = {
    launch: { mean: 0, std: 0 },
    social: { mean: 0, std: 0 },
    developer: { mean: 0, std: 0 },
    traction: { mean: 0, std: 0 },
  };
  for (const key of SIGNAL_KEYS) {
    baseline[key] = meanAndStd(rows.map((row) => row[key]));
  }
  return baseline;
}

export function sentimentMultiplier(tone: SentimentTone): number {
  return SENTIMENT_MULTIPLIER[tone];
}

export function weightedSignalSum(zScores: SignalBreakdown): { weighted: SignalBreakdown; sum: number } {
  const weighted = { launch: 0, social: 0, developer: 0, traction: 0 };
  let sum = 0;
  for (const key of SIGNAL_KEYS) {
    const value = PLATFORM_WEIGHTS[key] * zScores[key];
    weighted[key] = value;
    sum += value;
  }
  return { weighted, sum };
}

/** ((Current_24h - Baseline_30d) / (Baseline_30d + 100)) — never raw mention/star volume. */
export function relativeGrowthDelta(current24h: number, baseline30d: number): number {
  if (!Number.isFinite(current24h) || !Number.isFinite(baseline30d)) return 0;
  const baseline = Math.max(0, baseline30d);
  return (current24h - baseline) / (baseline + GROWTH_DELTA_OFFSET);
}

export function relativeGrowthDeltas(current24h: SignalBreakdown, baseline30d: SignalBreakdown): SignalBreakdown {
  const out = { launch: 0, social: 0, developer: 0, traction: 0 };
  for (const key of SIGNAL_KEYS) {
    out[key] = relativeGrowthDelta(current24h[key], baseline30d[key]);
  }
  return out;
}

/**
 * Time-decay gravity score:
 * (Sum(Weight_i * ZScore_i) * SentimentMultiplier) / (HoursElapsed + 2)^1.5
 */
export function gravityScore(input: {
  zScores: SignalBreakdown;
  sentiment: SentimentTone;
  hoursElapsed: number;
}): { score: number; weighted: SignalBreakdown; multiplier: number } {
  const hours = Number.isFinite(input.hoursElapsed) ? Math.max(0, input.hoursElapsed) : 0;
  const { weighted, sum } = weightedSignalSum(input.zScores);
  const multiplier = sentimentMultiplier(input.sentiment);
  const denom = (hours + GRAVITY_OFFSET_HOURS) ** GRAVITY_EXPONENT;
  return {
    score: denom === 0 ? 0 : (sum * multiplier) / denom,
    weighted,
    multiplier,
  };
}

export function normalizeScoresToHundred(scores: number[]): number[] {
  if (scores.length === 0) return [];
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  if (max === min) return scores.map(() => 72);
  return scores.map((score) => {
    const t = (score - min) / (max - min);
    return Math.round((18 + t * 80) * 10) / 10;
  });
}
