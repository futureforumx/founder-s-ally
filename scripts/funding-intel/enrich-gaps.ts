/**
 * Fill missing funding_deals sectors and missing logo_url on linked companies / investor firms.
 *
 *   npx tsx scripts/funding-intel/enrich-gaps.ts
 *   INTEL_DRY_RUN=1 npx tsx scripts/funding-intel/enrich-gaps.ts
 */
import { disconnectPipelinePrisma, getPipelinePrisma } from "../lib/pipelineDb.js";
import {
  getLogoUrl,
  isMissingLogoUrl,
  resolveLogoDomain,
} from "../../src/lib/enrichment/logos";
import { classifyDealSector, isMissingSector } from "../../src/lib/enrichment/sectors";
import { isLikelyFundingCompanyName } from "../../src/lib/latestFundingDisplay";
import {
  findGalleryCompanyEntry,
  galleryProfileIsIncomplete,
  gallerySlugFromUrl,
  inferHqFromFundingCopy,
  isUsableCompanyDescription,
  mergeGalleryCompanyProfile,
  pickGalleryCompanyProfile,
  sanitizeCompanyDescription,
  sanitizeFundingHq,
} from "../../src/lib/galleryCompanyProfile";
import { fetchGalleryCompanyProfileFromPages } from "../lib/galleryCompanyPage";
import { fetchStartupsGallerySearchIndex, splitInvestorsAndCompanies } from "../lib/startupsGalleryIndex";

const prisma = getPipelinePrisma();
const DRY = process.env.INTEL_DRY_RUN === "1";
const DEAL_LIMIT = Math.max(1, parseInt(process.env.INTEL_ENRICH_DEAL_LIMIT || "250", 10));
const LOGO_LIMIT = Math.max(1, parseInt(process.env.INTEL_ENRICH_LOGO_LIMIT || "400", 10));
const ALLOW_OPENAI = Boolean(process.env.OPENAI_API_KEY) && process.env.INTEL_DISABLE_OPENAI !== "1";

function log(msg: string) {
  console.log(`[intel:enrich] ${new Date().toISOString()} ${msg}`);
}

async function enrichDealProfilesFromGallery(): Promise<{ scanned: number; updated: number }> {
  let companies: ReturnType<typeof splitInvestorsAndCompanies>["companies"];
  try {
    const index = await fetchStartupsGallerySearchIndex();
    companies = splitInvestorsAndCompanies(index).companies;
  } catch (err) {
    log(`gallery profile index skipped: ${err instanceof Error ? err.message : String(err)}`);
    return { scanned: 0, updated: 0 };
  }

  const deals = await prisma.fundingDeal.findMany({
    where: { duplicate_of_deal_id: null },
    select: {
      id: true,
      company_name: true,
      sector_raw: true,
      sector_normalized: true,
      company_hq: true,
      deal_summary: true,
      source_article: { select: { source_key: true, article_url: true, title: true } },
    },
    orderBy: { created_at: "desc" },
    take: DEAL_LIMIT,
  });

  const PAGE_FETCH_LIMIT = Math.max(0, parseInt(process.env.INTEL_GALLERY_PAGE_LIMIT || "80", 10));
  let pageFetches = 0;
  let updated = 0;
  for (const deal of deals) {
    if (!isLikelyFundingCompanyName(deal.company_name)) continue;
    const gallerySlug = gallerySlugFromUrl(deal.source_article?.article_url);
    const gallerySourced = deal.source_article?.source_key === "STARTUPS_GALLERY_NEWS" || Boolean(gallerySlug);
    const match = gallerySourced
      ? findGalleryCompanyEntry(companies, deal.company_name, gallerySlug)
      : gallerySlug
        ? findGalleryCompanyEntry(companies, deal.company_name, gallerySlug)
        : null;
    let profile = pickGalleryCompanyProfile(match?.entry);
    const dealMissingProfile =
      (isMissingSector(deal.sector_normalized) && isMissingSector(deal.sector_raw)) ||
      !sanitizeFundingHq(deal.company_hq) ||
      !isUsableCompanyDescription(deal.deal_summary);
    const needsPage = galleryProfileIsIncomplete(profile) && dealMissingProfile && (gallerySourced || Boolean(gallerySlug));
    if (needsPage && pageFetches < PAGE_FETCH_LIMIT) {
      pageFetches += 1;
      const fromPage = await fetchGalleryCompanyProfileFromPages(deal.company_name, gallerySlug ?? match?.path);
      profile = mergeGalleryCompanyProfile(profile, fromPage);
    }
    const inferredHq = inferHqFromFundingCopy(deal.company_name, deal.source_article?.title);
    const nextSector = profile.sector;
    const nextHq = profile.hqLine ?? sanitizeFundingHq(deal.company_hq) ?? inferredHq;
    const nextSummary = profile.description ?? (isUsableCompanyDescription(deal.deal_summary) ? sanitizeCompanyDescription(deal.deal_summary) : null);
    const patch: {
      sector_raw?: string;
      sector_normalized?: string;
      company_hq?: string | null;
      deal_summary?: string | null;
    } = {};

    if (isMissingSector(deal.sector_normalized) && isMissingSector(deal.sector_raw) && nextSector) {
      patch.sector_raw = nextSector;
      patch.sector_normalized = nextSector.toLowerCase();
    }
    const currentHq = sanitizeFundingHq(deal.company_hq);
    if (nextHq && currentHq !== nextHq) {
      patch.company_hq = nextHq;
    } else if (!currentHq && deal.company_hq) {
      patch.company_hq = null;
    }
    if (nextSummary && deal.deal_summary !== nextSummary && !isUsableCompanyDescription(deal.deal_summary)) {
      patch.deal_summary = nextSummary;
    }
    if (Object.keys(patch).length === 0) continue;
    updated += 1;
    if (DRY) {
      log(`would profile ${deal.company_name}: ${JSON.stringify(patch)}`);
      continue;
    }
    await prisma.fundingDeal.update({ where: { id: deal.id }, data: patch });
  }
  return { scanned: deals.length, updated };
}

async function enrichDealSectors(): Promise<{ scanned: number; updated: number }> {
  const deals = await prisma.fundingDeal.findMany({
    where: {
      duplicate_of_deal_id: null,
      OR: [
        { sector_normalized: null },
        { sector_normalized: "" },
        { sector_raw: null },
        { sector_raw: "" },
      ],
    },
    select: {
      id: true,
      company_name: true,
      sector_raw: true,
      sector_normalized: true,
      deal_summary: true,
      source_article: { select: { title: true, raw_excerpt: true } },
    },
    orderBy: { created_at: "desc" },
    take: DEAL_LIMIT,
  });

  const missing = deals.filter((d) => isMissingSector(d.sector_normalized) && isMissingSector(d.sector_raw));
  let updated = 0;
  for (const deal of missing) {
    const headline = deal.source_article?.title ?? "";
    const summary = deal.deal_summary || deal.source_article?.raw_excerpt || "";
    const classified = await classifyDealSector({
      companyName: deal.company_name,
      headline,
      articleSummary: summary,
      allowOpenAI: ALLOW_OPENAI,
    });
    if (!classified) continue;
    updated += 1;
    if (DRY) {
      log(`would set sector ${classified.sector} (${classified.method}) on ${deal.company_name}`);
      continue;
    }
    await prisma.fundingDeal.update({
      where: { id: deal.id },
      data: {
        sector_raw: classified.sector,
        sector_normalized: classified.sector,
      },
    });
  }
  return { scanned: missing.length, updated };
}

async function enrichLinkedStartupLogos(): Promise<{ scanned: number; updated: number }> {
  const links = await prisma.fundingDealCompanyLink.findMany({
    where: { startup_id: { not: null }, startup: { logo_url: null } },
    select: {
      startup: { select: { id: true, company_name: true, company_url: true, domain: true, logo_url: true } },
    },
    take: LOGO_LIMIT,
  });
  const seen = new Set<string>();
  let updated = 0;
  let scanned = 0;
  for (const link of links) {
    const startup = link.startup;
    if (!startup || seen.has(startup.id) || !isMissingLogoUrl(startup.logo_url)) continue;
    seen.add(startup.id);
    scanned += 1;
    const domain = resolveLogoDomain({
      name: startup.company_name,
      websiteUrl: startup.company_url,
      domain: startup.domain,
    });
    if (!domain) continue;
    const logoUrl = getLogoUrl(domain);
    if (!logoUrl) continue;
    updated += 1;
    if (DRY) continue;
    await prisma.startup.update({ where: { id: startup.id }, data: { logo_url: logoUrl } });
  }
  return { scanned, updated };
}

async function enrichLinkedVcFirmLogos(): Promise<{ scanned: number; updated: number }> {
  // Investor links store firm_records.id (text). vc_firms.id is uuid, so Prisma's
  // relation join throws `operator does not exist: uuid = text`.
  try {
    if (!(await firmRecordsTableExists())) {
      log("firm_records table not present — skip linked-investor logo backfill");
      return { scanned: 0, updated: 0 };
    }
    const rows = await prisma.$queryRaw<FirmRecordLogoRow[]>`
      SELECT DISTINCT ON (f.id)
        f.id::text AS id,
        f.firm_name,
        f.website_url,
        f.domain,
        f.logo_url
      FROM funding_deal_investor_links fdil
      INNER JOIN firm_records f ON f.id::text = fdil.vc_firm_id
      WHERE fdil.vc_firm_id IS NOT NULL
        AND f.deleted_at IS NULL
        AND (f.logo_url IS NULL OR btrim(f.logo_url) = '')
      ORDER BY f.id
      LIMIT ${LOGO_LIMIT}
    `;
    let updated = 0;
    for (const row of rows) {
      const domain = resolveLogoDomain({
        name: row.firm_name,
        websiteUrl: row.website_url,
        domain: row.domain,
      });
      if (!domain) continue;
      const logoUrl = getLogoUrl(domain);
      if (!logoUrl) continue;
      updated += 1;
      if (DRY) continue;
      await prisma.$executeRaw`
        UPDATE firm_records
        SET logo_url = ${logoUrl}, updated_at = NOW()
        WHERE id::text = ${row.id}
          AND (logo_url IS NULL OR btrim(logo_url) = '')
      `;
    }
    return { scanned: rows.length, updated };
  } catch (err) {
    log(`linked-investor logo backfill skipped: ${err instanceof Error ? err.message : String(err)}`);
    return { scanned: 0, updated: 0 };
  }
}

type FirmRecordLogoRow = {
  id: string;
  firm_name: string;
  website_url: string | null;
  domain: string | null;
  logo_url: string | null;
};

async function firmRecordsTableExists(): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'firm_records'
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

async function enrichFirmRecordLogos(): Promise<{ scanned: number; updated: number }> {
  try {
    if (!(await firmRecordsTableExists())) {
      log("firm_records table not present — skip directory logo backfill");
      return { scanned: 0, updated: 0 };
    }
    const rows = await prisma.$queryRaw<FirmRecordLogoRow[]>`
      SELECT id, firm_name, website_url, domain, logo_url
      FROM firm_records
      WHERE deleted_at IS NULL
        AND (logo_url IS NULL OR btrim(logo_url) = '')
      ORDER BY updated_at DESC NULLS LAST
      LIMIT ${LOGO_LIMIT}
    `;
    let updated = 0;
    for (const row of rows) {
      const domain = resolveLogoDomain({
        name: row.firm_name,
        websiteUrl: row.website_url,
        domain: row.domain,
      });
      if (!domain) continue;
      const logoUrl = getLogoUrl(domain);
      if (!logoUrl) continue;
      updated += 1;
      if (DRY) continue;
      await prisma.$executeRaw`
        UPDATE firm_records
        SET logo_url = ${logoUrl}, updated_at = NOW()
        WHERE id = ${row.id}
          AND (logo_url IS NULL OR btrim(logo_url) = '')
      `;
    }
    return { scanned: rows.length, updated };
  } catch (err) {
    log(`firm_records logo backfill skipped: ${err instanceof Error ? err.message : String(err)}`);
    return { scanned: 0, updated: 0 };
  }
}

async function main() {
  log(`start dry=${DRY} openai=${ALLOW_OPENAI} dealLimit=${DEAL_LIMIT} logoLimit=${LOGO_LIMIT}`);
  const profiles = await enrichDealProfilesFromGallery();
  log(`gallery profiles scanned=${profiles.scanned} updated=${profiles.updated}`);
  const sectors = await enrichDealSectors();
  log(`sectors scanned=${sectors.scanned} updated=${sectors.updated}`);
  const startups = await enrichLinkedStartupLogos();
  log(`startup logos scanned=${startups.scanned} updated=${startups.updated}`);
  const vcFirms = await enrichLinkedVcFirmLogos();
  log(`linked-firm logos scanned=${vcFirms.scanned} updated=${vcFirms.updated}`);
  const directory = await enrichFirmRecordLogos();
  log(`firm_records logos scanned=${directory.scanned} updated=${directory.updated}`);
}

main()
  .catch((err) => {
    console.error("[intel:enrich] failed", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPipelinePrisma();
  });
