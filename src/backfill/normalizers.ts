/**
 * normalizers.ts
 * ===============
 * Normalize raw extracted values so they can be compared/merged cleanly.
 */

import type { ExtractedProfile } from "./types";
import { normalizeUrl } from "./parsers/url-parser";
import { parseGeo, parseGeoFocus } from "./parsers/geo-parser";
import { canonicalizeStages, STAGE_DISPLAY } from "./parsers/stage-parser";
import { parseCheckSize } from "./parsers/check-size-parser";

const URL_KEYS = [
  "website_url", "logo_url",
  "linkedin_url", "x_url",
  "crunchbase_url", "tracxn_url", "cb_insights_url", "pitchbook_url",
  "signal_nfx_url", "openvc_url", "vcsheet_url", "startups_gallery_url",
  "angellist_url", "wellfound_url", "blog_url", "medium_url", "substack_url",
] as const;

function normalizeYear(val: unknown): number | undefined {
  if (typeof val === "number") return val >= 1900 && val <= new Date().getFullYear() ? val : undefined;
  if (typeof val === "string") {
    const m = val.match(/\b(19|20)\d{2}\b/);
    if (m) return parseInt(m[0], 10);
  }
  return undefined;
}

function normalizeAumUsd(aum: string | undefined): number | undefined {
  if (!aum) return undefined;
  const cs = parseCheckSize(aum);
  return cs.max ?? cs.min;
}

/** Normalize all fields in an ExtractedProfile in place. Returns cleaned copy. */
export function normalizeProfile(p: ExtractedProfile): ExtractedProfile {
  const out: ExtractedProfile = { ...p };

  // URLs
  for (const key of URL_KEYS) {
    const v = out[key] as string | undefined;
    if (v) (out as Record<string, unknown>)[key] = normalizeUrl(v) ?? undefined;
  }

  // Founded year
  if (out.founded_year != null) out.founded_year = normalizeYear(out.founded_year);

  // AUM USD
  if (!out.aum_usd && out.aum) out.aum_usd = normalizeAumUsd(out.aum);

  // Canonical stage_focus
  if (out.stages?.length) {
    const canon = canonicalizeStages(out.stages);
    if (canon.length) {
      out.stages = canon.map((c) => STAGE_DISPLAY[c]);
      if (!out.stage_focus?.length) out.stage_focus = canon.map((c) => STAGE_DISPLAY[c]);
      if (!out.stage_min) out.stage_min = STAGE_DISPLAY[canon[0]];
      if (!out.stage_max) out.stage_max = STAGE_DISPLAY[canon[canon.length - 1]];
    }
  }

  // Geo focus
  if (out.geographies?.length && !out.geo_focus?.length) {
    out.geo_focus = parseGeoFocus(out.geographies);
  }

  // HQ parsing if we only got a raw string in city
  if (out.hq_city && !out.hq_country) {
    const g = parseGeo(out.hq_city);
    if (g) {
      if (g.country && !out.hq_country) out.hq_country = g.country;
      if (g.state && !out.hq_state)     out.hq_state = g.state;
      if (g.region && !out.hq_region)   out.hq_region = g.region;
      if (g.city)                       out.hq_city = g.city;
    }
  }

  // Trim strings
  for (const k of Object.keys(out) as Array<keyof ExtractedProfile>) {
    const v = out[k];
    if (typeof v === "string") (out as Record<string, unknown>)[k] = v.trim() || undefined;
  }

  return out;
}
