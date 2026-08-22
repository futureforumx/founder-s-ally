import { envOptions, runFundSync } from "./shared";

async function main() {
  await runFundSync(envOptions({
    allowFirmCreation: true,
    freshCapitalWindowDays: 365,
  }));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
