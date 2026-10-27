import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function listFirmDuplicateClusters(db: SupabaseClient, offset = 0, query = "") {
  const { data, error } = await db.rpc("admin_list_firm_duplicate_clusters", {
    p_limit: 60,
    p_offset: offset,
    p_query: query,
  });
  if (error) return { error: error.message, status: 500 as const };
  return { scan: data };
}

export async function mergeFirmDuplicateRecords(
  db: SupabaseClient,
  body: Record<string, unknown>,
) {
  const primaryId = typeof body.primary_id === "string" ? body.primary_id.trim() : "";
  const mergeRaw = Array.isArray(body.merge_ids) ? body.merge_ids : [];
  const mergeIds = mergeRaw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!UUID_RE.test(primaryId)) return { error: "primary_id must be a firm id", status: 400 as const };
  if (mergeIds.length < 1 || mergeIds.length > 11) {
    return { error: "Select at least one record to merge into the primary name", status: 400 as const };
  }
  if (mergeIds.some((id) => !UUID_RE.test(id))) {
    return { error: "Each merge id must be a firm id", status: 400 as const };
  }
  if (mergeIds.includes(primaryId) || new Set(mergeIds).size !== mergeIds.length) {
    return { error: "Choose distinct firms, and keep the primary out of the merge list", status: 400 as const };
  }

  const { data, error } = await db.rpc("admin_merge_firm_records", {
    p_primary: primaryId,
    p_merge_ids: mergeIds,
  });
  if (error) return { error: error.message, status: 400 as const };
  return { row: data };
}

export async function dismissFirmDuplicates(
  db: SupabaseClient,
  body: Record<string, unknown>,
) {
  const raw = Array.isArray(body.firm_ids) ? body.firm_ids : [];
  const firmIds = raw
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);

  if (firmIds.length < 2 || firmIds.length > 12) {
    return { error: "Choose between 2 and 12 firms to mark as not duplicates", status: 400 as const };
  }
  if (firmIds.some((id) => !UUID_RE.test(id)) || new Set(firmIds).size !== firmIds.length) {
    return { error: "Choose distinct firm ids", status: 400 as const };
  }

  const { data, error } = await db.rpc("admin_dismiss_firm_duplicates", { p_ids: firmIds });
  if (error) return { error: error.message, status: 400 as const };
  return { row: data };
}
