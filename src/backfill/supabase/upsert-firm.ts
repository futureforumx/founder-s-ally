/**
 * supabase/upsert-firm.ts
 * ========================
 * Idempotent firm_records updates. Never overwrites non-null values with null.
 * Preserves `source_last_verified_at` and sets it on successful writes.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExtractedProfile, Logger } from "../types";

/**
 * Columns we write to firm_records. Kept in one place so we don't accidentally
 * try to persist fields that don't exist on the table.
 */
const WRITABLE_FIRM_COLUMNS = [
  "description",
  "elevator_pitch",
  "website_url",
  "linkedin_url",
  "x_url",
  "crunchbase_url",
  "tracxn_url",
  "cb_insights_url",
  "pitchbook_url",
  "signal_nfx_url",
  "openvc_url",
  "vcsheet_url",
  "startups_gallery_url",
  "angellist_url",
  "wellfound_url",
  "blog_url",
  "medium_url",
  "substack_url",
  "hq_city",
  "hq_state",
  "hq_country",
  "hq_region",
  "founded_year",
  "aum",
  "aum_usd",
  "min_check_size",
  "max_check_size",
  "email",
  "phone",
  "logo_url",
  "stage_classification",
  "structure_classification",
  "theme_classification",
  "sector_classification",
  "impact_orientation",
  "stage_focus",
  "stage_min",
  "stage_max",
  "lead_or_follow",
  "is_actively_deploying",
  "geo_focus",
] as const;

type WritableColumn = (typeof WRITABLE_FIRM_COLUMNS)[number];

export interface UpsertFirmInput {
  firmId: string;
  patch: Partial<Record<WritableColumn, unknown>>;
  /** Existing row — used to decide which fields to leave alone. */
  existing: Record<string, unknown> | null;
  /** If true, write even when existing value is non-null (used for derived fields). */
  forceOverwriteKeys?: WritableColumn[];
}

/**
 * Build the actual UPDATE payload by filtering out:
 *   - columns not in WRITABLE_FIRM_COLUMNS
 *   - null/undefined values
 *   - columns where existing value is non-null & not in forceOverwriteKeys
 */
export function buildFirmPatch(input: UpsertFirmInput): Partial<Record<WritableColumn, unknown>> {
  const out: Partial<Record<WritableColumn, unknown>> = {};
  const existing = input.existing ?? {};
  const forceKeys = new Set(input.forceOverwriteKeys ?? []);

  for (const [key, val] of Object.entries(input.patch)) {
    if (!WRITABLE_FIRM_COLUMNS.includes(key as WritableColumn)) continue;
    if (val == null) continue;
    if (Array.isArray(val) && val.length === 0) continue;
    if (typeof val === "string" && !val.trim()) continue;

    const currentVal = existing[key];
    const currentEmpty =
      currentVal == null ||
      (Array.isArray(currentVal) && currentVal.length === 0) ||
      (typeof currentVal === "string" && !String(currentVal).trim());

    if (currentEmpty || forceKeys.has(key as WritableColumn)) {
      out[key as WritableColumn] = val;
    }
  }

  return out;
}

/** Build a human-readable diff showing {field: {before, after}} for each
 *  field being changed. Used by dry-run to make the impact of a commit
 *  visible at a glance. */
export function buildFirmDiff(input: UpsertFirmInput): Record<string, { before: unknown; after: unknown }> {
  const payload = buildFirmPatch(input);
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  const existing = input.existing ?? {};
  for (const [k, v] of Object.entries(payload)) {
    diff[k] = { before: existing[k] ?? null, after: v };
  }
  return diff;
}

export async function upsertFirm(
  db: SupabaseClient,
  input: UpsertFirmInput,
  opts: { dryRun?: boolean; logger?: Logger } = {},
): Promise<{ updated: string[]; skipped: number; diff: Record<string, { before: unknown; after: unknown }> }> {
  const payload = buildFirmPatch(input);
  const diff = buildFirmDiff(input);
  const keys = Object.keys(payload);
  if (keys.length === 0) return { updated: [], skipped: 0, diff: {} };

  // Use canonical last_verified_at (existing firm_records column, not the
  // duplicate source_last_verified_at that the initial migration added)
  const finalPayload: Record<string, unknown> = { ...payload, last_verified_at: new Date().toISOString() };

  if (opts.dryRun) {
    opts.logger?.info("upsert.firm.dry", { firm_id: input.firmId, keys, diff });
    return { updated: keys, skipped: 0, diff };
  }

  const { error } = await db.from("firm_records").update(finalPayload).eq("id", input.firmId);
  if (error) {
    opts.logger?.error("upsert.firm.failed", { firm_id: input.firmId, err: error.message, keys });
    throw error;
  }

  opts.logger?.info("upsert.firm.ok", { firm_id: input.firmId, keys });
  return { updated: keys, skipped: 0, diff };
}

/** Fields that represent *derived* classifications. These are allowed to
 *  update even when an existing non-null value is present, because a newer
 *  classification run should supersede the previous one. */
export const DERIVED_CLASSIFICATION_KEYS: readonly WritableColumn[] = [
  "stage_classification",
  "structure_classification",
  "theme_classification",
  "sector_classification",
  "impact_orientation",
] as const;

/**
 * Flatten an ExtractedProfile into the writable-column shape.
 * Used by the merge layer before calling upsertFirm.
 */
export function profileToFirmPatch(p: ExtractedProfile): Partial<Record<WritableColumn, unknown>> {
  const patch: Partial<Record<WritableColumn, unknown>> = {};
  const profile = p as unknown as Record<string, unknown>;
  for (const col of WRITABLE_FIRM_COLUMNS) {
    const val = profile[col];
    if (val !== undefined && val !== null) {
      patch[col] = val;
    }
  }
  return patch;
}

export { WRITABLE_FIRM_COLUMNS };
export type { WritableColumn };
