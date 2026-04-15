import type { FundingIngestSourceKey } from "@prisma/client";

export type { FundingIngestSourceKey };

export type ListingItem = {
  sourceKey: FundingIngestSourceKey;
  /** News listing / category / RSS hub URL (stored as `source_articles.listing_url`). */
  listingPageUrl?: string | null;
  articleUrl: string;
  title: string;
  publishedAt: Date | null;
  summary?: string | null;
};

export type ExtractedDeal = {
  company_name: string | null;
  company_website: string | null;
  company_hq: string | null;
  round_type_raw: string | null;
  round_type_normalized: string | null;
  amount_raw: string | null;
  amount_minor_units: bigint | null;
  currency: string;
  announced_date: Date | null;
  sector_raw: string | null;
  sector_normalized: string | null;
  founders_mentioned: string[];
  existing_investors_mentioned: string[];
  deal_summary: string | null;
  lead_investors: string[];
  participating_investors: string[];
  extraction_confidence: number;
  extraction_method: "regex" | "openai" | "hybrid";
};

export type RunSummary = {
  articlesFetched: number;
  articlesNew: number;
  articlesUpdated: number;
  dealsInserted: number;
  dealsUpserted: number;
  duplicatesSkipped: number;
  lowConfidenceDeals: number;
  failuresBySource: Partial<Record<FundingIngestSourceKey, number>>;
  reviewDealIds: string[];
  errors: string[];
};
