import { getClerkUserIdFromAuthHeader } from "../_clerkFromRequest";
import { getSupabaseServiceClient } from "../_supabaseServiceClient";
import { assertConnectorManagementForUser, isUuid } from "../_ownerContextAccess";

function isLinkedinCsvRow(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  return (metadata as { linkedin_csv_upload?: boolean }).linkedin_csv_upload === true;
}

export async function runLinkedinCsvDisconnect(input: {
  authorization: string | undefined;
  owner_context_id: string | undefined;
}): Promise<{ status: number; json: Record<string, unknown> }> {
  const ownerContextId = typeof input.owner_context_id === "string" ? input.owner_context_id.trim() : "";
  if (!isUuid(ownerContextId)) {
    return { status: 400, json: { error: "owner_context_id must be a UUID" } };
  }

  const userId = await getClerkUserIdFromAuthHeader(input.authorization);
  if (!userId) {
    return { status: 401, json: { error: "Missing or invalid Authorization bearer token" } };
  }

  const supabase = getSupabaseServiceClient();
  if (!supabase) {
    return { status: 500, json: { error: "Server missing Supabase service configuration" } };
  }

  const gate = await assertConnectorManagementForUser(supabase, userId, ownerContextId);
  if (!gate.ok) {
    return { status: 403, json: { error: gate.message } };
  }

  const { data: rows, error: selErr } = await supabase
    .from("connected_accounts")
    .select("id, metadata")
    .eq("owner_context_id", ownerContextId)
    .eq("provider", "other");

  if (selErr) {
    return { status: 500, json: { error: "Failed to load accounts", detail: selErr.message } };
  }

  const ids = (rows ?? [])
    .filter((r: { id: string; metadata: unknown }) => isLinkedinCsvRow(r.metadata))
    .map((r: { id: string }) => r.id);

  if (!ids.length) {
    return { status: 200, json: { ok: true, deleted_count: 0, owner_context_id: ownerContextId } };
  }

  const { error: delErr } = await supabase.from("connected_accounts").delete().in("id", ids);

  if (delErr) {
    return { status: 500, json: { error: "Failed to remove LinkedIn CSV records", detail: delErr.message } };
  }

  return { status: 200, json: { ok: true, deleted_count: ids.length, owner_context_id: ownerContextId } };
}
