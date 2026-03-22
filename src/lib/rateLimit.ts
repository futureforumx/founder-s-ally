/**
 * Client-side rate limiter using a sliding window per action key.
 * Prevents rapid-fire API calls from the browser.
 */

const windows: Record<string, number[]> = {};

export function isRateLimited(
  key: string,
  maxRequests = 30,
  windowMs = 60_000
): boolean {
  const now = Date.now();
  if (!windows[key]) windows[key] = [];

  // Purge expired timestamps
  windows[key] = windows[key].filter((t) => now - t < windowMs);

  if (windows[key].length >= maxRequests) return true;

  windows[key].push(now);
  return false;
}
