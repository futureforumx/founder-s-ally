/**
 * One-off historical backfill collector (no DATABASE_URL / Prisma required).
 *
 * The daily GitHub Actions ingest silently stopped succeeding after 2026-05-07 (CI was using
 * `npm ci` against a stale `package-lock.json` while the repo had moved to pnpm — see
 * `.github/workflows/funding-ingest.yml`). RSS feeds only carry the most recent ~20-40 posts, so
 * once CI came back online the normal checkpoint-based run could not recover the gap. This script
 * walks the paginated category *archives* (not RSS) for TechCrunch / AlleyWatch back to a given
 * `--since` date, plus the current startups.gallery table, runs the same deterministic extraction
 * as `run.ts`, and writes a JSON file of ready-to-insert deal records for review before writing to
 * the DB (see `backfill-write.ts`).
 *
 *   npx tsx scripts/funding-ingest/backfill-collect.ts --since=2026-05-07T01:10:27.322Z --out=/tmp/funding-backfill.json
 */
import { writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  fetchTechcrunchVentureArchive,
  fetchAlleywatchFundingArchive,
  fetchStartupsGalleryNews,
  fetchArticleHtml,
} from "./sources.js";
import {
  extractDeterministic,
  investorRowsFromExtracted,
  stripHtml,
  isLikelyVcFundVehicleHeadline,
  sanitizeInvestorList,
  inferSectorFromDealCopy,
} from "./extract.js";
import { normalizeCompanyName, normalizeRound, normalizeSector, parseMoneyToUsdMinorUnits } from "./normalize.js";
import { canonicalizeArticleUrl } from "./url.js";
import type { ExtractedDeal, ListingItem } from "./types.js";

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.error(`[backfill-collect] ${new Date().toISOString()} ${msg}`);
}

function argValue(name: string, def?: string): string | undefined {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : def;
}

const SINCE = new Date(argValue("since", "2026-05-07T00:00:00.000Z")!);
const OUT = argValue("out", "/tmp/funding-backfill.json")!;
const MAX_PER_SOURCE = parseInt(argValue("maxPerSource", "500")!, 10);
const CONCURRENCY = parseInt(argValue("concurrency", "4")!, 10);

async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]!, idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export type BackfillRecord = {
  sourceKey: ListingItem["sourceKey"];
  canonicalUrl: string;
  articleUrl: string;
  listingUrl: string | null;
  title: string;
  publishedAt: string | null;
  summary: string | null;
  contentHash: string;
  rawExcerpt: string | null;
  rawText: string;
  deal: ExtractedDeal;
  company: string;
  companyNameNormalized: string;
  needsReview: boolean;
  reviewReason: string | null;
  investors: ReturnType<typeof investorRowsFromExtracted>;
  fetchFailed: boolean;
};

async function processItem(item: ListingItem): Promise<BackfillRecord | { error: string; item: ListingItem }> {
  const canonical = canonicalizeArticleUrl(item.articleUrl);
  try {
    let html = "";
    let plain = "";
    let fetchFailed = false;
    try {
      html = await fetchArticleHtml(canonical, log);
      plain = stripHtml(html);
    } catch (e) {
      fetchFailed = true;
      if (!item.presetDeal) throw e;
      log(`article fetch failed for ${canonical}, using listing-provided deal data: ${e instanceof Error ? e.message : String(e)}`);
    }

    const hash = createHash("sha256")
      .update(plain || canonical)
      .digest("hex");

    let ex = extractDeterministic(item.title, html);
    if (item.publishedAt && !ex.announced_date) ex.announced_date = item.publishedAt;

    if (item.presetDeal) {
      const preset = item.presetDeal;
      const presetMoney = parseMoneyToUsdMinorUnits(preset.amount_raw);
      ex = {
        ...ex,
        company_name: preset.company_name ?? ex.company_name,
        round_type_raw: preset.round_type_raw ?? ex.round_type_raw,
        amount_raw: preset.amount_raw ?? ex.amount_raw,
        amount_minor_units: presetMoney.amount_minor_units ?? ex.amount_minor_units,
        currency: presetMoney.amount_minor_units ? presetMoney.currency : ex.currency,
        announced_date: preset.announced_date ?? ex.announced_date ?? item.publishedAt,
        lead_investors: preset.lead_investor ? sanitizeInvestorList([preset.lead_investor, ...ex.lead_investors]) : ex.lead_investors,
        extraction_confidence: Math.max(ex.extraction_confidence, 0.85),
        extraction_method: ex.extraction_method === "regex" ? "hybrid" : ex.extraction_method,
      };
    }

    ex.round_type_normalized = normalizeRound(ex.round_type_raw);
    const inferredSector = inferSectorFromDealCopy(item.title, plain);
    if (inferredSector) ex.sector_raw = inferredSector;
    ex.sector_normalized = normalizeSector(ex.sector_raw) ?? ex.sector_normalized;

    ex.lead_investors = sanitizeInvestorList(ex.lead_investors);
    ex.participating_investors = sanitizeInvestorList(ex.participating_investors);
    ex.existing_investors_mentioned = sanitizeInvestorList(ex.existing_investors_mentioned);

    const company = ex.company_name?.trim() || item.title.split(/raises|secures|lands/i)[0]?.trim() || item.title;
    const companyNameNormalized = normalizeCompanyName(company);
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

    return {
      sourceKey: item.sourceKey,
      canonicalUrl: canonical,
      articleUrl: item.articleUrl,
      listingUrl: item.listingPageUrl ?? null,
      title: item.title,
      publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
      summary: item.summary ?? null,
      contentHash: hash,
      rawExcerpt: item.summary ?? plain.slice(0, 2000),
      rawText: plain.slice(0, 50_000),
      deal: ex,
      company,
      companyNameNormalized,
      needsReview,
      reviewReason,
      investors: investorRowsFromExtracted(ex),
      fetchFailed,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e), item };
  }
}

async function main() {
  log(`since=${SINCE.toISOString()} maxPerSource=${MAX_PER_SOURCE} concurrency=${CONCURRENCY}`);

  const [tc, aw, sg] = await Promise.all([
    fetchTechcrunchVentureArchive(SINCE, MAX_PER_SOURCE, log).catch((e) => {
      log(`TechCrunch archive failed: ${e}`);
      return [] as ListingItem[];
    }),
    fetchAlleywatchFundingArchive(SINCE, MAX_PER_SOURCE, log).catch((e) => {
      log(`AlleyWatch archive failed: ${e}`);
      return [] as ListingItem[];
    }),
    fetchStartupsGalleryNews(SINCE, MAX_PER_SOURCE, log).catch((e) => {
      log(`startups.gallery failed: ${e}`);
      return [] as ListingItem[];
    }),
  ]);

  log(`discovered: techcrunch=${tc.length} alleywatch=${aw.length} startups_gallery=${sg.length}`);

  const allItems = [...tc, ...aw, ...sg];
  const results = await mapWithConcurrency(allItems, CONCURRENCY, processItem);

  const ok = results.filter((r): r is BackfillRecord => !("error" in r));
  const failed = results.filter((r): r is { error: string; item: ListingItem } => "error" in r);

  log(`processed ok=${ok.length} failed=${failed.length}`);
  for (const f of failed) {
    log(`FAILED ${f.item.sourceKey} ${f.item.articleUrl}: ${f.error}`);
  }

  const replacer = (_key: string, value: unknown) => (typeof value === "bigint" ? value.toString() : value);
  writeFileSync(
    OUT,
    JSON.stringify({ since: SINCE.toISOString(), collectedAt: new Date().toISOString(), records: ok, failed }, replacer, 2),
  );
  log(`wrote ${ok.length} records to ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
