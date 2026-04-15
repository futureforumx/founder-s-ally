import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "../types";

export interface SupportUrlCandidateRow {
  candidate_key: string;
  firm_id: string;
  source_name: string;
  candidate_url: string;
  confidence_score: number;
  discovery_method: string;
  discovered_at: string;
}

export interface SupportQaFlagRow {
  flag_key: string;
  firm_id: string;
  flag_type: string;
  field_name?: string | null;
  current_value?: string | null;
  suggested_value?: string | null;
  confidence_score: number;
  created_at: string;
}

interface WriteOpts {
  dryRun: boolean;
  logger: Logger;
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0.5;
  return Math.max(0, Math.min(0.999, Math.round(score * 1000) / 1000));
}

function chunk<T>(items: T[], size = 250): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function upsertSupportUrlCandidates(
  db: SupabaseClient,
  rows: SupportUrlCandidateRow[],
  opts: WriteOpts,
): Promise<void> {
  if (!rows.length) return;
  if (opts.dryRun) {
    opts.logger.info("support.candidates.dry_run", { rows: rows.length });
    return;
  }

  const payload = rows.map((row) => ({
    ...row,
    confidence_score: clampScore(row.confidence_score),
  }));

  for (const batch of chunk(payload)) {
    const { error } = await db
      .from("firm_source_url_candidates")
      .upsert(batch, { onConflict: "candidate_key", ignoreDuplicates: false });
    if (error) throw new Error(`firm_source_url_candidates upsert failed: ${error.message}`);
  }
}

export async function upsertSupportQaFlags(
  db: SupabaseClient,
  rows: SupportQaFlagRow[],
  opts: WriteOpts,
): Promise<void> {
  if (!rows.length) return;
  if (opts.dryRun) {
    opts.logger.info("support.qa_flags.dry_run", { rows: rows.length });
    return;
  }

  const payload = rows.map((row) => ({
    ...row,
    confidence_score: clampScore(row.confidence_score),
  }));

  for (const batch of chunk(payload)) {
    const { error } = await db
      .from("firm_data_qa_flags")
      .upsert(batch, { onConflict: "flag_key", ignoreDuplicates: false });
    if (error) throw new Error(`firm_data_qa_flags upsert failed: ${error.message}`);
  }
}
