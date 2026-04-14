import { supabase } from "@/integrations/supabase/client";
import { safeTrim } from "@/lib/utils";
import {
  isInvestorReviewsPersonIdSchemaCacheError,
  pickInvestorReviewRowForPerson,
} from "@/lib/investorReviewFallback";
import { isMissingVcRatingsTableError } from "@/lib/vcRatingsTableErrors";

/** Loose match for `star_ratings.firm_name` vs UI firm labels (same idea as CommunityView name keys). */
export function firmNameMatchKey(raw: unknown): string {
  const s = safeTrim(raw);
  if (!s) return "";
  return s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
}

function starRatingsFirmKeys(starRatings: unknown): string[] {
  if (!starRatings || typeof starRatings !== "object") return [];
  const top = starRatings as Record<string, unknown>;
  const rawName = safeTrim(top.firm_name);
  const fromAnswers = top.answers as Record<string, unknown> | undefined;
  const nestedFirm =
    fromAnswers && typeof fromAnswers === "object" && !Array.isArray(fromAnswers)
      ? safeTrim(fromAnswers.firm_name)
      : "";
  return [firmNameMatchKey(rawName || null), firmNameMatchKey(nestedFirm || null)].filter(Boolean);
}

export type SelfPublishedVcRatingHydration = {
  reviewRecordId: string | null;
  starRatings: unknown;
  createdAt: string | null;
  anonymous: boolean;
  comment: string | null;
};

type VcRatingsRow = {
  id?: string;
  anonymous?: boolean;
  comment?: string | null;
  star_ratings?: unknown;
  created_at?: string | null;
};

function mapVcRow(row: VcRatingsRow): SelfPublishedVcRatingHydration {
  return {
    reviewRecordId: typeof row.id === "string" && row.id.trim() ? row.id.trim() : null,
    starRatings: row.star_ratings ?? null,
    createdAt: typeof row.created_at === "string" ? row.created_at : null,
    anonymous: typeof row.anonymous === "boolean" ? row.anonymous : true,
    comment: typeof row.comment === "string" ? row.comment : null,
  };
}

/**
 * Loads the current user's latest published review for a firm (and optional partner),
 * using the same matching rules as `useLatestMyVcRating` so reopening the investor panel
 * stays in sync with what was saved (including UUID / firm_name mismatches).
 */
export async function fetchSelfPublishedVcRatingHydration(opts: {
  userId: string;
  firmDisplayName: string;
  vcFirmIdHint: string | null | undefined;
  vcPersonId: string | null | undefined;
}): Promise<SelfPublishedVcRatingHydration | null> {
  const { userId, firmDisplayName, vcFirmIdHint, vcPersonId } = opts;
  const firm = safeTrim(vcFirmIdHint) || null;
  const nameKey = firmNameMatchKey(firmDisplayName);
  const pid = safeTrim(vcPersonId) || null;

  if (!userId || (!firm && !nameKey)) return null;

  const selectCols = "id, anonymous, comment, star_ratings, created_at";

  // ── 1. Exact vc_firm_id (+ optional person) ─────────────────────────────
  if (firm) {
    let q = supabase
      .from("vc_ratings")
      .select(selectCols)
      .eq("author_user_id", userId)
      .eq("vc_firm_id", firm)
      .eq("is_draft", false);
    q = pid ? q.eq("vc_person_id", pid) : q.is("vc_person_id", null);
    const { data, error } = await q.order("created_at", { ascending: false }).limit(1);

    if (error && isMissingVcRatingsTableError(error)) {
      /* fall through to investor_reviews below */
    } else if (!error && data?.[0]) {
      return mapVcRow(data[0] as VcRatingsRow);
    }
  }

  // ── 2. Scan recent vc_ratings by firm_name in JSONB ───────────────────────
  if (nameKey) {
    const { data: recent, error: recentErr } = await supabase
      .from("vc_ratings")
      .select(selectCols)
      .eq("author_user_id", userId)
      .eq("is_draft", false)
      .order("created_at", { ascending: false })
      .limit(80);

    if (!recentErr && recent?.length) {
      const match = (recent as VcRatingsRow[]).find((row) => {
        const keys = starRatingsFirmKeys(row.star_ratings);
        return keys.some((k) => k === nameKey);
      });
      if (match) return mapVcRow(match);
    }
  }

  // ── 3. investor_reviews (FK failures, missing vc_ratings, legacy rows) ─────
  const { data: irRows, error: irErr } = await supabase
    .from("investor_reviews")
    .select("star_ratings, created_at, is_anonymous, comment, firm_id, person_id")
    .eq("founder_id", userId)
    .order("created_at", { ascending: false })
    .limit(80);

  if (irErr || !irRows?.length) return null;

  type IrRow = {
    star_ratings?: unknown;
    created_at?: string | null;
    is_anonymous?: boolean | null;
    comment?: string | null;
    firm_id?: string;
    person_id?: string;
  };

  const personKey = pid ?? "";

  const tryExactPerson = async (): Promise<IrRow | null> => {
    const exactResult = await supabase
      .from("investor_reviews")
      .select("star_ratings, created_at, is_anonymous, comment, firm_id, person_id")
      .eq("founder_id", userId)
      .eq("firm_id", firm ?? "")
      .eq("person_id", personKey)
      .order("created_at", { ascending: false })
      .limit(5);

    if (exactResult.error && isInvestorReviewsPersonIdSchemaCacheError(exactResult.error)) {
      const legacyResult = await supabase
        .from("investor_reviews")
        .select("star_ratings, created_at, is_anonymous, comment, firm_id, person_id")
        .eq("founder_id", userId)
        .eq("firm_id", firm ?? "")
        .order("created_at", { ascending: false })
        .limit(20);
      if (legacyResult.error || !legacyResult.data?.length) return null;
      const picked = pickInvestorReviewRowForPerson(
        legacyResult.data as IrRow[],
        personKey,
      );
      return picked ?? null;
    }
    if (!exactResult.error && exactResult.data?.length) {
      return (exactResult.data[0] as IrRow) ?? null;
    }
    return null;
  };

  let irMatch: IrRow | null = null;

  if (firm && personKey) {
    irMatch = await tryExactPerson();
  }

  if (!irMatch) {
    irMatch =
      (irRows as IrRow[]).find((row) => {
        const keys = starRatingsFirmKeys(row.star_ratings);
        if (nameKey && keys.some((k) => k === nameKey)) return true;
        if (firm && row.firm_id === firm) return true;
        return false;
      }) ?? null;
  }

  if (!irMatch) return null;

  return {
    reviewRecordId: null,
    starRatings: irMatch.star_ratings ?? null,
    createdAt: typeof irMatch.created_at === "string" ? irMatch.created_at : null,
    anonymous: typeof irMatch.is_anonymous === "boolean" ? irMatch.is_anonymous : true,
    comment: typeof irMatch.comment === "string" ? irMatch.comment : null,
  };
}
