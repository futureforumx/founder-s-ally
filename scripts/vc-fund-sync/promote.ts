import { createVcFundService, envOptions } from "./shared";

async function main() {
  const service = createVcFundService();
  const stats = await service.promoteCandidateCapitalEvents(envOptions({
    maxItems: 100,
    allowFirmCreation: false,
  }));
  console.log("[vc-fund-sync:promote]", JSON.stringify(stats, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
