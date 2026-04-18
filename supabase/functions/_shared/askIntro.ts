// =============================================================================
// askIntro.ts
// =============================================================================
// Generates "ask_intro" recommendations for a single org-targeted note.
//
// Logic:
//   1. Calls paths_to_organization() for the (context, self, org) triple.
//   2. Filters to one_hop paths only (direct paths don't need an intro).
//   3. Applies a freshness multiplier to via_person strength:
//        ≤30d → 1.0  |  ≤90d → 0.8  |  ≤180d → 0.5  |  older → 0.3
//   4. Takes up to MAX_RECS_PER_ORG = 3 highest-scoring paths.
//   5. Upserts each as a recommendation with kind='ask_intro', skipping
//      any whose state is 'dismissed'.
//   6. Returns dedup_keys generated so the orchestrator can expire stale recs.
//
// Dedup key format: ask_intro|{org_id}|{target_person_id}|{via_person_id}
// =============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { ContextEntityNote, PathRow, Recommendation } from "./connector-types.ts";

const MAX_RECS_PER_ORG = 3;

export interface AskIntroResult {
  created: number;
  updated: number;
  dedupKeys: string[];
}

// ---------------------------------------------------------------------------
// generateAskIntroRecs
// ---------------------------------------------------------------------------

export async function generateAskIntroRecs(
  supabase: SupabaseClient,
  ownerContextId: string,
  selfPersonId: string,
  orgNote: ContextEntityNote,
): Promise<AskIntroResult> {
  if (!orgNote.organization_id) {
    return { created: 0, updated: 0, dedupKeys: [] };
  }

  const orgId = orgNote.organization_id;

  // --- 1. Fetch paths ---
  const { data: pathRows, error: pathErr } = await supabase.rpc(
    "paths_to_organization",
    {
      p_owner_context_id:      ownerContextId,
      p_target_organization_id: orgId,
      p_self_person_id:        selfPersonId,
    },
  );

  if (pathErr) {
    throw new Error(`generateAskIntroRecs: paths_to_organization failed: ${pathErr.message}`);
  }

  const paths = (pathRows ?? []) as PathRow[];

  // --- 2. Filter to one_hop paths only ---
  const oneHopPaths = paths.filter((p) => p.path_type === "one_hop");

  // --- 3. Apply freshness multiplier and sort descending ---
  const scored = oneHopPaths.map((p) => ({
    path: p,
    finalScore: p.path_score * freshnessMultiplier(p.last_interaction_at),
  }));
  scored.sort((a, b) => b.finalScore - a.finalScore);

  // Take top N
  const top = scored.slice(0, MAX_RECS_PER_ORG);

  // --- 4. Load existing dismissed recs so we can skip them ---
  const candidateDedup = top.map((s) =>
    buildDedupKey(orgId, s.path.target_person_id, s.path.via_person_id!),
  );

  const { data: existingRecs, error: recFetchErr } = await supabase
    .from("recommendations")
    .select("dedup_key, state, id")
    .eq("owner_context_id", ownerContextId)
    .eq("kind", "ask_intro")
    .in("dedup_key", candidateDedup);

  if (recFetchErr) {
    throw new Error(`generateAskIntroRecs: existing recs fetch failed: ${recFetchErr.message}`);
  }

  const existingMap = new Map<string, Recommendation>(
    ((existingRecs ?? []) as Recommendation[]).map((r) => [r.dedup_key, r]),
  );

  // --- 5. Upsert ---
  let created = 0;
  let updated = 0;
  const dedupKeys: string[] = [];

  for (const { path, finalScore } of top) {
    if (!path.via_person_id) continue;

    const dedupKey = buildDedupKey(orgId, path.target_person_id, path.via_person_id);
    const existing = existingMap.get(dedupKey);

    // Skip dismissed recs — user said no
    if (existing?.state === "dismissed") continue;

    dedupKeys.push(dedupKey);

    const rationale: Record<string, unknown> = {
      path_score:          path.path_score,
      freshness_multiplier: freshnessMultiplier(path.last_interaction_at),
      last_interaction_at:  path.last_interaction_at,
    };

    if (existing) {
      // Update score + rationale (state stays as-is: open, snoozed, etc.)
      const { error: updateErr } = await supabase
        .from("recommendations")
        .update({ score: finalScore, rationale })
        .eq("id", existing.id);

      if (updateErr) {
        throw new Error(`generateAskIntroRecs: rec update failed: ${updateErr.message}`);
      }
      updated++;
    } else {
      // Insert new rec
      const { error: insertErr } = await supabase
        .from("recommendations")
        .insert({
          owner_context_id:        ownerContextId,
          kind:                    "ask_intro",
          subject_organization_id: orgId,
          subject_person_id:       path.target_person_id,
          via_person_id:           path.via_person_id,
          score:                   finalScore,
          rationale,
          state:                   "open",
          dedup_key:               dedupKey,
        });

      if (insertErr && (insertErr as { code?: string }).code !== "23505") {
        throw new Error(`generateAskIntroRecs: rec insert failed: ${insertErr.message}`);
      }
      created++;
    }
  }

  return { created, updated, dedupKeys };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDedupKey(
  orgId: string,
  targetPersonId: string,
  viaPersonId: string,
): string {
  return `ask_intro|${orgId}|${targetPersonId}|${viaPersonId}`;
}

/**
 * Freshness multiplier based on days since last interaction.
 *   ≤30d  → 1.0
 *   ≤90d  → 0.8
 *   ≤180d → 0.5
 *   older → 0.3
 */
function freshnessMultiplier(lastInteractionAt: string | null): number {
  if (!lastInteractionAt) return 0.3;
  const daysSince =
    (Date.now() - new Date(lastInteractionAt).getTime()) /
    (1000 * 60 * 60 * 24);
  if (daysSince <= 30)  return 1.0;
  if (daysSince <= 90)  return 0.8;
  if (daysSince <= 180) return 0.5;
  return 0.3;
}
