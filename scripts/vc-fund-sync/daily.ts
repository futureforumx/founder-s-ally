import { closeVcFundPlaywrightSessions } from "../../src/lib/vc-funds/adapters";
import { disconnectPipelinePrisma } from "../lib/pipelineDb";
import { envOptions, runFundSync } from "./shared";

async function main() {
  try {
    await runFundSync(envOptions({
      maxItems: 100,
      allowFirmCreation: true,
      freshCapitalWindowDays: 365,
    }));
  } finally {
    await closeVcFundPlaywrightSessions();
    await disconnectPipelinePrisma();
  }
}

main()
  .then(() => {
    if (process.env.GITHUB_ACTIONS) process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
