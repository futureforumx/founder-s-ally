import { getClerkUserIdFromAuthHeader } from "../_clerkFromRequest";
import { getSupabaseServiceClient } from "../_supabaseServiceClient";
import { assertConnectorManagementForUser, isUuid } from "../_ownerContextAccess";

type GoogleOauthMeta = {
  google_oauth?: { refresh_token?: string | null; access_token?: string | null };
};

async function revokeGoogleToken(token: string): Promise<void> {
  const t = token.trim();
  if (!t) return;
  try {
    await fetch("https://oauth2.googleapis.com/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: t }),
    });
  } catch {
    /* non-fatal */
  }
}

export async function runGoogleDisconnect(input: {
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
    .select("id, provider, metadata")
    .eq("owner_context_id", ownerContextId)
    .in("provider", ["gmail", "google_calendar"]);

  if (selErr) {
    return { status: 500, json: { error: "Failed to load accounts", detail: selErr.message } };
  }

  const list = (rows ?? []) as { id: string; provider: string; metadata: GoogleOauthMeta | null }[];

  for (const row of list) {
    const meta = (row.metadata ?? {}) as GoogleOauthMeta;
    const go = meta.google_oauth;
    const token = go?.refresh_token?.trim() || go?.access_token?.trim();
    if (token) await revokeGoogleToken(token);
  }

  const { error: delErr } = await supabase
    .from("connected_accounts")
    .delete()
    .eq("owner_context_id", ownerContextId)
    .in("provider", ["gmail", "google_calendar"]);

  if (delErr) {
    return { status: 500, json: { error: "Failed to remove accounts", detail: delErr.message } };
  }

  return {
    status: 200,
    json: { ok: true, deleted_count: list.length, owner_context_id: ownerContextId },
  };
}
