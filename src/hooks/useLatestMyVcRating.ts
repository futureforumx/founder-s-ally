import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Latest published `vc_ratings.star_ratings` JSON for the current user + firm (+ optional person).
 * Refetch when `refreshKey` increments (e.g. after closing the review modal).
 *
 * Strategy:
 * 1. Try matching by `vc_firm_id` in `vc_ratings` (fast, exact).
 * 2. Fall back to scanning recent `vc_ratings` by `star_ratings.firm_name` (handles mismatched UUIDs).
 * 3. Final fallback: check `investor_reviews` by `firm_name` or `firm_id`
 *    (handles cases where vc_firm_id FK validation failed and the edge function saved there instead).
 */
export function useLatestMyVcRating(
  userId: string | undefined,
  vcFirmId: string | null | undefined,
  vcPersonId: string | null | undefined,
  refreshKey: number,
  firmName?: string | null,
): { starRatings: unknown; createdAt: string | null; loading: boolean } {
  const [starRatings, setStarRatings] = useState<unknown>(null);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId) {
      setStarRatings(null);
      setCreatedAt(null);
      setLoading(false);
      return;
    }

    const firm = vcFirmId?.trim();
    const name = firmName?.trim().toLowerCase();

    if (!firm && !name) {
      setStarRatings(null);
      setCreatedAt(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      // ── 1. Try by firm id ────────────────────────────────────────────────
      if (firm) {
        let q = supabase
          .from("vc_ratings")
          .select("star_ratings, created_at")
          .eq("author_user_id", userId)
          .eq("vc_firm_id", firm)
          .eq("is_draft", false);

        const pid = vcPersonId?.trim();
        q = pid ? q.eq("vc_person_id", pid) : q.is("vc_person_id", null);

        const { data } = await q.order("created_at", { ascending: false }).limit(1);

        if (cancelled) return;

        if (data?.[0]) {
          const row0 = data[0] as { star_ratings?: unknown; created_at?: string | null };
          setLoading(false);
          setStarRatings(row0.star_ratings ?? null);
          setCreatedAt(typeof row0.created_at === "string" ? row0.created_at : null);
          return;
        }
      }

      // ── 2. Fall back: scan recent vc_ratings and match by firm_name in JSONB ──
      if (name) {
        const { data: recent } = await supabase
          .from("vc_ratings")
          .select("star_ratings, created_at")
          .eq("author_user_id", userId)
          .eq("is_draft", false)
          .order("created_at", { ascending: false })
          .limit(50);

        if (cancelled) return;

        const match = (recent ?? []).find((row) => {
          const sr = (row as { star_ratings?: unknown }).star_ratings;
          if (!sr || typeof sr !== "object") return false;
          const fn = ((sr as Record<string, unknown>).firm_name as string | undefined)?.trim().toLowerCase();
          return fn === name;
        });

        if (match) {
          setLoading(false);
          const m = match as { star_ratings?: unknown; created_at?: string | null };
          setStarRatings(m.star_ratings ?? null);
          setCreatedAt(typeof m.created_at === "string" ? m.created_at : null);
          return;
        }
      }

      // ── 3. Final fallback: check investor_reviews (used when vc_firm_id FK fails) ──
      {
        const { data: irRows } = await supabase
          .from("investor_reviews")
          .select("star_ratings, created_at")
          .eq("founder_id", userId)
          .order("created_at", { ascending: false })
          .limit(50);

        if (cancelled) return;

        const irMatch = (irRows ?? []).find((row) => {
          const r = row as { star_ratings?: unknown; firm_id?: string };
          const sr = r.star_ratings;
          if (!sr || typeof sr !== "object") return false;
          const fn = ((sr as Record<string, unknown>).firm_name as string | undefined)?.trim().toLowerCase();
          if (name && fn === name) return true;
          if (firm && r.firm_id === firm) return true;
          return false;
        });

        setLoading(false);
        if (irMatch) {
          const m = irMatch as { star_ratings?: unknown; created_at?: string | null };
          setStarRatings(m.star_ratings ?? null);
          setCreatedAt(typeof m.created_at === "string" ? m.created_at : null);
        } else {
          setStarRatings(null);
          setCreatedAt(null);
        }
        return;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, vcFirmId, vcPersonId, refreshKey, firmName]);

  return { starRatings, createdAt, loading };
}
