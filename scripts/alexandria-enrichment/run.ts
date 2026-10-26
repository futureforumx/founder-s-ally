/**
 * Alexandria enrichment CLI. Enriches EXISTING records; never creates entities.
 *
 * SAFE BY DEFAULT: with no authorisation flags this is a dry run - it ranks records, plans the provider
 * waterfall, prints the worst-case credit estimate, and calls nothing paid and writes nothing.
 *
 *   # 1. dry run (free): plan + cost estimate
 *   pnpm alexandria:run --entity firm --limit 10
 *
 *   # 2. pilot lookups (BILLABLE, no entity writes): results are cached and shown as a proposed diff
 *   ALEXANDRIA_ALLOW_BILLABLE=1 pnpm alexandria:run --entity firm --limit 5 --allow-billable --max-credits 100 --capture-shapes
 *
 *   # 3. apply (DB WRITES): replays the cached pilot responses at zero cost, then writes high-confidence fields
 *   ALEXANDRIA_ALLOW_BILLABLE=1 ALEXANDRIA_ALLOW_WRITES=1 pnpm alexandria:run --entity firm --limit 5 \
 *     --allow-billable --max-credits 100 --no-dry-run --apply
 *
 * Each billable or writing capability needs BOTH the CLI flag and the matching env var.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import Firecrawl from "@mendable/firecrawl-js";
import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "../lib/loadEnvFiles";
import { MemoryStore } from "../../src/lib/alexandria/memoryStore";
import { SupabaseStore } from "../../src/lib/alexandria/supabaseStore";
import { ENTITY_TYPES, type EntityType, type JobOptions } from "../../src/lib/alexandria/types";
import { defaultJobOptions, OptionsError, runEnrichmentJob, type JobReport, type RecordResult } from "../../src/lib/alexandria/pipeline";
import { loadCatalog } from "../../src/lib/alexandria";
import type { EnrichmentStore } from "../../src/lib/alexandria/store";
import type { AlexandriaScrapePort } from "../../src/lib/alexandria/executor";
import type { WebScrapePort } from "../../src/lib/alexandria/web";

loadEnvFiles([".env", ".env.local"]);

const { values: v } = parseArgs({
  options: {
    entity: { type: "string", default: "firm" },
    limit: { type: "string", default: "25" },
    "batch-size": { type: "string", default: "10" },
    "max-credits": { type: "string", default: "0" },
    "daily-cap": { type: "string" },
    "provider-cap": { type: "string", multiple: true },
    "max-record-credits": { type: "string", default: "60" },
    concurrency: { type: "string", default: "2" },
    "dry-run": { type: "boolean", default: false },
    "no-dry-run": { type: "boolean", default: false },
    apply: { type: "boolean", default: false },
    "allow-billable": { type: "boolean", default: false },
    "missing-only": { type: "boolean", default: false },
    "refresh-stale": { type: "boolean", default: false },
    "force-refresh": { type: "boolean", default: false },
    "allow-contact-lookups": { type: "boolean", default: false },
    "allow-web-research": { type: "boolean", default: false },
    "capture-shapes": { type: "boolean", default: false },
    ids: { type: "string" },
    providers: { type: "string" },
    resume: { type: "string" },
    "scan-cap": { type: "string", default: "20000" },
    fixtures: { type: "string" },
    out: { type: "string" },
    json: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
  allowPositionals: false,
});

function die(msg: string): never {
  console.error(`error: ${msg}`);
  process.exit(2);
}

function gated(flag: boolean, flagName: string, envName: string): boolean {
  if (!flag) return false;
  if (process.env[envName] !== "1") die(`${flagName} also requires ${envName}=1 (explicit approval for billable lookups, writes and contact data).`);
  return true;
}

const num = (s: string | undefined, name: string): number => {
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) die(`${name} must be a non-negative number`);
  return n;
};

function entities(): EntityType[] {
  const raw = v.entity as string;
  if (raw === "all") return [...ENTITY_TYPES];
  const list = raw.split(",").map((s) => s.trim()) as EntityType[];
  for (const e of list) if (!ENTITY_TYPES.includes(e)) die(`--entity must be one of ${ENTITY_TYPES.join(", ")}, a comma list, or all`);
  return list;
}

function buildOptions(entity: EntityType): JobOptions {
  const allowBillable = gated(v["allow-billable"] as boolean, "--allow-billable", "ALEXANDRIA_ALLOW_BILLABLE");
  const allowWrites = gated(v.apply as boolean, "--apply", "ALEXANDRIA_ALLOW_WRITES");
  const forceAuthorized = gated(v["force-refresh"] as boolean, "--force-refresh", "ALEXANDRIA_ALLOW_FORCE_REFRESH");
  const allowContact = gated(v["allow-contact-lookups"] as boolean, "--allow-contact-lookups", "ALEXANDRIA_ALLOW_CONTACT_LOOKUPS");
  const allowWeb = gated(v["allow-web-research"] as boolean, "--allow-web-research", "ALEXANDRIA_ALLOW_BILLABLE");
  const dryRun = !(v["no-dry-run"] as boolean);
  if (v["dry-run"] && v["no-dry-run"]) die("--dry-run and --no-dry-run are mutually exclusive");

  const providerCaps: Record<string, number> = {};
  for (const cap of (v["provider-cap"] as string[] | undefined) ?? []) {
    const [p, n] = cap.split("=");
    if (!p || !Number.isFinite(Number(n))) die(`--provider-cap expects provider=credits, got "${cap}"`);
    providerCaps[p] = Number(n);
  }

  return defaultJobOptions(entity, {
    limit: Math.max(1, Math.floor(num(v.limit as string, "--limit"))),
    batchSize: Math.max(1, Math.floor(num(v["batch-size"] as string, "--batch-size"))),
    maxCredits: num(v["max-credits"] as string, "--max-credits"),
    dailyCreditCap: v["daily-cap"] ? num(v["daily-cap"] as string, "--daily-cap") : process.env.ALEXANDRIA_DAILY_CREDIT_CAP ? num(process.env.ALEXANDRIA_DAILY_CREDIT_CAP, "ALEXANDRIA_DAILY_CREDIT_CAP") : null,
    providerCaps,
    maxRecordCredits: num(v["max-record-credits"] as string, "--max-record-credits"),
    concurrency: Math.max(1, Math.floor(num(v.concurrency as string, "--concurrency"))),
    dryRun,
    allowWrites,
    allowBillable,
    missingOnly: v["missing-only"] as boolean,
    refreshStale: v["refresh-stale"] as boolean,
    forceRefresh: v["force-refresh"] as boolean,
    forceAuthorized,
    allowContactLookups: allowContact,
    allowWebResearch: allowWeb,
    captureShapes: v["capture-shapes"] as boolean,
    recordIds: v.ids ? (v.ids as string).split(",").map((s) => s.trim()).filter(Boolean) : null,
    providers: v.providers ? (v.providers as string).split(",").map((s) => s.trim()).filter(Boolean) : null,
    resumeRunId: (v.resume as string | undefined) ?? null,
    scanCap: Math.max(1, Math.floor(num(v["scan-cap"] as string, "--scan-cap"))),
  });
}

function makeStore(): EnrichmentStore {
  if (v.fixtures) {
    const store = new MemoryStore();
    const data = JSON.parse(readFileSync(v.fixtures as string, "utf8")) as Record<string, Array<Record<string, unknown>>>;
    for (const [table, rows] of Object.entries(data)) if (!table.startsWith("_")) store.seed(table, rows);
    console.error(`[fixtures] using in-memory store from ${v.fixtures} (synthetic data; nothing touches a database)`);
    return store;
  }
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) die("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --fixtures <file> for a database-free dry run).");
  return new SupabaseStore(createClient(url, key, { auth: { persistSession: false } }));
}

function makePorts(allowBillable: boolean, allowWeb: boolean): { port: AlexandriaScrapePort | null; webPort: WebScrapePort | null } {
  if (!allowBillable) return { port: null, webPort: null };
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) die("FIRECRAWL_API_KEY is required for billable lookups (server-side env only).");
  const client = new Firecrawl({ apiKey });
  const port: AlexandriaScrapePort = { scrape: (req) => client.scrape(req) };
  const webPort: WebScrapePort | null = allowWeb
    ? {
        async scrape(url) {
          const doc = await client.scrape(url, { formats: ["markdown"], onlyMainContent: true });
          const meta = (doc.metadata ?? {}) as { description?: string; ogDescription?: string; url?: string; creditsUsed?: number };
          return { description: meta.description ?? meta.ogDescription ?? null, finalUrl: meta.url ?? null, credits: typeof meta.creditsUsed === "number" ? meta.creditsUsed : 1 };
        },
      }
    : null;
  return { port, webPort };
}

function printRecord(r: RecordResult): void {
  const head = `${r.entity.padEnd(8)} ${r.status.padEnd(14)} ${r.name.slice(0, 40).padEnd(40)} completeness ${r.completenessBefore}% -> ${r.completenessProjected}%`;
  console.error(head);
}

function printReport(rep: JobReport): void {
  const t = rep.totals;
  const c = rep.credits;
  const lines = [
    "",
    `=== ${rep.entity} | mode: ${rep.mode.toUpperCase()} | run ${rep.runId} ===`,
    `scanned ${rep.scanned} rows, selected ${rep.selected}, processed ${t.processed} (stopped: ${rep.stoppedReason})`,
    `enriched ${t.enriched} | unchanged ${t.unchanged} | no_match ${t.noMatch} | ambiguous ${t.ambiguous} | failed ${t.failed} | skipped/planned ${t.skipped}`,
    `fields: ${t.fieldsApplied} ${rep.mode === "apply" ? "applied" : "proposed"}, ${t.fieldsQueuedForReview} queued for review`,
    `completeness avg: ${t.completenessBeforeAvg}% -> ${t.completenessProjectedAvg}% (projected)`,
    `credits: planned base ${c.plannedBase}, planned worst case ${c.plannedWorstCase}, spent ${c.actual}`,
  ];
  for (const [p, s] of Object.entries(c.byProvider)) lines.push(`  ${p}: ${s.calls} calls, ${s.actual} credits spent, ${s.cacheHits} cache hits, ${s.failures} failures, ${s.estimated} estimated`);
  for (const b of rep.blockedProviders) lines.push(`BLOCKED: ${b.provider} requires its terms to be accepted by an organisation admin (${b.termsUrl ?? "Firecrawl dashboard > Data Sources"}). Not accepted automatically.`);
  console.error(lines.join("\n"));
}

async function main(): Promise<void> {
  if (v.help) {
    console.error(readFileSync(new URL(import.meta.url), "utf8").split("*/")[0]);
    return;
  }
  const catalog = loadCatalog();
  const store = makeStore();
  const reports: JobReport[] = [];

  for (const entity of entities()) {
    const options = buildOptions(entity);
    const { port, webPort } = makePorts(options.allowBillable, options.allowWebResearch);
    const report = await runEnrichmentJob(options, { store, catalog, port, webPort, onRecord: printRecord });
    printReport(report);
    reports.push(report);
  }

  const payload = reports.length === 1 ? reports[0] : reports;
  if (v.out) {
    mkdirSync(dirname(v.out as string), { recursive: true });
    writeFileSync(v.out as string, JSON.stringify(payload, null, 2));
    console.error(`report written to ${v.out}`);
  }
  if (v.json) console.log(JSON.stringify(payload, null, 2));
}

main().catch((err) => {
  if (err instanceof OptionsError) die(err.message);
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
