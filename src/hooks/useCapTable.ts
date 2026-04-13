import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { CapBacker } from "@/components/investor-match/CapTableRow";

const fmt = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `$${(n / 1_000).toFixed(0)}K` : n > 0 ? `$${n}` : "$0";

type CapTableRow = {
  id: string;
  investor_name: string;
  amount: number;
  instrument: string;
  date: string | null;
  created_at: string;
  entity_type?: string | null;
  notes?: string | null;
  ownership_pct?: number | null;
};

function rowToBacker(row: CapTableRow): CapBacker {
  return {
    id: row.id,
    name: row.investor_name,
    amount: row.amount,
    amountLabel: fmt(row.amount),
    instrument: row.instrument,
    logoLetter: row.investor_name.charAt(0).toUpperCase(),
    date: row.date || row.created_at,
    entityType: row.entity_type ?? undefined,
    notes: row.notes ?? undefined,
    ownershipPct: row.ownership_pct ?? 0,
  };
}

export function useCapTable(enabled = true) {
  const { user } = useAuth();
  const [backers, setBackers] = useState<CapBacker[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBackers = useCallback(async () => {
    if (!enabled || !user) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase.from("cap_table").select("*").eq("user_id", user.id);
      if (error) {
        console.warn("Failed to fetch cap table:", error);
        setBackers([]);
      } else if (data) {
        setBackers(data.map((row) => rowToBacker(row as CapTableRow)));
      }
    } catch (err) {
      console.warn("Error fetching cap table:", err);
      setBackers([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, user]);

  // Initial fetch
  useEffect(() => { fetchBackers(); }, [fetchBackers]);

  // Realtime subscription for two-way sync
  useEffect(() => {
    if (!enabled || !user) return;
    try {
      const channel = supabase
        .channel("cap-table-sync")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "cap_table", filter: `user_id=eq.${user.id}` },
          () => { fetchBackers(); }
        )
        .subscribe();
      return () => {
        try {
          supabase.removeChannel(channel);
        } catch (err) {
          console.warn("Error removing channel:", err);
        }
      };
    } catch (err) {
      console.warn("Error setting up realtime subscription:", err);
      return;
    }
  }, [enabled, user, fetchBackers]);

  const addInvestor = useCallback(async (name: string, opts?: { entityType?: string; instrument?: string; amount?: number; date?: string }) => {
    if (!user) { toast.error("Please sign in."); return null; }
    const investorName = name.trim();
    if (!investorName) {
      toast.error("Investor name is required.");
      return null;
    }
    try {
      const now = new Date();
      const dateLabel = opts?.date || now.toLocaleDateString("en-US", { month: "short", year: "numeric" });
      const { data, error } = await supabase
        .from("cap_table")
        .insert({
          user_id: user.id,
          investor_name: investorName,
          amount: opts?.amount ?? 0,
          instrument: opts?.instrument ?? "SAFE (Post-money)",
          entity_type: opts?.entityType ?? "Angel",
          date: dateLabel,
        })
        .select()
        .single();
      if (error) {
        console.warn("Failed to add investor:", error);
        toast.error(error.message || "Failed to add investor.");
        return null;
      }
      const nextBacker = rowToBacker(data as CapTableRow);
      setBackers((prev) => {
        if (prev.some((b) => b.id === nextBacker.id)) return prev;
        return [nextBacker, ...prev];
      });
      return nextBacker;
    } catch (err) {
      console.warn("Error adding investor:", err);
      toast.error("Failed to add investor.");
      return null;
    }
  }, [user]);

  const totalRaised = useMemo(() => backers.reduce((sum, b) => sum + b.amount, 0), [backers]);

  return { backers, loading, totalRaised, addInvestor, refetch: fetchBackers, formatCurrency: fmt };
}
