/**
 * Batch canonical linking: funding_deals → startups, funding_deal_investors → vc_firms.
 * Deterministic first (domain, normalized name, aliases), then fuzzy high-confidence only.
 * Ambiguous fuzzy → entity_match_reviews (no link).
 *
 *   npx tsx scripts/funding-intel/link-entities.ts
 *   INTEL_LINK_BATCH=500 npx tsx scripts/funding-intel/link-entities.ts
 *   INTEL_DRY_RUN=1 npx tsx scripts/funding-intel/link-entities.ts
 */
import { PrismaClient } from "@prisma/client";
import { normalizeCompanyName } from "../funding-ingest/normalize.js";
import {
  aliasesFromFirmRecord,
  type AliasRow,
  type CanonicalFirmRecord,
  type FirmRow,
} from "./lib/canonical-entities.js";
import { canonicalDomain } from "./lib/domain.js";
import { tokenJaccard } from "./lib/similarity.js";

const prisma = new PrismaClient();
const DRY = process.env.INTEL_DRY_RUN === "1";
const BATCH = Math.max(50, parseInt(process.env.INTEL_LINK_BATCH || "400", 10));

type StartupRow = { id: string; company_name: string; domain: string | null };

function log(m: string) {
  console.log(`[intel:link] ${new Date().toISOString()} ${m}`);
}

function buildStartupIndexes(startups: StartupRow[]) {
  const byDomain = new Map<string, string>();
  const byNormName = new Map<string, string>();
  for (const s of startups) {
    if (s.domain) byDomain.set(s.domain.toLowerCase().replace(/^www\./, ""), s.id);
    byNormName.set(normalizeCompanyName(s.company_name), s.id);
  }
  return { byDomain, byNormName, startups };
}

function nameTokens(name: string): string[] {
  return normalizeCompanyName(name)
    .split(/\s+/)
    .filter((t) => t.length >= 2);
}

function buildFirmIndexes(firms: FirmRow[], aliases: AliasRow[]) {
  const byNormName = new Map<string, string>();
  const byAlias = new Map<string, string>();
  const byToken = new Map<string, FirmRow[]>();
  for (const f of firms) {
    byNormName.set(normalizeCompanyName(f.firm_name), f.id);
    for (const t of nameTokens(f.firm_name)) {
      const arr = byToken.get(t) ?? [];
      arr.push(f);
      byToken.set(t, arr);
    }
  }
  for (const a of aliases) {
    if (a.alias_type === "WEBSITE_DOMAIN") {
      const d = canonicalDomain(a.alias_value);
      if (d) byAlias.set(d, a.firm_id);
    }
    byAlias.set(normalizeCompanyName(a.alias_value), a.firm_id);
  }
  return { byNormName, byAlias, byToken, firms };
}

function bestStartupFuzzy(
  name: string,
  startups: StartupRow[],
  minJ: number,
): { id: string; j: number } | null {
  const n = normalizeCompanyName(name);
  if (n.length < 3) return null;
  let best: { id: string; j: number } | null = null;
  for (const s of startups) {
    const j = tokenJaccard(name, s.company_name);
    if (j < minJ) continue;
    if (!best || j > best.j) best = { id: s.id, j };
  }
  return best;
}

function bestFirmFuzzy(
  name: string,
  firms: FirmRow[],
  minJ: number,
  byToken?: Map<string, FirmRow[]>,
): { id: string; j: number } | null {
  let pool = firms;
  if (byToken && byToken.size) {
    const seen = new Set<string>();
    const narrowed: FirmRow[] = [];
    for (const t of nameTokens(name)) {
      for (const f of byToken.get(t) ?? []) {
        if (seen.has(f.id)) continue;
        seen.add(f.id);
        narrowed.push(f);
      }
    }
    if (narrowed.length) pool = narrowed;
    else return null;
  }
  let best: { id: string; j: number } | null = null;
  for (const f of pool) {
    const j = tokenJaccard(name, f.firm_name);
    if (j < minJ) continue;
    if (!best || j > best.j) best = { id: f.id, j };
  }
  return best;
}

async function publicColumnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${table}
        AND column_name = ${column}
    ) AS "exists"
  `;
  return Boolean(rows[0]?.exists);
}

async function publicTableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    ) AS "exists"
  `;
  return Boolean(rows[0]?.exists);
}

async function loadCanonicalFirms(): Promise<{ firms: FirmRow[]; aliases: AliasRow[]; source: string }> {
  if (await publicColumnExists("firm_records", "firm_name")) {
    const rows = await prisma.$queryRaw<CanonicalFirmRecord[]>`
      SELECT
        id::text AS id,
        firm_name,
        legal_name,
        aliases,
        alternate_names,
        domain,
        website_url
      FROM firm_records
      WHERE deleted_at IS NULL
        AND firm_name IS NOT NULL
        AND btrim(firm_name) <> ''
    `;
    if (rows.length) {
      return {
        firms: rows.map((r) => ({ id: r.id, firm_name: r.firm_name })),
        aliases: rows.flatMap(aliasesFromFirmRecord),
        source: "firm_records",
      };
    }
  }

  if (await publicColumnExists("vc_firms", "firm_name")) {
    const firms = await prisma.vCFirm.findMany({
      where: { deleted_at: null },
      select: { id: true, firm_name: true },
    });
    let aliases: AliasRow[] = [];
    if (await publicTableExists("vc_firm_aliases")) {
      aliases = await prisma.vCFirmAlias.findMany({
        select: { firm_id: true, alias_value: true, alias_type: true },
      });
    }
    return { firms, aliases, source: "vc_firms" };
  }

  if (await publicColumnExists("vc_firms", "name")) {
    const firms = await prisma.$queryRaw<FirmRow[]>`
      SELECT id::text AS id, name AS firm_name
      FROM vc_firms
      WHERE name IS NOT NULL AND btrim(name) <> ''
    `;
    return { firms, aliases: [], source: "vc_firms.name" };
  }

  return { firms: [], aliases: [], source: "none" };
}

async function linkCompanies(
  startups: StartupRow[],
  maps: ReturnType<typeof buildStartupIndexes>,
): Promise<{ linked: number; reviews: number; skipped: number }> {
  let linked = 0;
  let reviews = 0;
  let skipped = 0;
  let cursor: { id: string } | undefined;

  for (;;) {
    const deals = await prisma.fundingDeal.findMany({
      where: {
        duplicate_of_deal_id: null,
        company_link: null,
      },
      take: BATCH,
      orderBy: { id: "asc" },
      ...(cursor ? { cursor, skip: 1 } : {}),
      select: {
        id: true,
        company_name: true,
        company_website: true,
      },
    });
    if (!deals.length) break;
    cursor = { id: deals[deals.length - 1]!.id };

    for (const d of deals) {
      let startupId: string | null = null;
      let method: "DOMAIN_EXACT" | "NAME_EXACT" | "ALIAS_EXACT" | "FUZZY_HIGH" | "FUZZY_MEDIUM" | "MANUAL" | "UNRESOLVED" =
        "UNRESOLVED";
      let confidence = 0;
      const evidence: Record<string, unknown> = {};

      const dom = canonicalDomain(d.company_website);
      if (dom && maps.byDomain.has(dom)) {
        startupId = maps.byDomain.get(dom)!;
        method = "DOMAIN_EXACT";
        confidence = 1;
        evidence.domain = dom;
      }
      if (!startupId) {
        const nn = normalizeCompanyName(d.company_name);
        if (maps.byNormName.has(nn)) {
          startupId = maps.byNormName.get(nn)!;
          method = "NAME_EXACT";
          confidence = 1;
        }
      }
      if (!startupId) {
        const fuzzy = bestStartupFuzzy(d.company_name, startups, 0.88);
        if (fuzzy) {
          startupId = fuzzy.id;
          method = "FUZZY_HIGH";
          confidence = fuzzy.j;
          evidence.jaccard = fuzzy.j;
        }
      }
      if (!startupId) {
        const med = bestStartupFuzzy(d.company_name, startups, 0.72);
        if (med && med.j < 0.88) {
          if (!DRY) {
            await prisma.entityMatchReview.create({
              data: {
                kind: "DEAL_COMPANY",
                funding_deal_id: d.id,
                candidate_json: {
                  best_startup_id: med.id,
                  jaccard: med.j,
                  company_name: d.company_name,
                  company_website: d.company_website,
                },
                status: "PENDING",
              },
            });
            reviews += 1;
          } else {
            reviews += 1;
          }
          skipped += 1;
          continue;
        }
      }

      if (!startupId) {
        skipped += 1;
        continue;
      }

      if (!DRY) {
        await prisma.fundingDealCompanyLink.upsert({
          where: { funding_deal_id: d.id },
          create: {
            funding_deal_id: d.id,
            startup_id: startupId,
            match_method: method,
            match_confidence: confidence,
            match_evidence_json: evidence,
          },
          update: {
            startup_id: startupId,
            match_method: method,
            match_confidence: confidence,
            match_evidence_json: evidence,
          },
        });
      }
      linked += 1;
    }
  }

  return { linked, reviews, skipped };
}

async function linkInvestors(
  firms: FirmRow[],
  maps: ReturnType<typeof buildFirmIndexes>,
): Promise<{ linked: number; reviews: number; skipped: number }> {
  let linked = 0;
  let reviews = 0;
  let skipped = 0;
  let cursor: { id: string } | undefined;

  for (;;) {
    const rows = await prisma.fundingDealInvestor.findMany({
      where: { investor_link: null },
      take: BATCH,
      orderBy: { id: "asc" },
      ...(cursor ? { cursor, skip: 1 } : {}),
      select: { id: true, name_raw: true },
    });
    if (!rows.length) break;
    cursor = { id: rows[rows.length - 1]!.id };

    for (const inv of rows) {
      let firmId: string | null = null;
      let method: "DOMAIN_EXACT" | "NAME_EXACT" | "ALIAS_EXACT" | "FUZZY_HIGH" | "FUZZY_MEDIUM" | "MANUAL" | "UNRESOLVED" =
        "UNRESOLVED";
      let confidence = 0;
      const evidence: Record<string, unknown> = {};

      const nn = normalizeCompanyName(inv.name_raw);
      if (maps.byNormName.has(nn)) {
        firmId = maps.byNormName.get(nn)!;
        method = "NAME_EXACT";
        confidence = 1;
      } else if (maps.byAlias.has(nn)) {
        firmId = maps.byAlias.get(nn)!;
        method = "ALIAS_EXACT";
        confidence = 1;
      }

      if (!firmId) {
        const fuzzy = bestFirmFuzzy(inv.name_raw, firms, 0.88, maps.byToken);
        if (fuzzy) {
          firmId = fuzzy.id;
          method = "FUZZY_HIGH";
          confidence = fuzzy.j;
          evidence.jaccard = fuzzy.j;
        }
      }

      if (!firmId) {
        const med = bestFirmFuzzy(inv.name_raw, firms, 0.72, maps.byToken);
        if (med && med.j < 0.88) {
          if (!DRY) {
            await prisma.entityMatchReview.create({
              data: {
                kind: "DEAL_INVESTOR",
                funding_deal_investor_id: inv.id,
                candidate_json: {
                  best_vc_firm_id: med.id,
                  jaccard: med.j,
                  name_raw: inv.name_raw,
                },
                status: "PENDING",
              },
            });
            reviews += 1;
          } else {
            reviews += 1;
          }
          skipped += 1;
          continue;
        }
      }

      if (!firmId) {
        skipped += 1;
        continue;
      }

      if (!DRY) {
        await prisma.fundingDealInvestorLink.upsert({
          where: { funding_deal_investor_id: inv.id },
          create: {
            funding_deal_investor_id: inv.id,
            vc_firm_id: firmId,
            match_method: method,
            match_confidence: confidence,
            match_evidence_json: evidence,
          },
          update: {
            vc_firm_id: firmId,
            match_method: method,
            match_confidence: confidence,
            match_evidence_json: evidence,
          },
        });
      }
      linked += 1;
    }
  }

  return { linked, reviews, skipped };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
  log(`start DRY=${DRY}`);

  const startups = await prisma.startup.findMany({
    where: { deleted_at: null },
    select: { id: true, company_name: true, domain: true },
  });
  const smaps = buildStartupIndexes(startups);
  log(`startups loaded: ${startups.length}`);

  const { firms, aliases, source } = await loadCanonicalFirms();
  const fmaps = buildFirmIndexes(firms, aliases);
  log(`firms=${firms.length} aliases=${aliases.length} source=${source}`);

  const c = await linkCompanies(startups, smaps);
  log(`companies linked=${c.linked} reviews=${c.reviews} skipped=${c.skipped}`);

  const i = await linkInvestors(firms, fmaps);
  log(`investors linked=${i.linked} reviews=${i.reviews} skipped=${i.skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
