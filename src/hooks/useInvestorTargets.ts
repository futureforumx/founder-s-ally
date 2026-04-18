import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase, supabasePublicDirectory } from "@/integrations/supabase/client";
import { isOwnerContextUuid } from "@/lib/connectorContextStorage";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PipelineStage = "researching" | "reaching_out" | "met" | "passed" | "committed";

export const PIPELINE_STAGES: { value: PipelineStage; label: string }[] = [
  { value: "researching", label: "Researching" },
  { value: "reaching_out", label: "Reaching Out" },
  { value: "met", label: "Met" },
  { value: "passed", label: "Passed" },
  { value: "committed", label: "Committed" },
];

type ContextEntityNoteRow = Tables<"context_entity_notes">;

export type InvestorTarget = ContextEntityNoteRow & {
  org_name: string | null;
  org_domain: string | null;
};

export const TARGETS_QUERY_KEY = "phase4_investor_targets" as const;

// ---------------------------------------------------------------------------
// useInvestorTargets
// ---------------------------------------------------------------------------

/**
 * Fetch all org-targeted context_entity_notes for one owner context.
 * Resolves org_name / org_domain via batch lookup against the public directory.
 */
export function useInvestorTargets(ownerContextId: string | null | undefined) {
  const id = ownerContextId?.trim() ?? "";
  const enabled = isOwnerContextUuid(id);

  return useQuery({
    queryKey: [TARGETS_QUERY_KEY, id],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<InvestorTarget[]> => {
      const { data: notes, error } = await supabase
        .from("context_entity_notes")
        .select("*")
        .eq("owner_context_id", id)
        .eq("subject_type", "organization")
        .order("created_at", { ascending: false });

      if (error) throw new Error(`useInvestorTargets: ${error.message}`);
      if (!notes || notes.length === 0) return [];

      // Batch-fetch org names from the public directory client (anon policy)
      const orgIds = [...new Set(notes.map((n) => n.organization_id).filter(Boolean))] as string[];

      const { data: orgs } =
        orgIds.length > 0
          ? await supabasePublicDirectory
              .from("organizations")
              .select("id, canonicalName, domain")
              .in("id", orgIds)
          : { data: [] as { id: string; canonicalName: string; domain: string | null }[] };

      const orgMap = new Map<string, { name: string | null; domain: string | null }>(
        (orgs ?? []).map((o) => [o.id, { name: o.canonicalName ?? null, domain: o.domain ?? null }]),
      );

      return notes.map((n): InvestorTarget => ({
        ...n,
        org_name: n.organization_id ? (orgMap.get(n.organization_id)?.name ?? null) : null,
        org_domain: n.organization_id ? (orgMap.get(n.organization_id)?.domain ?? null) : null,
      }));
    },
  });
}

// ---------------------------------------------------------------------------
// useAddInvestorTarget
// ---------------------------------------------------------------------------

export function useAddInvestorTarget() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      ownerContextId,
      organizationId,
      pipelineStage,
    }: {
      ownerContextId: string;
      organizationId: string;
      pipelineStage: PipelineStage;
    }) => {
      const row: TablesInsert<"context_entity_notes"> = {
        owner_context_id: ownerContextId,
        subject_type: "organization",
        organization_id: organizationId,
        pipeline_stage: pipelineStage,
      };
      const { error } = await supabase.from("context_entity_notes").insert(row);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [TARGETS_QUERY_KEY] });
    },
  });
}

// ---------------------------------------------------------------------------
// useUpdateTargetStage
// ---------------------------------------------------------------------------

export function useUpdateTargetStage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: PipelineStage }) => {
      const { error } = await supabase
        .from("context_entity_notes")
        .update({ pipeline_stage: stage })
        .eq("id", id);
      if (error) throw new Error(`useUpdateTargetStage: ${error.message}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [TARGETS_QUERY_KEY] });
    },
  });
}

// ---------------------------------------------------------------------------
// useOrgSearch  — debounced org name lookup for the add-target form
// Uses supabasePublicDirectory: organizations has anon SELECT policy.
// ---------------------------------------------------------------------------

export function useOrgSearch(query: string) {
  const trimmed = query.trim();

  return useQuery({
    queryKey: ["org-search", trimmed],
    enabled: trimmed.length >= 2,
    staleTime: 60_000,
    queryFn: async (): Promise<{ id: string; name: string; domain: string | null }[]> => {
      const { data, error } = await supabasePublicDirectory
        .from("organizations")
        .select("id, canonicalName, domain")
        .ilike("canonicalName", `%${trimmed}%`)
        .limit(8);
      if (error) throw new Error(`useOrgSearch: ${error.message}`);
      return (data ?? []).map((o) => ({
        id: o.id,
        name: o.canonicalName ?? "",
        domain: o.domain ?? null,
      }));
    },
  });
}
