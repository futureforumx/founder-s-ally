import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isOwnerContextUuid } from "@/lib/connectorContextStorage";

export const SELF_PERSON_QUERY_KEY = "self_person_id" as const;

/**
 * Resolves the canonical person_id for the authenticated user within a given
 * owner context via identity_links.
 *
 * Mirrors the backend resolveSelfPerson() pattern:
 *   — selects the link with the highest confidence for the context
 *   — no is_self filter (that column does not exist in the schema)
 *
 * Returns null when:
 *   - ownerContextId is not a valid UUID
 *   - No identity_link row exists for this context yet
 */
export function useSelfPersonId(ownerContextId: string | null | undefined) {
  const id = ownerContextId?.trim() ?? "";
  const enabled = isOwnerContextUuid(id);

  return useQuery({
    queryKey: [SELF_PERSON_QUERY_KEY, id],
    enabled,
    staleTime: 5 * 60_000, // 5 min — identity links change infrequently
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("identity_links")
        .select("person_id")
        .eq("owner_context_id", id)
        .order("confidence", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw new Error(`useSelfPersonId: ${error.message}`);
      return data?.person_id ?? null;
    },
  });
}
