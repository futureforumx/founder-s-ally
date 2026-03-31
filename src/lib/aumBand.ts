import type { AumBand } from "@prisma/client";

/** USD thresholds (lower bound inclusive for Micro+ via chained &lt; checks). */
export const AUM_BAND_USD = {
  /** &lt; NANO_MAX */
  NANO_MAX: 25_000_000,
  MICRO_MAX: 75_000_000,
  SMALL_MAX: 250_000_000,
  MID_MAX: 750_000_000,
  LARGE_MAX: 1_000_000_000,
} as const;

export const AUM_BAND_LABELS: Record<AumBand, string> = {
  NANO: "Nano",
  MICRO: "Micro",
  SMALL: "Small",
  MID_SIZE: "Mid-size",
  LARGE: "Large",
  MEGA_FUND: "Mega fund",
};

/** Short copy aligned with product definitions. */
export const AUM_BAND_RANGES: Record<AumBand, string> = {
  NANO: "< $25M",
  MICRO: "$25M – $75M",
  SMALL: "$75M – $250M",
  MID_SIZE: "$250M – $750M",
  LARGE: "$750M – $1B",
  MEGA_FUND: "≥ $1B (flagship or firm-wide VC AUM)",
};

/**
 * Maps a single AUM/size figure (USD) to a band. Use the larger of fund `aum_usd` vs `size_usd`
 * when both exist, or pass one representative figure for a firm.
 */
export function resolveAumBandFromUsd(usd: number | null | undefined): AumBand | null {
  if (usd == null || !Number.isFinite(usd) || usd < 0) return null;
  if (usd < AUM_BAND_USD.NANO_MAX) return "NANO";
  if (usd < AUM_BAND_USD.MICRO_MAX) return "MICRO";
  if (usd < AUM_BAND_USD.SMALL_MAX) return "SMALL";
  if (usd < AUM_BAND_USD.MID_MAX) return "MID_SIZE";
  if (usd < AUM_BAND_USD.LARGE_MAX) return "LARGE";
  return "MEGA_FUND";
}

/** Representative USD for a fund row: max of AUM and size when either is set; otherwise null. */
export function representativeFundUsd(
  aumUsd: number | null | undefined,
  sizeUsd: number | null | undefined,
): number | null {
  if (aumUsd == null && sizeUsd == null) return null;
  const a = aumUsd != null && Number.isFinite(aumUsd) ? aumUsd : 0;
  const b = sizeUsd != null && Number.isFinite(sizeUsd) ? sizeUsd : 0;
  const m = Math.max(a, b);
  return m > 0 ? m : null;
}

export function formatAumBandLabel(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const k = raw.trim() as AumBand;
  if (Object.prototype.hasOwnProperty.call(AUM_BAND_LABELS, k)) {
    return AUM_BAND_LABELS[k];
  }
  return raw.replace(/_/g, " ");
}

export function formatAumBandWithRange(raw: string | null | undefined): string {
  const label = formatAumBandLabel(raw);
  if (!label || !raw?.trim()) return label;
  const k = raw.trim() as AumBand;
  if (Object.prototype.hasOwnProperty.call(AUM_BAND_RANGES, k)) {
    return `${label}: ${AUM_BAND_RANGES[k]}`;
  }
  return label;
}
