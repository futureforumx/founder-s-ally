import { useEffect, useState } from "react";
import { fetchSelfPublishedVcRatingHydration } from "@/lib/vcRatingSelfLookup";

/**
 * Latest published `vc_ratings.star_ratings` JSON for the current user + firm (+ optional person).
 * Refetch when `refreshKey` increments (e.g. after closing the review modal).
 *
 * Uses the same lookup rules as `fetchSelfPublishedVcRatingHydration` (shared with the review modal).
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
    const displayName = (firmName ?? "").trim();

    if (!firm && !displayName) {
      setStarRatings(null);
      setCreatedAt(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      const row = await fetchSelfPublishedVcRatingHydration({
        userId,
        firmDisplayName: displayName,
        vcFirmIdHint: firm,
        vcPersonId,
      });

      if (cancelled) return;

      setLoading(false);
      if (!row?.starRatings) {
        setStarRatings(null);
        setCreatedAt(null);
        return;
      }
      setStarRatings(row.starRatings);
      setCreatedAt(row.createdAt);
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, vcFirmId, vcPersonId, refreshKey, firmName]);

  return { starRatings, createdAt, loading };
}
