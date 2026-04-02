/**
 * Diagnostic: discover Signal NFX's actual filter URL format
 * by clicking filter buttons and observing network requests + URL changes.
 */
import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFiles } from "./lib/loadEnvFiles";

loadEnvFiles([".env", ".env.local"]);

const AUTH_FILE = join(process.cwd(), "data", "signal-nfx-auth.json");

async function main() {
  if (!existsSync(AUTH_FILE)) {
    console.error("No auth file found");
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: false, // show the browser so we can see what's happening
    args: ["--no-sandbox"],
  });

  const ctx = await browser.newContext({
    storageState: AUTH_FILE,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });

  // Intercept all network requests
  const capturedRequests: string[] = [];
  await ctx.route("**/*", async (route) => {
    const req = route.request();
    const url = req.url();
    if (url.includes("signal.nfx") || url.includes("nfx.com")) {
      capturedRequests.push(`${req.method()} ${url}`);
    }
    await route.continue();
  });

  const page = await ctx.newPage();

  console.log("\n=== Navigating to /investors ===");
  await page.goto("https://signal.nfx.com/investors", { waitUntil: "networkidle", timeout: 30_000 });
  console.log(`URL: ${page.url()}`);

  console.log("\n=== Page title/heading ===");
  const h1 = await page.locator("h1").first().textContent().catch(() => "none");
  console.log(`H1: ${h1}`);

  // Look for filter-related elements
  console.log("\n=== Looking for filter UI elements ===");
  const filterEls = await page.evaluate(`(function() {
    var results = [];

    // Look for filter-related buttons, selects, etc.
    var candidates = [
      ...document.querySelectorAll('button'),
      ...document.querySelectorAll('select'),
      ...document.querySelectorAll('[class*="filter"]'),
      ...document.querySelectorAll('[class*="Filter"]'),
      ...document.querySelectorAll('[class*="sort"]'),
      ...document.querySelectorAll('[class*="Sort"]'),
      ...document.querySelectorAll('[role="combobox"]'),
      ...document.querySelectorAll('[role="listbox"]'),
    ];

    candidates.forEach(function(el) {
      var text = (el.textContent || "").trim().substring(0, 80);
      var cls = (el.className || "").substring(0, 60);
      var tag = el.tagName;
      var href = el.href || "";
      if (text && !results.find(function(r) { return r.text === text; })) {
        results.push({ tag, text, cls, href });
      }
    });

    return results.slice(0, 50);
  })()`);

  console.log("Filter UI candidates:");
  (filterEls as any[]).forEach((el: any) => {
    console.log(`  [${el.tag}] "${el.text}" class="${el.cls}"`);
  });

  // Count investor cards
  const cardCount = await page.locator('a[href^="/investors/"]').count();
  console.log(`\n=== Investor cards found: ${cardCount} ===`);

  // Check the page URL and any hash
  console.log(`\nCurrent URL: ${page.url()}`);

  // Look for existing filter state
  const bodyText = await page.evaluate("document.body.innerText") as string;
  const filterKeywords = bodyText.match(/(?:stage|sector|location|filter|sort|geography|type)[:=][^\s]+/gi) || [];
  console.log("\nFilter keywords in body:", filterKeywords.slice(0, 20));

  // Click on what looks like a filter button
  console.log("\n=== Attempting to click filter buttons ===");
  const buttons = await page.locator('button').all();
  for (const btn of buttons) {
    const text = (await btn.textContent() || "").trim();
    if (text && text.length > 2 && text.length < 30 && !/menu|nav|close|skip/i.test(text)) {
      console.log(`  Button: "${text}"`);
    }
  }

  // Try the first visible button that looks like a filter
  const filterButtonCandidates = [
    'button:has-text("Stage")',
    'button:has-text("Sector")',
    'button:has-text("Location")',
    'button:has-text("Filter")',
    'button:has-text("Sort")',
    '[class*="filter"] button',
    'select',
  ];

  for (const selector of filterButtonCandidates) {
    const el = page.locator(selector).first();
    if (await el.count() > 0) {
      console.log(`\nClicking: ${selector}`);
      capturedRequests.length = 0; // clear
      const urlBefore = page.url();
      await el.click().catch(() => {});
      await page.waitForTimeout(3000);
      await page.waitForLoadState("networkidle").catch(() => {});
      const urlAfter = page.url();
      console.log(`  URL before: ${urlBefore}`);
      console.log(`  URL after:  ${urlAfter}`);
      console.log(`  New requests (${capturedRequests.length}):`);
      capturedRequests.slice(0, 20).forEach(r => console.log(`    ${r}`));
      break;
    }
  }

  console.log("\n=== Checking page source for filter-related patterns ===");
  const pageSource = await page.evaluate("document.documentElement.innerHTML") as string;
  const patterns = [
    /data-filter[^"']*["']([^"']+)/g,
    /filter[s]?=([^&"'\s]+)/g,
    /\?([a-z_]+)=(pre_seed|seed|series|fintech|enterprise|health)/g,
    /\/investors\/\?/g,
    /signal_rank/g,
  ];
  for (const pat of patterns) {
    const matches = pageSource.match(pat);
    if (matches && matches.length > 0) {
      console.log(`Pattern ${pat}: ${JSON.stringify(matches.slice(0, 5))}`);
    }
  }

  // Wait a bit then print all captured requests
  await page.waitForTimeout(2000);
  console.log("\n=== All captured NFX requests ===");
  [...new Set(capturedRequests)].forEach(r => console.log(`  ${r}`));

  await browser.close();
}

main().catch(console.error);
