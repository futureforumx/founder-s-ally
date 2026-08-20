import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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

const RELATED_TABLES = [
  ["vc_funds", "vc_funds"],
  ["vc_people", "vc_people"],
  ["vc_investments", "vc_investments"],
  ["vc_signals", "vc_signals"],
  ["vc_source_links", "vc_source_links"],
  ["vc_score_snapshots", "vc_score_snapshots"],
] as const;

/**
 * Load related `vc_*` rows with explicit `firm_id` filters.
 * Nested PostgREST embeds (`vc_firms(vc_funds(*))`) fail when the schema cache
 * has no FK hint — common in this project — so we never embed.
 */
async function attachRelatedRows(
  client: SupabaseClient<Database>,
  firm: VCFirmDetail,
): Promise<VCFirmDetail> {
  const extras: Partial<VCFirmDetail> = {};
  await Promise.all(
    RELATED_TABLES.map(async ([table, key]) => {
      try {
        const { data, error } = await sb(client)
          .from(table)
          .select("*")
          .eq("firm_id", firm.id)
          .is("deleted_at", null);
        extras[key] = error ? [] : ((data ?? []) as never);
      } catch {
        extras[key] = [];
      }
    }),
  );
  return filterFirmDetailActive({ ...firm, ...extras });
}

async function fetchFirmCore(
  client: SupabaseClient<Database>,
  column: string,
  value: string,
): Promise<VCFirmDetail | null> {
  const { data, error } = await sb(client)
    .from("vc_firms")
    .select("*")
    .is("deleted_at", null)
    .eq(column, value)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return attachRelatedRows(client, data as VCFirmDetail);
}

/**
 * Fetches one firm and related `vc_*` rows. Resolves `id` in order: primary key, `slug`,
 * `vc_firm_aliases.alias_value` (domain keys from static JSON), then a loose `website_url`
 * match when `id` looks like a hostname (e.g. `a16z.com` from bundled VC JSON).
 */
export async function fetchVCFirmDetail(
  client: SupabaseClient<Database>,
  id: string,
): Promise<VCFirmDetail | null> {
  const raw = id.trim();
  if (!raw) return null;

  let firm = await fetchFirmCore(client, "id", raw);
  if (firm) return firm;

  firm = await fetchFirmCore(client, "slug", raw);
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
      firm = await fetchFirmCore(client, "id", aliasRow.firm_id);
      if (firm) return firm;
    }
  } catch {
    /* vc_firm_aliases may be absent in some environments */
  }

  const { data: rows, error: siteErr } = await sb(client)
    .from("vc_firms")
    .select("*")
    .is("deleted_at", null)
    .ilike("website_url", `%${host}%`)
    .limit(1);

  if (siteErr) throw new Error(siteErr.message);
  const row = rows?.[0];
  if (!row) return null;
  return attachRelatedRows(client, row as VCFirmDetail);
}
