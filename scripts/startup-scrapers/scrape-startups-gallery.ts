/**
 * Startups Gallery Scraper — startups.gallery
 * =============================================
 * Scrapes the startups.gallery directory which curates startup listings.
 *
 * Uses Playwright to handle JS rendering.
 *
 * Strategy:
 *   1. Intercept API/fetch responses for structured data
 *   2. Check __NEXT_DATA__ / embedded JSON
 *   3. Broad DOM extraction: headings near links, repeated card patterns
 *   4. Detect embedded databases (Airtable, Notion)
 *   5. Crawl category pages for more listings
 *   6. Dump diagnostics when 0 results found
 *
 * For VC firm profiles (website, description, portfolio links on `firm_records` /
 * `firm_recent_deals`), use `scripts/enrich-firms-from-startups-gallery.ts` which
 * reads the gallery Framer search index + optional Playwright for "Visit Website".
 *
 * Usage:
 *   npx tsx scripts/startup-scrapers/scrape-startups-gallery.ts
 *   DRY_RUN=1 npx tsx scripts/startup-scrapers/scrape-startups-gallery.ts
 *   GALLERY_MAX=50 npx tsx scripts/startup-scrapers/scrape-startups-gallery.ts
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
const MAX_ITEMS = parseInt(process.env.GALLERY_MAX || "0", 10);
const DELAY_MS = parseInt(process.env.GALLERY_DELAY_MS || "2000", 10);
const BASE_URL = "https://startups.gallery";

type RawCompany = {
  name: string;
  url: string | null;
  description: string | null;
  category: string | null;
  logoUrl: string | null;
  tags: string[];
};

async function extractFromPage(page: Page): Promise<RawCompany[]> {
  return await page.evaluate(() => {
    const results: RawCompany[] = [];
    const skipText = new Set(["home", "about", "contact", "blog", "login", "sign up", "menu", "close", "search", "privacy", "terms", "submit", "newsletter", ""]);

    // ---- Strategy 1: Cards with headings and descriptions ----
    const containers = [
      ...document.querySelectorAll("main, [role='main'], #content, .content, #main"),
      document.body,
    ];

    for (const container of containers) {
      // Find repeating card-like elements
      const allDivs = container.querySelectorAll(
        ":scope > div > div, :scope > div > div > div, " +
        "[class*='grid'] > *, [class*='list'] > *, [class*='gallery'] > *, " +
        "article, li, [class*='card'], [class*='item'], [class*='product'], [class*='startup'], " +
        "a[href] > div"
      );

      for (const el of allDivs) {
        if ((el as HTMLElement).closest("nav, header, footer, aside")) continue;

        const heading = el.querySelector("h1, h2, h3, h4, h5, h6, strong, b");
        const name = heading?.textContent?.trim() || "";
        if (!name || name.length < 2 || name.length > 100 || skipText.has(name.toLowerCase())) continue;

        // Find associated link — either on the element itself, inside it, or parent
        let companyUrl: string | null = null;
        const parentLink = el.closest("a[href]");
        const childLink = el.querySelector("a[href^='http']:not([href*='startups.gallery']), a[href^='http']:not([href*='gallery'])");
        const anyLink = el.querySelector("a[href]");

        if (childLink) {
          companyUrl = childLink.getAttribute("href");
        } else if (parentLink) {
          const href = parentLink.getAttribute("href") || "";
          companyUrl = href.startsWith("http") ? href : href ? `https://startups.gallery${href}` : null;
        } else if (anyLink) {
          const href = anyLink.getAttribute("href") || "";
          companyUrl = href.startsWith("http") ? href : href ? `https://startups.gallery${href}` : null;
        }

        const desc = el.querySelector("p, [class*='desc'], [class*='summary'], [class*='tagline']");
        const tagEls = el.querySelectorAll("[class*='tag'], [class*='badge'], [class*='chip'], [class*='category'], span");
        const tags = Array.from(tagEls)
          .map(t => t.textContent?.trim() || "")
          .filter(t => t.length > 1 && t.length < 40 && !skipText.has(t.toLowerCase()));

        results.push({
          name,
          url: companyUrl,
          description: desc?.textContent?.trim() || null,
          category: tags[0] || null,
          logoUrl: el.querySelector("img")?.getAttribute("src") || null,
          tags,
        });
      }
      if (results.length > 3) break;
    }

    // ---- Strategy 2: Link-based extraction (internal links to detail pages) ----
    if (results.length === 0) {
      const links = document.querySelectorAll("a[href]");
      for (const link of links) {
        if ((link as HTMLElement).closest("nav, header, footer, aside")) continue;
        const href = link.getAttribute("href") || "";
        // Skip social/utility links
        if (/(twitter|linkedin|facebook|youtube|instagram|mailto:|#|javascript:)/i.test(href)) continue;
        // Look for internal detail-page patterns
        const isDetail = /^\/(startup|product|tool|app|company|listing)s?\/[^/]+$/i.test(href) ||
                         /startups\.gallery\/(startup|product|tool|app|company|listing)s?\/[^/]+$/i.test(href);
        if (!isDetail && !href.startsWith("http")) continue;

        const name = link.textContent?.trim() || "";
        if (!name || name.length < 2 || name.length > 100 || skipText.has(name.toLowerCase())) continue;
        if (name.includes("http") || name.includes("www.")) continue;

        results.push({
          name,
          url: href.startsWith("http") ? href : `https://startups.gallery${href}`,
          description: null,
          category: null,
          logoUrl: link.querySelector("img")?.getAttribute("src") || null,
          tags: [],
        });
      }
    }

    // ---- Strategy 3: All external company website links ----
    if (results.length === 0) {
      const extLinks = document.querySelectorAll("a[href^='http']");
      for (const link of extLinks) {
        if ((link as HTMLElement).closest("nav, header, footer, aside")) continue;
        const href = link.getAttribute("href") || "";
        if (/(twitter|linkedin|facebook|youtube|instagram|google|github|startups\.gallery)/i.test(href)) continue;

        const parent = link.parentElement;
        const nearby = parent?.querySelector("h1, h2, h3, h4, h5, h6, strong, b");
        const name = nearby?.textContent?.trim() || link.textContent?.trim() || "";
        if (!name || name.length < 2 || name.length > 100 || skipText.has(name.toLowerCase())) continue;
        if (/^https?:\/\//.test(name)) continue; // Skip raw URLs as names

        results.push({
          name, url: href,
          description: parent?.querySelector("p")?.textContent?.trim() || null,
          category: null,
          logoUrl: parent?.querySelector("img")?.getAttribute("src") || null,
          tags: [],
        });
      }
    }

    return results;
  });
}

async function dumpDiagnostics(page: Page): Promise<void> {
  const diag = await page.evaluate(() => {
    const title = document.title;
    const h1 = document.querySelector("h1")?.textContent?.trim() || "(no h1)";
    const links = document.querySelectorAll("a[href]").length;
    const imgs = document.querySelectorAll("img").length;
    const iframes = Array.from(document.querySelectorAll("iframe")).map(f => f.src).slice(0, 5);
    const scripts = Array.from(document.querySelectorAll("script[src]")).map(s => (s as HTMLScriptElement).src).filter(s => !s.includes("analytics") && !s.includes("gtag")).slice(0, 5);
    const bodyChildren = Array.from(document.body?.children || []).slice(0, 10).map(
      el => `<${el.tagName.toLowerCase()} class="${el.className?.toString().slice(0, 60)}">`
    );
    const bodyText = document.body?.textContent?.slice(0, 500) || "";
    return { title, h1, links, imgs, iframes, scripts, bodyChildren, bodyText };
  });
  console.log(`[gallery] DEBUG page structure:`);
  console.log(`  Title: ${diag.title}`);
  console.log(`  H1: ${diag.h1}`);
  console.log(`  Links: ${diag.links}, Imgs: ${diag.imgs}`);
  if (diag.iframes.length > 0) console.log(`  Iframes: ${diag.iframes.join(", ")}`);
  if (diag.scripts.length > 0) console.log(`  Scripts: ${diag.scripts.join(", ")}`);
  console.log(`  Body children: ${diag.bodyChildren.join(", ")}`);
  console.log(`  Body text preview: ${diag.bodyText.slice(0, 200)}...`);
}

async function scrape(): Promise<void> {
  const stats = new ScrapeStats("StartupsGallery");
  const progress = new ScrapeProgress("startups-gallery");

  console.log(`[gallery] Starting scrape (DRY_RUN=${DRY_RUN}, MAX=${MAX_ITEMS || "all"})`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  // Intercept API/fetch responses for structured data
  const apiData: any[] = [];
  page.on("response", async (response) => {
    const url = response.url();
    const ct = response.headers()["content-type"] || "";
    if (response.status() === 200 && (ct.includes("json") || url.includes("/api/"))) {
      try {
        const json = await response.json();
        // Try to find arrays of objects that look like companies
        const candidates = [
          json?.data, json?.startups, json?.items, json?.results, json?.products,
          json?.tools, json?.listings, json?.companies, json,
        ];
        for (const c of candidates) {
          if (Array.isArray(c) && c.length > 2 && (c[0]?.name || c[0]?.title || c[0]?.company_name)) {
            apiData.push(...c);
            break;
          }
        }
      } catch { /* not JSON */ }
    }
  });

  try {
    // Try multiple URL patterns
    const urlsToTry = [
      BASE_URL,
      `${BASE_URL}/all`,
      `${BASE_URL}/startups`,
      `${BASE_URL}/tools`,
      `${BASE_URL}/products`,
    ];

    let loaded = false;
    for (const url of urlsToTry) {
      try {
        const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        if (resp && resp.status() < 400) {
          loaded = true;
          console.log(`[gallery] Loaded: ${url}`);
          break;
        }
      } catch { continue; }
    }
    if (!loaded) {
      console.error(`[gallery] Could not load any URL variant`);
      return;
    }

    await sleep(3000);

    // Scroll to trigger lazy loading
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await sleep(600);
    }

    // Click load-more / pagination
    for (let i = 0; i < 20; i++) {
      const btn = await page.$(
        "button:has-text('Load'), button:has-text('More'), button:has-text('Show'), button:has-text('Next'), " +
        "a:has-text('Next'), a:has-text('Load More'), [class*='load-more'], [class*='pagination'] a:last-child"
      );
      if (!btn) break;
      try {
        await btn.click();
        await sleep(DELAY_MS);
      } catch { break; }
      if (MAX_ITEMS && apiData.length >= MAX_ITEMS) break;
    }

    // Check __NEXT_DATA__
    const nextData = await page.evaluate(() => {
      const el = document.getElementById("__NEXT_DATA__");
      if (!el) return null;
      try { return JSON.parse(el.textContent || ""); } catch { return null; }
    });

    // Check for embedded JSON in script tags (common for Webflow/static sites)
    const embeddedData = await page.evaluate(() => {
      const scripts = document.querySelectorAll("script:not([src])");
      for (const script of scripts) {
        const text = script.textContent || "";
        if (text.length < 100 || text.length > 5_000_000) continue;
        // Look for JSON arrays that contain objects with name-like fields
        const jsonMatch = text.match(/\[[\s\S]*?"name"\s*:/);
        if (jsonMatch) {
          try {
            // Try to extract the JSON array
            const startIdx = text.indexOf("[");
            let depth = 0;
            let endIdx = startIdx;
            for (let i = startIdx; i < text.length; i++) {
              if (text[i] === "[") depth++;
              else if (text[i] === "]") { depth--; if (depth === 0) { endIdx = i + 1; break; } }
            }
            const parsed = JSON.parse(text.slice(startIdx, endIdx));
            if (Array.isArray(parsed) && parsed.length > 2 && (parsed[0]?.name || parsed[0]?.title)) {
              return parsed;
            }
          } catch { /* not valid JSON */ }
        }
      }
      return null;
    });

    let allCompanies: RawCompany[];

    if (apiData.length > 0) {
      console.log(`[gallery] Got ${apiData.length} from API interception`);
      allCompanies = apiData.map((d: any) => ({
        name: d.name || d.title || d.company_name || "",
        url: d.url || d.website || d.link || null,
        description: d.description || d.tagline || d.summary || null,
        category: d.category || d.type || null,
        logoUrl: d.logo || d.image || d.thumbnail || d.logo_url || d.image_url || null,
        tags: d.tags || d.categories || [],
      }));
    } else if (embeddedData) {
      console.log(`[gallery] Got ${embeddedData.length} from embedded JSON`);
      allCompanies = embeddedData.map((d: any) => ({
        name: d.name || d.title || "",
        url: d.url || d.website || null,
        description: d.description || d.tagline || null,
        category: d.category || null,
        logoUrl: d.logo || d.image || null,
        tags: d.tags || [],
      }));
    } else if (nextData?.props?.pageProps) {
      const pp = nextData.props.pageProps;
      // Recursively search for arrays of company-like objects
      function findArray(obj: any, depth = 0): any[] | null {
        if (depth > 4 || !obj) return null;
        if (Array.isArray(obj) && obj.length > 2 && (obj[0]?.name || obj[0]?.title)) return obj;
        if (typeof obj === "object") {
          for (const val of Object.values(obj)) {
            const found = findArray(val, depth + 1);
            if (found) return found;
          }
        }
        return null;
      }
      const arr = findArray(pp);
      if (arr) {
        console.log(`[gallery] Got ${arr.length} from __NEXT_DATA__`);
        allCompanies = arr.map((d: any) => ({
          name: d.name || d.title || "",
          url: d.url || d.website || null,
          description: d.description || null,
          category: d.category || null,
          logoUrl: d.logo || d.image || null,
          tags: d.tags || [],
        }));
      } else {
        allCompanies = await extractFromPage(page);
      }
    } else {
      // DOM extraction
      const domCompanies = await extractFromPage(page);
      console.log(`[gallery] Got ${domCompanies.length} from DOM`);
      allCompanies = domCompanies;
    }

    if (allCompanies.length === 0) {
      console.warn(`[gallery] WARNING: 0 companies found — dumping diagnostics`);
      await dumpDiagnostics(page);
    }

    // Also crawl category/browse pages for more results
    if (allCompanies.length < 10) {
      const categoryLinks = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("a[href]"))
          .map(a => a.getAttribute("href") || "")
          .filter(h => /(categor|tag|browse|explore|sector|industr)/i.test(h))
          .filter(h => !h.includes("#"))
          .map(h => h.startsWith("http") ? h : `https://startups.gallery${h}`)
          .slice(0, 8);
      });
      if (categoryLinks.length > 0) {
        console.log(`[gallery] Discovered ${categoryLinks.length} category pages, crawling...`);
      }
      for (const catUrl of categoryLinks) {
        if (MAX_ITEMS && allCompanies.length >= MAX_ITEMS) break;
        try {
          await page.goto(catUrl, { waitUntil: "networkidle", timeout: 20000 });
          await sleep(1500);
          for (let i = 0; i < 5; i++) {
            await page.evaluate(() => window.scrollBy(0, window.innerHeight));
            await sleep(400);
          }
          const catCompanies = await extractFromPage(page);
          allCompanies.push(...catCompanies);
        } catch { /* skip */ }
        await sleep(DELAY_MS);
      }
    }

    // Deduplicate
    const seen = new Set<string>();
    const unique = allCompanies.filter((c) => {
      if (!c.name) return false;
      const key = c.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const items = MAX_ITEMS ? unique.slice(0, MAX_ITEMS) : unique;
    console.log(`[gallery] Processing ${items.length} unique companies`);

    for (const company of items) {
      if (progress.isDone(company.name)) {
        stats.recordSkip();
        continue;
      }

      const payload: StartupIngestPayload = {
        company_name: company.name,
        data_source: "startups_gallery",
        company_url: company.url,
        domain: normalizeDomain(company.url),
        description_short: company.description,
        logo_url: company.logoUrl,
        market_category: company.category,
        secondary_sectors: company.tags.length > 0 ? company.tags : undefined,
        external_ids: { startups_gallery_url: company.url || "" },
      };

      if (DRY_RUN) {
        console.log(`[gallery] [DRY] Would upsert: ${company.name}`);
        stats.recordSkip();
      } else {
        try {
          const result = await upsertStartup(sb, payload);
          stats.record(result);
          progress.markDone(company.name);
        } catch (err) {
          console.error(`[gallery] Error upserting ${company.name}: ${err instanceof Error ? err.message : err}`);
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
    console.error("[gallery] Fatal:", err);
    process.exit(1);
  })
  // done;
