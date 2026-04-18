// =============================================================================
// generateRecommendations.ts
// =============================================================================
// Orchestrates a full recommendation refresh for one (or all) owner contexts.
//
// For each org-targeted note in 'researching' or 'reaching_out' pipeline stage:
//   1. Resolves selfPersonId for the context.
//   2. Calls generateAskIntroRecs() — produces ask_intro recs (one-hop paths).
//   3. Calls generateReachOutRecs() — produces reach_out recs (stale direct).
//   4. Collects all dedup_keys that were touched in this run.
//
// After processing all notes, expires any 'open' recs for this context whose
// dedup_key was NOT in the touched set.  These are stale: the path no longer
// exists or the org note moved to a terminal stage.
//
// Returns aggregate counts.
// =============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { ContextEntityNote } from "./connector-types.ts";
import { resolveSelfPerson }         from "./resolveIdentity.ts";
import { generateAskIntroRecs }      from "./askIntro.ts";
import { generateReachOutRecs }      from "./reachOut.ts";

export interface GenerateRecommendationsResult {
  notesProcessed:   number;
  askIntroCreated:  number;
  askIntroUpdated:  number;
  reachOutCreated:  number;
  reachOutUpdated:  number;
  expired:          number;
  errors:           string[];
}

// Active pipeline stages that should generate recommendations
const ACTIVE_STAGES: string[] = ["researching", "reaching_out"];

// ---------------------------------------------------------------------------
// generateRecommendations
// ---------------------------------------------------------------------------

/**
 * @param supabase       Service-role client.
 * @param ownerContextId Specific context to process, or null to process all.
 * @param dryRun         If true, computes but does not write any changes.
 */
export async function generateRecommendations(
  supabase: SupabaseClient,
  ownerContextId: string | null,
  dryRun = false,
): Promise<GenerateRecommendationsResult> {
  const result: GenerateRecommendationsResult = {
    notesProcessed:  0,
    askIntroCreated: 0,
    askIntroUpdated: 0,
    reachOutCreated: 0,
    reachOutUpdated: 0,
    expired:         0,
    errors:          [],
  };

  // --- Fetch all active org notes for the target context(s) ---
  let query = supabase
    .from("context_entity_notes")
    .select()
    .eq("subject_type", "organization")
    .in("pipeline_stage", ACTIVE_STAGES);

  if (ownerContextId) {
    query = query.eq("owner_context_id", ownerContextId);
  }

  const { data: notes, error: notesErr } = await query;

  if (notesErr) {
    throw new Error(`generateRecommendations: context_entity_notes fetch failed: ${notesErr.message}`);
  }

  const orgNotes = (notes ?? []) as ContextEntityNote[];

  // Group notes by owner_context_id so we only resolve selfPersonId once
  const byContext = new Map<string, ContextEntityNote[]>();
  for (const note of orgNotes) {
    const list = byContext.get(note.owner_context_id) ?? [];
    list.push(note);
    byContext.set(note.owner_context_id, list);
  }

  // Per-context processing
  for (const [ctxId, ctxNotes] of byContext) {
    // Resolve self person
    const selfPerson = await resolveSelfPerson(supabase, ctxId);
    if (!selfPerson) {
      result.errors.push(`context ${ctxId}: no identity_link — skipping`);
      continue;
    }

    const selfPersonId = selfPerson.id;
    const touchedDedupKeys: string[] = [];

    for (const note of ctxNotes) {
      try {
        if (!dryRun) {
          // Ask intro (one-hop paths)
          const aiResult = await generateAskIntroRecs(supabase, ctxId, selfPersonId, note);
          result.askIntroCreated += aiResult.created;
          result.askIntroUpdated += aiResult.updated;
          touchedDedupKeys.push(...aiResult.dedupKeys);

          // Reach out (stale direct paths)
          const roResult = await generateReachOutRecs(supabase, ctxId, selfPersonId, note);
          result.reachOutCreated += roResult.created;
          result.reachOutUpdated += roResult.updated;
          touchedDedupKeys.push(...roResult.dedupKeys);
        }

        result.notesProcessed++;
      } catch (err) {
        result.errors.push(
          `context ${ctxId} / note ${note.id}: ${(err as Error).message}`,
        );
      }
    }

    // --- Expire stale open recs not touched in this run ---
    // Guard: only run expiry when at least one dedup_key was generated.
    // If touchedDedupKeys is empty (no paths exist yet for this context),
    // skipping expiry prevents accidentally wiping all open recs.
    if (!dryRun && touchedDedupKeys.length > 0) {
      const expired = await expireStaleRecs(supabase, ctxId, touchedDedupKeys);
      result.expired += expired;
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// expireStaleRecs
// ---------------------------------------------------------------------------

/**
 * Sets state = 'expired' on all 'open' recommendations for the given context
 * whose dedup_key is NOT in the touchedDedupKeys list.
 *
 * This handles cases where:
 *   - A path no longer exists (connection weakened, person left org, etc.)
 *   - An org note moved out of active pipeline stages
 *   - A via_person changed
 */
async function expireStaleRecs(
  supabase: SupabaseClient,
  ownerContextId: string,
  touchedDedupKeys: string[],
): Promise<number> {
  // Fetch open recs not in touched set
  let query = supabase
    .from("recommendations")
    .select("id, dedup_key")
    .eq("owner_context_id", ownerContextId)
    .eq("state", "open");

  if (touchedDedupKeys.length > 0) {
    // PostgREST NOT IN format for text values: (val1,val2) — no quoting around values.
    // dedup_key values use | as separator and never contain commas, so join is safe.
    query = query.not("dedup_key", "in", `(${touchedDedupKeys.join(",")})`);
  }

  const { data: staleRecs, error: fetchErr } = await query;

  if (fetchErr) {
    throw new Error(`expireStaleRecs: fetch failed: ${fetchErr.message}`);
  }

  const stale = staleRecs ?? [];
  if (stale.length === 0) return 0;

  const staleIds = stale.map((r: { id: string }) => r.id);

  const { error: updateErr, count } = await supabase
    .from("recommendations")
    .update({ state: "expired" })
    .in("id", staleIds);

  if (updateErr) {
    throw new Error(`expireStaleRecs: update failed: ${updateErr.message}`);
  }

  return count ?? stale.length;
}
