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
