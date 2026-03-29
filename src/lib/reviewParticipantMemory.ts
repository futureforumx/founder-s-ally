/**
 * “Remember who?” — names + optional role fallback for unlinked investor reviews.
 * Stored under `star_ratings.answers` on `vc_ratings` (JSONB); no separate table.
 */

export const PARTICIPANT_ROLE_OPTIONS = [
  { value: "partner", label: "Partner" },
  { value: "principal_vp", label: "Principal / VP" },
  { value: "associate", label: "Associate" },
  { value: "platform_ops", label: "Platform / Ops" },
  { value: "mixed_team", label: "Mixed team" },
  { value: "not_sure", label: "Not sure" },
] as const;

export type ParticipantRoleKey = (typeof PARTICIPANT_ROLE_OPTIONS)[number]["value"];

export const PARTICIPANT_ROLE_LABEL_BY_VALUE: Record<ParticipantRoleKey, string> =
  Object.fromEntries(PARTICIPANT_ROLE_OPTIONS.map((o) => [o.value, o.label])) as Record<
    ParticipantRoleKey,
    string
  >;

/** Stable answer keys in `star_ratings.answers` */
export const PARTICIPANT_MEMORY_ANSWER_KEYS = {
  names: "interaction_remembered_who_names",
  personIds: "interaction_remembered_who_vc_person_ids",
  roles: "interaction_remembered_who_roles",
  includedUnknownOthers: "interaction_remembered_who_included_unknown_others",
  memoryMode: "interaction_participant_memory_mode",
} as const;

export type ParticipantMemoryMode = "names_only" | "roles_only" | "names_and_roles" | "unknown";

/** Minimum trimmed length for a free-typed name committed with Enter. */
export const REMEMBER_WHO_FREE_NAME_MIN_LEN = 2;

/**
 * Validates names typed manually (not directory picks). Blocks keyboard mash, digits,
 * and Latin strings with no vowels when longer than a few letters.
 */
export function isPlausibleFreeTextParticipantName(raw: string): boolean {
  const t = raw.normalize("NFKC").trim();
  if (t.length < REMEMBER_WHO_FREE_NAME_MIN_LEN || t.length > 120) return false;

  if (/\d/.test(t)) return false;

  // Letters (any script), spaces, hyphen, apostrophe, period, comma, middle dot (e.g. Catalan)
  if (!/^[\p{L}\s'.,\u00B7-]+$/u.test(t)) return false;

  if (!/\p{L}/u.test(t)) return false;

  const noSpaces = t.replace(/\s/g, "");
  if (noSpaces.length > 0 && /(.)\1{4,}/u.test(noSpaces)) return false;

  const latinLettersOnly = t.replace(/[^a-zA-Z]/g, "");
  const looksLatinOnly = /^[a-zA-Z\s'.,\u00B7-]+$/u.test(t);
  if (looksLatinOnly && latinLettersOnly.length > 3 && !/[aeiouyAEIOUY]/.test(latinLettersOnly)) {
    return false;
  }

  return true;
}

export const REMEMBER_WHO_NAME_REJECT_TOAST =
  "That doesn’t look like a person’s name. Use real names, initials + last name, or pick someone from the list.";

export function getRememberedRoleKeysFromAnswers(
  answers: Record<string, string | string[]>,
): ParticipantRoleKey[] {
  const raw = answers[PARTICIPANT_MEMORY_ANSWER_KEYS.roles];
  if (!Array.isArray(raw)) return [];
  const allowed = new Set(PARTICIPANT_ROLE_OPTIONS.map((o) => o.value));
  return raw
    .map((r) => String(r).trim())
    .filter((r): r is ParticipantRoleKey => allowed.has(r as ParticipantRoleKey));
}

export function countRememberedNames(answers: Record<string, string | string[]>): number {
  const names = answers[PARTICIPANT_MEMORY_ANSWER_KEYS.names];
  if (!Array.isArray(names)) return 0;
  return names.filter((n) => String(n).trim().length > 0).length;
}

/** True when the user has satisfied “who was involved” (names, concrete roles, or not sure). */
export function rememberWhoSubsectionSatisfied(answers: Record<string, string | string[]>): boolean {
  if (countRememberedNames(answers) > 0) return true;
  const roles = getRememberedRoleKeysFromAnswers(answers);
  return roles.length > 0;
}

export function getIncludedUnknownOthers(answers: Record<string, string | string[]>): boolean {
  return answers[PARTICIPANT_MEMORY_ANSWER_KEYS.includedUnknownOthers] === "true";
}

export function computeParticipantMemoryMode(
  answers: Record<string, string | string[]>,
): ParticipantMemoryMode {
  const hasNames = countRememberedNames(answers) > 0;
  const roles = getRememberedRoleKeysFromAnswers(answers);
  const hasNotSure = roles.includes("not_sure");
  const hasConcreteRoles = roles.some((r) => r !== "not_sure");

  if (hasNames && hasConcreteRoles) return "names_and_roles";
  if (hasNames && !hasConcreteRoles) return "names_only";
  if (!hasNames && hasConcreteRoles) return "roles_only";
  if (!hasNames && hasNotSure && !hasConcreteRoles) return "unknown";
  return "unknown";
}

/** Merge computed mode into answers right before persisting `star_ratings`. */
export function withParticipantMemoryMode(
  answers: Record<string, string | string[]>,
): Record<string, string | string[]> {
  return {
    ...answers,
    [PARTICIPANT_MEMORY_ANSWER_KEYS.memoryMode]: computeParticipantMemoryMode(answers),
  };
}

/** Toggle one role chip; `not_sure` is mutually exclusive with other roles. */
export function toggleParticipantRole(
  current: ParticipantRoleKey[],
  role: ParticipantRoleKey,
): ParticipantRoleKey[] {
  if (role === "not_sure") {
    if (current.includes("not_sure")) return current.filter((r) => r !== "not_sure");
    return ["not_sure"];
  }
  const withoutNotSure = current.filter((r) => r !== "not_sure");
  if (withoutNotSure.includes(role)) return withoutNotSure.filter((r) => r !== role);
  return [...withoutNotSure, role];
}

export function formatRememberWhoForInteractionDetail(
  answers: Record<string, string | string[]>,
): string {
  const names = answers[PARTICIPANT_MEMORY_ANSWER_KEYS.names];
  const nameList = Array.isArray(names)
    ? names.map((n) => String(n).trim()).filter(Boolean)
    : [];
  const roles = getRememberedRoleKeysFromAnswers(answers);
  const concreteRoles = roles.filter((r) => r !== "not_sure");
  const parts: string[] = [];
  if (nameList.length) parts.push(nameList.join(", "));
  if (concreteRoles.length) {
    parts.push(
      `roles: ${concreteRoles.map((r) => PARTICIPANT_ROLE_LABEL_BY_VALUE[r]).join(", ")}`,
    );
  }
  if (roles.includes("not_sure")) parts.push("not sure who");
  if (getIncludedUnknownOthers(answers)) parts.push("included others not named");
  if (parts.length === 0) return "";
  return ` · contact: ${parts.join(" · ")}`;
}
