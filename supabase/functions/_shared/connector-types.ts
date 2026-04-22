// =============================================================================
// connector-types.ts
// =============================================================================
// Row types, insert-param interfaces, and result types for the Phase 2
// connector-ingestion layer.
//
// Table coverage:
//   connector_source_records  — raw staged records from OAuth connectors
//   email_messages            — parsed inbound/outbound emails
//   message_participants      — per-message participant rows
//   calendar_events           — parsed calendar events
//   crm_contacts              — CRM contact records
//   crm_companies             — CRM company records
//   crm_activities            — CRM activity / interaction records
//
// Auth note: user_id / owner_context_id values are Clerk user IDs (TEXT).
// =============================================================================

// ---------------------------------------------------------------------------
// Shared scalar types
// ---------------------------------------------------------------------------

export type RecordType =
  | "email"
  | "calendar_event"
  | "contact"
  | "company"
  | "activity";

export type ConnectorProvider =
  | "gmail"
  | "google_calendar"
  | "google_sheets"
  | "outlook"
  | "hubspot"
  | "salesforce"
  | "pipedrive"
  | "linear"
  | "notion"
  | "other";

export type ParticipantRole = "from" | "to" | "cc" | "bcc";

// ---------------------------------------------------------------------------
// connector_source_records
// ---------------------------------------------------------------------------

/** Full row as returned by SELECT * FROM connector_source_records */
export interface ConnectorSourceRecord {
  id: string;
  owner_context_id: string;
  sync_run_id: string | null;
  provider: ConnectorProvider | string;
  record_type: RecordType;
  external_id: string;
  raw_data: Record<string, unknown>;
  staged_at: string;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Params for persistSourceRecord() */
export interface PersistSourceRecordParams {
  ownerContextId: string;
  syncRunId?: string | null;
  provider: ConnectorProvider | string;
  recordType: RecordType;
  externalId: string;
  rawData: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// email_messages
// ---------------------------------------------------------------------------

/** Full row as returned by SELECT * FROM email_messages */
export interface EmailMessage {
  id: string;
  owner_context_id: string;
  source_record_id: string | null;
  external_id: string;
  thread_id: string | null;
  subject: string | null;
  body_text: string | null;
  body_html: string | null;
  from_email: string | null;
  from_name: string | null;
  sent_at: string | null;
  received_at: string | null;
  is_inbound: boolean | null;
  labels: string[];
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Params extracted from raw_data by stageEmail() */
export interface ParsedEmail {
  externalId: string;
  threadId?: string | null;
  subject?: string | null;
  bodyText?: string | null;
  bodyHtml?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  sentAt?: string | null;
  receivedAt?: string | null;
  isInbound?: boolean | null;
  labels?: string[];
  metadata?: Record<string, unknown>;
  participants: ParsedParticipant[];
}

export interface ParsedParticipant {
  email: string;
  displayName?: string | null;
  role: ParticipantRole;
}

export interface StageEmailResult {
  message: EmailMessage;
  participantCount: number;
  alreadyExisted: boolean;
}

// ---------------------------------------------------------------------------
// message_participants
// ---------------------------------------------------------------------------

export interface MessageParticipant {
  id: string;
  owner_context_id: string;
  email_message_id: string;
  email: string;
  display_name: string | null;
  role: ParticipantRole;
  created_at: string;
}

// ---------------------------------------------------------------------------
// calendar_events
// ---------------------------------------------------------------------------

/** Full row as returned by SELECT * FROM calendar_events */
export interface CalendarEvent {
  id: string;
  owner_context_id: string;
  source_record_id: string | null;
  external_id: string;
  title: string | null;
  description: string | null;
  location: string | null;
  starts_at: string | null;
  ends_at: string | null;
  is_all_day: boolean;
  status: string | null;
  organizer_email: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Params extracted from raw_data by stageCalendar() */
export interface ParsedCalendarEvent {
  externalId: string;
  title?: string | null;
  description?: string | null;
  location?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isAllDay?: boolean;
  status?: string | null;
  organizerEmail?: string | null;
  metadata?: Record<string, unknown>;
}

export interface StageCalendarResult {
  event: CalendarEvent;
  alreadyExisted: boolean;
}

// ---------------------------------------------------------------------------
// crm_contacts
// ---------------------------------------------------------------------------

export interface CrmContact {
  id: string;
  owner_context_id: string;
  source_record_id: string | null;
  external_id: string | null;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company: string | null;
  phone: string | null;
  linkedin_url: string | null;
  notes: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// crm_companies
// ---------------------------------------------------------------------------

export interface CrmCompany {
  id: string;
  owner_context_id: string;
  source_record_id: string | null;
  external_id: string | null;
  name: string;
  domain: string | null;
  description: string | null;
  industry: string | null;
  employee_count: number | null;
  website_url: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// crm_activities
// ---------------------------------------------------------------------------

export type CrmActivityType = "call" | "meeting" | "email" | "note" | "task";

export interface CrmActivity {
  id: string;
  owner_context_id: string;
  source_record_id: string | null;
  external_id: string | null;
  activity_type: CrmActivityType | string;
  title: string | null;
  body: string | null;
  occurred_at: string | null;
  contact_id: string | null;
  company_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Full parsed CRM payload — a single source record may contain any combination */
export interface ParsedCrmPayload {
  contact?: {
    externalId?: string | null;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    title?: string | null;
    company?: string | null;
    phone?: string | null;
    linkedinUrl?: string | null;
    notes?: string | null;
    metadata?: Record<string, unknown>;
  } | null;
  company?: {
    externalId?: string | null;
    name: string;
    domain?: string | null;
    description?: string | null;
    industry?: string | null;
    employeeCount?: number | null;
    websiteUrl?: string | null;
    metadata?: Record<string, unknown>;
  } | null;
  activity?: {
    externalId?: string | null;
    activityType: CrmActivityType | string;
    title?: string | null;
    body?: string | null;
    occurredAt?: string | null;
    metadata?: Record<string, unknown>;
  } | null;
}

export interface StageCrmResult {
  contact: CrmContact | null;
  company: CrmCompany | null;
  activity: CrmActivity | null;
}

// ---------------------------------------------------------------------------
// Dispatcher result (used by source-record-created router)
// ---------------------------------------------------------------------------

export type DispatchOutcome =
  | { type: "email";    result: StageEmailResult }
  | { type: "calendar"; result: StageCalendarResult }
  | { type: "crm";      result: StageCrmResult }
  | { type: "skipped";  reason: string };

// ---------------------------------------------------------------------------
// Phase 3 — graph layer
// ---------------------------------------------------------------------------

// Subset of people columns we reference (Prisma-managed table, camelCase cols)
export interface PersonRecord {
  id: string;               // uuid stored as string
  canonicalName: string;
  dedupeKey: string;
  email: string | null;
  linkedinUrl: string | null;
}

// Subset of organizations columns we reference (Prisma-managed, camelCase)
export interface OrganizationRecord {
  id: string;               // uuid stored as string
  canonicalName: string;
  dedupeKey: string;
  domain: string | null;
}

// interactions row
export interface Interaction {
  id: string;
  owner_context_id: string;
  source_record_id: string | null;
  kind: "email" | "meeting" | "crm_touch";
  external_id: string | null;
  title: string | null;
  body_text: string | null;
  occurred_at: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// interaction_participants row
export interface InteractionParticipant {
  id: string;
  interaction_id: string;
  owner_context_id: string;
  person_id: string | null;   // uuid stored as string
  email: string | null;
  display_name: string | null;
  role: string;
  is_self: boolean;
  created_at: string;
}

// relationship_edges row
export interface RelationshipEdge {
  id: string;
  owner_context_id: string;
  person_a_id: string;        // uuid stored as string
  person_b_id: string;        // uuid stored as string
  strength: number;
  email_count: number;
  meeting_count: number;
  crm_touch_count: number;
  last_interaction_at: string | null;
  first_interaction_at: string | null;
  created_at: string;
  updated_at: string;
}

// relationship_contexts row
export interface RelationshipContext {
  id: string;
  edge_id: string;
  owner_context_id: string;
  email_sent_count: number;
  email_received_count: number;
  meeting_as_organizer_count: number;
  meeting_as_attendee_count: number;
  crm_touch_count: number;
  last_linkedin_connection_at: string | null;
  raw_strength_components: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Phase 4 — targeting and recommendations
// ---------------------------------------------------------------------------

export type PipelineStage = "researching" | "reaching_out" | "met" | "passed" | "committed";
export type RecommendationKind = "ask_intro" | "reach_out";
export type RecommendationState = "open" | "snoozed" | "dismissed" | "acted" | "completed" | "expired";

/** context_entity_notes row */
export interface ContextEntityNote {
  id: string;
  owner_context_id: string;
  subject_type: "person" | "organization";
  person_id: string | null;
  organization_id: string | null;
  notes: string | null;
  custom_tags: string[] | null;
  fit_score: number | null;
  pipeline_stage: PipelineStage | null;
  created_at: string;
  updated_at: string;
}

/** recommendations row */
export interface Recommendation {
  id: string;
  owner_context_id: string;
  kind: RecommendationKind;
  subject_person_id: string | null;
  subject_organization_id: string | null;
  via_person_id: string | null;
  score: number;
  rationale: Record<string, unknown>;
  state: RecommendationState;
  snoozed_until: string | null;
  expires_at: string | null;
  dedup_key: string;
  created_at: string;
  updated_at: string;
}

/** Row returned by paths_to_organization() SQL function */
export interface PathRow {
  path_type: "direct" | "one_hop";
  target_person_id: string;
  via_person_id: string | null;
  path_score: number;
  last_interaction_at: string | null;
}

// Result types for promotion functions
export interface PromoteEmailResult {
  interaction: Interaction;
  participantCount: number;
  alreadyExisted: boolean;
}

export interface PromoteCalendarResult {
  interaction: Interaction;
  participantCount: number;
  alreadyExisted: boolean;
}

export interface PromoteCrmResult {
  interaction: Interaction | null;
  alreadyExisted: boolean;
}
