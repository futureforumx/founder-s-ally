import { createVcFundService, envOptions } from "./shared";

async function main() {
  const service = createVcFundService();
  const options = envOptions({ freshCapitalWindowDays: 365 });
  await service.rederive(options);
  console.log("[vc-fund-sync:rederive]", JSON.stringify(options, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
