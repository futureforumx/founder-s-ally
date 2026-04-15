/**
 * Push Prisma-derived market intel onto Supabase `firm_records` / `firm_investors`
 * so the Vite app (Supabase client) can read scores without a Prisma bridge API.
 *
 * Requires: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 *   npx tsx scripts/funding-intel/sync-intel-to-supabase.ts
 *   INTEL_DRY_RUN=1 npx tsx scripts/funding-intel/sync-intel-to-supabase.ts
 */
import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";

const prisma = new PrismaClient();
const DRY = process.env.INTEL_DRY_RUN === "1";

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

function log(m: string) {
  console.log(`[intel:sync-supabase] ${new Date().toISOString()} ${m}`);
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error("SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY required");
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  const firms = await prisma.vCFirmDerivedMarketIntel.findMany({
    select: {
      vc_firm_id: true,
      recent_activity_summary: true,
      recent_investments_json: true,
      activity_metrics_json: true,
      focus_json: true,
      pace_label: true,
      activity_score: true,
      momentum_score: true,
      last_seen_investing_at: true,
    },
  });

  let firmOk = 0;
  let firmErr = 0;
  for (const row of firms) {
    const payload = {
      funding_intel_activity_score: row.activity_score,
      funding_intel_momentum_score: row.momentum_score,
      funding_intel_pace_label: row.pace_label,
      funding_intel_summary: row.recent_activity_summary,
      funding_intel_focus_json: row.focus_json,
      funding_intel_recent_investments_json: row.recent_investments_json,
      funding_intel_metrics_json: row.activity_metrics_json,
      funding_intel_last_deal_at: row.last_seen_investing_at?.toISOString() ?? null,
      funding_intel_updated_at: new Date().toISOString(),
    };
    if (DRY) {
      firmOk += 1;
      continue;
    }
    const { error } = await sb.from("firm_records").update(payload).eq("prisma_firm_id", row.vc_firm_id);
    if (error) firmErr += 1;
    else firmOk += 1;
  }
  log(`firm_records touch attempts=${firms.length} ok~${firmOk} err~${firmErr} (rows updated only when prisma_firm_id matches)`);

  const people = await prisma.vCPersonDerivedMarketIntel.findMany({
    select: {
      vc_person_id: true,
      recent_investment_summary: true,
      recent_investments_json: true,
      activity_metrics_json: true,
      focus_json: true,
      pace_label: true,
      activity_score: true,
      momentum_score: true,
      last_seen_investing_at: true,
    },
  });

  let pOk = 0;
  let pErr = 0;
  for (const row of people) {
    const payload = {
      funding_intel_activity_score: row.activity_score,
      funding_intel_momentum_score: row.momentum_score,
      funding_intel_pace_label: row.pace_label,
      funding_intel_summary: row.recent_investment_summary,
      funding_intel_focus_json: row.focus_json,
      funding_intel_recent_investments_json: row.recent_investments_json,
      funding_intel_metrics_json: row.activity_metrics_json,
      funding_intel_last_deal_at: row.last_seen_investing_at?.toISOString() ?? null,
      funding_intel_updated_at: new Date().toISOString(),
    };
    if (DRY) {
      pOk += 1;
      continue;
    }
    const { error } = await sb.from("firm_investors").update(payload).eq("prisma_person_id", row.vc_person_id);
    if (error) pErr += 1;
    else pOk += 1;
  }
  log(`firm_investors touch attempts=${people.length} ok~${pOk} err~${pErr}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
