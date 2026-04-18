import { useQuery } from "@tanstack/react-query";
import { supabase, supabasePublicDirectory } from "@/integrations/supabase/client";
import { isOwnerContextUuid } from "@/lib/connectorContextStorage";
import type { Database } from "@/integrations/supabase/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Derived from the generated function return type
type PathsToOrgReturns = Database["public"]["Functions"]["paths_to_organization"]["Returns"][number];

export type PathRow = PathsToOrgReturns & {
  // path_type comes back as string from DB; narrow it for UI consumers
  path_type: "direct" | "one_hop";
};

export type PathsToOrgResult = {
  paths: PathRow[];
  personNames: Map<string, string>;
  selfPersonId: string | null;
};

// ---------------------------------------------------------------------------
// usePathsToOrg
// ---------------------------------------------------------------------------

/**
 * Calls paths_to_organization() for a given org within one owner context.
 *
 * Self-person resolution: fetches identity_links ordered by confidence DESC,
 * limit 1 — mirrors the backend resolveSelfPerson() pattern exactly.
 * There is no is_self column in identity_links.
 *
 * Enabled only when:
 *   - ownerContextId is a valid UUID
 *   - orgId is non-empty
 */
export function usePathsToOrg(
  ownerContextId: string | null | undefined,
  orgId: string | null | undefined,
) {
  const contextId = ownerContextId?.trim() ?? "";
  const enabled = isOwnerContextUuid(contextId) && Boolean(orgId?.trim());

  return useQuery({
    queryKey: ["paths_to_org", contextId, orgId],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<PathsToOrgResult> => {
      // 1. Resolve selfPersonId — highest-confidence identity link for this context
      const { data: link, error: linkErr } = await supabase
        .from("identity_links")
        .select("person_id")
        .eq("owner_context_id", contextId)
        .order("confidence", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (linkErr) throw new Error(`usePathsToOrg (identity): ${linkErr.message}`);

      const selfPersonId: string | null = link?.person_id ?? null;

      if (!selfPersonId) {
        return { paths: [], personNames: new Map(), selfPersonId: null };
      }

      // 2. Call paths_to_organization RPC
      const { data: rawPaths, error: rpcErr } = await supabase.rpc(
        "paths_to_organization",
        {
          p_owner_context_id: contextId,
          p_target_organization_id: orgId!,
          p_self_person_id: selfPersonId,
        },
      );

      if (rpcErr) throw new Error(`usePathsToOrg (rpc): ${rpcErr.message}`);
      if (!rawPaths || rawPaths.length === 0) {
        return { paths: [], personNames: new Map(), selfPersonId };
      }

      // Narrow path_type to the union literal expected by consumers
      const paths: PathRow[] = rawPaths.map((p) => ({
        ...p,
        path_type: p.path_type as "direct" | "one_hop",
      }));

      // 3. Batch-fetch person names from public directory (anon policy)
      const personIds = [
        ...new Set([
          ...paths.map((p) => p.target_person_id),
          ...paths.map((p) => p.via_person_id).filter((v): v is string => v != null),
        ]),
      ];

      const { data: people, error: peopleErr } =
        personIds.length > 0
          ? await supabasePublicDirectory
              .from("people")
              .select("id, canonicalName")
              .in("id", personIds)
          : { data: [] as { id: string; canonicalName: string }[], error: null };

      if (peopleErr) {
        // Non-fatal: return paths without names rather than failing the whole query
        console.warn("[usePathsToOrg] people name lookup failed:", peopleErr.message);
      }

      const personNames = new Map<string, string>(
        (people ?? []).map((p) => [p.id, p.canonicalName ?? "Unknown"]),
      );

      return { paths, personNames, selfPersonId };
    },
  });
}
