import { normalizedNameKey } from "./normalize";
import type { MatchCandidate, MatchResult, NormalizedMarketEntity } from "./types";

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aa = new Set(a.split(" ")); const bb = new Set(b.split(" "));
  const intersection = [...aa].filter((token) => bb.has(token)).length;
  const dice = (2 * intersection) / (aa.size + bb.size);
  const prefix = a.startsWith(b) || b.startsWith(a) ? Math.min(a.length, b.length) / Math.max(a.length, b.length) : 0;
  return Math.max(dice, prefix);
}

export function resolveEntity(entity: NormalizedMarketEntity, candidates: MatchCandidate[], thresholds = { auto: 0.97, review: 0.72 }): MatchResult {
  const sameType = candidates.filter((candidate) => candidate.entityType === entity.entityType);
  const providerId = sameType.find((candidate) => candidate.provider === entity.provider && candidate.sourceId === entity.sourceId);
  if (providerId) return { candidateId: providerId.id, confidence: 1, method: "provider_id", decision: "auto_match" };
  if (entity.domain) {
    const domain = sameType.find((candidate) => candidate.domain?.toLowerCase().replace(/^www\./, "") === entity.domain);
    if (domain) return { candidateId: domain.id, confidence: 0.99, method: "domain", decision: "auto_match" };
  }
  if (entity.linkedinUrl) {
    const linkedin = sameType.find((candidate) => candidate.linkedinUrl?.toLowerCase() === entity.linkedinUrl?.toLowerCase());
    if (linkedin) return { candidateId: linkedin.id, confidence: 0.99, method: "linkedin", decision: "auto_match" };
  }
  const name = normalizedNameKey(entity.name ?? "");
  const ranked = sameType.map((candidate) => {
    const score = similarity(name, normalizedNameKey(candidate.name));
    const locationMatch = Boolean(entity.countryCode && candidate.countryCode === entity.countryCode);
    return { candidate, score: score * (locationMatch ? 0.92 : 0.82) + (locationMatch ? 0.08 : 0) };
  }).sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (best && name && name === normalizedNameKey(best.candidate.name) && entity.countryCode && entity.countryCode === best.candidate.countryCode) {
    return { candidateId: best.candidate.id, confidence: Math.max(0.9, best.score), method: "name_location", decision: "manual_review" };
  }
  if (best && best.score >= thresholds.review) return { candidateId: best.candidate.id, confidence: best.score, method: "fuzzy_name_location", decision: "manual_review" };
  return { candidateId: null, confidence: best?.score ?? 0, method: "none", decision: "keep_separate" };
}
