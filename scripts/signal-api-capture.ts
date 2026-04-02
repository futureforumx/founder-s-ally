import { chromium } from "@playwright/test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const AUTH_FILE = join(process.cwd(), "data", "signal-nfx-auth.json");

async function main() {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({
    storageState: existsSync(AUTH_FILE) ? AUTH_FILE : undefined,
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  });

  const gqlRequests: any[] = [];

  // Intercept GraphQL requests to capture body + headers
  await ctx.route("https://signal-api.nfx.com/graphql", async (route) => {
    const req = route.request();
    const body = req.postData();
    const headers = req.headers();
    gqlRequests.push({ body, headers });
    await route.continue();
  });

  const page = await ctx.newPage();
  await page.goto("https://signal.nfx.com/investors", { waitUntil: "networkidle", timeout: 40_000 });
  await page.waitForTimeout(3000);

  console.log(`\nCaptured ${gqlRequests.length} GraphQL requests\n`);
  for (const r of gqlRequests) {
    const parsed = r.body ? JSON.parse(r.body) : null;
    if (parsed?.query) {
      console.log(`\n=== QUERY: ${(parsed.operationName || parsed.query?.substring(0,60))} ===`);
      console.log("Variables:", JSON.stringify(parsed.variables, null, 2));
      console.log("Query:", parsed.query?.substring(0, 800));
    }
    // Show relevant auth headers
    const authHeaders = Object.entries(r.headers).filter(([k]) =>
      ['authorization', 'cookie', 'x-auth', 'x-csrf', 'x-user', 'x-request'].includes(k.toLowerCase())
    );
    if (authHeaders.length) {
      console.log("Auth headers:", authHeaders.map(([k,v]) => `${k}: ${(v as string).substring(0,100)}`).join('\n  '));
    }
  }

  writeFileSync('/tmp/signal-gql-requests.json', JSON.stringify(gqlRequests, null, 2));
  console.log("\nSaved to /tmp/signal-gql-requests.json");
  await browser.close();
}
main().catch(console.error);
