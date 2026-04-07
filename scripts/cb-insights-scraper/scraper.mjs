/**
 * CB Insights Playwright Scraper — v2
 * ====================================
 * Enriches firm_records and firm_investors in Supabase using CB Insights.
 *
 * Approach (based on real CB Insights app structure):
 *   1. Login at app.cbinsights.com
 *   2. Use internal LiveSearch API to find firms by name → returns description,
 *      domain, city, country, total_funding, logo_url, and CBI org IDs
 *   3. Navigate to profile pages at /profiles/c/{id}?tab=overview for full data
 *   4. Scrape structured About section: Founded Year, HQ, Investor Type, etc.
 *   5. Scrape People section for team members (name + title + profile link)
 *   6. Write only NULL fields back to Supabase
 *
 * Usage:
 *   node scraper.mjs                     # headless, live writes
 *   HEADLESS=false node scraper.mjs      # headed (watch the browser)
 *   DRY_RUN=true node scraper.mjs        # scrape but don't write to DB
 *   node scraper.mjs --table=firms       # only firms
 *   node scraper.mjs --table=investors   # only investors
 */

import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { writeFileSync, existsSync, readFileSync } from "fs";
import { URL } from "url";

config();

// ─── Configuration ───────────────────────────────────────────────────────────

const CBI_EMAIL = process.env.CBI_EMAIL;
const CBI_PASSWORD = process.env.CBI_PASSWORD;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || "50", 10);
const DELAY_MS = parseInt(process.env.DELAY_MS || "3000", 10);
const HEADLESS = process.env.HEADLESS !== "false";
const DRY_RUN = process.env.DRY_RUN === "true";
const MAX_RETRIES = parseInt(process.env.MAX_RETRIES || "3", 10);

const CBI_APP = "https://app.cbinsights.com";
const PROGRESS_FILE = "./scraper-progress.json";
const RESULTS_LOG = "./scraper-results.json";

const args = process.argv.slice(2);
const tableFlag = args.find((a) => a.startsWith("--table="))?.split("=")[1];
const scrapeFirms = !tableFlag || tableFlag === "firms";
const scrapeInvestors = !tableFlag || tableFlag === "investors";

// ─── Validation ──────────────────────────────────────────────────────────────

if (!CBI_EMAIL || !CBI_PASSWORD) {
  console.error("❌ Missing CBI_EMAIL or CBI_PASSWORD in .env");
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Utilities ───────────────────────────────────────────────────────────────

function extractDomain(url) {
  if (!url) return null;
  try {
    const hostname = new URL(
      url.startsWith("http") ? url : `https://${url}`
    ).hostname;
    return hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) {
    return JSON.parse(readFileSync(PROGRESS_FILE, "utf-8"));
  }
  return { completedFirmIds: [], completedInvestorIds: [], lastRun: null };
}

function saveProgress(progress) {
  progress.lastRun = new Date().toISOString();
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

function appendResult(entry) {
  let results = [];
  if (existsSync(RESULTS_LOG)) {
    results = JSON.parse(readFileSync(RESULTS_LOG, "utf-8"));
  }
  results.push({ ...entry, timestamp: new Date().toISOString() });
  writeFileSync(RESULTS_LOG, JSON.stringify(results, null, 2));
}

function logStats(stats) {
  console.log("\n📊 Session Summary:");
  console.log(`   Firms searched:     ${stats.firmsSearched}`);
  console.log(`   Firms updated:      ${stats.firmsUpdated}`);
  console.log(`   Firms not found:    ${stats.firmsNotFound}`);
  console.log(`   Investors searched: ${stats.investorsSearched}`);
  console.log(`   Investors updated:  ${stats.investorsUpdated}`);
  console.log(`   Investors not found:${stats.investorsNotFound}`);
  console.log(`   Errors:             ${stats.errors}`);
}

// ─── CB Insights Auth ────────────────────────────────────────────────────────

async function loginToCBInsights(page) {
  console.log("🔑 Logging in to CB Insights...");

  // Navigate to the app — it redirects to login if not authenticated
  await page.goto(`${CBI_APP}/`, {
    waitUntil: "domcontentloaded",
    timeout: 60000,
  });
  await sleep(3000);

  const url = page.url();
  console.log(`  📄 Landed at: ${url}`);

  // If already on the app (session still valid), skip login
  if (url.includes("app.cbinsights.com") && !url.includes("login")) {
    console.log("  ✅ Already authenticated");
    return;
  }

  // We're on a login page — find and fill the form
  // CB Insights may use various login providers (Auth0, custom, etc.)
  // Try multiple selector patterns

  // Handle cookie banners first
  try {
    const cookieBtn = page.locator(
      'button:has-text("Accept"), button:has-text("Got it"), button:has-text("OK")'
    );
    if (await cookieBtn.isVisible({ timeout: 3000 })) {
      await cookieBtn.click();
      await sleep(500);
    }
  } catch {
    // No cookie banner
  }

  // Wait for email input
  const emailInput = page.locator(
    'input[name="email"], input[type="email"], input[placeholder*="email" i], input[id*="email" i], input[name="username"]'
  );
  await emailInput.waitFor({ state: "visible", timeout: 20000 });

  await emailInput.click();
  await emailInput.fill(CBI_EMAIL);
  await sleep(500);

  const passwordInput = page.locator(
    'input[name="password"], input[type="password"]'
  );
  await passwordInput.click();
  await passwordInput.fill(CBI_PASSWORD);
  await sleep(500);

  const submitBtn = page.locator(
    'button[type="submit"], button:has-text("Log in"), button:has-text("Sign in"), button:has-text("Login"), button:has-text("Continue"), input[type="submit"]'
  );
  await submitBtn.first().click();
  console.log("  🔄 Credentials submitted, waiting for redirect away from /login...");

  // Wait for redirect AWAY from /login — the key fix is checking the URL
  // does NOT contain /login, not that it contains app.cbinsights.com
  try {
    await page.waitForURL(
      (u) => !u.pathname.includes("/login"),
      { timeout: 45000 }
    );
  } catch {
    const currentUrl = page.url();
    console.log(`  ⚠️  Still at: ${currentUrl}`);
    if (!HEADLESS) {
      console.log("  ⏸️  Pausing 45s for manual CAPTCHA/2FA — complete it in the browser...");
      await sleep(45000);
    } else {
      throw new Error(
        "Login did not redirect away from /login. Try HEADLESS=false to handle CAPTCHA/2FA."
      );
    }
  }

  const finalUrl = page.url();
  if (finalUrl.includes("/login")) {
    throw new Error(`Login failed — still on login page: ${finalUrl}`);
  }

  console.log(`  ✅ Logged in (at: ${finalUrl})`);
}

// ─── CB Insights UI Search ───────────────────────────────────────────────────

/**
 * Ensure we're on the CB Insights app (not login, not error page).
 * Navigates to /chat-cbi if needed.
 */
async function ensureOnApp(page) {
  const url = page.url();
  if (url.includes("app.cbinsights.com") && !url.includes("/login") && !url.includes("/error")) {
    return;
  }
  console.log("    🔄 Navigating back to app...");
  await page.goto(`${CBI_APP}/chat-cbi`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await sleep(3000);
  if (page.url().includes("/login")) {
    throw new Error("Session expired — redirected to login");
  }
}

/**
 * Search for a firm using the actual search combobox UI.
 * Types the name, reads the autocomplete dropdown, matches by domain,
 * and clicks to navigate to the profile page.
 *
 * Returns { profileUrl, dropdownData } or null.
 */
async function searchAndNavigate(page, firmName, targetDomain) {
  await ensureOnApp(page);

  // Click the global search combobox in the top nav bar
  const searchBox = page.locator('input[type="text"]').first();
  await searchBox.click();
  await sleep(300);

  // Clear and type firm name
  await searchBox.fill("");
  await sleep(200);
  await searchBox.fill(firmName);
  await sleep(2500); // Wait for autocomplete dropdown to populate

  // Extract data from all company options in the dropdown
  const dropdownResults = await page.evaluate(() => {
    const results = [];
    const options = document.querySelectorAll('[data-testid="company-option"], [data-sugg-type="Organization"]');
    for (const opt of options) {
      const text = opt.innerText || "";
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      results.push({
        name: lines[0] || "",
        domain: lines[1] || "",     // e.g., "sequoiacap.com"
        location: lines[2] || "",   // e.g., "Menlo Park, United States"
        extra: lines.slice(3).join(" | "), // funding, description snippets
        index: results.length,
      });
    }
    return results;
  });

  if (dropdownResults.length === 0) {
    // No company results found — close dropdown and return null
    await page.keyboard.press("Escape");
    await sleep(300);
    return null;
  }

  console.log(`    📋 ${dropdownResults.length} results in dropdown`);

  // Match by domain
  let matchIdx = -1;
  if (targetDomain) {
    // Exact domain match
    matchIdx = dropdownResults.findIndex((r) => {
      const d = extractDomain(r.domain);
      return d && d === targetDomain;
    });

    // Fuzzy domain match (base domain overlap)
    if (matchIdx === -1) {
      const targetBase = targetDomain.split(".")[0];
      matchIdx = dropdownResults.findIndex((r) => {
        const d = extractDomain(r.domain);
        if (!d) return false;
        const rBase = d.split(".")[0];
        return rBase === targetBase || d.includes(targetBase) || targetDomain.includes(rBase);
      });
    }
  }

  // Name match fallback
  if (matchIdx === -1) {
    const cleanFirm = firmName.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/individual$/, "");
    matchIdx = dropdownResults.findIndex((r) => {
      const cleanResult = r.name.toLowerCase().replace(/[^a-z0-9]/g, "");
      return cleanResult === cleanFirm || cleanResult.includes(cleanFirm) || cleanFirm.includes(cleanResult);
    });
  }

  if (matchIdx === -1) {
    // No match found — close dropdown
    console.log(`    ❌ No domain/name match in dropdown results`);
    if (dropdownResults.length > 0) {
      console.log(`       Top result: ${dropdownResults[0].name} (${dropdownResults[0].domain})`);
    }
    await page.keyboard.press("Escape");
    await sleep(300);
    return null;
  }

  const match = dropdownResults[matchIdx];
  console.log(`    ✅ Matched: ${match.name} (${match.domain}) — ${match.location}`);

  // Click the matched result — use nth company-option selector
  const companyOptions = page.locator('[data-testid="company-option"], [data-sugg-type="Organization"]');
  const targetOption = companyOptions.nth(matchIdx);

  try {
    await targetOption.click();
    // Wait for navigation to the profile page
    await page.waitForURL((u) => u.pathname.includes("/profiles/"), { timeout: 12000 });
    await sleep(2500); // Let the profile page fully render
    return {
      profileUrl: page.url(),
      dropdownData: match,
    };
  } catch (err) {
    console.log(`    ⚠️  Click didn't navigate to profile: ${err.message}`);
    await page.keyboard.press("Escape").catch(() => {});
    await sleep(500);
    return null;
  }
}

/**
 * Search for a person using the search combobox.
 * Returns the profile URL or null.
 */
async function searchPersonAndNavigate(page, personName) {
  await ensureOnApp(page);

  const searchBox = page.locator('input[type="text"]').first();
  await searchBox.click();
  await sleep(300);
  await searchBox.fill("");
  await sleep(200);
  await searchBox.fill(personName);
  await sleep(2500);

  // Look for person options
  const personOption = page.locator('[data-testid="person-option"], [data-sugg-type="Person"]').first();

  try {
    await personOption.waitFor({ state: "visible", timeout: 5000 });
    await personOption.click();
    await page.waitForURL((u) => u.pathname.includes("/profiles/p/"), { timeout: 10000 });
    await sleep(2000);
    return page.url();
  } catch {
    await page.keyboard.press("Escape").catch(() => {});
    await sleep(300);
    return null;
  }
}

/**
 * Scrape the profile Overview tab — FULL extraction.
 *
 * Captures ALL of the following from the real CBI profile DOM:
 *   - Description, Investor Type, Status
 *   - Full street address (Headquarters field), parsed into city/state/country
 *   - Founded Year
 *   - AUM / Revenue
 *   - Headcount
 *   - Email address (mailto links)
 *   - Social media (LinkedIn, X/Twitter, Facebook, Instagram, YouTube, Crunchbase)
 *   - Number of investments, exits, average deal size
 *   - Partner / team member names + titles
 *   - Investment themes (Key themes section)
 *   - Industries / Business Model
 *   - CB Insights profile URL
 */
async function scrapeProfilePage(page) {
  // One big page.evaluate for speed — avoids many round-trips
  const raw = await page.evaluate(() => {
    const d = {};
    const body = document.body.innerText || "";

    // ── 1. Description ──
    // Find "About" heading, then grab the next long text block
    const aboutEl = [...document.querySelectorAll("*")].find(
      (el) => el.textContent?.trim() === "About" && el.children.length === 0
    );
    if (aboutEl) {
      const parent = aboutEl.closest("div")?.parentElement;
      if (parent) {
        for (const child of parent.querySelectorAll("*")) {
          const t = child.textContent?.trim();
          if (t && t.length > 80 && t !== "About" && !t.startsWith("Website")) {
            d.description = t;
            break;
          }
        }
      }
    }

    // ── 2. Labeled fields from About list items ──
    const fields = {};
    const items = document.querySelectorAll("li, [role='listitem']");
    const labels = [
      "Website", "Status", "Investor Type", "Founded Year",
      "Headquarters", "Revenue", "AUM", "Assets Under Management",
      "Employees", "Team Size", "Industries", "Business Model",
      "Phone", "Email"
    ];
    for (const item of items) {
      const text = item.textContent?.trim() || "";
      for (const label of labels) {
        if (text.startsWith(label)) {
          fields[label] = text.slice(label.length).trim();
          break;
        }
      }
    }
    d.fields = fields;

    // ── 3. Header location (cleaner: "Menlo Park, California, United States") ──
    const headings = document.querySelectorAll("h1, h2");
    for (const h of headings) {
      const sib = h.nextElementSibling;
      if (sib) {
        const t = sib.textContent?.trim();
        if (t && t.includes(",") && !t.includes("Finance") && !t.includes("http") && t.length < 100) {
          d.header_location = t;
          break;
        }
      }
    }

    // ── 4. Social media + email links ──
    const socials = {};
    document.querySelectorAll("a[href]").forEach((a) => {
      const h = a.href;
      if (h.includes("linkedin.com/company")) socials.linkedin_url = h;
      else if (h.includes("linkedin.com") && !socials.linkedin_url) socials.linkedin_url = h;
      if (h.includes("twitter.com") || (h.includes("x.com") && !h.includes("cbinsights"))) socials.x_url = h;
      if (h.includes("facebook.com")) socials.facebook_url = h;
      if (h.includes("instagram.com")) socials.instagram_url = h;
      if (h.includes("youtube.com")) socials.youtube_url = h;
      if (h.includes("crunchbase.com")) socials.crunchbase_url = h;
      if (h.includes("substack.com")) socials.substack_url = h;
      if (h.includes("medium.com")) socials.medium_url = h;
      if (h.startsWith("mailto:")) socials.email = h.replace("mailto:", "");
    });
    d.socials = socials;

    // ── 5. Investment stats from Highlights ──
    // Average deal size: "$2,530.32M\nAverage deal size"
    const avgMatch = body.match(/\$([\d,.]+[MBK]?)\s*\n?\s*Average deal size/i);
    if (avgMatch) d.avg_deal_size = "$" + avgMatch[1];

    // Total investments: "1000\nInvestments"
    const invMatch = body.match(/(\d[\d,]*)\s*\n\s*Investments/);
    if (invMatch) d.total_investments = parseInt(invMatch[1].replace(/,/g, ""), 10);

    // Total exits: "296\nExits"
    const exitMatch = body.match(/(\d[\d,]*)\s*\n\s*Exits/);
    if (exitMatch) d.total_exits = parseInt(exitMatch[1].replace(/,/g, ""), 10);

    // New deals since: "237 new deals since 2025"
    const newDealsMatch = body.match(/(\d+)\s+new deals since/i);
    if (newDealsMatch) d.new_deals_recent = parseInt(newDealsMatch[1], 10);

    // ── 6. People / partners with titles ──
    const people = [];
    const personLinks = document.querySelectorAll('a[href*="/profiles/p/"]');
    const seenNames = new Set();
    for (const link of personLinks) {
      const name = link.textContent?.trim()?.replace(/\s+/g, " ");
      if (!name || name.length < 2 || seenNames.has(name)) continue;
      seenNames.add(name);

      // Walk up to find the person card — title is a nearby text element
      let title = null;
      let container = link.parentElement;
      for (let i = 0; i < 5 && container; i++) {
        const innerText = container.innerText || "";
        const lines = innerText.split("\n").map((l) => l.trim()).filter((l) => l.length > 2);
        const titleLine = lines.find(
          (l) =>
            l !== name &&
            (l.includes("Officer") || l.includes("Partner") || l.includes("President") ||
             l.includes("Director") || l.includes("Vice") || l.includes("Head") ||
             l.includes("Managing") || l.includes("Founder") || l.includes("CEO") ||
             l.includes("CTO") || l.includes("CFO") || l.includes("COO") ||
             l.includes("Principal") || l.includes("Analyst") || l.includes("Associate"))
        );
        if (titleLine) {
          title = titleLine;
          break;
        }
        container = container.parentElement;
      }

      people.push({ full_name: name, title, cb_profile_url: link.href });
    }
    d.people = people;

    // ── 7. Key themes (investment thesis themes) ──
    const themes = [];
    // Themes appear as bold text inside the "Key themes" section
    // Structure: heading "Key themes" then list of theme names
    let inThemes = false;
    const allEls = document.querySelectorAll("*");
    for (const el of allEls) {
      const t = el.textContent?.trim();
      if (t === "Key themes") { inThemes = true; continue; }
      if (inThemes && el.children.length === 0 && t && t.length > 5 && t.length < 80) {
        // Theme names are typically the bold/emphasized short text
        if (!t.startsWith("—") && !t.startsWith("Read") && !t.includes("Key themes")) {
          // Check if this looks like a theme name (capitalized, descriptive)
          if (/^[A-Z]/.test(t) && !themes.includes(t)) {
            themes.push(t);
          }
        }
        // Also catch "— description" lines to extract just the theme title from its bold child
      }
      // Stop after we've left the themes section
      if (inThemes && themes.length > 0 && (t === "View More" || t === "Investments" || t === "Business Relationships")) {
        inThemes = false;
      }
    }
    d.themes = themes;

    // ── 8. Industries (from buttons inside the Industries listitem) ──
    const industries = [];
    const buttons = document.querySelectorAll("button");
    for (const btn of buttons) {
      const li = btn.closest("li, [role='listitem']");
      if (li && li.textContent?.includes("Industries")) {
        const val = btn.textContent?.trim();
        if (val && val.length < 60) industries.push(val);
      }
    }
    d.industries = industries;

    return d;
  });

  // ── Map raw data to our schema ──
  const data = {};
  const f = raw.fields || {};

  // Description
  data.description = raw.description || null;

  // Founded year
  if (f["Founded Year"]) {
    const m = f["Founded Year"].match(/(\d{4})/);
    if (m) data.founded_year = parseInt(m[1], 10);
  }

  // Full address + parsed location
  if (f["Headquarters"]) {
    data.address = f["Headquarters"]; // Full street address
    const parts = f["Headquarters"].split(",").map((s) => s.trim());
    if (parts.length >= 3) {
      const country = parts[parts.length - 1];
      const state = parts[parts.length - 2];
      const cityParts = parts.filter(
        (p) => !p.match(/^\d{4,5}$/) && !p.match(/^\d+\s/) && !p.match(/Suite|Floor|Unit|#/i)
      );
      data.hq_city = cityParts.length >= 3 ? cityParts[cityParts.length - 3] : cityParts[0] || null;
      data.hq_state = state;
      data.hq_country = country;
    }
  }

  // Fallback location from header
  if (!data.hq_city && raw.header_location) {
    const parts = raw.header_location.split(",").map((s) => s.trim());
    data.hq_city = parts[0];
    data.hq_state = parts.length >= 3 ? parts[1] : null;
    data.hq_country = parts[parts.length - 1];
  }

  // Investor type
  if (f["Investor Type"]) data.firm_type = f["Investor Type"];

  // AUM / Revenue
  data.aum = f["AUM"] || f["Assets Under Management"] || f["Revenue"] || null;

  // Headcount
  if (f["Employees"] || f["Team Size"]) {
    const hcText = f["Employees"] || f["Team Size"];
    const m = hcText.replace(/,/g, "").match(/(\d+)/);
    if (m) data.total_headcount = parseInt(m[1], 10);
  }

  // Email
  data.email = raw.socials?.email || f["Email"] || null;

  // Social media
  data.linkedin_url = raw.socials?.linkedin_url || null;
  data.x_url = raw.socials?.x_url || null;
  data.facebook_url = raw.socials?.facebook_url || null;
  data.instagram_url = raw.socials?.instagram_url || null;
  data.youtube_url = raw.socials?.youtube_url || null;
  data.crunchbase_url = raw.socials?.crunchbase_url || null;
  data.substack_url = raw.socials?.substack_url || null;
  data.medium_url = raw.socials?.medium_url || null;

  // Investment stats
  data.total_investments = raw.total_investments || null;
  data.total_exits = raw.total_exits || null;
  data.avg_deal_size = raw.avg_deal_size || null;

  // Industries / verticals
  if (raw.industries?.length > 0) {
    data.thesis_verticals = raw.industries;
  }

  // Partner names + team members with titles
  data.team_members = raw.people || [];
  data.partner_names = (raw.people || [])
    .filter((p) =>
      p.title &&
      (p.title.includes("Partner") || p.title.includes("Managing") ||
       p.title.includes("Founder") || p.title.includes("Principal"))
    )
    .map((p) => p.full_name);
  data.general_partner_names = (raw.people || [])
    .filter((p) => p.title && p.title.includes("General Partner"))
    .map((p) => p.full_name);

  // Investment themes
  data.themes = raw.themes || [];

  // CB Insights URL
  data.cb_insights_url = page.url();

  return data;
}

// ─── Database Queries ────────────────────────────────────────────────────────

function isUSActiveFirm(firm) {
  // Exclude explicitly inactive firms
  if (firm.status && firm.status.toLowerCase() !== "active") return false;
  // Must have some US indicator in hq_country or location
  const loc = `${firm.hq_country || ""} ${firm.location || ""}`.toLowerCase();
  return (
    loc.includes("united states") ||
    loc.includes("usa") ||
    loc.includes(", us") ||
    /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\b/.test(
      `${firm.hq_country || ""} ${firm.location || ""}`
    )
  );
}

async function getRawFirmBatch(offset, limit) {
  const { data, error } = await supabase
    .from("firm_records")
    .select("id, firm_name, website_url, cb_insights_url, status, hq_country, location")
    .not("website_url", "is", null)
    .or(
      "description.is.null,aum.is.null,founded_year.is.null,hq_city.is.null,total_headcount.is.null"
    )
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`Supabase query error: ${error.message}`);
  return data || [];
}

async function getInvestorsNeedingEnrichment(offset, limit) {
  const { data, error } = await supabase
    .from("firm_investors")
    .select("id, full_name, firm_id, linkedin_url, bio, city, title")
    .or("bio.is.null,city.is.null")
    .range(offset, offset + limit - 1);

  if (error) throw new Error(`Supabase query error: ${error.message}`);
  return data || [];
}

async function updateFirmRecord(firmId, scraped) {
  const { data: current, error: fetchErr } = await supabase
    .from("firm_records")
    .select("*")
    .eq("id", firmId)
    .single();

  if (fetchErr) throw fetchErr;

  const updates = {};

  // ── Simple text/number field mapping (scraped key → DB column) ──
  const fieldMap = {
    description: "description",
    hq_city: "hq_city",
    hq_state: "hq_state",
    hq_country: "hq_country",
    founded_year: "founded_year",
    aum: "aum",
    total_headcount: "total_headcount",
    firm_type: "firm_type",
    cb_insights_url: "cb_insights_url",
    logo_url: "logo_url",
    // NEW: address, email, socials
    address: "address",
    email: "email",
    linkedin_url: "linkedin_url",
    x_url: "x_url",
    facebook_url: "facebook_url",
    instagram_url: "instagram_url",
    youtube_url: "youtube_url",
    crunchbase_url: "crunchbase_url",
    substack_url: "substack_url",
    medium_url: "medium_url",
    // NEW: investment stats
    total_investments: "total_investors",  // maps to total_investors column
    total_headcount: "total_headcount",
  };

  for (const [scrapedKey, dbKey] of Object.entries(fieldMap)) {
    if (scraped[scrapedKey] != null && (current[dbKey] == null || current[dbKey] === "")) {
      updates[dbKey] = scraped[scrapedKey];
    }
  }

  // ── Array fields (only fill if currently empty) ──
  if (
    scraped.thesis_verticals?.length > 0 &&
    (!current.thesis_verticals || current.thesis_verticals.length === 0)
  ) {
    updates.thesis_verticals = scraped.thesis_verticals;
  }

  if (
    scraped.partner_names?.length > 0 &&
    (!current.partner_names || current.partner_names.length === 0)
  ) {
    updates.partner_names = scraped.partner_names;
  }

  if (
    scraped.general_partner_names?.length > 0 &&
    (!current.general_partner_names || current.general_partner_names.length === 0)
  ) {
    updates.general_partner_names = scraped.general_partner_names;
  }

  // ── Elevator pitch (first ~200 chars of description if no pitch exists) ──
  if (!current.elevator_pitch && scraped.description) {
    const pitch = scraped.description.slice(0, 200).replace(/\.\s.*$/, "."); // Cut at first sentence boundary
    if (pitch.length > 30) updates.elevator_pitch = pitch;
  }

  // ── Check size from average deal size ──
  if (scraped.avg_deal_size && !current.min_check_size && !current.max_check_size) {
    // Parse "$2,530.32M" → number
    const parsed = scraped.avg_deal_size.replace(/[$,]/g, "");
    let num = parseFloat(parsed);
    if (parsed.includes("B")) num *= 1_000_000_000;
    else if (parsed.includes("M")) num *= 1_000_000;
    else if (parsed.includes("K")) num *= 1_000;
    if (!isNaN(num) && num > 0) {
      // Store as a sentiment detail or market_sentiment since there's no avg_deal column
      if (!current.sentiment_detail) {
        updates.sentiment_detail = `Avg deal size: ${scraped.avg_deal_size} | Investments: ${scraped.total_investments || "?"} | Exits: ${scraped.total_exits || "?"}`;
      }
    }
  }

  // ── Headcount from team members count ──
  if (scraped.team_members?.length > 0 && !current.total_partners) {
    // Count people with "Partner" in their title
    const partnerCount = scraped.team_members.filter((m) =>
      m.title?.includes("Partner")
    ).length;
    if (partnerCount > 0) updates.total_partners = partnerCount;
    // Also set general_partner_count
    const gpCount = scraped.team_members.filter((m) =>
      m.title?.includes("General Partner")
    ).length;
    if (gpCount > 0 && !current.general_partner_count) updates.general_partner_count = gpCount;
  }

  updates.last_enriched_at = new Date().toISOString();

  if (Object.keys(updates).length <= 1) {
    return { updated: false, fields: [] };
  }

  if (DRY_RUN) {
    console.log(`  [DRY RUN] Would update firm ${firmId}:`, Object.keys(updates));
    return { updated: true, fields: Object.keys(updates), dryRun: true };
  }

  const { error } = await supabase
    .from("firm_records")
    .update(updates)
    .eq("id", firmId);

  if (error) throw error;
  return { updated: true, fields: Object.keys(updates) };
}

async function updateFirmInvestors(firmId, teamMembers) {
  if (!teamMembers || teamMembers.length === 0) return 0;

  let updatedCount = 0;
  for (const member of teamMembers) {
    // Match by name (fuzzy — handles "Marie  Klemchuk" vs "Marie Klemchuk")
    const cleanName = member.full_name.replace(/\s+/g, " ").trim();
    const { data: existing } = await supabase
      .from("firm_investors")
      .select("id, bio, city, linkedin_url, title")
      .eq("firm_id", firmId)
      .ilike("full_name", `%${cleanName}%`)
      .limit(1);

    if (existing && existing.length > 0) {
      const inv = existing[0];
      const updates = {};
      if (!inv.title && member.title) updates.title = member.title;
      // CB profile URL can help us enrich later
      // (no column for this, but we could add one)

      if (Object.keys(updates).length > 0 && !DRY_RUN) {
        updates.updated_at = new Date().toISOString();
        await supabase.from("firm_investors").update(updates).eq("id", inv.id);
        updatedCount++;
      }
    }
  }
  return updatedCount;
}

// ─── Main Orchestrator ───────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║   CB Insights Scraper v2 — API + Profile Scraping  ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Mode:     ${DRY_RUN ? "🧪 DRY RUN" : "🔴 LIVE"}`);
  console.log(`  Headless: ${HEADLESS}`);
  console.log(`  Batch:    ${BATCH_SIZE}`);
  console.log(`  Delay:    ${DELAY_MS}ms between requests`);
  console.log(`  Tables:   ${scrapeFirms ? "firms " : ""}${scrapeInvestors ? "investors" : ""}\n`);

  const progress = loadProgress();
  const stats = {
    firmsSearched: 0,
    firmsUpdated: 0,
    firmsNotFound: 0,
    investorsSearched: 0,
    investorsUpdated: 0,
    investorsNotFound: 0,
    errors: 0,
  };

  const browser = await chromium.launch({
    headless: HEADLESS,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "America/Los_Angeles",
  });

  // Stealth: remove webdriver flag
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    window.chrome = { runtime: {} };
  });

  const page = await context.newPage();

  // Block heavy resources
  await page.route("**/*.{png,jpg,jpeg,gif,svg,woff,woff2,mp4,webm}", (route) =>
    route.abort()
  );

  try {
    // ── Login ──
    await loginToCBInsights(page);

    // Navigate to the app home to ensure we have an authenticated session
    // and can make API calls (the login page doesn't count)
    console.log("  📡 Navigating to app home for API access...");
    await page.goto(`${CBI_APP}/chat-cbi`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await sleep(3000);

    // Verify we're actually on the app (not redirected back to login)
    const appUrl = page.url();
    if (appUrl.includes("/login")) {
      throw new Error(`Not authenticated — redirected to login: ${appUrl}`);
    }
    console.log(`  ✅ On app: ${appUrl}`);

    console.log(`  ✅ Authenticated and ready — using UI search\n`);

    // ── Phase 1: Firms ──
    if (scrapeFirms) {
      console.log("\n━━━ Phase 1: Enriching firm_records (active US-based only) ━━━\n");
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const rawBatch = await getRawFirmBatch(offset, BATCH_SIZE);
        if (rawBatch.length === 0) break; // No more rows in DB at all
        if (rawBatch.length < BATCH_SIZE) hasMore = false; // Last page

        const firms = rawBatch.filter(isUSActiveFirm);
        console.log(`    📊 Batch at offset ${offset}: ${rawBatch.length} fetched, ${firms.length} are active US-based`);

        if (firms.length === 0) {
          offset += BATCH_SIZE;
          continue; // Skip this batch, keep paginating
        }

        for (const firm of firms) {
          if (progress.completedFirmIds.includes(firm.id)) {
            continue; // Already processed
          }

          stats.firmsSearched++;
          const domain = extractDomain(firm.website_url);
          console.log(
            `  🔍 [${stats.firmsSearched}] ${firm.firm_name} (${domain || "no domain"})`
          );

          let retries = 0;
          while (retries < MAX_RETRIES) {
            try {
              // Step 1: Search using UI combobox and navigate to profile
              const navResult = await searchAndNavigate(page, firm.firm_name, domain);

              if (!navResult) {
                console.log(`  ❌ Not found on CB Insights`);
                stats.firmsNotFound++;
                appendResult({ type: "firm", id: firm.id, name: firm.firm_name, status: "not_found" });
                break;
              }

              console.log(`  📍 Found: ${navResult.dropdownData.name} — ${navResult.dropdownData.location || "?"}`);
              console.log(`  📄 Profile: ${navResult.profileUrl}`);

              // Step 2: Scrape the full profile page
              const scraped = await scrapeProfilePage(page);
              scraped.cb_insights_url = navResult.profileUrl;

              // Step 3: Write to Supabase
              const result = await updateFirmRecord(firm.id, scraped);
              if (result.updated) {
                stats.firmsUpdated++;
                console.log(`  ✅ Updated ${result.fields.length} fields: ${result.fields.join(", ")}`);
              } else {
                console.log(`  ℹ️  No new data to update`);
              }

              // Step 4: Update matching investors from team data
              if (scraped.team_members?.length > 0) {
                const invUpdated = await updateFirmInvestors(firm.id, scraped.team_members);
                if (invUpdated > 0) {
                  console.log(`  👥 Updated ${invUpdated} linked investors`);
                }
              }

              appendResult({
                type: "firm", id: firm.id, name: firm.firm_name,
                status: "updated", fields: result.fields,
              });
              progress.completedFirmIds.push(firm.id);
              saveProgress(progress);
              break; // Success
            } catch (err) {
              retries++;
              if (retries >= MAX_RETRIES) {
                console.error(`  💥 Failed after ${MAX_RETRIES} retries: ${err.message}`);
                stats.errors++;
                appendResult({ type: "firm", id: firm.id, name: firm.firm_name, status: "error", error: err.message });
              } else {
                console.warn(`  ⚠️  Retry ${retries}/${MAX_RETRIES}: ${err.message}`);
                await sleep(DELAY_MS * 2);
                // Try to recover — go back to app home
                await page.goto(`${CBI_APP}/chat-cbi`, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
                await sleep(2000);
              }
            }
          }

          await sleep(DELAY_MS);
        }

        offset += BATCH_SIZE;
      }
    }

    // ── Phase 2: Investors ──
    if (scrapeInvestors) {
      console.log("\n━━━ Phase 2: Enriching firm_investors ━━━\n");
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const investors = await getInvestorsNeedingEnrichment(offset, BATCH_SIZE);
        if (investors.length === 0) break;

        for (const investor of investors) {
          if (progress.completedInvestorIds.includes(investor.id)) continue;

          stats.investorsSearched++;
          console.log(`  🔍 [${stats.investorsSearched}] ${investor.full_name}`);

          let retries = 0;
          while (retries < MAX_RETRIES) {
            try {
              // Use UI search to find and navigate to person profile
              const personResult = await searchPersonAndNavigate(page, investor.full_name);

              if (!personResult) {
                stats.investorsNotFound++;
                console.log(`  ❌ No profile found`);
                appendResult({ type: "investor", id: investor.id, name: investor.full_name, status: "not_found" });
                break;
              }

              console.log(`  📄 Profile: ${personResult}`);

              // Scrape person profile
              await sleep(2000);
              const personData = await page.evaluate(() => {
                const data = {};
                // Get all text from labeled fields
                const items = document.querySelectorAll("li, [role='listitem']");
                for (const item of items) {
                  const text = item.textContent?.trim() || "";
                  if (text.startsWith("Title") || text.startsWith("Role"))
                    data.title = text.replace(/^(Title|Role)\s*/, "").trim();
                  if (text.startsWith("Location"))
                    data.location = text.replace(/^Location\s*/, "").trim();
                }
                // Bio/description
                const desc = document.querySelector('[class*="description"], [class*="bio"]');
                if (desc) data.bio = desc.textContent?.trim();
                // LinkedIn
                const linkedin = document.querySelector('a[href*="linkedin.com"]');
                if (linkedin) data.linkedin_url = linkedin.href;
                return data;
              });

              const updates = {};
              if (personData.bio && !investor.bio) updates.bio = personData.bio;
              if (personData.location && !investor.city) {
                const parts = personData.location.split(",").map((s) => s.trim());
                updates.city = parts[0];
                if (parts.length >= 2) updates.state = parts[1];
                if (parts.length >= 3) updates.country = parts[parts.length - 1];
              }
              if (personData.linkedin_url && !investor.linkedin_url)
                updates.linkedin_url = personData.linkedin_url;
              if (personData.title && !investor.title) updates.title = personData.title;

              if (Object.keys(updates).length > 0) {
                updates.updated_at = new Date().toISOString();
                updates.last_enriched_at = new Date().toISOString();
                if (!DRY_RUN) {
                  await supabase.from("firm_investors").update(updates).eq("id", investor.id);
                }
                stats.investorsUpdated++;
                console.log(`  ✅ Updated: ${Object.keys(updates).join(", ")}`);
              } else {
                console.log(`  ℹ️  No new data`);
              }

              appendResult({ type: "investor", id: investor.id, name: investor.full_name, status: "updated" });
              progress.completedInvestorIds.push(investor.id);
              saveProgress(progress);
              break;
            } catch (err) {
              retries++;
              if (retries >= MAX_RETRIES) {
                console.error(`  💥 Failed: ${err.message}`);
                stats.errors++;
                appendResult({ type: "investor", id: investor.id, name: investor.full_name, status: "error", error: err.message });
              } else {
                console.warn(`  ⚠️  Retry ${retries}: ${err.message}`);
                await sleep(DELAY_MS * 2);
                await page.goto(`${CBI_APP}/chat-cbi`, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
                await sleep(2000);
              }
            }
          }
          await sleep(DELAY_MS);
        }

        offset += BATCH_SIZE;
        if (investors.length < BATCH_SIZE) hasMore = false;
      }
    }
  } finally {
    await browser.close();
    logStats(stats);
    saveProgress(progress);
    if (DRY_RUN) {
      console.log("\n🧪 Dry run complete — no data was written to Supabase.");
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
