/**
 * firm-classification.ts
 * =======================
 * Infers structured classification fields from evidence gathered across
 * sources. Uses heuristics (regex + weights) — NOT an LLM — so results are
 * deterministic and auditable.
 *
 * Returns partial classifications with confidence so the merge layer can
 * decide whether to adopt them.
 */

import type {
  ExtractedProfile,
  StageClassification,
  StructureClassification,
  ThemeClassification,
  SectorClassification,
  ImpactOrientation,
} from "../types";
import { parseTextSignals } from "./text-signals";
import { canonicalizeStages, STAGE_ORDER } from "./stage-parser";

export interface ClassificationInput {
  description?: string;
  elevator_pitch?: string;
  about_text?: string;           // long-form firm copy if available
  thesis_text?: string;
  stage_focus?: string[];
  stages?: string[];
  themes?: string[];
  sectors?: string[];
  check_size_min?: number;
  check_size_max?: number;
  source_tags?: string[];        // "CVC", "Solo GP", "Family Office" category labels
  firm_type_hint?: string | null;
}

export interface ClassificationResult {
  stage_classification?:     { value: StageClassification;     confidence: number };
  structure_classification?: { value: StructureClassification; confidence: number };
  theme_classification?:     { value: ThemeClassification;     confidence: number };
  sector_classification?:    { value: SectorClassification;    confidence: number };
  impact_orientation?:       { value: ImpactOrientation;       confidence: number };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function joinText(input: ClassificationInput): string {
  return [input.description, input.elevator_pitch, input.about_text, input.thesis_text, ...(input.source_tags ?? [])]
    .filter(Boolean).join(" \n ").toLowerCase();
}

function uniq<T>(arr: T[]): T[] { return [...new Set(arr)]; }

// ─── Stage classification ───────────────────────────────────────────────────

export function classifyStage(input: ClassificationInput): ClassificationResult["stage_classification"] {
  const sig = parseTextSignals(joinText(input));
  const canonStages = canonicalizeStages([...(input.stages ?? []), ...(input.stage_focus ?? [])]);

  // Explicit multi-stage evidence wins first
  if (sig.mentions_multi_stage) return { value: "multi_stage", confidence: 0.9 };

  // Buyout-specific language
  if (sig.mentions_buyout) return { value: "buyout", confidence: 0.9 };

  // Growth equity
  if (sig.mentions_growth && !sig.mentions_seed && !sig.mentions_pre_seed) {
    return { value: "growth", confidence: 0.85 };
  }

  // Early stage detection
  if (sig.mentions_pre_seed || sig.mentions_earliest_stages ||
      (sig.mentions_seed && !sig.mentions_series_b_plus && !sig.mentions_growth)) {
    return { value: "early_stage", confidence: 0.85 };
  }

  // Stage array-based inference
  if (canonStages.length >= 3) {
    const spansGrowth = canonStages.includes("growth") || canonStages.includes("late_stage");
    const spansEarly  = canonStages.includes("seed") || canonStages.includes("pre_seed");
    if (spansEarly && spansGrowth) return { value: "multi_stage", confidence: 0.8 };
  }
  if (canonStages.length) {
    const earliest = canonStages[0];
    if (earliest === "pre_seed" || earliest === "seed") {
      if (canonStages.every(s => ["pre_seed", "seed", "series_a"].includes(s))) {
        return { value: "early_stage", confidence: 0.75 };
      }
    }
    if (canonStages.every(s => ["growth", "late_stage", "series_d_plus"].includes(s))) {
      return { value: "growth", confidence: 0.8 };
    }
  }

  return undefined;
}

// ─── Structure classification ───────────────────────────────────────────────

export function classifyStructure(input: ClassificationInput): ClassificationResult["structure_classification"] {
  const sig = parseTextSignals(joinText(input));
  const hint = (input.firm_type_hint || "").toLowerCase();

  // Source-tag hints are strong evidence
  const tags = (input.source_tags ?? []).map(t => t.toLowerCase());
  if (tags.some(t => /corporate|cvc/.test(t))) return { value: "cvc", confidence: 0.95 };
  if (tags.some(t => /family[\s-]?office/.test(t))) return { value: "family_office", confidence: 0.95 };
  if (tags.some(t => /solo[\s-]?(gp|capitalist)/.test(t))) return { value: "solo_gp", confidence: 0.95 };
  if (tags.some(t => /syndicate|rolling[\s-]?fund/.test(t))) return { value: "syndicate", confidence: 0.95 };
  if (tags.some(t => /private[\s-]?equity|buyout/.test(t))) return { value: "private_equity", confidence: 0.95 };

  if (hint.includes("cvc") || hint.includes("corporate venture")) return { value: "cvc", confidence: 0.9 };
  if (hint.includes("family office")) return { value: "family_office", confidence: 0.9 };
  if (hint.includes("solo gp") || hint.includes("solo capitalist")) return { value: "solo_gp", confidence: 0.9 };
  if (hint.includes("syndicate")) return { value: "syndicate", confidence: 0.85 };
  if (hint.includes("private equity")) return { value: "private_equity", confidence: 0.9 };

  // Free-text signal detection
  if (sig.mentions_cvc) return { value: "cvc", confidence: 0.8 };
  if (sig.mentions_family_office) return { value: "family_office", confidence: 0.85 };
  if (sig.mentions_solo_gp) return { value: "solo_gp", confidence: 0.8 };
  if (sig.mentions_syndicate) return { value: "syndicate", confidence: 0.8 };

  return { value: "partnership", confidence: 0.5 }; // soft default
}

// ─── Theme / sector classification ──────────────────────────────────────────

/**
 * Given a list of tags, assess whether the firm is generalist, single-theme,
 * or multi-theme. Uses cluster diversity.
 */
function assessClassification(
  tags: string[] | undefined,
  generalistMarkers: RegExp[] = [],
): { dominant: boolean; multi: boolean; generalist: boolean } {
  const items = (tags ?? []).map(t => t.toLowerCase()).filter(Boolean);
  if (!items.length) return { dominant: false, multi: false, generalist: false };

  // Explicit generalist / sector-agnostic markers
  const explicitGeneralist = items.some(t =>
    /\b(generalist|sector[\s-]?agnostic|industry[\s-]?agnostic|all[\s-]?sectors)\b/.test(t) ||
    generalistMarkers.some(rx => rx.test(t))
  );
  if (explicitGeneralist) return { dominant: false, multi: false, generalist: true };

  const unique = uniq(items);
  if (unique.length === 1) return { dominant: true,  multi: false, generalist: false };
  if (unique.length === 2) return { dominant: true,  multi: false, generalist: false };
  if (unique.length >= 3 && unique.length <= 6) return { dominant: false, multi: true, generalist: false };
  // 7+ tags usually means broad coverage → generalist
  return { dominant: false, multi: false, generalist: true };
}

export function classifyTheme(input: ClassificationInput): ClassificationResult["theme_classification"] {
  const text = joinText(input);
  if (/\bgeneralist\b|\bsector[\s-]?agnostic\b|\ball[\s-]?sectors\b/.test(text))
    return { value: "generalist", confidence: 0.9 };

  const a = assessClassification(input.themes, [/\bgeneralist\b/]);
  if (a.generalist) return { value: "generalist", confidence: 0.75 };
  if (a.dominant)   return { value: "theme_driven", confidence: 0.75 };
  if (a.multi)      return { value: "multi_theme", confidence: 0.7 };
  return undefined;
}

export function classifySector(input: ClassificationInput): ClassificationResult["sector_classification"] {
  const text = joinText(input);
  if (/\bgeneralist\b|\bsector[\s-]?agnostic\b|\bindustry[\s-]?agnostic\b/.test(text))
    return { value: "generalist", confidence: 0.9 };

  const a = assessClassification(input.sectors, [/\bgeneralist\b/]);
  if (a.generalist) return { value: "generalist", confidence: 0.75 };
  if (a.dominant)   return { value: "sector_focused", confidence: 0.75 };
  if (a.multi)      return { value: "multi_sector", confidence: 0.7 };
  return undefined;
}

// ─── Impact orientation ─────────────────────────────────────────────────────

export function classifyImpact(input: ClassificationInput): ClassificationResult["impact_orientation"] {
  const sig = parseTextSignals(joinText(input));
  if (sig.mentions_impact_primary)   return { value: "primary", confidence: 0.9 };
  if (sig.mentions_impact_integrated) return { value: "integrated", confidence: 0.8 };
  if (sig.mentions_impact_considered) return { value: "considered", confidence: 0.6 };
  return { value: "none", confidence: 0.5 };
}

// ─── Main ───────────────────────────────────────────────────────────────────

export function classifyFirm(input: ClassificationInput): ClassificationResult {
  return {
    stage_classification:     classifyStage(input),
    structure_classification: classifyStructure(input),
    theme_classification:     classifyTheme(input),
    sector_classification:    classifySector(input),
    impact_orientation:       classifyImpact(input),
  };
}

/** Convenience: build ClassificationInput from an ExtractedProfile. */
export function toClassificationInput(p: ExtractedProfile, extra: Partial<ClassificationInput> = {}): ClassificationInput {
  return {
    description:    p.description,
    elevator_pitch: p.elevator_pitch,
    thesis_text:    (p.raw_text ?? "").slice(0, 4000),
    stage_focus:    p.stage_focus,
    stages:         p.stages,
    themes:         p.themes,
    sectors:        p.sectors,
    check_size_min: p.min_check_size,
    check_size_max: p.max_check_size,
    ...extra,
  };
}
