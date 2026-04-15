/**
 * supabase/upsert-provenance.ts
 * ==============================
 * Writes to firm_field_sources. One row per (firm_id, field_name, source_name).
 * Uses Supabase upsert with onConflict for idempotency.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProvenanceEntry, Logger } from "../types";

export interface UpsertProvenanceInput {
  firmId: string;
  entries: ProvenanceEntry[];
}

export async function upsertProvenance(
  db: SupabaseClient,
  input: UpsertProvenanceInput,
  opts: { dryRun?: boolean; logger?: Logger } = {},
): Promise<{ written: number }> {
  if (!input.entries.length) return { written: 0 };

  const rows = input.entries.map((e) => ({
    firm_id:           input.firmId,
    field_name:        e.field_name,
    source_name:       e.source_name,
    source_url:        e.source_url ?? null,
    source_record_id:  e.source_record_id ?? null,
    extracted_value_json: { value: e.value },
    confidence_score:  Math.max(0, Math.min(1, e.confidence)),
    extracted_at:      (e.extracted_at ?? new Date()).toISOString(),
    updated_at:        new Date().toISOString(),
  }));

  if (opts.dryRun) {
    opts.logger?.info("upsert.provenance.dry", { firm_id: input.firmId, count: rows.length });
    return { written: rows.length };
  }

  const { error } = await db
    .from("firm_field_sources")
    .upsert(rows, { onConflict: "firm_id,field_name,source_name" });

  if (error) {
    opts.logger?.error("upsert.provenance.failed", { firm_id: input.firmId, err: error.message });
    throw error;
  }

  opts.logger?.debug("upsert.provenance.ok", { firm_id: input.firmId, count: rows.length });
  return { written: rows.length };
}

/**
 * Load all existing provenance for a firm (used by merge layer to decide
 * whether a source's new value should overwrite the current firm_records value).
 */
export async function getProvenanceForFirm(
  db: SupabaseClient,
  firmId: string,
): Promise<ProvenanceEntry[]> {
  const { data, error } = await db
    .from("firm_field_sources")
    .select("field_name, source_name, source_url, source_record_id, extracted_value_json, confidence_score, extracted_at")
    .eq("firm_id", firmId);

  if (error || !data) return [];

  return data.map((r: Record<string, unknown>) => ({
    field_name:  r.field_name as string,
    source_name: r.source_name as ProvenanceEntry["source_name"],
    source_url:  (r.source_url ?? null) as string | null,
    source_record_id: (r.source_record_id ?? null) as string | null,
    value:       (r.extracted_value_json as { value?: unknown })?.value,
    confidence:  r.confidence_score as number,
    extracted_at: r.extracted_at ? new Date(r.extracted_at as string) : undefined,
  }));
}
