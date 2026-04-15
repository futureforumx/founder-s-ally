/**
 * provenance.ts — Helpers for building + filtering provenance entries.
 */

import type { ExtractedProfile, ProvenanceEntry, SourceName } from "./types";
import { baseConfidence } from "./scoring";

/**
 * Build provenance entries from a profile that was produced by a single adapter.
 * Each non-null field yields one entry.
 */
export function buildProvenanceFromProfile(
  profile: ExtractedProfile,
  source: SourceName,
  sourceUrl: string | null | undefined,
  matchConfidence = 1,
  sourceRecordId?: string | null,
): ProvenanceEntry[] {
  const now = new Date();
  const out: ProvenanceEntry[] = [];
  const base = baseConfidence(source);

  for (const [field, value] of Object.entries(profile)) {
    if (value == null) continue;
    if (field === "raw_text" || field === "raw_payload") continue;
    if (typeof value === "string" && !value.trim()) continue;
    if (Array.isArray(value) && !value.length) continue;

    out.push({
      field_name: field,
      source_name: source,
      source_url: sourceUrl ?? null,
      source_record_id: sourceRecordId ?? null,
      value,
      confidence: Math.max(0, Math.min(1, base * Math.max(0.7, matchConfidence))),
      extracted_at: now,
    });
  }

  return out;
}
