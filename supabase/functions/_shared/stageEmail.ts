// =============================================================================
// stageEmail.ts
// =============================================================================
// Parses a `connector_source_records` row whose record_type = 'email' and
// writes the structured output to:
//   • email_messages           (upsert on owner_context_id + external_id)
//   • message_participants     (insert-if-absent, keyed on message + email + role)
//
// Then stamps connector_source_records.processed_at.
//
// Tables written:
//   public.email_messages
//   public.message_participants
// Table read:
//   public.connector_source_records  (input)
// =============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type {
  ConnectorSourceRecord,
  EmailMessage,
  MessageParticipant,
  ParsedEmail,
  ParsedParticipant,
  StageEmailResult,
} from "./connector-types.ts";
import { markSourceRecordProcessed } from "./persistSourceRecord.ts";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Stages a raw email connector_source_record into structured email_messages
 * + message_participants rows.
 *
 * @param supabase      Service-role Supabase client.
 * @param sourceRecord  Row from connector_source_records (record_type = 'email').
 * @returns             The staged message, participant count, and idempotency flag.
 */
export async function stageEmail(
  supabase: SupabaseClient,
  sourceRecord: ConnectorSourceRecord,
): Promise<StageEmailResult> {
  if (sourceRecord.record_type !== "email") {
    throw new Error(
      `stageEmail: expected record_type 'email', got '${sourceRecord.record_type}'`,
    );
  }

  const parsed = parseEmailRawData(sourceRecord.raw_data);

  // --- upsert email_messages ---
  const messageRow = {
    owner_context_id: sourceRecord.owner_context_id,
    source_record_id: sourceRecord.id,
    external_id:      parsed.externalId,
    thread_id:        parsed.threadId ?? null,
    subject:          parsed.subject ?? null,
    body_text:        parsed.bodyText ?? null,
    body_html:        parsed.bodyHtml ?? null,
    from_email:       parsed.fromEmail ?? null,
    from_name:        parsed.fromName ?? null,
    sent_at:          parsed.sentAt ?? null,
    received_at:      parsed.receivedAt ?? null,
    is_inbound:       parsed.isInbound ?? null,
    labels:           parsed.labels ?? [],
    metadata:         parsed.metadata ?? {},
  };

  // Attempt insert first
  let message: EmailMessage;
  let alreadyExisted = false;

  const { data: inserted, error: insertErr } = await supabase
    .from("email_messages")
    .insert(messageRow)
    .select()
    .single();

  if (!insertErr) {
    message = inserted as EmailMessage;
  } else if ((insertErr as { code?: string }).code === "23505") {
    // Already staged — fetch existing
    alreadyExisted = true;
    const { data: existing, error: fetchErr } = await supabase
      .from("email_messages")
      .select()
      .eq("owner_context_id", sourceRecord.owner_context_id)
      .eq("external_id", parsed.externalId)
      .single();

    if (fetchErr || !existing) {
      throw new Error(
        `stageEmail: fetch-after-conflict failed: ${fetchErr?.message ?? "no row"}`,
      );
    }
    message = existing as EmailMessage;
  } else {
    throw new Error(`stageEmail: email_messages insert failed: ${insertErr.message}`);
  }

  // --- insert message_participants (skip duplicates silently) ---
  // Always attempt insertion — even on retry (alreadyExisted = true) — so that
  // a run interrupted after email_messages insert but before participants insert
  // will fill the gap on the next attempt.  The UNIQUE index on
  // (email_message_id, email, role) combined with ignoreDuplicates:true makes
  // this safe: already-inserted rows are silently skipped.
  let participantCount = 0;
  if (parsed.participants.length > 0) {
    participantCount = await insertParticipants(
      supabase,
      message.id,
      sourceRecord.owner_context_id,
      parsed.participants,
    );
  }

  // --- mark source record processed ---
  await markSourceRecordProcessed(supabase, sourceRecord.id);

  return { message, participantCount, alreadyExisted };
}

// ---------------------------------------------------------------------------
// insertParticipants
// ---------------------------------------------------------------------------

async function insertParticipants(
  supabase: SupabaseClient,
  messageId: string,
  ownerContextId: string,
  participants: ParsedParticipant[],
): Promise<number> {
  if (participants.length === 0) return 0;

  const rows = participants.map((p) => ({
    owner_context_id: ownerContextId,
    email_message_id: messageId,
    email:            p.email.trim().toLowerCase(),
    display_name:     p.displayName ?? null,
    role:             p.role,
  }));

  // Use ignoreDuplicates — if the message was previously staged with participants,
  // we don't want a second attempt to fail on the unique index.
  const { data, error } = await supabase
    .from("message_participants")
    .insert(rows, { ignoreDuplicates: true })
    .select("id");

  if (error) {
    throw new Error(`stageEmail: message_participants insert failed: ${error.message}`);
  }

  return (data ?? []).length;
}

// ---------------------------------------------------------------------------
// parseEmailRawData
// ---------------------------------------------------------------------------
// Extracts a ParsedEmail from the raw_data blob.
// Handles common envelope shapes from Gmail, Outlook, and generic adapters.

function parseEmailRawData(raw: Record<string, unknown>): ParsedEmail {
  // --- external id ---
  const externalId =
    str(raw.id) ??
    str(raw.messageId) ??
    str(raw.message_id) ??
    str(raw.internetMessageId);

  if (!externalId) {
    throw new Error(
      "stageEmail: raw_data missing required id / messageId field",
    );
  }

  // --- participants ---
  const participants: ParsedParticipant[] = [];

  const fromAddr = str(raw.from) ?? str((raw as Record<string, unknown>)?.["from_address"]);
  if (fromAddr) {
    const { email, name } = parseAddress(fromAddr);
    if (email) participants.push({ email, displayName: name, role: "from" });
  }

  for (const { key, role } of [
    { key: "to",  role: "to"  as const },
    { key: "cc",  role: "cc"  as const },
    { key: "bcc", role: "bcc" as const },
  ]) {
    const val = raw[key];
    const addrs: string[] = Array.isArray(val)
      ? val.map(String)
      : typeof val === "string" && val.trim()
      ? val.split(",").map((s) => s.trim())
      : [];

    for (const addr of addrs) {
      const { email, name } = parseAddress(addr);
      if (email) participants.push({ email, displayName: name, role });
    }
  }

  // --- labels ---
  const labelsRaw = raw.labels ?? raw.labelIds ?? raw.categories;
  const labels: string[] = Array.isArray(labelsRaw)
    ? labelsRaw.map(String)
    : typeof labelsRaw === "string" && labelsRaw
    ? [labelsRaw]
    : [];

  // --- metadata passthrough ---
  const metadata: Record<string, unknown> = {};
  for (const k of ["provider", "historyId", "internalDate", "sizeEstimate", "raw"]) {
    if (raw[k] !== undefined) metadata[k] = raw[k];
  }

  return {
    externalId,
    threadId:   str(raw.threadId) ?? str(raw.thread_id) ?? null,
    subject:    str(raw.subject) ?? null,
    bodyText:   str(raw.bodyText) ?? str(raw.body_text) ?? str(raw.snippet) ?? null,
    bodyHtml:   str(raw.bodyHtml) ?? str(raw.body_html) ?? null,
    fromEmail:  participants.find((p) => p.role === "from")?.email ?? null,
    fromName:   participants.find((p) => p.role === "from")?.displayName ?? null,
    sentAt:     isoDate(raw.sentAt ?? raw.sent_at ?? raw.date) ?? null,
    receivedAt: isoDate(raw.receivedAt ?? raw.received_at ?? raw.internalDate) ?? null,
    isInbound:  raw.isInbound != null
      ? Boolean(raw.isInbound)
      : raw.labelIds && Array.isArray(raw.labelIds) && (raw.labelIds as string[]).includes("INBOX")
      ? true
      : null,
    labels,
    metadata,
    participants,
  };
}

// ---------------------------------------------------------------------------
// Address parser helpers
// ---------------------------------------------------------------------------

/** Parse "Display Name <email@example.com>" or plain "email@example.com" */
function parseAddress(addr: string): { email: string | null; name: string | null } {
  const match = addr.match(/^(.*?)\s*<([^>]+)>$/);
  if (match) {
    return {
      name:  match[1].trim().replace(/^["']|["']$/g, "") || null,
      email: match[2].trim().toLowerCase(),
    };
  }
  const plain = addr.trim().toLowerCase();
  return { email: plain.includes("@") ? plain : null, name: null };
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
