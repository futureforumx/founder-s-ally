import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export type InteractionAction = "saved" | "skipped" | "viewed";

export interface CollaborativeRec {
  firm_id: string;
  firm_name: string;
  peer_save_count: number;
}

export function useVCInteractions(userId: string | undefined) {
  const queryClient = useQueryClient();

  // Fetch user's saved/skipped firms
  const interactions = useQuery({
    queryKey: ["vc-interactions", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("founder_vc_interactions")
        .select("firm_id, action_type")
        .eq("founder_id", userId!);
      if (error) throw error;
      return data as { firm_id: string; action_type: string }[];
    },
    staleTime: 60_000,
  });

  const savedFirmIds = new Set(
    (interactions.data || [])
      .filter((i) => i.action_type === "saved")
      .map((i) => i.firm_id)
  );

  const skippedFirmIds = new Set(
    (interactions.data || [])
      .filter((i) => i.action_type === "skipped")
      .map((i) => i.firm_id)
  );

  // Record interaction
  const recordInteraction = useMutation({
    mutationFn: async ({
      firmId,
      action,
    }: {
      firmId: string;
      action: InteractionAction;
    }) => {
      const { error } = await supabase
        .from("founder_vc_interactions")
        .upsert(
          {
            founder_id: userId!,
            firm_id: firmId,
            action_type: action,
          },
          { onConflict: "founder_id,firm_id,action_type" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vc-interactions", userId] });
      queryClient.invalidateQueries({ queryKey: ["collaborative-recs", userId] });
    },
  });

  // Remove interaction (unsave)
  const removeInteraction = useMutation({
    mutationFn: async ({
      firmId,
      action,
    }: {
      firmId: string;
      action: InteractionAction;
    }) => {
      const { error } = await supabase
        .from("founder_vc_interactions")
        .delete()
        .eq("founder_id", userId!)
        .eq("firm_id", firmId)
        .eq("action_type", action);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vc-interactions", userId] });
      queryClient.invalidateQueries({ queryKey: ["collaborative-recs", userId] });
    },
  });

  // Collaborative recommendations
  const collaborativeRecs = useQuery({
    queryKey: ["collaborative-recs", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "get_collaborative_recommendations",
        { _current_founder_id: userId! }
      );
      if (error) throw error;
      return (data || []) as CollaborativeRec[];
    },
    staleTime: 5 * 60_000,
  });

  // Sector save-rate decay multipliers
  const useDecayMultipliers = (sector: string | null) =>
    useQuery({
      queryKey: ["decay-multipliers", sector],
      enabled: !!sector,
      queryFn: async () => {
        const { data, error } = await supabase.rpc("get_sector_save_rates", {
          _sector: sector!,
        });
        if (error) throw error;
        const map: Record<string, number> = {};
        for (const row of data || []) {
          map[row.firm_id] = Number(row.decay_multiplier);
        }
        return map;
      },
      staleTime: 10 * 60_000,
    });

  return {
    savedFirmIds,
    skippedFirmIds,
    recordInteraction,
    removeInteraction,
    collaborativeRecs,
    useDecayMultipliers,
    isLoading: interactions.isLoading,
  };
}
