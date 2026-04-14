/**
 * Backfill `firm_investors` from firm websites using the same resolver as
 * POST `/api/firm-website-team`.
 *
 * Usage:
 *   npm run db:backfill:firm-investors-website
 *   DRY_RUN=1 npm run db:backfill:firm-investors-website
 *   INVESTOR_BACKFILL_MAX=2000 INVESTOR_BACKFILL_DELAY_MS=500 npm run db:backfill:firm-investors-website
 *   INVESTOR_BACKFILL_START_OFFSET=2000 npm run db:backfill:firm-investors-website
 *   INVESTOR_BACKFILL_FORCE_REFRESH=1 npm run db:backfill:firm-investors-website
 *   INVESTOR_BACKFILL_READY_ONLY=0 npm run db:backfill:firm-investors-website
 *
 * Requires SUPABASE_URL (or VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/loadEnvFiles";
import { resolveFirmWebsiteTeam } from "../api/_firmWebsiteTeam.ts";

loadEnvFiles([".env", ".env.local", ".env.enrichment"]);

const SUPA = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const DRY = ["1", "true", "yes"].includes((process.env.DRY_RUN || "").toLowerCase());
const MAX = Math.max(1, parseInt(process.env.INVESTOR_BACKFILL_MAX || "5000", 10));
const START_OFFSET = Math.max(0, parseInt(process.env.INVESTOR_BACKFILL_START_OFFSET || "0", 10));
const DELAY_MS = Math.max(0, parseInt(process.env.INVESTOR_BACKFILL_DELAY_MS || "300", 10));
const READY_ONLY = !["0", "false", "no"].includes(
  (process.env.INVESTOR_BACKFILL_READY_ONLY || "1").toLowerCase(),
);
const FORCE_REFRESH = ["1", "true", "yes"].includes(
  (process.env.INVESTOR_BACKFILL_FORCE_REFRESH || "").toLowerCase(),
);

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

function normalizeWebsiteUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(/^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

function hostnameOk(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    if (!host) return false;
    if (BLOCKED_HOSTS.has(host)) return false;
    if (host.endsWith(".linkedin.com")) return false;
    return true;
  } catch {
    return false;
  }
}

if (!SUPA || !KEY) {
  console.error("Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const sb = createClient(SUPA, KEY, { auth: { persistSession: false } });

type FirmRow = {
  id: string;
  firm_name: string | null;
  website_url: string | null;
  ready_for_live: boolean | null;
};

async function main() {
  let q = sb
    .from("firm_records")
    .select("id,firm_name,website_url,ready_for_live")
    .is("deleted_at", null)
    .not("website_url", "is", null);

  if (READY_ONLY) q = q.eq("ready_for_live", true);

  const fetchLimit = Math.min(Math.max(MAX + START_OFFSET + 500, 2000), 50000);
  const { data, error } = await q.order("firm_name").limit(fetchLimit);
  if (error) {
    console.error(error);
    process.exit(1);
  }

  const allRows = (data ?? []) as FirmRow[];
  const normalizedRows = allRows
    .map((row) => {
      const normalized = normalizeWebsiteUrl(row.website_url ?? "");
      if (!normalized || !hostnameOk(normalized)) return null;
      return {
        id: row.id,
        firm_name: row.firm_name ?? row.id,
        website_url: normalized,
      };
    })
    .filter((row): row is { id: string; firm_name: string; website_url: string } => Boolean(row));

  const batch = normalizedRows.slice(START_OFFSET, START_OFFSET + MAX);

  console.log(
    `Investor backfill: firms=${batch.length} (${DRY ? "DRY_RUN" : "live"}) start_offset=${START_OFFSET} max=${MAX} delay_ms=${DELAY_MS} ready_only=${READY_ONLY} force_refresh=${FORCE_REFRESH}`,
  );

  let processed = 0;
  let withPeople = 0;
  let zeroPeople = 0;
  let failed = 0;
  let totalPeople = 0;

  for (const row of batch) {
    processed += 1;
    const label = `${processed}/${batch.length} ${row.firm_name}`;
    if (DRY) {
      console.log(`[dry] ${label}  ${row.website_url}`);
      continue;
    }

    try {
      const result = await resolveFirmWebsiteTeam(row.website_url, { forceRefresh: FORCE_REFRESH });
      const peopleCount = result.people.length;
      totalPeople += peopleCount;
      if (peopleCount > 0) {
        withPeople += 1;
        console.log(`✓ ${label}  people=${peopleCount} estimate=${result.teamMemberEstimate}`);
      } else {
        zeroPeople += 1;
        console.log(`— ${label}  people=0 estimate=${result.teamMemberEstimate}`);
      }
    } catch (e) {
      failed += 1;
      console.warn(`! ${label}`, e);
    }

    if (DELAY_MS) await sleep(DELAY_MS);
  }

  console.log(
    `Done. processed=${processed} with_people=${withPeople} zero_people=${zeroPeople} failed=${failed} total_people_found=${totalPeople}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

