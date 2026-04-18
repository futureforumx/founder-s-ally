import { runFundSync } from "./shared";

async function main() {
  await runFundSync({
    sourceKeys: process.env.VC_FUND_SOURCE_KEYS?.split(",").map((value) => value.trim()).filter(Boolean),
    maxItems: process.env.VC_FUND_MAX_ITEMS ? Number(process.env.VC_FUND_MAX_ITEMS) : 250,
    dryRun: process.env.VC_FUND_DRY_RUN === "1",
    allowFirmCreation: false,
    freshCapitalWindowDays: process.env.VC_FUND_FRESH_WINDOW_DAYS ? Number(process.env.VC_FUND_FRESH_WINDOW_DAYS) : 365,
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
