import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, supabasePublicDirectory } from "@/integrations/supabase/client";
import { isOwnerContextUuid } from "@/lib/connectorContextStorage";
import type { Tables } from "@/integrations/supabase/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RecKind = "ask_intro" | "reach_out";
export type RecState = "open" | "snoozed" | "dismissed" | "acted" | "completed" | "expired";
export type RecAction = "dismissed" | "acted" | "snoozed";

// Base row from the database
type RecommendationDbRow = Tables<"recommendations">;

// Extended row with resolved display fields
export type RecommendationRow = RecommendationDbRow & {
  org_name: string | null;
  via_person_name: string | null;
};

export const RECS_QUERY_KEY = "phase4_recommendations" as const;

// ---------------------------------------------------------------------------
// useRecommendations
// ---------------------------------------------------------------------------

/**
 * Fetch all open recommendations for one owner context.
 * Resolves org_name and via_person_name via batch lookups against public tables.
 */
export function useRecommendations(ownerContextId: string | null | undefined) {
  const id = ownerContextId?.trim() ?? "";
  const enabled = isOwnerContextUuid(id);

  return useQuery({
    queryKey: [RECS_QUERY_KEY, id],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<RecommendationRow[]> => {
      const { data: recs, error } = await supabase
        .from("recommendations")
        .select(
          "id, kind, state, score, subject_organization_id, subject_person_id, via_person_id, rationale, dedup_key, created_at, updated_at, owner_context_id, snoozed_until, expires_at",
        )
        .eq("owner_context_id", id)
        .eq("state", "open")
        .order("score", { ascending: false });

      if (error) throw new Error(`useRecommendations: ${error.message}`);
      if (!recs || recs.length === 0) return [];

      // Batch-fetch org names and via-person names in parallel.
      // organizations and people are Prisma-managed with anon SELECT policies
      // — use supabasePublicDirectory (no JWT, avoids PGRST301).
      const orgIds = [...new Set(recs.map((r) => r.subject_organization_id).filter(Boolean))] as string[];
      const personIds = [...new Set(recs.map((r) => r.via_person_id).filter(Boolean))] as string[];

      const [orgRes, personRes] = await Promise.all([
        orgIds.length > 0
          ? supabasePublicDirectory
              .from("organizations")
              .select("id, canonicalName")
              .in("id", orgIds)
          : Promise.resolve({ data: [] as { id: string; canonicalName: string }[], error: null }),
        personIds.length > 0
          ? supabasePublicDirectory
              .from("people")
              .select("id, canonicalName")
              .in("id", personIds)
          : Promise.resolve({ data: [] as { id: string; canonicalName: string }[], error: null }),
      ]);

      const orgMap = new Map<string, string>(
        (orgRes.data ?? []).map((o) => [o.id, o.canonicalName]),
      );
      const personMap = new Map<string, string>(
        (personRes.data ?? []).map((p) => [p.id, p.canonicalName]),
      );

      return recs.map((r): RecommendationRow => ({
        ...r,
        org_name: r.subject_organization_id ? (orgMap.get(r.subject_organization_id) ?? null) : null,
        via_person_name: r.via_person_id ? (personMap.get(r.via_person_id) ?? null) : null,
      }));
    },
  });
}

// ---------------------------------------------------------------------------
// useRecommendationAction
// ---------------------------------------------------------------------------

/**
 * Dismiss, snooze (7 days), or mark acted on a recommendation.
 *
 * Uses optimistic update: removes the rec from the list immediately so the
 * UI feels instant. Rolls back on error. Invalidates on settled.
 */
export function useRecommendationAction(ownerContextId: string | null | undefined) {
  const id = ownerContextId?.trim() ?? "";
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ recId, action }: { recId: string; action: RecAction }) => {
      if (!isOwnerContextUuid(id)) {
        throw new Error("useRecommendationAction: no active workspace context");
      }
      const update: Partial<Tables<"recommendations">["Update"]> & Record<string, unknown> = {
        state: action,
      };
      if (action === "snoozed") {
        const until = new Date();
        until.setDate(until.getDate() + 7);
        update.snoozed_until = until.toISOString();
      }
      const { error } = await supabase
        .from("recommendations")
        .update(update)
        .eq("id", recId)
        .eq("owner_context_id", id);
      if (error) throw new Error(`useRecommendationAction: ${error.message}`);
    },

    // Optimistically remove the rec from the visible list immediately
    onMutate: async ({ recId }) => {
      const ownerKey = id;
      await qc.cancelQueries({ queryKey: [RECS_QUERY_KEY, ownerKey] });
      const previous = qc.getQueryData<RecommendationRow[]>([RECS_QUERY_KEY, ownerKey]);
      qc.setQueryData<RecommendationRow[]>(
        [RECS_QUERY_KEY, ownerKey],
        (old) => (old ?? []).filter((r) => r.id !== recId),
      );
      return { previous, ownerKey };
    },

    // Roll back on server error (use ownerKey from mutate so context switches do not corrupt cache)
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous !== undefined && ctx.ownerKey) {
        qc.setQueryData([RECS_QUERY_KEY, ctx.ownerKey], ctx.previous);
      }
    },

    onSettled: (_d, _e, _v, ctx) => {
      const ownerKey = ctx?.ownerKey ?? id;
      qc.invalidateQueries({ queryKey: [RECS_QUERY_KEY, ownerKey] });
    },
  });
}
