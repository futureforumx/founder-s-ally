import { CAPITAL_EVENT_KEYWORDS, CAPITAL_EVENT_THRESHOLDS, CAPITAL_EVENT_WEIGHTS } from "./config";
import { inferSequenceNumber, normalizedFundLabel } from "./matching";
import { contentHash, normalizeFirmName } from "./normalize";
import { isLikelyVcFundVehicleHeadline } from "../../../scripts/funding-ingest/extract";
import type {
  CandidateCapitalEventDraft,
  CandidateCapitalEventEvidence,
  CandidateCapitalEventGuess,
  CandidateCapitalEventStatus,
  ExtractedFundAnnouncement,
  FirmRecordLookup,
} from "./types";

function clamp(value: number): number {
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
}

export function normalizeAnnouncementDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;

  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) {
    const parsed = new Date(`${isoDate[1]}-${isoDate[2]}-${isoDate[3]}T12:00:00.000Z`);
    return Number.isNaN(parsed.getTime()) ? null : `${isoDate[1]}-${isoDate[2]}-${isoDate[3]}`;
  }

  const isoTimestamp = raw.match(/^(\d{4}-\d{2}-\d{2})T/);
  if (isoTimestamp) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : isoTimestamp[1];
  }

  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    const year = Number(mdy[3]);
    if (
      Number.isFinite(month) &&
      month >= 1 &&
      month <= 12 &&
      Number.isFinite(day) &&
      day >= 1 &&
      day <= 31 &&
      Number.isFinite(year) &&
      year >= 1900
    ) {
      const parsed = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
    }
  }

  const monthYear = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (monthYear) {
    const month = Number(monthYear[1]);
    const year = Number(monthYear[2]);
    if (Number.isFinite(month) && month >= 1 && month <= 12 && Number.isFinite(year) && year >= 1900) {
      const parsed = new Date(Date.UTC(year, month - 1, 1, 12, 0, 0));
      return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
    }
  }

  return null;
}

function textBlob(item: Pick<ExtractedFundAnnouncement, "sourceTitle" | "rawText" | "fundName" | "fundLabel">): string {
  return [item.sourceTitle, item.fundName, item.fundLabel, item.rawText].filter(Boolean).join(" ");
}

function dateDiffDays(a: string, b: string): number {
  const left = new Date(a).getTime();
  const right = new Date(b).getTime();
  if (Number.isNaN(left) || Number.isNaN(right)) return 9999;
  return Math.abs(Math.round((left - right) / 86400000));
}

function percentDifference(a: number, b: number): number {
  const max = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / max;
}

export function guessCandidateEventType(item: ExtractedFundAnnouncement): CandidateCapitalEventGuess {
  const text = textBlob(item).toLowerCase();
  if (/\bfinal close\b|\bclosed\b/.test(text)) return "fund_closed";
  if (/\btarget\b/.test(text)) return "fund_target_updated";
  if (/\bnew vehicle\b|\bopportunity fund\b|\bgrowth fund\b|\bseed fund\b|\bscout fund\b|\brolling fund\b/.test(text)) {
    return "new_vehicle_detected";
  }
  if (/\bfresh capital\b/.test(text)) return "fresh_capital_inferred";
  if (/\bfund\b/.test(text)) return "new_fund_announced";
  return "unknown";
}

export function computeCandidateClusterKey(item: ExtractedFundAnnouncement, firmRecordId: string | null): string {
  const publishedAt = normalizeAnnouncementDate(item.announcedDate) || normalizeAnnouncementDate(item.closeDate) || new Date().toISOString().slice(0, 10);
  const monthBucket = publishedAt.slice(0, 7);
  const sequence = inferSequenceNumber(item);
  const fundLabel = normalizedFundLabel(item) || "unknown-fund";
  return [
    firmRecordId || normalizeFirmName(item.firmName),
    fundLabel,
    sequence ?? "noseq",
    item.vintageYear ?? "novintage",
    guessCandidateEventType(item),
    monthBucket,
  ].join(":");
}

export function scoreCandidateCapitalEvent(args: {
  item: ExtractedFundAnnouncement;
  firm: FirmRecordLookup | null;
  firmMatchConfidence: number;
  corroborationCount?: number;
  officialSourcePresent?: boolean;
  corroborationScore?: number;
  conflictPenalty?: number;
  independentSourceCount?: number;
}): number {
  const text = textBlob(args.item);
  const trustedSourceFeed =
    args.item.metadata?.detection_mode === "source_feed_listing" &&
    /techcrunch|alleywatch|geekwire/i.test(args.item.sourcePublisher || "");
  const trustedStructuredSource =
    args.item.metadata?.detection_mode === "structured_source_listing" &&
    /everything startups|vc stack/i.test(args.item.sourcePublisher || "");
  const vehicleHeadline = isLikelyVcFundVehicleHeadline(args.item.sourceTitle || "", args.item.rawText || "");
  let score = CAPITAL_EVENT_WEIGHTS.base;

  if (args.officialSourcePresent || args.item.sourceType === "official_website") score += CAPITAL_EVENT_WEIGHTS.officialSource;
  if (CAPITAL_EVENT_KEYWORDS.positiveFund.test(text)) score += CAPITAL_EVENT_WEIGHTS.explicitFundLanguage;
  if (CAPITAL_EVENT_KEYWORDS.closeLanguage.test(text)) score += CAPITAL_EVENT_WEIGHTS.closeLanguage;
  if (CAPITAL_EVENT_KEYWORDS.sizeLanguage.test(text) || args.item.fundSize != null || args.item.targetSizeUsd != null || args.item.finalSizeUsd != null) {
    score += CAPITAL_EVENT_WEIGHTS.explicitSize;
  }
  if (inferSequenceNumber(args.item) != null || args.item.vintageYear != null) score += CAPITAL_EVENT_WEIGHTS.sequenceOrVintage;
  if (args.firm && args.firmMatchConfidence >= 0.9) score += CAPITAL_EVENT_WEIGHTS.exactFirmMatch;
  if ((args.corroborationCount || 1) > 1) {
    score += Math.min(args.corroborationCount! - 1, 3) * (CAPITAL_EVENT_WEIGHTS.corroboration / 3);
  }
  if ((args.independentSourceCount || 0) > 1) {
    score += Math.min(args.independentSourceCount! - 1, 2) * (CAPITAL_EVENT_WEIGHTS.independentSource / 2);
  }
  if ((args.corroborationScore || 0) > 0) {
    score += Math.min(args.corroborationScore || 0, 1) * CAPITAL_EVENT_WEIGHTS.corroborationAgreement;
  }
  if ((args.officialSourcePresent || args.item.sourceType === "official_website") && (args.corroborationScore || 0) >= 0.5) {
    score += CAPITAL_EVENT_WEIGHTS.strongOfficialBypass;
  }
  if (trustedSourceFeed) score += 0.12;
  if (trustedStructuredSource) score += 0.28;
  if (vehicleHeadline) score += 0.16;
  if (trustedSourceFeed && vehicleHeadline && args.firm && args.firmMatchConfidence >= 0.9) score += 0.12;
  if (trustedStructuredSource && args.firm && args.firmMatchConfidence >= 0.9) score += 0.18;
  if (trustedStructuredSource && (args.item.fundSize != null || args.item.targetSizeUsd != null || args.item.finalSizeUsd != null)) {
    score += 0.08;
  }

  if (!vehicleHeadline && CAPITAL_EVENT_KEYWORDS.negativePortfolio.test(text)) score += CAPITAL_EVENT_WEIGHTS.portfolioFinancingPenalty;
  if (CAPITAL_EVENT_KEYWORDS.negativeHiring.test(text)) score += CAPITAL_EVENT_WEIGHTS.hiringPenalty;
  if (CAPITAL_EVENT_KEYWORDS.negativeProduct.test(text)) score += CAPITAL_EVENT_WEIGHTS.productPenalty;
  if (CAPITAL_EVENT_KEYWORDS.negativeCommentary.test(text)) score += CAPITAL_EVENT_WEIGHTS.commentaryPenalty;
  if (!vehicleHeadline && !CAPITAL_EVENT_KEYWORDS.positiveFund.test(text) && /\bfundraising|capital\b/i.test(text)) {
    score += CAPITAL_EVENT_WEIGHTS.genericFundraisingPenalty;
  }
  score -= Math.min(args.conflictPenalty || 0, 1) * Math.abs(CAPITAL_EVENT_WEIGHTS.conflictPenalty);

  return clamp(score);
}

export function explainCandidateScore(args: {
  item: ExtractedFundAnnouncement;
  firm: FirmRecordLookup | null;
  firmMatchConfidence: number;
  corroborationCount?: number;
  officialSourcePresent?: boolean;
  corroborationScore?: number;
  conflictPenalty?: number;
  independentSourceCount?: number;
}): Record<string, unknown> {
  const text = textBlob(args.item);
  const trustedSourceFeed =
    args.item.metadata?.detection_mode === "source_feed_listing" &&
    /techcrunch|alleywatch|geekwire/i.test(args.item.sourcePublisher || "");
  const trustedStructuredSource =
    args.item.metadata?.detection_mode === "structured_source_listing" &&
    /everything startups|vc stack/i.test(args.item.sourcePublisher || "");
  const vehicleHeadline = isLikelyVcFundVehicleHeadline(args.item.sourceTitle || "", args.item.rawText || "");
  return {
    official_source: args.officialSourcePresent || args.item.sourceType === "official_website",
    trusted_source_feed: trustedSourceFeed,
    trusted_structured_source: trustedStructuredSource,
    vehicle_headline: vehicleHeadline,
    positive_fund_language: CAPITAL_EVENT_KEYWORDS.positiveFund.test(text),
    close_language: CAPITAL_EVENT_KEYWORDS.closeLanguage.test(text),
    explicit_size: CAPITAL_EVENT_KEYWORDS.sizeLanguage.test(text) || args.item.fundSize != null || args.item.targetSizeUsd != null || args.item.finalSizeUsd != null,
    sequence_detected: inferSequenceNumber(args.item),
    vintage_year: args.item.vintageYear ?? null,
    exact_firm_match: Boolean(args.firm && args.firmMatchConfidence >= 0.9),
    firm_match_confidence: Number(args.firmMatchConfidence.toFixed(4)),
    corroboration_count: args.corroborationCount ?? 1,
    corroboration_score: args.corroborationScore ?? 0,
    conflict_penalty: args.conflictPenalty ?? 0,
    independent_source_count: args.independentSourceCount ?? 1,
    negative_portfolio_financing: CAPITAL_EVENT_KEYWORDS.negativePortfolio.test(text),
    negative_hiring: CAPITAL_EVENT_KEYWORDS.negativeHiring.test(text),
    negative_product: CAPITAL_EVENT_KEYWORDS.negativeProduct.test(text),
    negative_commentary: CAPITAL_EVENT_KEYWORDS.negativeCommentary.test(text),
  };
}

export function statusFromCandidateScore(score: number): CandidateCapitalEventStatus {
  if (score < CAPITAL_EVENT_THRESHOLDS.ignore) return "ignored";
  if (score < CAPITAL_EVENT_THRESHOLDS.review) return "pending";
  if (score < CAPITAL_EVENT_THRESHOLDS.escalate) return "review";
  if (score < CAPITAL_EVENT_THRESHOLDS.autoVerify) return "escalated";
  return "verified";
}

export function toCandidateDraft(args: {
  item: ExtractedFundAnnouncement;
  firm: FirmRecordLookup | null;
  firmMatchConfidence: number;
  corroborationCount?: number;
  officialSourcePresent?: boolean;
  corroborationScore?: number;
  conflictPenalty?: number;
  independentSourceCount?: number;
}): CandidateCapitalEventDraft {
  const score = scoreCandidateCapitalEvent(args);
  const eventTypeGuess = guessCandidateEventType(args.item);
  const label = normalizedFundLabel(args.item) || null;
  const normalizedAnnouncedDate = normalizeAnnouncementDate(args.item.announcedDate);
  const normalizedCloseDate = normalizeAnnouncementDate(args.item.closeDate);
  const effectiveDate = normalizedAnnouncedDate || normalizedCloseDate;
  return {
    firmRecordId: args.firm?.id ?? null,
    rawFirmName: args.item.firmName,
    normalizedFirmName: normalizeFirmName(args.item.firmName),
    candidateHeadline: args.item.sourceTitle || args.item.fundName || "Untitled capital event",
    excerpt: args.item.rawText?.slice(0, 800) || null,
    sourceUrl: args.item.sourceUrl,
    sourceType: args.item.sourceType,
    publisher: args.item.sourcePublisher || null,
    publishedAt: effectiveDate,
    rawText: args.item.rawText || null,
    eventTypeGuess,
    normalizedFundLabel: label,
    fundSequenceNumber: inferSequenceNumber(args.item),
    vintageYear: args.item.vintageYear ?? null,
    announcedDate: effectiveDate,
    sizeAmount: args.item.finalSizeUsd ?? args.item.targetSizeUsd ?? args.item.fundSize ?? null,
    sizeCurrency: args.item.currency || "USD",
    confidenceScore: score,
    confidenceBreakdown: explainCandidateScore(args),
    evidenceCount: args.corroborationCount ?? 1,
    sourceDiversity: 1,
    officialSourcePresent: args.officialSourcePresent || args.item.sourceType === "official_website",
    clusterKey: computeCandidateClusterKey(args.item, args.firm?.id ?? null),
    canonicalVcFundId: null,
    status: statusFromCandidateScore(score),
    reviewReason: null,
    metadata: args.item.metadata || {},
  };
}

export function computeCorroborationScore(items: ExtractedFundAnnouncement[]): number {
  if (items.length <= 1) return 0;

  const independentSources = new Set(items.map((item) => `${item.sourceType}:${item.sourcePublisher || "unknown"}`));
  const labels = Array.from(new Set(items.map((item) => normalizedFundLabel(item)).filter(Boolean)));
  const sequences = Array.from(new Set(items.map((item) => inferSequenceNumber(item)).filter((value) => value != null)));
  const sizes = items.map((item) => item.finalSizeUsd ?? item.targetSizeUsd ?? item.fundSize).filter((value): value is number => typeof value === "number");
  const dates = items.map((item) => item.closeDate || item.announcedDate).filter((value): value is string => Boolean(value));

  let score = 0;
  if (independentSources.size > 1) score += 0.25;
  if (labels.length <= 1 && labels.length > 0) score += 0.25;
  if (sequences.length <= 1 && sequences.length > 0) score += 0.2;
  if (sizes.length >= 2) {
    const spread = Math.max(...sizes) - Math.min(...sizes);
    const denominator = Math.max(...sizes, 1);
    if (spread / denominator <= CAPITAL_EVENT_THRESHOLDS.conflictingFundSizeTolerancePct) score += 0.15;
  }
  if (dates.length >= 2) {
    const earliest = dates.reduce((best, value) => value < best ? value : best, dates[0]);
    const latest = dates.reduce((best, value) => value > best ? value : best, dates[0]);
    if (dateDiffDays(earliest, latest) <= CAPITAL_EVENT_THRESHOLDS.conflictingDateToleranceDays) score += 0.15;
  }

  return clamp(score);
}

export function computeConflictPenalty(items: ExtractedFundAnnouncement[]): number {
  if (items.length <= 1) return 0;

  let penalty = 0;
  const sequences = Array.from(new Set(items.map((item) => inferSequenceNumber(item)).filter((value) => value != null)));
  const labels = Array.from(new Set(items.map((item) => normalizedFundLabel(item)).filter(Boolean)));
  const sizes = items.map((item) => item.finalSizeUsd ?? item.targetSizeUsd ?? item.fundSize).filter((value): value is number => typeof value === "number");
  const dates = items.map((item) => item.closeDate || item.announcedDate).filter((value): value is string => Boolean(value));

  if (sequences.length > 1) penalty += 0.4;
  if (labels.length > 1) penalty += 0.2;
  if (sizes.length >= 2) {
    const max = Math.max(...sizes);
    const min = Math.min(...sizes);
    if (percentDifference(max, min) > CAPITAL_EVENT_THRESHOLDS.conflictingFundSizeTolerancePct) penalty += 0.25;
  }
  if (dates.length >= 2) {
    const earliest = dates.reduce((best, value) => value < best ? value : best, dates[0]);
    const latest = dates.reduce((best, value) => value > best ? value : best, dates[0]);
    if (dateDiffDays(earliest, latest) > CAPITAL_EVENT_THRESHOLDS.conflictingDateToleranceDays) penalty += 0.25;
  }

  return clamp(penalty);
}

export function buildEvidenceRow(item: ExtractedFundAnnouncement, score: number): CandidateCapitalEventEvidence {
  const normalizedPublishedAt = normalizeAnnouncementDate(item.announcedDate) || normalizeAnnouncementDate(item.closeDate);
  return {
    sourceUrl: item.sourceUrl,
    sourceType: item.sourceType,
    publisher: item.sourcePublisher || null,
    publishedAt: normalizedPublishedAt,
    headline: item.sourceTitle || item.fundName || "Untitled capital event",
    excerpt: item.rawText?.slice(0, 800) || null,
    rawText: item.rawText || null,
    rawPayload: {
      external_id: item.externalId || contentHash([item.sourceUrl, item.sourceTitle, item.firmName]),
      firm_name: item.firmName,
      firm_website_url: item.firmWebsiteUrl || null,
      fund_name: item.fundName || null,
      fund_label: item.fundLabel || null,
      fund_type: item.fundType || null,
      fund_size: item.fundSize ?? null,
      target_size_usd: item.targetSizeUsd ?? null,
      final_size_usd: item.finalSizeUsd ?? null,
      currency: item.currency || "USD",
      vintage_year: item.vintageYear ?? null,
      announced_date: normalizeAnnouncementDate(item.announcedDate),
      close_date: normalizeAnnouncementDate(item.closeDate),
      partners: item.partners || [],
      metadata: item.metadata || {},
    },
    score,
  };
}

export function computeFreshCapitalPriorityScore(args: {
  recencyDays: number | null;
  representativeSizeUsd: number | null;
  confidenceScore: number;
  officialSourcePresent: boolean;
}): number {
  const recencyWeight = args.recencyDays == null ? 0.15 : Math.max(0, (365 - Math.min(args.recencyDays, 365)) / 365) * 0.45;
  const sizeWeight = Math.min((args.representativeSizeUsd || 0) / 500000000, 1) * 0.25;
  const confidenceWeight = Math.max(0, Math.min(args.confidenceScore, 1)) * 0.2;
  const officialWeight = args.officialSourcePresent ? 0.1 : 0;
  return clamp(recencyWeight + sizeWeight + confidenceWeight + officialWeight);
}
