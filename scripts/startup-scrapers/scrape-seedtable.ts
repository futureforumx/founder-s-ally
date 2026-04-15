/**
 * SeedTable Scraper — seedtable.com
 * ===================================
 * Scrapes multiple SeedTable list pages for startup data.
 * Uses Playwright since the site may block plain HTTP and uses JS rendering.
 *
 * Strategy:
 *   1. Crawl multiple known list pages (best-apps, by-country, etc.)
 *   2. Use broad DOM extraction (table rows, cards, divs-with-links)
 *   3. Fall back to extracting ALL internal links to company detail pages
 *   4. Optionally visit detail pages for richer data
 *   5. Dump page structure diagnostics when 0 results found
 *
 * Usage:
 *   npx tsx scripts/startup-scrapers/scrape-seedtable.ts
 *   DRY_RUN=1 npx tsx scripts/startup-scrapers/scrape-seedtable.ts
 *   SEEDTABLE_MAX=10 npx tsx scripts/startup-scrapers/scrape-seedtable.ts
 */

import { chromium, type Page } from "@playwright/test";
import {
  upsertStartup,
  normalizeDomain,
  ScrapeProgress,
  ScrapeStats,
  sleep,
  type StartupIngestPayload,
} from "../lib/startupScraper";

import { initSupabase } from "../lib/startupScraper";
const sb = initSupabase();

const DRY_RUN = process.env.DRY_RUN === "1";
const MAX_ITEMS = parseInt(process.env.SEEDTABLE_MAX || "0", 10);
const DELAY_MS = parseInt(process.env.SEEDTABLE_DELAY_MS || "2000", 10);

// Multiple list pages to scrape — SeedTable has many curated lists
const LIST_URLS = [
  "https://www.seedtable.com/best-apps-startups",
  "https://www.seedtable.com/startups-uk",
  "https://www.seedtable.com/startups-germany",
  "https://www.seedtable.com/startups-france",
  "https://www.seedtable.com/startups-netherlands",
  "https://www.seedtable.com/startups-sweden",
  "https://www.seedtable.com/startups-spain",
  "https://www.seedtable.com/startups-ireland",
  "https://www.seedtable.com/startups-india",
  "https://www.seedtable.com/fintech-startups",
  "https://www.seedtable.com/ai-startups",
  "https://www.seedtable.com/saas-startups",
  "https://www.seedtable.com/healthtech-startups",
  "https://www.seedtable.com/climate-startups",
  "https://www.seedtable.com/cybersecurity-startups",
];

type RawCompany = {
  name: string;
  url: string | null;
  description: string | null;
  location: string | null;
  funding: string | null;
  category: string | null;
  foundedYear: string | null;
  logoUrl: string | null;
  sourceList: string;
};

/**
 * Broad extraction function — tries multiple DOM strategies.
 * Returns companies found on the current page.
 */
async function extractFromPage(page: Page, sourceList: string): Promise<RawCompany[]> {
  return await page.evaluate((src: string) => {
    const results: RawCompany[] = [];
    const skipText = new Set(["home", "about", "contact", "blog", "login", "sign up", "menu", "close", "search", "privacy", "terms", ""]);

    // ---- Strategy 1: Table rows ----
    const tables = document.querySelectorAll("table");
    for (const table of tables) {
      const rows = table.querySelectorAll("tbody tr, tr");
      for (const row of rows) {
        const cells = row.querySelectorAll("td, th");
        if (cells.length < 2) continue;
        const firstLink = row.querySelector("a");
        const name = (firstLink?.textContent || cells[0]?.textContent || "").trim();
        if (!name || name.length < 2 || name.length > 100 || skipText.has(name.toLowerCase())) continue;
        const href = firstLink?.getAttribute("href") || null;
        results.push({
          name,
          url: href?.startsWith("http") ? href : href ? `https://www.seedtable.com${href}` : null,
          description: cells[1]?.textContent?.trim() || null,
          location: Array.from(cells).find(c => /country|location|hq/i.test(c.className || ""))?.textContent?.trim() || null,
          funding: Array.from(cells).find(c => /fund|raised|amount/i.test(c.textContent || ""))?.textContent?.trim() || null,
          category: null,
          foundedYear: null,
          logoUrl: row.querySelector("img")?.getAttribute("src") || null,
          sourceList: src,
        });
      }
    }
    if (results.length > 5) return results;

    // ---- Strategy 2: Any repeating element pattern with a heading + link ----
    // Look for the most common parent that contains multiple child elements with headings
    const containers = [
      ...document.querySelectorAll("main, [role='main'], #content, .content, #main"),
      document.body,
    ];
    for (const container of containers) {
      // Find all direct children or grid/list children that repeat
      const children = container.querySelectorAll(
        ":scope > div, :scope > article, :scope > li, :scope > section, " +
        ".grid > div, .list > div, ul > li, ol > li, " +
        "[class*='grid'] > div, [class*='list'] > div, [class*='row'] > div"
      );
      if (children.length < 3) continue; // Need at least 3 repeating elements

      for (const child of children) {
        if (child.closest("nav, header, footer, aside")) continue;
        // Must contain at least a heading or bold text or link
        const heading = child.querySelector("h1, h2, h3, h4, h5, h6, strong, b, a");
        if (!heading) continue;
        const name = heading.textContent?.trim() || "";
        if (!name || name.length < 2 || name.length > 100 || skipText.has(name.toLowerCase())) continue;

        const linkEl = child.querySelector("a[href]");
        const href = linkEl?.getAttribute("href") || null;
        const extLink = child.querySelector("a[href^='http']:not([href*='seedtable'])");
        const companyUrl = extLink?.getAttribute("href") || null;

        results.push({
          name,
          url: companyUrl || (href?.startsWith("http") ? href : href ? `https://www.seedtable.com${href}` : null),
          description: child.querySelector("p, span:not(:first-child)")?.textContent?.trim() || null,
          location: null,
          funding: null,
          category: null,
          foundedYear: null,
          logoUrl: child.querySelector("img")?.getAttribute("src") || null,
          sourceList: src,
        });
      }
      if (results.length > 3) break;
    }
    if (results.length > 5) return results;

    // ---- Strategy 3: All internal links that look like company detail pages ----
    const links = document.querySelectorAll("a[href]");
    const linkCompanies: RawCompany[] = [];
    for (const link of links) {
      if ((link as HTMLElement).closest("nav, header, footer")) continue;
      const href = link.getAttribute("href") || "";
      // SeedTable detail page patterns: /startups/name, /company/name, /startup/name
      const isDetailPage = /^\/(startup|company|startups|companies)\/[^/]+$/i.test(href) ||
                           /seedtable\.com\/(startup|company|startups|companies)\/[^/]+$/i.test(href);
      if (!isDetailPage) continue;
      const name = link.textContent?.trim() || "";
      if (!name || name.length < 2 || name.length > 100 || skipText.has(name.toLowerCase())) continue;
      linkCompanies.push({
        name,
        url: href.startsWith("http") ? href : `https://www.seedtable.com${href}`,
        description: null, location: null, funding: null, category: null, foundedYear: null, logoUrl: null,
        sourceList: src,
      });
    }
    if (linkCompanies.length > 0) return [...results, ...linkCompanies];

    // ---- Strategy 4: All external links (company websites) near headings ----
    const externalLinks = document.querySelectorAll("a[href^='http']:not([href*='seedtable']):not([href*='twitter']):not([href*='linkedin']):not([href*='facebook']):not([href*='youtube'])");
    for (const el of externalLinks) {
      if ((el as HTMLElement).closest("nav, header, footer, aside")) continue;
      const href = el.getAttribute("href") || "";
      if (href.includes("google.com") || href.includes("apple.com/app") || href.includes("play.google.com")) continue;
      // Get the name from the link text or nearby heading
      const parent = el.parentElement;
      const nearHeading = parent?.querySelector("h1, h2, h3, h4, h5, h6, strong, b");
      const name = nearHeading?.textContent?.trim() || el.textContent?.trim() || "";
      if (!name || name.length < 2 || name.length > 100 || skipText.has(name.toLowerCase())) continue;
      if (name.includes("http") || name.includes("www")) continue; // Skip raw URLs as names

      results.push({
        name,
        url: href,
        description: parent?.querySelector("p")?.textContent?.trim() || null,
        location: null, funding: null, category: null, foundedYear: null,
        logoUrl: parent?.querySelector("img")?.getAttribute("src") || null,
        sourceList: src,
      });
    }

    return results;
  }, sourceList);
}

/**
 * Dump diagnostic info when no results are found.
 */
async function dumpDiagnostics(page: Page, label: string): Promise<void> {
  const diag = await page.evaluate(() => {
    const title = document.title;
    const h1 = document.querySelector("h1")?.textContent?.trim() || "(no h1)";
    const tables = document.querySelectorAll("table").length;
    const links = document.querySelectorAll("a[href]").length;
    const divs = document.querySelectorAll("div").length;
    const imgs = document.querySelectorAll("img").length;
    const articles = document.querySelectorAll("article").length;
    const bodyText = document.body?.textContent?.slice(0, 500) || "";
    // Check for iframes (Airtable/Notion embeds)
    const iframes = Array.from(document.querySelectorAll("iframe")).map(f => f.src).slice(0, 5);
    // Top-level structure
    const bodyChildren = Array.from(document.body?.children || []).slice(0, 10).map(
      el => `<${el.tagName.toLowerCase()} class="${el.className?.toString().slice(0, 60)}">`
    );
    return { title, h1, tables, links, divs, imgs, articles, iframes, bodyChildren, bodyText };
  });
  console.log(`[seedtable] DEBUG ${label}:`);
  console.log(`  Title: ${diag.title}`);
  console.log(`  H1: ${diag.h1}`);
  console.log(`  Tables: ${diag.tables}, Links: ${diag.links}, Divs: ${diag.divs}, Imgs: ${diag.imgs}, Articles: ${diag.articles}`);
  if (diag.iframes.length > 0) console.log(`  Iframes: ${diag.iframes.join(", ")}`);
  console.log(`  Body children: ${diag.bodyChildren.join(", ")}`);
  console.log(`  Body text preview: ${diag.bodyText.slice(0, 200)}...`);
}

async function scrape(): Promise<void> {
  const stats = new ScrapeStats("SeedTable");
  const progress = new ScrapeProgress("seedtable");

  console.log(`[seedtable] Starting scrape (DRY_RUN=${DRY_RUN}, MAX=${MAX_ITEMS || "all"})`);
  console.log(`[seedtable] Will crawl ${LIST_URLS.length} list pages`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  try {
    const allCompanies: RawCompany[] = [];
    const seen = new Set<string>();

    for (const listUrl of LIST_URLS) {
      if (MAX_ITEMS && allCompanies.length >= MAX_ITEMS) break;

      const listName = listUrl.split("/").pop() || listUrl;
      console.log(`[seedtable] Crawling: ${listName}`);

      try {
        await page.goto(listUrl, { waitUntil: "networkidle", timeout: 30000 });
        await sleep(2000);

        // Scroll to trigger lazy loading
        for (let i = 0; i < 10; i++) {
          await page.evaluate(() => window.scrollBy(0, window.innerHeight));
          await sleep(500);
        }

        const companies = await extractFromPage(page, listName);
        console.log(`[seedtable] Found ${companies.length} companies on ${listName}`);

        if (companies.length === 0) {
          await dumpDiagnostics(page, listName);
        }

        // Deduplicate as we go
        for (const c of companies) {
          const key = c.name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          allCompanies.push(c);
        }
      } catch (err) {
        console.warn(`[seedtable] Failed to load ${listName}: ${err instanceof Error ? err.message : err}`);
      }

      await sleep(DELAY_MS);
    }

    // Also discover more list pages from the site's navigation
    try {
      await page.goto("https://www.seedtable.com", { waitUntil: "networkidle", timeout: 30000 });
      await sleep(1000);
      const navLinks = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("a[href]"))
          .map(a => a.getAttribute("href") || "")
          .filter(h => h.includes("startups") || h.includes("startup") || h.includes("best-"))
          .filter(h => !h.includes("#") && !h.includes("?"))
          .map(h => h.startsWith("http") ? h : `https://www.seedtable.com${h}`);
      });
      const extraUrls = [...new Set(navLinks)].filter(u => !LIST_URLS.includes(u)).slice(0, 10);
      if (extraUrls.length > 0) {
        console.log(`[seedtable] Discovered ${extraUrls.length} additional list pages from nav`);
        for (const url of extraUrls) {
          if (MAX_ITEMS && allCompanies.length >= MAX_ITEMS) break;
          const listName = url.split("/").pop() || url;
          try {
            await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
            await sleep(1500);
            for (let i = 0; i < 5; i++) {
              await page.evaluate(() => window.scrollBy(0, window.innerHeight));
              await sleep(400);
            }
            const companies = await extractFromPage(page, listName);
            for (const c of companies) {
              const key = c.name.toLowerCase();
              if (seen.has(key)) continue;
              seen.add(key);
              allCompanies.push(c);
            }
            console.log(`[seedtable] ${listName}: +${companies.length} (total: ${allCompanies.length})`);
          } catch { /* skip */ }
          await sleep(DELAY_MS);
        }
      }
    } catch { /* nav crawl failed, continue with what we have */ }

    const items = MAX_ITEMS ? allCompanies.slice(0, MAX_ITEMS) : allCompanies;
    console.log(`[seedtable] Processing ${items.length} unique companies total`);

    function parseFunding(s: string | null): number | null {
      if (!s) return null;
      const m = String(s).replace(/,/g, "").match(/[\$€£]?([\d.]+)\s*(B|M|K|billion|million|thousand)?/i);
      if (!m) return null;
      let val = parseFloat(m[1]!);
      const unit = (m[2] || "").toUpperCase();
      if (unit === "B" || unit === "BILLION") val *= 1_000_000_000;
      else if (unit === "M" || unit === "MILLION") val *= 1_000_000;
      else if (unit === "K" || unit === "THOUSAND") val *= 1_000;
      return val;
    }

    for (const company of items) {
      if (progress.isDone(company.name)) {
        stats.recordSkip();
        continue;
      }

      // Try to extract country from the list name
      let country: string | null = company.location;
      if (!country && company.sourceList) {
        const m = company.sourceList.match(/startups?-(\w+)/i);
        if (m) {
          const c = m[1]!;
          country = c.charAt(0).toUpperCase() + c.slice(1);
        }
      }

      const payload: StartupIngestPayload = {
        company_name: company.name,
        data_source: "seedtable",
        company_url: company.url,
        domain: normalizeDomain(company.url),
        description_short: company.description,
        logo_url: company.logoUrl,
        hq_country: country,
        founded_year: company.foundedYear ? parseInt(company.foundedYear, 10) || null : null,
        total_raised_usd: parseFunding(company.funding),
        market_category: company.category,
        external_ids: { seedtable_list: company.sourceList || "" },
      };

      if (DRY_RUN) {
        console.log(`[seedtable] [DRY] Would upsert: ${company.name}`);
        stats.recordSkip();
      } else {
        try {
          const result = await upsertStartup(sb, payload);
          stats.record(result);
          progress.markDone(company.name);
          if ((stats.created + stats.updated) % 25 === 0) {
            console.log(`[seedtable] Progress: ${stats.created} created, ${stats.updated} updated`);
          }
        } catch (err) {
          console.error(`[seedtable] Error upserting ${company.name}: ${err instanceof Error ? err.message : err}`);
          stats.recordError();
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log(stats.summary());
}

scrape()
  .catch((err) => {
    console.error("[seedtable] Fatal:", err);
    process.exit(1);
  })
  // done;
