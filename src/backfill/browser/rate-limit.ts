/**
 * browser/rate-limit.ts
 * ======================
 * Per-source token bucket + cooldown on repeated failures.
 */

import type { SourceName } from "../types";

export interface RateLimitConfig {
  /** Max concurrent requests to this source. */
  concurrency: number;
  /** Min delay between requests in ms. */
  minDelayMs: number;
  /** Seconds to cool down after N consecutive failures. */
  cooldownMs: number;
  /** Consecutive failures before cooldown triggers. */
  failureThreshold: number;
}

export const DEFAULT_RATE_LIMITS: Record<SourceName, RateLimitConfig> = {
  website:          { concurrency: 4, minDelayMs: 500,  cooldownMs: 30_000,  failureThreshold: 5 },
  crunchbase:       { concurrency: 2, minDelayMs: 2500, cooldownMs: 120_000, failureThreshold: 3 },
  cbinsights:       { concurrency: 1, minDelayMs: 3000, cooldownMs: 180_000, failureThreshold: 3 },
  tracxn:           { concurrency: 1, minDelayMs: 3000, cooldownMs: 180_000, failureThreshold: 3 },
  signal_nfx:       { concurrency: 2, minDelayMs: 2000, cooldownMs: 120_000, failureThreshold: 3 },
  openvc:           { concurrency: 3, minDelayMs: 1500, cooldownMs: 60_000,  failureThreshold: 5 },
  vcsheet:          { concurrency: 3, minDelayMs: 1500, cooldownMs: 60_000,  failureThreshold: 5 },
  startups_gallery: { concurrency: 2, minDelayMs: 2000, cooldownMs: 60_000,  failureThreshold: 5 },
  wellfound:        { concurrency: 1, minDelayMs: 4000, cooldownMs: 300_000, failureThreshold: 2 },
  angellist:        { concurrency: 1, minDelayMs: 4000, cooldownMs: 300_000, failureThreshold: 2 },
  medium:           { concurrency: 4, minDelayMs: 1000, cooldownMs: 60_000,  failureThreshold: 5 },
  substack:         { concurrency: 4, minDelayMs: 1000, cooldownMs: 60_000,  failureThreshold: 5 },
  linkedin:         { concurrency: 1, minDelayMs: 6000, cooldownMs: 600_000, failureThreshold: 2 },
  classification:   { concurrency: 16, minDelayMs: 0, cooldownMs: 0, failureThreshold: 100 },
};

interface SourceState {
  config: RateLimitConfig;
  inFlight: number;
  lastRequestTs: number;
  consecutiveFailures: number;
  cooldownUntil: number;
  waiters: Array<() => void>;
}

export class RateLimiter {
  private state = new Map<SourceName, SourceState>();

  constructor(private configs: Record<SourceName, RateLimitConfig> = DEFAULT_RATE_LIMITS) {}

  private getState(source: SourceName): SourceState {
    let st = this.state.get(source);
    if (!st) {
      st = {
        config: this.configs[source] ?? DEFAULT_RATE_LIMITS.website,
        inFlight: 0,
        lastRequestTs: 0,
        consecutiveFailures: 0,
        cooldownUntil: 0,
        waiters: [],
      };
      this.state.set(source, st);
    }
    return st;
  }

  /** Acquire a slot — blocks until concurrency + delay + cooldown allow it. */
  async acquire(source: SourceName): Promise<void> {
    const st = this.getState(source);

    // Respect cooldown
    if (st.cooldownUntil > Date.now()) {
      const wait = st.cooldownUntil - Date.now();
      await new Promise(r => setTimeout(r, wait));
    }

    // Concurrency cap
    while (st.inFlight >= st.config.concurrency) {
      await new Promise<void>(resolve => st.waiters.push(resolve));
    }

    // Min delay between requests
    const elapsed = Date.now() - st.lastRequestTs;
    if (elapsed < st.config.minDelayMs) {
      await new Promise(r => setTimeout(r, st.config.minDelayMs - elapsed));
    }

    st.inFlight++;
    st.lastRequestTs = Date.now();
  }

  /** Release a slot. */
  release(source: SourceName): void {
    const st = this.getState(source);
    st.inFlight = Math.max(0, st.inFlight - 1);
    const w = st.waiters.shift();
    if (w) w();
  }

  /** Record a successful request. */
  recordSuccess(source: SourceName): void {
    const st = this.getState(source);
    st.consecutiveFailures = 0;
  }

  /** Record a failure; triggers cooldown after threshold. */
  recordFailure(source: SourceName): void {
    const st = this.getState(source);
    st.consecutiveFailures++;
    if (st.consecutiveFailures >= st.config.failureThreshold) {
      st.cooldownUntil = Date.now() + st.config.cooldownMs;
      st.consecutiveFailures = 0;
    }
  }

  /** Run a function under rate limiting; auto records success/failure. */
  async run<T>(source: SourceName, fn: () => Promise<T>): Promise<T> {
    await this.acquire(source);
    try {
      const result = await fn();
      this.recordSuccess(source);
      return result;
    } catch (e) {
      this.recordFailure(source);
      throw e;
    } finally {
      this.release(source);
    }
  }
}
