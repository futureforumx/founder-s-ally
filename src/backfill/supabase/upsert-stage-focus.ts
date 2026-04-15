/**
 * supabase/upsert-stage-focus.ts — Persist canonical stage_focus + stage_min/max.
 * firm_records already has stage_focus (TEXT[]) + stage_min/max columns.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger } from "../types";
import { canonicalizeStages, STAGE_DISPLAY, type CanonicalStage } from "../parsers/stage-parser";

export interface StageFocusInput {
  firmId: string;
  stages: string[];
  /** When true, overwrite even if existing value is non-null. */
  forceOverwrite?: boolean;
}

export async function upsertStageFocus(
  db: SupabaseClient,
  input: StageFocusInput,
  opts: { dryRun?: boolean; logger?: Logger } = {},
): Promise<{ written: boolean; stages: CanonicalStage[] }> {
  const canon = canonicalizeStages(input.stages);
  if (!canon.length) return { written: false, stages: [] };

  // Dedupe after collapsing fine-grained stages into enum values
  // (e.g. series_b + series_c both → "Series B+")
  const stageDisplay = [...new Set(canon.map((c) => STAGE_DISPLAY[c]))];

  const patch: Record<string, unknown> = {
    stage_focus: stageDisplay,
    stage_min: STAGE_DISPLAY[canon[0]],
    stage_max: STAGE_DISPLAY[canon[canon.length - 1]],
  };

  if (opts.dryRun) {
    opts.logger?.info("upsert.stage_focus.dry", { firm_id: input.firmId, stages: stageDisplay });
    return { written: false, stages: canon };
  }

  // Fetch existing to respect no-overwrite unless forced
  const { data: existing } = await db
    .from("firm_records")
    .select("stage_focus, stage_min, stage_max")
    .eq("id", input.firmId)
    .maybeSingle();

  const finalPatch: Record<string, unknown> = {};
  if (input.forceOverwrite || !(existing?.stage_focus?.length)) finalPatch.stage_focus = patch.stage_focus;
  if (input.forceOverwrite || !existing?.stage_min)             finalPatch.stage_min   = patch.stage_min;
  if (input.forceOverwrite || !existing?.stage_max)             finalPatch.stage_max   = patch.stage_max;

  if (!Object.keys(finalPatch).length) return { written: false, stages: canon };

  const { error } = await db.from("firm_records").update(finalPatch).eq("id", input.firmId);
  if (error) { opts.logger?.error("upsert.stage_focus.failed", { err: error.message }); throw error; }

  return { written: true, stages: canon };
}
