import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface RevealResult {
  email?: string;
  firm_name?: string;
  credits_remaining?: number;
  error?: string;
}

export function useRevealContact() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (investorId: string): Promise<RevealResult> => {
      const { data, error } = await supabase.rpc("reveal_contact_info", {
        _investor_id: investorId,
      });
      if (error) throw error;
      return data as unknown as RevealResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["user-credits"] });
    },
  });
}

export function useUserCredits() {
  return useQuery({
    queryKey: ["user-credits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_credits")
        .select("credits_remaining, tier")
        .maybeSingle();

      if (error) throw error;
      return data ?? { credits_remaining: 10, tier: "free" };
    },
    staleTime: 60_000,
  });
}

export async function exportInvestorCSV(intent: string): Promise<Blob> {
  const { data, error } = await supabase.functions.invoke("export-csv", {
    body: { intent },
  });

  if (error) throw error;

  // The edge function returns CSV text
  if (typeof data === "string") {
    return new Blob([data], { type: "text/csv" });
  }

  // If it came back as JSON with an error
  if (data?.error) throw new Error(data.error);

  return new Blob([JSON.stringify(data)], { type: "text/csv" });
}
