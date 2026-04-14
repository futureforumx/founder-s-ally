/** Spaces around en/em dashes in stage ranges (e.g. Pre-Seed–Seed → Pre-Seed – Seed). Hyphens inside words (Pre-Seed) unchanged. */
export function formatStageForDisplay(stage: unknown): string {
  return String(stage ?? "").replace(/\s*[\u2013\u2014]\s*/g, " – ");
}

export function normalizeStageKey(s: unknown): string {
  return String(s ?? "")
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

export function stageRank(s: unknown): number {
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
export function collapseStagesToRange(stages: readonly unknown[]): string | null {
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const s of stages) {
    if (s == null) continue;
    const t = String(s).trim();
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

/** "Early" / "Early stage" as an upper bound is non-specific; prefer Series A/B etc. when present. */
export function isVagueEarlyStageLabel(s: unknown): boolean {
  const k = normalizeStageKey(s);
  return k === "early" || k === "early stage";
}

/**
 * Like {@link collapseStagesToRange}, but if the max label is only "Early" / "Early stage",
 * use the strongest non-vague stage in the list as the high bound (e.g. "Seed – Series A").
 */
export function collapseStagesToRangePreferringSpecificOverEarly(stages: readonly unknown[]): string | null {
  const uniq: string[] = [];
  const seen = new Set<string>();
  for (const s of stages) {
    if (s == null) continue;
    const t = String(s).trim();
    if (!t) continue;
    const key = normalizeStageKey(t);
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(t);
  }
  if (uniq.length === 0) return null;
  if (uniq.length === 1) return formatStageForDisplay(uniq[0]!);
  const sorted = [...uniq].sort((a, b) => stageRank(a) - stageRank(b));
  const lo = sorted[0]!;
  let hi = sorted[sorted.length - 1]!;
  if (isVagueEarlyStageLabel(hi)) {
    const nonVague = sorted.filter((x) => !isVagueEarlyStageLabel(x));
    if (nonVague.length) {
      const hi2 = nonVague[nonVague.length - 1]!;
      if (normalizeStageKey(hi2) === normalizeStageKey(lo)) return formatStageForDisplay(lo);
      hi = hi2;
    }
  }
  if (normalizeStageKey(lo) === normalizeStageKey(hi)) return formatStageForDisplay(lo);
  return formatStageForDisplay(`${lo}\u2013${hi}`);
}

/** Split a human-written stage range without breaking hyphens inside labels (e.g. Pre-Seed). */
export function splitStageRangeLabel(s: unknown): [string, string] | null {
  const t = String(s ?? "").trim();
  if (!t) return null;
  const byEn = t.split(/\s+\u2013\s+/);
  if (byEn.length === 2) return [byEn[0]!.trim(), byEn[1]!.trim()];
  const byEm = t.split(/\s+\u2014\s+/);
  if (byEm.length === 2) return [byEm[0]!.trim(), byEm[1]!.trim()];
  const bySpacedHyphen = t.split(/\s+-\s+/);
  if (bySpacedHyphen.length === 2) return [bySpacedHyphen[0]!.trim(), bySpacedHyphen[1]!.trim()];
  const byTight = t.split(/[\u2013\u2014]/);
  if (byTight.length === 2) return [byTight[0]!.trim(), byTight[1]!.trim()];
  return null;
}

function joinStageRange(lo: string, hi: string): string {
  if (normalizeStageKey(lo) === normalizeStageKey(hi)) return formatStageForDisplay(lo);
  return formatStageForDisplay(`${lo}\u2013${hi}`);
}

/** Newest deals first: first round label that is not a vague "Early" bucket (and parses in {@link stageRank}). */
export function stageFromLatestConcreteDeal(
  deals: ReadonlyArray<{ stage?: string | null; date_announced?: string | null }> | null | undefined,
): string | null {
  if (!deals?.length) return null;
  const rows = deals
    .map((d) => {
      const stage = String(d.stage ?? "").trim();
      const raw = d.date_announced != null ? String(d.date_announced).trim() : "";
      const ts = raw ? Date.parse(raw) : NaN;
      return { stage, t: Number.isFinite(ts) ? ts : 0 };
    })
    .sort((a, b) => b.t - a.t);
  for (const r of rows) {
    if (!r.stage) continue;
    if (isVagueEarlyStageLabel(r.stage)) continue;
    if (stageRank(r.stage) >= 100) continue;
    return formatStageForDisplay(r.stage);
  }
  return null;
}

/**
 * Hero "Stage:" line: replace vague "Early" upper bounds with the latest concrete round from
 * recent investments when available, else the strongest specific stage from directory tags.
 */
export function resolveInvestorHeroStageFocus(input: {
  preferredStage?: string | null;
  directoryStages?: readonly unknown[] | null;
  deals?: ReadonlyArray<{ stage?: string | null; date_announced?: string | null }> | null;
  fallbackStage?: string | null;
}): string {
  const stages =
    input.directoryStages?.map((s) => String(s ?? "").trim()).filter(Boolean) ?? [];
  const fromStages = stages.length ? collapseStagesToRangePreferringSpecificOverEarly(stages) : null;

  const raw =
    String(input.preferredStage ?? "").trim() ||
    fromStages ||
    String(input.fallbackStage ?? "").trim() ||
    "";

  if (!raw) return "-";

  const parts = splitStageRangeLabel(raw);
  if (!parts) {
    if (isVagueEarlyStageLabel(raw)) {
      const fromDeal = stageFromLatestConcreteDeal(input.deals);
      if (fromDeal) return fromDeal;
      if (fromStages) return formatStageForDisplay(fromStages);
    }
    return formatStageForDisplay(raw);
  }

  const [lo, hi] = parts;
  if (!isVagueEarlyStageLabel(hi)) return joinStageRange(lo, hi);

  const fromDeal = stageFromLatestConcreteDeal(input.deals);
  const stagedPair = fromStages ? splitStageRangeLabel(fromStages) : null;
  const fromDirectoryHi =
    stagedPair && stagedPair[1] && !isVagueEarlyStageLabel(stagedPair[1]) ? stagedPair[1] : null;

  /** Prefer latest concrete round from investments; fall back to directory high bound. */
  const rep = fromDeal ?? fromDirectoryHi;
  if (rep) return joinStageRange(lo, rep);
  /** No concrete high bound: drop vague "Early" and show the low bound only (e.g. Seed – Early → Seed). */
  return formatStageForDisplay(lo);
}
