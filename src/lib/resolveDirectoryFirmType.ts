import { safeTrim } from "@/lib/utils";

/** Collapse whitespace; keep punctuation so exact maps stay stable. */
function normalizeDirectoryFirmNameKey(name: string): string {
  return safeTrim(name)
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ");
}

/** 7-Eleven’s venture / strategic arm — often stored as generic institutional in imports. */
function is711VenturesCvc(normalizedName: string): boolean {
  const n = normalizedName.replace(/\s+/g, " ").trim();
  if (!n) return false;
  const compact = n.replace(/\s+/g, "");
  const brand =
    n.includes("7-11") ||
    n.includes("7-eleven") ||
    n.includes("7 eleven") ||
    n.includes("seven eleven") ||
    n.includes("seven-eleven") ||
    /\b711\b/.test(n) ||
    /\b7\s*11\b/.test(n) ||
    compact.includes("7eleven") ||
    compact.includes("seveneleven");
  if (!brand) return false;
  // Do not use a bare "ventur" substring — it matches inside "partners".
  return (
    /\bventures?\b/i.test(n) ||
    /\bcvc\b/i.test(n) ||
    /\b(capital|partners?)\b/i.test(n)
  );
}

/** 3M’s corporate venture / strategic investing — not an independent LP fund. */
function is3MCorporateVentureCvc(normalizedName: string): boolean {
  const n = normalizedName.replace(/\s+/g, " ").trim();
  if (!/\b3m\b/.test(n)) return false;
  if (n === "3m") return true;
  return /\bventur|\bcapital|\bcvc|new\s+venture|strategic|investment|partner\b/i.test(n);
}

const EXACT_FIRM_TYPE_OVERRIDES: Record<string, string> = {
  "7-11 ventures": "CVC",
  "7-eleven ventures": "CVC",
  "7 eleven ventures": "CVC",
  "seven eleven ventures": "CVC",
  "seven eleven partners": "CVC",
  "711 ventures": "CVC",
  "3m": "CVC",
  "3m ventures": "CVC",
  "3m new ventures": "CVC",
  "3m company ventures": "CVC",
  "mucker capital": "INSTITUTIONAL",
  "muckerlab": "ACCELERATOR",
  "mucker lab": "ACCELERATOR",
};

/** Map `firm_records.entity_type` (Postgres enum labels) → Prisma-style `FirmType` keys. */
function mapEntityTypeToDirectoryFirmTypeKey(entityType: string | null | undefined): string | null {
  const e = safeTrim(entityType);
  if (!e) return null;
  switch (e) {
    case "Corporate (CVC)":
      return "CVC";
    case "Family Office":
      return "FAMILY_OFFICE";
    case "Angel":
      return "ANGEL_NETWORK";
    case "Solo GP":
      return "SOLO_GP";
    case "Micro":
      return "MICRO_VC";
    case "Accelerator / Studio":
      return "ACCELERATOR";
    case "Syndicate":
      return "OTHER";
    case "Fund of Funds":
      return "INSTITUTIONAL";
    case "Institutional":
      return "INSTITUTIONAL";
    default:
      return null;
  }
}

/**
 * Canonical `firm_type` / Prisma-style enum string for directory + cards.
 * Applies small curated overrides when the stored row is wrong or missing.
 */
export function resolveDirectoryFirmTypeKey(
  firmName: string | null | undefined,
  storedType: string | null | undefined,
  entityType?: string | null,
): string {
  const nk = normalizeDirectoryFirmNameKey(firmName ?? "");
  if (is711VenturesCvc(nk)) return "CVC";
  if (is3MCorporateVentureCvc(nk)) return "CVC";
  const exact = nk ? EXACT_FIRM_TYPE_OVERRIDES[nk] : undefined;
  if (exact) return exact;

  const fromEntity = mapEntityTypeToDirectoryFirmTypeKey(entityType);
  const stored = safeTrim(storedType);

  // Prefer Postgres `entity_type` when `firm_type` is missing or still the generic default.
  if (fromEntity && (!stored || /^institutional$/i.test(stored))) {
    return fromEntity;
  }

  if (stored) return stored;
  if (fromEntity) return fromEntity;
  return "INSTITUTIONAL";
}
