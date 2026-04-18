// =============================================================================
// stageCalendar.ts
// =============================================================================
// Parses a `connector_source_records` row whose record_type = 'calendar_event'
// and writes the structured output to calendar_events.
//
// Tables written: public.calendar_events
// Table read:     public.connector_source_records  (input)
// =============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type {
  CalendarEvent,
  ConnectorSourceRecord,
  ParsedCalendarEvent,
  StageCalendarResult,
} from "./connector-types.ts";
import { markSourceRecordProcessed } from "./persistSourceRecord.ts";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Stages a raw calendar connector_source_record into a structured
 * calendar_events row.
 *
 * @param supabase      Service-role Supabase client.
 * @param sourceRecord  Row from connector_source_records (record_type = 'calendar_event').
 * @returns             The staged event and idempotency flag.
 */
export async function stageCalendar(
  supabase: SupabaseClient,
  sourceRecord: ConnectorSourceRecord,
): Promise<StageCalendarResult> {
  if (sourceRecord.record_type !== "calendar_event") {
    throw new Error(
      `stageCalendar: expected record_type 'calendar_event', got '${sourceRecord.record_type}'`,
    );
  }

  const parsed = parseCalendarRawData(sourceRecord.raw_data);

  const eventRow = {
    owner_context_id: sourceRecord.owner_context_id,
    source_record_id: sourceRecord.id,
    external_id:      parsed.externalId,
    title:            parsed.title ?? null,
    description:      parsed.description ?? null,
    location:         parsed.location ?? null,
    starts_at:        parsed.startsAt ?? null,
    ends_at:          parsed.endsAt ?? null,
    is_all_day:       parsed.isAllDay ?? false,
    status:           parsed.status ?? null,
    organizer_email:  parsed.organizerEmail ?? null,
    metadata:         parsed.metadata ?? {},
  };

  // --- attempt insert ---
  let event: CalendarEvent;
  let alreadyExisted = false;

  const { data: inserted, error: insertErr } = await supabase
    .from("calendar_events")
    .insert(eventRow)
    .select()
    .single();

  if (!insertErr) {
    event = inserted as CalendarEvent;
  } else if ((insertErr as { code?: string }).code === "23505") {
    alreadyExisted = true;

    const { data: existing, error: fetchErr } = await supabase
      .from("calendar_events")
      .select()
      .eq("owner_context_id", sourceRecord.owner_context_id)
      .eq("external_id", parsed.externalId)
      .single();

    if (fetchErr || !existing) {
      throw new Error(
        `stageCalendar: fetch-after-conflict failed: ${fetchErr?.message ?? "no row"}`,
      );
    }
    event = existing as CalendarEvent;
  } else {
    throw new Error(`stageCalendar: calendar_events insert failed: ${insertErr.message}`);
  }

  // --- mark source record processed ---
  await markSourceRecordProcessed(supabase, sourceRecord.id);

  return { event, alreadyExisted };
}

// ---------------------------------------------------------------------------
// parseCalendarRawData
// ---------------------------------------------------------------------------
// Handles Google Calendar, Outlook, and generic calendar event shapes.

function parseCalendarRawData(raw: Record<string, unknown>): ParsedCalendarEvent {
  const externalId =
    str(raw.id) ??
    str(raw.eventId) ??
    str(raw.event_id) ??
    str(raw.iCalUID) ??
    str(raw.uid);

  if (!externalId) {
    throw new Error(
      "stageCalendar: raw_data missing required id / eventId / iCalUID field",
    );
  }

  // --- status normalisation ---
  const rawStatus = str(raw.status) ?? str(raw.responseStatus);
  const status = normaliseStatus(rawStatus);

  // --- organizer ---
  const organizerEmail =
    extractOrganizerEmail(raw.organizer) ??
    str(raw.organizerEmail) ??
    str(raw.organizer_email) ??
    null;

  // --- all-day detection ---
  const isAllDay = Boolean(
    raw.isAllDay ??
    raw.is_all_day ??
    (raw.start && typeof raw.start === "object" && (raw.start as Record<string, unknown>).date &&
     !(raw.start as Record<string, unknown>).dateTime),
  );

  // --- metadata passthrough ---
  const metadata: Record<string, unknown> = {};
  for (const k of [
    "attendees", "conferenceData", "recurringEventId", "recurrence",
    "visibility", "transparency", "colorId", "htmlLink", "etag",
  ]) {
    if (raw[k] !== undefined) metadata[k] = raw[k];
  }

  return {
    externalId,
    title:          str(raw.summary) ?? str(raw.title) ?? str(raw.subject) ?? null,
    description:    str(raw.description) ?? str(raw.body) ?? null,
    location:       str(raw.location) ?? null,
    startsAt:       extractDateTime(raw.start) ?? isoDate(raw.startAt ?? raw.start_at) ?? null,
    endsAt:         extractDateTime(raw.end) ?? isoDate(raw.endAt ?? raw.end_at) ?? null,
    isAllDay,
    status,
    organizerEmail,
    metadata,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extracts dateTime from Google Calendar { dateTime, timeZone } or { date } shapes */
function extractDateTime(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return isoDate(v);
  if (typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return isoDate(o.dateTime ?? o.date) ?? null;
  }
  return null;
}

/** Extracts organizer email from { email, displayName } object or plain string */
function extractOrganizerEmail(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.includes("@") ? v.trim().toLowerCase() : null;
  if (typeof v === "object" && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return str(o.email)?.toLowerCase() ?? null;
  }
  return null;
}

function normaliseStatus(s: string | null): string | null {
  if (!s) return null;
  const lower = s.toLowerCase();
  if (lower === "confirmed" || lower === "accepted") return "confirmed";
  if (lower === "tentative" || lower === "maybe")    return "tentative";
  if (lower === "cancelled" || lower === "canceled") return "cancelled";
  return lower;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function isoDate(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "number") return new Date(v).toISOString();
  if (typeof v === "string" && v.trim()) {
    const d = new Date(v.trim());
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}
