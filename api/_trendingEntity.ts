export function normalizeDomain(input: string): string {
  const raw = input.trim().toLowerCase();
  if (!raw) return "";
  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^www\./, "").split("/")[0] ?? "";
  }
}

const BRAND_SUFFIXES = /\b(inc|llc|ltd|corp|co|ai|labs|lab|io|hq|app|technologies|technology|software)\b/g;

export function normalizeBrand(input: string): string {
  return input
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(BRAND_SUFFIXES, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let prev = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cur = row[j] ?? 0;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min((row[j] ?? 0) + 1, prev + 1, (row[j - 1] ?? 0) + cost);
      prev = cur;
    }
  }
  return row[b.length] ?? 0;
}

export function brandSimilarity(a: string, b: string): number {
  const left = normalizeBrand(a);
  const right = normalizeBrand(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.92;
  const dist = levenshtein(left, right);
  const maxLen = Math.max(left.length, right.length);
  return maxLen === 0 ? 0 : 1 - dist / maxLen;
}

export function isSameStartupEntity(a: {
  name: string;
  domain: string;
  brandAliases?: string[];
}, b: {
  name: string;
  domain: string;
  brandAliases?: string[];
}): boolean {
  const domainA = normalizeDomain(a.domain);
  const domainB = normalizeDomain(b.domain);
  if (domainA && domainB && domainA === domainB) return true;

  const namesA = [a.name, ...(a.brandAliases ?? [])];
  const namesB = [b.name, ...(b.brandAliases ?? [])];
  for (const left of namesA) {
    for (const right of namesB) {
      if (brandSimilarity(left, right) >= 0.86) return true;
    }
  }
  return false;
}
