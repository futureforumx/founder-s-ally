/**
 * Stable read shapes for firm_records.
 *
 * Use these instead of SELECT * to keep the query surface predictable and
 * to decouple the UI from raw column additions.
 *
 * Queries target the `firm_detail_safe` and `firm_list_safe` views
 * (created in migration 20260420150000).  Fall back to `firm_records`
 * directly when joining vc_funds / vc_people is necessary.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// ─── List card shape ──────────────────────────────────────────────────────────

export const FIRM_LIST_SELECT = `
  id, firm_name, normalized_name, slug, firm_type, status,
  logo_url, website_url, domain,
  hq_location, hq_city, hq_state, hq_country,
  short_description, elevator_pitch,
  stage_focus, investment_stages, sectors, thesis_verticals, themes,
  geography_focus, check_size_min, check_size_max, min_check_size, max_check_size,
  aum, aum_usd, is_actively_deploying, is_trending, is_popular, is_recent,
  firm_render_ready, data_completeness_score,
  match_score, reputation_score, responsiveness_score,
  value_add_score, network_strength,
  funding_intel_activity_score, funding_intel_momentum_score, funding_intel_pace_label,
  strategy_classifications, thesis_orientation,
  total_investors, total_partners,
  last_enriched_at, created_at, updated_at
`.trim();

export type FirmListRow = {
  id: string;
  firm_name: string;
  normalized_name: string | null;
  slug: string | null;
  firm_type: string | null;
  status: string | null;
  logo_url: string | null;
  website_url: string | null;
  domain: string | null;
  hq_location: string | null;
  hq_city: string | null;
  hq_state: string | null;
  hq_country: string | null;
  short_description: string | null;
  elevator_pitch: string | null;
  stage_focus: string[] | null;
  investment_stages: string[] | null;
  sectors: string[] | null;
  thesis_verticals: string[];
  themes: string[] | null;
  geography_focus: string[] | null;
  check_size_min: number | null;
  check_size_max: number | null;
  min_check_size: number | null;
  max_check_size: number | null;
  aum: string | null;
  aum_usd: number | null;
  is_actively_deploying: boolean | null;
  is_trending: boolean | null;
  is_popular: boolean | null;
  is_recent: boolean | null;
  firm_render_ready: boolean;
  data_completeness_score: number | null;
  match_score: number | null;
  reputation_score: number | null;
  responsiveness_score: number | null;
  value_add_score: number | null;
  network_strength: number | null;
  funding_intel_activity_score: number | null;
  funding_intel_momentum_score: number | null;
  funding_intel_pace_label: string | null;
  strategy_classifications: string[];
  thesis_orientation: string | null;
  total_investors: number | null;
  total_partners: number | null;
  last_enriched_at: string | null;
  created_at: string;
  updated_at: string | null;
};

// ─── Detail shape ─────────────────────────────────────────────────────────────

export const FIRM_DETAIL_CORE_SELECT = `
  id, firm_name, legal_name, normalized_name, slug, aliases,
  firm_type, entity_type, status, verification_status,
  logo_url, website_url, domain, founded_year,
  hq_location, hq_city, hq_state, hq_country, hq_region, hq_zip_code, location,
  description, short_description, elevator_pitch, portfolio_summary, notable_portfolio_companies,
  stage_focus, investment_stages, sectors, thesis_verticals, themes,
  geography_focus, geo_focus, check_size_min, check_size_max, min_check_size, max_check_size,
  lead_or_follow, strategy_classifications, thesis_orientation,
  aum, aum_usd, is_actively_deploying,
  linkedin_url, x_url, crunchbase_url, angellist_url, signal_nfx_url, openvc_url,
  vcsheet_url, medium_url, substack_url,
  match_score, reputation_score, responsiveness_score, value_add_score,
  network_strength, industry_reputation, founder_reputation_score,
  data_confidence_score, data_completeness_score,
  firm_render_ready, is_trending, is_popular, is_recent,
  funding_intel_activity_score, funding_intel_momentum_score, funding_intel_pace_label,
  funding_intel_focus_json, funding_intel_metrics_json, funding_intel_recent_investments_json,
  funding_intel_summary, funding_intel_last_deal_at,
  team_size, total_headcount, total_investors, total_partners,
  general_partner_count, partner_names, general_partner_names,
  source_urls_json, field_source_json, field_confidence_json,
  last_enriched_at, last_verified_at, next_update_scheduled_at, created_at, updated_at,
  prisma_firm_id
`.trim();

export type FirmDetailRow = FirmListRow & {
  legal_name: string | null;
  aliases: string[];
  entity_type: string | null;
  verification_status: string | null;
  founded_year: number | null;
  hq_region: string | null;
  hq_zip_code: string | null;
  location: string | null;
  description: string | null;
  portfolio_summary: string | null;
  notable_portfolio_companies: string[] | null;
  geo_focus: string[] | null;
  lead_or_follow: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  crunchbase_url: string | null;
  angellist_url: string | null;
  signal_nfx_url: string | null;
  openvc_url: string | null;
  vcsheet_url: string | null;
  medium_url: string | null;
  substack_url: string | null;
  industry_reputation: number | null;
  founder_reputation_score: number | null;
  data_confidence_score: number | null;
  funding_intel_focus_json: Record<string, unknown> | null;
  funding_intel_metrics_json: Record<string, unknown> | null;
  funding_intel_recent_investments_json: unknown[] | null;
  funding_intel_summary: string | null;
  funding_intel_last_deal_at: string | null;
  team_size: number | null;
  total_headcount: number | null;
  general_partner_count: number | null;
  partner_names: string[] | null;
  general_partner_names: string[] | null;
  source_urls_json: Record<string, unknown> | null;
  field_source_json: Record<string, unknown> | null;
  field_confidence_json: Record<string, unknown> | null;
  last_verified_at: string | null;
  next_update_scheduled_at: string | null;
  prisma_firm_id: string | null;
};

// ─── Query helpers ────────────────────────────────────────────────────────────

type Sb = SupabaseClient<Database>;
const raw = (client: Sb) => client as unknown as { from: (t: string) => any };

/** Fetch a single firm by id, slug, or domain. Returns null if not found. */
export async function fetchFirmRecord(
  client: Sb,
  identifier: string,
): Promise<FirmDetailRow | null> {
  const value = identifier.trim();
  if (!value) return null;

  for (const col of ["id", "slug", "domain"] as const) {
    const { data, error } = await raw(client)
      .from("firm_records")
      .select(FIRM_DETAIL_CORE_SELECT)
      .is("deleted_at", null)
      .eq(col, value)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data as FirmDetailRow;
  }

  // Loose hostname match fallback
  const host = value.replace(/^www\./i, "").toLowerCase();
  if (!host.includes(".")) return null;
  const { data, error } = await raw(client)
    .from("firm_records")
    .select(FIRM_DETAIL_CORE_SELECT)
    .is("deleted_at", null)
    .ilike("website_url", `%${host}%`)
    .limit(1);
  if (error) throw new Error(error.message);
  return (data?.[0] as FirmDetailRow) ?? null;
}

/** Fetch a page of render-ready firms for the list UI. */
export async function fetchFirmList(
  client: Sb,
  opts: { limit?: number; offset?: number; renderReadyOnly?: boolean } = {},
): Promise<FirmListRow[]> {
  const { limit = 50, offset = 0, renderReadyOnly = true } = opts;
  let q = raw(client)
    .from("firm_records")
    .select(FIRM_LIST_SELECT)
    .is("deleted_at", null)
    .order("match_score", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);

  if (renderReadyOnly) q = q.eq("firm_render_ready", true);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as FirmListRow[];
}
