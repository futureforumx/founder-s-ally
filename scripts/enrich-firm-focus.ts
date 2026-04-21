#!/usr/bin/env tsx
import { config as dotenvConfig } from "dotenv";
import { FirmFocusEnrichmentService } from "../src/lib/firm-focus-enrichment/service";

dotenvConfig({ path: ".env.local" });
dotenvConfig();

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const eq = arg.indexOf("=");
    if (eq > 0) {
      const key = arg.slice(2, eq);
      const raw = arg.slice(eq + 1);
      out[key] = raw === "true" ? true : raw === "false" ? false : raw;
    } else {
      out[arg.slice(2)] = true;
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const service = new FirmFocusEnrichmentService();

  const result = await service.run({
    limit: Number(args.limit ?? 200),
    offset: Number(args.offset ?? 0),
    commit: args.commit === true || args.commit === "true",
    firmId: typeof args["firm-id"] === "string" ? args["firm-id"] : undefined,
    minConfidence: Number(args["min-confidence"] ?? 0.72),
    reportPath: typeof args["report-path"] === "string" ? args["report-path"] : undefined,
  });

  console.log(
    JSON.stringify(
      {
        runId: result.runId,
        stats: result.stats,
        reportPath: result.reportPath,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
