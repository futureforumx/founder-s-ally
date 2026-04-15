/**
 * merge.ts
 * =========
 * Merge multiple adapter results into a single ExtractedProfile.
 * Uses source-priority rules + confidence. Records all competing values.
 */

import type { AdapterResult, ExtractedProfile, ProvenanceEntry, SourceName } from "./types";
import { getPriority } from "./source-priority";

/**
 * Result of merging multiple adapter outputs for one firm.
 */
export interface MergedFirm {
  profile: ExtractedProfile;
  provenance: ProvenanceEntry[];
  /** Fields that had conflicting values across sources — set manual_review_status. */
  conflicted_fields: string[];
}

interface FieldCandidate {
  value: unknown;
  source: SourceName;
  confidence: number;
  priority: number;
  source_url?: string | null;
}

/**
 * Pick the winning value per field:
 *   1. Filter out null/empty.
 *   2. Sort by priority DESC, then confidence DESC.
 *   3. If top two candidates disagree materially, flag as conflict.
 */
export function mergeAdapterResults(results: AdapterResult[]): MergedFirm {
  // Collect all provenance entries
  const allProvenance: ProvenanceEntry[] = [];
  for (const r of results) allProvenance.push(...r.provenance);

  // Group provenance by field
  const byField = new Map<string, FieldCandidate[]>();
  for (const entry of allProvenance) {
    if (isEmpty(entry.value)) continue;
    const priority = getPriority(entry.field_name, entry.source_name);
    const list = byField.get(entry.field_name) ?? [];
    list.push({
      value: entry.value,
      source: entry.source_name,
      confidence: entry.confidence,
      priority,
      source_url: entry.source_url,
    });
    byField.set(entry.field_name, list);
  }

  const mergedProfile: ExtractedProfile = {};
  const conflicted: string[] = [];

  for (const [field, candidates] of byField) {
    const sorted = [...candidates].sort((a, b) =>
      b.priority !== a.priority ? b.priority - a.priority : b.confidence - a.confidence
    );
    const winner = sorted[0];
    (mergedProfile as Record<string, unknown>)[field] = winner.value;

    // Conflict detection: top two sources have similar priority but disagree
    if (sorted.length > 1) {
      const [top, second] = sorted;
      if (top.priority - second.priority < 10 && !valuesEqual(top.value, second.value)) {
        conflicted.push(field);
      }
    }
  }

  return { profile: mergedProfile, provenance: allProvenance, conflicted_fields: conflicted };
}

function isEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return !v.trim();
  if (Array.isArray(v)) return !v.length;
  return false;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a === "string" && typeof b === "string") {
    return a.trim().toLowerCase() === b.trim().toLowerCase();
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].map(String).sort();
    const sb = [...b].map(String).sort();
    return sa.every((v, i) => v === sb[i]);
  }
  return JSON.stringify(a) === JSON.stringify(b);
}
