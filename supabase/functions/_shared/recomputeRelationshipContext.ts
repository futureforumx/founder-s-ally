// =============================================================================
// recomputeRelationshipContext.ts
// =============================================================================
// Strength formula for a relationship_edge / relationship_contexts pair.
//
// Scoring (max 100):
//   Meetings    35 (has ≥1) + 10 (has ≥3)  = max 45
//   CRM touch   20 (has ≥1)                  = max 20
//   Email       20 (has ≥1) + 5 (has ≥5)    = max 25
//   LinkedIn     5 (linked)                  = max  5
//   Recency     15 (≤30d) | 10 (≤90d) | 5 (≤180d) = max 15
//   -------------------------------------------  total max 110 → capped at 100
// =============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type { RelationshipEdge, RelationshipContext } from "./connector-types.ts";

// ---------------------------------------------------------------------------
// computeStrength
// ---------------------------------------------------------------------------

export interface StrengthComponents {
  meetingBase:      number;   // 35 if meeting_count > 0
  meetingBonus:     number;   // 10 if meeting_count >= 3
  crmComponent:     number;   // 20 if crm_touch_count > 0
  emailBase:        number;   // 20 if email_count > 0
  emailBonus:       number;   //  5 if email_count >= 5
  linkedinComponent: number;  //  5 if last_linkedin_connection_at IS NOT NULL
  recency:          number;   // 15 / 10 / 5 / 0
  total:            number;   // sum, capped at 100
}

export function computeStrength(
  edge: RelationshipEdge,
  ctx: RelationshipContext,
): StrengthComponents {
  const meetingBase      = edge.meeting_count > 0 ? 35 : 0;
  const meetingBonus     = edge.meeting_count >= 3 ? 10 : 0;
  const crmComponent     = edge.crm_touch_count > 0 ? 20 : 0;
  const emailBase        = edge.email_count > 0 ? 20 : 0;
  const emailBonus       = edge.email_count >= 5 ? 5 : 0;
  const linkedinComponent = ctx.last_linkedin_connection_at != null ? 5 : 0;

  let recency = 0;
  if (edge.last_interaction_at) {
    const daysSince =
      (Date.now() - new Date(edge.last_interaction_at).getTime()) /
      (1000 * 60 * 60 * 24);
    if (daysSince <= 30)       recency = 15;
    else if (daysSince <= 90)  recency = 10;
    else if (daysSince <= 180) recency = 5;
  }

  const total = Math.min(
    100,
    meetingBase + meetingBonus + crmComponent + emailBase + emailBonus +
    linkedinComponent + recency,
  );

  return {
    meetingBase, meetingBonus, crmComponent, emailBase, emailBonus,
    linkedinComponent, recency, total,
  };
}

// ---------------------------------------------------------------------------
// recomputeRelationshipContext
// ---------------------------------------------------------------------------

/**
 * Reads the current relationship_edge + relationship_context, recomputes
 * strength, and writes the updated strength + raw_strength_components back.
 *
 * @param supabase   Service-role client.
 * @param edgeId     UUID of the relationship_edges row.
 * @param ownerContextId  UUID of the owning context (for the relationship_contexts row).
 */
export async function recomputeRelationshipContext(
  supabase: SupabaseClient,
  edgeId: string,
  ownerContextId: string,
): Promise<void> {
  // Fetch edge
  const { data: edgeRow, error: edgeErr } = await supabase
    .from("relationship_edges")
    .select()
    .eq("id", edgeId)
    .single();

  if (edgeErr || !edgeRow) {
    throw new Error(
      `recomputeRelationshipContext: edge not found (${edgeId}): ${edgeErr?.message ?? "no row"}`,
    );
  }

  // Fetch context
  const { data: ctxRow, error: ctxErr } = await supabase
    .from("relationship_contexts")
    .select()
    .eq("edge_id", edgeId)
    .eq("owner_context_id", ownerContextId)
    .single();

  if (ctxErr || !ctxRow) {
    throw new Error(
      `recomputeRelationshipContext: context not found for edge ${edgeId}: ${ctxErr?.message ?? "no row"}`,
    );
  }

  const components = computeStrength(
    edgeRow as RelationshipEdge,
    ctxRow as RelationshipContext,
  );

  // Update edge strength
  const { error: edgeUpdateErr } = await supabase
    .from("relationship_edges")
    .update({ strength: components.total })
    .eq("id", edgeId);

  if (edgeUpdateErr) {
    throw new Error(
      `recomputeRelationshipContext: edge strength update failed: ${edgeUpdateErr.message}`,
    );
  }

  // Update context with raw components
  const { error: ctxUpdateErr } = await supabase
    .from("relationship_contexts")
    .update({ raw_strength_components: components as unknown as Record<string, unknown> })
    .eq("id", (ctxRow as RelationshipContext).id);

  if (ctxUpdateErr) {
    throw new Error(
      `recomputeRelationshipContext: context update failed: ${ctxUpdateErr.message}`,
    );
  }
}
