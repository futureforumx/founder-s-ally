/**
 * YC Companies Scraper — ycombinator.com/companies
 * ==================================================
 * Scrapes YC company directory. YC's directory is a React app backed by Algolia.
 *
 * Strategy:
 *   1. Fetch company slugs from the sitemap (public, robots-safe)
 *   2. For each slug, fetch the company page and extract structured data
 *      from the embedded JSON/HTML (name, description, batch, status,
 *      founders, location, sector, website, etc.)
 *
 * This complements the existing seed-yc-professionals.ts which focuses
 * on founders; this script captures company-level data.
 *
 * Usage:
 *   npx tsx scripts/startup-scrapers/scrape-yc-companies.ts
 *   DRY_RUN=1 npx tsx scripts/startup-scrapers/scrape-yc-companies.ts
 *   YC_COMPANIES_MAX=50 npx tsx scripts/startup-scrapers/scrape-yc-companies.ts
 *   YC_COMPANIES_CONCURRENCY=4 npx tsx scripts/startup-scrapers/scrape-yc-companies.ts
 */

import { execFileSync } from "node:child_process";
import {
  upsertStartup,
  normalizeDomain,
  ScrapeProgress,
  ScrapeStats,
  sleep,
  type StartupIngestPayload,
  type FounderIngestPayload,
} from "../lib/startupScraper";

// Supabase client (REST API — no DATABASE_URL needed)
import { initSupabase } from "../lib/startupScraper";
const sb = initSupabase();

const DRY_RUN = process.env.DRY_RUN === "1";
const MAX_ITEMS = parseInt(process.env.YC_COMPANIES_MAX || "0", 10);
const DELAY_MS = parseInt(process.env.YC_COMPANIES_DELAY_MS || "200", 10);
const CONCURRENCY = parseInt(process.env.YC_COMPANIES_CONCURRENCY || "4", 10);
const SITEMAP_URL = "https://www.ycombinator.com/companies/sitemap";

const YC_FETCH_UA =
  process.env.YC_FETCH_USER_AGENT?.trim() ||
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const SKIP_SLUGS = new Set([
  "industry", "batch", "sitemap", "_metadata", "featured",
  "breakthrough", "black-founders", "hispanic-latino-founders",
  "women-founders", "founders-you-may-know", "top-companies",
]);

// ---------------------------------------------------------------------------
// HTTP helpers (match the pattern in seed-yc-professionals.ts)
// ---------------------------------------------------------------------------

function fetchTextViaCurl(url: string): string {
  return execFileSync("curl", ["-sS", "-L", "-A", YC_FETCH_UA, url], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": YC_FETCH_UA,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
  });
  if (res.ok) return res.text();
  if (process.env.YC_FETCH_DISABLE_CURL === "1") {
    throw new Error(`GET ${url} → ${res.status}`);
  }
  try {
    return fetchTextViaCurl(url);
  } catch (e) {
    throw new Error(`GET ${url} → ${res.status} (fetch); curl fallback: ${e instanceof Error ? e.message : e}`);
  }
}

// ---------------------------------------------------------------------------
// Sitemap parsing
// ---------------------------------------------------------------------------

function parseSlugsFromSitemap(xml: string): string[] {
  const re = /<loc>https:\/\/www\.ycombinator\.com\/companies\/([^<]+)<\/loc>/g;
  const slugs: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const slug = decodeURIComponent(m[1]!).split("?")[0]!.split("#")[0]!;
    if (!SKIP_SLUGS.has(slug) && slug.length > 1 && !slug.includes("/")) {
      slugs.push(slug);
    }
  }
  return [...new Set(slugs)];
}

// ---------------------------------------------------------------------------
// Company page parsing
// ---------------------------------------------------------------------------

type YCCompanyData = {
  name: string;
  slug: string;
  batch?: string;
  status?: string;
  description?: string;
  longDescription?: string;
  website?: string;
  location?: string;
  teamSize?: number;
  sector?: string;
  tags?: string[];
  founders?: Array<{ name: string; title?: string; linkedin?: string }>;
  logoUrl?: string;
};

function parseCompanyPage(html: string, slug: string): YCCompanyData | null {
  const data: YCCompanyData = { name: "", slug };

  // Try to extract from __NEXT_DATA__ JSON (most reliable)
  const nextDataMatch = html.match(/<script\s+id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (nextDataMatch) {
    try {
      const nd = JSON.parse(nextDataMatch[1]!);
      const pp = nd?.props?.pageProps;
      const company = pp?.company || pp?.startup || pp;
      if (company?.name) {
        data.name = company.name;
        data.batch = company.batch || company.ycBatch || null;
        data.status = company.status || null;
        data.description = company.one_liner || company.tagline || company.short_description || null;
        data.longDescription = company.long_description || company.description || null;
        data.website = company.website || company.url || null;
        data.location = company.location || company.city || null;
        data.teamSize = company.team_size || company.num_employees || null;
        data.sector = company.industry || company.vertical || null;
        data.tags = company.tags || company.industries || [];
        data.logoUrl = company.image_url || company.small_logo_thumb_url || company.logo_url || null;

        if (company.founders && Array.isArray(company.founders)) {
          data.founders = company.founders.map((f: any) => ({
            name: f.full_name || f.name || `${f.first_name || ""} ${f.last_name || ""}`.trim(),
            title: f.title || null,
            linkedin: f.linkedin_url || f.linkedin || null,
          }));
        }
        return data;
      }
    } catch { /* parse failed, fall through to regex */ }
  }

  // Fallback: regex parsing from meta tags and HTML
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
  const name = titleMatch?.[1]?.replace(/\s*[|–-]\s*Y Combinator.*$/, "").trim();
  if (!name) return null;
  data.name = name;

  // Meta description
  const metaDesc = html.match(/<meta\s+(?:name|property)="(?:og:)?description"\s+content="([^"]+)"/);
  data.description = metaDesc?.[1]?.trim() || null;

  // Batch — typically shown as "S21", "W22", etc.
  const batchMatch = html.match(/\b([SWF]\d{2})\b/);
  data.batch = batchMatch?.[1] || null;

  // Logo from og:image
  const ogImage = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
  data.logoUrl = ogImage?.[1] || null;

  // Website — look for external link
  const websiteMatch = html.match(/href="(https?:\/\/(?!www\.ycombinator\.com)[^"]+)"\s*(?:target="_blank"|rel="noopener")/);
  data.website = websiteMatch?.[1] || null;

  // Founders — look for "Founders:" section or structured data
  const founderSection = html.match(/(?:Founders?|Team)[\s:]+([^<]{5,200})/i);
  if (founderSection) {
    data.founders = founderSection[1]!
      .split(/[,&]/)
      .map((s) => s.trim())
      .filter((s) => s.length > 2 && s.length < 60)
      .map((name) => ({ name }));
  }

  return data;
}

// ---------------------------------------------------------------------------
// Main scrape
// ---------------------------------------------------------------------------

async function scrape(): Promise<void> {
  const stats = new ScrapeStats("YC Companies");
  const progress = new ScrapeProgress("yc-companies");

  console.log(`[yc] Starting scrape (DRY_RUN=${DRY_RUN}, MAX=${MAX_ITEMS || "all"}, CONCURRENCY=${CONCURRENCY})`);

  // Step 1: Fetch sitemap
  console.log("[yc] Fetching sitemap...");
  let slugs: string[];
  try {
    const xml = await fetchText(SITEMAP_URL);
    slugs = parseSlugsFromSitemap(xml);
    console.log(`[yc] Found ${slugs.length} company slugs in sitemap`);
  } catch (err) {
    console.error(`[yc] Failed to fetch sitemap: ${err instanceof Error ? err.message : err}`);
    console.log("[yc] Trying cached slugs from progress file...");
    slugs = progress.get<string[]>("cachedSlugs", []);
    if (slugs.length === 0) {
      console.error("[yc] No cached slugs available. Exiting.");
      return;
    }
  }

  // Cache slugs for resume
  if (slugs.length > 0) {
    progress.set("cachedSlugs", slugs);
  }

  const items = MAX_ITEMS ? slugs.slice(0, MAX_ITEMS) : slugs;
  console.log(`[yc] Will process ${items.length} companies`);

  // Step 2: Fetch each company page with concurrency control
  let processed = 0;
  const pending: Promise<void>[] = [];

  for (const slug of items) {
    if (progress.isDone(slug)) {
      stats.recordSkip();
      processed++;
      continue;
    }

    const task = (async () => {
      await sleep(DELAY_MS);
      const url = `https://www.ycombinator.com/companies/${slug}`;
      try {
        const html = await fetchText(url);
        const company = parseCompanyPage(html, slug);
        if (!company || !company.name) {
          console.warn(`[yc] No data found for slug: ${slug}`);
          stats.recordSkip();
          return;
        }

        const founders: FounderIngestPayload[] = (company.founders || []).map((f) => ({
          full_name: f.name,
          role: f.title || "Founder",
          linkedin_url: f.linkedin,
        }));

        const payload: StartupIngestPayload = {
          company_name: company.name,
          data_source: "yc",
          company_url: company.website,
          domain: normalizeDomain(company.website),
          description_short: company.description,
          description_long: company.longDescription,
          logo_url: company.logoUrl,
          hq_country: company.location,
          headcount: company.teamSize,
          stage: company.batch ? "SEED" : undefined,
          status: company.status === "Active" ? "ACTIVE"
            : company.status === "Acquired" ? "ACQUIRED"
            : company.status === "Inactive" ? "SHUT_DOWN"
            : undefined,
          market_category: company.sector,
          secondary_sectors: company.tags,
          yc_batch: company.batch,
          yc_slug: slug,
          founders: founders.length > 0 ? founders : undefined,
          external_ids: { yc_slug: slug },
        };

        if (DRY_RUN) {
          console.log(`[yc] [DRY] Would upsert: ${company.name} (${slug})`);
          stats.recordSkip();
        } else {
          const result = await upsertStartup(sb, payload);
          stats.record(result);
          progress.markDone(slug);
        }
      } catch (err) {
        console.error(`[yc] Error processing ${slug}: ${err instanceof Error ? err.message : err}`);
        stats.recordError();
      }

      processed++;
      if (processed % 100 === 0) {
        console.log(`[yc] Progress: ${processed}/${items.length} (${stats.created} created, ${stats.updated} updated, ${stats.errors} errors)`);
      }
    })();

    pending.push(task);
    if (pending.length >= CONCURRENCY) {
      await Promise.all(pending);
      pending.length = 0;
    }
  }

  if (pending.length > 0) {
    await Promise.all(pending);
  }

  console.log(stats.summary());
}

scrape()
  .catch((err) => {
    console.error("[yc] Fatal:", err);
    process.exit(1);
  })
  // done;
