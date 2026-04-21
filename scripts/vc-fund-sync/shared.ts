import { createFundSyncService } from "../../src/lib/vc-funds/service";
import { buildDefaultFundAdapters } from "../../src/lib/vc-funds/adapters";
import type { FundSyncRunOptions } from "../../src/lib/vc-funds/types";
import { loadEnvFiles } from "../lib/loadEnvFiles";

loadEnvFiles([".env", ".env.local", ".env.enrichment"]);

if (!process.env.SUPABASE_URL && process.env.VITE_SUPABASE_URL) {
  process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
}

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
  const sourceFetchLimits = Object.fromEntries(
    [
      ["TECHCRUNCH_VENTURE", process.env.VC_FUND_TECHCRUNCH_VENTURE_MAX],
      ["ALLEYWATCH_FUNDING", process.env.VC_FUND_ALLEYWATCH_MAX],
      ["TECHCRUNCH_FUNDING_TAG", process.env.VC_FUND_TECHCRUNCH_FUNDING_TAG_MAX],
      ["PRNEWSWIRE_VENTURE_CAPITAL", process.env.VC_FUND_PRNEWSWIRE_MAX],
      ["VCSHEET_FUNDS", process.env.VC_FUND_VCSHEET_MAX],
      ["SHAI_GOLDMAN_NEW_FUNDS_SHEET", process.env.VC_FUND_SHAI_GOLDMAN_NEW_FUNDS_SHEET_MAX],
    ].filter(([, value]) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0;
    }).map(([key, value]) => [key, Number(value)]),
  );

  return {
    sourceKeys: process.env.VC_FUND_SOURCE_KEYS?.split(",").map((value) => value.trim()).filter(Boolean),
    maxItems: process.env.VC_FUND_MAX_ITEMS ? Number(process.env.VC_FUND_MAX_ITEMS) : defaults.maxItems,
    sourceFetchLimits: Object.keys(sourceFetchLimits).length > 0
      ? sourceFetchLimits
      : defaults.sourceFetchLimits,
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
