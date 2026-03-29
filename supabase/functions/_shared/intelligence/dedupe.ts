import { normalizeText, tokenize } from "./normalize.ts";

export function buildDedupeKey(input: {
  eventType: string;
  title: string;
  publishedAt: string | null;
  primaryEntityId?: string | null;
}): string {
  const day = input.publishedAt
    ? input.publishedAt.slice(0, 10)
    : new Date().toISOString().slice(0, 10);
  const words = tokenize(input.title).slice(0, 6).join("-") || "untitled";
  const ent = input.primaryEntityId ? input.primaryEntityId.slice(0, 8) : "noent";
  return `auto:${input.eventType}:${day}:${ent}:${words}`;
}

export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const x of ta) if (tb.has(x)) inter++;
  return inter / Math.sqrt(ta.size * tb.size);
}

export function domainFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function sameStoryCluster(
  urlA: string | null,
  urlB: string | null,
  titleA: string,
  titleB: string,
  hoursApart: number,
): boolean {
  if (hoursApart > 72) return false;
  const da = domainFromUrl(urlA);
  const db = domainFromUrl(urlB);
  if (da && db && da === db && titleSimilarity(titleA, titleB) > 0.35) return true;
  if (titleSimilarity(titleA, titleB) > 0.55) return true;
  return normalizeText(titleA) === normalizeText(titleB);
}
