/**
 * Roll back an applied enrichment batch (or every batch of a run) using alexandria_enrichment_changes.
 * A value is only restored when the column still holds what the pipeline wrote (--force overrides).
 *
 *   pnpm alexandria:rollback --id <batch_id|run_id> [--entity-id <record id>]   # dry run: lists what would be reverted
 *   ALEXANDRIA_ALLOW_WRITES=1 pnpm alexandria:rollback --id <batch_id|run_id> --apply [--force]
 *
 * To pause a running job, set its run to paused:
 *   pnpm alexandria:rollback --cancel <run_id>   (needs ALEXANDRIA_ALLOW_WRITES=1)
 */
import { parseArgs } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "../lib/loadEnvFiles";
import { SupabaseStore } from "../../src/lib/alexandria/supabaseStore";

loadEnvFiles([".env", ".env.local"]);

const { values: v } = parseArgs({
  options: { id: { type: "string" }, apply: { type: "boolean", default: false }, force: { type: "boolean", default: false }, cancel: { type: "string" }, "entity-id": { type: "string" }, by: { type: "string", default: "cli" } },
});

async function main() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    process.exit(2);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const writesOk = process.env.ALEXANDRIA_ALLOW_WRITES === "1";

  if (v.cancel) {
    if (!writesOk) {
      console.error("--cancel needs ALEXANDRIA_ALLOW_WRITES=1");
      process.exit(2);
    }
    const { error } = await db.from("enrichment_scrape_runs").update({ status: "paused" }).eq("run_id", v.cancel);
    if (error) throw new Error(error.message);
    console.log(`run ${v.cancel} marked paused; the job stops before its next batch.`);
    return;
  }
  if (!v.id) {
    console.error("--id <batch_id|run_id> is required");
    process.exit(2);
  }

  if (!v.apply || !writesOk) {
    const { data, error } = await db
      .from("alexandria_enrichment_changes")
      .select("batch_id, entity_type, table_name, column_name, op")
      .is("rolled_back_at", null)
      .or(`batch_id.eq.${v.id},run_id.eq.${v.id}`)
      .match(v["entity-id"] ? { entity_id: v["entity-id"] as string } : {});
    if (error) throw new Error(error.message);
    const summary = new Map<string, number>();
    for (const r of data ?? []) summary.set(`${r.entity_type}:${r.table_name}.${r.column_name ?? "(row)"} [${r.op}]`, (summary.get(`${r.entity_type}:${r.table_name}.${r.column_name ?? "(row)"} [${r.op}]`) ?? 0) + 1);
    console.log(`DRY RUN: ${data?.length ?? 0} change(s) would be reverted${v.apply ? " (set ALEXANDRIA_ALLOW_WRITES=1 to proceed)" : " (add --apply with ALEXANDRIA_ALLOW_WRITES=1)"}`);
    for (const [k, n] of summary) console.log(`  ${n} x ${k}`);
    return;
  }

  const results = await new SupabaseStore(db).rollbackBatch(v.id, v.by as string, { force: v.force as boolean, entityId: v["entity-id"] as string | undefined });
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
