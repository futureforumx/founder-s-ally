import type { NormalizedOrganization, NormalizedPerson, NormalizedRole } from "@founder-intel/types";
import type { PrismaClient, Prisma } from "@founder-intel/database";
import { OrgMatcher, RESOLVER_VERSION } from "./org-matcher";
import { PersonMatcher } from "./person-matcher";

// ─── Matching service — orchestrates org + person deduplication ───────────────

export interface UpsertResult {
  organizationId: string;
  personIds: string[];
  matchDecisionIds: string[];
  isNew: boolean;
}

export class MatchingService {
  private readonly orgMatcher: OrgMatcher;
  private readonly personMatcher: PersonMatcher;

  constructor(private readonly prisma: PrismaClient) {
    this.orgMatcher = new OrgMatcher(prisma);
    this.personMatcher = new PersonMatcher(prisma);
  }

  // ─── Upsert canonical Organization ────────────────────────────────────────

  async upsertOrganization(
    org: NormalizedOrganization
  ): Promise<{ orgId: string; decisionId: string; isNew: boolean }> {
    const match = await this.orgMatcher.findMatch(org);

    // Log the match decision first
    const decision = await this.prisma.matchDecision.create({
      data: {
        entityType: "organization",
        candidateIds: match.candidateIds,
        selectedId: match.organizationId ?? undefined,
        matchRuleUsed: match.matchRuleUsed,
        confidenceScore: match.confidenceScore,
        decisionType: match.decisionType,
        resolverVersion: RESOLVER_VERSION,
        metadata: match.metadata as Prisma.InputJsonValue,
        organizationId: match.organizationId ?? undefined,
      },
    });

    if (match.organizationId) {
      // ── Update existing org — prefer YC data for YC-specific fields ────────
      const updated = await this.prisma.organization.update({
        where: { id: match.organizationId },
        data: {
          // Only fill blank fields; YC data wins unconditionally on YC-specific fields
          ...(org.website && { website: org.website }),
          ...(org.description && { description: org.description }),
          ...(org.logoUrl && { logoUrl: org.logoUrl }),
          ...(org.industry && { industry: org.industry }),
          ...(org.location && { location: org.location }),
          ...(org.foundedYear && { foundedYear: org.foundedYear }),
          ...(org.employeeCount && { employeeCount: org.employeeCount }),
          ...(org.status && { status: org.status }),
          ...(org.tags?.length && { tags: org.tags }),
          // YC fields always win
          ...(org.isYcBacked && { isYcBacked: true }),
          ...(org.ycBatch && { ycBatch: org.ycBatch }),
          ...(org.ycId && { ycId: org.ycId }),
          ...(org.ycRawJson && { ycRawJson: org.ycRawJson as Prisma.InputJsonValue }),
          updatedAt: new Date(),
        },
      });

      // Update decision with confirmed org ID
      await this.prisma.matchDecision.update({
        where: { id: decision.id },
        data: { organizationId: updated.id, selectedId: updated.id },
      });

      return { orgId: updated.id, decisionId: decision.id, isNew: false };
    }

    // ── Create new org ────────────────────────────────────────────────────────
    const created = await this.prisma.organization.create({
      data: {
        canonicalName: org.canonicalName,
        dedupeKey: org.dedupeKey,
        domain: org.domain,
        website: org.website,
        linkedinUrl: org.linkedinUrl,
        description: org.description,
        logoUrl: org.logoUrl,
        industry: org.industry,
        location: org.location,
        city: org.city,
        state: org.state,
        country: org.country,
        foundedYear: org.foundedYear,
        employeeCount: org.employeeCount,
        status: org.status,
        stageProxy: org.stageProxy,
        tags: org.tags ?? [],
        isYcBacked: org.isYcBacked ?? false,
        ycBatch: org.ycBatch,
        ycId: org.ycId,
        ycRawJson: org.ycRawJson as Prisma.InputJsonValue | undefined,
      },
    });

    await this.prisma.matchDecision.update({
      where: { id: decision.id },
      data: { organizationId: created.id, selectedId: created.id },
    });

    return { orgId: created.id, decisionId: decision.id, isNew: true };
  }

  // ─── Upsert canonical Person ───────────────────────────────────────────────

  async upsertPerson(
    person: NormalizedPerson,
    orgDomain?: string
  ): Promise<{ personId: string; decisionId: string; isNew: boolean }> {
    const match = await this.personMatcher.findMatch(person, orgDomain);

    const decision = await this.prisma.matchDecision.create({
      data: {
        entityType: "person",
        candidateIds: match.candidateIds,
        selectedId: match.personId ?? undefined,
        matchRuleUsed: match.matchRuleUsed,
        confidenceScore: match.confidenceScore,
        decisionType: match.decisionType,
        resolverVersion: RESOLVER_VERSION,
        metadata: match.metadata as Prisma.InputJsonValue,
        personId: match.personId ?? undefined,
      },
    });

    if (match.personId) {
      const updated = await this.prisma.person.update({
        where: { id: match.personId },
        data: {
          ...(person.linkedinUrl && { linkedinUrl: person.linkedinUrl }),
          ...(person.avatarUrl && { avatarUrl: person.avatarUrl }),
          ...(person.bio && { bio: person.bio }),
          ...(person.location && { location: person.location }),
          ...(person.city && { city: person.city }),
          ...(person.expertise?.length && { expertise: person.expertise }),
          ...(person.ycId && { ycId: person.ycId }),
          updatedAt: new Date(),
        },
      });

      await this.prisma.matchDecision.update({
        where: { id: decision.id },
        data: { personId: updated.id, selectedId: updated.id },
      });

      return { personId: updated.id, decisionId: decision.id, isNew: false };
    }

    const created = await this.prisma.person.create({
      data: {
        canonicalName: person.canonicalName,
        dedupeKey: person.dedupeKey,
        firstName: person.firstName,
        lastName: person.lastName,
        email: person.email,
        linkedinUrl: person.linkedinUrl,
        twitterUrl: person.twitterUrl,
        githubUrl: person.githubUrl,
        avatarUrl: person.avatarUrl,
        bio: person.bio,
        location: person.location,
        city: person.city,
        country: person.country,
        expertise: person.expertise ?? [],
        ycId: person.ycId,
      },
    });

    await this.prisma.matchDecision.update({
      where: { id: decision.id },
      data: { personId: created.id, selectedId: created.id },
    });

    return { personId: created.id, decisionId: decision.id, isNew: true };
  }

  // ─── Upsert Role ────────────────────────────────────────────────────────────

  async upsertRole(
    role: NormalizedRole,
    personId: string,
    organizationId: string
  ): Promise<void> {
    await this.prisma.role.upsert({
      where: {
        personId_organizationId_roleType: {
          personId,
          organizationId,
          roleType: role.roleType ?? "founder",
        },
      },
      create: {
        personId,
        organizationId,
        title: role.title,
        roleType: role.roleType,
        functionType: role.functionType,
        isCurrent: role.isCurrent ?? true,
        startDate: role.startDate,
        endDate: role.endDate,
      },
      update: {
        title: role.title ?? undefined,
        functionType: role.functionType ?? undefined,
        isCurrent: role.isCurrent ?? true,
        updatedAt: new Date(),
      },
    });
  }
}
