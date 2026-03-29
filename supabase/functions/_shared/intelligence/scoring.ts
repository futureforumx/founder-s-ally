import type { ScoreComponents } from "./types.ts";

export function scoreEvent(input: {
  sourceCredibility: number;
  eventTypeRarity: number;
  recencyHours: number;
  watchlistBoost: number;
  entityBoost: number;
}): ScoreComponents {
  const recency = Math.max(0, 1 - Math.min(168, input.recencyHours) / 168);
  const confidence = clamp(
    0.35 + input.sourceCredibility * 0.35 + recency * 0.15 + input.watchlistBoost * 0.15,
  );
  const importance = clamp(
    0.3 + input.eventTypeRarity * 0.25 + input.entityBoost * 0.25 + recency * 0.2,
  );
  const relevance = clamp(
    0.35 + input.watchlistBoost * 0.35 + input.entityBoost * 0.2 + recency * 0.1,
  );
  return {
    confidence: round4(confidence),
    importance: round4(importance),
    relevance: round4(relevance),
  };
}

function clamp(x: number): number {
  return Math.min(0.98, Math.max(0.12, x));
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

/** Lower frequency types score higher (rough prior). */
export function rarityForEventType(code: string): number {
  const rare = new Set([
    "new_fund_closed",
    "acquisition_announced",
    "thesis_shift_detected",
    "stealth_company_detected",
    "regulatory_update",
  ]);
  const mid = new Set([
    "partner_joined_firm",
    "partner_left_firm",
    "executive_hired",
    "executive_departed",
    "layoffs_announced",
  ]);
  if (rare.has(code)) return 0.9;
  if (mid.has(code)) return 0.65;
  return 0.5;
}
