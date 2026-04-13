/** Spaces around en/em dashes in stage ranges (e.g. Pre-Seed–Seed → Pre-Seed – Seed). Hyphens inside words (Pre-Seed) unchanged. */
export function formatStageForDisplay(stage: string): string {
  return stage.replace(/\s*[\u2013\u2014]\s*/g, " – ");
}

export function normalizeStageKey(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[\u2013\u2014-]/g, " ");
}

/** Canonical ordering for VC stage focus (low → high). Unknown labels sort after known. */
export const STAGE_ORDER: Record<string, number> = {
  "friends and family": 0,
  "pre-seed": 1,
  "pre seed": 1,
  "seed": 2,
  "early stage": 2.5,
  "early": 2.5,
  "series a": 3,
  "series b": 4,
  "series b+": 5,
  "series c": 6,
  "series c+": 7,
  "series d": 8,
  "series e": 9,
  "growth": 10,
  "late stage": 11,
  "late": 11,
  "multi-stage": 12,
  "multistage": 12,
};

export function stageRank(s: string): number {
  const k = normalizeStageKey(s);
  if (k in STAGE_ORDER) return STAGE_ORDER[k];
  const m = k.match(/^series ([a-e])(\+)?$/);
  if (m) {
    const letter = m[1];
    const plus = m[2] === "+";
    const base = { a: 3, b: 4, c: 6, d: 8, e: 9 }[letter];
    if (base != null) return plus ? base + 0.15 : base;
  }
  return 100;
}

/**
 * Collapses an array of stage labels to a range string: "Seed – Series B".
 * Preserves single labels and existing range strings.
 */
export function collapseStagesToRange(stages: string[]): string | null {
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const s of stages) {
    const t = s.trim();
    if (!t) continue;
    const key = normalizeStageKey(t);
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(t);
  }
  if (uniq.length === 0) return null;
  if (uniq.length === 1) return formatStageForDisplay(uniq[0]);
  const sorted = [...uniq].sort((a, b) => stageRank(a) - stageRank(b));
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  if (normalizeStageKey(lo) === normalizeStageKey(hi)) return formatStageForDisplay(lo);
  return formatStageForDisplay(`${lo}\u2013${hi}`);
}
