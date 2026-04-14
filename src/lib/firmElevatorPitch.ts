import { clampElevatorPitch } from "@/lib/clampElevatorPitch";
import { generateElevatorPitch } from "@/lib/generateFallbacks";
export { ELEVATOR_PITCH_MAX_CHARS } from "@/lib/clampElevatorPitch";

/** Inputs needed to resolve the line under the firm name in the investor popover. */
export type FirmElevatorPitchInput = {
  elevator_pitch?: string | null;
  description?: string | null;
  sentiment_detail?: string | null;
  firm_name?: string | null;
  thesis_verticals?: string[] | null;
  stage_focus?: string[] | null;
  preferred_stage?: string | null;
  hq_city?: string | null;
  hq_state?: string | null;
  hq_country?: string | null;
  entity_type?: string | null;
  min_check_size?: number | null;
  max_check_size?: number | null;
};

/**
 * Order: stored `elevator_pitch` → long `description` excerpt → `sentiment_detail` snippet
 * → deterministic pitch from thesis/stage/HQ (no network).
 * (Firm-level Twitter bio / marketing slogan are not on `firm_records` today; those can be folded
 * into `elevator_pitch` when ingested.)
 */
export function resolveElevatorPitchForDisplay(input: FirmElevatorPitchInput): string | null {
  const stored = clampElevatorPitch(input.elevator_pitch);
  if (stored) return stored;

  const desc = clampElevatorPitch(input.description);
  if (desc && desc.length >= 24) return desc;

  const sentiment = clampElevatorPitch(input.sentiment_detail);
  if (sentiment && sentiment.length >= 20) return sentiment;

  return clampElevatorPitch(
    generateElevatorPitch({
      firm_name: input.firm_name,
      description: input.description,
      stage_focus: input.stage_focus ?? [],
      thesis_verticals: input.thesis_verticals ?? [],
      hq_city: input.hq_city,
      hq_state: input.hq_state,
      hq_country: input.hq_country,
      entity_type: input.entity_type,
      min_check_size: input.min_check_size,
      max_check_size: input.max_check_size,
    }),
  );
}
