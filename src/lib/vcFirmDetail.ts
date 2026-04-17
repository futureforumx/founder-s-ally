import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const FIRM_DETAIL_SELECT = `
  id, firm_name, legal_name, slug, aliases,
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
  prisma_firm_id,
  vc_funds (
    id, fund_name, fund_number, vintage_year, status, fund_type,
    size_usd, aum_usd, aum_band, currency,
    stage_focus, sector_focus, geography_focus, themes,
    actively_deploying, avg_check_size_min, avg_check_size_max,
    investments_last_12m, last_investment_date, deleted_at
  ),
  vc_people (
    id, first_name, last_name, title, role, bio, avatar_url,
    linkedin_url, x_url, stage_focus, sector_focus,
    is_actively_investing, warm_intro_preferred, deleted_at
  ),
  vc_investments (
    id, company_name, company_url, round_stage, announced_at, deleted_at
  ),
  vc_signals (
    id, signal_type, signal_date, summary, deleted_at
  ),
  vc_source_links (
    id, source_type, url, label, deleted_at
  ),
  vc_score_snapshots (
    id, match_score, reputation_score, founder_sentiment,
    responsiveness_score, value_add_ability, network_strength,
    active_deployment, computed_at, model_version, deleted_at
  )
`.trim();

export type VcFundRow = Record<string, unknown> & { id: string; deleted_at?: string | null };
export type VcPersonRow = Record<string, unknown> & { id: string; deleted_at?: string | null };
export type VcInvestmentRow = Record<string, unknown> & { id: string; deleted_at?: string | null };
export type VcSignalRow = Record<string, unknown> & { id: string; deleted_at?: string | null };
export type VcSourceLinkRow = Record<string, unknown> & { id: string; deleted_at?: string | null };
export type VcScoreSnapshotRow = Record<string, unknown> & { id: string; deleted_at?: string | null };

export type VCFirmDetail = Record<string, unknown> & {
  id: string;
  firm_name: string;
  slug: string;
  vc_funds?: VcFundRow[] | null;
  vc_people?: VcPersonRow[] | null;
  vc_investments?: VcInvestmentRow[] | null;
  vc_signals?: VcSignalRow[] | null;
  vc_source_links?: VcSourceLinkRow[] | null;
  vc_score_snapshots?: VcScoreSnapshotRow[] | null;
};

function isActive(row: { deleted_at?: string | null } | null | undefined) {
  return row != null && (row.deleted_at == null || row.deleted_at === "");
}

export function filterFirmDetailActive(firm: VCFirmDetail): VCFirmDetail {
  return {
    ...firm,
    vc_funds: (firm.vc_funds ?? []).filter(isActive),
    vc_people: (firm.vc_people ?? []).filter(isActive),
    vc_investments: (firm.vc_investments ?? []).filter(isActive),
    vc_signals: (firm.vc_signals ?? []).filter(isActive),
    vc_source_links: (firm.vc_source_links ?? []).filter(isActive),
    vc_score_snapshots: (firm.vc_score_snapshots ?? []).filter(isActive),
  };
}

const sb = (client: SupabaseClient<Database>) => client as unknown as { from: (t: string) => any };

async function fetchFirmDetailRow(
  client: SupabaseClient<Database>,
  column: string,
  value: string,
): Promise<VCFirmDetail | null> {
  const { data, error } = await sb(client)
    .from("vc_firms")
    .select(FIRM_DETAIL_SELECT)
    .is("deleted_at", null)
    .eq(column, value)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return filterFirmDetailActive(data as VCFirmDetail);
}

/**
 * Fetches one firm and nested relations. `vc_*` tables are not in generated `Database` types yet;
 * `as any` keeps the query localized until types are regenerated from Supabase.
 *
 * Resolves `id` in order: primary key, `slug`, `vc_firm_aliases.alias_value` (domain keys from static JSON),
 * then a loose `website_url` match when `id` looks like a hostname (e.g. `a16z.com` from bundled VC JSON).
 */
export async function fetchVCFirmDetail(
  client: SupabaseClient<Database>,
  id: string,
): Promise<VCFirmDetail | null> {
  const raw = id.trim();
  if (!raw) return null;

  let firm = await fetchFirmDetailRow(client, "id", raw);
  if (firm) return firm;

  firm = await fetchFirmDetailRow(client, "slug", raw);
  if (firm) return firm;

  const host = raw.replace(/^www\./i, "").toLowerCase();
  if (!host.includes(".")) return null;

  try {
    const { data: aliasRow, error: aliasErr } = await sb(client)
      .from("vc_firm_aliases")
      .select("firm_id")
      .eq("alias_value", host)
      .limit(1)
      .maybeSingle();
    if (!aliasErr && aliasRow?.firm_id && typeof aliasRow.firm_id === "string") {
      firm = await fetchFirmDetailRow(client, "id", aliasRow.firm_id);
      if (firm) return firm;
    }
  } catch {
    /* vc_firm_aliases may be absent in some environments */
  }

  const { data: rows, error: siteErr } = await sb(client)
    .from("vc_firms")
    .select(FIRM_DETAIL_SELECT)
    .is("deleted_at", null)
    .ilike("website_url", `%${host}%`)
    .limit(1);

  if (siteErr) throw new Error(siteErr.message);
  const row = rows?.[0];
  if (!row) return null;
  return filterFirmDetailActive(row as VCFirmDetail);
}
