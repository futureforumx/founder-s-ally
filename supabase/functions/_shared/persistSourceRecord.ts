// =============================================================================
// persistSourceRecord.ts
// =============================================================================
// Writes a raw connector record into `connector_source_records`.
//
// Behaviour:
//   • Upserts on (owner_context_id, provider, external_id) — idempotent.
//   • Returns the full row whether it was inserted or already existed.
//   • Does NOT mark the record as processed — that is the responsibility of
//     the stage* functions after successful parsing.
//
// Table: public.connector_source_records
// =============================================================================

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import type {
  ConnectorSourceRecord,
  PersistSourceRecordParams,
} from "./connector-types.ts";

// ---------------------------------------------------------------------------
// persistSourceRecord
// ---------------------------------------------------------------------------

/**
 * Upserts a raw record from a connector into `connector_source_records`.
 *
 * @param supabase  Service-role or user-scoped Supabase client.
 * @param params    Identity + payload for this record.
 * @returns         The full row and whether it was freshly inserted.
 */
export async function persistSourceRecord(
  supabase: SupabaseClient,
  params: PersistSourceRecordParams,
): Promise<{ record: ConnectorSourceRecord; inserted: boolean }> {
  const row = {
    owner_context_id: params.ownerContextId,
    sync_run_id:      params.syncRunId ?? null,
    provider:         params.provider,
    record_type:      params.recordType,
    external_id:      params.externalId,
    raw_data:         params.rawData,
  };

  // --- attempt insert first (most common path) ---
  const { data: inserted, error: insertError } = await supabase
    .from("connector_source_records")
    .insert(row)
    .select()
    .single();

  // 23505 = unique_violation — record already exists, fall through to fetch
  if (!insertError) {
    return { record: inserted as ConnectorSourceRecord, inserted: true };
  }

  if ((insertError as { code?: string }).code !== "23505") {
    throw new Error(
      `connector_source_records insert failed: ${insertError.message}`,
    );
  }

  // --- already exists: fetch the existing row ---
  const { data: existing, error: fetchError } = await supabase
    .from("connector_source_records")
    .select()
    .eq("owner_context_id", params.ownerContextId)
    .eq("provider", params.provider)
    .eq("external_id", params.externalId)
    .single();

  if (fetchError || !existing) {
    throw new Error(
      `connector_source_records fetch-after-conflict failed: ${fetchError?.message ?? "no row"}`,
    );
  }

  return { record: existing as ConnectorSourceRecord, inserted: false };
}

// ---------------------------------------------------------------------------
// markProcessed
// ---------------------------------------------------------------------------

/**
 * Stamps `processed_at = now()` on a connector_source_records row.
 * Called by stage* functions after they have successfully written their
 * parsed output rows.
 */
export async function markSourceRecordProcessed(
  supabase: SupabaseClient,
  sourceRecordId: string,
): Promise<void> {
  const { error } = await supabase
    .from("connector_source_records")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", sourceRecordId);

  if (error) {
    throw new Error(
      `markSourceRecordProcessed failed for ${sourceRecordId}: ${error.message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// fetchUnprocessedSourceRecords
// ---------------------------------------------------------------------------

/**
 * Returns up to `limit` unprocessed connector_source_records for a given
 * owner context and optional record type filter.
 */
export async function fetchUnprocessedSourceRecords(
  supabase: SupabaseClient,
  ownerContextId: string,
  opts: {
    recordType?: string;
    provider?: string;
    limit?: number;
  } = {},
): Promise<ConnectorSourceRecord[]> {
  let query = supabase
    .from("connector_source_records")
    .select()
    .eq("owner_context_id", ownerContextId)
    .is("processed_at", null)
    .order("staged_at", { ascending: true })
    .limit(opts.limit ?? 100);

  if (opts.recordType) query = query.eq("record_type", opts.recordType);
  if (opts.provider)   query = query.eq("provider", opts.provider);

  const { data, error } = await query;

  if (error) {
    throw new Error(`fetchUnprocessedSourceRecords failed: ${error.message}`);
  }

  return (data ?? []) as ConnectorSourceRecord[];
}
