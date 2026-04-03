import { Job } from "bullmq";
import type { PrismaClient, Prisma } from "@founder-intel/database";
import { buildAdapterRegistry } from "@founder-intel/adapters";
import { MatchingService } from "@founder-intel/matching";
import type { IngestionJobData } from "../queues";
import type { NormalizedOrganization, NormalizedPerson } from "@founder-intel/types";

// ─── Ingestion processor ──────────────────────────────────────────────────────
// Orchestrates the full pipeline:
// fetch → normalize → match → upsert canonical → store raw → attach provenance

export async function processIngestionJob(
  job: Job<IngestionJobData>,
  prisma: PrismaClient
): Promise<void> {
  const { source, jobDbId, options } = job.data;
  const startedAt = new Date();

  console.log(`[ingestion-processor] Starting job ${jobDbId} for source: ${source}`);

  // Update DB job to running
  await prisma.ingestionJob.update({
    where: { id: jobDbId },
    data: { status: "running", startedAt },
  });

  const stats = {
    fetched: 0,
    normalized: 0,
    orgsUpserted: 0,
    peopleUpserted: 0,
    rolesUpserted: 0,
    matchDecisions: 0,
    errors: 0,
    durationMs: 0,
  };

  try {
    const registry = buildAdapterRegistry();
    const adapter = registry.get(source);

    if (!adapter) {
      throw new Error(`Unknown source adapter: ${source}`);
    }

    if (!adapter.enabled) {
      throw new Error(`Adapter ${source} is disabled`);
    }

    // ── 1. Fetch + normalize ─────────────────────────────────────────────────
    const result = await adapter.run({ maxPages: options?.maxPages });
    stats.fetched = result.sourceRecords.length;
    stats.normalized = result.organizations.length + result.people.length;

    await job.updateProgress(20);

    if (options?.dryRun) {
      console.log(`[ingestion-processor] Dry run — skipping upsert`);
      await completedJob(prisma, jobDbId, stats, startedAt);
      return;
    }

    // ── 2. Match + upsert organizations ─────────────────────────────────────
    const matchingSvc = new MatchingService(prisma);
    const orgDedupeKeyToId = new Map<string, string>();

    for (const org of result.organizations) {
      try {
        const { orgId, isNew } = await matchingSvc.upsertOrganization(org);
        orgDedupeKeyToId.set(org.dedupeKey, orgId);
        stats.matchDecisions++;
        if (isNew) stats.orgsUpserted++;

        // Upsert YcCompany record if this is the companies source
        // (yc-people returns no orgs, so this branch is never hit for that source)
        if (org.isYcBacked && org.ycId && source === "yc-companies") {
          await upsertYcCompany(prisma, org, orgId);
        }
      } catch (err) {
        console.error(`[ingestion-processor] Org upsert failed for ${org.canonicalName}:`, err);
        stats.errors++;
      }
    }

    await job.updateProgress(50);

    // ── 3. Match + upsert people ─────────────────────────────────────────────
    const personDedupeKeyToId = new Map<string, string>();

    for (const person of result.people) {
      try {
        // Find the org domain for this person to aid matching
        const orgDomain = findOrgDomainForPerson(
          person.dedupeKey,
          result.roles,
          result.organizations,
          orgDedupeKeyToId
        );

        const { personId, isNew } = await matchingSvc.upsertPerson(person, orgDomain);
        personDedupeKeyToId.set(person.dedupeKey, personId);
        stats.matchDecisions++;
        if (isNew) stats.peopleUpserted++;

        // Upsert YcPerson record for both YC sources
        const isYcSource = source === "yc-companies" || source === "yc-people";
        if (person.ycId && isYcSource) {
          await upsertYcPerson(prisma, person, personId, orgDedupeKeyToId, result.roles);
        }
      } catch (err) {
        console.error(`[ingestion-processor] Person upsert failed for ${person.canonicalName}:`, err);
        stats.errors++;
      }
    }

    await job.updateProgress(70);

    // ── 4. Upsert roles ───────────────────────────────────────────────────────
    for (const role of result.roles) {
      try {
        const personId = personDedupeKeyToId.get(role.personDedupeKey);
        const orgId = orgDedupeKeyToId.get(role.orgDedupeKey);
        if (personId && orgId) {
          await matchingSvc.upsertRole(role, personId, orgId);
          stats.rolesUpserted++;
        }
      } catch (err) {
        console.error(`[ingestion-processor] Role upsert failed:`, err);
        stats.errors++;
      }
    }

    await job.updateProgress(85);

    // ── 5. Store source records ───────────────────────────────────────────────
    // Resolve entity FKs from dedupeKey maps so SourceRecord.organizationId /
    // personId are always populated, enabling the provenance join to work.
    // After each upsert, push the SourceRecord ID into the canonical entity's
    // sourceIds[] array for direct provenance lookup.

    for (const record of result.sourceRecords) {
      try {
        const orgId =
          record.entityType === "organization" && record.entityDedupeKey
            ? orgDedupeKeyToId.get(record.entityDedupeKey)
            : undefined;

        const personId =
          record.entityType === "person" && record.entityDedupeKey
            ? personDedupeKeyToId.get(record.entityDedupeKey)
            : undefined;

        const upserted = await prisma.sourceRecord.upsert({
          where: {
            sourceAdapter_sourceId: {
              sourceAdapter: record.sourceAdapter,
              sourceId: record.sourceId ?? record.sourceUrl,
            },
          },
          create: {
            sourceAdapter: record.sourceAdapter,
            sourceUrl: record.sourceUrl,
            sourceId: record.sourceId ?? record.sourceUrl,
            rawPayload: record.rawPayload as Prisma.InputJsonValue,
            entityType: record.entityType,
            normalizedAt: new Date(),
            organizationId: orgId ?? undefined,
            personId: personId ?? undefined,
          },
          update: {
            rawPayload: record.rawPayload as Prisma.InputJsonValue,
            normalizedAt: new Date(),
            ...(orgId && { organizationId: orgId }),
            ...(personId && { personId: personId }),
          },
        });

        // Push SourceRecord.id into the canonical entity's sourceIds array
        // (Prisma array push — no-op if ID is already present via DB uniqueness)
        if (orgId) {
          await prisma.organization.update({
            where: { id: orgId },
            data: { sourceIds: { push: upserted.id } },
          });
        }
        if (personId) {
          await prisma.person.update({
            where: { id: personId },
            data: { sourceIds: { push: upserted.id } },
          });
        }
      } catch (err) {
        console.error(`[ingestion-processor] SourceRecord upsert failed:`, err);
        stats.errors++;
      }
    }

    await job.updateProgress(100);
    await completedJob(prisma, jobDbId, stats, startedAt);

    console.log(
      `[ingestion-processor] Job ${jobDbId} completed: ` +
        `${stats.orgsUpserted} new orgs, ${stats.peopleUpserted} new people, ` +
        `${stats.rolesUpserted} roles, ${stats.errors} errors`
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[ingestion-processor] Job ${jobDbId} failed:`, err);
    await prisma.ingestionJob.update({
      where: { id: jobDbId },
      data: {
        status: "failed",
        error: errorMsg,
        completedAt: new Date(),
        stats: stats as Prisma.InputJsonValue,
      },
    });
    throw err; // Re-throw so BullMQ can retry
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function completedJob(
  prisma: PrismaClient,
  jobDbId: string,
  stats: Record<string, number>,
  startedAt: Date
): Promise<void> {
  const completedAt = new Date();
  stats.durationMs = completedAt.getTime() - startedAt.getTime();
  await prisma.ingestionJob.update({
    where: { id: jobDbId },
    data: { status: "completed", completedAt, stats: stats as Prisma.InputJsonValue },
  });
}

async function upsertYcCompany(
  prisma: PrismaClient,
  org: NormalizedOrganization,
  organizationId: string
): Promise<void> {
  if (!org.ycId || !org.ycRawJson) return;
  const raw = org.ycRawJson as Record<string, unknown>;
  await prisma.ycCompany.upsert({
    where: { ycId: org.ycId },
    create: {
      ycId: org.ycId,
      slug: (raw["slug"] as string) ?? org.ycId,
      name: org.canonicalName,
      batch: org.ycBatch ?? "unknown",
      status: org.status ?? undefined,
      website: org.website,
      description: (raw["oneLiner"] as string) ?? org.description,
      longDescription: raw["longDescription"] as string | undefined,
      teamSize: org.employeeCount,
      allLocations: org.location,
      industries: (raw["industries"] as string[]) ?? [],
      subverticals: (raw["subverticals"] as string[]) ?? [],
      tags: org.tags ?? [],
      badges: {
        isHiring: raw["isHiring"],
        nonprofit: raw["nonprofit"],
        topCompany: raw["topCompany"],
      } as Prisma.InputJsonValue,
      foundersRaw: raw["founders"] as Prisma.InputJsonValue | undefined,
      rawJson: org.ycRawJson as Prisma.InputJsonValue,
      organizationId,
    },
    update: {
      name: org.canonicalName,
      status: org.status ?? undefined,
      website: org.website,
      teamSize: org.employeeCount,
      rawJson: org.ycRawJson as Prisma.InputJsonValue,
      updatedAt: new Date(),
    },
  });
}

async function upsertYcPerson(
  prisma: PrismaClient,
  person: NormalizedPerson,
  personId: string,
  orgDedupeKeyToId: Map<string, string>,
  roles: import("@founder-intel/types").NormalizedRole[]
): Promise<void> {
  if (!person.ycId) return;

  const personRole = roles.find((r) => r.personDedupeKey === person.dedupeKey);
  const ycCompanyOrgId = personRole
    ? orgDedupeKeyToId.get(personRole.orgDedupeKey)
    : undefined;

  let ycCompanyId: string | undefined;
  if (ycCompanyOrgId) {
    const ycCo = await prisma.ycCompany.findFirst({
      where: { organizationId: ycCompanyOrgId },
      select: { id: true },
    });
    ycCompanyId = ycCo?.id;
  }

  // Derive role title from the NormalizedRole for this person
  const personRoleTitle = personRole?.title ?? undefined;

  await prisma.ycPerson.upsert({
    where: { ycId: person.ycId },
    create: {
      ycId: person.ycId,
      name: person.canonicalName,
      role: personRoleTitle,
      linkedinUrl: person.linkedinUrl,
      twitterUrl: person.twitterUrl,
      avatarUrl: person.avatarUrl,
      bio: person.bio,
      ycCompanyId,
      personId,
    },
    update: {
      // Only update role if we have a value (never overwrite a known title with blank)
      ...(personRoleTitle && { role: personRoleTitle }),
      linkedinUrl: person.linkedinUrl ?? undefined,
      avatarUrl: person.avatarUrl ?? undefined,
      bio: person.bio ?? undefined,
      ycCompanyId,
      updatedAt: new Date(),
    },
  });
}

function findOrgDomainForPerson(
  personDedupeKey: string,
  roles: import("@founder-intel/types").NormalizedRole[],
  orgs: NormalizedOrganization[],
  orgDedupeKeyToId: Map<string, string>
): string | undefined {
  const role = roles.find((r) => r.personDedupeKey === personDedupeKey);
  if (!role) return undefined;
  const org = orgs.find((o) => o.dedupeKey === role.orgDedupeKey);
  return org?.domain;
}
