import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Mirrors `prisma.vCFirm.findUnique({ include: { ... } })` via PostgREST (same Postgres as Prisma). */
const FIRM_DETAIL_SELECT = `
  *,
  vc_funds (*),
  vc_people (*),
  vc_investments (*),
  vc_signals (*),
  vc_source_links (*),
  vc_score_snapshots (*)
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

/**
 * Fetches one firm and nested relations. `vc_*` tables are not in generated `Database` types yet;
 * `as any` keeps the query localized until types are regenerated from Supabase.
 */
export async function fetchVCFirmDetail(
  client: SupabaseClient<Database>,
  id: string,
): Promise<VCFirmDetail | null> {
  const { data, error } = await (client as unknown as { from: (t: string) => any })
    .from("vc_firms")
    .select(FIRM_DETAIL_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;
  return filterFirmDetailActive(data as VCFirmDetail);
}
