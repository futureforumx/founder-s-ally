/**
 * startups.gallery publishes a Framer search-index JSON with structured copy
 * for every /investors/* and /companies/* route (titles, h1–h3, body paragraphs).
 *
 * URLs are taken from page <meta name="framer-search-index"> on startups.gallery.
 */

export const STARTUPS_GALLERY_ORIGIN = "https://startups.gallery";

/** Primary + fallback index URLs from site HTML (Apr 2026). */
export const DEFAULT_SEARCH_INDEX_URLS: readonly string[] = [
  "https://framerusercontent.com/sites/eQ8EfGgqmp8FpeXNnf1bo/searchIndex-tFYpOX0gNCOZ.json",
  "https://framerusercontent.com/sites/eQ8EfGgqmp8FpeXNnf1bo/searchIndex-T4kD7F9lgXRS.json",
] as const;

export type GalleryIndexEntry = {
  version?: number;
  title?: string;
  description?: string;
  h1?: string[];
  h2?: string[];
  h3?: string[];
  p?: string[];
  url?: string;
};

const NAV_LOWER = new Set(
  [
    "join for free",
    "visit website",
    "view jobs",
    "backed by",
    "work type",
    "remote",
    "onsite",
    "hybrid",
    "stages",
    "bootstrapped",
    "pre-seed",
    "seed",
    "series a",
    "series b",
    "series c",
    "series d",
    "series e",
    "venture",
    "industries",
    "see all industries",
    "investors",
    "see all investors",
    "cities",
    "countries",
    "about · sponsor · submit ↗",
    "crafted by louis and gonzalo",
    "explore",
    "jobs",
    "news",
    "analytics",
    "aerospace",
    "ai",
    "biotech",
    "climate",
    "construction",
    "consumer",
    "cybersecurity",
    "design",
    "devtools",
    "education",
    "energy",
    "fintech",
    "chicago",
    "los angeles",
    "new york",
    "philadelphia",
    "austin",
    "boston",
    "dallas",
    "denver",
    "portland",
    "san diego",
    "san francisco",
    "san jose",
    "seattle",
    "washington, dc",
    "armenia",
    "australia",
    "canada",
    "denmark",
    "france",
    "germany",
    "hungary",
    "india",
    "ireland",
    "israel",
    "netherlands",
    "singapore",
    "spain",
    "sweden",
  ].map((s) => s.toLowerCase()),
);

function isBoilerplateParagraph(s: string): boolean {
  const t = s.trim().toLowerCase();
  if (t.length < 2) return true;
  if (NAV_LOWER.has(t)) return true;
  if (/^raised \$/.test(t)) return true;
  if (/posted on\b/i.test(t)) return true;
  if (/· series\b/i.test(t) && /· based in\b/i.test(t)) return true;
  if (/^find top startups funded by\b/i.test(t)) return true;
  return false;
}

/** URL slug from path `/investors/foo-bar` → `foo-bar`. */
export function galleryPathSlug(path: string): string | null {
  const m = path.trim().match(/^\/investors\/([^/]+)\/?$/i);
  return m ? m[1]!.toLowerCase() : null;
}

export function galleryCompanySlug(path: string): string | null {
  const m = path.trim().match(/^\/companies\/([^/]+)\/?$/i);
  return m ? m[1]!.toLowerCase() : null;
}

export function slugifyFirmKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

export function pickInvestorDescription(entry: GalleryIndexEntry): string | null {
  for (const raw of entry.p ?? []) {
    const s = raw.trim();
    if (s.length < 80) continue;
    if (isBoilerplateParagraph(s)) continue;
    return s;
  }
  return null;
}

export function pickCompanyDescription(entry: GalleryIndexEntry): string | null {
  for (const raw of entry.p ?? []) {
    const s = raw.trim();
    if (s.length < 90) continue;
    if (isBoilerplateParagraph(s)) continue;
    return s;
  }
  return null;
}

/** Portfolio / featured startup names from investor index cards (h3 headings). */
export function pickInvestorPortfolioNames(entry: GalleryIndexEntry): string[] {
  const names = (entry.h3 ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 1 && s.length < 120);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of names) {
    const k = n.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

export function displayNameFromInvestorEntry(entry: GalleryIndexEntry): string | null {
  const h = entry.h1?.[0]?.trim();
  return h || null;
}

export function displayNameFromCompanyEntry(entry: GalleryIndexEntry): string | null {
  const h = entry.h1?.[0]?.trim();
  return h || null;
}

export async function fetchStartupsGallerySearchIndex(
  urls: readonly string[] = DEFAULT_SEARCH_INDEX_URLS,
): Promise<Record<string, GalleryIndexEntry>> {
  let lastErr: string | null = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": "VektaApp/1.0 (firm enrichment; +https://startups.gallery)",
        },
      });
      if (!res.ok) {
        lastErr = `${url} → HTTP ${res.status}`;
        continue;
      }
      const data = (await res.json()) as Record<string, GalleryIndexEntry>;
      if (data && typeof data === "object" && Object.keys(data).length > 100) {
        return data;
      }
      lastErr = `${url} → empty object`;
    } catch (e) {
      lastErr = `${url} → ${(e as Error).message}`;
    }
  }
  throw new Error(`Could not load startups.gallery search index: ${lastErr ?? "unknown"}`);
}

export function splitInvestorsAndCompanies(index: Record<string, GalleryIndexEntry>): {
  investors: Map<string, { path: string; entry: GalleryIndexEntry }>;
  companies: Map<string, { path: string; entry: GalleryIndexEntry }>;
} {
  const investors = new Map<string, { path: string; entry: GalleryIndexEntry }>();
  const companies = new Map<string, { path: string; entry: GalleryIndexEntry }>();
  for (const [path, entry] of Object.entries(index)) {
    const inv = galleryPathSlug(path);
    if (inv) {
      investors.set(inv, { path, entry });
      continue;
    }
    const co = galleryCompanySlug(path);
    if (co) {
      companies.set(co, { path, entry });
    }
  }
  return { investors, companies };
}
