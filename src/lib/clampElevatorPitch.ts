export const ELEVATOR_PITCH_MAX_CHARS = 200;

/** Single-line friendly clamp for firm popover / DB `elevator_pitch`. */
export function clampElevatorPitch(text: string | null | undefined): string | null {
  const raw = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
  if (!raw) return null;
  if (raw.length <= ELEVATOR_PITCH_MAX_CHARS) return raw;
  const cut = raw.slice(0, ELEVATOR_PITCH_MAX_CHARS);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > ELEVATOR_PITCH_MAX_CHARS * 0.55 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}
