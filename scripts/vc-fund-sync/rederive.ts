import { createVcFundService, envOptions } from "./shared";

async function main() {
  const service = createVcFundService();
  const options = envOptions({ freshCapitalWindowDays: 365 });
  const refreshed = await service.rederive(options);
  console.log("[vc-fund-sync:rederive]", JSON.stringify({ refreshed, options }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
