import { sleep } from "./adapter.interface";

// ─── Lightweight HTTP client with retry + rate-limit ─────────────────────────

export interface HttpClientOptions {
  rateLimitMs?: number;
  retries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  userAgent?: string;
}

export class HttpClient {
  private readonly rateLimitMs: number;
  private readonly retries: number;
  private readonly retryDelayMs: number;
  private readonly timeoutMs: number;
  private readonly userAgent: string;
  private lastRequestAt = 0;

  constructor(opts: HttpClientOptions = {}) {
    this.rateLimitMs = opts.rateLimitMs ?? 500;
    this.retries = opts.retries ?? 3;
    this.retryDelayMs = opts.retryDelayMs ?? 2_000;
    this.timeoutMs = opts.timeoutMs ?? 15_000;
    this.userAgent =
      opts.userAgent ?? "FounderIntelBot/1.0 (+https://github.com/founder-intel)";
  }

  async get<T = unknown>(url: string, headers: Record<string, string> = {}): Promise<T> {
    await this.throttle();
    return this.withRetry(async () => {
      const res = await fetch(url, {
        headers: { "User-Agent": this.userAgent, ...headers },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) {
        throw new HttpError(res.status, `HTTP ${res.status} fetching ${url}`);
      }
      return res.json() as Promise<T>;
    });
  }

  async getText(url: string, headers: Record<string, string> = {}): Promise<string> {
    await this.throttle();
    return this.withRetry(async () => {
      const res = await fetch(url, {
        headers: { "User-Agent": this.userAgent, ...headers },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) {
        throw new HttpError(res.status, `HTTP ${res.status} fetching ${url}`);
      }
      return res.text();
    });
  }

  async post<T = unknown>(
    url: string,
    body: unknown,
    headers: Record<string, string> = {}
  ): Promise<T> {
    await this.throttle();
    return this.withRetry(async () => {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": this.userAgent,
          ...headers,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      if (!res.ok) {
        throw new HttpError(res.status, `HTTP ${res.status} posting to ${url}`);
      }
      return res.json() as Promise<T>;
    });
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestAt;
    if (elapsed < this.rateLimitMs) {
      await sleep(this.rateLimitMs - elapsed);
    }
    this.lastRequestAt = Date.now();
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (err instanceof HttpError && err.status < 500) throw err; // client errors → no retry
        if (attempt < this.retries) {
          await sleep(this.retryDelayMs * (attempt + 1));
        }
      }
    }
    throw lastError;
  }
}

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}
