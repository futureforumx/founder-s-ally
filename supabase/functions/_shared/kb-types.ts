// =============================================================================
// Aurora Knowledge Base — TypeScript Types & Interfaces
// =============================================================================
// These types map to the kb_* table family and service layer contracts.
// Canonical entity types (investor, company, profile) are NOT redefined here;
// they live in the existing schema. KB types only cover net-new artifacts.
// =============================================================================

// ---------------------------------------------------------------------------
// Canonical entity type enum — references existing tables without duplicating
// ---------------------------------------------------------------------------
export type CanonicalEntityType =
  | "investor"       // investor_database
  | "company"        // company_analyses
  | "profile"        // profiles
  | "competitor";    // competitors

// ---------------------------------------------------------------------------
// Table row types — match kb_* migration columns
// ---------------------------------------------------------------------------

export interface KbNote {
  id: string;
  workspace_id: string | null;
  user_id: string | null;
  title: string | null;
  body: string;
  note_type: string | null;
  source_type: string | null;
  source_ref: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  created_by_agent: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface KbDocument {
  id: string;
  workspace_id: string | null;
  user_id: string | null;
  title: string;
  document_type: string | null;
  mime_type: string | null;
  storage_path: string | null;
  raw_text: string | null;
  source_type: string | null;
  source_ref: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface KbDocumentChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  embedding: number[] | null;
  token_count: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface KbEntityLink {
  id: string;
  source_table: string;
  source_id: string;
  entity_type: string;
  entity_id: string;
  relationship_type: string | null;
  confidence: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface KbSummaryCard {
  id: string;
  entity_type: string;
  entity_id: string;
  card_type: string;
  title: string;
  summary: string;
  source_table: string | null;
  source_id: string | null;
  confidence: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface KbActionLog {
  id: string;
  user_id: string | null;
  workspace_id: string | null;
  agent_name: string | null;
  action_type: string;
  target_provider: string | null;
  status: "pending" | "running" | "success" | "failed" | "preview";
  preview_only: boolean;
  related_entity_type: string | null;
  related_entity_id: string | null;
  request_payload: Record<string, unknown>;
  response_payload: Record<string, unknown>;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface KbExternalAccount {
  id: string;
  user_id: string;
  provider: string;
  account_label: string | null;
  external_account_id: string | null;
  auth_status: "pending" | "active" | "revoked" | "expired";
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface KbExternalObjectLink {
  id: string;
  provider: string;
  entity_type: string;
  entity_id: string;
  external_object_type: string | null;
  external_object_id: string;
  external_url: string | null;
  sync_status: string | null;
  last_synced_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface KbSyncJob {
  id: string;
  job_type: string;
  provider: string | null;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  initiated_by_user_id: string | null;
  related_entity_type: string | null;
  related_entity_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface KbSyncJobRun {
  id: string;
  sync_job_id: string;
  status: "running" | "success" | "failed";
  request_payload: Record<string, unknown>;
  response_payload: Record<string, unknown>;
  error_message: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
}

export interface KbSavedQuery {
  id: string;
  user_id: string | null;
  workspace_id: string | null;
  name: string;
  query_text: string;
  filters: Record<string, unknown>;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Service layer request/response types
// ---------------------------------------------------------------------------

/** Parameters for ingesting a note */
export interface IngestNoteParams {
  userId?: string;
  workspaceId?: string;
  title?: string;
  body: string;
  noteType?: string;
  sourceType?: string;
  sourceRef?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  createdByAgent?: boolean;
  metadata?: Record<string, unknown>;
  /** If true, also creates a kb_entity_link */
  linkToEntity?: boolean;
}

/** Parameters for ingesting a document */
export interface IngestDocumentParams {
  userId?: string;
  workspaceId?: string;
  title: string;
  documentType?: string;
  mimeType?: string;
  storagePath?: string;
  rawText: string;
  sourceType?: string;
  sourceRef?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
  metadata?: Record<string, unknown>;
  /** If true, generate embeddings for chunks (requires embedding provider) */
  generateEmbeddings?: boolean;
  /** If true, also create entity links */
  linkToEntity?: boolean;
}

/** Parameters for hybrid knowledge search */
export interface SearchKnowledgeParams {
  query: string;
  entityType?: string;
  entityId?: string;
  sourceTypes?: string[];
  dateFrom?: string;
  dateTo?: string;
  userId?: string;
  workspaceId?: string;
  limit?: number;
  offset?: number;
  /** Enable vector similarity search (requires embeddings) */
  semantic?: boolean;
}

/** A single search result from hybrid search */
export interface SearchResult {
  id: string;
  sourceTable: string;
  title: string | null;
  snippet: string;
  entityType: string | null;
  entityId: string | null;
  score: number;
  scoreType: "text" | "vector" | "hybrid";
  createdAt: string;
  metadata: Record<string, unknown>;
}

/** Full entity context assembled for Aurora agent */
export interface EntityContext {
  entity: Record<string, unknown> | null;
  entityType: string;
  entityId: string;
  summaryCards: KbSummaryCard[];
  recentNotes: KbNote[];
  documents: KbDocument[];
  topChunks: Array<Pick<KbDocumentChunk, "id" | "content" | "chunk_index" | "document_id" | "metadata">>;
  recentActions: KbActionLog[];
  externalLinks: KbExternalObjectLink[];
  relatedEntities: KbEntityLink[];
}

/** Agent search context assembled from a query */
export interface AgentSearchContext {
  query: string;
  results: SearchResult[];
  entityContexts: EntityContext[];
  metadata: {
    totalResults: number;
    searchDuration: number;
    searchModes: string[];
  };
}

// ---------------------------------------------------------------------------
// Action dispatcher types
// ---------------------------------------------------------------------------

export interface ActionRequest {
  userId?: string;
  workspaceId?: string;
  actionType: string;
  provider?: string;
  preview?: boolean;
  relatedEntityType?: string;
  relatedEntityId?: string;
  payload: Record<string, unknown>;
}

export interface ActionResult {
  status: "success" | "failed" | "partial" | "preview";
  actionLogId: string;
  summary: string;
  successes?: Array<Record<string, unknown>>;
  failures?: Array<Record<string, unknown>>;
  providerResponse?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Provider adapter interface
// ---------------------------------------------------------------------------

export interface ActionProviderAdapter {
  /** Unique provider name (e.g. 'zapier', 'hubspot') */
  readonly providerName: string;

  /** Validate that the payload is well-formed for this provider */
  validatePayload(actionType: string, payload: Record<string, unknown>): { valid: boolean; errors?: string[] };

  /** Generate a preview of what the action would do, without executing */
  preview(actionType: string, payload: Record<string, unknown>): Promise<ActionResult>;

  /** Execute the action against the external provider */
  execute(actionType: string, payload: Record<string, unknown>): Promise<ActionResult>;
}

// ---------------------------------------------------------------------------
// Embedding provider interface — isolated so provider can be swapped
// ---------------------------------------------------------------------------

export interface EmbeddingProvider {
  /** Generate an embedding vector for the given text */
  embed(text: string): Promise<number[]>;

  /** Generate embeddings for multiple texts (batch) */
  embedBatch(texts: string[]): Promise<number[][]>;

  /** Dimension of the output vectors */
  readonly dimensions: number;
}

// ---------------------------------------------------------------------------
// Feature flag names
// ---------------------------------------------------------------------------
export const FEATURE_FLAGS = {
  ENABLE_AURORA_KB: "ENABLE_AURORA_KB",
  ENABLE_AURORA_ACTIONS: "ENABLE_AURORA_ACTIONS",
} as const;
