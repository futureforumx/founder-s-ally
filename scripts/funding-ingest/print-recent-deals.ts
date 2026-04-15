/**
 * Prints recent funding deals + source articles (requires DATABASE_URL).
 *
 *   npx tsx scripts/funding-ingest/print-recent-deals.ts
 *   SAMPLE_LIMIT=5 npx tsx scripts/funding-ingest/print-recent-deals.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const limit = Math.max(1, parseInt(process.env.SAMPLE_LIMIT || "5", 10));

async function main() {
  const deals = await prisma.fundingDeal.findMany({
    orderBy: { updated_at: "desc" },
    take: limit,
    include: {
      source_article: true,
      investors: { orderBy: { sort_order: "asc" } },
    },
  });

  const rows = deals.map((d) => ({
    funding_deal_id: d.id,
    source_name: d.source_article.source_key,
    listing_url: d.source_article.listing_url,
    article_url: d.source_article.article_url,
    article_title: d.source_article.title,
    article_publish_date: d.source_article.published_at,
    company_name: d.company_name,
    company_website: d.company_website,
    company_location: d.company_hq,
    round_type: d.round_type_normalized ?? d.round_type_raw,
    amount_raised: d.amount_raw,
    amount_minor_units: d.amount_minor_units?.toString() ?? null,
    currency: d.currency,
    lead_investors: d.investors.filter((i) => i.role === "LEAD").map((i) => i.name_raw),
    participating_investors: d.investors.filter((i) => i.role === "PARTICIPANT").map((i) => i.name_raw),
    founder_names: d.founders_mentioned,
    sector: d.sector_normalized ?? d.sector_raw,
    summary: d.deal_summary,
    extraction_confidence: d.extraction_confidence,
    needs_review: d.needs_review,
    raw_excerpt_preview: d.source_article.raw_excerpt?.slice(0, 240) ?? null,
  }));

  console.log(JSON.stringify(rows, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
