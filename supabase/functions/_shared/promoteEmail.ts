// =============================================================================
// promoteEmail.ts
// =============================================================================
// Promotes a staged email_messages row into the graph layer:
//   1. Upserts an interactions row (kind = 'email').
//   2. Queries message_participants and resolves each to a people row.
//   3. Upserts interaction_participants.
//   4. Back-fills message_participants.person_id where resolved.
//   5. Calls upsertEdge for each (self, other) participant pair.
//
// Tables read:    email_messages, message_participants
// Tables written: interactions, interaction_participants,
//                 message_participants (person_id / is_self update),
//                 relationship_edges, relationship_contexts
// =============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type {
  ConnectorSourceRecord,
  EmailMessage,
  MessageParticipant,
  Interaction,
  InteractionParticipant,
  PromoteEmailResult,
} from "./connector-types.ts";
import { ensurePersonByEmail } from "./resolveIdentity.ts";
import { upsertEdge }          from "./upsertEdge.ts";

// ---------------------------------------------------------------------------
// promoteEmail
// ---------------------------------------------------------------------------

export async function promoteEmail(
  supabase: SupabaseClient,
  sourceRecord: ConnectorSourceRecord,
  message: EmailMessage,
  selfPersonId: string | null,
): Promise<PromoteEmailResult> {
  // --- 1. Upsert interaction ---
  let interaction: Interaction;
  let alreadyExisted = false;

  const interactionRow = {
    owner_context_id: sourceRecord.owner_context_id,
    source_record_id: sourceRecord.id,
    kind:             "email" as const,
    external_id:      message.external_id,
    title:            message.subject ?? null,
    body_text:        message.body_text ?? null,
    occurred_at:      message.sent_at ?? message.received_at ?? null,
    metadata:         { thread_id: message.thread_id, labels: message.labels },
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("interactions")
    .insert(interactionRow)
    .select()
    .single();

  if (!insertErr) {
    interaction = inserted as Interaction;
  } else if ((insertErr as { code?: string }).code === "23505") {
    alreadyExisted = true;
    const { data: existing, error: fetchErr } = await supabase
      .from("interactions")
      .select()
      .eq("owner_context_id", sourceRecord.owner_context_id)
      .eq("kind", "email")
      .eq("external_id", message.external_id)
      .single();

    if (fetchErr || !existing) {
      throw new Error(`promoteEmail: interaction fetch-after-conflict failed: ${fetchErr?.message ?? "no row"}`);
    }
    interaction = existing as Interaction;
  } else {
    throw new Error(`promoteEmail: interaction insert failed: ${insertErr.message}`);
  }

  // --- 2. Query message_participants ---
  const { data: participants, error: partErr } = await supabase
    .from("message_participants")
    .select()
    .eq("email_message_id", message.id);

  if (partErr) {
    throw new Error(`promoteEmail: message_participants query failed: ${partErr.message}`);
  }

  const parts = (participants ?? []) as MessageParticipant[];

  // --- 3. Resolve people and upsert interaction_participants ---
  let participantCount = 0;

  // Determine the self email for is_self flagging
  const selfEmail = selfPersonId
    ? await getSelfEmail(supabase, selfPersonId)
    : null;

  for (const mp of parts) {
    if (!mp.email) continue;

    // Resolve person by email (create if needed)
    const person = await ensurePersonByEmail(supabase, mp.email, mp.display_name ?? undefined);
    const isSelf  = selfEmail != null && mp.email === selfEmail;

    // Upsert interaction_participant
    const ipRow = {
      interaction_id:   interaction.id,
      owner_context_id: sourceRecord.owner_context_id,
      person_id:        person.id,
      email:            mp.email,
      display_name:     mp.display_name ?? null,
      role:             mp.role,
      is_self:          isSelf,
    };

    const { error: ipErr } = await supabase
      .from("interaction_participants")
      .insert(ipRow)
      .select("id");

    if (ipErr && (ipErr as { code?: string }).code !== "23505") {
      throw new Error(`promoteEmail: interaction_participants insert failed: ${ipErr.message}`);
    }
    participantCount++;

    // --- 4. Back-fill message_participants.person_id ---
    if (!mp.person_id) {
      await supabase
        .from("message_participants")
        .update({ person_id: person.id, is_self: isSelf })
        .eq("id", mp.id);
    }
  }

  // --- 5. Upsert edges for each (self, other) pair ---
  if (selfPersonId) {
    const occurredAt = interactionRow.occurred_at;

    // Determine self's role (from = sender, else recipient)
    const selfPart = parts.find((p) => selfEmail && p.email === selfEmail);
    const selfRole = selfPart?.role ?? "to";

    for (const mp of parts) {
      if (!mp.email) continue;
      const person = await resolvePersonIdByEmail(supabase, mp.email);
      if (!person || person === selfPersonId) continue;

      await upsertEdge(supabase, {
        ownerContextId: sourceRecord.owner_context_id,
        selfPersonId,
        otherPersonId: person,
        kind:          "email",
        occurredAt,
        selfRole,
      });
    }
  }

  return { interaction, participantCount, alreadyExisted };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the canonical email for a person by ID, or null. */
async function getSelfEmail(
  supabase: SupabaseClient,
  personId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("people")
    .select("email")
    .eq("id", personId)
    .maybeSingle();

  if (error) return null;
  return (data as { email?: string | null } | null)?.email ?? null;
}

/** Resolves a person's UUID by their email address (no-create). */
async function resolvePersonIdByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("people")
    .select("id")
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();

  return (data as { id?: string } | null)?.id ?? null;
}
