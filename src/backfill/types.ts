/**
 * Shared types for the backfill pipeline.
 * All adapter outputs normalize to `ExtractedProfile`.
 */

import { z } from "zod";

// ─── Source identifiers ─────────────────────────────────────────────────────

export const SOURCE_NAMES = [
  "website",
  "crunchbase",
  "cbinsights",
  "tracxn",
  "signal_nfx",
  "openvc",
  "vcsheet",
  "startups_gallery",
  "wellfound",
  "angellist",
  "medium",
  "substack",
  "linkedin",
  "classification", // produced by parsers, not a scraped source
] as const;

export type SourceName = (typeof SOURCE_NAMES)[number];

// ─── Classifications ────────────────────────────────────────────────────────

export const StageClassification = z.enum(["multi_stage", "early_stage", "growth", "buyout"]);
export type StageClassification = z.infer<typeof StageClassification>;

export const StructureClassification = z.enum([
  "partnership",
  "solo_gp",
  "syndicate",
  "cvc",
  "family_office",
  "private_equity",
]);
export type StructureClassification = z.infer<typeof StructureClassification>;

export const ThemeClassification = z.enum(["generalist", "theme_driven", "multi_theme"]);
export type ThemeClassification = z.infer<typeof ThemeClassification>;

export const SectorClassification = z.enum(["generalist", "sector_focused", "multi_sector"]);
export type SectorClassification = z.infer<typeof SectorClassification>;

export const ImpactOrientation = z.enum(["primary", "integrated", "considered", "none"]);
export type ImpactOrientation = z.infer<typeof ImpactOrientation>;

/** `lead_or_follow` canonical values — stored as TEXT in firm_records. */
export const LeadOrFollow = z.enum(["lead", "co_lead", "follow_on", "flexible"]);
export type LeadOrFollow = z.infer<typeof LeadOrFollow>;

// ─── Extracted profile (adapter output) ─────────────────────────────────────

export const ExtractedProfile = z.object({
  // Identity
  description:    z.string().optional(),
  elevator_pitch: z.string().optional(),
  website_url:    z.string().url().optional(),
  logo_url:       z.string().url().optional(),

  // Social / source URLs
  linkedin_url:          z.string().url().optional(),
  x_url:                 z.string().url().optional(),
  crunchbase_url:        z.string().url().optional(),
  tracxn_url:            z.string().url().optional(),
  cb_insights_url:       z.string().url().optional(),
  pitchbook_url:         z.string().url().optional(),
  signal_nfx_url:        z.string().url().optional(),
  openvc_url:            z.string().url().optional(),
  vcsheet_url:           z.string().url().optional(),
  startups_gallery_url:  z.string().url().optional(),
  angellist_url:         z.string().url().optional(),
  wellfound_url:         z.string().url().optional(),
  blog_url:              z.string().url().optional(),
  medium_url:            z.string().url().optional(),
  substack_url:          z.string().url().optional(),

  // HQ + identity
  hq_city:      z.string().optional(),
  hq_state:     z.string().optional(),
  hq_country:   z.string().optional(),
  hq_region:    z.string().optional(),
  founded_year: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  aum:          z.string().optional(),
  aum_usd:      z.number().int().nonnegative().optional(),
  min_check_size: z.number().int().nonnegative().optional(),
  max_check_size: z.number().int().nonnegative().optional(),
  email:        z.string().email().optional(),
  phone:        z.string().optional(),

  // Classifications (usually computed by parsers, not scraped)
  stage_classification:     StageClassification.optional(),
  structure_classification: StructureClassification.optional(),
  theme_classification:     ThemeClassification.optional(),
  sector_classification:    SectorClassification.optional(),
  impact_orientation:       ImpactOrientation.optional(),

  // Behavior / stage
  stage_focus:           z.array(z.string()).optional(),
  stage_min:             z.string().optional(),
  stage_max:             z.string().optional(),
  lead_or_follow:        LeadOrFollow.optional(),
  is_actively_deploying: z.boolean().optional(),
  geo_focus:             z.array(z.string()).optional(),

  // Tag arrays (freeform before classification)
  themes:   z.array(z.string()).optional(),
  sectors:  z.array(z.string()).optional(),
  stages:   z.array(z.string()).optional(),
  geographies: z.array(z.string()).optional(),

  // Raw evidence — kept for parsers + provenance
  raw_text:       z.string().optional(),
  raw_payload:    z.record(z.unknown()).optional(),
});
export type ExtractedProfile = z.infer<typeof ExtractedProfile>;

// ─── Provenance record ──────────────────────────────────────────────────────

export interface ProvenanceEntry {
  field_name: string;
  source_name: SourceName;
  source_url?: string | null;
  source_record_id?: string | null;
  value: unknown;
  confidence: number; // 0–1
  extracted_at?: Date;
}

// ─── Adapter contract ───────────────────────────────────────────────────────

export interface FirmSeed {
  id: string;           // firm_records.id
  firm_name: string;
  website_url?: string | null;
  linkedin_url?: string | null;
  crunchbase_url?: string | null;
  domain?: string | null;
  // Known source URLs to skip discovery
  known_urls?: Partial<Record<SourceName, string>>;
}

export interface AdapterResult {
  source: SourceName;
  source_url?: string;
  discovered: boolean;         // true if adapter discovered the source URL itself
  profile: ExtractedProfile;
  provenance: ProvenanceEntry[];
  match_confidence: number;    // 0–1, confidence that the scraped entity is the right firm
}

export interface SourceAdapter {
  name: SourceName;
  /** True if this source requires auth/session state. */
  requires_auth: boolean;
  /** Default confidence multiplier for values from this source (0–1). */
  base_confidence: number;
  /** Find the source URL for a firm if not already known. */
  discoverFirmUrl(firm: FirmSeed, ctx: AdapterContext): Promise<string | null>;
  /** Extract a complete profile from the source URL. */
  extractFirmProfile(url: string, firm: FirmSeed, ctx: AdapterContext): Promise<AdapterResult | null>;
  /** Optional: supplementary signals like recent blog posts, deal news. */
  extractSupplementalSignals?(url: string, firm: FirmSeed, ctx: AdapterContext): Promise<AdapterResult | null>;
}

// ─── Run config ─────────────────────────────────────────────────────────────

export interface BackfillConfig {
  sources: SourceName[] | "all";
  limit: number;
  offset: number;
  commit: boolean;           // true → write to Supabase
  dry_run: boolean;          // alias inverse of commit, for safety
  only_missing: boolean;     // only include firms with missing fields
  firm_id?: string;          // restrict to a single firm
  headless: boolean;
  storage_state_path?: string;
  freshness_days: number;    // re-scrape if source_last_verified_at older than this
  concurrency: number;       // concurrent firms processed
  max_retries: number;
}

// ─── Runtime context passed to adapters ─────────────────────────────────────

import type { BrowserContext, Page } from "playwright";

export interface AdapterContext {
  getPage: (source: SourceName) => Promise<Page>;
  releasePage: (source: SourceName, page: Page) => Promise<void>;
  throttle: (source: SourceName) => Promise<void>;
  logger: Logger;
  dryRun: boolean;
}

// ─── Structured logger interface ────────────────────────────────────────────

export interface Logger {
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  info:  (msg: string, meta?: Record<string, unknown>) => void;
  warn:  (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
  child: (bindings: Record<string, unknown>) => Logger;
}
