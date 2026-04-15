/**
 * TinyTeams Scraper — tinyteams.xyz
 * ===================================
 * Scrapes tinyteams.xyz which lists small, profitable startups.
 *
 * Strategy:
 *   1. Intercept API/fetch responses
 *   2. Check __NEXT_DATA__, embedded JSON, Webflow CMS data
 *   3. Broad DOM extraction (repeating elements with headings)
 *   4. External link extraction as fallback
 *   5. Diagnostics dump when 0 results
 *
 * Usage:
 *   npx tsx scripts/startup-scrapers/scrape-tinyteams.ts
 *   DRY_RUN=1 npx tsx scripts/startup-scrapers/scrape-tinyteams.ts
 *   TINYTEAMS_MAX=20 npx tsx scripts/startup-scrapers/scrape-tinyteams.ts
 */

import { chromium, type Page } from "@playwright/test";
import {
  upsertStartup,
  normalizeDomain,
  ScrapeProgress,
  ScrapeStats,
  sleep,
  type StartupIngestPayload,
  type FounderIngestPayload,
} from "../lib/startupScraper";

import { initSupabase } from "../lib/startupScraper";
const sb = initSupabase();

const DRY_RUN = process.env.DRY_RUN === "1";
const MAX_ITEMS = parseInt(process.env.TINYTEAMS_MAX || "0", 10);
const DELAY_MS = parseInt(process.env.TINYTEAMS_DELAY_MS || "2000", 10);
const BASE_URL = "https://tinyteams.xyz";

type RawCompany = {
  name: string;
  url: string | null;
  description: string | null;
  teamSize: string | null;
  revenue: string | null;
  category: string | null;
  founder: string | null;
  logoUrl: string | null;
};

async function extractFromPage(page: Page): Promise<RawCompany[]> {
  return await page.evaluate(() => {
    const results: RawCompany[] = [];
    const skipText = new Set(["home", "about", "contact", "blog", "login", "sign up", "menu", "close", "search", "privacy", "terms", "submit", ""]);
    const seenNames = new Set<string>();

    // ---- Strategy 1: Table-based ----
    const tables = document.querySelectorAll("table");
    for (const table of tables) {
      for (const row of table.querySelectorAll("tbody tr, tr")) {
        const cells = row.querySelectorAll("td");
        if (cells.length < 2) continue;
        const link = row.querySelector("a");
        const name = (link?.textContent || cells[0]?.textContent || "").trim();
        if (!name || name.length < 2 || name.length > 100 || skipText.has(name.toLowerCase())) continue;
        if (seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());

        // Try to find team size and revenue from cells
        let teamSize: string | null = null;
        let revenue: string | null = null;
        for (const cell of cells) {
          const text = cell.textContent?.trim() || "";
          if (/\d+\s*(people|employees|team|person)/i.test(text) || /^[1-9]\d{0,3}$/.test(text)) {
            teamSize = text;
          }
          if (/\$[\d,.]+[KMB]?|\d+[KMB]\s*(ARR|MRR|revenue)/i.test(text)) {
            revenue = text;
          }
        }

        results.push({
          name,
          url: link?.getAttribute("href") || null,
          description: cells[1]?.textContent?.trim() || null,
          teamSize,
          revenue,
          category: null,
          founder: null,
          logoUrl: row.querySelector("img")?.getAttribute("src") || null,
        });
      }
    }
    if (results.length > 5) return results;

    // ---- Strategy 2: Repeating card-like elements ----
    const containers = [
      ...document.querySelectorAll("main, [role='main'], #content, .content"),
      document.body,
    ];

    for (const container of containers) {
      const children = container.querySelectorAll(
        ":scope > div > div, :scope > div > div > div, " +
        "[class*='grid'] > *, [class*='list'] > *, " +
        "article, li, [class*='card'], [class*='item'], [class*='company'], [class*='team']"
      );
      if (children.length < 3) continue;

      for (const child of children) {
        if ((child as HTMLElement).closest("nav, header, footer, aside")) continue;

        const heading = child.querySelector("h1, h2, h3, h4, h5, h6, strong, b");
        if (!heading) continue;
        const name = heading.textContent?.trim() || "";
        if (!name || name.length < 2 || name.length > 100 || skipText.has(name.toLowerCase())) continue;
        if (seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());

        // Find the company website link (external URL)
        const extLink = child.querySelector("a[href^='http']:not([href*='tinyteams']):not([href*='twitter']):not([href*='linkedin'])");
        const anyLink = child.querySelector("a[href]");
        const url = extLink?.getAttribute("href") || anyLink?.getAttribute("href") || null;

        // Extract text content and look for team size / revenue patterns
        const fullText = child.textContent || "";
        let teamSize: string | null = null;
        let revenue: string | null = null;
        let founder: string | null = null;

        const sizeMatch = fullText.match(/(\d+)\s*(people|employees?|team\s*members?|person)/i) || fullText.match(/team\s*(?:size)?:\s*(\d+)/i);
        if (sizeMatch) teamSize = sizeMatch[0];

        const revMatch = fullText.match(/\$[\d,.]+\s*[KMB]?\s*(?:ARR|MRR|revenue)?/i) || fullText.match(/(?:ARR|MRR|revenue)\s*:?\s*\$?[\d,.]+\s*[KMB]?/i);
        if (revMatch) revenue = revMatch[0];

        const founderMatch = fullText.match(/(?:founder|maker|created\s+by|built\s+by)\s*:?\s*([A-Z][a-z]+ [A-Z][a-z]+(?:\s*[,&]\s*[A-Z][a-z]+ [A-Z][a-z]+)*)/i);
        if (founderMatch) founder = founderMatch[1] || null;

        results.push({
          name,
          url: url?.startsWith("http") ? url : null,
          description: child.querySelector("p, [class*='desc'], [class*='tagline']")?.textContent?.trim() || null,
          teamSize,
          revenue,
          category: null,
          founder,
          logoUrl: child.querySelector("img")?.getAttribute("src") || null,
        });
      }
      if (results.length > 3) break;
    }
    if (results.length > 5) return results;

    // ---- Strategy 3: All internal detail page links ----
    const links = document.querySelectorAll("a[href]");
    for (const link of links) {
      if ((link as HTMLElement).closest("nav, header, footer")) continue;
      const href = link.getAttribute("href") || "";
      const isDetail = /^\/(company|team|startup)s?\/[^/]+$/i.test(href) ||
                       /tinyteams\.xyz\/(company|team|startup)s?\/[^/]+$/i.test(href);
      if (!isDetail) continue;
      const name = link.textContent?.trim() || "";
      if (!name || name.length < 2 || name.length > 100 || skipText.has(name.toLowerCase())) continue;
      if (seenNames.has(name.toLowerCase())) continue;
      seenNames.add(name.toLowerCase());
      results.push({
        name,
        url: href.startsWith("http") ? href : `https://tinyteams.xyz${href}`,
        description: null, teamSize: null, revenue: null, category: null, founder: null, logoUrl: null,
      });
    }

    // ---- Strategy 4: External links near text content ----
    if (results.length === 0) {
      const extLinks = document.querySelectorAll("a[href^='http']:not([href*='tinyteams']):not([href*='twitter']):not([href*='linkedin']):not([href*='facebook']):not([href*='youtube'])");
      for (const link of extLinks) {
        if ((link as HTMLElement).closest("nav, header, footer, aside")) continue;
        const href = link.getAttribute("href") || "";
        if (/(google|apple|play\.google|github\.com$|npm)/i.test(href)) continue;

        const parent = link.parentElement;
        const nearHeading = parent?.querySelector("h1, h2, h3, h4, h5, h6, strong, b");
        const name = nearHeading?.textContent?.trim() || link.textContent?.trim() || "";
        if (!name || name.length < 2 || name.length > 100 || skipText.has(name.toLowerCase())) continue;
        if (/^https?:\/\//.test(name)) continue;
        if (seenNames.has(name.toLowerCase())) continue;
        seenNames.add(name.toLowerCase());

        results.push({
          name, url: href,
          description: parent?.querySelector("p")?.textContent?.trim() || null,
          teamSize: null, revenue: null, category: null, founder: null,
          logoUrl: parent?.querySelector("img")?.getAttribute("src") || null,
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
    const bodyChildren = Array.from(document.body?.children || []).slice(0, 10).map(
      el => `<${el.tagName.toLowerCase()} class="${el.className?.toString().slice(0, 60)}">`
    );
    const bodyText = document.body?.textContent?.slice(0, 500) || "";
    return { title, h1, links, imgs, iframes, bodyChildren, bodyText };
  });
  console.log(`[tinyteams] DEBUG page structure:`);
  console.log(`  Title: ${diag.title}`);
  console.log(`  H1: ${diag.h1}`);
  console.log(`  Links: ${diag.links}, Imgs: ${diag.imgs}`);
  if (diag.iframes.length > 0) console.log(`  Iframes: ${diag.iframes.join(", ")}`);
  console.log(`  Body children: ${diag.bodyChildren.join(", ")}`);
  console.log(`  Body text preview: ${diag.bodyText.slice(0, 200)}...`);
}

async function scrape(): Promise<void> {
  const stats = new ScrapeStats("TinyTeams");
  const progress = new ScrapeProgress("tinyteams");

  console.log(`[tinyteams] Starting scrape (DRY_RUN=${DRY_RUN}, MAX=${MAX_ITEMS || "all"})`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  // Intercept API/fetch responses
  const apiData: any[] = [];
  page.on("response", async (response) => {
    const url = response.url();
    const ct = response.headers()["content-type"] || "";
    if (response.status() === 200 && (ct.includes("json") || url.includes("/api/"))) {
      try {
        const json = await response.json();
        const candidates = [json, json?.companies, json?.teams, json?.data, json?.results, json?.items];
        for (const c of candidates) {
          if (Array.isArray(c) && c.length > 2 && (c[0]?.name || c[0]?.company || c[0]?.title)) {
            apiData.push(...c);
            break;
          }
        }
      } catch { /* not JSON */ }
    }
  });

  try {
    // Try multiple URL patterns
    const urlsToTry = [BASE_URL, `${BASE_URL}/companies`, `${BASE_URL}/teams`, `${BASE_URL}/all`];
    let loaded = false;
    for (const url of urlsToTry) {
      try {
        const resp = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
        if (resp && resp.status() < 400) {
          loaded = true;
          console.log(`[tinyteams] Loaded: ${url}`);
          break;
        }
      } catch { continue; }
    }
    if (!loaded) {
      console.error(`[tinyteams] Could not load any URL variant`);
      return;
    }

    await sleep(3000);

    // Scroll to load all content
    for (let i = 0; i < 20; i++) {
      await page.evaluate(() => window.scrollBy(0, window.innerHeight));
      await sleep(600);
    }

    // Click load-more buttons
    for (let i = 0; i < 15; i++) {
      const btn = await page.$(
        "button:has-text('Load'), button:has-text('More'), button:has-text('Show'), button:has-text('Next'), " +
        "a:has-text('Next'), [class*='load-more'], [class*='pagination'] a"
      );
      if (!btn) break;
      try {
        await btn.click();
        await sleep(DELAY_MS);
      } catch { break; }
    }

    // Check __NEXT_DATA__
    const nextData = await page.evaluate(() => {
      const el = document.getElementById("__NEXT_DATA__");
      if (!el) return null;
      try { return JSON.parse(el.textContent || ""); } catch { return null; }
    });

    // Check for embedded JSON in script tags
    const embeddedData = await page.evaluate(() => {
      const scripts = document.querySelectorAll("script:not([src])");
      for (const script of scripts) {
        const text = script.textContent || "";
        if (text.length < 100 || text.length > 5_000_000) continue;
        if (!text.includes('"name"')) continue;
        try {
          const startIdx = text.indexOf("[");
          if (startIdx === -1) continue;
          let depth = 0, endIdx = startIdx;
          for (let i = startIdx; i < text.length; i++) {
            if (text[i] === "[") depth++;
            else if (text[i] === "]") { depth--; if (depth === 0) { endIdx = i + 1; break; } }
          }
          const parsed = JSON.parse(text.slice(startIdx, endIdx));
          if (Array.isArray(parsed) && parsed.length > 2 && (parsed[0]?.name || parsed[0]?.title || parsed[0]?.company)) {
            return parsed;
          }
        } catch { /* not valid JSON */ }
      }
      return null;
    });

    let allCompanies: RawCompany[];

    if (apiData.length > 0) {
      console.log(`[tinyteams] Got ${apiData.length} companies from API`);
      allCompanies = apiData.map((d: any) => ({
        name: d.name || d.company || d.title || "",
        url: d.url || d.website || d.link || null,
        description: d.description || d.tagline || d.summary || null,
        teamSize: String(d.team_size || d.teamSize || d.employees || d.headcount || ""),
        revenue: d.revenue || d.arr || d.mrr || null,
        category: d.category || d.industry || d.sector || null,
        founder: d.founder || d.maker || d.created_by || null,
        logoUrl: d.logo || d.image || d.logo_url || null,
      }));
    } else if (embeddedData) {
      console.log(`[tinyteams] Got ${embeddedData.length} companies from embedded JSON`);
      allCompanies = embeddedData.map((d: any) => ({
        name: d.name || d.company || d.title || "",
        url: d.url || d.website || null,
        description: d.description || d.tagline || null,
        teamSize: String(d.team_size || d.teamSize || d.employees || ""),
        revenue: d.revenue || d.arr || d.mrr || null,
        category: d.category || null,
        founder: d.founder || d.maker || null,
        logoUrl: d.logo || d.image || null,
      }));
    } else if (nextData?.props?.pageProps) {
      const pp = nextData.props.pageProps;
      // Recursively find arrays of company-like objects
      function findArray(obj: any, depth = 0): any[] | null {
        if (depth > 4 || !obj) return null;
        if (Array.isArray(obj) && obj.length > 2 && (obj[0]?.name || obj[0]?.company || obj[0]?.title)) return obj;
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
        console.log(`[tinyteams] Got ${arr.length} companies from __NEXT_DATA__`);
        allCompanies = arr.map((d: any) => ({
          name: d.name || d.company || "",
          url: d.url || d.website || null,
          description: d.description || null,
          teamSize: String(d.team_size || d.employees || ""),
          revenue: d.revenue || d.arr || null,
          category: d.category || null,
          founder: d.founder || null,
          logoUrl: d.logo || null,
        }));
      } else {
        allCompanies = await extractFromPage(page);
      }
    } else {
      const domCompanies = await extractFromPage(page);
      console.log(`[tinyteams] Got ${domCompanies.length} companies from DOM`);
      allCompanies = domCompanies;
    }

    if (allCompanies.length === 0) {
      console.warn(`[tinyteams] WARNING: 0 companies found — dumping diagnostics`);
      await dumpDiagnostics(page);
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
    console.log(`[tinyteams] Processing ${items.length} unique companies`);

    function parseTeamSize(s: string | null): number | null {
      if (!s) return null;
      const num = String(s).match(/(\d+)/);
      return num ? parseInt(num[1]!, 10) : null;
    }

    function parseRevenue(s: string | null): string | null {
      if (!s) return null;
      const str = String(s).toLowerCase();
      if (str.includes("pre-revenue") || str.includes("0")) return "PRE_REVENUE";
      const m = str.match(/\$?([\d,.]+)\s*(m|k)?/i);
      if (!m) return null;
      let val = parseFloat(m[1]!.replace(/,/g, ""));
      const unit = (m[2] || "").toUpperCase();
      if (unit === "M") val *= 1_000_000;
      if (unit === "K") val *= 1_000;
      if (val < 1_000_000) return "SUB_1M";
      if (val < 5_000_000) return "ARR_1M_5M";
      if (val < 10_000_000) return "ARR_5M_10M";
      if (val < 50_000_000) return "ARR_10M_50M";
      return "ARR_50M_100M";
    }

    for (const company of items) {
      if (progress.isDone(company.name)) {
        stats.recordSkip();
        continue;
      }

      const founders: FounderIngestPayload[] = [];
      if (company.founder) {
        for (const name of company.founder.split(/[,&]/).map((s) => s.trim()).filter(Boolean)) {
          if (name.length > 2 && name.length < 80) founders.push({ full_name: name });
        }
      }

      const payload: StartupIngestPayload = {
        company_name: company.name,
        data_source: "tinyteams",
        company_url: company.url,
        domain: normalizeDomain(company.url),
        description_short: company.description,
        logo_url: company.logoUrl,
        headcount: parseTeamSize(company.teamSize),
        revenue_range: parseRevenue(company.revenue),
        market_category: company.category,
        stage: "BOOTSTRAPPED",
        business_model_tags: ["small-team", "profitable"],
        founders: founders.length > 0 ? founders : undefined,
        external_ids: { tinyteams_url: BASE_URL },
      };

      if (DRY_RUN) {
        console.log(`[tinyteams] [DRY] Would upsert: ${company.name}`);
        stats.recordSkip();
      } else {
        try {
          const result = await upsertStartup(sb, payload);
          stats.record(result);
          progress.markDone(company.name);
        } catch (err) {
          console.error(`[tinyteams] Error upserting ${company.name}: ${err instanceof Error ? err.message : err}`);
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
    console.error("[tinyteams] Fatal:", err);
    process.exit(1);
  })
  // done;
