import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

export type EnrichmentReviewEntity = { entityType: string; records: number };

export type EnrichmentReviewBucket = {
  records: number;
  fields: number;
  identityReviews: number;
  byEntity: EnrichmentReviewEntity[];
};

export type EnrichmentReviewSummary = {
  recentDays: number;
  generatedAt: string | null;
  needsReview: EnrichmentReviewBucket;
  backlog: EnrichmentReviewBucket & { olderRecords: number; oldestAt: string | null };
};

const ENTITY_LABELS: Record<string, string> = {
  firm: "Firms",
  investor: "Investors",
  company: "Companies",
  founder: "Founders",
  operator: "Operators",
};

export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function parseBucket(raw: unknown): EnrichmentReviewBucket {
  const o = (raw ?? {}) as Record<string, unknown>;
  const byEntity = Array.isArray(o.by_entity) ? o.by_entity : [];
  return {
    records: num(o.records),
    fields: num(o.fields),
    identityReviews: num(o.identity_reviews),
    byEntity: byEntity
      .map((e) => ({ entityType: String((e as Record<string, unknown>)?.entity_type ?? ""), records: num((e as Record<string, unknown>)?.records) }))
      .filter((e) => e.entityType && e.records > 0),
  };
}

/** Normalises the `review` payload from the admin-enrichment-report edge function. */
export function parseReviewSummary(raw: unknown): EnrichmentReviewSummary {
  const o = (raw ?? {}) as Record<string, unknown>;
  const backlog = (o.backlog ?? {}) as Record<string, unknown>;
  return {
    recentDays: num(o.recent_days) || 7,
    generatedAt: typeof o.generated_at === "string" ? o.generated_at : null,
    needsReview: parseBucket(o.needs_review),
    backlog: {
      ...parseBucket(backlog),
      olderRecords: num(backlog.older_records),
      oldestAt: typeof backlog.oldest_at === "string" ? backlog.oldest_at : null,
    },
  };
}

export async function fetchEnrichmentReviewSummary(recentDays = 7): Promise<EnrichmentReviewSummary> {
  const body = { view: "review", recent_days: recentDays };
  const { data, error } = await invokeEdgeFunction("admin-enrichment-report", { preferClerkSessionToken: true, body });
  if (error) throw new Error(error.message || "Could not load enrichment review counts");
  const payload = data as { review?: unknown; error?: string } | null;
  if (payload?.error) throw new Error(payload.error);
  if (!payload?.review) throw new Error("Enrichment review counts are unavailable");
  return parseReviewSummary(payload.review);
}
