export interface FieldObservation<T = unknown> {
  value: T | null;
  source: string;
  sourceUrl: string | null;
  retrievedAt: string;
  confidence: number;
  verified: boolean;
  userManaged: boolean;
}

export type FieldMergeDecision<T = unknown> =
  | { action: "keep"; value: T | null; reason: string; provenance: FieldObservation<T>[] }
  | { action: "apply"; value: T; reason: string; provenance: FieldObservation<T>[] }
  | { action: "review"; value: T | null; reason: string; provenance: FieldObservation<T>[] };

export function decideFieldMerge<T>(existing: FieldObservation<T>, incoming: FieldObservation<T>, sourceReliability: Record<string, number>, minConfidence = 0.8): FieldMergeDecision<T> {
  const provenance = [existing, incoming];
  if (existing.value == null && incoming.value == null) return { action: "keep", value: null, reason: "both_values_missing", provenance };
  if (existing.userManaged || existing.verified) return { action: "keep", value: existing.value, reason: "preserve_user_managed_or_verified_value", provenance };
  if (incoming.value == null) return { action: "keep", value: existing.value, reason: "incoming_value_missing", provenance };
  if (existing.value == null) {
    if (incoming.confidence >= minConfidence) return { action: "apply", value: incoming.value, reason: "fill_missing_field", provenance };
    return { action: "review", value: null, reason: "low_confidence_missing_field", provenance };
  }
  if (Object.is(existing.value, incoming.value)) return { action: "keep", value: existing.value, reason: "values_agree", provenance };
  const existingRank = sourceReliability[existing.source] ?? 0;
  const incomingRank = sourceReliability[incoming.source] ?? 0;
  const incomingIsNewer = Date.parse(incoming.retrievedAt) > Date.parse(existing.retrievedAt);
  if (incomingRank > existingRank && incomingIsNewer && incoming.confidence >= minConfidence) return { action: "apply", value: incoming.value, reason: "newer_higher_reliability_observation", provenance };
  return { action: "review", value: existing.value, reason: "conflicting_observations_keep_existing", provenance };
}

export interface ReversibleFieldChange<T = unknown> { entityType: string; entityId: string; field: string; before: T | null; after: T | null; source: string; sourceUrl: string | null; confidence: number; status: "applied" | "reverted"; }

export function reverseFieldChange<T>(change: ReversibleFieldChange<T>, currentValue: T | null): ReversibleFieldChange<T> {
  if (change.status !== "applied") throw new Error("Only an applied field change can be reversed");
  if (!Object.is(currentValue, change.after)) throw new Error("Field changed after this ingestion; manual review is required before reversal");
  return { ...change, before: change.after, after: change.before, status: "reverted" };
}
