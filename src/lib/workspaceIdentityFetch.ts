import { supabase } from "@/integrations/supabase/client";

/** Clerk / auth user row in `public.users` (subset). */
export type UsersIdentityRow = {
  id: string;
  email: string;
  display_name: string | null;
  /**
   * When `public.users.default_workspace_id` exists in your database, extend the
   * select below — until then the provider falls back to Personal / localStorage only.
   */
  default_workspace_id?: string | null;
};

export type WorkspaceMembershipRow = {
  role: string;
  workspace: { id: string; name: string; slug: string } | null;
};

export type OwnerContextRow = {
  id: string;
  workspace_id: string | null;
  user_id: string | null;
};

export type WorkspaceIdentityBundle = {
  userRow: UsersIdentityRow | null;
  memberships: WorkspaceMembershipRow[];
  personalOwnerContext: OwnerContextRow | null;
  workspaceOwnerContexts: OwnerContextRow[];
};

type UntypedFrom = {
  from: (t: string) => {
    select: (cols: string) => {
      eq: (c: string, v: string) => {
        maybeSingle: () => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
      };
      is: (c: string, v: null) => {
        eq: (c2: string, v2: string) => {
          maybeSingle: () => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
        };
      };
      in: (c: string, ids: string[]) => Promise<{ data: unknown; error: { message?: string; code?: string } | null }>;
    };
  };
};

/**
 * Loads workspace + owner_context data for the active-context switcher.
 * Uses a loosely typed client because generated `Database` types may lag new migrations.
 */
export async function fetchWorkspaceIdentityBundle(userId: string): Promise<WorkspaceIdentityBundle> {
  const client = supabase as unknown as UntypedFrom;

  let userRow: UsersIdentityRow | null = null;
  {
    const withDefault = await client
      .from("users")
      .select("id, email, display_name, default_workspace_id")
      .eq("id", userId)
      .maybeSingle();
    if (!withDefault.error) {
      userRow = (withDefault.data as UsersIdentityRow | null) ?? null;
    } else {
      const minimal = await client.from("users").select("id, email, display_name").eq("id", userId).maybeSingle();
      if (!minimal.error) {
        userRow = (minimal.data as UsersIdentityRow | null) ?? null;
      }
    }
  }

  const [{ data: memData, error: memErr }, { data: personalData, error: personalErr }] = await Promise.all([
    client
      .from("workspace_memberships")
      .select("role, workspace:workspaces(id, name, slug)")
      .eq("user_id", userId),
    client.from("owner_contexts").select("id, workspace_id, user_id").is("workspace_id", null).eq("user_id", userId).maybeSingle(),
  ]);

  const memberships = (memErr ? [] : (memData as WorkspaceMembershipRow[] | null)) ?? [];
  const personalOwnerContext = (personalErr ? null : (personalData as OwnerContextRow | null)) ?? null;

  const workspaceIds = memberships.map((m) => m.workspace?.id).filter((id): id is string => Boolean(id));

  let workspaceOwnerContexts: OwnerContextRow[] = [];
  if (workspaceIds.length > 0) {
    const { data: ocData, error: ocErr } = await client
      .from("owner_contexts")
      .select("id, workspace_id, user_id")
      .in("workspace_id", workspaceIds);
    workspaceOwnerContexts = (ocErr ? [] : (ocData as OwnerContextRow[] | null)) ?? [];
  }

  return {
    userRow,
    memberships,
    personalOwnerContext,
    workspaceOwnerContexts,
  };
}
