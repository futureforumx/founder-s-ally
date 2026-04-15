/**
 * source-priority.ts
 * ==================
 * Per-field source priority. Merge logic consults this map to decide which
 * provenance entry wins when two sources disagree on the same field.
 *
 * Priorities are relative — numeric values don't need to be dense. Higher wins.
 */

import type { SourceName } from "./types";

const DEFAULT_PRIORITY: Record<SourceName, number> = {
  website:          90,  // official firm page is highest for description, socials, contact
  crunchbase:       85,
  cbinsights:       80,
  openvc:           75,
  tracxn:           70,
  signal_nfx:       60,
  vcsheet:          55,
  startups_gallery: 50,
  medium:           45,  // informational/voice
  substack:         45,
  linkedin:         40,  // public/company page
  angellist:        35,
  wellfound:        35,
  classification:   0,   // derived — never wins over a source value
};

/**
 * Field-specific overrides. Fall back to DEFAULT_PRIORITY if field not listed.
 */
const FIELD_OVERRIDES: Record<string, Partial<Record<SourceName, number>>> = {
  // Identity & social
  description:       { website: 95, crunchbase: 80, cbinsights: 75, tracxn: 65, openvc: 70 },
  elevator_pitch:    { website: 95, medium: 60, substack: 60 },
  website_url:       { crunchbase: 95, cbinsights: 90, tracxn: 85 }, // prefer registry sources
  linkedin_url:      { crunchbase: 95, website: 85, cbinsights: 80, linkedin: 90 },
  x_url:             { website: 90, crunchbase: 85 },
  blog_url:          { website: 95, medium: 85, substack: 85 },
  medium_url:        { website: 90, medium: 100 },
  substack_url:      { website: 90, substack: 100 },

  // Registry URLs — the source itself is authoritative for its own URL
  crunchbase_url:       { crunchbase: 100 },
  cb_insights_url:      { cbinsights: 100 },
  tracxn_url:           { tracxn: 100 },
  signal_nfx_url:       { signal_nfx: 100 },
  openvc_url:           { openvc: 100 },
  vcsheet_url:          { vcsheet: 100 },
  startups_gallery_url: { startups_gallery: 100 },
  angellist_url:        { angellist: 100 },
  wellfound_url:        { wellfound: 100 },
  pitchbook_url:        { crunchbase: 70 },

  // HQ / founded year
  hq_city:      { crunchbase: 95, website: 85, cbinsights: 80, tracxn: 70 },
  hq_state:     { crunchbase: 95, website: 85, cbinsights: 80 },
  hq_country:   { crunchbase: 95, website: 85, cbinsights: 80 },
  hq_region:    { openvc: 85, crunchbase: 75 },
  founded_year: { crunchbase: 95, cbinsights: 90, tracxn: 80, website: 70 },

  // Money
  aum:            { cbinsights: 90, crunchbase: 85, tracxn: 80 },
  aum_usd:        { cbinsights: 90, crunchbase: 85, tracxn: 80 },
  min_check_size: { openvc: 95, signal_nfx: 85, website: 80, vcsheet: 75 },
  max_check_size: { openvc: 95, signal_nfx: 85, website: 80, vcsheet: 75 },

  // Contact
  email: { website: 100, openvc: 85 },
  phone: { website: 100 },

  // Behavior / stage
  stage_focus:           { openvc: 95, signal_nfx: 85, cbinsights: 80, website: 75 },
  stage_min:             { openvc: 95, signal_nfx: 85 },
  stage_max:             { openvc: 95, signal_nfx: 85 },
  lead_or_follow:        { openvc: 90, website: 85, vcsheet: 80 },
  is_actively_deploying: { signal_nfx: 90, cbinsights: 85 },
  geo_focus:             { openvc: 90, crunchbase: 80, website: 75, signal_nfx: 70 },

  // Classifications come from the parser layer (derived), but can be set
  // directly when a source exposes a clear label.
  stage_classification:     { classification: 100 },
  structure_classification: { classification: 100, cbinsights: 85, crunchbase: 80 },
  theme_classification:     { classification: 100 },
  sector_classification:    { classification: 100 },
  impact_orientation:       { classification: 100, website: 80 },
};

/**
 * Get priority for a (field, source) pair. Higher wins.
 */
export function getPriority(field: string, source: SourceName): number {
  const override = FIELD_OVERRIDES[field]?.[source];
  if (override != null) return override;
  return DEFAULT_PRIORITY[source] ?? 0;
}

/**
 * Sort source names in descending priority for a given field.
 */
export function sortSourcesByPriority(field: string, sources: SourceName[]): SourceName[] {
  return [...sources].sort((a, b) => getPriority(field, b) - getPriority(field, a));
}
