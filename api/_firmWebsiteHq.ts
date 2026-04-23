/**
 * Best-effort HQ / office discovery from a firm's own website (JSON-LD + light HTML heuristics).
 * Does not call third-party logo CDNs — HTML fetch only.
 */

import type { FirmLocationOfficeEntry, FirmLocationsWebsiteScrapeV1 } from "../src/lib/firmLocationsJson.js";
import { FIRM_LOCATIONS_JSON_VERSION, mergeWebsiteScrapeIntoLocations } from "../src/lib/firmLocationsJson.js";

const BLOCKED_HOSTS = new Set([
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "crunchbase.com",
  "angel.co",
  "cbinsights.com",
  "app.cbinsights.com",
  "signal.nfx.com",
  "pitchbook.com",
  "dealroom.co",
  "wellfound.com",
  "notion.site",
  "linktr.ee",
]);

export function normalizeWebsiteHost(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(t.includes("://") ? t : `https://${t}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function normalizeOrigin(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  try {
    const u = new URL(t.includes("://") ? t : `https://${t}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (BLOCKED_HOSTS.has(host)) return null;
    if (BLOCKED_HOSTS.has(host.replace(/^www\./, ""))) return null;
    if (host.endsWith(".linkedin.com")) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function collapseWs(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

type JsonLdAddr = { line: string; fromOrganization: boolean };

function formatPostalAddress(a: Record<string, unknown>): string | null {
  const line = collapseWs(
    [
      typeof a.streetAddress === "string" ? a.streetAddress : "",
      typeof a.addressLocality === "string" ? a.addressLocality : "",
      typeof a.addressRegion === "string" ? a.addressRegion : "",
      typeof a.addressCountry === "string" ? a.addressCountry : "",
    ]
      .filter(Boolean)
      .join(", "),
  );
  if (line.length > 6 && line.length < 220) return line;
  return null;
}

function collectJsonLdAddresses(html: string): JsonLdAddr[] {
  const out: JsonLdAddr[] = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1]?.trim();
    if (!raw) continue;
    try {
      const j = JSON.parse(raw) as unknown;
      const items: unknown[] = Array.isArray(j)
        ? j
        : j && typeof j === "object" && "@graph" in j && Array.isArray((j as { "@graph": unknown[] })["@graph"])
          ? (j as { "@graph": unknown[] })["@graph"]
          : [j];
      for (const item of items) {
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        const types = o["@type"];
        const typeStr = Array.isArray(types)
          ? types.map((x) => String(x)).join(" ")
          : typeof types === "string"
            ? types
            : "";
        const fromOrganization = /\bOrganization\b/i.test(typeStr);
        const addr = o.address ?? o.location;
        if (typeof addr === "string" && addr.length > 6 && addr.length < 220) {
          out.push({ line: collapseWs(addr.replace(/<[^>]+>/g, "")), fromOrganization });
        } else if (addr && typeof addr === "object") {
          const a = addr as Record<string, unknown>;
          const line = formatPostalAddress(a);
          if (line) out.push({ line, fromOrganization });
        }
      }
    } catch {
      /* invalid JSON-LD */
    }
  }
  return out;
}

function extractItempropAddressLines(html: string): string[] {
  const out: string[] = [];
  const localityContent = /<[^>]+itemprop=["']addressLocality["'][^>]*content=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = localityContent.exec(html)) !== null) {
    const city = collapseWs(m[1] || "");
    if (city.length > 2 && city.length < 80) out.push(city);
  }
  const localityInner = /<[^>]*itemprop=["']addressLocality["'][^>]*>([^<]{2,80})</gi;
  while ((m = localityInner.exec(html)) !== null) {
    const city = collapseWs(m[1] || "");
    if (city.length > 2 && city.length < 80) out.push(city);
  }
  const regionContent = /<[^>]+itemprop=["']addressRegion["'][^>]*content=["']([^"']+)["']/gi;
  while ((m = regionContent.exec(html)) !== null) {
    const st = collapseWs(m[1] || "");
    if (st.length > 1 && st.length < 40) out.push(st);
  }
  const regionInner = /<[^>]*itemprop=["']addressRegion["'][^>]*>([^<]{2,40})</gi;
  while ((m = regionInner.exec(html)) !== null) {
    const st = collapseWs(m[1] || "");
    if (st.length > 1 && st.length < 40) out.push(st);
  }
  return out;
}

/** Prefer "City, ST" when microdata exposes locality + region (common on marketing / VC sites). */
function extractItempropCityStateLine(html: string): string | null {
  const localities: string[] = [];
  const regions: string[] = [];
  const locContent = /<[^>]+itemprop=["']addressLocality["'][^>]*content=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = locContent.exec(html)) !== null) {
    const s = collapseWs(m[1] || "");
    if (s.length >= 2 && s.length < 80) localities.push(s);
  }
  const locInner = /<[^>]*itemprop=["']addressLocality["'][^>]*>([^<]{2,80})</gi;
  while ((m = locInner.exec(html)) !== null) {
    const s = collapseWs(m[1] || "");
    if (s.length >= 2 && s.length < 80) localities.push(s);
  }
  const regContent = /<[^>]+itemprop=["']addressRegion["'][^>]*content=["']([^"']+)["']/gi;
  while ((m = regContent.exec(html)) !== null) {
    const s = collapseWs(m[1] || "");
    if (s.length >= 2 && s.length < 40) regions.push(s);
  }
  const regInner = /<[^>]*itemprop=["']addressRegion["'][^>]*>([^<]{2,40})</gi;
  while ((m = regInner.exec(html)) !== null) {
    const s = collapseWs(m[1] || "");
    if (s.length >= 2 && s.length < 40) regions.push(s);
  }
  if (!localities[0] || !regions[0]) return null;
  return `${localities[0]}, ${regions[0]}`;
}

const HQ_LABELS = ["Headquarters", "Global headquarters", "Corporate headquarters"];
const OFFICE_LABELS = ["Office locations", "Our offices", "Locations", "Where we work"];

function extractHeadingChunksForLabels(html: string, labels: string[]): string[] {
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const text = collapseWs(stripped);
  const out: string[] = [];
  for (const label of labels) {
    const idx = text.search(new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"));
    if (idx < 0) continue;
    const slice = text.slice(idx, idx + 360);
    const tail = slice.replace(new RegExp(`^\\s*\\b${label}\\b\\s*[:\-.]*\\s*`, "i"), "");
    const chunks = tail
      .split(/(?:\s*[•·|]\s{1,}|\n+)/)
      .map((c) => collapseWs(c))
      // "Austin, TX" is 10 chars — the old `> 10` threshold dropped valid US HQ lines.
      .filter((c) => c.length >= 8 && c.length < 200);
    for (const c of chunks) {
      if (/,\s*[A-Z]{2}\b/.test(c) || /,\s*(USA|UK|United States|United Kingdom|Germany|France)\b/i.test(c)) {
        out.push(c);
      }
    }
  }
  return out;
}

function uniqKeepOrder(lines: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const k = line.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(line);
  }
  return out;
}

export type FirmWebsiteLocationBundle = {
  /** Up to four segments joined with ` · ` — primary HQ-focused display. */
  hqLine: string | null;
  /** All distinct office / address lines (capped). */
  officeLines: string[];
  /** Why `hqLine` was chosen (debug / UI). */
  hqPickReason: string | null;
  /** Structured payload suitable for `firm_records.locations`. */
  toLocationsPayload(hostname: string): FirmLocationsWebsiteScrapeV1;
};

function pickHeadquarterLine(args: {
  jsonLd: JsonLdAddr[];
  hqHeadingChunks: string[];
  officeHeadingChunks: string[];
  itempropLines: string[];
}): { line: string | null; reason: string | null } {
  const orgFirst = args.jsonLd.find((x) => x.fromOrganization);
  if (orgFirst) return { line: orgFirst.line, reason: "json_ld_organization_address" };

  if (args.hqHeadingChunks[0]) return { line: args.hqHeadingChunks[0], reason: "heading_headquarters" };

  for (const j of args.jsonLd) {
    if (j.line) return { line: j.line, reason: "json_ld_first_address" };
  }

  for (const chunk of args.officeHeadingChunks) {
    if (/\b(headquarters|global\s+hq|corporate\s+hq)\b/i.test(chunk)) {
      return { line: chunk, reason: "heading_contains_hq_keyword" };
    }
  }

  const flat = [
    ...args.hqHeadingChunks,
    ...args.officeHeadingChunks,
    ...args.jsonLd.map((j) => j.line),
    ...args.itempropLines,
  ];
  const uniq = uniqKeepOrder(flat.filter((s) => s.length > 5));
  if (uniq[0]) return { line: uniq[0], reason: "first_candidate" };
  return { line: null, reason: null };
}

export function parseAddressLineToStructured(
  line: string,
): { hq_city: string | null; hq_state: string | null; hq_country: string | null } | null {
  const t = collapseWs(line.replace(/<[^>]+>/g, ""));
  if (!t || t.length < 2) return null;
  const parts = t.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) {
    if (/^[A-Z]{2}$/i.test(parts[0])) return null;
    return { hq_city: parts[0], hq_state: null, hq_country: null };
  }
  if (parts.length === 2) {
    const a = parts[0];
    const b = parts[1];
    if (/^[A-Z]{2}$/.test(b)) {
      return { hq_city: a, hq_state: b.toUpperCase(), hq_country: "United States" };
    }
    return { hq_city: a, hq_state: null, hq_country: b };
  }
  const country = parts[parts.length - 1];
  const state = parts[parts.length - 2];
  const cityParts = parts.slice(0, -2);
  const city = cityParts.join(", ");
  if (/^[A-Z]{2}$/.test(state)) {
    return {
      hq_city: city || parts[0],
      hq_state: state.toUpperCase(),
      hq_country: country && country.length > 2 ? country : "United States",
    };
  }
  return {
    hq_city: parts[0],
    hq_state: parts[1],
    hq_country: parts.slice(2).join(", ") || null,
  };
}

function buildBundle(
  jsonLd: JsonLdAddr[],
  hqHeadingChunks: string[],
  officeHeadingChunks: string[],
  itempropLines: string[],
): FirmWebsiteLocationBundle {
  const orderedLines = uniqKeepOrder(
    [
      ...hqHeadingChunks,
      ...officeHeadingChunks,
      ...jsonLd.map((j) => j.line),
      ...itempropLines,
    ].filter((s) => s.length > 5),
  );

  const pick = pickHeadquarterLine({
    jsonLd,
    hqHeadingChunks,
    officeHeadingChunks,
    itempropLines,
  });

  const officeLines = uniqKeepOrder([...(pick.line ? [pick.line] : []), ...orderedLines])
    .filter((s) => s.length > 5)
    .slice(0, 36);

  const hqLine =
    pick.line != null
      ? pick.line
      : officeLines.length > 0
        ? officeLines.slice(0, 4).join(" · ")
        : null;

  const toLocationsPayload = (hostname: string): FirmLocationsWebsiteScrapeV1 => {
    const offices: FirmLocationOfficeEntry[] = officeLines.map((line) => ({
      line,
      role: pick.line && line === pick.line ? "hq" : "office",
    }));
    return {
      version: FIRM_LOCATIONS_JSON_VERSION,
      source: "firm_website_scrape",
      fetched_at: new Date().toISOString(),
      scrape_hostname: hostname,
      hq_line: pick.line,
      hq_pick_reason: pick.reason,
      offices,
    };
  };

  return {
    hqLine,
    officeLines,
    hqPickReason: pick.reason,
    toLocationsPayload,
  };
}

export async function resolveFirmWebsiteLocationBundle(firmWebsiteUrl: string): Promise<FirmWebsiteLocationBundle | null> {
  const origin = normalizeOrigin(firmWebsiteUrl);
  if (!origin) return null;
  const hostname = normalizeWebsiteHost(firmWebsiteUrl);
  if (!hostname) return null;

  const paths = ["", "/contact", "/locations", "/offices", "/about", "/company", "/legal", "/team"];
  const jsonLd: JsonLdAddr[] = [];
  const hqHeading: string[] = [];
  const officeHeading: string[] = [];
  const itemprops: string[] = [];

  for (const p of paths) {
    const url = p ? `${origin.replace(/\/$/, "")}${p}` : origin.replace(/\/$/, "");
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "User-Agent": "Mozilla/5.0 (compatible; VEKTA-FirmHQ/1.0; +https://vekta.app)",
        },
        signal: AbortSignal.timeout(14_000),
      });
      if (!res.ok) continue;
      const html = await res.text();
      if (html.length < 200) continue;
      jsonLd.push(...collectJsonLdAddresses(html));
      const cityState = extractItempropCityStateLine(html);
      if (cityState) itemprops.unshift(cityState);
      itemprops.push(...extractItempropAddressLines(html));
      hqHeading.push(...extractHeadingChunksForLabels(html, HQ_LABELS));
      officeHeading.push(...extractHeadingChunksForLabels(html, OFFICE_LABELS));
    } catch {
      /* network / timeout */
    }
  }

  const bundle = buildBundle(
    jsonLd,
    uniqKeepOrder(hqHeading),
    uniqKeepOrder(officeHeading),
    uniqKeepOrder(itemprops),
  );
  if (bundle.officeLines.length === 0 && !bundle.hqLine) return null;
  return bundle;
}

/** @deprecated Prefer `resolveFirmWebsiteLocationBundle`; kept for narrow call sites. */
export async function resolveFirmWebsiteHqLine(firmWebsiteUrl: string): Promise<string | null> {
  const b = await resolveFirmWebsiteLocationBundle(firmWebsiteUrl);
  return b?.hqLine ?? null;
}

export function buildMergedLocationsForPersist(
  existingLocations: unknown,
  firmWebsiteUrl: string,
  bundle: FirmWebsiteLocationBundle,
): FirmLocationsWebsiteScrapeV1 {
  const host = normalizeWebsiteHost(firmWebsiteUrl) ?? "unknown";
  const incoming = bundle.toLocationsPayload(host);
  return mergeWebsiteScrapeIntoLocations(existingLocations, incoming);
}
