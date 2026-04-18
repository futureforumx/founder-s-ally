import { createVcFundService, envOptions } from "./shared";

async function main() {
  const service = createVcFundService();
  const mirrored = process.env.VC_FUND_FORCE_MIRROR === "1"
    ? await service.repairVcFundSignalMirror(envOptions({ maxItems: 250 }))
    : await service.mirrorVcFundSignalsToIntelligenceEvents(envOptions({ maxItems: 250 }));
  console.log("[vc-fund-sync:mirror]", JSON.stringify({ mirrored }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
