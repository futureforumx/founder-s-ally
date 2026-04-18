import type { CanonicalFundDraft, FirmCapitalDerivations } from "./types";

function addMonths(isoDate: string, months: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

export function deriveCapitalWindow(fund: Pick<CanonicalFundDraft, "announcedDate" | "closeDate" | "status" | "fundType">): {
  start: string | null;
  end: string | null;
} {
  const base = fund.closeDate || fund.announcedDate;
  if (!base) return { start: null, end: null };
  const months =
    fund.fundType === "opportunity" || fund.fundType === "growth" ? 30 :
    fund.fundType === "scout" ? 18 :
    24;
  return { start: base, end: addMonths(base, months) };
}

export function deriveEstimatedCheckRange(
  fund: Pick<CanonicalFundDraft, "finalSizeUsd" | "targetSizeUsd" | "fundType">,
  firmHistory: { checkSizeMin?: number | null; checkSizeMax?: number | null } = {},
): { minUsd: number | null; maxUsd: number | null } {
  if (firmHistory.checkSizeMin || firmHistory.checkSizeMax) {
    return {
      minUsd: firmHistory.checkSizeMin ?? null,
      maxUsd: firmHistory.checkSizeMax ?? null,
    };
  }

  const representative = fund.finalSizeUsd ?? fund.targetSizeUsd ?? null;
  if (!representative) return { minUsd: null, maxUsd: null };

  const basePct =
    fund.fundType === "seed" ? [0.0025, 0.01] :
    fund.fundType === "growth" ? [0.005, 0.03] :
    fund.fundType === "opportunity" ? [0.003, 0.02] :
    [0.002, 0.008];

  return {
    minUsd: Math.round(representative * basePct[0]),
    maxUsd: Math.round(representative * basePct[1]),
  };
}

export function deriveFirmCapitalState(
  fund: CanonicalFundDraft,
  options: {
    freshCapitalWindowDays?: number;
    sectorFitScore?: number;
    stageFitScore?: number;
    geographyFitScore?: number;
  } = {},
): FirmCapitalDerivations {
  const window = deriveCapitalWindow(fund);
  const today = new Date().toISOString().slice(0, 10);
  const representativeDate = fund.closeDate || fund.announcedDate;
  const ageDays = representativeDate
    ? Math.max(0, Math.floor((Date.now() - new Date(`${representativeDate}T00:00:00Z`).getTime()) / 86400000))
    : 9999;
  const freshWindow = options.freshCapitalWindowDays ?? 365;
  const hasFreshCapital = ageDays <= freshWindow;
  const likelyActivelyDeploying =
    Boolean(window.start && window.end && today >= window.start && today <= window.end) ||
    fund.status === "inferred_active";

  const fitBoost =
    (options.sectorFitScore ?? 0.5) * 0.25 +
    (options.stageFitScore ?? 0.5) * 0.20 +
    (options.geographyFitScore ?? 0.5) * 0.10;
  const recencyBoost = Math.max(0, (freshWindow - ageDays) / freshWindow) * 0.30;
  const sizeBoost = Math.min((fund.finalSizeUsd ?? fund.targetSizeUsd ?? 0) / 500000000, 1) * 0.15;

  return {
    hasFreshCapital,
    likelyActivelyDeploying,
    activeDeploymentWindowStart: window.start,
    activeDeploymentWindowEnd: window.end,
    estimatedCheckMinUsd: fund.estimatedCheckMinUsd,
    estimatedCheckMaxUsd: fund.estimatedCheckMaxUsd,
    priorityScoreForFounders: Number((fitBoost + recencyBoost + sizeBoost).toFixed(4)),
  };
}
