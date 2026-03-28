/**
 * Runs all startup-professional seed scripts in sequence (non-zero exit stops the chain).
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";

const scripts = [
  "seed-yc-professionals.ts",
  "seed-angellist-founders.ts",
  "seed-producthunt-makers.ts",
  "seed-github-operators.ts",
];

const tsx = join(process.cwd(), "node_modules", ".bin", "tsx");

for (const s of scripts) {
  console.log(`\n── ${s} ──\n`);
  const r = spawnSync(tsx, [join("scripts", s)], {
    stdio: "inherit",
    cwd: process.cwd(),
    env: process.env,
  });
  if (r.status !== 0) {
    process.exit(r.status ?? 1);
  }
}

console.log("\nAll professional seed steps finished.");
