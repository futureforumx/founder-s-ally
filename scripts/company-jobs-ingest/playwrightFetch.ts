/**
 * Optional headless Chromium fetch for SPA careers pages.
 * Used only from the company-jobs-ingest worker — never imported by the Vite app.
 *
 * Opt-out: COMPANY_JOBS_PLAYWRIGHT=0
 * Opt-in default: enabled when playwright resolves (CI should install browsers).
 */
export async function fetchHtmlWithPlaywright(
  url: string,
  log: (m: string) => void,
  timeoutMs = 45_000,
): Promise<string | null> {
  if (process.env.COMPANY_JOBS_PLAYWRIGHT === "0") {
    return null;
  }
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    try {
      const page = await browser.newPage({
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      });
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: 12_000 }).catch(() => {
        /* SPA may never reach networkidle */
      });
      await new Promise((r) => setTimeout(r, 2500));
      const html = await page.content();
      log(`Playwright fetched ${url} (${html.length} chars)`);
      return html;
    } finally {
      await browser.close();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`Playwright fetch failed for ${url}: ${msg}`);
    return null;
  }
}

export function shouldTryPlaywrightForHtml(html: string, hintsOrJobsFound: boolean): boolean {
  if (process.env.COMPANY_JOBS_PLAYWRIGHT === "0") return false;
  if (hintsOrJobsFound) return false;
  const h = html.slice(0, 120_000);
  const len = html.length;
  const spaLikely =
    /__NEXT_DATA__|id="__next"|data-framer-|react-root|ng-app|nuxt|vite\/@react|window\.__NUXT__/i.test(
      h,
    );
  const thinShell = len < 9000 && /root|__next|app-mount/i.test(h);
  return spaLikely || thinShell;
}
