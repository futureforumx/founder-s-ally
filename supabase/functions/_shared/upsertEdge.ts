// =============================================================================
// upsertEdge.ts
// =============================================================================
// Creates or updates a relationship_edge + relationship_context row, then
// triggers a strength recompute.
//
// Canonicalization: person_a_id is always the lexicographically smaller UUID
// (as a string).  The CHECK constraint in 0006_phase3_graph.sql enforces this.
// =============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { RelationshipEdge, RelationshipContext } from "./connector-types.ts";
import { recomputeRelationshipContext } from "./recomputeRelationshipContext.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type InteractionKind = "email" | "meeting" | "crm_touch";

export interface UpsertEdgeParams {
  /** UUID of the owner_contexts row (as string). */
  ownerContextId: string;
  /** UUID of the "self" person for this owner context (as string). */
  selfPersonId: string;
  /** UUID of the other person in the relationship (as string). */
  otherPersonId: string;
  /** Kind of interaction that triggered this edge update. */
  kind: InteractionKind;
  /** ISO timestamp of the interaction (may be null for CRM touches without date). */
  occurredAt: string | null;
  /**
   * Role of selfPerson in this interaction.
   *   email:   'from' (sent) | 'to'|'cc'|'bcc' (received)
   *   meeting: 'organizer' | 'attendee'
   *   crm_touch: omit / undefined
   */
  selfRole?: string;
}

export interface UpsertEdgeResult {
  edge: RelationshipEdge;
  context: RelationshipContext;
}

// ---------------------------------------------------------------------------
// upsertEdge
// ---------------------------------------------------------------------------

export async function upsertEdge(
  supabase: SupabaseClient,
  params: UpsertEdgeParams,
): Promise<UpsertEdgeResult> {
  // --- canonicalize pair (person_a_id < person_b_id lexicographically) ---
  const [personAId, personBId] =
    params.selfPersonId < params.otherPersonId
      ? [params.selfPersonId, params.otherPersonId]
      : [params.otherPersonId, params.selfPersonId];

  const selfIsA = params.selfPersonId === personAId;

  // --- fetch or insert edge ---
  let edge: RelationshipEdge;

  const { data: existingEdge, error: fetchErr } = await supabase
    .from("relationship_edges")
    .select()
    .eq("owner_context_id", params.ownerContextId)
    .eq("person_a_id", personAId)
    .eq("person_b_id", personBId)
    .maybeSingle();

  if (fetchErr) {
    throw new Error(`upsertEdge: relationship_edges fetch failed: ${fetchErr.message}`);
  }

  if (existingEdge) {
    // Update in-place: increment the relevant counter, update timestamps
    const countField = countFieldFor(params.kind);
    const currentCount = (existingEdge as Record<string, unknown>)[countField] as number ?? 0;

    const lastAt  = latestDate(existingEdge.last_interaction_at,  params.occurredAt);
    const firstAt = earliestDate(existingEdge.first_interaction_at, params.occurredAt);

    const { data: updated, error: updateErr } = await supabase
      .from("relationship_edges")
      .update({
        [countField]:          currentCount + 1,
        last_interaction_at:  lastAt,
        first_interaction_at: firstAt,
      })
      .eq("id", existingEdge.id)
      .select()
      .single();

    if (updateErr || !updated) {
      throw new Error(`upsertEdge: relationship_edges update failed: ${updateErr?.message ?? "no row"}`);
    }
    edge = updated as RelationshipEdge;
  } else {
    // Insert new edge
    const newEdge: Record<string, unknown> = {
      owner_context_id:     params.ownerContextId,
      person_a_id:          personAId,
      person_b_id:          personBId,
      email_count:          params.kind === "email"     ? 1 : 0,
      meeting_count:        params.kind === "meeting"   ? 1 : 0,
      crm_touch_count:      params.kind === "crm_touch" ? 1 : 0,
      last_interaction_at:  params.occurredAt ?? null,
      first_interaction_at: params.occurredAt ?? null,
    };

    const { data: inserted, error: insertErr } = await supabase
      .from("relationship_edges")
      .insert(newEdge)
      .select()
      .single();

    if (insertErr) {
      // Race condition: another process inserted the same edge concurrently.
      // Retry with a fetch.
      if ((insertErr as { code?: string }).code === "23505") {
        const { data: raceEdge, error: raceErr } = await supabase
          .from("relationship_edges")
          .select()
          .eq("owner_context_id", params.ownerContextId)
          .eq("person_a_id", personAId)
          .eq("person_b_id", personBId)
          .single();

        if (raceErr || !raceEdge) {
          throw new Error(`upsertEdge: post-race-condition fetch failed: ${raceErr?.message ?? "no row"}`);
        }
        edge = raceEdge as RelationshipEdge;
      } else {
        throw new Error(`upsertEdge: relationship_edges insert failed: ${insertErr.message}`);
      }
    } else {
      edge = inserted as RelationshipEdge;
    }
  }

  // --- fetch or insert relationship_context ---
  let context: RelationshipContext;

  const { data: existingCtx, error: ctxFetchErr } = await supabase
    .from("relationship_contexts")
    .select()
    .eq("edge_id", edge.id)
    .eq("owner_context_id", params.ownerContextId)
    .maybeSingle();

  if (ctxFetchErr) {
    throw new Error(`upsertEdge: relationship_contexts fetch failed: ${ctxFetchErr.message}`);
  }

  if (existingCtx) {
    const ctxUpdate = buildContextUpdate(
      existingCtx as RelationshipContext,
      params.kind,
      params.selfRole,
      selfIsA,
    );

    const { data: updatedCtx, error: ctxUpdateErr } = await supabase
      .from("relationship_contexts")
      .update(ctxUpdate)
      .eq("id", existingCtx.id)
      .select()
      .single();

    if (ctxUpdateErr || !updatedCtx) {
      throw new Error(`upsertEdge: relationship_contexts update failed: ${ctxUpdateErr?.message ?? "no row"}`);
    }
    context = updatedCtx as RelationshipContext;
  } else {
    const newCtx = buildNewContext(
      edge.id,
      params.ownerContextId,
      params.kind,
      params.selfRole,
    );

    const { data: insertedCtx, error: ctxInsertErr } = await supabase
      .from("relationship_contexts")
      .insert(newCtx)
      .select()
      .single();

    if (ctxInsertErr) {
      if ((ctxInsertErr as { code?: string }).code === "23505") {
        const { data: raceCtx, error: raceCtxErr } = await supabase
          .from("relationship_contexts")
          .select()
          .eq("edge_id", edge.id)
          .eq("owner_context_id", params.ownerContextId)
          .single();

        if (raceCtxErr || !raceCtx) {
          throw new Error(`upsertEdge: post-race-condition ctx fetch failed: ${raceCtxErr?.message ?? "no row"}`);
        }
        context = raceCtx as RelationshipContext;
      } else {
        throw new Error(`upsertEdge: relationship_contexts insert failed: ${ctxInsertErr.message}`);
      }
    } else {
      context = insertedCtx as RelationshipContext;
    }
  }

  // --- recompute strength ---
  await recomputeRelationshipContext(supabase, edge.id, params.ownerContextId);

  // Re-fetch edge to get updated strength
  const { data: refreshedEdge } = await supabase
    .from("relationship_edges")
    .select()
    .eq("id", edge.id)
    .single();

  return {
    edge:    (refreshedEdge ?? edge) as RelationshipEdge,
    context,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function countFieldFor(kind: InteractionKind): string {
  if (kind === "email")     return "email_count";
  if (kind === "meeting")   return "meeting_count";
  return "crm_touch_count";
}

/** Directional context increments for an existing context row. */
function buildContextUpdate(
  existing: RelationshipContext,
  kind: InteractionKind,
  selfRole: string | undefined,
  _selfIsA: boolean,
): Record<string, unknown> {
  const update: Record<string, number> = {};

  if (kind === "email") {
    if (selfRole === "from") {
      update.email_sent_count = existing.email_sent_count + 1;
    } else {
      update.email_received_count = existing.email_received_count + 1;
    }
  } else if (kind === "meeting") {
    if (selfRole === "organizer") {
      update.meeting_as_organizer_count = existing.meeting_as_organizer_count + 1;
    } else {
      update.meeting_as_attendee_count = existing.meeting_as_attendee_count + 1;
    }
  } else if (kind === "crm_touch") {
    update.crm_touch_count = existing.crm_touch_count + 1;
  }

  return update;
}

/** Initial context row for a brand-new context. */
function buildNewContext(
  edgeId: string,
  ownerContextId: string,
  kind: InteractionKind,
  selfRole: string | undefined,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    edge_id:          edgeId,
    owner_context_id: ownerContextId,
    email_sent_count:           0,
    email_received_count:       0,
    meeting_as_organizer_count: 0,
    meeting_as_attendee_count:  0,
    crm_touch_count:            0,
  };

  if (kind === "email") {
    if (selfRole === "from") base.email_sent_count     = 1;
    else                     base.email_received_count = 1;
  } else if (kind === "meeting") {
    if (selfRole === "organizer") base.meeting_as_organizer_count = 1;
    else                          base.meeting_as_attendee_count  = 1;
  } else if (kind === "crm_touch") {
    base.crm_touch_count = 1;
  }

  return base;
}

/** Returns the later of two nullable ISO timestamps. */
function latestDate(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a && !b) return null;
  if (!a) return b ?? null;
  if (!b) return a;
  return a > b ? a : b;
}

/** Returns the earlier of two nullable ISO timestamps. */
function earliestDate(a: string | null | undefined, b: string | null | undefined): string | null {
  if (!a && !b) return null;
  if (!a) return b ?? null;
  if (!b) return a;
  return a < b ? a : b;
}
