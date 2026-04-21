/**
 * Polite fetch utility with:
 * - configurable timeout
 * - exponential back-off retry (3 attempts)
 * - rate-limit awareness (Retry-After header)
 * - User-Agent header
 * - per-domain minimum delay (prevents hammering)
 */

import type { FetchOptions, FetchResult } from "./types.ts";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRIES = 3;
const USER_AGENT = "VektaFundingBot/1.0 (+https://vekta.so/bot)";

// Simple per-domain last-fetch tracker (in-memory, per invocation)
const domainLastFetch = new Map<string, number>();
const MIN_DOMAIN_DELAY_MS = 800;

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function respectDomainRate(url: string): Promise<void> {
  const domain = extractDomain(url);
  const last = domainLastFetch.get(domain);
  if (last !== undefined) {
    const elapsed = Date.now() - last;
    if (elapsed < MIN_DOMAIN_DELAY_MS) {
      await sleep(MIN_DOMAIN_DELAY_MS - elapsed);
    }
  }
  domainLastFetch.set(domain, Date.now());
}

export async function politeGet(
  url: string,
  options: FetchOptions = {}
): Promise<FetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    ...options.headers,
  };

  await respectDomainRate(url);

  let lastError: string = "unknown error";

  for (let attempt = 1; attempt <= DEFAULT_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let resp: Response;
      try {
        resp = await fetch(url, {
          headers,
          signal: controller.signal,
          redirect: "follow",
        });
      } finally {
        clearTimeout(timer);
      }

      // Handle rate-limit responses
      if (resp.status === 429 || resp.status === 503) {
        const retryAfter = resp.headers.get("Retry-After");
        const waitMs = retryAfter
          ? parseInt(retryAfter, 10) * 1000
          : Math.pow(2, attempt) * 2000;
        console.warn(`[fetch] Rate limited on ${url}, waiting ${waitMs}ms (attempt ${attempt})`);
        await sleep(waitMs);
        lastError = `HTTP ${resp.status}`;
        continue;
      }

      const text = await resp.text();
      return {
        ok: resp.ok,
        status: resp.status,
        text,
        url: resp.url || url,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg;
      if (attempt < DEFAULT_RETRIES) {
        const backoffMs = Math.pow(2, attempt) * 1000 + Math.random() * 500;
        console.warn(`[fetch] Attempt ${attempt} failed for ${url}: ${msg}. Retrying in ${Math.round(backoffMs)}ms`);
        await sleep(backoffMs);
      }
    }
  }

  return {
    ok: false,
    status: 0,
    text: "",
    url,
    error: `All ${DEFAULT_RETRIES} attempts failed. Last error: ${lastError}`,
  };
}

/**
 * Compute SHA-256 hex of a string (for url_hash / content_hash).
 */
export async function sha256hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(s)
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
