/**
 * Summarize funding intel linkage + Supabase bridge coverage.
 *
 *   npx tsx scripts/funding-intel/print-bridge-stats.ts
 */
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();

async function main() {
  const [
    linksWithFirm,
    linksWithPerson,
    derivedFirms,
    derivedPeople,
  ] = await Promise.all([
    prisma.fundingDealInvestorLink.count({ where: { vc_firm_id: { not: null } } }),
    prisma.fundingDealInvestorLink.count({ where: { vc_person_id: { not: null } } }),
    prisma.vCFirmDerivedMarketIntel.count(),
    prisma.vCPersonDerivedMarketIntel.count(),
  ]);

  console.log(JSON.stringify({ linksWithFirm, linksWithPerson, derivedFirms, derivedPeople }, null, 2));

  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (url && key) {
    const sb = createClient(url, key, { auth: { persistSession: false } });
    const { count: fr } = await sb
      .from("firm_records")
      .select("id", { count: "exact", head: true })
      .not("funding_intel_updated_at", "is", null);
    const { count: inv } = await sb
      .from("firm_investors")
      .select("id", { count: "exact", head: true })
      .not("funding_intel_updated_at", "is", null);
    console.log(JSON.stringify({ supabaseFirmRowsWithIntel: fr ?? 0, supabaseInvestorRowsWithIntel: inv ?? 0 }, null, 2));

    const { data: top } = await sb
      .from("firm_records")
      .select("firm_name, funding_intel_activity_score, funding_intel_momentum_score, funding_intel_pace_label")
      .not("funding_intel_activity_score", "is", null)
      .order("funding_intel_activity_score", { ascending: false })
      .limit(8);
    console.log("top_firms_by_activity:", top ?? []);
  } else {
    console.log("(Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for Supabase counts.)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
