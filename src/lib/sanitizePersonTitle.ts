import { safeTrim } from "@/lib/utils";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Meme / kaomoji / box-drawing garbage sometimes lands in `title` from scrapers or bad imports.
 * Must not be shown as a job title — return null so callers can fall back to `role` or other fields.
 */
function isLikelyJunkDisplayTitle(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (!/\p{L}/u.test(t)) return true;
  if (/[⌐■□▪▫◆◇●○◐◑▲▼►◄]/.test(t)) return true;
  if (/\([^)]*[•·‿ಠಥ╯^︵ʖ°][^)]*\)/.test(t)) return true;
  const latin = (t.match(/[A-Za-z]/g) ?? []).length;
  const nonWs = t.replace(/\s/g, "").length;
  const specials = Math.max(0, nonWs - latin);
  if (nonWs > 10 && latin < 4 && specials > nonWs * 0.45) return true;
  return false;
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
  if (isLikelyJunkDisplayTitle(title)) return null;

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
  if (isLikelyJunkDisplayTitle(cleaned)) return null;
  return cleaned;
}

