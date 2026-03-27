#!/usr/bin/env tsx
/**
 * clone_storage.ts
 *
 * Migrates Supabase Storage buckets and objects from a source project to a
 * destination project.
 *
 * Required environment variables:
 *   SRC_SUPABASE_URL              – Source project URL
 *   SRC_SUPABASE_SERVICE_ROLE_KEY – Source service role key
 *   DST_SUPABASE_URL              – Destination project URL
 *   DST_SUPABASE_SERVICE_ROLE_KEY – Destination service role key
 *
 * Optional:
 *   DRY_RUN=true       – Print actions without making changes
 *   CONCURRENCY        – Parallel object transfers (default 5)
 *   BUCKET_FILTER      – Comma-separated bucket names to migrate (default: all)
 *
 * Outputs: migrated_storage.json
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

// ── Config ───────────────────────────────────────────────────────────────────

const DRY_RUN = process.env.DRY_RUN === "true";
const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? "5", 10);
const BUCKET_FILTER = process.env.BUCKET_FILTER
  ? new Set(process.env.BUCKET_FILTER.split(",").map((b) => b.trim()))
  : null;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`ERROR: Missing required environment variable: ${name}`);
    process.exit(1);
  }
  return value;
}

const SRC_URL = requireEnv("SRC_SUPABASE_URL");
const SRC_KEY = requireEnv("SRC_SUPABASE_SERVICE_ROLE_KEY");
const DST_URL = requireEnv("DST_SUPABASE_URL");
const DST_KEY = requireEnv("DST_SUPABASE_SERVICE_ROLE_KEY");

// ── Clients ──────────────────────────────────────────────────────────────────

const srcClient = createClient(SRC_URL, SRC_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const dstClient = createClient(DST_URL, DST_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Types ────────────────────────────────────────────────────────────────────

interface ObjectReport {
  bucket: string;
  path: string;
  status: "copied" | "skipped" | "failed";
  error?: string;
  bytes?: number;
}

interface BucketReport {
  bucket: string;
  status: "created" | "existing" | "failed";
  error?: string;
  objects_total: number;
  objects_copied: number;
  objects_skipped: number;
  objects_failed: number;
}

interface Report {
  dry_run: boolean;
  timestamp: string;
  buckets_total: number;
  buckets_created: number;
  buckets_existing: number;
  buckets_failed: number;
  objects_total: number;
  objects_copied: number;
  objects_skipped: number;
  objects_failed: number;
  buckets: BucketReport[];
  failures: ObjectReport[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively list all object paths in a bucket/folder.
 */
async function listObjectsRecursive(
  bucket: string,
  prefix: string = ""
): Promise<{ name: string; metadata: Record<string, unknown> | null }[]> {
  const PAGE_SIZE = 1000;
  const results: { name: string; metadata: Record<string, unknown> | null }[] =
    [];
  let offset = 0;

  while (true) {
    const { data, error } = await srcClient.storage
      .from(bucket)
      .list(prefix, { limit: PAGE_SIZE, offset });

    if (error) throw new Error(`list("${bucket}", "${prefix}"): ${error.message}`);
    if (!data || data.length === 0) break;

    for (const item of data) {
      const fullPath = prefix ? `${prefix}/${item.name}` : item.name;

      if (item.metadata === null && !item.id) {
        // Folder — recurse
        const nested = await listObjectsRecursive(bucket, fullPath);
        results.push(...nested);
      } else {
        results.push({
          name: fullPath,
          metadata: item.metadata as Record<string, unknown> | null,
        });
      }
    }

    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return results;
}

/**
 * Simple concurrency limiter – runs tasks with at most `limit` in flight.
 */
async function withConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number
): Promise<T[]> {
  const results: T[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () =>
    worker()
  );
  await Promise.all(workers);
  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== Supabase Storage Migration ===`);
  console.log(`Source:      ${SRC_URL}`);
  console.log(`Destination: ${DST_URL}`);
  console.log(`Dry run:     ${DRY_RUN}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  if (BUCKET_FILTER) console.log(`Bucket filter: ${Array.from(BUCKET_FILTER).join(", ")}`);
  console.log("");

  const report: Report = {
    dry_run: DRY_RUN,
    timestamp: new Date().toISOString(),
    buckets_total: 0,
    buckets_created: 0,
    buckets_existing: 0,
    buckets_failed: 0,
    objects_total: 0,
    objects_copied: 0,
    objects_skipped: 0,
    objects_failed: 0,
    buckets: [],
    failures: [],
  };

  // ── List source buckets ───────────────────────────────────────────────────

  const { data: srcBuckets, error: listErr } =
    await srcClient.storage.listBuckets();

  if (listErr) {
    console.error("ERROR: Failed to list source buckets:", listErr.message);
    process.exit(1);
  }

  const bucketsToMigrate = (srcBuckets ?? []).filter(
    (b) => !BUCKET_FILTER || BUCKET_FILTER.has(b.name)
  );

  report.buckets_total = bucketsToMigrate.length;
  console.log(`Found ${bucketsToMigrate.length} bucket(s) to migrate.\n`);

  // ── List destination buckets (for idempotency) ────────────────────────────

  const { data: dstBuckets } = await dstClient.storage.listBuckets();
  const existingDstBuckets = new Set(
    (dstBuckets ?? []).map((b) => b.name)
  );

  // ── Process each bucket ───────────────────────────────────────────────────

  for (const bucket of bucketsToMigrate) {
    console.log(`── Bucket: ${bucket.name} ──`);

    const bucketReport: BucketReport = {
      bucket: bucket.name,
      status: "existing",
      objects_total: 0,
      objects_copied: 0,
      objects_skipped: 0,
      objects_failed: 0,
    };

    // Create bucket in destination if missing
    if (!existingDstBuckets.has(bucket.name)) {
      if (DRY_RUN) {
        console.log(`  DRY_RUN: would create bucket "${bucket.name}"`);
        bucketReport.status = "created";
      } else {
        const { error: createErr } = await dstClient.storage.createBucket(
          bucket.name,
          {
            public: bucket.public,
            allowedMimeTypes: bucket.allowed_mime_types ?? undefined,
            fileSizeLimit: bucket.file_size_limit ?? undefined,
          }
        );

        if (createErr) {
          // May already exist if another run created it
          if (createErr.message.toLowerCase().includes("already exists")) {
            console.log(`  Bucket already exists (skipping creation).`);
            bucketReport.status = "existing";
          } else {
            console.error(`  ERROR creating bucket: ${createErr.message}`);
            bucketReport.status = "failed";
            bucketReport.error = createErr.message;
            report.buckets_failed++;
            report.buckets.push(bucketReport);
            continue;
          }
        } else {
          console.log(`  Created bucket "${bucket.name}" (public=${bucket.public}).`);
          bucketReport.status = "created";
          report.buckets_created++;
        }
      }
    } else {
      console.log(`  Bucket already exists in destination.`);
      report.buckets_existing++;
    }

    // ── List objects ──────────────────────────────────────────────────────

    console.log(`  Listing objects…`);
    let objects: Awaited<ReturnType<typeof listObjectsRecursive>>;
    try {
      objects = await listObjectsRecursive(bucket.name);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ERROR listing objects: ${msg}`);
      bucketReport.status = "failed";
      bucketReport.error = msg;
      report.buckets_failed++;
      report.buckets.push(bucketReport);
      continue;
    }

    console.log(`  Found ${objects.length} object(s).`);
    bucketReport.objects_total = objects.length;
    report.objects_total += objects.length;

    if (objects.length === 0) {
      report.buckets.push(bucketReport);
      continue;
    }

    // ── Transfer objects with concurrency ─────────────────────────────────

    const tasks = objects.map((obj) => async (): Promise<ObjectReport> => {
      const objPath = obj.name;

      if (DRY_RUN) {
        process.stdout.write(".");
        return { bucket: bucket.name, path: objPath, status: "skipped" };
      }

      // Download from source
      const { data: blob, error: dlErr } = await srcClient.storage
        .from(bucket.name)
        .download(objPath);

      if (dlErr) {
        return {
          bucket: bucket.name,
          path: objPath,
          status: "failed",
          error: `download: ${dlErr.message}`,
        };
      }

      // Determine content-type
      const contentType =
        (obj.metadata?.mimetype as string | undefined) ??
        "application/octet-stream";

      // Upload to destination (upsert so re-runs are idempotent)
      const { error: ulErr } = await dstClient.storage
        .from(bucket.name)
        .upload(objPath, blob, {
          contentType,
          upsert: true,
          cacheControl: (obj.metadata?.cacheControl as string | undefined) ?? "3600",
        });

      if (ulErr) {
        return {
          bucket: bucket.name,
          path: objPath,
          status: "failed",
          error: `upload: ${ulErr.message}`,
        };
      }

      process.stdout.write(".");
      return {
        bucket: bucket.name,
        path: objPath,
        status: "copied",
        bytes: blob.size,
      };
    });

    const results = await withConcurrency(tasks, CONCURRENCY);
    process.stdout.write("\n");

    for (const r of results) {
      if (r.status === "copied") {
        bucketReport.objects_copied++;
        report.objects_copied++;
      } else if (r.status === "failed") {
        bucketReport.objects_failed++;
        report.objects_failed++;
        report.failures.push(r);
        console.error(`  FAIL: ${r.path} — ${r.error}`);
      } else {
        bucketReport.objects_skipped++;
        report.objects_skipped++;
      }
    }

    console.log(
      `  Done: ${bucketReport.objects_copied} copied, ${bucketReport.objects_skipped} skipped, ${bucketReport.objects_failed} failed.`
    );
    report.buckets.push(bucketReport);
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  console.log("\n=== Storage Migration Complete ===");
  console.log(`Buckets — total: ${report.buckets_total}, created: ${report.buckets_created}, existing: ${report.buckets_existing}, failed: ${report.buckets_failed}`);
  console.log(`Objects — total: ${report.objects_total}, copied: ${report.objects_copied}, skipped: ${report.objects_skipped}, failed: ${report.objects_failed}`);

  if (report.objects_failed > 0) {
    console.warn("\n⚠️  Some objects failed — see migrated_storage.json for details.");
  }

  writeReport(report);
}

function writeReport(report: Report) {
  const path = "migrated_storage.json";
  writeFileSync(path, JSON.stringify(report, null, 2));
  console.log(`\nReport written to ${path}`);
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
