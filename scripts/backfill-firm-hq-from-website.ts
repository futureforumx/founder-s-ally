/**
 * Backfill `firm_records` HQ / location by scraping each firm's own `website_url`
 * (same pipeline as POST `/api/firm-website-hq`).
 *
 *   npx tsx scripts/backfill-firm-hq-from-website.ts
 *   DRY_RUN=1 npx tsx scripts/backfill-firm-hq-from-website.ts
 *   HQ_BACKFILL_MAX=300 HQ_BACKFILL_DELAY_MS=450 npx tsx scripts/backfill-firm-hq-from-website.ts
 *   HQ_BACKFILL_READY_ONLY=0 npx tsx scripts/backfill-firm-hq-from-website.ts   # include not-yet-live rows
 *
 * Requires SUPABASE_URL (or VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/loadEnvFiles";
import { handleFirmWebsiteHqPost } from "../api/handleFirmWebsiteHqPost.ts";

loadEnvFiles([".env", ".env.local", ".env.enrichment"]);

const SUPA = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DRY = ["1", "true", "yes"].includes((process.env.DRY_RUN || "").toLowerCase());
const MAX = Math.max(1, parseInt(process.env.HQ_BACKFILL_MAX || "500", 10));
const DELAY_MS = Math.max(0, parseInt(process.env.HQ_BACKFILL_DELAY_MS || "400", 10));
const READY_ONLY = !["0", "false", "no"].includes((process.env.HQ_BACKFILL_READY_ONLY || "1").toLowerCase());
const FORCE = ["1", "true", "yes"].includes((process.env.HQ_BACKFILL_FORCE || "").toLowerCase());

const BLOCKED_HOSTS = new Set([
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "crunchbase.com",
  "angel.co",
  "signal.nfx.com",
  "pitchbook.com",
  "dealroom.co",
  "cbinsights.com",
  "wellfound.com",
  "linktr.ee",
  "notion.site",
]);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function hostnameOk(url: string): boolean {
  try {
    const u = new URL(url.trim().startsWith("http") ? url.trim() : `https://${url.trim()}`);
    const h = u.hostname.replace(/^www\./i, "").toLowerCase();
    if (BLOCKED_HOSTS.has(h)) return false;
    if (h.endsWith(".linkedin.com")) return false;
    return true;
  } catch {
    return false;
  }
}

function missingHq(row: {
  hq_city: string | null;
  location: string | null;
}): boolean {
  const city = (row.hq_city ?? "").trim();
  const loc = (row.location ?? "").trim();
  return !city && !loc;
}

if (!SUPA || !KEY) {
  console.error("Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const sb = createClient(SUPA, KEY, { auth: { persistSession: false } });

async function main() {
  let q = sb
    .from("firm_records")
    .select("id,firm_name,website_url,hq_city,location,ready_for_live")
    .is("deleted_at", null)
    .not("website_url", "is", null);

  if (READY_ONLY) {
    q = q.eq("ready_for_live", true);
  }

  const { data, error } = await q.order("firm_name").limit(Math.min(MAX * 4, 8000));

  if (error) {
    console.error(error);
    process.exit(1);
  }

  const rows = (data ?? []).filter((r) => {
    const w = (r.website_url ?? "").trim();
    if (w.length < 8 || !hostnameOk(w)) return false;
    if (FORCE) return true;
    return missingHq(r);
  });

  const batch = rows.slice(0, MAX);
  console.log(
    `HQ backfill: ${batch.length} firms (${DRY ? "DRY_RUN" : "live"}, delay ${DELAY_MS}ms, max ${MAX}, ready_only=${READY_ONLY}, force=${FORCE})`,
  );

  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of batch) {
    const name = row.firm_name ?? row.id;
    const url = (row.website_url ?? "").trim();
    if (DRY) {
      console.log(`[dry] ${name}  ${url}`);
      ok++;
      continue;
    }

    try {
      const res = await handleFirmWebsiteHqPost({
        firmWebsiteUrl: url,
        firmRecordId: row.id,
      });
      if (res.persisted) {
        ok++;
        console.log(`✓ ${name}  →  ${res.hqLine ?? "(locations json only)"}`);
      } else {
        skipped++;
        console.log(`— ${name}  hqLine=${res.hqLine ?? "null"}  skip=${res.persistSkipped ?? "unknown"}`);
      }
    } catch (e) {
      failed++;
      console.warn(`! ${name}`, e);
    }

    if (DELAY_MS) await sleep(DELAY_MS);
  }

  console.log(`Done. persisted=${ok} no_op_or_skip=${skipped} errors=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
