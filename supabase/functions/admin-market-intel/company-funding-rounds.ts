import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Stable tokens shared with the company editor. Labels and stored values match. */
export const COMPANY_FUNDING_ROUND_TYPES = [
  "Angel",
  "Accelerator",
  "Pre-Seed",
  "Seed",
  "Series A",
  "Series B",
  "Series C",
  "Growth",
] as const;

const ALLOWED = new Set<string>(COMPANY_FUNDING_ROUND_TYPES);

function normalizeRoundType(value: string): string {
  const key = value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const aliases: Record<string, string> = {
    angel: "Angel",
    accelerator: "Accelerator",
    "pre seed": "Pre-Seed",
    preseed: "Pre-Seed",
    seed: "Seed",
    "series a": "Series A",
    "series b": "Series B",
    "series c": "Series C",
    growth: "Growth",
  };
  return aliases[key] ?? value.trim();
}

export type CompanyFundingRoundRow = {
  id: string;
  startup_id: string;
  round_type: string;
  amount_usd: number | null;
  sort_order: number;
};

function asUsd(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function assertStartup(
  db: SupabaseClient,
  startupId: string,
): Promise<{ ok: true } | { error: string; status: number }> {
  const { data, error } = await db
    .from("startups")
    .select("id, deleted_at")
    .eq("id", startupId)
    .maybeSingle();
  if (error) return { error: error.message, status: 500 };
  const row = data as { id?: string; deleted_at?: string | null } | null;
  if (!row?.id || row.deleted_at) return { error: "Company not found", status: 404 };
  return { ok: true };
}

export async function listCompanyFundingRounds(
  db: SupabaseClient,
  startupId: string,
): Promise<{ rows: CompanyFundingRoundRow[] } | { error: string; status: number }> {
  const id = startupId.trim();
  if (!id) return { error: "startup_id is required", status: 400 };
  const startup = await assertStartup(db, id);
  if ("error" in startup) return startup;

  const { data, error } = await db
    .from("company_funding_rounds")
    .select("id, startup_id, round_type, amount_usd, sort_order")
    .eq("startup_id", id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return { error: error.message, status: 500 };

  const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    startup_id: String(row.startup_id),
    round_type: String(row.round_type),
    amount_usd: asUsd(row.amount_usd),
    sort_order: Number(row.sort_order) || 0,
  }));
  return { rows };
}

export async function saveCompanyFundingRounds(
  db: SupabaseClient,
  body: Record<string, unknown>,
): Promise<{ rows: CompanyFundingRoundRow[] } | { error: string; status: number }> {
  const startupId = typeof body.startup_id === "string" ? body.startup_id.trim() : "";
  if (!startupId) return { error: "startup_id is required", status: 400 };
  if (!Array.isArray(body.rounds)) return { error: "rounds must be a list", status: 400 };
  if (body.rounds.length > 40) return { error: "Too many funding rounds", status: 400 };

  const startup = await assertStartup(db, startupId);
  if ("error" in startup) return startup;

  const cleaned: Array<{ id: string | null; round_type: string; amount_usd: number | null }> = [];
  for (const raw of body.rounds) {
    if (!raw || typeof raw !== "object") return { error: "Each round must be an object", status: 400 };
    const rec = raw as Record<string, unknown>;
    const roundType = typeof rec.round_type === "string" ? normalizeRoundType(rec.round_type) : "";
    if (!roundType) continue;
    if (!ALLOWED.has(roundType)) return { error: `Unknown round: ${roundType}`, status: 400 };
    const id = typeof rec.id === "string" && isUuid(rec.id) ? rec.id : null;
    const duplicate = cleaned.find((row) => row.round_type === roundType);
    const amount = rec.amount_usd == null || rec.amount_usd === "" ? null : asUsd(rec.amount_usd);
    if (rec.amount_usd != null && rec.amount_usd !== "" && (amount == null || amount < 0)) {
      return { error: "Money raised must be zero or greater", status: 400 };
    }
    if (duplicate) {
      if (!duplicate.id && id) duplicate.id = id;
      if (duplicate.amount_usd == null && amount != null) duplicate.amount_usd = amount;
      continue;
    }
    cleaned.push({ id, round_type: roundType, amount_usd: amount });
  }

  const { data: existing, error: existingErr } = await db
    .from("company_funding_rounds")
    .select("id")
    .eq("startup_id", startupId);
  if (existingErr) return { error: existingErr.message, status: 500 };
  const existingIds = new Set(((existing ?? []) as Array<{ id: string }>).map((row) => row.id));

  const now = new Date().toISOString();
  const kept: string[] = [];
  for (let index = 0; index < cleaned.length; index++) {
    const row = cleaned[index];
    const canUpdate = Boolean(row.id && existingIds.has(row.id) && !kept.includes(row.id));
    if (canUpdate && row.id) {
      const { data: updated, error } = await db
        .from("company_funding_rounds")
        .update({
          round_type: row.round_type,
          amount_usd: row.amount_usd,
          sort_order: index,
          updated_at: now,
        })
        .eq("id", row.id)
        .eq("startup_id", startupId)
        .select("id");
      if (error) return { error: error.message, status: 500 };
      const updatedId = (updated ?? [])[0] as { id?: string } | undefined;
      if (updatedId?.id) {
        kept.push(updatedId.id);
        continue;
      }
    }

    const { data: inserted, error } = await db
      .from("company_funding_rounds")
      .insert({
        startup_id: startupId,
        round_type: row.round_type,
        amount_usd: row.amount_usd,
        sort_order: index,
      })
      .select("id")
      .single();
    if (error) return { error: error.message, status: 500 };
    kept.push((inserted as { id: string }).id);
  }

  const drop = [...existingIds].filter((id) => !kept.includes(id));
  if (drop.length) {
    const { error } = await db
      .from("company_funding_rounds")
      .delete()
      .eq("startup_id", startupId)
      .in("id", drop);
    if (error) return { error: error.message, status: 500 };
  }

  // Mirror the newest admin-entered round onto the canonical company record.
  // The editor's submitted order is the round order and is persisted as sort_order.
  const latestRound = cleaned.at(-1) ?? null;
  if (latestRound) {
    const { error } = await db
      .from("startups")
      .update({
        last_round_type: latestRound.round_type,
        last_round_size_usd: latestRound.amount_usd,
        updated_at: now,
      })
      .eq("id", startupId);
    if (error) return { error: error.message, status: 500 };
  }

  return listCompanyFundingRounds(db, startupId);
}
