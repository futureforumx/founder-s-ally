/**
 * Stable read shapes for firm_investors.
 *
 * Use these instead of SELECT * so the UI gets a predictable, render-safe
 * column set.  Queries target `firm_investors` directly (views
 * investor_list_safe / investor_detail_safe are also available for
 * read-only contexts that don't need JOINs).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// ─── List card shape ──────────────────────────────────────────────────────────

export const INVESTOR_LIST_SELECT = `
  id, firm_id, full_name, first_name, last_name,
  title, role_type, is_partner, is_active, is_actively_investing,
  profile_image_url, avatar_url,
  location, city, linkedin_url,
  stage_focus, investment_stages, sector_focus,
  check_size_min, check_size_max,
  investor_render_ready, data_completeness_score,
  match_score, reputation_score, responsiveness_score,
  funding_intel_activity_score, funding_intel_momentum_score, funding_intel_pace_label,
  recent_deal_count, warm_intro_preferred, needs_review,
  created_at, updated_at
`.trim();

export type InvestorListRow = {
  id: string;
  firm_id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  role_type: string | null;
  is_partner: boolean;
  is_active: boolean;
  is_actively_investing: boolean;
  profile_image_url: string | null;
  avatar_url: string | null;
  location: string | null;
  city: string | null;
  linkedin_url: string | null;
  stage_focus: string[] | null;
  investment_stages: string[] | null;
  sector_focus: string[] | null;
  check_size_min: number | null;
  check_size_max: number | null;
  investor_render_ready: boolean;
  data_completeness_score: number | null;
  match_score: number | null;
  reputation_score: number | null;
  responsiveness_score: number | null;
  funding_intel_activity_score: number | null;
  funding_intel_momentum_score: number | null;
  funding_intel_pace_label: string | null;
  recent_deal_count: number | null;
  warm_intro_preferred: boolean;
  needs_review: boolean;
  created_at: string;
  updated_at: string;
};

// ─── Detail shape ─────────────────────────────────────────────────────────────

export const INVESTOR_DETAIL_SELECT = `
  id, firm_id, person_id,
  full_name, first_name, last_name, preferred_name,
  title, role_type, is_partner, is_active, is_actively_investing,
  bio, short_bio, background_summary, education_summary, education,
  prior_firms, prior_companies,
  location, city, state, country, timezone,
  profile_image_url, avatar_url,
  linkedin_url, x_url, personal_website_url, website_url,
  crunchbase_url, signal_url, github_url, medium_url, substack_url,
  stage_focus, investment_stages, sector_focus, sector_focus_canonical,
  personal_thesis_tags, investing_themes,
  check_size_min, check_size_max, check_size_focus, investment_style,
  notable_investments, portfolio_companies, recent_investments,
  match_score, reputation_score, responsiveness_score,
  value_add_score, network_strength, data_completeness_score,
  investor_render_ready, needs_review,
  warm_intro_preferred, cold_outreach_ok,
  funding_intel_activity_score, funding_intel_momentum_score, funding_intel_pace_label,
  funding_intel_focus_json, funding_intel_metrics_json, funding_intel_recent_investments_json,
  funding_intel_summary, funding_intel_last_deal_at,
  recent_deal_count, last_active_date,
  source_urls_json, field_source_json, field_confidence_json,
  last_enriched_at, created_at, updated_at
`.trim();

export type InvestorDetailRow = InvestorListRow & {
  person_id: string | null;
  preferred_name: string | null;
  bio: string | null;
  short_bio: string | null;
  background_summary: string | null;
  education_summary: string | null;
  education: Record<string, unknown>[] | null;
  prior_firms: string[] | null;
  prior_companies: string[] | null;
  state: string | null;
  country: string | null;
  timezone: string | null;
  personal_website_url: string | null;
  website_url: string | null;
  crunchbase_url: string | null;
  signal_url: string | null;
  github_url: string | null;
  x_url: string | null;
  medium_url: string | null;
  substack_url: string | null;
  sector_focus_canonical: string[] | null;
  personal_thesis_tags: string[] | null;
  investing_themes: string[] | null;
  check_size_focus: string | null;
  investment_style: string | null;
  notable_investments: string[] | null;
  portfolio_companies: string[] | null;
  recent_investments: Record<string, unknown>[] | null;
  value_add_score: number | null;
  network_strength: number | null;
  cold_outreach_ok: boolean;
  funding_intel_focus_json: Record<string, unknown> | null;
  funding_intel_metrics_json: Record<string, unknown> | null;
  funding_intel_recent_investments_json: unknown[] | null;
  funding_intel_summary: string | null;
  funding_intel_last_deal_at: string | null;
  last_active_date: string | null;
  source_urls_json: Record<string, unknown> | null;
  field_source_json: Record<string, unknown> | null;
  field_confidence_json: Record<string, unknown> | null;
  last_enriched_at: string | null;
};

// ─── Query helpers ────────────────────────────────────────────────────────────

type Sb = SupabaseClient<Database>;
const raw = (client: Sb) => client as unknown as { from: (t: string) => any };

/** Fetch a single investor by id. */
export async function fetchInvestorRecord(
  client: Sb,
  id: string,
): Promise<InvestorDetailRow | null> {
  const { data, error } = await raw(client)
    .from("firm_investors")
    .select(INVESTOR_DETAIL_SELECT)
    .is("deleted_at", null)
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as InvestorDetailRow) ?? null;
}

/** Fetch all active investors for a given firm. */
export async function fetchInvestorsForFirm(
  client: Sb,
  firmId: string,
  opts: { renderReadyOnly?: boolean } = {},
): Promise<InvestorListRow[]> {
  let q = raw(client)
    .from("firm_investors")
    .select(INVESTOR_LIST_SELECT)
    .is("deleted_at", null)
    .eq("firm_id", firmId)
    .eq("is_active", true)
    .order("is_partner", { ascending: false })
    .order("full_name", { ascending: true });

  if (opts.renderReadyOnly) q = q.eq("investor_render_ready", true);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as InvestorListRow[];
}

/** Fetch a page of render-ready investors for the directory. */
export async function fetchInvestorList(
  client: Sb,
  opts: { limit?: number; offset?: number; firmId?: string; renderReadyOnly?: boolean } = {},
): Promise<InvestorListRow[]> {
  const { limit = 50, offset = 0, firmId, renderReadyOnly = true } = opts;
  let q = raw(client)
    .from("firm_investors")
    .select(INVESTOR_LIST_SELECT)
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("match_score", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (firmId) q = q.eq("firm_id", firmId);
  if (renderReadyOnly) q = q.eq("investor_render_ready", true);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as InvestorListRow[];
}
