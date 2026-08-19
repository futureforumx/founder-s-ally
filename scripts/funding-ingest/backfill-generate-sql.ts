/**
 * Turns the JSON produced by `backfill-collect.ts` into batched SQL `INSERT` statements for
 * `source_articles` / `funding_deals` / `funding_deal_investors`, mirroring the exact upsert
 * semantics of `run.ts` (idempotent on `canonical_url`, cross-article dedupe on
 * company+date+round). IDs are generated client-side (uuid) so the same value can be reused
 * across the three tables within a batch without round-tripping through the DB.
 *
 * This does NOT execute anything — it only writes a `.sql` file for review before running it.
 *
 *   npx tsx scripts/funding-ingest/backfill-generate-sql.ts --in=/tmp/funding-backfill.json --out=/tmp/funding-backfill.sql
 */
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { BackfillRecord } from "./backfill-collect.js";

function argValue(name: string, def?: string): string | undefined {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.slice(name.length + 3) : def;
}

const IN = argValue("in", "/tmp/funding-backfill.json")!;
const OUT = argValue("out", "/tmp/funding-backfill.sql")!;
const DEDUPE_WINDOW_DAYS = 5;

function sqlStr(v: string | null | undefined): string {
  if (v === null || v === undefined) return "NULL";
  return `'${v.replace(/'/g, "''").replace(/\u0000/g, "")}'`;
}
function sqlArr(v: string[]): string {
  if (!v.length) return "ARRAY[]::text[]";
  return `ARRAY[${v.map((x) => sqlStr(x)).join(", ")}]::text[]`;
}
function sqlNum(v: number | null | undefined): string {
  return v === null || v === undefined || Number.isNaN(v) ? "NULL" : String(v);
}
function sqlBigint(v: string | number | bigint | null | undefined): string {
  return v === null || v === undefined ? "NULL" : `${v}::bigint`;
}
function sqlDate(iso: string | null | undefined): string {
  if (!iso) return "NULL";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "NULL";
  return `'${d.toISOString().slice(0, 10)}'::date`;
}
function sqlTimestamptz(iso: string | null | undefined): string {
  if (!iso) return "NULL";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "NULL";
  return `'${d.toISOString()}'::timestamptz`;
}
function sqlBool(v: boolean): string {
  return v ? "true" : "false";
}

const SOURCE_PRIORITY: Record<string, number> = {
  STARTUPS_GALLERY_NEWS: 3,
  TECHCRUNCH_VENTURE: 2,
  ALLEYWATCH_FUNDING: 1,
  GEEKWIRE_FUNDINGS: 1,
};

function dedupeKey(r: BackfillRecord): string | null {
  if (!r.deal.announced_date) return null;
  const d = new Date(r.deal.announced_date as unknown as string);
  if (Number.isNaN(d.getTime())) return null;
  // Bucket into 5-day windows anchored at epoch so near-boundary dates in the same window collide,
  // matching `findCrossArticleDuplicateDeal`'s +/-5 day tolerance closely enough for a one-off backfill.
  const bucket = Math.floor(d.getTime() / (DEDUPE_WINDOW_DAYS * 86_400_000));
  const round = (r.deal.round_type_normalized ?? "unknown").toLowerCase();
  return `${r.companyNameNormalized}::${round}::${bucket}`;
}

function main() {
  const data = JSON.parse(readFileSync(IN, "utf-8")) as { records: BackfillRecord[] };
  const all = data.records;

  // In-batch cross-source dedupe: keep the highest-priority source per (company, round, ~date window).
  const byKey = new Map<string, BackfillRecord>();
  const noKey: BackfillRecord[] = [];
  for (const r of all) {
    const key = dedupeKey(r);
    if (!key) {
      noKey.push(r);
      continue;
    }
    const existing = byKey.get(key);
    if (!existing || (SOURCE_PRIORITY[r.sourceKey] ?? 0) > (SOURCE_PRIORITY[existing.sourceKey] ?? 0)) {
      byKey.set(key, r);
    }
  }
  const deduped = [...byKey.values(), ...noKey];
  const skippedAsDupe = all.length - deduped.length;

  // Bulk multi-row VALUES (ids generated client-side and reused directly — no per-row subquery)
  // to keep the SQL payload as compact as possible; this is a one-off manually-executed backfill.
  const articleRows: string[] = [];
  const dealRows: string[] = [];
  const investorRows: string[] = [];

  for (const r of deduped) {
    const articleId = randomUUID();
    const dealId = randomUUID();

    articleRows.push(
      `(${[
        sqlStr(articleId),
        `${sqlStr(r.sourceKey)}::"FundingIngestSourceKey"`,
        sqlStr(r.listingUrl),
        sqlStr(r.canonicalUrl),
        sqlStr(r.articleUrl),
        sqlStr(r.title),
        sqlTimestamptz(r.publishedAt),
        `'FETCHED'::"FundingArticleFetchStatus"`,
        // Truncated (vs. `run.ts`'s 50k) to keep the manually-executed SQL batch small for this
        // one-off backfill; not used by the public feed (audit-trail only), and the original
        // `articleUrl` is always preserved for re-fetching if deeper text is ever needed.
        sqlStr((r.rawExcerpt ?? "").slice(0, 280)),
        sqlStr(r.rawText.slice(0, 280)),
        sqlStr(r.contentHash),
        sqlTimestamptz(r.fetchFailed ? null : new Date().toISOString()),
        "NULL",
        "NULL",
        "now()",
        "now()",
      ].join(",")})`,
    );

    const ex = r.deal;
    dealRows.push(
      `(${[
        sqlStr(dealId),
        sqlStr(articleId),
        "0",
        sqlStr(r.company),
        sqlStr(r.companyNameNormalized),
        sqlStr(ex.company_website),
        sqlStr(ex.company_hq),
        sqlStr(ex.round_type_raw),
        sqlStr(ex.round_type_normalized),
        sqlStr(ex.amount_raw),
        sqlBigint(ex.amount_minor_units as unknown as string | null),
        sqlStr(ex.currency || "USD"),
        sqlDate(ex.announced_date as unknown as string),
        sqlStr(ex.sector_raw),
        sqlStr(ex.sector_normalized),
        sqlArr(ex.founders_mentioned),
        sqlArr(ex.existing_investors_mentioned),
        sqlStr((ex.deal_summary ?? "").slice(0, 280) || null),
        sqlNum(ex.extraction_confidence),
        sqlStr(ex.extraction_method),
        sqlBool(r.needsReview),
        sqlStr(r.reviewReason),
        "now()",
        "now()",
      ].join(",")})`,
    );

    for (const inv of r.investors) {
      investorRows.push(
        `(${[sqlStr(randomUUID()), sqlStr(dealId), `${sqlStr(inv.role)}::"FundingDealInvestorRole"`, sqlStr(inv.name_raw), sqlStr(inv.name_normalized), sqlNum(inv.sort_order)].join(",")})`,
      );
    }
  }

  function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  const CHUNK_ROWS = parseInt(argValue("chunkRows", "9999")!, 10);
  const outDir = OUT.replace(/\.sql$/, "");

  if (CHUNK_ROWS >= 9999) {
    const lines: string[] = [];
    lines.push(`-- Generated ${new Date().toISOString()} from ${IN}`);
    lines.push(`-- ${all.length} records collected, ${skippedAsDupe} skipped as in-batch cross-source duplicates, ${deduped.length} to insert.`);
    lines.push("BEGIN;");
    lines.push(
      `INSERT INTO source_articles (id, source_key, listing_url, canonical_url, article_url, title, published_at, fetch_status, raw_excerpt, raw_text, content_hash, html_fetched_at, first_seen_run_id, last_seen_run_id, created_at, updated_at) VALUES\n` +
        articleRows.join(",\n") +
        "\nON CONFLICT (canonical_url) DO NOTHING;",
    );
    lines.push(
      `INSERT INTO funding_deals (id, source_article_id, slot_index, company_name, company_name_normalized, company_website, company_hq, round_type_raw, round_type_normalized, amount_raw, amount_minor_units, currency, announced_date, sector_raw, sector_normalized, founders_mentioned, existing_investors_mentioned, deal_summary, extraction_confidence, extraction_method, needs_review, review_reason, created_at, updated_at) VALUES\n` +
        dealRows.join(",\n") +
        "\nON CONFLICT (source_article_id, slot_index) DO NOTHING;",
    );
    lines.push(
      `INSERT INTO funding_deal_investors (id, funding_deal_id, role, name_raw, name_normalized, sort_order) VALUES\n` + investorRows.join(",\n") + ";",
    );
    lines.push("COMMIT;");
    writeFileSync(OUT, lines.join("\n") + "\n");
    // eslint-disable-next-line no-console
    console.log(`wrote ${deduped.length} deal inserts (${skippedAsDupe} in-batch dupes skipped) to ${OUT}`);
    return;
  }

  mkdirSync(outDir, { recursive: true });
  let n = 0;
  for (const group of chunk(articleRows, CHUNK_ROWS)) {
    writeFileSync(
      `${outDir}/articles-${String(n++).padStart(3, "0")}.sql`,
      `BEGIN;\nINSERT INTO source_articles (id, source_key, listing_url, canonical_url, article_url, title, published_at, fetch_status, raw_excerpt, raw_text, content_hash, html_fetched_at, first_seen_run_id, last_seen_run_id, created_at, updated_at) VALUES\n${group.join(",\n")}\nON CONFLICT (canonical_url) DO NOTHING;\nCOMMIT;\n`,
    );
  }
  n = 0;
  for (const group of chunk(dealRows, CHUNK_ROWS)) {
    writeFileSync(
      `${outDir}/deals-${String(n++).padStart(3, "0")}.sql`,
      `BEGIN;\nINSERT INTO funding_deals (id, source_article_id, slot_index, company_name, company_name_normalized, company_website, company_hq, round_type_raw, round_type_normalized, amount_raw, amount_minor_units, currency, announced_date, sector_raw, sector_normalized, founders_mentioned, existing_investors_mentioned, deal_summary, extraction_confidence, extraction_method, needs_review, review_reason, created_at, updated_at) VALUES\n${group.join(",\n")}\nON CONFLICT (source_article_id, slot_index) DO NOTHING;\nCOMMIT;\n`,
    );
  }
  n = 0;
  for (const group of chunk(investorRows, CHUNK_ROWS)) {
    writeFileSync(
      `${outDir}/investors-${String(n++).padStart(3, "0")}.sql`,
      `BEGIN;\nINSERT INTO funding_deal_investors (id, funding_deal_id, role, name_raw, name_normalized, sort_order) VALUES\n${group.join(",\n")};\nCOMMIT;\n`,
    );
  }
  // eslint-disable-next-line no-console
  console.log(
    `wrote ${deduped.length} deal inserts (${skippedAsDupe} in-batch dupes skipped) as chunked files under ${outDir}/ ` +
      `(${chunk(articleRows, CHUNK_ROWS).length} article files, ${chunk(dealRows, CHUNK_ROWS).length} deal files, ${chunk(investorRows, CHUNK_ROWS).length} investor files)`,
  );
}

main();
