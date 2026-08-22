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

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asHost(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    return new URL(withProto).hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    const host = trimmed.replace(/^www\./i, "").split("/")[0]?.toLowerCase() ?? "";
    return host.includes(".") ? host : null;
  }
}

/** Schema / type mismatches that should fall through to the next lookup, not fail the page. */
export function isIgnorableFirmQueryError(error: { message?: string } | null | undefined): boolean {
  const message = error?.message ?? "";
  return (
    /column .* does not exist/i.test(message) ||
    /could not find the .* column/i.test(message) ||
    /invalid input syntax for type uuid/i.test(message) ||
    /invalid uuid/i.test(message)
  );
}

async function selectRows(
  query: Promise<{ data?: unknown; error?: { message?: string } | null }>,
): Promise<Record<string, unknown>[]> {
  try {
    const { data, error } = await query;
    if (error) {
      if (isIgnorableFirmQueryError(error)) return [];
      throw new Error(error.message);
    }
    return Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  } catch (error) {
    if (error instanceof Error && isIgnorableFirmQueryError(error)) return [];
    throw error;
  }
}

async function selectMaybe(
  query: Promise<{ data?: unknown; error?: { message?: string } | null }>,
): Promise<Record<string, unknown> | null> {
  try {
    const { data, error } = await query;
    if (error) {
      if (isIgnorableFirmQueryError(error)) return null;
      throw new Error(error.message);
    }
    if (!data) return null;
    if (Array.isArray(data)) return (data[0] as Record<string, unknown>) ?? null;
    return data as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && isIgnorableFirmQueryError(error)) return null;
    throw error;
  }
}

function normalizeFirmRow(row: Record<string, unknown>): VCFirmDetail {
  const firmName = asText(row.firm_name) ?? asText(row.name) ?? "";
  const website = asText(row.website_url) ?? asText(row.website);
  const slug = asText(row.slug) ?? asText(row.domain) ?? asText(row.id) ?? "";
  return {
    ...row,
    id: String(row.id),
    firm_name: firmName,
    slug,
    website_url: website,
    name: asText(row.name) ?? firmName,
  };
}

function mapLiveFundRow(row: Record<string, unknown>): VcFundRow {
  const size =
    typeof row.size_usd === "number"
      ? row.size_usd
      : typeof row.final_size_usd === "number"
        ? row.final_size_usd
        : typeof row.target_size_usd === "number"
          ? row.target_size_usd
          : null;
  return {
    ...row,
    id: String(row.id),
    fund_name: asText(row.fund_name) ?? asText(row.name),
    fund_status: asText(row.fund_status) ?? asText(row.status),
    size_usd: size,
    aum_usd: typeof row.aum_usd === "number" ? row.aum_usd : null,
    actively_deploying: row.actively_deploying ?? row.likely_actively_deploying ?? null,
  };
}

function mapInvestorToPerson(row: Record<string, unknown>): VcPersonRow {
  const fullName = asText(row.full_name) ?? `${asText(row.first_name) ?? ""} ${asText(row.last_name) ?? ""}`.trim();
  return {
    ...row,
    id: String(row.id),
    preferred_name: asText(row.preferred_name) ?? fullName,
    first_name: asText(row.first_name),
    last_name: asText(row.last_name),
    title: asText(row.title),
    role: asText(row.role) ?? asText(row.title),
    avatar_url: asText(row.avatar_url) ?? asText(row.profile_image_url) ?? asText(row.headshot_url),
    investment_themes: row.investment_themes ?? row.investing_themes ?? row.personal_thesis_tags ?? [],
  };
}

function mapDealToInvestment(row: Record<string, unknown>): VcInvestmentRow {
  return {
    ...row,
    id: String(row.id),
    company_name: asText(row.company_name) ?? "",
    investment_date: asText(row.investment_date) ?? asText(row.date_announced),
  };
}

async function queryRelated(
  client: SupabaseClient<Database>,
  table: string,
  column: string,
  value: string,
): Promise<Record<string, unknown>[]> {
  let rows = await selectRows(
    sb(client).from(table).select("*").eq(column, value).is("deleted_at", null).limit(200),
  );
  if (rows.length === 0) {
    rows = await selectRows(sb(client).from(table).select("*").eq(column, value).limit(200));
  }
  return rows;
}

/**
 * Load related `vc_*` / `firm_*` rows with explicit filters.
 * Nested PostgREST embeds fail when the schema cache has no FK hint, so we never embed.
 */
async function attachRelatedRows(
  client: SupabaseClient<Database>,
  firm: VCFirmDetail,
): Promise<VCFirmDetail> {
  const extras: Partial<VCFirmDetail> = {};
  const prismaId = asText(firm.prisma_firm_id);
  const lookupIds = [...new Set([firm.id, prismaId].filter((id): id is string => Boolean(id)))];

  await Promise.all(
    RELATED_TABLES.map(async ([table, key]) => {
      try {
        const chunks = await Promise.all(lookupIds.map((id) => queryRelated(client, table, "firm_id", id)));
        extras[key] = chunks.flat() as never;
      } catch {
        extras[key] = [];
      }
    }),
  );

  try {
    const liveFunds = (await queryRelated(client, "vc_funds", "firm_record_id", firm.id)).map(mapLiveFundRow);
    extras.vc_funds = [...(extras.vc_funds ?? []), ...liveFunds];
  } catch {
    /* live vc_funds may be absent */
  }

  try {
    const fundRecords = (await queryRelated(client, "fund_records", "firm_id", firm.id)).map(mapLiveFundRow);
    extras.vc_funds = [...(extras.vc_funds ?? []), ...fundRecords];
  } catch {
    /* fund_records may be absent */
  }

  if (!extras.vc_people?.length) {
    try {
      extras.vc_people = (await queryRelated(client, "firm_investors", "firm_id", firm.id)).map(mapInvestorToPerson);
    } catch {
      extras.vc_people = extras.vc_people ?? [];
    }
  }

  if (!extras.vc_investments?.length) {
    try {
      extras.vc_investments = (await queryRelated(client, "firm_recent_deals", "firm_id", firm.id)).map(
        mapDealToInvestment,
      );
    } catch {
      extras.vc_investments = extras.vc_investments ?? [];
    }
  }

  return filterFirmDetailActive({ ...firm, ...extras });
}

async function fetchFromTable(
  client: SupabaseClient<Database>,
  table: "vc_firms" | "firm_records",
  column: string,
  value: string,
): Promise<VCFirmDetail | null> {
  const withSoftDelete =
    table === "firm_records"
      ? sb(client).from(table).select("*").eq(column, value).is("deleted_at", null).maybeSingle()
      : sb(client).from(table).select("*").eq(column, value).maybeSingle();
  const row = await selectMaybe(withSoftDelete);
  if (!row?.id) return null;
  return attachRelatedRows(client, normalizeFirmRow(row));
}

async function fetchFirmRecordsByHost(
  client: SupabaseClient<Database>,
  host: string,
): Promise<VCFirmDetail | null> {
  const byDomain = await fetchFromTable(client, "firm_records", "domain", host);
  if (byDomain) return byDomain;

  const row = await selectMaybe(
    sb(client)
      .from("firm_records")
      .select("*")
      .ilike("website_url", `%${host}%`)
      .is("deleted_at", null)
      .limit(1),
  );
  if (!row?.id) return null;
  return attachRelatedRows(client, normalizeFirmRow(row));
}

/**
 * Fetches one firm for `/firms/:id`. Live directory data is on `firm_records`
 * (18k+ rows). `vc_firms` in this project is a leftover slim table and is tried
 * first only for environments that still have the Prisma-shaped directory.
 *
 * Resolves `id` as: `vc_firms` id/slug, `firm_records` id/slug/`prisma_firm_id`/domain,
 * `vc_firm_aliases`, then website host (MDM keys like `a16z.com`).
 */
export async function fetchVCFirmDetail(
  client: SupabaseClient<Database>,
  id: string,
): Promise<VCFirmDetail | null> {
  const raw = id.trim();
  if (!raw) return null;

  const host = asHost(raw);

  let firm = await fetchFromTable(client, "vc_firms", "id", raw);
  if (firm) return firm;

  firm = await fetchFromTable(client, "vc_firms", "slug", raw);
  if (firm) return firm;

  firm = await fetchFromTable(client, "firm_records", "id", raw);
  if (firm) return firm;

  firm = await fetchFromTable(client, "firm_records", "slug", raw);
  if (firm) return firm;

  firm = await fetchFromTable(client, "firm_records", "prisma_firm_id", raw);
  if (firm) return firm;

  if (host) {
    firm = await fetchFirmRecordsByHost(client, host);
    if (firm) return firm;
  }

  try {
    const aliasRow = await selectMaybe(
      sb(client).from("vc_firm_aliases").select("firm_id").eq("alias_value", host ?? raw).limit(1),
    );
    const aliasId = asText(aliasRow?.firm_id);
    if (aliasId) {
      firm = await fetchFromTable(client, "vc_firms", "id", aliasId);
      if (firm) return firm;
      firm = await fetchFromTable(client, "firm_records", "id", aliasId);
      if (firm) return firm;
      firm = await fetchFromTable(client, "firm_records", "prisma_firm_id", aliasId);
      if (firm) return firm;
    }
  } catch {
    /* vc_firm_aliases may be absent */
  }

  if (!host) return null;

  const vcSite = await selectMaybe(
    sb(client).from("vc_firms").select("*").ilike("website_url", `%${host}%`).limit(1),
  );
  if (vcSite?.id) return attachRelatedRows(client, normalizeFirmRow(vcSite));

  const vcSiteAlt = await selectMaybe(
    sb(client).from("vc_firms").select("*").ilike("website", `%${host}%`).limit(1),
  );
  if (vcSiteAlt?.id) return attachRelatedRows(client, normalizeFirmRow(vcSiteAlt));

  return null;
}
