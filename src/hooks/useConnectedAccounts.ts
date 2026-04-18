import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isOwnerContextUuid } from "@/lib/connectorContextStorage";

export const CONNECTED_ACCOUNTS_QUERY_ROOT = "connected_accounts" as const;

export type ConnectedAccountRow = {
  id: string;
  owner_context_id: string;
  provider: string;
  account_email: string | null;
  status: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

/**
 * Read-only: `connected_accounts` for one owner context (RLS restricts to contexts the user can see).
 */
export function useConnectedAccounts(ownerContextId: string | null | undefined) {
  const id = ownerContextId?.trim() ?? "";
  const enabled = isOwnerContextUuid(id);

  return useQuery({
    queryKey: [CONNECTED_ACCOUNTS_QUERY_ROOT, id],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<ConnectedAccountRow[]> => {
      const { data, error } = await (supabase as any)
        .from("connected_accounts")
        .select("id, owner_context_id, provider, account_email, status, metadata, created_at")
        .eq("owner_context_id", id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data as ConnectedAccountRow[] | null) ?? [];
    },
  });
}
