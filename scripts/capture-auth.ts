#!/usr/bin/env tsx
/**
 * capture-auth.ts
 * ================
 * Launches a headed browser for Signal NFX and/or CB Insights, logs in,
 * and saves the Playwright storageState to data/sessions/ for future
 * headless enrichment runs.
 *
 * Signal NFX — manual login (opens browser, you log in, script saves state)
 * CB Insights — auto-login using CBI_EMAIL + CBI_PASSWORD from .env
 *
 * Usage:
 *   npx tsx scripts/capture-auth.ts                   # both sources
 *   npx tsx scripts/capture-auth.ts --source=signal_nfx
 *   npx tsx scripts/capture-auth.ts --source=cbinsights
 *
 * Env (.env / .env.local):
 *   CBI_EMAIL            CB Insights login email
 *   CBI_PASSWORD         CB Insights password
 *   SIGNAL_NFX_EMAIL     Optional — if NFX supports password login, pre-fills email
 *   SIGNAL_NFX_PASSWORD  Optional
 */

import { chromium, type BrowserContext } from "@playwright/test";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFiles } from "./lib/loadEnvFiles";

loadEnvFiles([".env", ".env.local", ".env.enrichment"]);

const e = (n: string) => (process.env[n] || "").trim();

const SESSIONS_DIR = join(process.cwd(), "data", "sessions");
const SIGNAL_AUTH  = join(SESSIONS_DIR, "signal-nfx.json");
const CBI_AUTH     = join(SESSIONS_DIR, "cbinsights.json");

// Parse --source flag
const args = process.argv.slice(2);
const sourceFlag = args.find(a => a.startsWith("--source="))?.split("=")[1] ?? "all";
const doSignal = sourceFlag === "all" || sourceFlag === "signal_nfx" || sourceFlag === "signal";
const doCbi    = sourceFlag === "all" || sourceFlag === "cbinsights" || sourceFlag === "cbi";

function ensureSessionsDir() {
  if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Signal NFX ─────────────────────────────────────────────────────────────

async function captureSignalNfx() {
  console.log("\n[signal.nfx] Starting auth capture (headed browser)...");

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const ctx: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();

  await page.goto("https://signal.nfx.com/login", { waitUntil: "domcontentloaded" });

  // Auto-fill if credentials are available
  const email    = e("SIGNAL_NFX_EMAIL");
  const password = e("SIGNAL_NFX_PASSWORD");
  if (email && password) {
    console.log("[signal.nfx] Credentials found — attempting auto-login...");
    await sleep(1500);
    try {
      await page.fill('input[type="email"], input[name="email"], #email', email);
      await sleep(400);
      await page.fill('input[type="password"], input[name="password"], #password', password);
      await sleep(400);
      await page.click('button[type="submit"], button:has-text("Log In"), button:has-text("Sign In")');
    } catch {
      console.log("[signal.nfx] Auto-fill failed — please log in manually in the browser.");
    }
  } else {
    console.log("[signal.nfx] No credentials found. Please log in manually in the browser window.");
    console.log("[signal.nfx] Set SIGNAL_NFX_EMAIL + SIGNAL_NFX_PASSWORD in .env.local for auto-login.");
  }

  console.log("[signal.nfx] Waiting for login to complete (up to 3 minutes)...");
  console.log("[signal.nfx] The script will auto-save once you reach a non-login page.");

  await page.waitForURL(
    url => !url.toString().includes("/login") && !url.toString().includes("/auth"),
    { timeout: 180_000 },
  ).catch(() => {
    console.error("[signal.nfx] ⚠️  Timed out waiting for login. Auth NOT saved.");
    return null;
  });

  const currentUrl = page.url();
  if (currentUrl.includes("/login") || currentUrl.includes("/auth")) {
    console.error("[signal.nfx] ❌ Login did not complete. Auth NOT saved.");
  } else {
    await sleep(1000); // Let cookies settle
    await ctx.storageState({ path: SIGNAL_AUTH });
    console.log(`[signal.nfx] ✅ Auth saved → ${SIGNAL_AUTH}`);
  }

  await browser.close();
}

// ─── CB Insights ─────────────────────────────────────────────────────────────

async function captureCbInsights() {
  const email    = e("CBI_EMAIL");
  const password = e("CBI_PASSWORD");

  if (!email || !password) {
    console.error("[cbinsights] ❌ Missing CBI_EMAIL or CBI_PASSWORD in .env");
    console.error("             Add them to .env.local and re-run.");
    return;
  }

  console.log("\n[cbinsights] Starting auth capture...");

  const browser = await chromium.launch({
    headless: false, // Headed so you can handle MFA/CAPTCHA if needed
    slowMo: 80,
  });
  const ctx: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
  });
  const page = await ctx.newPage();

  console.log("[cbinsights] Navigating to login page...");
  await page.goto("https://app.cbinsights.com/login", { waitUntil: "domcontentloaded" });
  await sleep(2000);

  try {
    // Fill email
    const emailSel = 'input[type="email"], input[name="email"], #email, input[placeholder*="email" i]';
    await page.waitForSelector(emailSel, { timeout: 15000 });
    await page.fill(emailSel, email);
    await sleep(300);

    // Some forms have a "Continue" button before showing password
    const continueBtn = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
    if (await continueBtn.isVisible().catch(() => false)) {
      await continueBtn.click();
      await sleep(1000);
    }

    // Fill password
    const passSel = 'input[type="password"], input[name="password"], #password';
    await page.waitForSelector(passSel, { timeout: 10000 });
    await page.fill(passSel, password);
    await sleep(300);

    // Submit
    await page.click('button[type="submit"], button:has-text("Log In"), button:has-text("Sign In"), button:has-text("Login")');
    console.log("[cbinsights] Credentials submitted — waiting for dashboard...");
  } catch (err) {
    console.warn(`[cbinsights] Auto-fill error: ${err}. Please complete login manually.`);
  }

  // Wait for any MFA or captcha to be resolved by user
  console.log("[cbinsights] Waiting for successful login (up to 3 minutes — complete any 2FA/CAPTCHA manually)...");

  await page.waitForURL(
    url => {
      const u = url.toString();
      return !u.includes("/login") && !u.includes("/auth") && !u.includes("/sso");
    },
    { timeout: 180_000 },
  ).catch(() => {
    console.error("[cbinsights] ⚠️  Timed out waiting for dashboard. Auth NOT saved.");
    return null;
  });

  const currentUrl = page.url();
  if (currentUrl.includes("/login") || currentUrl.includes("/auth")) {
    console.error("[cbinsights] ❌ Login did not complete. Auth NOT saved.");
  } else {
    await sleep(1500); // Let auth cookies fully settle
    await ctx.storageState({ path: CBI_AUTH });
    console.log(`[cbinsights] ✅ Auth saved → ${CBI_AUTH}`);
  }

  await browser.close();
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  ensureSessionsDir();
  console.log("=".repeat(60));
  console.log("  Vekta Auth Capture");
  console.log(`  Sources: ${sourceFlag === "all" ? "signal_nfx, cbinsights" : sourceFlag}`);
  console.log("=".repeat(60));

  if (doSignal) {
    if (existsSync(SIGNAL_AUTH)) {
      console.log(`\n[signal.nfx] Auth file already exists at ${SIGNAL_AUTH}`);
      console.log("  To re-capture, delete the file and re-run.");
    } else {
      await captureSignalNfx();
    }
  }

  if (doCbi) {
    if (existsSync(CBI_AUTH)) {
      console.log(`\n[cbinsights] Auth file already exists at ${CBI_AUTH}`);
      console.log("  To re-capture, delete the file and re-run.");
    } else {
      await captureCbInsights();
    }
  }

  console.log("\n✅ Auth capture complete.");
  console.log("   Now run Phase 1 enrichment:");
  console.log("   npx tsx scripts/enrich-investors-phase1.ts\n");
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
