/**
 * Coverage + quality sample for person-linked funding intel.
 *
 *   npx tsx scripts/funding-intel/measure-person-intel.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [totalLinks, withPerson, withFirm, derivedPeople, investorSnapCount] = await Promise.all([
    prisma.fundingDealInvestorLink.count(),
    prisma.fundingDealInvestorLink.count({ where: { vc_person_id: { not: null } } }),
    prisma.fundingDealInvestorLink.count({ where: { vc_firm_id: { not: null } } }),
    prisma.vCPersonDerivedMarketIntel.count(),
    prisma.investorMarketIntelSnapshot.count(),
  ]);

  const distinctPeopleWithLink = await prisma.fundingDealInvestorLink.groupBy({
    by: ["vc_person_id"],
    where: { vc_person_id: { not: null } },
    _count: { _all: true },
  });

  const sample = await prisma.vCPersonDerivedMarketIntel.findMany({
    take: 20,
    orderBy: { activity_score: "desc" },
    include: {
      vc_person: { select: { id: true, first_name: true, last_name: true, preferred_name: true, firm_id: true } },
    },
  });

  const dealCounts = await Promise.all(
    sample.map((row) =>
      prisma.fundingDealInvestorLink.count({
        where: { vc_person_id: row.vc_person_id },
      }),
    ),
  );

  const out = {
    funding_deal_investor_links_total: totalLinks,
    links_with_vc_person_id: withPerson,
    links_with_vc_firm_id: withFirm,
    pct_links_with_vc_person_id: totalLinks ? Math.round((10000 * withPerson) / totalLinks) / 100 : 0,
    distinct_vc_person_id_with_at_least_one_link: distinctPeopleWithLink.length,
    vCPersonDerivedMarketIntel_rows: derivedPeople,
    investorMarketIntelSnapshot_rows: investorSnapCount,
    sample_size: sample.length,
    samples: sample.map((row, i) => {
      const focus = row.focus_json as Record<string, unknown> | null;
      const recentFocus = (focus?.recent_focus as string[] | undefined) ?? [];
      const inv = (row.recent_investments_json as unknown[]) ?? [];
      const name =
        row.vc_person.preferred_name?.trim() ||
        `${row.vc_person.first_name} ${row.vc_person.last_name}`.trim();
      return {
        vc_person_id: row.vc_person_id,
        display_name: name,
        firm_id: row.vc_person.firm_id,
        linked_deal_investor_links: dealCounts[i],
        activity_score: row.activity_score,
        momentum_score: row.momentum_score,
        pace_label: row.pace_label,
        recent_focus_sectors: recentFocus,
        summary: row.recent_investment_summary,
        recent_investments: inv.slice(0, 5),
      };
    }),
  };

  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
