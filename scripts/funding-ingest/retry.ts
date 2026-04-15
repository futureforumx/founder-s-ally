export async function withBackoff<T>(
  label: string,
  fn: () => Promise<T>,
  opts: { retries?: number; baseMs?: number; maxMs?: number; log?: (m: string) => void } = {},
): Promise<T> {
  const retries = opts.retries ?? 4;
  const baseMs = opts.baseMs ?? 500;
  const maxMs = opts.maxMs ?? 12_000;
  const log = opts.log ?? (() => {});
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt === retries) break;
      const delay = Math.min(maxMs, baseMs * 2 ** attempt);
      const msg = e instanceof Error ? e.message : String(e);
      log(`[retry:${label}] attempt ${attempt + 1}/${retries + 1} failed (${msg}); sleeping ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
