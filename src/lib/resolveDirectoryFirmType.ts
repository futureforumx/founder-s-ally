import { safeTrim } from "@/lib/utils";

/** Collapse whitespace; keep punctuation so exact maps stay stable. */
function normalizeDirectoryFirmNameKey(name: string): string {
  return safeTrim(name)
    .toLowerCase()
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ");
}

/** 7-Eleven’s venture arm — often stored as generic institutional in imports. */
function is711VenturesCvc(normalizedName: string): boolean {
  const n = normalizedName.replace(/\s+/g, " ");
  const brand =
    n.includes("7-11") ||
    n.includes("7-eleven") ||
    /\b711\b/.test(n) ||
    n.includes("seven-eleven") ||
    n.includes("seven eleven");
  return brand && /\bventur/i.test(n);
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
  "711 ventures": "CVC",
  "3m": "CVC",
  "3m ventures": "CVC",
  "3m new ventures": "CVC",
  "3m company ventures": "CVC",
  "mucker capital": "INSTITUTIONAL",
  "muckerlab": "ACCELERATOR",
  "mucker lab": "ACCELERATOR",
};

/**
 * Canonical `firm_type` / Prisma-style enum string for directory + cards.
 * Applies small curated overrides when the stored row is wrong or missing.
 */
export function resolveDirectoryFirmTypeKey(
  firmName: string | null | undefined,
  storedType: string | null | undefined,
): string {
  const nk = normalizeDirectoryFirmNameKey(firmName ?? "");
  if (is711VenturesCvc(nk)) return "CVC";
  if (is3MCorporateVentureCvc(nk)) return "CVC";
  const exact = nk ? EXACT_FIRM_TYPE_OVERRIDES[nk] : undefined;
  if (exact) return exact;
  const t = safeTrim(storedType);
  if (t) return t;
  return "INSTITUTIONAL";
}
