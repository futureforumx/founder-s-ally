/**
 * Sample outputs for derived market intel (requires DATABASE_URL + prior pipeline run).
 *
 *   npx tsx scripts/funding-intel/print-intel-samples.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const n = Math.max(1, parseInt(process.env.SAMPLE_LIMIT || "4", 10));

async function main() {
  const rows = await prisma.vCFirmDerivedMarketIntel.findMany({
    take: n,
    orderBy: { updated_at: "desc" },
    include: { vc_firm: { select: { firm_name: true, slug: true } } },
  });
  console.log(
    JSON.stringify(
      rows.map((r) => ({
        firm_name: r.vc_firm.firm_name,
        slug: r.vc_firm.slug,
        activity_score: r.activity_score,
        momentum_score: r.momentum_score,
        pace_label: r.pace_label,
        last_seen_investing_at: r.last_seen_investing_at,
        recent_activity_summary: r.recent_activity_summary,
        focus: r.focus_json,
        metrics_preview: r.activity_metrics_json,
      })),
      null,
      2,
    ),
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
