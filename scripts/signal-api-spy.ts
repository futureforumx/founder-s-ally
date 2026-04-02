import { chromium } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const AUTH_FILE = join(process.cwd(), "data", "signal-nfx-auth.json");

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({
    storageState: existsSync(AUTH_FILE) ? AUTH_FILE : undefined,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });

  const captured: string[] = [];
  ctx.on("request", req => {
    const url = req.url();
    const ct = req.headers()["content-type"] || "";
    if (!url.includes("google") && !url.includes("analytics") && !url.includes("intercom") && !url.includes("mixpanel") && !url.includes("openreplay") && !url.includes("nr-data")) {
      captured.push(`${req.method()} ${url}`);
    }
  });
  ctx.on("response", async resp => {
    const url = resp.url();
    const ct = resp.headers()["content-type"] || "";
    if (ct.includes("json") && !url.includes("google") && !url.includes("analytics") && !url.includes("intercom") && !url.includes("mixpanel")) {
      try {
        const body = await resp.text();
        console.log(`\n=== JSON RESPONSE: ${resp.request().method()} ${url} (${resp.status()}) ===`);
        console.log(body.substring(0, 1500));
      } catch {}
    }
  });

  const page = await ctx.newPage();
  console.log("Loading /investors...");
  await page.goto("https://signal.nfx.com/investors", { waitUntil: "networkidle", timeout: 40_000 });
  console.log(`URL: ${page.url()}`);
  await page.waitForTimeout(3000);

  console.log("\n=== All captured requests ===");
  [...new Set(captured)].forEach(r => console.log(r));

  await browser.close();
}

main().catch(console.error);
