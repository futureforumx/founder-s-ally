import { normalizeCompanyName } from "../../funding-ingest/normalize.js";

/** Jaccard similarity on word tokens (0–1). */
export function tokenJaccard(a: string, b: string): number {
  const ta = new Set(
    normalizeCompanyName(a)
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1),
  );
  const tb = new Set(
    normalizeCompanyName(b)
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 1),
  );
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const x of ta) {
    if (tb.has(x)) inter += 1;
  }
  const union = ta.size + tb.size - inter;
  return union ? inter / union : 0;
}
