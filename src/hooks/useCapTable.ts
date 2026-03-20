import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { CapBacker } from "@/components/investor-match/CapTableRow";

const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : n > 0 ? `$${n}` : "$0";

export function useCapTable() {
  const { user } = useAuth();
  const [backers, setBackers] = useState<CapBacker[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBackers = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase.from("cap_table").select("*").eq("user_id", user.id);
    if (data) {
      setBackers(
        data.map(row => ({
          id: row.id,
          name: row.investor_name,
          amount: row.amount,
          amountLabel: fmt(row.amount),
          instrument: row.instrument,
          logoLetter: row.investor_name.charAt(0).toUpperCase(),
          date: row.date || row.created_at,
          ownershipPct: (row as any).ownership_pct ?? 0,
        }))
      );
    }
    setLoading(false);
  }, [user]);

  // Initial fetch
  useEffect(() => { fetchBackers(); }, [fetchBackers]);

  // Realtime subscription for two-way sync
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("cap-table-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cap_table", filter: `user_id=eq.${user.id}` },
        () => { fetchBackers(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchBackers]);

  const addInvestor = useCallback(async (name: string, opts?: { entityType?: string; instrument?: string; amount?: number; date?: string }) => {
    if (!user) { toast.error("Please sign in."); return null; }
    const now = new Date();
    const dateLabel = opts?.date || now.toLocaleDateString("en-US", { month: "short", year: "numeric" });
    const { data, error } = await supabase
      .from("cap_table")
      .insert({
        user_id: user.id,
        investor_name: name,
        amount: opts?.amount ?? 0,
        instrument: opts?.instrument ?? "SAFE (Post-money)",
        entity_type: opts?.entityType ?? "Angel",
        date: dateLabel,
      })
      .select()
      .single();
    if (error) { toast.error("Failed to add investor."); return null; }
    return data;
  }, [user]);

  const totalRaised = useMemo(() => backers.reduce((sum, b) => sum + b.amount, 0), [backers]);

  return { backers, loading, totalRaised, addInvestor, refetch: fetchBackers, formatCurrency: fmt };
}
