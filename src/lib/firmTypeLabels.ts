import type { FirmType } from "@prisma/client";

/** Human-readable labels for `vc_firms.firm_type` (Prisma `FirmType`). */
export const FIRM_TYPE_LABELS: Record<FirmType, string> = {
  ACCELERATOR: "Accelerator",
  ANGEL_NETWORK: "Angel network",
  CVC: "Corporate (CVC)",
  FAMILY_OFFICE: "Family office",
  INSTITUTIONAL: "Institutional",
  MICRO_FUND: "Micro fund",
  MICRO_VC: "Micro VC",
  OTHER: "Other",
  PE: "Private equity",
  PUBLIC: "Public",
  SOLO_GP: "Solo GP",
  VC: "VC",
  VENTURE_STUDIO: "Venture studio",
};

export function formatFirmTypeLabel(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const key = raw.trim() as FirmType;
  if (Object.prototype.hasOwnProperty.call(FIRM_TYPE_LABELS, key)) {
    return FIRM_TYPE_LABELS[key];
  }
  return raw.replace(/_/g, " ");
}
