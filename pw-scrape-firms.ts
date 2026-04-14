/**
 * Playwright batch scraper — tries base URL + portfolio sub-paths per firm,
 * waits for JS to render, extracts visible text, writes to /tmp/pw-scraped.json
 */
import { chromium } from "playwright-core";
import { writeFileSync } from "fs";

const FIRMS = [
  { id: "39301bce-8fc5-452d-ba6f-99f8133a33f4", name: "Bloom Capital",                 url: "https://www.bloom.fund/" },
  { id: "81d49490-3c5a-4fe6-9e00-e3debb760570", name: "Crossroad Partners",             url: "https://crossroadptrs.com/" },
  { id: "913e289d-24ad-4753-9e7c-8f520fde18a3", name: "Elevate Ventures Fund I",        url: "https://elevateventures.com/" },
  { id: "d68801e3-045f-4124-8d26-6da07ea1ac2a", name: "VentureSouq",                    url: "https://www.venturesouq.com" },
  { id: "f79347b9-70af-4af9-aa5b-b290b6d64b54", name: "360 Ventures",                   url: "https://360ventures.co/" },
  { id: "531705ab-373b-4a27-b8d6-aae38aa634d9", name: "Operator Hub Ventures",          url: "https://operatorvp.com/" },
  { id: "d9b2d833-3133-4c32-bd5d-d7cd622f2c03", name: "Prismatic Ventures",             url: "https://prismaticventures.co.ke/" },
  { id: "767766f2-218d-413b-9514-617ebd3a4e81", name: "Accel",                          url: "https://www.accel.com/" },
  { id: "60dbd898-46fc-443c-a334-1d436c893ff5", name: "R/GA Ventures",                  url: "https://ventures.rga.com" },
  { id: "2e4b4069-b4d9-476f-b8a1-f8989fa0569c", name: "Elevation Rolling Fund",         url: "https://elevationcapitalgroup.com/" },
  { id: "eb32de28-6e84-4b45-8c13-400b992adf08", name: "Iterative Ventures",             url: "https://www.iterative.vc" },
  { id: "62563760-0708-40de-b5e8-02e9060ccc07", name: "Operator Partners",              url: "https://www.operatorpartners.com/" },
  { id: "0d36ddcb-fdff-4d90-bdae-dc38a5eb3e60", name: "Uncorrelated Ventures",          url: "https://uncorrelated.com" },
  { id: "4c475942-6426-42c8-960a-fc2288a877e6", name: "Lightbank",                      url: "https://www.lightbank.com/" },
  { id: "e56c14b9-50b6-4106-bb4c-ddf84114308b", name: "BDMI",                           url: "https://bdmifund.com/" },
  { id: "e8bb21a2-6e06-4cfb-852f-317026bb7ef9", name: "Elemental Catalyst Fund",        url: "https://elementalimpact.com/" },
  { id: "14011192-cd28-4b40-bafe-1a3bbe2e2804", name: "High Alpha",                     url: "https://www.highalpha.com" },
  { id: "841f59ed-c629-4583-bac9-aa20c3897348", name: "Backstage Capital",              url: "https://backstagecapital.com" },
  { id: "e393a05a-20c2-4416-bfeb-cd5decdd0ca9", name: "Arcanum Capital",                url: "https://www.arcanum.capital" },
  { id: "5f1a4d70-f9fe-4628-8ab3-fa6e69064874", name: "IVP",                            url: "https://www.ivp.com/" },
];

const SUB_PATHS = ["/portfolio", "/companies", "/investments", "/portfolio-companies", "/startups", "/our-portfolio"];
const TIMEOUT = 18_000;
const WAIT_MS = 2_500;

function stripToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

async function scrapeBest(page: any, base: string): Promise<{ url: string; text: string } | null> {
  const base_clean = base.replace(/\/$/, "");
  const urls = [base_clean, ...SUB_PATHS.map(p => base_clean + p)];
  let best: { url: string; text: string } | null = null;

  for (const url of urls) {
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: TIMEOUT });
      if (!resp || resp.status() >= 400) continue;
      await page.waitForTimeout(WAIT_MS);

      // Also try to scroll down to trigger lazy-loading
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
      await page.waitForTimeout(800);

      const html = await page.content();
      const text = stripToText(html).slice(0, 35_000);

      // Must contain portfolio-like keywords
      const hits = [/portfolio/i, /invest/i, /compan/i, /startup/i, /backed/i, /seed/i, /series/i, /funded/i]
        .filter(r => r.test(text)).length;
      if (hits < 2) continue;

      if (!best || text.length > best.text.length) {
        best = { url, text };
      }
      if (url !== base_clean) break; // found a dedicated sub-page — stop
    } catch { continue; }
  }
  return best;
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });
  const ctx = await browser.newContext({
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    locale: "en-US",
    viewport: { width: 1280, height: 800 },
  });
  const page = await ctx.newPage();

  const results: Array<{ id: string; name: string; url: string; scrapedUrl: string | null; text: string | null; error: string | null }> = [];

  for (const firm of FIRMS) {
    console.log(`Scraping [${FIRMS.indexOf(firm) + 1}/${FIRMS.length}] ${firm.name} ...`);
    try {
      const r = await scrapeBest(page, firm.url);
      results.push({ id: firm.id, name: firm.name, url: firm.url, scrapedUrl: r?.url ?? null, text: r?.text ?? null, error: null });
      console.log(`  -> ${r ? `OK (${r.text.length} chars from ${r.url})` : "no portfolio content"}`);
    } catch (err: any) {
      results.push({ id: firm.id, name: firm.name, url: firm.url, scrapedUrl: null, text: null, error: err.message });
      console.log(`  -> ERROR: ${err.message}`);
    }
  }

  await browser.close();
  writeFileSync("/tmp/pw-scraped.json", JSON.stringify(results, null, 2));
  console.log("\nWrote /tmp/pw-scraped.json");
}

main().catch(e => { console.error(e); process.exit(1); });
