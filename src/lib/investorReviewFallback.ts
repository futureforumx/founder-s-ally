type PostgrestLikeError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

type QueryDb = {
  from: (table: string) => any;
};

type InvestorReviewLookupRow = {
  id?: string;
  star_ratings?: unknown;
  created_at?: string | null;
};

function errorBlob(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  const o = err as PostgrestLikeError;
  return `${o.code ?? ""} ${o.message ?? ""} ${o.details ?? ""} ${o.hint ?? ""}`.toLowerCase();
}

function extractRememberWhoPersonIds(starRatings: unknown): string[] {
  if (!starRatings || typeof starRatings !== "object" || Array.isArray(starRatings)) return [];
  const rawIds = (starRatings as { remember_who_vc_person_ids?: unknown }).remember_who_vc_person_ids;
  if (!Array.isArray(rawIds)) return [];
  return rawIds
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean);
}

function stripPersonId<T extends Record<string, unknown>>(row: T): Omit<T, "person_id"> {
  const { person_id: _personId, ...rest } = row;
  return rest;
}

export function isInvestorReviewsPersonIdSchemaCacheError(err: unknown): boolean {
  const blob = errorBlob(err);
  if (!blob.includes("investor_reviews") || !blob.includes("person_id")) return false;
  return blob.includes("schema cache") || blob.includes("could not find") || blob.includes("pgrst204");
}

export function buildInvestorReviewUpsertRow(userId: string, payload: Record<string, unknown>): Record<string, unknown> {
  const starRatings =
    payload.star_ratings && typeof payload.star_ratings === "object" && !Array.isArray(payload.star_ratings)
      ? (payload.star_ratings as Record<string, unknown>)
      : {};
  const firmNameFromStar =
    typeof starRatings.firm_name === "string" && starRatings.firm_name.trim().length > 0
      ? starRatings.firm_name.trim()
      : "";
  const derivedFirmId =
    typeof payload.vc_firm_id === "string" && payload.vc_firm_id.trim().length > 0
      ? payload.vc_firm_id.trim()
      : firmNameFromStar || "unknown-firm";
  const npsRaw = payload.nps;
  const npsScore = typeof npsRaw === "number" && Number.isFinite(npsRaw) ? npsRaw : 0;
  const rawPerson = typeof payload.vc_person_id === "string" ? payload.vc_person_id.trim() : "";

  return {
    founder_id: userId,
    firm_id: derivedFirmId,
    person_id: rawPerson,
    interaction_type:
      typeof payload.interaction_type === "string" && payload.interaction_type.trim()
        ? payload.interaction_type
        : "investor_relationship",
    nps_score: npsScore,
    did_respond: false,
    comment: typeof payload.comment === "string" ? payload.comment : null,
    star_ratings: starRatings,
    is_anonymous: typeof payload.anonymous === "boolean" ? payload.anonymous : true,
  };
}

export function pickInvestorReviewRowForPerson<T extends InvestorReviewLookupRow>(
  rows: T[],
  personId: string,
): T | null {
  if (!rows.length) return null;

  const normalizedPersonId = personId.trim();
  if (!normalizedPersonId) {
    return rows.find((row) => extractRememberWhoPersonIds(row.star_ratings).length === 0) ?? rows[0];
  }

  const exact = rows.find((row) => extractRememberWhoPersonIds(row.star_ratings).includes(normalizedPersonId));
  if (exact) return exact;
  if (rows.length === 1) return rows[0];
  return null;
}

export async function upsertInvestorReviewWithSchemaFallback(opts: {
  db: QueryDb;
  userId: string;
  payload: Record<string, unknown>;
}): Promise<{ error: PostgrestLikeError | null; usedSchemaFallback: boolean }> {
  const { db, userId, payload } = opts;
  const invRow = buildInvestorReviewUpsertRow(userId, payload);
  const firmId = String(invRow.firm_id ?? "");
  const personId = String(invRow.person_id ?? "");

  const updatePatch = {
    interaction_type: invRow.interaction_type,
    nps_score: invRow.nps_score,
    did_respond: invRow.did_respond,
    comment: invRow.comment,
    star_ratings: invRow.star_ratings,
    is_anonymous: invRow.is_anonymous,
  };

  let usedSchemaFallback = false;
  let existingRow: InvestorReviewLookupRow | null = null;

  const { data: exactRows, error: exactErr } = await db
    .from("investor_reviews")
    .select("id, star_ratings, created_at")
    .eq("founder_id", userId)
    .eq("firm_id", firmId)
    .eq("person_id", personId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (exactErr) {
    if (!isInvestorReviewsPersonIdSchemaCacheError(exactErr)) {
      return { error: exactErr, usedSchemaFallback };
    }

    usedSchemaFallback = true;

    const { data: legacyRows, error: legacyErr } = await db
      .from("investor_reviews")
      .select("id, star_ratings, created_at")
      .eq("founder_id", userId)
      .eq("firm_id", firmId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (legacyErr) {
      return { error: legacyErr, usedSchemaFallback };
    }

    existingRow = pickInvestorReviewRowForPerson((legacyRows ?? []) as InvestorReviewLookupRow[], personId);
  } else {
    existingRow = Array.isArray(exactRows) && exactRows.length > 0 ? (exactRows[0] as InvestorReviewLookupRow) : null;
  }

  if (existingRow?.id) {
    const { error } = await db.from("investor_reviews").update(updatePatch).eq("id", existingRow.id);
    return { error: error ?? null, usedSchemaFallback };
  }

  const insertRow = usedSchemaFallback ? stripPersonId(invRow) : invRow;
  const { error } = await db.from("investor_reviews").insert(insertRow);
  return { error: error ?? null, usedSchemaFallback };
}