/**
 * Deduplication and merge logic for the funding-ingestion pipeline.
 *
 * Strategy:
 *  1. Primary key: dedupe_key = normalizedCompany::roundType::dateWindow
 *  2. Secondary checks: company_domain, amount_minor_units (within 20%)
 *  3. Merge policy: prefer higher-confidence source values; preserve all provenance
 *
 * Source priority (higher = preferred for field values):
 *   api (0.95+) > curated_feed (0.82) > news (0.88 TC, lower others) > rumor (≤0.6)
 */

import type {
  NormalizedDealCandidate,
  CanonicalDeal,
  SourceType,
} from "./types.ts";
import { buildDedupeKey } from "./normalize.ts";

// ── Source priority weights ───────────────────────────────────────────────────

const SOURCE_PRIORITY: Record<SourceType, number> = {
  api:           100,
  curated_feed:  70,
  news:          60,
  rumor:         20,
};

function sourcePriority(c: NormalizedDealCandidate): number {
  return SOURCE_PRIORITY[c.source_type] ?? 0 + c.confidence_score * 10;
}

// ── Amount similarity check ───────────────────────────────────────────────────

function amountsAreSimilar(
  a: number | null,
  b: number | null,
  threshold = 0.25
): boolean {
  if (a == null || b == null) return true; // can't rule out
  const max = Math.max(a, b);
  if (max === 0) return true;
  return Math.abs(a - b) / max <= threshold;
}

// ── Merge two normalized candidates into one canonical deal ──────────────────

/**
 * Merge an incoming candidate into an existing canonical deal.
 * The winning value for each field is from the higher-priority source.
 * All provenance is preserved.
 */
export function mergeIntoCanonical(
  existing: CanonicalDeal,
  incoming: NormalizedDealCandidate,
  existingPriority: number
): CanonicalDeal {
  const inPriority = sourcePriority(incoming);
  const pickBetter = <T>(
    existingVal: T,
    incomingVal: T,
    preferIncoming = inPriority > existingPriority
  ): T => {
    if (incomingVal == null || incomingVal === "") return existingVal;
    if (existingVal == null || existingVal === "") return incomingVal;
    return preferIncoming ? incomingVal : existingVal;
  };

  const merged: CanonicalDeal = {
    ...existing,
    // Company — prefer higher-priority source
    company_website:          pickBetter(existing.company_website,   incoming.company_website),
    company_domain:           pickBetter(existing.company_domain,    incoming.company_domain),
    company_location:         pickBetter(existing.company_location,  incoming.company_location),
    // Sector
    sector_raw:               pickBetter(existing.sector_raw,        incoming.sector_raw),
    sector_normalized:        pickBetter(existing.sector_normalized, incoming.sector_normalized),
    // Round
    round_type_raw:           pickBetter(existing.round_type_raw,    incoming.round_type_raw),
    round_type_normalized:    pickBetter(existing.round_type_normalized, incoming.round_type_normalized),
    // Amount — prefer non-null
    amount_raw:               pickBetter(existing.amount_raw,        incoming.amount_raw),
    amount_minor_units:       pickBetter(existing.amount_minor_units, incoming.amount_minor_units),
    // Date — prefer the earliest credible date
    announced_date:           pickEarliestDate(existing.announced_date, incoming.announced_date),
    // Investors
    lead_investor:            pickBetter(existing.lead_investor,         incoming.lead_investor),
    lead_investor_normalized: pickBetter(existing.lead_investor_normalized, incoming.lead_investor_normalized),
    co_investors:             mergeCoInvestors(existing.co_investors, incoming.co_investors),
    // Summary / provenance — prefer higher-priority source
    extracted_summary:        pickBetter(existing.extracted_summary, incoming.extracted_summary),
    // Keep primary source from highest-confidence source
    primary_source_name:      inPriority > existingPriority ? incoming.source_name : existing.primary_source_name,
    primary_source_url:       inPriority > existingPriority ? incoming.article_url : existing.primary_source_url,
    primary_press_url:        inPriority > existingPriority ? incoming.press_url   : existing.primary_press_url,
    // Confidence: max of existing and incoming (deal is confirmed by multiple sources)
    confidence_score:         Math.min(1.0, Math.max(existing.confidence_score, incoming.confidence_score) + 0.05),
    source_count:             existing.source_count + 1,
    // Rumor: only stays rumor if ALL contributing sources are rumors
    is_rumor:                 existing.is_rumor && incoming.is_rumor,
    source_type:              inPriority > existingPriority ? incoming.source_type : existing.source_type,
  };

  return merged;
}

function pickEarliestDate(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a <= b ? a : b;
}

function mergeCoInvestors(existing: string[], incoming: string[]): string[] {
  const set = new Set([...existing, ...incoming].map((n) => n.trim().toLowerCase()));
  return Array.from(set).filter(Boolean);
}

// ── Build canonical from first candidate ────────────────────────────────────

export function candidateToCanonical(
  c: NormalizedDealCandidate
): CanonicalDeal {
  return {
    company_name:             c.company_name,
    normalized_company_name:  c.normalized_company_name,
    company_domain:           c.company_domain,
    company_website:          c.company_website,
    company_linkedin_url:     null,
    company_location:         c.company_location,
    sector_raw:               c.sector_raw,
    sector_normalized:        c.sector_normalized,
    round_type_raw:           c.round_type_raw,
    round_type_normalized:    c.round_type_normalized,
    amount_raw:               c.amount_raw,
    amount_minor_units:       c.amount_minor_units,
    currency:                 c.currency,
    announced_date:           c.announced_date,
    lead_investor:            c.lead_investor,
    lead_investor_normalized: c.lead_investor_normalized,
    co_investors:             c.co_investors,
    primary_source_name:      c.source_name,
    primary_source_url:       c.article_url,
    primary_press_url:        c.press_url,
    source_type:              c.source_type,
    is_rumor:                 c.is_rumor,
    confidence_score:         c.confidence_score,
    source_count:             1,
    extracted_summary:        c.extracted_summary,
    extraction_method:        c.extraction_method,
    dedupe_key:               c.dedupe_key,
  };
}

// ── Check whether candidate matches existing canonical ──────────────────────

export interface MatchResult {
  isMatch: boolean;
  score: number;
  reasons: string[];
}

export function scoreDedupeMatch(
  existing: CanonicalDeal,
  candidate: NormalizedDealCandidate
): MatchResult {
  const reasons: string[] = [];
  let score = 0;

  // Strong: dedupe key match
  if (existing.dedupe_key === candidate.dedupe_key) {
    score += 100;
    reasons.push("dedupe_key");
  }

  // Strong: company domain match
  if (
    existing.company_domain &&
    candidate.company_domain &&
    existing.company_domain === candidate.company_domain
  ) {
    score += 60;
    reasons.push("company_domain");
  }

  // Moderate: normalized company name match
  if (
    existing.normalized_company_name &&
    candidate.normalized_company_name &&
    existing.normalized_company_name === candidate.normalized_company_name
  ) {
    score += 40;
    reasons.push("normalized_name");
  }

  // Amount similarity (if both known)
  if (amountsAreSimilar(existing.amount_minor_units, candidate.amount_minor_units)) {
    score += 10;
    reasons.push("amount_similar");
  }

  // Round type match
  if (
    existing.round_type_normalized &&
    candidate.round_type_normalized &&
    existing.round_type_normalized === candidate.round_type_normalized &&
    existing.round_type_normalized !== "unknown"
  ) {
    score += 15;
    reasons.push("round_type");
  }

  // Overlapping source URLs
  if (
    existing.primary_source_url &&
    candidate.article_url &&
    existing.primary_source_url === candidate.article_url
  ) {
    score += 80;
    reasons.push("same_article_url");
  }

  // Penalty: different round types (strong signal of different deal)
  if (
    existing.round_type_normalized !== "unknown" &&
    candidate.round_type_normalized !== "unknown" &&
    existing.round_type_normalized !== candidate.round_type_normalized
  ) {
    score -= 40;
    reasons.push("round_mismatch_penalty");
  }

  return { isMatch: score >= 60, score, reasons };
}
