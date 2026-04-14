/**
 * Batch-mirror remote `firm_investors` headshots to R2 and write canonical URLs back to the DB
 * (same logic as POST /api/mirror-firm-investor-headshots, for every `firm_records` row).
 *
 * Prereqs: SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY, and full R2 headshot
 * env from `isR2HeadshotMirrorConfigured()` in api/_mirrorFirmInvestorHeadshots.ts.
 *
 * Optional env:
 *   MIRROR_ALL_MAX_FIRMS=50     — stop after N firms (smoke test)
 *   MIRROR_ALL_FIRM_PAGE=400  — firm id page size (default 400)
 *
 * For bios/titles/socials from firm websites (separate from R2), run:
 *   npm run db:sync:investor-teams:all
 */

import { loadEnvFiles } from "./lib/loadEnvFiles";

loadEnvFiles([".env", ".env.local", ".env.enrichment"]);

import {
  isR2HeadshotMirrorConfigured,
  mirrorFirmInvestorHeadshotsForFirm,
  supabaseAdminForMirror,
} from "../api/_mirrorFirmInvestorHeadshots.ts";

function eInt(name: string, fallback: number): number {
  const v = parseInt((process.env[name] ?? "").trim(), 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

async function main(): Promise<void> {
  const admin = supabaseAdminForMirror();
  if (!admin) {
    throw new Error("Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
  }
  if (!isR2HeadshotMirrorConfigured()) {
    throw new Error(
      "R2 headshot mirror is not configured. Set CF_R2_* headshot vars (see api/_mirrorFirmInvestorHeadshots.ts).",
    );
  }

  const maxFirms = eInt("MIRROR_ALL_MAX_FIRMS", Number.MAX_SAFE_INTEGER);
  const firmPage = eInt("MIRROR_ALL_FIRM_PAGE", 400);

  let offset = 0;
  let firmsProcessed = 0;
  let totalMirrored = 0;
  let totalFailed = 0;
  let totalCandidates = 0;

  console.log(`mirror-all-investor-headshots-to-r2: maxFirms=${maxFirms === Number.MAX_SAFE_INTEGER ? "∞" : maxFirms} firmPage=${firmPage}`);

  for (;;) {
    if (firmsProcessed >= maxFirms) break;

    const { data: firms, error } = await admin
      .from("firm_records")
      .select("id")
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(offset, offset + firmPage - 1);

    if (error) throw new Error(error.message);
    if (!firms?.length) break;

    for (const row of firms) {
      if (firmsProcessed >= maxFirms) break;
      const firmId = String((row as { id: string }).id);
      const r = await mirrorFirmInvestorHeadshotsForFirm(admin, firmId);
      totalCandidates += r.candidates;
      totalMirrored += r.mirrored;
      totalFailed += r.failed;
      firmsProcessed += 1;
      if (r.candidates > 0) {
        console.log(
          `[${firmsProcessed}] firm ${firmId} candidates=${r.candidates} mirrored=${r.mirrored} failed=${r.failed}`,
        );
      } else if (firmsProcessed % 200 === 0) {
        console.log(`[${firmsProcessed}] firms scanned (no remote headshots pending in last batch)…`);
      }
    }

    offset += firms.length;
    if (firms.length < firmPage) break;
  }

  console.log(
    `\nDone. firms=${firmsProcessed} totalCandidates=${totalCandidates} mirrored=${totalMirrored} failed=${totalFailed}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
