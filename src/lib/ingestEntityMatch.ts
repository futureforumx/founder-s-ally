/**
 * Cross-source identity matching for Latest Funding deals and New Funds
 * announcements. Higher-quality sources win field values; lower-tier hits
 * collapse onto the canonical row instead of inserting a second live record.
 *
 * Tiers (lower number = higher fidelity):
 *   1  startups.gallery structured table, official/SEC/structured fund sources
 *   2  TechCrunch Venture, AlleyWatch
 *   3  GeekWire, PR Newswire, general RSS
 */

export type IngestQualityTier = 1 | 2 | 3;

const LEGAL_SUFFIX_RE =
  /\b(?:incorporated|corporation|company|limited|inc|llc|llp|ltd|corp|plc|gmbh|ag|s\.?a\.?|pty|lp)\.?\b/gi;

export const DEAL_MATCH_WINDOW_DAYS = 30;
export const AMOUNT_SIMILARITY_TOLERANCE = 0.25;
export const FUND_SIZE_SIMILARITY_TOLERANCE = 0.3;
export const DEAL_MATCH_MIN_SCORE = 60;

export function fundingSourceQualityTier(sourceKey: string | null | undefined): IngestQualityTier {
  const key = (sourceKey || "").toUpperCase();
  if (key === "STARTUPS_GALLERY_NEWS") return 1;
  if (key === "TECHCRUNCH_VENTURE" || key === "TECHCRUNCH_FUNDING_TAG" || key === "ALLEYWATCH_FUNDING") return 2;
  return 3;
}

export function fundAnnouncementQualityTier(item: {
  sourceType?: string | null;
  sourcePublisher?: string | null;
  sourceUrl?: string | null;
  metadata?: Record<string, unknown> | null;
}): IngestQualityTier {
  const sourceType = (item.sourceType || "").toLowerCase();
  if (
    sourceType === "official_website" ||
    sourceType === "sec_filing" ||
    sourceType === "adv_filing" ||
    sourceType === "structured_provider"
  ) {
    return 1;
  }
  const feedKey =
    typeof item.metadata?.source_feed_key === "string" ? item.metadata.source_feed_key.toUpperCase() : "";
  if (feedKey === "STARTUPS_GALLERY_NEWS") return 1;
  const publisher = `${item.sourcePublisher || ""} ${item.sourceUrl || ""} ${feedKey}`.toLowerCase();
  if (/techcrunch|alleywatch/.test(publisher) || /TECHCRUNCH|ALLEYWATCH/.test(feedKey)) return 2;
  return 3;
}

/** Sort so Tier 1 is processed first and becomes the live canonical row. */
export function compareQualityTier(a: IngestQualityTier, b: IngestQualityTier): number {
  return a - b;
}

export function incomingOutranksExisting(incoming: IngestQualityTier, existing: IngestQualityTier): boolean {
  return incoming < existing;
}

/**
 * Skip a second LLM pass when a matching live deal/fund already came from an
 * equal or better source. Cheaper, and it keeps Tier 1 structured fields intact.
 */
export function shouldSkipLlmForMatch(existingTier: IngestQualityTier, incomingTier: IngestQualityTier): boolean {
  return existingTier <= incomingTier;
}

export function normalizeEntityNameForMatch(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]+/g, " ");
  s = s.replace(LEGAL_SUFFIX_RE, " ");
  s = s.replace(/\b(?:the|and)\b/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

export function entityNameTokens(raw: string | null | undefined): Set<string> {
  return new Set(normalizeEntityNameForMatch(raw).split(" ").filter((t) => t.length >= 2));
}

export function tokenJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersect = 0;
  for (const token of a) {
    if (b.has(token)) intersect += 1;
  }
  return intersect / new Set([...a, ...b]).size;
}

export function amountsAreSimilar(
  a: number | bigint | null | undefined,
  b: number | bigint | null | undefined,
  tolerance = AMOUNT_SIMILARITY_TOLERANCE,
): boolean {
  if (a == null || b == null) return true;
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return true;
  const max = Math.max(Math.abs(left), Math.abs(right), 1);
  return Math.abs(left - right) / max <= tolerance;
}

export function amountsConflict(
  a: number | bigint | null | undefined,
  b: number | bigint | null | undefined,
  conflict = 0.5,
): boolean {
  if (a == null || b == null) return false;
  const left = Number(a);
  const right = Number(b);
  if (!Number.isFinite(left) || !Number.isFinite(right) || left === 0 || right === 0) return false;
  const max = Math.max(Math.abs(left), Math.abs(right), 1);
  return Math.abs(left - right) / max > conflict;
}

export function roundsAreCompatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const left = (a || "").trim().toLowerCase();
  const right = (b || "").trim().toLowerCase();
  if (!left || !right) return true;
  if (left === right) return true;
  if (left.includes(right) || right.includes(left)) return true;
  return false;
}

export function daysApart(a: Date | string | null | undefined, b: Date | string | null | undefined): number | null {
  if (!a || !b) return null;
  const left = a instanceof Date ? a.getTime() : new Date(a).getTime();
  const right = b instanceof Date ? b.getTime() : new Date(b).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return null;
  return Math.abs(Math.round((left - right) / 86_400_000));
}

export type DealIdentityInput = {
  companyName: string;
  roundTypeNormalized?: string | null;
  amountMinorUnits?: number | bigint | null;
  announcedDate?: Date | string | null;
};

export type IdentityMatchResult = {
  isMatch: boolean;
  score: number;
  reasons: string[];
};

export function scoreDealIdentityMatch(existing: DealIdentityInput, incoming: DealIdentityInput): IdentityMatchResult {
  const reasons: string[] = [];
  let score = 0;
  const existingName = normalizeEntityNameForMatch(existing.companyName);
  const incomingName = normalizeEntityNameForMatch(incoming.companyName);
  if (!existingName || !incomingName) {
    return { isMatch: false, score: 0, reasons: ["missing_name"] };
  }

  if (existingName === incomingName) {
    score += 50;
    reasons.push("normalized_name");
  } else {
    const overlap = tokenJaccard(entityNameTokens(existing.companyName), entityNameTokens(incoming.companyName));
    if (overlap >= 0.85) {
      score += 40;
      reasons.push("name_fuzzy_high");
    } else if (overlap >= 0.72) {
      score += 25;
      reasons.push("name_fuzzy");
    } else {
      return { isMatch: false, score, reasons: ["name_mismatch"] };
    }
  }

  const dateGap = daysApart(existing.announcedDate, incoming.announcedDate);
  if (dateGap != null && dateGap > DEAL_MATCH_WINDOW_DAYS) {
    return { isMatch: false, score, reasons: [...reasons, "date_window"] };
  }
  if (dateGap == null || dateGap <= DEAL_MATCH_WINDOW_DAYS) {
    score += 10;
    reasons.push("date_window");
  }

  if (roundsAreCompatible(existing.roundTypeNormalized, incoming.roundTypeNormalized)) {
    if (existing.roundTypeNormalized && incoming.roundTypeNormalized) {
      score += 20;
      reasons.push("round_type");
    }
  } else {
    score -= 40;
    reasons.push("round_mismatch");
  }

  if (amountsConflict(existing.amountMinorUnits, incoming.amountMinorUnits)) {
    score -= 30;
    reasons.push("amount_conflict");
  } else if (amountsAreSimilar(existing.amountMinorUnits, incoming.amountMinorUnits)) {
    if (existing.amountMinorUnits != null && incoming.amountMinorUnits != null) {
      score += 15;
      reasons.push("amount_similar");
    }
  }

  return { isMatch: score >= DEAL_MATCH_MIN_SCORE && !reasons.includes("round_mismatch"), score, reasons };
}

export type FundIdentityInput = {
  firmName: string;
  firmRecordId?: string | null;
  fundLabel?: string | null;
  sequenceNumber?: number | null;
  sizeUsd?: number | null;
  announcedDate?: Date | string | null;
  vehicleType?: string | null;
};

export function scoreFundIdentityMatch(existing: FundIdentityInput, incoming: FundIdentityInput): IdentityMatchResult {
  const reasons: string[] = [];
  let score = 0;

  if (existing.firmRecordId && incoming.firmRecordId && existing.firmRecordId === incoming.firmRecordId) {
    score += 50;
    reasons.push("same_firm_id");
  } else {
    const existingName = normalizeEntityNameForMatch(existing.firmName);
    const incomingName = normalizeEntityNameForMatch(incoming.firmName);
    if (!existingName || !incomingName) return { isMatch: false, score: 0, reasons: ["missing_firm"] };
    if (existingName === incomingName) {
      score += 45;
      reasons.push("normalized_firm");
    } else {
      const overlap = tokenJaccard(entityNameTokens(existing.firmName), entityNameTokens(incoming.firmName));
      if (overlap >= 0.8) {
        score += 30;
        reasons.push("firm_fuzzy");
      } else {
        return { isMatch: false, score, reasons: ["firm_mismatch"] };
      }
    }
  }

  const dateGap = daysApart(existing.announcedDate, incoming.announcedDate);
  if (dateGap != null && dateGap > DEAL_MATCH_WINDOW_DAYS) {
    return { isMatch: false, score, reasons: [...reasons, "date_window"] };
  }
  score += 8;
  reasons.push("date_window");

  if (
    existing.sequenceNumber != null &&
    incoming.sequenceNumber != null &&
    existing.sequenceNumber === incoming.sequenceNumber
  ) {
    score += 20;
    reasons.push("sequence");
  } else {
    const existingLabel = normalizeEntityNameForMatch(existing.fundLabel);
    const incomingLabel = normalizeEntityNameForMatch(incoming.fundLabel);
    if (existingLabel && incomingLabel) {
      if (existingLabel === incomingLabel) {
        score += 18;
        reasons.push("fund_label");
      } else {
        const overlap = tokenJaccard(entityNameTokens(existing.fundLabel), entityNameTokens(incoming.fundLabel));
        if (overlap >= 0.7) {
          score += 12;
          reasons.push("fund_label_fuzzy");
        }
      }
    }
  }

  if (existing.vehicleType && incoming.vehicleType && existing.vehicleType === incoming.vehicleType) {
    score += 8;
    reasons.push("vehicle_type");
  }

  if (amountsConflict(existing.sizeUsd, incoming.sizeUsd, 0.5)) {
    score -= 25;
    reasons.push("size_conflict");
  } else if (amountsAreSimilar(existing.sizeUsd, incoming.sizeUsd, FUND_SIZE_SIMILARITY_TOLERANCE)) {
    if (existing.sizeUsd != null && incoming.sizeUsd != null) {
      score += 12;
      reasons.push("size_similar");
    }
  }

  return { isMatch: score >= DEAL_MATCH_MIN_SCORE && !reasons.includes("size_conflict"), score, reasons };
}

export function mergeSupplementaryUrls(existing: unknown, extra: Array<string | null | undefined>): string[] {
  const fromExisting = Array.isArray(existing) ? existing.filter((u): u is string => typeof u === "string") : [];
  return [...new Set([...fromExisting, ...extra.filter((u): u is string => Boolean(u))])];
}

export function pickPreferredField<T>(
  existing: T,
  incoming: T,
  incomingOutranks: boolean,
): T {
  const incomingEmpty = incoming == null || incoming === "";
  const existingEmpty = existing == null || existing === "";
  if (incomingEmpty) return existing;
  if (existingEmpty) return incoming;
  return incomingOutranks ? incoming : existing;
}
