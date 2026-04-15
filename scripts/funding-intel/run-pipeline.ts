/**
 * Full intelligence refresh after funding ingest:
 *   1) link-entities  2) link-investor-persons  3) aggregate-and-snapshot  4) sync-intel-to-supabase (optional)
 *
 *   npx tsx scripts/funding-intel/run-pipeline.ts
 *   INTEL_SKIP_SUPABASE_SYNC=1 npx tsx scripts/funding-intel/run-pipeline.ts
 */
import { execSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
function run(rel: string) {
  const script = path.join(root, rel);
  execSync(`npx tsx "${script}"`, { stdio: "inherit", env: process.env });
}

run("scripts/funding-intel/link-entities.ts");
run("scripts/funding-intel/link-investor-persons.ts");
run("scripts/funding-intel/aggregate-and-snapshot.ts");
const canSyncSupabase =
  process.env.INTEL_SKIP_SUPABASE_SYNC !== "1" &&
  Boolean((process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim()) &&
  Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim());
if (canSyncSupabase) {
  run("scripts/funding-intel/sync-intel-to-supabase.ts");
}
