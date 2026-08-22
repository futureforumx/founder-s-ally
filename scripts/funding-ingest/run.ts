/**
 * Daily funding news ingestion — fetches listings + article HTML, extracts deals,
 * dedupes, and writes to Postgres via Prisma.
 *
 * @see scripts/funding-ingest/README.md
 */
import { createHash } from "node:crypto";
import { type FundingIngestSourceKey, type Prisma } from "@prisma/client";
import { disconnectPipelinePrisma, getPipelinePrisma } from "../lib/pipelineDb.js";
import { listCachedListingsOrFetch } from "../ingest-shared-feeds/cache.js";
import {
  extractDeterministic,
  investorRowsFromExtracted,
  stripHtml,
  isLikelyVcFundVehicleHeadline,
  sanitizeInvestorList,
  inferSectorFromDealCopy,
} from "./extract.js";
import { extractWithOpenAI } from "./openaiExtract.js";
import { canonicalizeArticleUrl } from "./url.js";
import { normalizeCompanyName, normalizeRound, normalizeSector, parseMoneyToUsdMinorUnits } from "./normalize.js";
import { findCrossArticleDuplicateDeal, mergeCanonicalDealFields } from "./dedupe.js";
import {
  fundingSourceQualityTier,
  incomingOutranksExisting,
  shouldSkipLlmForMatch,
} from "../../src/lib/ingestEntityMatch";
import {
  fetchTechcrunchVenture,
  fetchAlleywatchFunding,
  fetchGeekwireFundings,
  fetchStartupsGalleryNews,
  fetchArticleHtml,
} from "./sources.js";
import type { ExtractedDeal, ListingItem, RunSummary } from "./types.js";

const prisma = getPipelinePrisma();

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

function envInt(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

const DRY = process.env.INGEST_DRY_RUN === "1";
const USE_OPENAI = Boolean(process.env.OPENAI_API_KEY) && process.env.INGEST_DISABLE_OPENAI !== "1";
const MAX_PER_SOURCE = envInt("INGEST_MAX_ARTICLES_PER_SOURCE", 40);
/** Gallery is a finite curated table — ingest every visible row, not the per-source RSS cap. */
const MAX_STARTUPS_GALLERY = envInt("INGEST_STARTUPS_GALLERY_MAX", Math.max(MAX_PER_SOURCE, 500));
const SKIP_SOURCES = new Set(
  (process.env.INGEST_SKIP_SOURCES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

function applyListingPreset(ex: ExtractedDeal, item: ListingItem): ExtractedDeal {
  if (!item.presetDeal) return ex;
  const preset = item.presetDeal;
  const presetMoney = parseMoneyToUsdMinorUnits(preset.amount_raw);
  return {
    ...ex,
    company_name: preset.company_name ?? ex.company_name,
    company_website: preset.company_website ?? ex.company_website,
    round_type_raw: preset.round_type_raw ?? ex.round_type_raw,
    amount_raw: preset.amount_raw ?? ex.amount_raw,
    amount_minor_units: presetMoney.amount_minor_units ?? ex.amount_minor_units,
    currency: presetMoney.amount_minor_units ? presetMoney.currency : ex.currency,
    announced_date: preset.announced_date ?? ex.announced_date ?? item.publishedAt,
    lead_investors: preset.lead_investor
      ? sanitizeInvestorList([preset.lead_investor, ...ex.lead_investors])
      : ex.lead_investors,
    extraction_confidence: Math.max(ex.extraction_confidence, 0.85),
    extraction_method: ex.extraction_method === "regex" ? "hybrid" : ex.extraction_method,
  };
}

async function flushLogs(rows: Prisma.ExtractionLogCreateManyInput[]) {
  if (DRY || rows.length === 0) return;
  const chunk = 200;
  for (let i = 0; i < rows.length; i += chunk) {
    await prisma.extractionLog.createMany({ data: rows.slice(i, i + chunk) });
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  let dbHost = "unknown";
  try {
    dbHost = new URL(process.env.DATABASE_URL).hostname;
  } catch {
    /* ignore */
  }
  log(`starting (dry=${DRY}, max_per_source=${MAX_PER_SOURCE}, startups_gallery_max=${MAX_STARTUPS_GALLERY}, db_host=${dbHost})`);

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
      key: "STARTUPS_GALLERY_NEWS",
      fn: async (since) => {
        const cp = await checkpoint("STARTUPS_GALLERY_NEWS");
        const rawIds = (cp?.cursor_json as { cms_ids?: unknown } | null)?.cms_ids;
        const seenCmsIds = Array.isArray(rawIds) ? rawIds.filter((id): id is string => typeof id === "string") : [];
        return fetchStartupsGalleryNews(since, MAX_STARTUPS_GALLERY, log, { seenCmsIds });
      },
    },
    {
      key: "TECHCRUNCH_VENTURE",
      fn: (since) =>
        listCachedListingsOrFetch(
          "TECHCRUNCH_VENTURE",
          since,
          MAX_PER_SOURCE,
          log,
          fetchTechcrunchVenture,
        ),
    },
    {
      key: "ALLEYWATCH_FUNDING",
      fn: (since) =>
        listCachedListingsOrFetch(
          "ALLEYWATCH_FUNDING",
          since,
          MAX_PER_SOURCE,
          log,
          fetchAlleywatchFunding,
        ),
    },
    {
      key: "GEEKWIRE_FUNDINGS",
      fn: (since) => fetchGeekwireFundings(since, MAX_PER_SOURCE, log),
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
          let html = "";
          let plain = "";
          const listingComplete = Boolean(
            item.presetDeal?.company_name &&
              (item.presetDeal.amount_raw || item.presetDeal.round_type_raw),
          );
          try {
            if (listingComplete) {
              log(`[${key}] using listing-provided deal data for ${canonical}`);
            } else {
              html = await fetchArticleHtml(canonical, log);
              plain = stripHtml(html);
            }
          } catch (fetchErr) {
            // Some listings (e.g. startups.gallery) already hand us structured deal fields —
            // don't drop the deal just because the linked press page (often LinkedIn/X, which
            // blocks scraping) couldn't be fetched.
            if (!item.presetDeal) throw fetchErr;
            log(
              `[${key}] article fetch failed for ${canonical} — using listing-provided deal data: ` +
                `${fetchErr instanceof Error ? fetchErr.message : String(fetchErr)}`,
            );
          }
          const hash = createHash("sha256")
            .update(plain || canonical)
            .digest("hex");

          let ex = extractDeterministic(item.title, html);
          if (item.publishedAt && !ex.announced_date) ex.announced_date = item.publishedAt;
          ex = applyListingPreset(ex, item);
          ex.round_type_normalized = normalizeRound(ex.round_type_raw);

          const earlyCompany =
            ex.company_name?.trim() || item.title.split(/raises|secures|lands/i)[0]?.trim() || item.title;
          let skipLlm = listingComplete;
          if (!DRY && earlyCompany) {
            const earlyDup = await findCrossArticleDuplicateDeal(prisma, {
              company_name: earlyCompany,
              company_name_normalized: normalizeCompanyName(earlyCompany),
              announced_date: ex.announced_date,
              round_type_normalized: ex.round_type_normalized,
              amount_minor_units: ex.amount_minor_units,
              exclude_source_article_id: "pending",
            });
            if (earlyDup && shouldSkipLlmForMatch(earlyDup.qualityTier, fundingSourceQualityTier(key))) {
              skipLlm = true;
              log(
                `[${key}] skip OpenAI — match ${earlyDup.id} from tier ${earlyDup.qualityTier} source ${earlyDup.sourceKey}`,
              );
            }
          }

          if (USE_OPENAI && plain && !skipLlm) {
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
            ex = applyListingPreset(ex, item);
          }

          ex.round_type_normalized = normalizeRound(ex.round_type_raw);
          const inferredSector = inferSectorFromDealCopy(item.title, plain);
          if (inferredSector) {
            ex.sector_raw = inferredSector;
          }
          ex.sector_normalized = normalizeSector(ex.sector_raw) ?? ex.sector_normalized;

          ex.lead_investors = sanitizeInvestorList(ex.lead_investors);
          ex.participating_investors = sanitizeInvestorList(ex.participating_investors);
          ex.existing_investors_mentioned = sanitizeInvestorList(ex.existing_investors_mentioned);

          const company = ex.company_name?.trim() || item.title.split(/raises|secures|lands/i)[0]?.trim() || item.title;
          const company_name_normalized = normalizeCompanyName(company);
          const vcFundVehicle = isLikelyVcFundVehicleHeadline(item.title, plain);
          const needsReview =
            vcFundVehicle ||
            !ex.company_name ||
            ex.extraction_confidence < 0.45 ||
            (!ex.amount_raw && !ex.round_type_raw && ex.lead_investors.length === 0);
          const reviewReason = needsReview
            ? vcFundVehicle
              ? "likely_vc_fund_raise_not_portfolio"
              : "missing_core_fields_or_low_confidence"
            : null;

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

            const dup = await findCrossArticleDuplicateDeal(prisma, {
              company_name: company,
              company_name_normalized,
              announced_date: ex.announced_date,
              round_type_normalized: ex.round_type_normalized,
              amount_minor_units: ex.amount_minor_units,
              exclude_source_article_id: article.id,
            });

            const incomingTier = fundingSourceQualityTier(key);
            const promoteIncoming = Boolean(dup && incomingOutranksExisting(incomingTier, dup.qualityTier));
            const merged = dup
              ? mergeCanonicalDealFields({
                  existing: dup,
                  incoming: ex,
                  incomingCompany: company,
                  incomingSourceKey: key,
                  incomingArticleUrl: canonical,
                })
              : null;

            const liveFields = promoteIncoming && merged
              ? merged
              : {
                  company_name: company,
                  company_name_normalized,
                  company_website: ex.company_website,
                  round_type_raw: ex.round_type_raw,
                  round_type_normalized: ex.round_type_normalized,
                  amount_raw: ex.amount_raw,
                  amount_minor_units: ex.amount_minor_units,
                  announced_date: ex.announced_date,
                  deal_summary: ex.deal_summary,
                  extraction_confidence: ex.extraction_confidence,
                  extraction_method: ex.extraction_method,
                  raw_extraction_json: ex as unknown as Prisma.InputJsonValue,
                };

            const deal = await prisma.fundingDeal.upsert({
              where: { source_article_id_slot_index: { source_article_id: article.id, slot_index: 0 } },
              create: {
                source_article_id: article.id,
                slot_index: 0,
                company_name: liveFields.company_name,
                company_name_normalized: liveFields.company_name_normalized,
                company_website: liveFields.company_website,
                company_hq: ex.company_hq,
                round_type_raw: liveFields.round_type_raw,
                round_type_normalized: liveFields.round_type_normalized,
                amount_raw: liveFields.amount_raw,
                amount_minor_units: liveFields.amount_minor_units ?? undefined,
                currency: ex.currency,
                announced_date: liveFields.announced_date,
                sector_raw: ex.sector_raw,
                sector_normalized: ex.sector_normalized,
                founders_mentioned: ex.founders_mentioned,
                existing_investors_mentioned: ex.existing_investors_mentioned,
                deal_summary: liveFields.deal_summary,
                extraction_confidence: liveFields.extraction_confidence,
                extraction_method: liveFields.extraction_method,
                raw_extraction_json: liveFields.raw_extraction_json,
                needs_review: needsReview,
                review_reason: reviewReason,
                duplicate_of_deal_id: dup && !promoteIncoming ? dup.id : null,
              },
              update: {
                company_name: liveFields.company_name,
                company_name_normalized: liveFields.company_name_normalized,
                company_website: liveFields.company_website,
                company_hq: ex.company_hq,
                round_type_raw: liveFields.round_type_raw,
                round_type_normalized: liveFields.round_type_normalized,
                amount_raw: liveFields.amount_raw,
                amount_minor_units: liveFields.amount_minor_units ?? undefined,
                currency: ex.currency,
                announced_date: liveFields.announced_date,
                sector_raw: ex.sector_raw,
                sector_normalized: ex.sector_normalized,
                founders_mentioned: ex.founders_mentioned,
                existing_investors_mentioned: ex.existing_investors_mentioned,
                deal_summary: liveFields.deal_summary,
                extraction_confidence: liveFields.extraction_confidence,
                extraction_method: liveFields.extraction_method,
                raw_extraction_json: liveFields.raw_extraction_json,
                needs_review: needsReview,
                review_reason: reviewReason,
                duplicate_of_deal_id: dup && !promoteIncoming ? dup.id : null,
              },
            });

            if (dup && merged) {
              summary.duplicatesSkipped += 1;
              if (promoteIncoming) {
                await prisma.fundingDeal.update({
                  where: { id: dup.id },
                  data: { duplicate_of_deal_id: deal.id },
                });
              } else {
                await prisma.fundingDeal.update({
                  where: { id: dup.id },
                  data: {
                    company_website: merged.company_website,
                    round_type_raw: merged.round_type_raw,
                    round_type_normalized: merged.round_type_normalized,
                    amount_raw: merged.amount_raw,
                    amount_minor_units: merged.amount_minor_units ?? undefined,
                    deal_summary: merged.deal_summary,
                    raw_extraction_json: merged.raw_extraction_json,
                    extraction_confidence: merged.extraction_confidence,
                  },
                });
              }
              logRows.push({
                run_id: runId,
                source_article_id: article.id,
                funding_deal_id: deal.id,
                level: "info",
                message: promoteIncoming
                  ? "Collapsed lower-tier live deal onto higher-quality source"
                  : "Collapsed duplicate onto existing live deal and merged press URLs",
                payload_json: {
                  duplicate_deal_id: dup.id,
                  live_deal_id: promoteIncoming ? deal.id : dup.id,
                  incoming_source: key,
                  existing_source: dup.sourceKey,
                  company_name_normalized,
                },
              });
            } else {
              summary.dealsUpserted += 1;
            }
            if (needsReview) {
              summary.lowConfidenceDeals += 1;
              summary.reviewDealIds.push(deal.id);
              logRows.push({
                run_id: runId,
                source_article_id: article.id,
                funding_deal_id: deal.id,
                level: "warn",
                message: vcFundVehicle
                  ? "needs_review — likely VC fund vehicle (not portfolio company round)"
                  : "needs_review — missing_core_fields_or_low_confidence",
                payload_json: {
                  extraction_confidence: ex.extraction_confidence,
                  company_name: company,
                },
              });
            }

            const liveDealId = dup && !promoteIncoming ? dup.id : deal.id;
            if (liveDealId === deal.id) {
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
        const prevIds = Array.isArray((cp?.cursor_json as { cms_ids?: unknown } | null)?.cms_ids)
          ? (cp!.cursor_json as { cms_ids: unknown[] }).cms_ids.filter((id): id is string => typeof id === "string")
          : [];
        const newIds = items.map((item) => item.externalId).filter((id): id is string => Boolean(id));
        const cmsIds = [...new Set([...prevIds, ...newIds])].slice(-5_000);
        await prisma.ingestionSourceCheckpoint.upsert({
          where: { source_key: key },
          create: {
            source_key: key,
            last_success_at: new Date(),
            last_article_published_at: maxPub,
            last_run_id: runId,
            cursor_json: key === "STARTUPS_GALLERY_NEWS" ? { cms_ids: cmsIds } : undefined,
          },
          update: {
            last_success_at: new Date(),
            last_article_published_at: maxPub ?? undefined,
            last_run_id: runId,
            ...(key === "STARTUPS_GALLERY_NEWS" ? { cursor_json: { cms_ids: cmsIds } } : {}),
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
    await disconnectPipelinePrisma();
  });
