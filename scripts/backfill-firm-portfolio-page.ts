/**
 * Scrape each VC firm's portfolio page and upsert company names into `firm_recent_deals`.
 *
 * Usage:
 *   npm run db:backfill:firm-portfolio-page
 *   DRY_RUN=1 npm run db:backfill:firm-portfolio-page
 *   PORTFOLIO_PAGE_FIRM_SLUG=406-ventures npm run db:backfill:firm-portfolio-page
 *   PORTFOLIO_PAGE_MAX=100 npm run db:backfill:firm-portfolio-page
 *   PORTFOLIO_PAGE_DELAY_MS=500 npm run db:backfill:firm-portfolio-page
 *   PORTFOLIO_PAGE_OVERWRITE=1 npm run db:backfill:firm-portfolio-page   # re-scrape firms that already have deals
 *
 * Requires SUPABASE_URL (or VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/loadEnvFiles";
import { resolveFirmWebsitePortfolio } from "../api/_firmWebsitePortfolio.ts";

loadEnvFiles([".env", ".env.local", ".env.enrichment"]);

const SUPA = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const DRY = ["1", "true", "yes"].includes((process.env.DRY_RUN || "").toLowerCase());
const maxRaw = (process.env.PORTFOLIO_PAGE_MAX ?? "").trim().toLowerCase();
const MAX =
  maxRaw === "0" || maxRaw === "unlimited" || maxRaw === "all"
    ? Number.POSITIVE_INFINITY
    : Math.max(1, parseInt(process.env.PORTFOLIO_PAGE_MAX || "2000", 10));
const DELAY_MS = Math.max(0, parseInt(process.env.PORTFOLIO_PAGE_DELAY_MS || "400", 10));
const FIRM_SLUG = (process.env.PORTFOLIO_PAGE_FIRM_SLUG || "").trim();
const OVERWRITE = ["1", "true", "yes"].includes((process.env.PORTFOLIO_PAGE_OVERWRITE || "").toLowerCase());
const PROGRESS_EVERY = Math.max(1, parseInt(process.env.PORTFOLIO_PAGE_PROGRESS_EVERY || "10", 10));

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

if (!SUPA || !KEY) {
  console.error("Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const sb = createClient(SUPA, KEY, { auth: { persistSession: false } });

type FirmRow = {
  id: string;
  firm_name: string | null;
  website_url: string | null;
  slug: string | null;
};

async function loadFirms(): Promise<FirmRow[]> {
  const out: FirmRow[] = [];
  let from = 0;
  const batch = 1000;
  for (;;) {
    let q = sb
      .from("firm_records")
      .select("id, firm_name, website_url, slug")
      .is("deleted_at", null)
      .not("website_url", "is", null)
      .order("firm_name")
      .range(from, from + batch - 1);
    if (FIRM_SLUG) q = q.eq("slug", FIRM_SLUG);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as FirmRow[];
    for (const r of rows) {
      const w = normalizeWebsiteUrl(r.website_url ?? "");
      if (w) out.push({ ...r, website_url: w });
    }
    if (rows.length < batch) break;
    from += batch;
  }
  return out;
}

async function getFirmsWithExistingDeals(): Promise<Set<string>> {
  const ids = new Set<string>();
  const { data } = await sb
    .from("firm_recent_deals")
    .select("firm_id");
  for (const row of (data ?? []) as Array<{ firm_id: string }>) {
    ids.add(row.firm_id);
  }
  return ids;
}

async function upsertDeals(firmId: string, companies: string[]): Promise<number> {
  if (!companies.length) return 0;

  // Fetch existing company names for this firm to avoid duplicates
  const { data: existing } = await sb
    .from("firm_recent_deals")
    .select("company_name")
    .eq("firm_id", firmId);
  const existingNames = new Set(
    (existing ?? []).map((r: { company_name: string }) => r.company_name.toLowerCase().trim())
  );

  const newCompanies = companies.filter((c) => !existingNames.has(c.toLowerCase().trim()));
  if (!newCompanies.length) return 0;

  const rows = newCompanies.map((name) => ({
    firm_id: firmId,
    company_name: name,
    stage: null as string | null,
    amount: null as string | null,
    date_announced: null as string | null,
  }));

  const { error } = await sb.from("firm_recent_deals").insert(rows);
  if (error) {
    console.warn(`  insert error for firm ${firmId}:`, error.message);
    return 0;
  }
  return rows.length;
}

async function main() {
  const firms = await loadFirms();
  if (!firms.length) {
    console.error("No firm_records with website_url" + (FIRM_SLUG ? ` (slug=${FIRM_SLUG})` : "") + ".");
    process.exit(1);
  }

  const firmsWithDeals = OVERWRITE ? new Set<string>() : await getFirmsWithExistingDeals();

  const maxLabel = Number.isFinite(MAX) ? String(MAX) : "unlimited";
  console.log(
    `[portfolio-page-backfill] start ${new Date().toISOString()} firms=${firms.length} max=${maxLabel} delay_ms=${DELAY_MS} overwrite=${OVERWRITE} dry=${DRY}`,
  );

  let processed = 0;
  let skippedHasDeals = 0;
  let withCompanies = 0;
  let zeroCompanies = 0;
  let inserted = 0;
  let failed = 0;

  for (const firm of firms) {
    if (processed >= MAX) break;

    if (!OVERWRITE && firmsWithDeals.has(firm.id)) {
      skippedHasDeals += 1;
      continue;
    }

    processed += 1;
    const label = `${processed} ${firm.firm_name ?? firm.id}`;

    if (DRY) {
      console.log(`[dry] ${label}  ${firm.website_url}`);
      if (DELAY_MS) await sleep(DELAY_MS);
      continue;
    }

    if (processed % PROGRESS_EVERY === 0) {
      console.log(
        `[portfolio-page-backfill] progress ${new Date().toISOString()} processed=${processed} with_companies=${withCompanies} zero=${zeroCompanies} inserted=${inserted} failed=${failed}`,
      );
    }

    try {
      const result = await resolveFirmWebsitePortfolio(firm.website_url!);
      const count = result.companies.length;

      if (count === 0) {
        zeroCompanies += 1;
        console.log(`— ${label}  (no portfolio companies found)  scanned=${result.scannedUrls.length}`);
      } else {
        withCompanies += 1;
        const newCount = await upsertDeals(firm.id, result.companies);
        inserted += newCount;
        console.log(
          `✓ ${label}  companies=${count} new=${newCount} source=${result.sourceUrl ?? "none"}`,
        );
      }
    } catch (e) {
      failed += 1;
      console.warn(`! ${label}`, e);
    }

    if (DELAY_MS) await sleep(DELAY_MS);
  }

  console.log(
    `[portfolio-page-backfill] done ${new Date().toISOString()} processed=${processed} skipped_has_deals=${skippedHasDeals} with_companies=${withCompanies} zero_companies=${zeroCompanies} inserted=${inserted} failed=${failed}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
