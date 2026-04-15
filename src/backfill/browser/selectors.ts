/**
 * browser/selectors.ts
 * =====================
 * Selector fallback chain + JSON-LD / meta-tag helpers used across adapters.
 */

import type { Page } from "playwright";

/** Try selectors in order; return text from the first match. */
export async function firstText(page: Page, selectors: string[]): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.count().catch(() => 0)) {
        const t = (await loc.textContent())?.trim();
        if (t) return t;
      }
    } catch { /* keep trying */ }
  }
  return null;
}

/** Try selectors in order; return href attribute from the first match. */
export async function firstHref(page: Page, selectors: string[]): Promise<string | null> {
  for (const sel of selectors) {
    try {
      const loc = page.locator(sel).first();
      if (await loc.count().catch(() => 0)) {
        const h = await loc.getAttribute("href");
        if (h) return h;
      }
    } catch { /* keep trying */ }
  }
  return null;
}

/** Collect all text matches across any of the selectors (dedup, trimmed). */
export async function allText(page: Page, selectors: string[]): Promise<string[]> {
  const seen = new Set<string>();
  for (const sel of selectors) {
    try {
      const items = await page.locator(sel).allTextContents();
      for (const t of items) {
        const trimmed = t.trim();
        if (trimmed && !seen.has(trimmed)) seen.add(trimmed);
      }
    } catch { /* keep trying */ }
  }
  return [...seen];
}

/** Collect all hrefs across any of the selectors (dedup). */
export async function allHref(page: Page, selectors: string[]): Promise<string[]> {
  const seen = new Set<string>();
  for (const sel of selectors) {
    try {
      const items = await page.locator(sel).evaluateAll(
        (els) => els.map((e) => (e as HTMLAnchorElement).href).filter(Boolean),
      );
      for (const h of items) if (h && !seen.has(h)) seen.add(h);
    } catch { /* keep trying */ }
  }
  return [...seen];
}

/** Extract meta tag content (og:title, description, etc.). */
export async function meta(page: Page, name: string): Promise<string | null> {
  try {
    const c = await page.locator(`meta[property="${name}"], meta[name="${name}"]`).first().getAttribute("content");
    return c?.trim() || null;
  } catch { return null; }
}

/** Extract all JSON-LD blocks as parsed objects. */
export async function jsonLd(page: Page): Promise<Record<string, unknown>[]> {
  try {
    const raw = await page.locator('script[type="application/ld+json"]').allTextContents();
    const parsed: Record<string, unknown>[] = [];
    for (const r of raw) {
      try {
        const j = JSON.parse(r);
        if (Array.isArray(j)) parsed.push(...j);
        else parsed.push(j);
      } catch { /* skip malformed */ }
    }
    return parsed;
  } catch { return []; }
}

/** Extract the canonical URL from <link rel="canonical">. */
export async function canonical(page: Page): Promise<string | null> {
  try {
    const c = await page.locator('link[rel="canonical"]').first().getAttribute("href");
    return c?.trim() || null;
  } catch { return null; }
}

/** Find all outbound links matching a regex (useful for detecting Crunchbase/CB/etc. links on a firm website). */
export async function linksMatching(page: Page, rx: RegExp): Promise<string[]> {
  try {
    const hrefs = await page.locator("a[href]").evaluateAll((els) =>
      els.map((e) => (e as HTMLAnchorElement).href).filter(Boolean),
    );
    return [...new Set(hrefs.filter((h) => rx.test(h)))];
  } catch { return []; }
}

/** Get the full visible text of the current page (strips script/style). */
export async function pageText(page: Page): Promise<string> {
  try {
    return await page.evaluate(() => {
      const clone = document.body.cloneNode(true) as HTMLElement;
      clone.querySelectorAll("script, style, noscript").forEach((el) => el.remove());
      return clone.innerText.replace(/\s+/g, " ").trim();
    });
  } catch { return ""; }
}
