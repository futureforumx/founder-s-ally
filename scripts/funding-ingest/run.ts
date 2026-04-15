/**
 * Daily funding news ingestion — fetches listings + article HTML, extracts deals,
 * dedupes, and writes to Postgres via Prisma.
 *
 * @see scripts/funding-ingest/README.md
 */
import { createHash } from "node:crypto";
import { PrismaClient, type FundingIngestSourceKey, type Prisma } from "@prisma/client";
import { extractDeterministic, investorRowsFromExtracted, stripHtml } from "./extract.js";
import { extractWithOpenAI } from "./openaiExtract.js";
import { canonicalizeArticleUrl } from "./url.js";
import { normalizeCompanyName, normalizeRound, normalizeSector, parseMoneyToUsdMinorUnits } from "./normalize.js";
import { findCrossArticleDuplicateDeal } from "./dedupe.js";
import {
  fetchTechcrunchVenture,
  fetchAlleywatchFunding,
  fetchGeekwireFundings,
  fetchStartupsGalleryNews,
  fetchArticleHtml,
} from "./sources.js";
import type { ListingItem, RunSummary } from "./types.js";

const prisma = new PrismaClient();

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(`[funding-ingest] ${new Date().toISOString()} ${msg}`);
}

function pacificCalendarDate(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function pacificHour(d = new Date()): number {
  const h = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    hour12: false,
  })
    .formatToParts(d)
    .find((p) => p.type === "hour")?.value;
  return parseInt(h ?? "-1", 10);
}

function envInt(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

const DRY = process.env.INGEST_DRY_RUN === "1";
const USE_OPENAI = Boolean(process.env.OPENAI_API_KEY) && process.env.INGEST_DISABLE_OPENAI !== "1";
const MAX_PER_SOURCE = envInt("INGEST_MAX_ARTICLES_PER_SOURCE", 40);
const SKIP_SOURCES = new Set(
  (process.env.INGEST_SKIP_SOURCES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

async function flushLogs(rows: Prisma.ExtractionLogCreateManyInput[]) {
  if (DRY || rows.length === 0) return;
  const chunk = 200;
  for (let i = 0; i < rows.length; i += chunk) {
    await prisma.extractionLog.createMany({ data: rows.slice(i, i + chunk) });
  }
}

async function main() {
  const requirePacific = process.env.INGEST_REQUIRE_PACIFIC_HOUR === "1";
  const skipPacific = process.env.INGEST_SKIP_PACIFIC_GUARD === "1";
  if (requirePacific && !skipPacific && pacificHour() !== 1) {
    log(
      `Pacific guard: local hour in America/Los_Angeles is ${pacificHour()} (need 1). Exiting without work. ` +
        `Set INGEST_SKIP_PACIFIC_GUARD=1 for ad-hoc runs.`,
    );
    process.exit(0);
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const summary: RunSummary = {
    articlesFetched: 0,
    articlesNew: 0,
    articlesUpdated: 0,
    dealsInserted: 0,
    dealsUpserted: 0,
    duplicatesSkipped: 0,
    lowConfidenceDeals: 0,
    failuresBySource: {},
    reviewDealIds: [],
    errors: [],
  };

  const logRows: Prisma.ExtractionLogCreateManyInput[] = [];
  const pacificDate = pacificCalendarDate();

  let runId: string | null = null;
  if (!DRY) {
    try {
      const run = await prisma.ingestionRun.create({
        data: {
          status: "running",
          trigger_kind: process.env.INGEST_TRIGGER ?? "manual",
          pacific_date: pacificDate,
        },
      });
      runId = run.id;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log(`ingestion_runs create failed: ${msg}`);
      throw e;
    }
  } else {
    log("DRY_RUN=1 — no database writes");
  }

  const checkpoint = async (key: FundingIngestSourceKey) => {
    if (DRY) return null;
    return prisma.ingestionSourceCheckpoint.findUnique({ where: { source_key: key } });
  };

  const loaders: { key: FundingIngestSourceKey; fn: (since: Date | null) => Promise<ListingItem[]> }[] = [
    {
      key: "TECHCRUNCH_VENTURE",
      fn: (since) => fetchTechcrunchVenture(since, MAX_PER_SOURCE, log),
    },
    {
      key: "ALLEYWATCH_FUNDING",
      fn: (since) => fetchAlleywatchFunding(since, MAX_PER_SOURCE, log),
    },
    {
      key: "GEEKWIRE_FUNDINGS",
      fn: (since) => fetchGeekwireFundings(since, MAX_PER_SOURCE, log),
    },
    {
      key: "STARTUPS_GALLERY_NEWS",
      fn: (since) => fetchStartupsGalleryNews(since, MAX_PER_SOURCE, log),
    },
  ];

  for (const { key, fn } of loaders) {
    if (SKIP_SOURCES.has(key)) {
      log(`skip source ${key} (INGEST_SKIP_SOURCES)`);
      continue;
    }
    let since: Date | null = null;
    try {
      const cp = await checkpoint(key);
      since = cp?.last_article_published_at ?? null;
      const items = await fn(since);
      summary.articlesFetched += items.length;
      let maxPub: Date | null = since;

      for (const item of items) {
        const canonical = canonicalizeArticleUrl(item.articleUrl);
        try {
          const html = await fetchArticleHtml(canonical, log);
          const plain = stripHtml(html);
          const hash = createHash("sha256").update(plain).digest("hex");

          let ex = extractDeterministic(item.title, html);
          if (item.publishedAt && !ex.announced_date) ex.announced_date = item.publishedAt;
          if (USE_OPENAI) {
            try {
              const ai = await extractWithOpenAI(item.title, plain);
              if (ai) {
                const mergedAmount = ai.amount_raw ?? ex.amount_raw;
                const money = parseMoneyToUsdMinorUnits(mergedAmount);
                ex = {
                  ...ex,
                  company_name: ai.company_name ?? ex.company_name,
                  company_website: ai.company_website ?? ex.company_website,
                  company_hq: ai.company_hq ?? ex.company_hq,
                  round_type_raw: ai.round_type_raw ?? ex.round_type_raw,
                  round_type_normalized: normalizeRound(ai.round_type_raw ?? ex.round_type_raw),
                  amount_raw: mergedAmount,
                  amount_minor_units: money.amount_minor_units ?? ex.amount_minor_units,
                  currency: money.currency || ai.currency || ex.currency,
                  announced_date: ai.announced_date ?? ex.announced_date ?? item.publishedAt,
                  sector_raw: ai.sector_raw ?? ex.sector_raw,
                  sector_normalized: normalizeSector(ai.sector_raw ?? ex.sector_raw) ?? ex.sector_normalized,
                  founders_mentioned: ai.founders_mentioned?.length ? ai.founders_mentioned : ex.founders_mentioned,
                  existing_investors_mentioned: ai.existing_investors_mentioned?.length
                    ? ai.existing_investors_mentioned
                    : ex.existing_investors_mentioned,
                  deal_summary: ai.deal_summary ?? ex.deal_summary,
                  lead_investors: ai.lead_investors?.length ? ai.lead_investors : ex.lead_investors,
                  participating_investors: ai.participating_investors?.length
                    ? ai.participating_investors
                    : ex.participating_investors,
                  extraction_confidence: Math.max(ex.extraction_confidence, ai.extraction_confidence ?? 0),
                  extraction_method: ex.extraction_method === "regex" ? "hybrid" : "openai",
                };
              }
            } catch (e) {
              logRows.push({
                run_id: runId,
                level: "warn",
                message: `OpenAI extraction failed for ${canonical}`,
                payload_json: { error: e instanceof Error ? e.message : String(e) },
              });
            }
          }

          ex.round_type_normalized = normalizeRound(ex.round_type_raw);
          ex.sector_normalized = normalizeSector(ex.sector_raw) ?? ex.sector_normalized;

          const company = ex.company_name?.trim() || item.title.split(/raises|secures|lands/i)[0]?.trim() || item.title;
          const company_name_normalized = normalizeCompanyName(company);
          const needsReview =
            !ex.company_name ||
            ex.extraction_confidence < 0.45 ||
            (!ex.amount_raw && !ex.round_type_raw && ex.lead_investors.length === 0);

          if (!DRY) {
            const existing = await prisma.sourceArticle.findUnique({ where: { canonical_url: canonical } });
            const article = await prisma.sourceArticle.upsert({
              where: { canonical_url: canonical },
              create: {
                source_key: key,
                listing_url: item.listingPageUrl ?? null,
                canonical_url: canonical,
                article_url: item.articleUrl,
                title: item.title,
                published_at: item.publishedAt,
                fetch_status: "FETCHED",
                raw_excerpt: item.summary ?? plain.slice(0, 2000),
                raw_text: plain.slice(0, 50_000),
                content_hash: hash,
                html_fetched_at: new Date(),
                first_seen_run_id: runId,
                last_seen_run_id: runId,
              },
              update: {
                title: item.title,
                listing_url: item.listingPageUrl ?? undefined,
                published_at: item.publishedAt ?? undefined,
                raw_excerpt: item.summary ?? undefined,
                raw_text: plain.slice(0, 50_000),
                content_hash: hash,
                html_fetched_at: new Date(),
                last_seen_run_id: runId,
              },
            });
            if (!existing) summary.articlesNew += 1;
            else if (existing.content_hash && existing.content_hash !== hash) summary.articlesUpdated += 1;

            if (item.publishedAt && (!maxPub || item.publishedAt > maxPub)) maxPub = item.publishedAt;

            const dup = ex.announced_date
              ? await findCrossArticleDuplicateDeal(prisma, {
                  company_name_normalized,
                  announced_date: ex.announced_date,
                  round_type_normalized: ex.round_type_normalized,
                  exclude_source_article_id: article.id,
                })
              : null;

            if (dup) {
              summary.duplicatesSkipped += 1;
              logRows.push({
                run_id: runId,
                source_article_id: article.id,
                level: "info",
                message: "Skipped deal insert — cross-article duplicate",
                payload_json: { duplicate_deal_id: dup.id, company_name_normalized },
              });
              continue;
            }

            const deal = await prisma.fundingDeal.upsert({
              where: { source_article_id_slot_index: { source_article_id: article.id, slot_index: 0 } },
              create: {
                source_article_id: article.id,
                slot_index: 0,
                company_name: company,
                company_name_normalized,
                company_website: ex.company_website,
                company_hq: ex.company_hq,
                round_type_raw: ex.round_type_raw,
                round_type_normalized: ex.round_type_normalized,
                amount_raw: ex.amount_raw,
                amount_minor_units: ex.amount_minor_units ?? undefined,
                currency: ex.currency,
                announced_date: ex.announced_date,
                sector_raw: ex.sector_raw,
                sector_normalized: ex.sector_normalized,
                founders_mentioned: ex.founders_mentioned,
                existing_investors_mentioned: ex.existing_investors_mentioned,
                deal_summary: ex.deal_summary,
                extraction_confidence: ex.extraction_confidence,
                extraction_method: ex.extraction_method,
                raw_extraction_json: ex as unknown as Prisma.InputJsonValue,
                needs_review: needsReview,
                review_reason: needsReview ? "missing_core_fields_or_low_confidence" : null,
              },
              update: {
                company_name: company,
                company_name_normalized,
                company_website: ex.company_website,
                company_hq: ex.company_hq,
                round_type_raw: ex.round_type_raw,
                round_type_normalized: ex.round_type_normalized,
                amount_raw: ex.amount_raw,
                amount_minor_units: ex.amount_minor_units ?? undefined,
                currency: ex.currency,
                announced_date: ex.announced_date,
                sector_raw: ex.sector_raw,
                sector_normalized: ex.sector_normalized,
                founders_mentioned: ex.founders_mentioned,
                existing_investors_mentioned: ex.existing_investors_mentioned,
                deal_summary: ex.deal_summary,
                extraction_confidence: ex.extraction_confidence,
                extraction_method: ex.extraction_method,
                raw_extraction_json: ex as unknown as Prisma.InputJsonValue,
                needs_review: needsReview,
                review_reason: needsReview ? "missing_core_fields_or_low_confidence" : null,
              },
            });
            summary.dealsUpserted += 1;
            if (needsReview) {
              summary.lowConfidenceDeals += 1;
              summary.reviewDealIds.push(deal.id);
              logRows.push({
                run_id: runId,
                source_article_id: article.id,
                funding_deal_id: deal.id,
                level: "warn",
                message: "needs_review — missing_core_fields_or_low_confidence",
                payload_json: {
                  extraction_confidence: ex.extraction_confidence,
                  company_name: company,
                },
              });
            }

            await prisma.fundingDealInvestor.deleteMany({ where: { funding_deal_id: deal.id } });
            const invRows = investorRowsFromExtracted(ex);
            if (invRows.length) {
              await prisma.fundingDealInvestor.createMany({
                data: invRows.map((r) => ({
                  funding_deal_id: deal.id,
                  role: r.role,
                  name_raw: r.name_raw,
                  name_normalized: r.name_normalized,
                  sort_order: r.sort_order,
                })),
              });
            }
          } else {
            log(`would upsert article=${canonical} company=${company} conf=${ex.extraction_confidence.toFixed(2)}`);
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          summary.errors.push(`${key}: ${canonical}: ${msg}`);
          summary.failuresBySource[key] = (summary.failuresBySource[key] ?? 0) + 1;
          logRows.push({
            run_id: runId,
            level: "error",
            message: `Article ingest failed (${key})`,
            payload_json: { url: canonical, error: msg },
          });
          log(`ERROR ${key} ${canonical}: ${msg}`);
        }
      }

      if (!DRY) {
        await prisma.ingestionSourceCheckpoint.upsert({
          where: { source_key: key },
          create: {
            source_key: key,
            last_success_at: new Date(),
            last_article_published_at: maxPub,
            last_run_id: runId,
          },
          update: {
            last_success_at: new Date(),
            last_article_published_at: maxPub ?? undefined,
            last_run_id: runId,
          },
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      summary.errors.push(`${key}: listing: ${msg}`);
      summary.failuresBySource[key] = (summary.failuresBySource[key] ?? 0) + 1;
      log(`LISTING ERROR ${key}: ${msg}`);
      logRows.push({
        run_id: runId,
        level: "error",
        message: `Listing fetch failed for source ${key}`,
        payload_json: { error: msg },
      });
    }
  }

  await flushLogs(logRows);

  if (!DRY && runId) {
    const hardFailures = Object.values(summary.failuresBySource).reduce((a, b) => a + (b ?? 0), 0);
    const status =
      summary.errors.length && hardFailures >= 4 && summary.dealsUpserted === 0
        ? "failed"
        : summary.errors.length
          ? "partial"
          : "success";
    await prisma.ingestionRun.update({
      where: { id: runId },
      data: {
        status,
        finished_at: new Date(),
        summary_json: summary as unknown as Prisma.InputJsonValue,
        error_message: status === "failed" ? summary.errors.slice(0, 3).join(" | ") : null,
      },
    });
  }

  log(`summary=${JSON.stringify(summary)}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
