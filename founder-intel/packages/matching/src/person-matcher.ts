import type { NormalizedPerson } from "@founder-intel/types";
import type { PrismaClient } from "@founder-intel/database";
import {
  normalizeLinkedinSlug,
  normalizeName,
  combinedSimilarity,
} from "./utils/normalizer";
import { AUTO_THRESHOLD } from "./org-matcher";

// ─── Person matching logic ────────────────────────────────────────────────────
// Priority chain:
// 1. Exact LinkedIn URL match
// 2. Name + org domain fuzzy
// 3. Fuzzy name + location
// 4. No match

export type PersonMatchRule =
  | "linkedin_exact"
  | "name_org_fuzzy"
  | "name_location_fuzzy"
  | "no_match";

export interface PersonMatchResult {
  personId: string | null;
  matchRuleUsed: PersonMatchRule;
  confidenceScore: number;
  decisionType: "AUTO" | "REVIEW";
  metadata: Record<string, unknown>;
  candidateIds: string[];
}

export class PersonMatcher {
  constructor(private readonly prisma: PrismaClient) {}

  async findMatch(
    person: NormalizedPerson,
    orgDomain?: string
  ): Promise<PersonMatchResult> {
    // ── 1. LinkedIn exact match ──────────────────────────────────────────────
    if (person.linkedinUrl) {
      const slug = normalizeLinkedinSlug(person.linkedinUrl);
      const candidates = await this.prisma.person.findMany({
        where: { linkedinUrl: { not: null } },
        select: { id: true, linkedinUrl: true, canonicalName: true },
        take: 1000,
      });
      const match = candidates.find(
        (c) => c.linkedinUrl && normalizeLinkedinSlug(c.linkedinUrl) === slug
      );
      if (match) {
        return {
          personId: match.id,
          matchRuleUsed: "linkedin_exact",
          confidenceScore: 1.0,
          decisionType: "AUTO",
          metadata: { linkedinSlug: slug },
          candidateIds: [match.id],
        };
      }
    }

    // ── 2. Name + org fuzzy match ────────────────────────────────────────────
    const normalizedName = normalizeName(person.canonicalName);
    const namePart = normalizedName.split(" ")[0];

    const nameCandidates = await this.prisma.person.findMany({
      where: {
        canonicalName: { contains: namePart, mode: "insensitive" },
      },
      select: {
        id: true,
        canonicalName: true,
        city: true,
        country: true,
        roles: {
          select: { organization: { select: { domain: true } } },
          take: 3,
        },
      },
      take: 30,
    });

    if (nameCandidates.length > 0) {
      type ScoredCandidate = typeof nameCandidates[0] & { score: number };
      const scored: ScoredCandidate[] = nameCandidates
        .map((c) => {
          let score = combinedSimilarity(
            normalizeName(c.canonicalName),
            normalizedName
          );

          // Boost if they share an org domain
          if (orgDomain) {
            const orgDomains = c.roles.flatMap(
              (r: { organization: { domain: string | null } | null }) => (r.organization?.domain ? [r.organization.domain] : [])
            );
            if (orgDomains.includes(orgDomain)) score = Math.min(1, score + 0.2);
          }

          // Boost if location matches
          if (
            person.city &&
            c.city &&
            c.city.toLowerCase().includes(person.city.toLowerCase())
          ) {
            score = Math.min(1, score + 0.1);
          }

          return { ...c, score };
        })
        .filter((c) => c.score > 0.65)
        .sort((a, b) => b.score - a.score);

      if (scored.length > 0) {
        const best = scored[0];
        const candidateIds = scored.map((c) => c.id);
        const rule = orgDomain ? "name_org_fuzzy" : "name_location_fuzzy";

        if (scored.length === 1 && best.score >= AUTO_THRESHOLD) {
          return {
            personId: best.id,
            matchRuleUsed: rule,
            confidenceScore: best.score,
            decisionType: "AUTO",
            metadata: { inputName: normalizedName, score: best.score },
            candidateIds,
          };
        }
        return {
          personId: best.id,
          matchRuleUsed: rule,
          confidenceScore: best.score,
          decisionType: "REVIEW",
          metadata: {
            inputName: normalizedName,
            candidateCount: scored.length,
            topScore: best.score,
          },
          candidateIds,
        };
      }
    }

    // ── 3. No match ──────────────────────────────────────────────────────────
    return {
      personId: null,
      matchRuleUsed: "no_match",
      confidenceScore: 0,
      decisionType: "AUTO",
      metadata: { inputName: person.canonicalName },
      candidateIds: [],
    };
  }
}
