/**
 * Shared types for the People Intelligence Graph backend.
 * Follows the same conventions as src/backfill/types.ts.
 */

import { z } from "zod";

// ─── Canonical entity references ─────────────────────────────────────────────

export const PERSON_ENTITY_TYPES = [
  "firm_investor",
  "operator_profile",
  "startup_founder",
  "generic",
] as const;

export const ORG_ENTITY_TYPES = [
  "firm_record",
  "organization",
  "startup",
  "portfolio_company",
  "generic",
] as const;

export type PersonEntityType = (typeof PERSON_ENTITY_TYPES)[number];
export type OrgEntityType = (typeof ORG_ENTITY_TYPES)[number];

export interface EntityRef {
  entity_type: string;
  entity_id: string;
}

// ─── Source providers ─────────────────────────────────────────────────────────

export const PROVIDERS = [
  "linkedin",
  "x",
  "github",
  "crunchbase",
  "angellist",
  "wellfound",
  "website_official",
  "website_team_page",
  "website_personal",
  "press_release",
  "speaker_page",
  "podcast_page",
  "medium",
  "substack",
  "signal_nfx",
  "pitchbook",
  "tracxn",
] as const;

export type Provider = (typeof PROVIDERS)[number];

export const PROVIDER_PRIORITY: Record<Provider, number> = {
  website_official: 100,
  website_personal: 95,
  website_team_page: 90,
  linkedin: 85,
  press_release: 75,
  speaker_page: 70,
  podcast_page: 65,
  medium: 60,
  substack: 58,
  x: 55,
  github: 50,
  angellist: 45,
  wellfound: 43,
  crunchbase: 40,
  signal_nfx: 38,
  pitchbook: 36,
  tracxn: 34,
};

// ─── Normalized person profile (output of source parsers) ────────────────────

export const NormalizedPersonProfile = z.object({
  full_name:     z.string().optional(),
  first_name:    z.string().optional(),
  last_name:     z.string().optional(),
  headline:      z.string().optional(),
  bio:           z.string().optional(),
  location:      z.string().optional(),
  photo_url:     z.string().url().optional(),
  email:         z.string().email().optional(),
  linkedin_url:  z.string().url().optional(),
  x_url:         z.string().url().optional(),
  github_url:    z.string().url().optional(),
  website_url:   z.string().url().optional(),
  current_title: z.string().optional(),
  current_company: z.string().optional(),
  skills:        z.array(z.string()).optional(),
  topics:        z.array(z.string()).optional(),
  role_history:  z.array(z.object({
    title:        z.string(),
    company_name: z.string(),
    start_date:   z.string().optional(),
    end_date:     z.string().optional(),
    is_current:   z.boolean().optional(),
    description:  z.string().optional(),
  })).optional(),
  education:     z.array(z.object({
    institution: z.string(),
    degree:      z.string().optional(),
    field:       z.string().optional(),
    start_year:  z.number().optional(),
    end_year:    z.number().optional(),
  })).optional(),
  raw_text:      z.string().optional(),
});

export type NormalizedPersonProfile = z.infer<typeof NormalizedPersonProfile>;

// ─── Normalized org profile ───────────────────────────────────────────────────

export const NormalizedOrgProfile = z.object({
  name:           z.string().optional(),
  website_url:    z.string().url().optional(),
  linkedin_url:   z.string().url().optional(),
  description:    z.string().optional(),
  hq_city:        z.string().optional(),
  hq_state:       z.string().optional(),
  hq_country:     z.string().optional(),
  founded_year:   z.number().int().optional(),
  headcount_band: z.string().optional(),
  sectors:        z.array(z.string()).optional(),
  stage_focus:    z.array(z.string()).optional(),
  team_members:   z.array(z.object({
    name:        z.string(),
    title:       z.string().optional(),
    linkedin_url: z.string().url().optional(),
  })).optional(),
  recent_hires:   z.array(z.object({
    name:    z.string(),
    title:   z.string().optional(),
    date:    z.string().optional(),
  })).optional(),
  raw_text:       z.string().optional(),
});

export type NormalizedOrgProfile = z.infer<typeof NormalizedOrgProfile>;

// ─── Role history entry (parsed, typed) ───────────────────────────────────────

export interface RoleEntry {
  title:                    string;
  company_name:             string;
  company_entity_type?:     string;
  company_entity_id?:       string;
  normalized_role_function?: string;
  seniority_level?:         string;
  start_date?:              string;  // ISO date string YYYY-MM-DD
  end_date?:                string;
  is_current:               boolean;
  confidence:               number;
  source_provider:          string;
}

// ─── Activity signal ─────────────────────────────────────────────────────────

export interface ActivitySignal {
  signal_type:       string;
  signal_subtype?:   string;
  signal_date?:      Date;
  source_provider:   string;
  source_url?:       string;
  extracted_text?:   string;
  structured_payload?: Record<string, unknown>;
  confidence:        number;
}

// ─── Relationship edge ────────────────────────────────────────────────────────

export interface PersonRelEdge {
  from_entity_type: string;
  from_entity_id:   string;
  to_entity_type:   string;
  to_entity_id:     string;
  edge_type:        string;
  weight:           number;
  supporting_evidence: unknown[];
  confidence:       number;
}

export interface PersonOrgRelEdge {
  person_entity_type: string;
  person_entity_id:   string;
  org_entity_type:    string;
  org_entity_id:      string;
  edge_type:          string;
  weight:             number;
  supporting_evidence: unknown[];
  confidence:         number;
}

// ─── Enrichment run ───────────────────────────────────────────────────────────

export interface RunOptions {
  dryRun?:      boolean;
  forceRefresh?: boolean;  // ignore freshness window
  sources?:     string[];  // restrict to specific providers
  commit?:      boolean;
}

export type StepStatus = "pending" | "running" | "succeeded" | "failed" | "skipped";
export type RunStatus  = "running" | "completed" | "partial" | "failed" | "skipped";

// ─── Inference attribute keys ─────────────────────────────────────────────────

export const PERSON_ATTRIBUTE_KEYS = [
  "seniority_level",
  "role_function",
  "domain_expertise",
  "career_velocity",
  "public_activity_score",
  "profile_completeness",
  "investor_relevance",
  "operator_relevance",
] as const;

export const ORG_ATTRIBUTE_KEYS = [
  "org_type",
  "sector_focus",
  "stage_focus",
  "visibility",
  "momentum",
  "hiring_intensity",
  "deal_velocity",
] as const;

// ─── Reputation score keys ────────────────────────────────────────────────────

export const PERSON_SCORE_KEYS = [
  "expertise_credibility",
  "network_centrality_proxy",
  "public_visibility",
  "consistency_score",
  "data_completeness",
  "investor_relevance",
  "operator_relevance",
] as const;

export const ORG_SCORE_KEYS = [
  "brand_strength",
  "network_centrality_proxy",
  "hiring_momentum",
  "deal_activity",
  "data_completeness",
] as const;

export type PersonScoreKey = (typeof PERSON_SCORE_KEYS)[number];
export type OrgScoreKey    = (typeof ORG_SCORE_KEYS)[number];

// ─── Logger ───────────────────────────────────────────────────────────────────

export interface Logger {
  info(event: string, meta?: Record<string, unknown>): void;
  warn(event: string, meta?: Record<string, unknown>): void;
  error(event: string, meta?: Record<string, unknown>): void;
  debug(event: string, meta?: Record<string, unknown>): void;
}

export function createJsonLogger(prefix: string): Logger {
  return {
    info:  (e, m) => console.log(JSON.stringify({ level: "info",  event: `${prefix}.${e}`, ...m })),
    warn:  (e, m) => console.warn(JSON.stringify({ level: "warn",  event: `${prefix}.${e}`, ...m })),
    error: (e, m) => console.error(JSON.stringify({ level: "error", event: `${prefix}.${e}`, ...m })),
    debug: (e, m) => console.log(JSON.stringify({ level: "debug", event: `${prefix}.${e}`, ...m })),
  };
}

// ─── Provenance record ────────────────────────────────────────────────────────

export interface ProvenanceRecord {
  provider:     string;
  source_url?:  string;
  fetched_at:   string;
  confidence:   number;
  extraction_method?: string;
}
