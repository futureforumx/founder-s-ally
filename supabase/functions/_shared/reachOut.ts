// =============================================================================
// reachOut.ts
// =============================================================================
// Generates "reach_out" recommendations for a single org-targeted note.
//
// Logic:
//   1. Calls paths_to_organization() for the (context, self, org) triple.
//   2. Filters to DIRECT paths only.
//   3. Keeps only those where last_interaction_at is older than STALE_DAYS (45).
//      A stale direct connection warrants a "re-engage / reach out" prompt.
//   4. Scores each as: path_score * recency_decay  where recency_decay maps:
//        ≤90d   → 0.9  (recent-ish, gentle nudge)
//        ≤180d  → 0.7
//        ≤365d  → 0.5
//        older  → 0.3
//   5. Takes up to MAX_RECS_PER_ORG = 2 highest-scoring paths.
//   6. Upserts each as a recommendation with kind='reach_out', skipping
//      any whose state is 'dismissed'.
//   7. Returns dedup_keys generated so the orchestrator can expire stale recs.
//
// Dedup key format: reach_out|{org_id}|{target_person_id}
// =============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { ContextEntityNote, PathRow, Recommendation } from "./connector-types.ts";

const MAX_RECS_PER_ORG = 2;
const STALE_DAYS       = 45;

export interface ReachOutResult {
  created: number;
  updated: number;
  dedupKeys: string[];
}

// ---------------------------------------------------------------------------
// generateReachOutRecs
// ---------------------------------------------------------------------------

export async function generateReachOutRecs(
  supabase: SupabaseClient,
  ownerContextId: string,
  selfPersonId: string,
  orgNote: ContextEntityNote,
): Promise<ReachOutResult> {
  if (!orgNote.organization_id) {
    return { created: 0, updated: 0, dedupKeys: [] };
  }

  const orgId = orgNote.organization_id;

  // --- 1. Fetch paths ---
  const { data: pathRows, error: pathErr } = await supabase.rpc(
    "paths_to_organization",
    {
      p_owner_context_id:       ownerContextId,
      p_target_organization_id: orgId,
      p_self_person_id:         selfPersonId,
    },
  );

  if (pathErr) {
    throw new Error(`generateReachOutRecs: paths_to_organization failed: ${pathErr.message}`);
  }

  const paths = (pathRows ?? []) as PathRow[];

  // --- 2. Filter to direct paths that are stale ---
  const staleDirect = paths.filter(
    (p) =>
      p.path_type === "direct" &&
      isStale(p.last_interaction_at, STALE_DAYS),
  );

  // --- 3. Score and sort ---
  const scored = staleDirect.map((p) => ({
    path: p,
    finalScore: p.path_score * recencyDecay(p.last_interaction_at),
  }));
  scored.sort((a, b) => b.finalScore - a.finalScore);

  const top = scored.slice(0, MAX_RECS_PER_ORG);

  // --- 4. Load existing dismissed recs ---
  const candidateDedup = top.map((s) =>
    buildDedupKey(orgId, s.path.target_person_id),
  );

  const { data: existingRecs, error: recFetchErr } = await supabase
    .from("recommendations")
    .select("dedup_key, state, id")
    .eq("owner_context_id", ownerContextId)
    .eq("kind", "reach_out")
    .in("dedup_key", candidateDedup);

  if (recFetchErr) {
    throw new Error(`generateReachOutRecs: existing recs fetch failed: ${recFetchErr.message}`);
  }

  const existingMap = new Map<string, Recommendation>(
    ((existingRecs ?? []) as Recommendation[]).map((r) => [r.dedup_key, r]),
  );

  // --- 5. Upsert ---
  let created = 0;
  let updated = 0;
  const dedupKeys: string[] = [];

  for (const { path, finalScore } of top) {
    const dedupKey = buildDedupKey(orgId, path.target_person_id);
    const existing = existingMap.get(dedupKey);

    // Skip dismissed
    if (existing?.state === "dismissed") continue;

    dedupKeys.push(dedupKey);

    const rationale: Record<string, unknown> = {
      path_score:          path.path_score,
      last_interaction_at: path.last_interaction_at,
      days_since_contact:  daysSince(path.last_interaction_at),
      recency_decay:       recencyDecay(path.last_interaction_at),
    };

    if (existing) {
      const { error: updateErr } = await supabase
        .from("recommendations")
        .update({ score: finalScore, rationale })
        .eq("id", existing.id);

      if (updateErr) {
        throw new Error(`generateReachOutRecs: rec update failed: ${updateErr.message}`);
      }
      updated++;
    } else {
      const { error: insertErr } = await supabase
        .from("recommendations")
        .insert({
          owner_context_id:        ownerContextId,
          kind:                    "reach_out",
          subject_organization_id: orgId,
          subject_person_id:       path.target_person_id,
          via_person_id:           null,
          score:                   finalScore,
          rationale,
          state:                   "open",
          dedup_key:               dedupKey,
        });

      if (insertErr && (insertErr as { code?: string }).code !== "23505") {
        throw new Error(`generateReachOutRecs: rec insert failed: ${insertErr.message}`);
      }
      created++;
    }
  }

  return { created, updated, dedupKeys };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDedupKey(orgId: string, targetPersonId: string): string {
  return `reach_out|${orgId}|${targetPersonId}`;
}

function daysSince(lastAt: string | null): number {
  if (!lastAt) return Infinity;
  return (Date.now() - new Date(lastAt).getTime()) / (1000 * 60 * 60 * 24);
}

function isStale(lastAt: string | null, thresholdDays: number): boolean {
  return daysSince(lastAt) > thresholdDays;
}

/**
 * Recency decay for reach_out scoring.
 * Connection exists but is stale — score by how stale it is.
 *   ≤90d  → 0.9
 *   ≤180d → 0.7
 *   ≤365d → 0.5
 *   older → 0.3
 */
function recencyDecay(lastAt: string | null): number {
  const d = daysSince(lastAt);
  if (d <= 90)  return 0.9;
  if (d <= 180) return 0.7;
  if (d <= 365) return 0.5;
  return 0.3;
}
