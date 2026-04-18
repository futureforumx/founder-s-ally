import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(id: string): boolean {
  return UUID_RE.test(id.trim());
}

/** Service-role check: Clerk user may use this owner_context (personal row or workspace member). */
export async function assertOwnerContextForUser(
  supabase: SupabaseClient,
  clerkUserId: string,
  ownerContextId: string,
): Promise<boolean> {
  if (!isUuid(ownerContextId)) return false;

  const { data: row, error } = await supabase
    .from("owner_contexts")
    .select("id, user_id, workspace_id")
    .eq("id", ownerContextId.trim())
    .maybeSingle();

  if (error || !row) return false;

  const r = row as { user_id: string | null; workspace_id: string | null };
  if (r.user_id && r.user_id === clerkUserId) return true;

  if (r.workspace_id) {
    const { count, error: mErr } = await supabase
      .from("workspace_memberships")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", r.workspace_id)
      .eq("user_id", clerkUserId);
    if (mErr) return false;
    return (count ?? 0) > 0;
  }

  return false;
}

/**
 * Service-role check for connector mutations (connect OAuth, disconnect, resync, LinkedIn CSV).
 *
 * Policy (aligned with frontend `canManageConnectorIntegrations`):
 * - Personal owner context (`workspace_id` IS NULL): allowed only when `user_id === clerkUserId`.
 * - Workspace owner context: allowed only when `workspace_memberships.role` is `owner` (case-insensitive).
 *
 * Workspace **admin** is intentionally not included here; extend this function if product policy changes.
 */
export async function assertConnectorManagementForUser(
  supabase: SupabaseClient,
  clerkUserId: string,
  ownerContextId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isUuid(ownerContextId)) {
    return { ok: false, message: "Invalid owner context id" };
  }

  const id = ownerContextId.trim();

  const { data: row, error } = await supabase
    .from("owner_contexts")
    .select("id, user_id, workspace_id")
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    return { ok: false, message: "Unknown owner context" };
  }

  const r = row as { user_id: string | null; workspace_id: string | null };

  if (r.workspace_id == null) {
    if (r.user_id && r.user_id === clerkUserId) {
      return { ok: true };
    }
    return { ok: false, message: "Only the personal context owner may manage connectors" };
  }

  const { data: membershipRows, error: mErr } = await supabase
    .from("workspace_memberships")
    .select("role")
    .eq("workspace_id", r.workspace_id)
    .eq("user_id", clerkUserId)
    .limit(1);

  if (mErr || !membershipRows?.length) {
    return { ok: false, message: "Not a member of this workspace" };
  }

  const membership = membershipRows[0] as { role?: string };
  const role = String(membership.role ?? "")
    .trim()
    .toLowerCase();
  if (role === "owner") {
    return { ok: true };
  }

  return { ok: false, message: "Only workspace owners may manage connectors" };
}
