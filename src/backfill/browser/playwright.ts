/**
 * browser/playwright.ts
 * ======================
 * Persistent browser manager for the backfill pipeline.
 *
 * - Single Chromium process; separate contexts per source adapter
 *   (so cookies/storage don't bleed across sites).
 * - Lazy page creation within contexts to cap concurrent tabs per source.
 * - storageState support per source (e.g. data/signal-nfx-auth.json).
 * - Screenshot + HTML snapshot on navigation errors.
 */

import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import type { SourceName, Logger } from "../types";

const USER_AGENTS = [
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
];

export interface BrowserOptions {
  headless?: boolean;
  storageStatePaths?: Partial<Record<SourceName, string>>;
  defaultTimeoutMs?: number;
  snapshotDir?: string;
  logger?: Logger;
}

export class BrowserManager {
  private browser: Browser | null = null;
  private contexts = new Map<SourceName, BrowserContext>();
  private pagePool = new Map<SourceName, Page[]>();
  private ua = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

  constructor(private opts: BrowserOptions) {
    mkdirSync(this.opts.snapshotDir ?? "data/snapshots", { recursive: true });
  }

  async start(): Promise<void> {
    if (this.browser) return;
    this.browser = await chromium.launch({
      headless: this.opts.headless ?? true,
      args: ["--disable-blink-features=AutomationControlled"],
    });
    this.opts.logger?.info("browser.started", { headless: this.opts.headless });
  }

  async stop(): Promise<void> {
    for (const [, pages] of this.pagePool) for (const p of pages) await p.close().catch(() => {});
    for (const [, ctx] of this.contexts) await ctx.close().catch(() => {});
    await this.browser?.close().catch(() => {});
    this.browser = null;
    this.contexts.clear();
    this.pagePool.clear();
  }

  /**
   * Get (or create) a context for a source. Each source has its own storage
   * state so authenticated sessions don't leak across domains.
   */
  async getContext(source: SourceName): Promise<BrowserContext> {
    if (!this.browser) await this.start();
    const existing = this.contexts.get(source);
    if (existing) return existing;

    const statePath = this.opts.storageStatePaths?.[source];
    const storageState = statePath && existsSync(statePath) ? statePath : undefined;

    const ctx = await this.browser!.newContext({
      storageState,
      userAgent: this.ua,
      viewport: { width: 1440, height: 900 },
      locale: "en-US",
      timezoneId: "America/New_York",
    });

    ctx.setDefaultTimeout(this.opts.defaultTimeoutMs ?? 30_000);
    ctx.setDefaultNavigationTimeout(this.opts.defaultTimeoutMs ?? 30_000);

    this.contexts.set(source, ctx);
    this.opts.logger?.debug("browser.context", { source, storageState: !!storageState });
    return ctx;
  }

  /** Persist a source's session state (for future runs). */
  async saveStorageState(source: SourceName, path: string): Promise<void> {
    const ctx = this.contexts.get(source);
    if (!ctx) return;
    mkdirSync(join(path, ".."), { recursive: true });
    await ctx.storageState({ path });
    this.opts.logger?.info("browser.state.saved", { source, path });
  }

  /** Get a fresh page for a source. */
  async getPage(source: SourceName): Promise<Page> {
    const ctx = await this.getContext(source);
    const page = await ctx.newPage();

    page.on("pageerror", (e) => this.opts.logger?.debug("page.error", { source, err: e.message }));

    if (!this.pagePool.has(source)) this.pagePool.set(source, []);
    this.pagePool.get(source)!.push(page);
    return page;
  }

  async releasePage(source: SourceName, page: Page): Promise<void> {
    const pool = this.pagePool.get(source);
    if (pool) {
      const idx = pool.indexOf(page);
      if (idx >= 0) pool.splice(idx, 1);
    }
    await page.close().catch(() => {});
  }

  /**
   * Safely navigate with retry + timeout + screenshot-on-failure.
   * Returns true if the page navigated; false if all retries failed.
   */
  async safeGoto(page: Page, url: string, opts: { retries?: number; snapshotKey?: string } = {}): Promise<boolean> {
    const retries = opts.retries ?? 2;
    const timeout = this.opts.defaultTimeoutMs ?? 30_000;

    for (let i = 0; i <= retries; i++) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout });
        return true;
      } catch (err) {
        const last = i === retries;
        this.opts.logger?.warn("page.goto.failed", { url, attempt: i + 1, err: (err as Error).message });
        if (last && opts.snapshotKey) await this.snapshot(page, opts.snapshotKey).catch(() => {});
        if (!last) await new Promise(r => setTimeout(r, 500 * Math.pow(2, i))); // exponential backoff
      }
    }
    return false;
  }

  /** Save an HTML snapshot + screenshot for debugging. */
  async snapshot(page: Page, key: string): Promise<void> {
    const dir = this.opts.snapshotDir ?? "data/snapshots";
    const safe = key.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 80);
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const base = join(dir, `${safe}_${ts}`);
    try {
      writeFileSync(`${base}.html`, await page.content());
      await page.screenshot({ path: `${base}.png`, fullPage: false }).catch(() => {});
    } catch { /* silent */ }
  }
}
