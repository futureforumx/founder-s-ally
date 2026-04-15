/**
 * Recompute firm (and optional person) market intel snapshots + derived profile rows.
 * Idempotent per (vc_firm_id, window_days, as_of_date). Batch upserts.
 *
 *   npx tsx scripts/funding-intel/aggregate-and-snapshot.ts
 *   INTEL_AS_OF=2026-04-15 INTEL_DRY_RUN=1 npx tsx scripts/funding-intel/aggregate-and-snapshot.ts
 */
import { Prisma, PrismaClient } from "@prisma/client";
import {
  computeActivityScoreV1,
  computeMomentumScoreV1,
  recencyWeight,
  topBuckets,
  type ActivityComponentsV1,
  type MomentumComponentsV1,
  type PaceLabel,
} from "./lib/scoring.js";

const prisma = new PrismaClient();
const DRY = process.env.INTEL_DRY_RUN === "1";
const WINDOWS = [30, 90, 180, 365] as const;
const DAY_MS = 86_400_000;

function log(m: string) {
  console.log(`[intel:aggregate] ${new Date().toISOString()} ${m}`);
}

/** Shared deal-attribution row for firm- or person-level rollups. */
type IntelEventRow = {
  role: string;
  announced_date: Date | null;
  published_at: Date | null;
  sector: string | null;
  stage: string | null;
  geo: string | null;
  amount_minor: bigint | null;
  company_name: string;
  deal_id: string;
};

type RawRow = IntelEventRow & { vc_firm_id: string };
type PersonRawRow = IntelEventRow & { vc_person_id: string };

function effectDate(r: IntelEventRow, asOf: Date): Date {
  return r.announced_date ?? r.published_at ?? asOf;
}

function inWindow(d: Date, asOf: Date, days: number): boolean {
  const t = asOf.getTime() - d.getTime();
  return t >= 0 && t <= days * DAY_MS;
}

function weighted(events: IntelEventRow[], asOf: Date, days: number, pred: (r: IntelEventRow) => boolean): number {
  let s = 0;
  for (const e of events) {
    const d = effectDate(e, asOf);
    if (!inWindow(d, asOf, days)) continue;
    if (!pred(e)) continue;
    s += recencyWeight(d, asOf);
  }
  return s;
}

function medianBigint(values: bigint[]): bigint | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2n;
}

function meanBigint(values: bigint[]): bigint | null {
  if (!values.length) return null;
  let s = 0n;
  for (const v of values) s += v;
  return s / BigInt(values.length);
}

function buildMetrics(
  events: IntelEventRow[],
  coinvestorCounts: Map<string, number>,
  asOf: Date,
  window: number,
): Record<string, unknown> {
  const ev = events.filter((e) => inWindow(effectDate(e, asOf), asOf, window));
  const distinctDealIds = new Set(ev.map((e) => e.deal_id));
  const leads = ev.filter((e) => e.role === "LEAD");
  const parts = ev.filter((e) => e.role === "PARTICIPANT");
  const amounts = [...new Map(ev.map((e) => [e.deal_id, e.amount_minor])).values()].filter((x): x is bigint => x != null);

  const sectors: Record<string, number> = {};
  const stages: Record<string, number> = {};
  const geos: Record<string, number> = {};
  for (const e of ev) {
    if (e.sector) sectors[e.sector] = (sectors[e.sector] ?? 0) + 1;
    if (e.stage) stages[e.stage] = (stages[e.stage] ?? 0) + 1;
    if (e.geo) geos[e.geo] = (geos[e.geo] ?? 0) + 1;
  }

  const companySet = new Set(ev.map((e) => e.company_name));
  const topCoinvestors = [...coinvestorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([vc_firm_id, count]) => ({ vc_firm_id, count }));

  return {
    deals_total: distinctDealIds.size,
    leads_total: leads.length,
    participants_total: parts.length,
    deals_in_window: distinctDealIds.size,
    median_amount_minor: amounts.length ? medianBigint(amounts)?.toString() ?? null : null,
    mean_amount_minor: amounts.length ? meanBigint(amounts)?.toString() ?? null : null,
    distinct_companies: companySet.size,
    sectors,
    stages,
    geographies: geos,
    top_coinvestors: topCoinvestors,
    article_mentions: ev.filter((e) => e.published_at).length,
  };
}

function buildFocusJson(metrics: Record<string, unknown>, pace: PaceLabel) {
  const sectors = (metrics.sectors as Record<string, number>) ?? {};
  const stages = (metrics.stages as Record<string, number>) ?? {};
  const geos = (metrics.geographies as Record<string, number>) ?? {};
  return {
    recent_focus: topBuckets(sectors, 3).map((x) => x.key),
    top_recent_sectors: topBuckets(sectors, 8),
    top_recent_stages: topBuckets(stages, 8),
    top_recent_geographies: topBuckets(geos, 8),
    top_recent_themes: topBuckets(sectors, 8),
    current_investment_pace_label: pace,
    provenance: { source: "funding_deals+intel_v1", generated_at: new Date().toISOString() },
  };
}

function paceLabelHuman(pace: PaceLabel): string {
  switch (pace) {
    case "accelerating":
      return "faster than the prior 31–90 day window";
    case "steady":
      return "roughly in line with the prior 31–90 day window";
    case "slowing":
      return "cooler than the prior 31–90 day window";
    default:
      return "not enough comparable history to judge quarter-over-quarter pace";
  }
}

/** News-derived narrative for firm or person derived intel (not a legal attestation). */
function buildIntelNarrativeSummary(opts: {
  dealsInWindow: number;
  leadsInWindow: number;
  participantsInWindow: number;
  topSectors: { key: string; count: number }[];
  topStages: { key: string; count: number }[];
  pace: PaceLabel;
  recentCompanyNames: string[];
  entityLabel: "firm" | "investor";
}): string {
  const names = opts.recentCompanyNames.map((s) => String(s ?? "").trim()).filter(Boolean).slice(0, 4);
  const companyPhrase =
    names.length === 0
      ? "tracked company rounds in headlines"
      : names.length === 1
        ? names[0]!
        : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]!}`;

  const sectorBuckets = opts.topSectors.map((s) => s.key).filter(Boolean).slice(0, 3);
  const stageBuckets = opts.topStages.map((s) => s.key).filter(Boolean).slice(0, 2);

  const sectorText =
    sectorBuckets.length > 0
      ? `Sector exposure in this window leans toward ${sectorBuckets.join(", ")}.`
      : "Sector tags are thin or mixed in the captured headlines.";

  const stageText =
    stageBuckets.length > 0 ? `Round stages skew toward ${stageBuckets.join(" and ")}.` : "";

  const roleHint =
    opts.leadsInWindow > 0
      ? `Source text tags this ${opts.entityLabel} on the lead side in ${opts.leadsInWindow} line${opts.leadsInWindow === 1 ? "" : "s"} (co-lead counts may be noisy).`
      : opts.participantsInWindow > 0
        ? `Mostly appears as a round participant in parsed items (${opts.participantsInWindow} participant tag${opts.participantsInWindow === 1 ? "" : "s"}).`
        : "";

  const who =
    opts.entityLabel === "firm"
      ? `Across the 90-day window, this firm is attributed to ${opts.dealsInWindow} distinct news-linked company round${opts.dealsInWindow === 1 ? "" : "s"} (examples: ${companyPhrase}).`
      : `Across the 90-day window, this investor is attributed to ${opts.dealsInWindow} distinct news-linked company round${opts.dealsInWindow === 1 ? "" : "s"} (examples: ${companyPhrase}).`;

  return `${who} ${sectorText} ${stageText} Pace vs the prior 31–90 day band is ${paceLabelHuman(opts.pace)}. ${roleHint}`.replace(/\s+/g, " ").trim();
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");

  const asOfRaw = process.env.INTEL_AS_OF?.trim();
  const asOf = asOfRaw ? new Date(`${asOfRaw}T00:00:00.000Z`) : new Date();
  asOf.setUTCHours(0, 0, 0, 0);

  let runId: string | null = null;
  if (!DRY) {
    const r = await prisma.intelBatchRun.create({
      data: { job_kind: "aggregate_snapshot", status: "running" },
    });
    runId = r.id;
  }

  try {
    const rows = await prisma.$queryRaw<RawRow[]>`
      SELECT
        fdil.vc_firm_id as "vc_firm_id",
        fdi.role::text as "role",
        fd.announced_date as "announced_date",
        sa.published_at as "published_at",
        fd.sector_normalized as "sector",
        fd.round_type_normalized as "stage",
        fd.company_hq as "geo",
        fd.amount_minor_units as "amount_minor",
        fd.company_name as "company_name",
        fd.id as "deal_id"
      FROM funding_deal_investor_links fdil
      JOIN funding_deal_investors fdi ON fdi.id = fdil.funding_deal_investor_id
      JOIN funding_deals fd ON fd.id = fdi.funding_deal_id
      JOIN source_articles sa ON sa.id = fd.source_article_id
      WHERE fdil.vc_firm_id IS NOT NULL
        AND fd.duplicate_of_deal_id IS NULL
    `;

    log(`raw event rows: ${rows.length}`);

    const dealFirms = new Map<string, Set<string>>();
    for (const r of rows) {
      const s = dealFirms.get(r.deal_id) ?? new Set();
      s.add(r.vc_firm_id);
      dealFirms.set(r.deal_id, s);
    }

    const coinvestorMaps = new Map<string, Map<string, number>>();
    for (const r of rows) {
      const others = [...(dealFirms.get(r.deal_id) ?? [])].filter((id) => id !== r.vc_firm_id);
      const cm = coinvestorMaps.get(r.vc_firm_id) ?? new Map();
      for (const o of others) {
        cm.set(o, (cm.get(o) ?? 0) + 1);
      }
      coinvestorMaps.set(r.vc_firm_id, cm);
    }

    const byFirm = new Map<string, RawRow[]>();
    const seenFirmDeal = new Set<string>();
    for (const r of rows) {
      const dedupeKey = `${r.vc_firm_id}:${r.deal_id}`;
      if (seenFirmDeal.has(dedupeKey)) continue;
      seenFirmDeal.add(dedupeKey);
      const arr = byFirm.get(r.vc_firm_id) ?? [];
      arr.push(r);
      byFirm.set(r.vc_firm_id, arr);
    }

    let snapCount = 0;
    const firmIds = [...byFirm.keys()];

    for (const firmId of firmIds) {
      const events = byFirm.get(firmId)!;
      const coin = coinvestorMaps.get(firmId) ?? new Map();

      for (const w of WINDOWS) {
        const metrics = buildMetrics(events, coin, asOf, w);

        const deals_w_365 = weighted(events, asOf, 365, () => true);
        const deals_w_90 = weighted(events, asOf, 90, () => true);
        const deals_w_30 = weighted(events, asOf, 30, () => true);
        const leads_w_90 = weighted(events, asOf, 90, (e) => e.role === "LEAD");
        const parts_w_90 = weighted(events, asOf, 90, (e) => e.role === "PARTICIPANT");
        const articles_90 = events.filter(
          (e) => e.published_at && inWindow(effectDate(e, asOf), asOf, 90) && e.published_at,
        ).length;

        const activityComponents: ActivityComponentsV1 = {
          deals_weighted_365: deals_w_365,
          deals_weighted_90: deals_w_90,
          deals_weighted_30: deals_w_30,
          leads_weighted_90: leads_w_90,
          participants_weighted_90: parts_w_90,
          article_corroboration_90: articles_90,
          cap_deals_weighted: 25,
          cap_leads_weighted: 12,
        };

        const pace_recent = deals_w_30;
        const pace_prior = weighted(events, asOf, 90, (e) => {
          const d = effectDate(e, asOf);
          const age = (asOf.getTime() - d.getTime()) / DAY_MS;
          return age > 30 && age <= 90;
        });
        const deals_30_90 = pace_prior;

        const momentumComponents: MomentumComponentsV1 = {
          pace_recent,
          pace_prior: Math.max(pace_prior, 1e-6),
          deals_weighted_30_90: deals_30_90,
        };

        const { score: activity_score, components: ac } = computeActivityScoreV1(activityComponents);
        const { score: momentum_score, components: mc, pace } = computeMomentumScoreV1(momentumComponents);
        const focus_json = buildFocusJson(metrics, pace);

        if (!DRY) {
          await prisma.firmMarketIntelSnapshot.upsert({
            where: {
              firm_market_intel_firm_window_date_key: {
                vc_firm_id: firmId,
                window_days: w,
                as_of_date: asOf,
              },
            },
            create: {
              vc_firm_id: firmId,
              window_days: w,
              as_of_date: asOf,
              metrics_json: metrics as Prisma.InputJsonValue,
              activity_score,
              momentum_score,
              activity_components_json: ac as Prisma.InputJsonValue,
              momentum_components_json: mc as Prisma.InputJsonValue,
              focus_json: focus_json as Prisma.InputJsonValue,
            },
            update: {
              metrics_json: metrics as Prisma.InputJsonValue,
              activity_score,
              momentum_score,
              activity_components_json: ac as Prisma.InputJsonValue,
              momentum_components_json: mc as Prisma.InputJsonValue,
              focus_json: focus_json as Prisma.InputJsonValue,
            },
          });
        }
        snapCount += 1;
      }

      if (!DRY) {
        const snap = await prisma.firmMarketIntelSnapshot.findUnique({
          where: {
            firm_market_intel_firm_window_date_key: {
              vc_firm_id: firmId,
              window_days: 90,
              as_of_date: asOf,
            },
          },
        });
        if (!snap) continue;

        const m = snap.metrics_json as Record<string, unknown>;
        const deals = Number(m.deals_in_window ?? 0);
        const sectorBuckets = topBuckets((m.sectors as Record<string, number>) ?? {}, 8);
        const stageBuckets = topBuckets((m.stages as Record<string, number>) ?? {}, 8);

        const lastSeen = await prisma.$queryRaw<Array<{ mx: Date | null }>>`
          SELECT MAX(COALESCE(fd.announced_date, sa.published_at)) as mx
          FROM funding_deal_investor_links fdil
          JOIN funding_deal_investors fdi ON fdi.id = fdil.funding_deal_investor_id
          JOIN funding_deals fd ON fd.id = fdi.funding_deal_id
          JOIN source_articles sa ON sa.id = fd.source_article_id
          WHERE fdil.vc_firm_id = ${firmId}
            AND fd.duplicate_of_deal_id IS NULL
        `;
        const lastAt = lastSeen[0]?.mx ?? null;

        const recentInv = await prisma.$queryRaw<
          Array<{ company_name: string; announced_date: Date | null; sector: string | null }>
        >`
          SELECT fd.company_name as "company_name",
                 fd.announced_date as "announced_date",
                 fd.sector_normalized as "sector"
          FROM funding_deal_investor_links fdil
          JOIN funding_deal_investors fdi ON fdi.id = fdil.funding_deal_investor_id
          JOIN funding_deals fd ON fd.id = fdi.funding_deal_id
          WHERE fdil.vc_firm_id = ${firmId}
            AND fd.duplicate_of_deal_id IS NULL
          ORDER BY fd.announced_date DESC NULLS LAST, fd.company_name ASC
          LIMIT 12
        `;

        const paceFromSnap =
          (snap.focus_json as { current_investment_pace_label?: PaceLabel })?.current_investment_pace_label ??
          "insufficient_data";
        const summary = buildIntelNarrativeSummary({
          dealsInWindow: deals,
          leadsInWindow: Number(m.leads_total ?? 0),
          participantsInWindow: Number(m.participants_total ?? 0),
          topSectors: sectorBuckets,
          topStages: stageBuckets,
          pace: paceFromSnap,
          recentCompanyNames: recentInv.map((r) => r.company_name),
          entityLabel: "firm",
        });

        await prisma.vCFirmDerivedMarketIntel.upsert({
          where: { vc_firm_id: firmId },
          create: {
            vc_firm_id: firmId,
            recent_activity_summary: summary,
            recent_investments_json: recentInv as unknown as Prisma.InputJsonValue,
            activity_metrics_json: m as Prisma.InputJsonValue,
            focus_json: snap.focus_json as Prisma.InputJsonValue,
            pace_label: (snap.focus_json as { current_investment_pace_label?: string })?.current_investment_pace_label ?? null,
            activity_score: snap.activity_score,
            momentum_score: snap.momentum_score,
            score_components_json: {
              activity: snap.activity_components_json,
              momentum: snap.momentum_components_json,
            } as Prisma.InputJsonValue,
            last_seen_investing_at: lastAt,
          },
          update: {
            recent_activity_summary: summary,
            recent_investments_json: recentInv as unknown as Prisma.InputJsonValue,
            activity_metrics_json: m as Prisma.InputJsonValue,
            focus_json: snap.focus_json as Prisma.InputJsonValue,
            pace_label: (snap.focus_json as { current_investment_pace_label?: string })?.current_investment_pace_label ?? null,
            activity_score: snap.activity_score,
            momentum_score: snap.momentum_score,
            score_components_json: {
              activity: snap.activity_components_json,
              momentum: snap.momentum_components_json,
            } as Prisma.InputJsonValue,
            last_seen_investing_at: lastAt,
          },
        });
      }
    }

    log(`snapshots upserted (count)=${snapCount} firms=${firmIds.length}`);

    const personRows = await prisma.$queryRaw<PersonRawRow[]>`
      SELECT
        fdil.vc_person_id as "vc_person_id",
        fdi.role::text as "role",
        fd.announced_date as "announced_date",
        sa.published_at as "published_at",
        fd.sector_normalized as "sector",
        fd.round_type_normalized as "stage",
        fd.company_hq as "geo",
        fd.amount_minor_units as "amount_minor",
        fd.company_name as "company_name",
        fd.id as "deal_id"
      FROM funding_deal_investor_links fdil
      JOIN funding_deal_investors fdi ON fdi.id = fdil.funding_deal_investor_id
      JOIN funding_deals fd ON fd.id = fdi.funding_deal_id
      JOIN source_articles sa ON sa.id = fd.source_article_id
      WHERE fdil.vc_person_id IS NOT NULL
        AND fd.duplicate_of_deal_id IS NULL
    `;

    const byPerson = new Map<string, PersonRawRow[]>();
    const seenPersonDeal = new Set<string>();
    for (const r of personRows) {
      const dedupeKey = `${r.vc_person_id}:${r.deal_id}`;
      if (seenPersonDeal.has(dedupeKey)) continue;
      seenPersonDeal.add(dedupeKey);
      const arr = byPerson.get(r.vc_person_id) ?? [];
      arr.push(r);
      byPerson.set(r.vc_person_id, arr);
    }

    const emptyCoin = new Map<string, number>();
    let personSnapCount = 0;
    const personIds = [...byPerson.keys()];

    for (const personId of personIds) {
      const events: IntelEventRow[] = byPerson.get(personId)!;

      for (const w of WINDOWS) {
        const metrics = buildMetrics(events, emptyCoin, asOf, w);

        const deals_w_365 = weighted(events, asOf, 365, () => true);
        const deals_w_90 = weighted(events, asOf, 90, () => true);
        const deals_w_30 = weighted(events, asOf, 30, () => true);
        const leads_w_90 = weighted(events, asOf, 90, (e) => e.role === "LEAD");
        const parts_w_90 = weighted(events, asOf, 90, (e) => e.role === "PARTICIPANT");
        const articles_90 = events.filter(
          (e) => e.published_at && inWindow(effectDate(e, asOf), asOf, 90) && e.published_at,
        ).length;

        const activityComponents: ActivityComponentsV1 = {
          deals_weighted_365: deals_w_365,
          deals_weighted_90: deals_w_90,
          deals_weighted_30: deals_w_30,
          leads_weighted_90: leads_w_90,
          participants_weighted_90: parts_w_90,
          article_corroboration_90: articles_90,
          cap_deals_weighted: 25,
          cap_leads_weighted: 12,
        };

        const pace_prior = weighted(events, asOf, 90, (e) => {
          const d = effectDate(e, asOf);
          const age = (asOf.getTime() - d.getTime()) / DAY_MS;
          return age > 30 && age <= 90;
        });
        const deals_30_90 = pace_prior;

        const momentumComponents: MomentumComponentsV1 = {
          pace_recent: deals_w_30,
          pace_prior: Math.max(pace_prior, 1e-6),
          deals_weighted_30_90: deals_30_90,
        };

        const { score: activity_score, components: ac } = computeActivityScoreV1(activityComponents);
        const { score: momentum_score, components: mc, pace } = computeMomentumScoreV1(momentumComponents);
        const focus_json = buildFocusJson(metrics, pace);

        if (!DRY) {
          await prisma.investorMarketIntelSnapshot.upsert({
            where: {
              investor_market_intel_person_window_date_key: {
                vc_person_id: personId,
                window_days: w,
                as_of_date: asOf,
              },
            },
            create: {
              vc_person_id: personId,
              window_days: w,
              as_of_date: asOf,
              metrics_json: metrics as Prisma.InputJsonValue,
              activity_score,
              momentum_score,
              activity_components_json: ac as Prisma.InputJsonValue,
              momentum_components_json: mc as Prisma.InputJsonValue,
              focus_json: focus_json as Prisma.InputJsonValue,
            },
            update: {
              metrics_json: metrics as Prisma.InputJsonValue,
              activity_score,
              momentum_score,
              activity_components_json: ac as Prisma.InputJsonValue,
              momentum_components_json: mc as Prisma.InputJsonValue,
              focus_json: focus_json as Prisma.InputJsonValue,
            },
          });
        }
        personSnapCount += 1;
      }

      if (!DRY) {
        const snap = await prisma.investorMarketIntelSnapshot.findUnique({
          where: {
            investor_market_intel_person_window_date_key: {
              vc_person_id: personId,
              window_days: 90,
              as_of_date: asOf,
            },
          },
        });
        if (!snap) continue;

        const m = snap.metrics_json as Record<string, unknown>;
        const deals = Number(m.deals_in_window ?? 0);
        const sectorBuckets = topBuckets((m.sectors as Record<string, number>) ?? {}, 8);
        const stageBuckets = topBuckets((m.stages as Record<string, number>) ?? {}, 8);

        const lastSeen = await prisma.$queryRaw<Array<{ mx: Date | null }>>`
          SELECT MAX(COALESCE(fd.announced_date, sa.published_at)) as mx
          FROM funding_deal_investor_links fdil
          JOIN funding_deal_investors fdi ON fdi.id = fdil.funding_deal_investor_id
          JOIN funding_deals fd ON fd.id = fdi.funding_deal_id
          JOIN source_articles sa ON sa.id = fd.source_article_id
          WHERE fdil.vc_person_id = ${personId}
            AND fd.duplicate_of_deal_id IS NULL
        `;
        const lastAt = lastSeen[0]?.mx ?? null;

        const recentInv = await prisma.$queryRaw<
          Array<{ company_name: string; announced_date: Date | null; sector: string | null }>
        >`
          SELECT fd.company_name as "company_name",
                 fd.announced_date as "announced_date",
                 fd.sector_normalized as "sector"
          FROM funding_deal_investor_links fdil
          JOIN funding_deal_investors fdi ON fdi.id = fdil.funding_deal_investor_id
          JOIN funding_deals fd ON fd.id = fdi.funding_deal_id
          WHERE fdil.vc_person_id = ${personId}
            AND fd.duplicate_of_deal_id IS NULL
          ORDER BY fd.announced_date DESC NULLS LAST, fd.company_name ASC
          LIMIT 12
        `;

        const paceFromSnap =
          (snap.focus_json as { current_investment_pace_label?: PaceLabel })?.current_investment_pace_label ??
          "insufficient_data";
        const summary = buildIntelNarrativeSummary({
          dealsInWindow: deals,
          leadsInWindow: Number(m.leads_total ?? 0),
          participantsInWindow: Number(m.participants_total ?? 0),
          topSectors: sectorBuckets,
          topStages: stageBuckets,
          pace: paceFromSnap,
          recentCompanyNames: recentInv.map((r) => r.company_name),
          entityLabel: "investor",
        });

        await prisma.vCPersonDerivedMarketIntel.upsert({
          where: { vc_person_id: personId },
          create: {
            vc_person_id: personId,
            recent_investment_summary: summary,
            recent_investments_json: recentInv as unknown as Prisma.InputJsonValue,
            activity_metrics_json: m as Prisma.InputJsonValue,
            focus_json: snap.focus_json as Prisma.InputJsonValue,
            pace_label: paceFromSnap,
            activity_score: snap.activity_score,
            momentum_score: snap.momentum_score,
            score_components_json: {
              activity: snap.activity_components_json,
              momentum: snap.momentum_components_json,
            } as Prisma.InputJsonValue,
            last_seen_investing_at: lastAt,
          },
          update: {
            recent_investment_summary: summary,
            recent_investments_json: recentInv as unknown as Prisma.InputJsonValue,
            activity_metrics_json: m as Prisma.InputJsonValue,
            focus_json: snap.focus_json as Prisma.InputJsonValue,
            pace_label: paceFromSnap,
            activity_score: snap.activity_score,
            momentum_score: snap.momentum_score,
            score_components_json: {
              activity: snap.activity_components_json,
              momentum: snap.momentum_components_json,
            } as Prisma.InputJsonValue,
            last_seen_investing_at: lastAt,
          },
        });
      }
    }

    log(`person snapshot cells=${personSnapCount} people=${personIds.length} raw_rows=${personRows.length}`);

    if (runId && !DRY) {
      await prisma.intelBatchRun.update({
        where: { id: runId },
        data: {
          status: "success",
          finished_at: new Date(),
          summary_json: {
            firms: firmIds.length,
            snapshot_cells: snapCount,
            people: personIds.length,
            person_snapshot_cells: personSnapCount,
            person_raw_rows: personRows.length,
            as_of: asOf.toISOString(),
          },
        },
      });
    }
  } catch (e) {
    if (runId && !DRY) {
      await prisma.intelBatchRun.update({
        where: { id: runId },
        data: {
          status: "failed",
          finished_at: new Date(),
          error_message: e instanceof Error ? e.message : String(e),
        },
      });
    }
    throw e;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
