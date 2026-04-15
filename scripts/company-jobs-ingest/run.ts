/**
 * Company job ingestion — detect careers/ATS from org website, fetch structured listings,
 * upsert into `company_jobs`, and mark disappeared rows inactive.
 *
 * @see scripts/company-jobs-ingest/README.md
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { detectSources } from "./detect.js";
import { ingestJobsForOrg } from "./ingest.js";
import { stableDedupeKey } from "./merge.js";

const prisma = new PrismaClient();

function log(msg: string) {
  // eslint-disable-next-line no-console
  console.log(`[company-jobs-ingest] ${new Date().toISOString()} ${msg}`);
}

function envInt(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

const DRY = process.env.COMPANY_JOBS_DRY_RUN === "1";
const SINGLE_ORG = process.env.COMPANY_JOBS_ORG_ID?.trim() || null;
const LIMIT = envInt("COMPANY_JOBS_LIMIT", SINGLE_ORG ? 1 : 40);
const INCLUDE_NOT_LIVE = process.env.COMPANY_JOBS_INCLUDE_NOT_LIVE === "1";

type OrgRow = { id: string; website: string | null };

async function loadOrgs(): Promise<OrgRow[]> {
  if (SINGLE_ORG) {
    const rows = await prisma.$queryRaw<OrgRow[]>`
      SELECT id::text AS id, website::text AS website
      FROM organizations
      WHERE id = ${SINGLE_ORG}::uuid
      LIMIT 1
    `;
    return rows;
  }
  if (INCLUDE_NOT_LIVE) {
    return prisma.$queryRaw<OrgRow[]>`
      SELECT id::text AS id, website::text AS website
      FROM organizations
      WHERE website IS NOT NULL AND length(trim(website)) > 3
      ORDER BY id DESC
      LIMIT ${LIMIT}
    `;
  }
  return prisma.$queryRaw<OrgRow[]>`
    SELECT id::text AS id, website::text AS website
    FROM organizations
    WHERE website IS NOT NULL AND length(trim(website)) > 3
      AND ready_for_live = true
    ORDER BY id DESC
    LIMIT ${LIMIT}
  `;
}

async function persistJobs(
  organizationId: string,
  jobs: Awaited<ReturnType<typeof ingestJobsForOrg>>["jobs"],
): Promise<{ upserted: number; deactivated: number }> {
  if (DRY) return { upserted: jobs.length, deactivated: 0 };

  const dedupeKeys = jobs.map((j) => stableDedupeKey(organizationId, j.mergeKey));
  const uniqueKeys = [...new Set(dedupeKeys)];

  const now = new Date();
  let upserted = 0;

  const chunkSize = 40;
  for (let i = 0; i < jobs.length; i += chunkSize) {
    const slice = jobs.slice(i, i + chunkSize);
    await prisma.$transaction(
      slice.map((j) => {
        const dedupeKey = stableDedupeKey(organizationId, j.mergeKey);
        return prisma.companyJob.upsert({
          where: {
            organizationId_dedupeKey: { organizationId, dedupeKey },
          },
          create: {
            organizationId,
            dedupeKey,
            sourceType: j.sourceType,
            sourceUrl: j.sourceUrl,
            externalJobId: j.externalJobId,
            title: j.title,
            department: j.department,
            team: j.team,
            location: j.location,
            locationType: j.locationType,
            employmentType: j.employmentType,
            postedAt: j.postedAt,
            applyUrl: j.applyUrl,
            descriptionSnippet: j.descriptionSnippet,
            descriptionRaw: j.descriptionRaw,
            compensationText: j.compensationText,
            compensationMin:
              j.compensationMin != null ? new Prisma.Decimal(j.compensationMin) : null,
            compensationMax:
              j.compensationMax != null ? new Prisma.Decimal(j.compensationMax) : null,
            compensationCurrency: j.compensationCurrency,
            isActive: true,
            firstSeenAt: now,
            lastSeenAt: now,
            rawJson:
              j.rawJson === undefined || j.rawJson === null
                ? Prisma.JsonNull
                : (j.rawJson as Prisma.InputJsonValue),
          },
          update: {
            sourceType: j.sourceType,
            sourceUrl: j.sourceUrl,
            externalJobId: j.externalJobId,
            title: j.title,
            department: j.department,
            team: j.team,
            location: j.location,
            locationType: j.locationType,
            employmentType: j.employmentType,
            postedAt: j.postedAt,
            applyUrl: j.applyUrl,
            descriptionSnippet: j.descriptionSnippet,
            descriptionRaw: j.descriptionRaw,
            compensationText: j.compensationText,
            compensationMin:
              j.compensationMin != null ? new Prisma.Decimal(j.compensationMin) : null,
            compensationMax:
              j.compensationMax != null ? new Prisma.Decimal(j.compensationMax) : null,
            compensationCurrency: j.compensationCurrency,
            isActive: true,
            lastSeenAt: now,
            rawJson:
              j.rawJson === undefined || j.rawJson === null
                ? Prisma.JsonNull
                : (j.rawJson as Prisma.InputJsonValue),
          },
        });
      }),
    );
    upserted += slice.length;
  }

  const deactivated = await prisma.companyJob.updateMany({
    where: {
      organizationId,
      isActive: true,
      dedupeKey: { notIn: uniqueKeys },
    },
    data: { isActive: false, lastSeenAt: now },
  });

  return { upserted, deactivated: deactivated.count };
}

async function processOrg(row: OrgRow): Promise<void> {
  const website = row.website?.trim() ?? "";
  if (!website) return;

  const runRow = !DRY
    ? await prisma.companyJobIngestionRun.create({
        data: {
          organizationId: row.id,
          status: "running",
        },
      })
    : null;

  try {
    const detection = await detectSources(website, log);
    const { jobs, errors } = await ingestJobsForOrg(website, detection, log);

    const { upserted, deactivated } = await persistJobs(row.id, jobs);

    log(`org=${row.id} upserted=${upserted} deactivated=${deactivated} (active_rows=${jobs.length})`);

    if (runRow) {
      await prisma.companyJobIngestionRun.update({
        where: { id: runRow.id },
        data: {
          status: "success",
          finishedAt: new Date(),
          jobsUpserted: upserted,
          jobsDeactivated: deactivated,
          sourceDetectionJson: {
            rootUrl: detection.rootUrl,
            careersPageUrl: detection.careersPageUrl,
            atsHints: detection.atsHints,
            probeErrors: detection.probeErrors,
            parserWarnings: errors,
          } as Prisma.InputJsonValue,
        },
      });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log(`org=${row.id} FAILED: ${msg}`);
    if (runRow) {
      await prisma.companyJobIngestionRun.update({
        where: { id: runRow.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          errorMessage: msg,
        },
      });
    }
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required");
  }

  const orgs = await loadOrgs();
  log(`Loaded ${orgs.length} organization(s) (dry=${DRY ? "1" : "0"})`);

  for (const row of orgs) {
    if (!row.website) continue;
    await processOrg(row);
    await new Promise((r) => setTimeout(r, 400));
  }

  log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
