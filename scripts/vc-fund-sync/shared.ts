import { createFundSyncService } from "../../src/lib/vc-funds/service";
import { buildDefaultFundAdapters } from "../../src/lib/vc-funds/adapters";
import type { FundSyncRunOptions } from "../../src/lib/vc-funds/types";

function requiredEnv(name: string): string {
  const value = process.env[name] || "";
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

export async function runFundSync(options: FundSyncRunOptions = {}) {
  const service = createFundSyncService({
    supabaseUrl: requiredEnv("SUPABASE_URL"),
    serviceRoleKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    adapters: buildDefaultFundAdapters(),
  });

  const stats = await service.run(options);
  console.log("[vc-fund-sync]", JSON.stringify(stats, null, 2));
  return stats;
}

export function createVcFundService() {
  return createFundSyncService({
    supabaseUrl: requiredEnv("SUPABASE_URL"),
    serviceRoleKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    adapters: buildDefaultFundAdapters(),
  });
}

export function envOptions(defaults: Partial<FundSyncRunOptions> = {}): FundSyncRunOptions {
  return {
    sourceKeys: process.env.VC_FUND_SOURCE_KEYS?.split(",").map((value) => value.trim()).filter(Boolean),
    maxItems: process.env.VC_FUND_MAX_ITEMS ? Number(process.env.VC_FUND_MAX_ITEMS) : defaults.maxItems,
    dryRun: process.env.VC_FUND_DRY_RUN === "1" || defaults.dryRun === true,
    allowFirmCreation: process.env.VC_FUND_ALLOW_FIRM_CREATE ? process.env.VC_FUND_ALLOW_FIRM_CREATE !== "0" : defaults.allowFirmCreation,
    freshCapitalWindowDays: process.env.VC_FUND_FRESH_WINDOW_DAYS ? Number(process.env.VC_FUND_FRESH_WINDOW_DAYS) : defaults.freshCapitalWindowDays,
    firmId: process.env.VC_FUND_FIRM_ID || defaults.firmId,
    clusterKey: process.env.VC_FUND_CLUSTER_KEY || defaults.clusterKey,
    dateFrom: process.env.VC_FUND_DATE_FROM || defaults.dateFrom,
    dateTo: process.env.VC_FUND_DATE_TO || defaults.dateTo,
    verbose: process.env.VC_FUND_VERBOSE === "1" || defaults.verbose === true,
    allowOfficialSourcePromotion: process.env.VC_FUND_ALLOW_OFFICIAL_PROMOTION
      ? process.env.VC_FUND_ALLOW_OFFICIAL_PROMOTION !== "0"
      : defaults.allowOfficialSourcePromotion,
    requireVerifiedForPromotion: process.env.VC_FUND_REQUIRE_VERIFIED
      ? process.env.VC_FUND_REQUIRE_VERIFIED !== "0"
      : defaults.requireVerifiedForPromotion,
    verifierBatchSize: process.env.VC_FUND_VERIFIER_BATCH_SIZE
      ? Number(process.env.VC_FUND_VERIFIER_BATCH_SIZE)
      : defaults.verifierBatchSize,
    verificationRateMs: process.env.VC_FUND_VERIFIER_RATE_MS
      ? Number(process.env.VC_FUND_VERIFIER_RATE_MS)
      : defaults.verificationRateMs,
  };
}
