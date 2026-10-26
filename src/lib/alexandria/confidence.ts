import type { ConfidenceLabel, Fact, VerificationStatus } from "./types";
import { IDENTITY_HIGH, IDENTITY_MEDIUM } from "./identity";

/** Thresholds, exported so tests, reports and docs share one definition. */
export const CONFIDENCE_HIGH = 0.8;
export const CONFIDENCE_MEDIUM = 0.55;
/** Inferred facts can never reach "high": they are never auto-applied. */
export const INFERRED_CAP = 0.69;
/** Nested response shapes the Alexandria contract does not document stay below "high" until corroborated or trusted. */
export const UNDOCUMENTED_SHAPE_CAP = 0.79;
export const CORROBORATED_CEILING = 0.95;

const VERIFICATION_BASE: Record<VerificationStatus, number> = {
  first_party: 1,
  provider_verified: 0.95,
  provider_reported: 0.85,
  derived: 0.7,
};

/** How authoritative each source is for the facts we take from it. */
export const PROVIDER_AUTHORITY: Record<string, number> = {
  fireround: 0.97,
  fullenrich: 0.95,
  "people-data-labs": 0.95,
  datalegion: 0.93,
  apollo: 0.93,
  web: 1,
};

export function labelFor(score: number): ConfidenceLabel {
  if (score >= CONFIDENCE_HIGH) return "high";
  if (score >= CONFIDENCE_MEDIUM) return "medium";
  return "low";
}

export function identityMultiplier(identityScore: number): number {
  if (identityScore >= IDENTITY_HIGH) return 1;
  if (identityScore >= IDENTITY_MEDIUM) return 0.85;
  return 0;
}

export interface ScoreInput {
  fact: Pick<Fact, "provider" | "verification" | "kind" | "shapeDocumented" | "providerLikelihood">;
  identityScore: number;
  /** Distinct providers (including this one) that independently reported the same normalized value. */
  corroboratingProviders: number;
}

export function scoreFact(input: ScoreInput): { score: number; label: ConfidenceLabel } {
  const { fact } = input;
  const authority = PROVIDER_AUTHORITY[fact.provider] ?? 0.8;
  let score = VERIFICATION_BASE[fact.verification] * authority * identityMultiplier(input.identityScore);

  if (typeof fact.providerLikelihood === "number" && fact.providerLikelihood >= 0 && fact.providerLikelihood <= 1) {
    score *= Math.max(0.5, fact.providerLikelihood);
  }

  const corroborated = input.corroboratingProviders >= 2;
  if (corroborated) score = Math.min(CORROBORATED_CEILING, score + 0.1);

  if (!fact.shapeDocumented && !corroborated) score = Math.min(score, UNDOCUMENTED_SHAPE_CAP);
  if (fact.kind === "inferred") score = Math.min(score, INFERRED_CAP);

  const rounded = Math.round(score * 100) / 100;
  return { score: rounded, label: labelFor(rounded) };
}
