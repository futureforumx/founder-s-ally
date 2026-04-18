// =============================================================================
// promoteCalendar.ts
// =============================================================================
// Promotes a staged calendar_events row into the graph layer:
//   1. Upserts an interactions row (kind = 'meeting').
//   2. Extracts attendees from event.metadata.attendees + organizer_email.
//   3. Resolves each attendee to a people row.
//   4. Upserts interaction_participants.
//   5. Calls upsertEdge for each (self, other) attendee pair.
//
// Tables read:    calendar_events (passed in)
// Tables written: interactions, interaction_participants,
//                 relationship_edges, relationship_contexts
// =============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type {
  ConnectorSourceRecord,
  CalendarEvent,
  Interaction,
  PromoteCalendarResult,
} from "./connector-types.ts";
import { ensurePersonByEmail } from "./resolveIdentity.ts";
import { upsertEdge }          from "./upsertEdge.ts";

// ---------------------------------------------------------------------------
// promoteCalendar
// ---------------------------------------------------------------------------

export async function promoteCalendar(
  supabase: SupabaseClient,
  sourceRecord: ConnectorSourceRecord,
  event: CalendarEvent,
  selfPersonId: string | null,
): Promise<PromoteCalendarResult> {
  // --- 1. Compute duration ---
  const durationSeconds = computeDuration(event.starts_at, event.ends_at);

  // --- 2. Upsert interaction ---
  let interaction: Interaction;
  let alreadyExisted = false;

  const interactionRow = {
    owner_context_id: sourceRecord.owner_context_id,
    source_record_id: sourceRecord.id,
    kind:             "meeting" as const,
    external_id:      event.external_id,
    title:            event.title ?? null,
    body_text:        event.description ?? null,
    occurred_at:      event.starts_at ?? null,
    duration_seconds: durationSeconds,
    metadata:         { location: event.location, status: event.status },
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
      .eq("kind", "meeting")
      .eq("external_id", event.external_id)
      .single();

    if (fetchErr || !existing) {
      throw new Error(`promoteCalendar: interaction fetch-after-conflict failed: ${fetchErr?.message ?? "no row"}`);
    }
    interaction = existing as Interaction;
  } else {
    throw new Error(`promoteCalendar: interaction insert failed: ${insertErr.message}`);
  }

  // --- 3. Extract attendees ---
  const attendees = extractAttendees(event);

  // --- 4. Resolve people + upsert interaction_participants ---
  let participantCount = 0;

  const selfEmail = selfPersonId
    ? await getSelfEmail(supabase, selfPersonId)
    : null;

  for (const attendee of attendees) {
    if (!attendee.email) continue;

    const person  = await ensurePersonByEmail(supabase, attendee.email, attendee.displayName);
    const isSelf  = selfEmail != null && attendee.email === selfEmail;

    const ipRow = {
      interaction_id:   interaction.id,
      owner_context_id: sourceRecord.owner_context_id,
      person_id:        person.id,
      email:            attendee.email,
      display_name:     attendee.displayName ?? null,
      role:             attendee.role,
      is_self:          isSelf,
    };

    const { error: ipErr } = await supabase
      .from("interaction_participants")
      .insert(ipRow)
      .select("id");

    if (ipErr && (ipErr as { code?: string }).code !== "23505") {
      throw new Error(`promoteCalendar: interaction_participants insert failed: ${ipErr.message}`);
    }
    participantCount++;
  }

  // --- 5. Upsert edges ---
  if (selfPersonId) {
    const occurredAt = event.starts_at ?? null;

    // Self is organizer if their email matches organizer_email
    const isSelfOrganizer =
      selfEmail != null &&
      event.organizer_email != null &&
      event.organizer_email === selfEmail;
    const selfRole = isSelfOrganizer ? "organizer" : "attendee";

    for (const attendee of attendees) {
      if (!attendee.email) continue;
      const { data: personRow } = await supabase
        .from("people")
        .select("id")
        .eq("email", attendee.email.trim().toLowerCase())
        .maybeSingle();

      const otherPersonId = (personRow as { id?: string } | null)?.id;
      if (!otherPersonId || otherPersonId === selfPersonId) continue;

      await upsertEdge(supabase, {
        ownerContextId: sourceRecord.owner_context_id,
        selfPersonId,
        otherPersonId,
        kind:          "meeting",
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

interface ParsedAttendee {
  email: string | null;
  displayName: string | null;
  role: "organizer" | "attendee";
}

/** Extracts attendees from the event's raw metadata and organizer_email. */
function extractAttendees(event: CalendarEvent): ParsedAttendee[] {
  const results: ParsedAttendee[] = [];
  const seenEmails = new Set<string>();

  // Organizer (always included with role = 'organizer')
  if (event.organizer_email) {
    const email = event.organizer_email.trim().toLowerCase();
    seenEmails.add(email);
    results.push({ email, displayName: null, role: "organizer" });
  }

  // Attendees from metadata.attendees (Google Calendar format)
  const rawAttendees = (event.metadata as Record<string, unknown>)?.attendees;
  if (Array.isArray(rawAttendees)) {
    for (const a of rawAttendees) {
      if (typeof a !== "object" || a == null) continue;
      const obj = a as Record<string, unknown>;

      const email = typeof obj.email === "string"
        ? obj.email.trim().toLowerCase()
        : null;

      if (!email) continue;
      if (seenEmails.has(email)) continue;
      seenEmails.add(email);

      const displayName =
        typeof obj.displayName === "string" ? obj.displayName.trim() :
        typeof obj.name        === "string" ? obj.name.trim()        : null;

      results.push({ email, displayName: displayName || null, role: "attendee" });
    }
  }

  return results;
}

/** Computes duration in seconds from two nullable ISO timestamps. */
function computeDuration(
  startsAt: string | null | undefined,
  endsAt:   string | null | undefined,
): number | null {
  if (!startsAt || !endsAt) return null;
  const diff = new Date(endsAt).getTime() - new Date(startsAt).getTime();
  return diff > 0 ? Math.round(diff / 1000) : null;
}

/** Returns the canonical email for a person by ID. */
async function getSelfEmail(
  supabase: SupabaseClient,
  personId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("people")
    .select("email")
    .eq("id", personId)
    .maybeSingle();

  return (data as { email?: string | null } | null)?.email ?? null;
}
