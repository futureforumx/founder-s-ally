import { createVcFundService, envOptions } from "./shared";

async function main() {
  const service = createVcFundService();
  const verified = await service.verifyCandidateClusters(envOptions({
    maxItems: 25,
    verifierBatchSize: 25,
  }));
  console.log("[vc-fund-sync:verify]", JSON.stringify({ verified }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
