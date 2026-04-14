import { safeTrim } from "@/lib/utils";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Normalizes noisy person titles coming from mixed sources.
 * Example: "Rebecca Redfield Senior Associate" -> "Senior Associate"
 */
export function sanitizePersonTitle(
  rawTitle: string | null | undefined,
  fullName?: string | null,
): string | null {
  const title = safeTrim(rawTitle).replace(/\s+/g, " ");
  if (!title) return null;

  const name = safeTrim(fullName).replace(/\s+/g, " ");
  if (!name) return title;

  const escapedName = escapeRegExp(name);
  let cleaned = title;

  // Common case: "<Full Name> <Title>" or "<Full Name> - <Title>"
  cleaned = cleaned.replace(
    new RegExp(`^${escapedName}[\\s,:|\\-–—]*`, "i"),
    "",
  );
  // Less common: "<Title> <Full Name>"
  cleaned = cleaned.replace(
    new RegExp(`[\\s,:|\\-–—]*${escapedName}$`, "i"),
    "",
  );

  cleaned = cleaned.trim().replace(/\s+/g, " ");
  if (!cleaned) return null;
  if (cleaned.toLowerCase() === name.toLowerCase()) return null;
  return cleaned;
}

