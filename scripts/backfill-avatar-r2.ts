/**
 * backfill-avatar-r2.ts
 *
 * Repair/backfill script that canonicalizes all investor headshots into R2.
 *
 * Finds all firm_investors rows where avatar_url is:
 *   - null (but avatar_source_url has a value we can try)
 *   - a third-party URL (Signal, LinkedIn, Twitter, etc.)
 *   - malformed / truncated
 *   - already R2 (skipped)
 *
 * For each candidate:
 *   1. Fetch the source image
 *   2. Validate it's a real image (magic bytes)
 *   3. Upload to CF R2 bucket
 *   4. Write the R2 URL into avatar_url
 *   5. Preserve original in avatar_source_url + avatar_source_type
 *
 * Also processes vc_people (Prisma) in the same pass.
 *
 * Usage:
 *   tsx scripts/backfill-avatar-r2.ts
 *   BACKFILL_MAX=50 BACKFILL_DRY_RUN=1 tsx scripts/backfill-avatar-r2.ts
 *
 * Env vars:
 *   CF_R2_ACCOUNT_ID, CF_R2_ACCESS_KEY_ID, CF_R2_SECRET_ACCESS_KEY,
 *   CF_R2_BUCKET_HEADSHOTS, CF_R2_PUBLIC_URL
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   DATABASE_URL (for Prisma vc_people)
 *   BACKFILL_MAX        — max rows to process (default: 2000)
 *   BACKFILL_DRY_RUN    — 1 to log without writing (default: 0)
 *   BACKFILL_DELAY_MS   — delay between fetches (default: 200)
 *   BACKFILL_TARGET     — "supabase", "prisma", or "both" (default: "both")
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "@prisma/client";
import {
  fetchAndUploadHeadshot,
  isThirdPartyAvatarUrl,
  isR2AvatarUrl,
  isMalformedUrl,
} from "./lib/r2-headshots";

// ---------------------------------------------------------------------------
// Env loading
// ---------------------------------------------------------------------------

function loadEnv(): void {
  const root = process.cwd();
  for (const name of [".env", ".env.local"]) {
    const p = join(root, name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (!m) continue;
      if (process.env[m[1]] !== undefined) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}

loadEnv();

const MAX = Math.max(1, parseInt(process.env.BACKFILL_MAX || "2000", 10));
const DRY_RUN = process.env.BACKFILL_DRY_RUN === "1";
const DELAY_MS = Math.max(0, parseInt(process.env.BACKFILL_DELAY_MS || "200", 10));
const TARGET = (process.env.BACKFILL_TARGET || "both").toLowerCase();

async function sleep(ms: number) {
  if (ms > 0) await new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Source type detection
// ---------------------------------------------------------------------------

function detectSourceType(url: string): string {
  const u = url.toLowerCase();
  if (u.includes("signal.nfx.com") || u.includes("nfx.com")) return "signal_nfx";
  if (u.includes("linkedin.com") || u.includes("licdn.com")) return "linkedin";
  if (u.includes("twimg.com") || u.includes("twitter.com") || u.includes("x.com")) return "x_twitter";
  if (u.includes("github")) return "github";
  if (u.includes("gravatar")) return "gravatar";
  if (u.includes("googleusercontent")) return "google";
  return "other";
}

// ---------------------------------------------------------------------------
// Summary counters
// ---------------------------------------------------------------------------

type Summary = {
  scanned: number;
  uploaded: number;
  db_updated: number;
  skipped_already_r2: number;
  skipped_no_source: number;
  skipped_dry_run: number;
  errors: number;
  review_needed: string[];
};

function newSummary(): Summary {
  return {
    scanned: 0,
    uploaded: 0,
    db_updated: 0,
    skipped_already_r2: 0,
    skipped_no_source: 0,
    skipped_dry_run: 0,
    errors: 0,
    review_needed: [],
  };
}

function printSummary(label: string, s: Summary) {
  console.log(`\n── ${label} Summary ──`);
  console.log(`  Scanned:            ${s.scanned}`);
  console.log(`  Uploaded to R2:     ${s.uploaded}`);
  console.log(`  DB rows updated:    ${s.db_updated}`);
  console.log(`  Skipped (already R2): ${s.skipped_already_r2}`);
  console.log(`  Skipped (no source):  ${s.skipped_no_source}`);
  if (DRY_RUN) console.log(`  Skipped (dry run):  ${s.skipped_dry_run}`);
  console.log(`  Errors:             ${s.errors}`);
  if (s.review_needed.length) {
    console.log(`  Review needed (${s.review_needed.length}):`);
    for (const r of s.review_needed.slice(0, 20)) console.log(`    - ${r}`);
    if (s.review_needed.length > 20) console.log(`    ... and ${s.review_needed.length - 20} more`);
  }
}

// ---------------------------------------------------------------------------
// Supabase backfill: firm_investors
// ---------------------------------------------------------------------------

async function backfillSupabase(summary: Summary) {
  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn("  Skipping Supabase backfill: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.");
    return;
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

  // Fetch rows that need processing:
  // avatar_url is null OR is a third-party URL OR avatar_source_url is set but avatar_url is empty
  const { data: rows, error: loadErr } = await supabase
    .from("firm_investors")
    .select("id, full_name, avatar_url, avatar_source_url, avatar_source_type")
    .limit(MAX)
    .order("updated_at", { ascending: true });

  if (loadErr) {
    console.error("  Failed to load firm_investors:", loadErr.message);
    summary.errors++;
    return;
  }

  if (!rows?.length) {
    console.log("  No firm_investors rows found.");
    return;
  }

  console.log(`  Found ${rows.length} firm_investors rows to evaluate`);

  for (const row of rows) {
    if (summary.scanned >= MAX) break;
    summary.scanned++;

    const currentUrl = row.avatar_url?.trim() || null;

    // Already R2 → skip
    if (currentUrl && isR2AvatarUrl(currentUrl)) {
      summary.skipped_already_r2++;
      continue;
    }

    // Determine source URL to fetch from
    const sourceUrl = currentUrl && !isMalformedUrl(currentUrl) ? currentUrl : row.avatar_source_url?.trim() || null;

    if (!sourceUrl) {
      summary.skipped_no_source++;
      continue;
    }

    const sourceType = row.avatar_source_type || detectSourceType(sourceUrl);

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would process: ${row.full_name} — ${sourceUrl}`);
      summary.skipped_dry_run++;
      continue;
    }

    // Fetch, validate, upload
    const result = await fetchAndUploadHeadshot(sourceUrl, row.id, { skipIfExists: true });

    if (!result.success) {
      console.warn(`  ✗ ${row.full_name}: ${result.error}`);
      summary.errors++;
      summary.review_needed.push(`${row.id} (${row.full_name}): ${result.error}`);
      continue;
    }

    summary.uploaded++;

    // Update DB
    const { error: updateErr } = await supabase
      .from("firm_investors")
      .update({
        avatar_url: result.r2_url,
        avatar_source_url: sourceUrl,
        avatar_source_type: sourceType,
        avatar_last_verified_at: new Date().toISOString(),
        avatar_confidence: 0.8,
      })
      .eq("id", row.id);

    if (updateErr) {
      console.warn(`  ✗ DB update ${row.full_name}: ${updateErr.message}`);
      summary.errors++;
    } else {
      summary.db_updated++;
      console.log(`  ✓ ${row.full_name} → ${result.r2_url}`);
    }

    await sleep(DELAY_MS);
  }
}

// ---------------------------------------------------------------------------
// Prisma backfill: vc_people
// ---------------------------------------------------------------------------

async function backfillPrisma(summary: Summary) {
  if (!process.env.DATABASE_URL) {
    console.warn("  Skipping Prisma backfill: DATABASE_URL not set.");
    return;
  }

  const prisma = new PrismaClient();

  try {
    const people = await prisma.vCPerson.findMany({
      where: { deleted_at: null },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        avatar_url: true,
        avatar_source_url: true,
        avatar_source_type: true,
      },
      take: MAX,
      orderBy: { updated_at: "asc" },
    });

    console.log(`  Found ${people.length} vc_people rows to evaluate`);

    for (const person of people) {
      if (summary.scanned >= MAX) break;
      summary.scanned++;

      const currentUrl = person.avatar_url?.trim() || null;

      if (currentUrl && isR2AvatarUrl(currentUrl)) {
        summary.skipped_already_r2++;
        continue;
      }

      const sourceUrl =
        currentUrl && !isMalformedUrl(currentUrl)
          ? currentUrl
          : person.avatar_source_url?.trim() || null;

      if (!sourceUrl) {
        summary.skipped_no_source++;
        continue;
      }

      const sourceType = person.avatar_source_type || detectSourceType(sourceUrl);

      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would process: ${person.first_name} ${person.last_name} — ${sourceUrl}`);
        summary.skipped_dry_run++;
        continue;
      }

      const result = await fetchAndUploadHeadshot(sourceUrl, person.id, { skipIfExists: true });

      if (!result.success) {
        console.warn(`  ✗ ${person.first_name} ${person.last_name}: ${result.error}`);
        summary.errors++;
        summary.review_needed.push(
          `${person.id} (${person.first_name} ${person.last_name}): ${result.error}`
        );
        continue;
      }

      summary.uploaded++;

      try {
        await prisma.vCPerson.update({
          where: { id: person.id },
          data: {
            avatar_url: result.r2_url,
            avatar_source_url: sourceUrl,
            avatar_source_type: sourceType,
            avatar_last_verified_at: new Date(),
            avatar_confidence: 0.8,
          },
        });
        summary.db_updated++;
        console.log(`  ✓ ${person.first_name} ${person.last_name} → ${result.r2_url}`);
      } catch (e) {
        console.warn(
          `  ✗ Prisma update ${person.first_name} ${person.last_name}: ${e instanceof Error ? e.message : e}`
        );
        summary.errors++;
      }

      await sleep(DELAY_MS);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\n═══ Avatar R2 Backfill ═══`);
  console.log(`  Max: ${MAX}, Delay: ${DELAY_MS}ms, Dry run: ${DRY_RUN}, Target: ${TARGET}`);

  if (TARGET === "supabase" || TARGET === "both") {
    console.log(`\n── Supabase: firm_investors ──`);
    const summary = newSummary();
    await backfillSupabase(summary);
    printSummary("Supabase firm_investors", summary);
  }

  if (TARGET === "prisma" || TARGET === "both") {
    console.log(`\n── Prisma: vc_people ──`);
    const summary = newSummary();
    await backfillPrisma(summary);
    printSummary("Prisma vc_people", summary);
  }

  console.log("\n✅ Backfill complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
