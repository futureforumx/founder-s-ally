/**
 * stage-parser.ts
 * ================
 * Normalize stage strings ("Seed", "series a", "Pre-seed") to a canonical
 * ordered enum, and rank min/max for a firm.
 */

export const STAGE_ORDER = [
  "pre_seed",
  "seed",
  "series_a",
  "series_b",
  "series_c",
  "series_d_plus",
  "growth",
  "late_stage",
] as const;

export type CanonicalStage = (typeof STAGE_ORDER)[number];

const ALIASES: Array<{ rx: RegExp; canon: CanonicalStage }> = [
  { rx: /\bpre[\s-]?seed\b/i,                canon: "pre_seed" },
  { rx: /\bseed\b/i,                          canon: "seed" },
  { rx: /\bseries[\s-]?a\b/i,                 canon: "series_a" },
  { rx: /\bseries[\s-]?b\b/i,                 canon: "series_b" },
  { rx: /\bseries[\s-]?c\b/i,                 canon: "series_c" },
  { rx: /\bseries[\s-]?[d-z]\+?\b/i,          canon: "series_d_plus" },
  { rx: /\bseries[\s-]?b\+/i,                 canon: "series_b" },
  { rx: /\bgrowth\b/i,                        canon: "growth" },
  { rx: /\b(late[\s-]?stage|pre[\s-]?ipo)\b/i, canon: "late_stage" },
];

export function canonicalizeStage(input: string | null | undefined): CanonicalStage | null {
  if (!input) return null;
  for (const { rx, canon } of ALIASES) if (rx.test(input)) return canon;
  return null;
}

export function canonicalizeStages(inputs: Array<string | null | undefined>): CanonicalStage[] {
  const out = new Set<CanonicalStage>();
  for (const s of inputs) {
    const c = canonicalizeStage(s);
    if (c) out.add(c);
  }
  return [...out].sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b));
}

export function stageMinMax(stages: CanonicalStage[]): { min: CanonicalStage | null; max: CanonicalStage | null } {
  if (!stages.length) return { min: null, max: null };
  const sorted = [...stages].sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b));
  return { min: sorted[0], max: sorted[sorted.length - 1] };
}

/**
 * Display values MUST match the `stage_focus_enum` values in the database:
 *   "Friends and Family" | "Pre-Seed" | "Seed" | "Series A" | "Series B+" | "Growth"
 * Anything outside this enum fails the INSERT/UPDATE. We collapse the
 * finer-grained CanonicalStage into those six values.
 */
export const STAGE_DISPLAY: Record<CanonicalStage, string> = {
  pre_seed:      "Pre-Seed",
  seed:          "Seed",
  series_a:      "Series A",
  series_b:      "Series B+",   // collapse
  series_c:      "Series B+",   // collapse
  series_d_plus: "Series B+",   // collapse
  growth:        "Growth",
  late_stage:    "Growth",      // collapse — no "Late Stage" in enum
};
