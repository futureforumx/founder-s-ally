import type { NormalizedOrganization } from "@founder-intel/types";
import type { PrismaClient } from "@founder-intel/database";
import {
  normalizeDomain,
  normalizeLinkedinSlug,
  normalizeName,
  combinedSimilarity,
} from "./utils/normalizer";

// ─── Organization matching logic ──────────────────────────────────────────────
// Priority chain (stops at first confident match):
// 1. Exact domain match
// 2. Normalized domain match
// 3. Exact LinkedIn URL match
// 4. Name + country fuzzy match
// 5. Fuzzy name only (low confidence)

export const RESOLVER_VERSION = process.env.RESOLVER_VERSION ?? "1.0.0";
export const AUTO_THRESHOLD = parseFloat(process.env.MATCH_AUTO_THRESHOLD ?? "0.85");

export interface MatchResult {
  organizationId: string | null; // null → no match, create new
  matchRuleUsed: MatchRule;
  confidenceScore: number;
  decisionType: "AUTO" | "REVIEW";
  metadata: Record<string, unknown>;
  candidateIds: string[];
}

export type MatchRule =
  | "domain_exact"
  | "domain_normalized"
  | "linkedin_exact"
  | "name_fuzzy"
  | "name_only_fuzzy"
  | "no_match";

export class OrgMatcher {
  constructor(private readonly prisma: PrismaClient) {}

  async findMatch(org: NormalizedOrganization): Promise<MatchResult> {
    const domain = org.domain ? normalizeDomain(org.domain) : undefined;

    // ── 1. Exact domain match ────────────────────────────────────────────────
    if (domain) {
      const existing = await this.prisma.organization.findFirst({
        where: { domain },
        select: { id: true, domain: true, canonicalName: true },
      });
      if (existing) {
        return this.result(existing.id, "domain_exact", 1.0, "AUTO", {
          matchedDomain: domain,
          candidateId: existing.id,
        }, [existing.id]);
      }
    }

    // ── 2. Normalized domain match ───────────────────────────────────────────
    if (domain) {
      const candidates = await this.prisma.organization.findMany({
        where: { domain: { contains: domain.split(".")[0] } },
        select: { id: true, domain: true, canonicalName: true },
        take: 5,
      });
      for (const c of candidates) {
        if (c.domain && normalizeDomain(c.domain) === domain) {
          return this.result(c.id, "domain_normalized", 0.95, "AUTO", {
            inputDomain: domain,
            matchedDomain: c.domain,
          }, [c.id]);
        }
      }
    }

    // ── 3. LinkedIn URL exact match ──────────────────────────────────────────
    if (org.linkedinUrl) {
      const slug = normalizeLinkedinSlug(org.linkedinUrl);
      const candidates = await this.prisma.organization.findMany({
        where: { linkedinUrl: { not: null } },
        select: { id: true, linkedinUrl: true, canonicalName: true },
        take: 500,
      });
      const match = candidates.find(
        (c) => c.linkedinUrl && normalizeLinkedinSlug(c.linkedinUrl) === slug
      );
      if (match) {
        return this.result(match.id, "linkedin_exact", 0.95, "AUTO", {
          linkedinSlug: slug,
        }, [match.id]);
      }
    }

    // ── 4. Name + description fuzzy ──────────────────────────────────────────
    const normalizedInput = normalizeName(org.canonicalName);
    const nameCandidates = await this.prisma.organization.findMany({
      where: {
        canonicalName: {
          contains: normalizedInput.split(" ")[0],
          mode: "insensitive",
        },
      },
      select: { id: true, canonicalName: true, domain: true, country: true },
      take: 20,
    });

    const scored = nameCandidates
      .map((c) => ({
        ...c,
        score: combinedSimilarity(normalizeName(c.canonicalName), normalizedInput),
      }))
      .filter((c) => c.score > 0.6)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      const best = scored[0];
      const candidateIds = scored.map((c) => c.id);

      if (scored.length === 1 && best.score >= AUTO_THRESHOLD) {
        return this.result(best.id, "name_fuzzy", best.score, "AUTO", {
          inputName: normalizedInput,
          matchedName: best.canonicalName,
          score: best.score,
        }, candidateIds);
      }
      // Multiple candidates or below threshold → REVIEW
      return this.result(best.id, "name_fuzzy", best.score, "REVIEW", {
        inputName: normalizedInput,
        candidateCount: scored.length,
        topScore: best.score,
      }, candidateIds);
    }

    // ── 5. No match ──────────────────────────────────────────────────────────
    return this.result(null, "no_match", 0, "AUTO", {
      inputName: org.canonicalName,
      inputDomain: domain,
    }, []);
  }

  private result(
    organizationId: string | null,
    matchRuleUsed: MatchRule,
    confidenceScore: number,
    decisionType: "AUTO" | "REVIEW",
    metadata: Record<string, unknown>,
    candidateIds: string[]
  ): MatchResult {
    return {
      organizationId,
      matchRuleUsed,
      confidenceScore,
      decisionType,
      metadata,
      candidateIds,
    };
  }
}
