/**
 * Helpers for `firm_records.locations` (jsonb): website scrapes, imports, etc.
 */

export const FIRM_LOCATIONS_JSON_VERSION = 1 as const;

export type FirmLocationOfficeEntry = {
  line: string;
  role?: "hq" | "office";
};

export type FirmLocationsWebsiteScrapeV1 = {
  version: typeof FIRM_LOCATIONS_JSON_VERSION;
  source: "firm_website_scrape";
  fetched_at: string;
  scrape_hostname: string;
  /** Canonical HQ line chosen from page signals (may match one of `offices`). */
  hq_line: string | null;
  hq_pick_reason: string | null;
  offices: FirmLocationOfficeEntry[];
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function officeLineFromEntry(e: unknown): string | null {
  if (typeof e === "string") {
    const t = e.trim();
    return t.length > 0 ? t : null;
  }
  if (!isRecord(e)) return null;
  const line = typeof e.line === "string" ? e.line.trim() : "";
  return line.length > 0 ? line : null;
}

/** Prefer explicit HQ line stored on the payload. */
export function pickHqLineFromLocationsJson(locations: unknown): string | null {
  if (!isRecord(locations)) return null;
  const hq = typeof locations.hq_line === "string" ? locations.hq_line.trim() : "";
  if (hq) return hq;
  const offices = locations.offices;
  if (!Array.isArray(offices)) return null;
  for (const o of offices) {
    if (!isRecord(o)) continue;
    if (o.role === "hq") {
      const line = typeof o.line === "string" ? o.line.trim() : "";
      if (line) return line;
    }
  }
  return null;
}

/** All office lines for tooltips / secondary UI (deduped, order preserved). */
export function allOfficeLinesFromLocationsJson(locations: unknown): string[] {
  if (!isRecord(locations)) return [];
  const offices = locations.offices;
  if (!Array.isArray(offices)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const o of offices) {
    const line = officeLineFromEntry(o);
    if (!line) continue;
    const k = line.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(line);
  }
  return out;
}

export function mergeWebsiteScrapeIntoLocations(
  existing: unknown,
  incoming: FirmLocationsWebsiteScrapeV1,
): FirmLocationsWebsiteScrapeV1 {
  const priorLines: string[] = [];
  if (isRecord(existing) && Array.isArray(existing.offices)) {
    for (const o of existing.offices) {
      const line = officeLineFromEntry(o);
      if (line) priorLines.push(line);
    }
  }
  const mergedOffices: FirmLocationOfficeEntry[] = [];
  const seen = new Set<string>();
  const push = (line: string, role?: "hq" | "office") => {
    const k = line.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    mergedOffices.push({ line, role });
  };
  for (const line of priorLines) push(line, "office");
  for (const o of incoming.offices) {
    if (o.line) push(o.line, o.role);
  }
  return {
    ...incoming,
    offices: mergedOffices,
  };
}
