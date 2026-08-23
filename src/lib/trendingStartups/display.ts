/** 20-point heat bands used by intel heatmaps (`heat-0` … `heat-4`). */
export function compositeScoreTextClass(score: number): string {
  if (score >= 80) return "text-heat-4";
  if (score >= 60) return "text-heat-3";
  if (score >= 40) return "text-heat-2";
  // heat-0 / heat-1 are fill tokens and fail as text on both themes
  if (score >= 20) return "text-muted-foreground";
  return "text-muted-foreground/70";
}

export function formatStartupStageHq(row: { fundingStage?: string | null; hqLocation?: string | null }): string {
  return [row.fundingStage?.trim(), row.hqLocation?.trim()].filter(Boolean).join(" · ");
}

export function formatStartupCategoryStageHq(row: {
  microCategory?: string | null;
  fundingStage?: string | null;
  hqLocation?: string | null;
}): string {
  return [row.microCategory?.trim(), row.fundingStage?.trim(), row.hqLocation?.trim()].filter(Boolean).join(" · ");
}
