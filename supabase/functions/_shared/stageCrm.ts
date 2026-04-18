// =============================================================================
// stageCrm.ts
// =============================================================================
// Parses a `connector_source_records` row whose record_type is one of:
//   'contact' | 'company' | 'activity'
// and writes structured output to:
//   • crm_contacts
//   • crm_companies
//   • crm_activities
//
// A single source record can carry a contact + company + activity together
// (e.g. HubSpot engagement payloads). All three are written atomically when
// present; each is independently idempotent on (owner_context_id, external_id).
//
// Tables written: public.crm_contacts, public.crm_companies, public.crm_activities
// Table read:     public.connector_source_records  (input)
// =============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type {
  ConnectorSourceRecord,
  CrmActivity,
  CrmCompany,
  CrmContact,
  ParsedCrmPayload,
  StageCrmResult,
} from "./connector-types.ts";
import { markSourceRecordProcessed } from "./persistSourceRecord.ts";

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Stages a raw CRM connector_source_record into structured crm_* rows.
 *
 * @param supabase      Service-role Supabase client.
 * @param sourceRecord  Row from connector_source_records (record_type one of
 *                      'contact' | 'company' | 'activity').
 * @returns             Staged contact, company, and/or activity (each nullable).
 */
export async function stageCrm(
  supabase: SupabaseClient,
  sourceRecord: ConnectorSourceRecord,
): Promise<StageCrmResult> {
  const validTypes = ["contact", "company", "activity"] as const;
  if (!validTypes.includes(sourceRecord.record_type as typeof validTypes[number])) {
    throw new Error(
      `stageCrm: expected record_type in [contact, company, activity], got '${sourceRecord.record_type}'`,
    );
  }

  const parsed = parseCrmRawData(sourceRecord.raw_data, sourceRecord.record_type as string);

  const [contact, company] = await Promise.all([
    parsed.contact
      ? upsertContact(supabase, sourceRecord, parsed.contact)
      : Promise.resolve(null),
    parsed.company
      ? upsertCompany(supabase, sourceRecord, parsed.company)
      : Promise.resolve(null),
  ]);

  const activity = parsed.activity
    ? await upsertActivity(supabase, sourceRecord, parsed.activity, contact?.id ?? null, company?.id ?? null)
    : null;

  // --- mark source record processed ---
  await markSourceRecordProcessed(supabase, sourceRecord.id);

  return { contact, company, activity };
}

// ---------------------------------------------------------------------------
// upsertContact
// ---------------------------------------------------------------------------

async function upsertContact(
  supabase: SupabaseClient,
  sourceRecord: ConnectorSourceRecord,
  c: NonNullable<ParsedCrmPayload["contact"]>,
): Promise<CrmContact> {
  const row = {
    owner_context_id: sourceRecord.owner_context_id,
    source_record_id: sourceRecord.id,
    external_id:      c.externalId ?? null,
    email:            c.email?.trim().toLowerCase() ?? null,
    first_name:       c.firstName ?? null,
    last_name:        c.lastName ?? null,
    title:            c.title ?? null,
    company:          c.company ?? null,
    phone:            c.phone ?? null,
    linkedin_url:     c.linkedinUrl ?? null,
    notes:            c.notes ?? null,
    metadata:         c.metadata ?? {},
  };

  // Try insert; if duplicate external_id exists for this context, update instead
  const { data: inserted, error: insertErr } = await supabase
    .from("crm_contacts")
    .insert(row)
    .select()
    .single();

  if (!insertErr) return inserted as CrmContact;

  // 23505 = unique_violation — no unique constraint on crm_contacts yet, but
  // guard for future addition; also handles any race conditions.
  if ((insertErr as { code?: string }).code !== "23505") {
    throw new Error(`stageCrm: crm_contacts insert failed: ${insertErr.message}`);
  }

  // Fetch by external_id + owner_context_id
  if (c.externalId) {
    const { data: existing, error: fetchErr } = await supabase
      .from("crm_contacts")
      .select()
      .eq("owner_context_id", sourceRecord.owner_context_id)
      .eq("external_id", c.externalId)
      .single();

    if (!fetchErr && existing) return existing as CrmContact;
  }

  // Fallback: fetch by email
  if (c.email) {
    const { data: byEmail } = await supabase
      .from("crm_contacts")
      .select()
      .eq("owner_context_id", sourceRecord.owner_context_id)
      .eq("email", c.email.trim().toLowerCase())
      .maybeSingle();

    if (byEmail) return byEmail as CrmContact;
  }

  throw new Error(
    `stageCrm: crm_contacts conflict but could not locate existing row for context ${sourceRecord.owner_context_id}`,
  );
}

// ---------------------------------------------------------------------------
// upsertCompany
// ---------------------------------------------------------------------------

async function upsertCompany(
  supabase: SupabaseClient,
  sourceRecord: ConnectorSourceRecord,
  c: NonNullable<ParsedCrmPayload["company"]>,
): Promise<CrmCompany> {
  const row = {
    owner_context_id: sourceRecord.owner_context_id,
    source_record_id: sourceRecord.id,
    external_id:      c.externalId ?? null,
    name:             c.name,
    domain:           c.domain ?? null,
    description:      c.description ?? null,
    industry:         c.industry ?? null,
    employee_count:   c.employeeCount ?? null,
    website_url:      c.websiteUrl ?? null,
    metadata:         c.metadata ?? {},
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("crm_companies")
    .insert(row)
    .select()
    .single();

  if (!insertErr) return inserted as CrmCompany;

  if ((insertErr as { code?: string }).code !== "23505") {
    throw new Error(`stageCrm: crm_companies insert failed: ${insertErr.message}`);
  }

  if (c.externalId) {
    const { data: existing } = await supabase
      .from("crm_companies")
      .select()
      .eq("owner_context_id", sourceRecord.owner_context_id)
      .eq("external_id", c.externalId)
      .maybeSingle();

    if (existing) return existing as CrmCompany;
  }

  if (c.domain) {
    const { data: byDomain } = await supabase
      .from("crm_companies")
      .select()
      .eq("owner_context_id", sourceRecord.owner_context_id)
      .eq("domain", c.domain)
      .maybeSingle();

    if (byDomain) return byDomain as CrmCompany;
  }

  throw new Error(
    `stageCrm: crm_companies conflict but could not locate existing row for context ${sourceRecord.owner_context_id}`,
  );
}

// ---------------------------------------------------------------------------
// upsertActivity
// ---------------------------------------------------------------------------

async function upsertActivity(
  supabase: SupabaseClient,
  sourceRecord: ConnectorSourceRecord,
  a: NonNullable<ParsedCrmPayload["activity"]>,
  contactId: string | null,
  companyId: string | null,
): Promise<CrmActivity> {
  const row = {
    owner_context_id: sourceRecord.owner_context_id,
    source_record_id: sourceRecord.id,
    external_id:      a.externalId ?? null,
    activity_type:    a.activityType,
    title:            a.title ?? null,
    body:             a.body ?? null,
    occurred_at:      a.occurredAt ?? null,
    contact_id:       contactId,
    company_id:       companyId,
    metadata:         a.metadata ?? {},
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("crm_activities")
    .insert(row)
    .select()
    .single();

  if (!insertErr) return inserted as CrmActivity;

  if ((insertErr as { code?: string }).code !== "23505") {
    throw new Error(`stageCrm: crm_activities insert failed: ${insertErr.message}`);
  }

  if (a.externalId) {
    const { data: existing } = await supabase
      .from("crm_activities")
      .select()
      .eq("owner_context_id", sourceRecord.owner_context_id)
      .eq("external_id", a.externalId)
      .maybeSingle();

    if (existing) return existing as CrmActivity;
  }

  throw new Error(
    `stageCrm: crm_activities conflict but could not locate existing row for context ${sourceRecord.owner_context_id}`,
  );
}

// ---------------------------------------------------------------------------
// parseCrmRawData
// ---------------------------------------------------------------------------
// Normalises HubSpot, Salesforce, Pipedrive, and generic CRM payload shapes.

function parseCrmRawData(
  raw: Record<string, unknown>,
  recordType: string,
): ParsedCrmPayload {
  const result: ParsedCrmPayload = {};

  // --- contact ---
  if (recordType === "contact" || raw.contact || raw.properties?.email || raw.email) {
    const props = (raw.properties as Record<string, unknown>) ?? raw;
    result.contact = {
      externalId:  str(raw.id) ?? str(raw.objectId) ?? null,
      email:       str(props.email) ?? str(raw.email) ?? null,
      firstName:   str(props.firstname) ?? str(props.first_name) ?? str(raw.firstName) ?? null,
      lastName:    str(props.lastname) ?? str(props.last_name) ?? str(raw.lastName) ?? null,
      title:       str(props.jobtitle) ?? str(props.title) ?? str(raw.title) ?? null,
      company:     str(props.company) ?? str(raw.company) ?? null,
      phone:       str(props.phone) ?? str(raw.phone) ?? null,
      linkedinUrl: str(props.hs_linkedin_url) ?? str(props.linkedin_url) ?? str(raw.linkedinUrl) ?? null,
      notes:       str(props.hs_notes_last_activity) ?? str(raw.notes) ?? null,
      metadata:    extractMetadata(raw, ["id", "objectId", "properties", "email", "firstName", "lastName"]),
    };
  }

  // --- company ---
  if (recordType === "company" || raw.company || raw.account) {
    const src = (raw.company as Record<string, unknown>) ??
                (raw.account as Record<string, unknown>) ??
                raw;
    const props = (src.properties as Record<string, unknown>) ?? src;
    const name = str(props.name) ?? str(src.name) ?? str(raw.name);
    if (name) {
      result.company = {
        externalId:    str(src.id) ?? str(raw.objectId) ?? null,
        name,
        domain:        str(props.domain) ?? str(src.domain) ?? null,
        description:   str(props.description) ?? str(src.description) ?? null,
        industry:      str(props.industry) ?? str(src.industry) ?? null,
        employeeCount: num(props.numberofemployees) ?? num(props.employee_count) ?? null,
        websiteUrl:    str(props.website) ?? str(src.website) ?? null,
        metadata:      extractMetadata(src, ["id", "name", "properties"]),
      };
    }
  }

  // --- activity ---
  if (recordType === "activity" || raw.engagement || raw.activity) {
    const engagement = (raw.engagement as Record<string, unknown>) ?? raw;
    const activityType = normaliseActivityType(
      str(engagement.type) ?? str(raw.activityType) ?? str(raw.type) ?? "note",
    );
    result.activity = {
      externalId:   str(raw.id) ?? str(engagement.id) ?? null,
      activityType,
      title:        str(raw.title) ?? str(engagement.title) ?? null,
      body:         str(raw.body) ?? str(raw.description) ?? extractBodyFromEngagement(raw) ?? null,
      occurredAt:   isoDate(engagement.timestamp ?? raw.occurredAt ?? raw.occurred_at ?? raw.createdAt) ?? null,
      metadata:     extractMetadata(raw, ["id", "type", "engagement"]),
    };
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normaliseActivityType(t: string): string {
  const lower = t.toLowerCase();
  if (lower === "email" || lower === "email_open") return "email";
  if (lower === "call" || lower === "phone") return "call";
  if (lower === "meeting" || lower === "appointment") return "meeting";
  if (lower === "task" || lower === "todo") return "task";
  return "note";
}

function extractBodyFromEngagement(raw: Record<string, unknown>): string | null {
  const meta = raw.metadata as Record<string, unknown> | null;
  if (!meta) return null;
  return str(meta.body) ?? str(meta.text) ?? str(meta.subject) ?? null;
}

function extractMetadata(
  raw: Record<string, unknown>,
  skipKeys: string[],
): Record<string, unknown> {
  const skip = new Set(skipKeys);
  return Object.fromEntries(
    Object.entries(raw).filter(([k, v]) => !skip.has(k) && v !== undefined),
  );
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
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
