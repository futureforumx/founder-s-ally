/**
 * audit-firm-investor-avatars.ts
 *
 * Classifies every firm_investors.avatar_url row into one of:
 *   valid_r2          — canonical R2 URL, verified
 *   valid_third_party — accessible image on a third-party CDN
 *   malformed         — URL is truncated or unparseable
 *   dead              — HTTP error / timeout
 *   non_image         — returns HTML or non-image content
 *   mismatch_suspect  — filename references a different person's name
 *   missing           — avatar_url IS NULL
 *
 * Outputs:
 *   scripts/audit-results/avatar-audit-<timestamp>.json  — full detail
 *   stdout summary table
 *
 * Usage:
 *   npx tsx scripts/audit-firm-investor-avatars.ts
 *   CONCURRENCY=20 npx tsx scripts/audit-firm-investor-avatars.ts
 *   FIRM_ID=<uuid> npx tsx scripts/audit-firm-investor-avatars.ts   # single firm
 *   LIMIT=100 npx tsx scripts/audit-firm-investor-avatars.ts        # first N rows
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadEnvFiles } from "./lib/loadEnvFiles";
import {
  validateAvatarUrl,
  classifySourceType,
  isTruncatedUrl,
  isWellFormedUrl,
  type AvatarClassification,
} from "./lib/avatarValidation";

loadEnvFiles([".env", ".env.local"]);

// ── Config ────────────────────────────────────────────────────────────────────

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const R2_PUBLIC_BASE = (process.env.CF_R2_PUBLIC_BASE_HEADSHOTS || "").trim();
const CONCURRENCY   = Math.max(1, parseInt(process.env.CONCURRENCY || "10", 10));
const FIRM_ID_FILTER = (process.env.FIRM_ID || "").trim() || null;
const ROW_LIMIT     = parseInt(process.env.LIMIT || "0", 10) || null;

if (!SUPABASE_URL) throw new Error("SUPABASE_URL is not set");
if (!SUPABASE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuditRow {
  id: string;
  firm_id: string;
  full_name: string;
  avatar_url: string | null;
  avatar_source_type: string | null;
  avatar_needs_review: boolean;
  ready_for_live: boolean;
}

interface AuditResult {
  id: string;
  firm_id: string;
  full_name: string;
  avatar_url: string | null;
  classification: AvatarClassification;
  source_type: string;
  content_type?: string;
  size_bytes?: number;
  final_url?: string;
  error_reason?: string;
  is_mismatch_suspect: boolean;
}

// ── Concurrency helpers ───────────────────────────────────────────────────────

async function pool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let idx = 0;
  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("=== Firm Investor Avatar Audit ===\n");

  // Fetch rows
  let query = supabase
    .from("firm_investors")
    .select("id, firm_id, full_name, avatar_url, avatar_source_type, avatar_needs_review, ready_for_live")
    .is("deleted_at", null)
    .order("full_name");

  if (FIRM_ID_FILTER) query = query.eq("firm_id", FIRM_ID_FILTER);
  if (ROW_LIMIT)      query = (query as any).limit(ROW_LIMIT);

  const { data: rows, error } = await query;
  if (error) { console.error("Fetch error:", error.message); process.exit(1); }

  const investors = (rows ?? []) as AuditRow[];
  console.log(`Auditing ${investors.length} investor rows (concurrency=${CONCURRENCY})...\n`);

  const results: AuditResult[] = [];
  let done = 0;

  await pool(investors, CONCURRENCY, async (inv, i) => {
    let result: AuditResult;

    if (!inv.avatar_url) {
      result = {
        id: inv.id,
        firm_id: inv.firm_id,
        full_name: inv.full_name,
        avatar_url: null,
        classification: "missing",
        source_type: "none",
        is_mismatch_suspect: false,
      };
    } else {
      const validation = await validateAvatarUrl(inv.avatar_url, inv.full_name, R2_PUBLIC_BASE);
      result = {
        id: inv.id,
        firm_id: inv.firm_id,
        full_name: inv.full_name,
        avatar_url: inv.avatar_url,
        classification: validation.classification,
        source_type: classifySourceType(inv.avatar_url),
        content_type: validation.contentType,
        size_bytes: validation.sizeBytes,
        final_url: validation.finalUrl,
        error_reason: validation.errorReason,
        is_mismatch_suspect: validation.classification === "mismatch_suspect",
      };
    }

    results[i] = result;
    done++;

    if (done % 50 === 0 || done === investors.length) {
      const counts = countByClass(results.filter(Boolean));
      process.stdout.write(
        `\r  [${done}/${investors.length}]  ` +
        `valid_r2=${counts.valid_r2} third_party=${counts.valid_third_party} ` +
        `malformed=${counts.malformed} dead=${counts.dead} ` +
        `non_image=${counts.non_image} mismatch=${counts.mismatch_suspect} missing=${counts.missing}  `,
      );
    }
  });

  console.log("\n");

  // ── Summary ──────────────────────────────────────────────────────────────────

  const counts = countByClass(results);

  console.log("=== Classification Summary ===");
  console.log(`  valid_r2          : ${counts.valid_r2}`);
  console.log(`  valid_third_party : ${counts.valid_third_party}`);
  console.log(`  malformed         : ${counts.malformed}`);
  console.log(`  dead              : ${counts.dead}`);
  console.log(`  non_image         : ${counts.non_image}`);
  console.log(`  mismatch_suspect  : ${counts.mismatch_suspect}`);
  console.log(`  missing           : ${counts.missing}`);
  console.log(`  TOTAL             : ${results.length}`);

  const needRepair = results.filter((r) =>
    ["malformed", "dead", "non_image", "mismatch_suspect", "missing"].includes(r.classification)
  );
  console.log(`\n  → Needs repair    : ${needRepair.length}`);

  // ── Source-type breakdown ─────────────────────────────────────────────────

  const bySource = new Map<string, number>();
  for (const r of results) {
    bySource.set(r.source_type, (bySource.get(r.source_type) ?? 0) + 1);
  }
  console.log("\n=== Source-type Breakdown ===");
  for (const [src, n] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${src.padEnd(22)}: ${n}`);
  }

  // ── Sample bad rows ───────────────────────────────────────────────────────

  if (needRepair.length > 0) {
    console.log("\n=== Sample Rows Needing Repair (up to 20) ===");
    for (const r of needRepair.slice(0, 20)) {
      console.log(`  [${r.classification.padEnd(18)}] ${r.full_name.padEnd(30)} ${r.avatar_url?.substring(0, 70) ?? "(null)"}`);
      if (r.error_reason) console.log(`    ↳ ${r.error_reason}`);
    }
  }

  // ── Write JSON output ─────────────────────────────────────────────────────

  const outDir = join(process.cwd(), "scripts", "audit-results");
  mkdirSync(outDir, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = join(outDir, `avatar-audit-${ts}.json`);

  const output = {
    generated_at: new Date().toISOString(),
    total: results.length,
    summary: counts,
    needs_repair: needRepair.length,
    results,
  };

  writeFileSync(outPath, JSON.stringify(output, null, 2), "utf8");
  console.log(`\n✓ Full results written to: ${outPath}`);

  // ── SQL audit query ───────────────────────────────────────────────────────

  console.log(`
=== SQL: Audit Remaining Broken Avatar Rows ===
-- Run this in your Supabase SQL editor to see bad rows at any time:

SELECT
  id,
  full_name,
  avatar_url,
  avatar_source_type,
  avatar_confidence,
  avatar_last_verified_at,
  avatar_needs_review,
  CASE
    WHEN avatar_url IS NULL                                     THEN 'missing'
    WHEN avatar_url NOT LIKE 'http%'                            THEN 'malformed'
    WHEN avatar_url LIKE '%website-files.com%'
      AND avatar_url NOT SIMILAR TO '%.(%avif|jpg|jpeg|png|webp|gif|svg)%'
                                                                THEN 'truncated_webflow'
    WHEN avatar_url LIKE '%r2.dev/%'                            THEN 'r2_canonical'
    WHEN avatar_url LIKE '%signal-api.nfx.com%'                 THEN 'nfx_third_party'
    ELSE 'third_party'
  END AS url_class
FROM public.firm_investors
WHERE deleted_at IS NULL
  AND ready_for_live = TRUE
  AND (
    avatar_url IS NULL
    OR avatar_needs_review = TRUE
    OR (
      avatar_url LIKE '%website-files.com%'
      AND avatar_url NOT SIMILAR TO '%.(%avif|jpg|jpeg|png|webp|gif|svg)%'
    )
  )
ORDER BY full_name;
`);
}

function countByClass(rows: AuditResult[]) {
  const counts: Record<AuditClassification, number> = {
    valid_r2: 0,
    valid_third_party: 0,
    malformed: 0,
    dead: 0,
    non_image: 0,
    mismatch_suspect: 0,
    missing: 0,
  };
  for (const r of rows) {
    if (r?.classification) counts[r.classification as AuditClassification] = (counts[r.classification as AuditClassification] ?? 0) + 1;
  }
  return counts;
}

type AuditClassification = AvatarClassification;

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
