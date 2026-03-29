import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Latest published `vc_ratings.star_ratings` JSON for the current user + firm (+ optional person).
 * Refetch when `refreshKey` increments (e.g. after closing the review modal).
 */
export function useLatestMyVcRating(
  userId: string | undefined,
  vcFirmId: string | null | undefined,
  vcPersonId: string | null | undefined,
  refreshKey: number,
): { starRatings: unknown; loading: boolean } {
  const [starRatings, setStarRatings] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const firm = vcFirmId?.trim();
    if (!userId || !firm) {
      setStarRatings(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      let q = supabase
        .from("vc_ratings")
        .select("star_ratings")
        .eq("author_user_id", userId)
        .eq("vc_firm_id", firm)
        .eq("is_draft", false);

      const pid = vcPersonId?.trim();
      q = pid ? q.eq("vc_person_id", pid) : q.is("vc_person_id", null);

      const { data, error } = await q.order("created_at", { ascending: false }).limit(1);

      if (cancelled) return;
      setLoading(false);

      if (error || !data?.[0]) {
        setStarRatings(null);
        return;
      }

      setStarRatings((data[0] as { star_ratings?: unknown }).star_ratings ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, vcFirmId, vcPersonId, refreshKey]);

  return { starRatings, loading };
}
