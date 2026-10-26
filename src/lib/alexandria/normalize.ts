import { normalizeEntityNameForMatch } from "@/lib/ingestEntityMatch";

export { normalizeEntityNameForMatch };

const AGGREGATOR_HOSTS = new Set([
  "linkedin.com",
  "crunchbase.com",
  "pitchbook.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "angel.co",
  "wellfound.com",
  "medium.com",
  "substack.com",
  "github.com",
  "youtube.com",
  "bit.ly",
  "linktr.ee",
]);

function asString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

/** Lower-cased registrable-looking host without protocol, www, path or port. Null when not a plausible host. */
export function normalizeDomain(raw: unknown): string | null {
  const s = asString(raw);
  if (!s) return null;
  let host = s.toLowerCase();
  try {
    host = new URL(host.includes("://") ? host : `https://${host}`).hostname;
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
  return host;
}

export function isAggregatorDomain(domain: string | null): boolean {
  if (!domain) return false;
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (AGGREGATOR_HOSTS.has(parts.slice(i).join("."))) return true;
  }
  return false;
}

/** Canonical https URL (no tracking params, no trailing slash) or null. */
export function normalizeUrl(raw: unknown): string | null {
  const s = asString(raw);
  if (!s) return null;
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!normalizeDomain(u.hostname)) return null;
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$)/i.test(k)) u.searchParams.delete(k);
    }
    u.protocol = "https:";
    u.hostname = u.hostname.replace(/^www\./, "").toLowerCase();
    const out = u.toString().replace(/\/+$/, "");
    return out;
  } catch {
    return null;
  }
}

/** `https://www.linkedin.com/in/slug` or `/company/slug`; null for anything else. */
export function normalizeLinkedinUrl(raw: unknown, kind?: "in" | "company"): string | null {
  const s = asString(raw);
  if (!s) return null;
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "linkedin.com" && !host.endsWith(".linkedin.com")) return null;
    const m = u.pathname.match(/^\/(in|company|school)\/([^/?#]+)/i);
    if (!m) return null;
    const type = m[1].toLowerCase();
    if (kind && type !== kind) return null;
    const slug = decodeURIComponent(m[2]).toLowerCase();
    if (!slug) return null;
    return `https://www.linkedin.com/${type}/${slug}`;
  } catch {
    return null;
  }
}

export function linkedinSlug(raw: unknown): string | null {
  const url = normalizeLinkedinUrl(raw);
  if (!url) return null;
  return url.split("/").pop() ?? null;
}

export function normalizeXUrl(raw: unknown): string | null {
  const s = asString(raw);
  if (!s) return null;
  try {
    const u = new URL(s.includes("://") ? s : `https://${s}`);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "x.com" && host !== "twitter.com") return null;
    const handle = u.pathname.split("/").filter(Boolean)[0];
    if (!handle || /^(home|search|i|intent|share)$/i.test(handle)) return null;
    return `https://x.com/${handle.toLowerCase()}`;
  } catch {
    return null;
  }
}

export function normalizeEmail(raw: unknown): string | null {
  const s = asString(raw);
  if (!s) return null;
  const e = s.toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) ? e : null;
}

const NAME_SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "phd", "md", "mba", "cfa"]);

export function normalizePersonName(raw: unknown): string {
  const s = asString(raw);
  if (!s) return "";
  const tokens = s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !NAME_SUFFIXES.has(t));
  return tokens.join(" ");
}

export function personNameKey(raw: unknown): { first: string; last: string; full: string } {
  const full = normalizePersonName(raw);
  const tokens = full.split(" ").filter(Boolean);
  return { first: tokens[0] ?? "", last: tokens.length > 1 ? tokens[tokens.length - 1] : "", full };
}

const COMMON_NICKNAMES: Record<string, string> = {
  bob: "robert",
  rob: "robert",
  bill: "william",
  will: "william",
  liz: "elizabeth",
  beth: "elizabeth",
  mike: "michael",
  jim: "james",
  jimmy: "james",
  joe: "joseph",
  dave: "david",
  steve: "steven",
  chris: "christopher",
  matt: "matthew",
  tom: "thomas",
  tony: "anthony",
  dan: "daniel",
  nick: "nicholas",
  alex: "alexander",
  kate: "katherine",
  katie: "katherine",
  jen: "jennifer",
  sam: "samuel",
};

export function canonicalFirstName(first: string): string {
  return COMMON_NICKNAMES[first] ?? first;
}

export function normalizeCompanyName(raw: unknown): string {
  return normalizeEntityNameForMatch(typeof raw === "string" ? raw : null);
}

export function normalizeCountry(raw: unknown): string | null {
  const s = asString(raw);
  if (!s) return null;
  const t = s.toLowerCase().replace(/\./g, "");
  const map: Record<string, string> = {
    us: "United States",
    usa: "United States",
    "united states": "United States",
    "united states of america": "United States",
    uk: "United Kingdom",
    gb: "United Kingdom",
    "great britain": "United Kingdom",
    "united kingdom": "United Kingdom",
    ca: "Canada",
    canada: "Canada",
    de: "Germany",
    germany: "Germany",
    fr: "France",
    france: "France",
    il: "Israel",
    israel: "Israel",
    in: "India",
    india: "India",
    sg: "Singapore",
    singapore: "Singapore",
  };
  return map[t] ?? s.replace(/\s+/g, " ");
}

/** Dedupes case-insensitively and keeps first-seen spelling; drops empties. */
export function mergeTextList(existing: unknown, incoming: unknown, max = 50): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (v: unknown) => {
    const s = asString(v);
    if (!s) return;
    const k = s.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  };
  if (Array.isArray(existing)) existing.forEach(push);
  if (Array.isArray(incoming)) incoming.forEach(push);
  return out.slice(0, max);
}

export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0 || v.every((x) => isEmptyValue(x));
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

export function sameValue(a: unknown, b: unknown): boolean {
  if (isEmptyValue(a) && isEmptyValue(b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    const na = a.map((x) => String(x).trim().toLowerCase()).sort();
    const nb = b.map((x) => String(x).trim().toLowerCase()).sort();
    return na.length === nb.length && na.every((x, i) => x === nb[i]);
  }
  if (typeof a === "string" && typeof b === "string") return a.trim().toLowerCase() === b.trim().toLowerCase();
  if (typeof a === "object" && typeof b === "object" && a && b) return JSON.stringify(a) === JSON.stringify(b);
  return a === b;
}
