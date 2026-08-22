import type { FundingIngestSourceKey, Prisma, PrismaClient } from "@prisma/client";
import { subDays } from "date-fns";
import {
  DEAL_MATCH_WINDOW_DAYS,
  fundingSourceQualityTier,
  incomingOutranksExisting,
  mergeSupplementaryUrls,
  pickPreferredField,
  scoreDealIdentityMatch,
  type IngestQualityTier,
} from "../../src/lib/ingestEntityMatch";
import { normalizeCompanyName } from "./normalize.js";
import type { ExtractedDeal } from "./types.js";

export type CrossArticleDealMatch = {
  id: string;
  source_article_id: string;
  sourceKey: FundingIngestSourceKey;
  articleUrl: string;
  qualityTier: IngestQualityTier;
  company_name: string;
  company_name_normalized: string;
  company_website: string | null;
  round_type_raw: string | null;
  round_type_normalized: string | null;
  amount_raw: string | null;
  amount_minor_units: bigint | null;
  announced_date: Date | null;
  deal_summary: string | null;
  extraction_confidence: number;
  extraction_method: string;
  raw_extraction_json: Prisma.JsonValue | null;
};

export function scoreIncomingAgainstDeal(
  existing: {
    company_name: string;
    round_type_normalized: string | null;
    amount_minor_units: bigint | number | null;
    announced_date: Date | string | null;
  },
  incoming: {
    company_name: string;
    round_type_normalized: string | null;
    amount_minor_units: bigint | number | null;
    announced_date: Date | string | null;
  },
) {
  return scoreDealIdentityMatch(
    {
      companyName: existing.company_name,
      roundTypeNormalized: existing.round_type_normalized,
      amountMinorUnits: existing.amount_minor_units,
      announcedDate: existing.announced_date,
    },
    {
      companyName: incoming.company_name,
      roundTypeNormalized: incoming.round_type_normalized,
      amountMinorUnits: incoming.amount_minor_units,
      announcedDate: incoming.announced_date,
    },
  );
}

/**
 * Find a live (non-duplicate) funding_deals row from the last 30 days that
 * represents the same company / round / size as `incoming`.
 */
export async function findCrossArticleDuplicateDeal(
  prisma: PrismaClient,
  args: {
    company_name: string;
    company_name_normalized: string;
    announced_date: Date | null;
    round_type_normalized: string | null;
    amount_minor_units?: bigint | number | null;
    exclude_source_article_id: string;
    windowDays?: number;
  },
): Promise<CrossArticleDealMatch | null> {
  const windowDays = args.windowDays ?? DEAL_MATCH_WINDOW_DAYS;
  const now = new Date();
  const createdFrom = subDays(now, windowDays);
  const announcedFrom = args.announced_date ? subDays(args.announced_date, windowDays) : createdFrom;
  const announcedTo = args.announced_date ?? now;

  const candidates = await prisma.fundingDeal.findMany({
    where: {
      duplicate_of_deal_id: null,
      NOT: { source_article_id: args.exclude_source_article_id },
      OR: [
        { announced_date: { gte: announcedFrom, lte: announcedTo } },
        { announced_date: null, created_at: { gte: createdFrom } },
        { created_at: { gte: createdFrom } },
      ],
    },
    select: {
      id: true,
      source_article_id: true,
      company_name: true,
      company_name_normalized: true,
      company_website: true,
      round_type_raw: true,
      round_type_normalized: true,
      amount_raw: true,
      amount_minor_units: true,
      announced_date: true,
      deal_summary: true,
      extraction_confidence: true,
      extraction_method: true,
      raw_extraction_json: true,
      source_article: { select: { source_key: true, canonical_url: true, article_url: true } },
    },
    orderBy: { created_at: "desc" },
    take: 80,
  });

  let best: { row: (typeof candidates)[number]; score: number } | null = null;
  for (const row of candidates) {
    const result = scoreIncomingAgainstDeal(row, {
      company_name: args.company_name || args.company_name_normalized,
      round_type_normalized: args.round_type_normalized,
      amount_minor_units: args.amount_minor_units ?? null,
      announced_date: args.announced_date,
    });
    if (!result.isMatch) continue;
    if (!best || result.score > best.score) best = { row, score: result.score };
  }
  if (!best) return null;
  const row = best.row;
  return {
    id: row.id,
    source_article_id: row.source_article_id,
    sourceKey: row.source_article.source_key,
    articleUrl: row.source_article.canonical_url || row.source_article.article_url,
    qualityTier: fundingSourceQualityTier(row.source_article.source_key),
    company_name: row.company_name,
    company_name_normalized: row.company_name_normalized,
    company_website: row.company_website,
    round_type_raw: row.round_type_raw,
    round_type_normalized: row.round_type_normalized,
    amount_raw: row.amount_raw,
    amount_minor_units: row.amount_minor_units,
    announced_date: row.announced_date,
    deal_summary: row.deal_summary,
    extraction_confidence: row.extraction_confidence,
    extraction_method: row.extraction_method,
    raw_extraction_json: row.raw_extraction_json,
  };
}

export function mergeExtractionJson(
  existing: Prisma.JsonValue | null | undefined,
  incoming: ExtractedDeal,
  extraUrls: string[],
  extraKeys: string[],
): Prisma.InputJsonValue {
  const prior = existing && typeof existing === "object" && !Array.isArray(existing) ? { ...(existing as Record<string, unknown>) } : {};
  return {
    ...prior,
    ...incoming,
    supplementary_urls: mergeSupplementaryUrls(prior.supplementary_urls, extraUrls),
    source_keys: [...new Set([...(Array.isArray(prior.source_keys) ? prior.source_keys : []), ...extraKeys])],
  };
}

export function mergeCanonicalDealFields(args: {
  existing: CrossArticleDealMatch;
  incoming: ExtractedDeal;
  incomingCompany: string;
  incomingSourceKey: string;
  incomingArticleUrl: string;
}): {
  company_name: string;
  company_name_normalized: string;
  company_website: string | null;
  round_type_raw: string | null;
  round_type_normalized: string | null;
  amount_raw: string | null;
  amount_minor_units: bigint | null;
  announced_date: Date | null;
  deal_summary: string | null;
  extraction_confidence: number;
  extraction_method: string;
  raw_extraction_json: Prisma.InputJsonValue;
} {
  const outranks = incomingOutranksExisting(
    fundingSourceQualityTier(args.incomingSourceKey),
    args.existing.qualityTier,
  );
  const company = pickPreferredField(args.existing.company_name, args.incomingCompany, outranks);
  return {
    company_name: company,
    company_name_normalized: normalizeCompanyName(company),
    company_website: pickPreferredField(args.existing.company_website, args.incoming.company_website, outranks),
    round_type_raw: pickPreferredField(args.existing.round_type_raw, args.incoming.round_type_raw, outranks),
    round_type_normalized: pickPreferredField(
      args.existing.round_type_normalized,
      args.incoming.round_type_normalized,
      outranks,
    ),
    amount_raw: pickPreferredField(args.existing.amount_raw, args.incoming.amount_raw, outranks),
    amount_minor_units: pickPreferredField(
      args.existing.amount_minor_units,
      args.incoming.amount_minor_units,
      outranks,
    ),
    announced_date: pickPreferredField(args.existing.announced_date, args.incoming.announced_date, outranks),
    deal_summary: pickPreferredField(args.existing.deal_summary, args.incoming.deal_summary, outranks),
    extraction_confidence: Math.max(args.existing.extraction_confidence, args.incoming.extraction_confidence),
    extraction_method: outranks ? args.incoming.extraction_method : args.existing.extraction_method,
    raw_extraction_json: mergeExtractionJson(args.existing.raw_extraction_json, args.incoming, [
      args.existing.articleUrl,
      args.incomingArticleUrl,
    ], [args.existing.sourceKey, args.incomingSourceKey]),
  };
}
