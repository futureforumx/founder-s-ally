import type { VcFundSourceType } from "./types";

const DEFAULT_PRIORITIES: Record<VcFundSourceType, number> = {
  official_website: 100,
  sec_filing: 95,
  adv_filing: 94,
  press_release: 88,
  structured_provider: 82,
  news_article: 72,
  rss: 68,
  manual: 90,
  inferred: 40,
  other: 20,
};

const FIELD_OVERRIDES: Record<string, Partial<Record<VcFundSourceType, number>>> = {
  fundName: { official_website: 100, sec_filing: 95, adv_filing: 94, press_release: 90 },
  vintageYear: { sec_filing: 96, adv_filing: 96, official_website: 92, press_release: 82 },
  targetSizeUsd: { official_website: 98, sec_filing: 94, adv_filing: 94, press_release: 90 },
  finalSizeUsd: { official_website: 99, sec_filing: 96, adv_filing: 96, press_release: 88 },
  announcedDate: { official_website: 95, press_release: 94, news_article: 80, rss: 75 },
  closeDate: { official_website: 97, sec_filing: 95, adv_filing: 95, press_release: 90 },
  partners: { official_website: 97, press_release: 85, news_article: 78, inferred: 30 },
};

export function getSourcePriority(sourceType: VcFundSourceType, fieldName?: string): number {
  if (fieldName) {
    const override = FIELD_OVERRIDES[fieldName]?.[sourceType];
    if (override != null) return override;
  }
  return DEFAULT_PRIORITIES[sourceType] ?? 0;
}
