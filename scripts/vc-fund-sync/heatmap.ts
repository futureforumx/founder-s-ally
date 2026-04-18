import { createVcFundService } from "./shared";

async function main() {
  const service = createVcFundService();
  const rows = await service.refreshCapitalHeatmap({
    windowDays: process.env.VC_FUND_HEATMAP_WINDOW_DAYS ? Number(process.env.VC_FUND_HEATMAP_WINDOW_DAYS) : 180,
  });
  console.log("[vc-fund-sync:heatmap]", JSON.stringify(rows, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
