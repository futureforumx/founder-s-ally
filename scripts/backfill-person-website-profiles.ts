/**
 * Crawl each investor's firm website (same logic as POST `/api/person-website-profile`) and
 * persist email, LinkedIn, X, bio, headshot, city/state, and portfolio hints onto `firm_investors`.
 *
 * Usage:
 *   npm run db:backfill:person-website-profiles
 *   DRY_RUN=1 npm run db:backfill:person-website-profiles
 *   INVESTOR_PROFILE_MAX=500 INVESTOR_PROFILE_DELAY_MS=400 npm run db:backfill:person-website-profiles
 *   INVESTOR_PROFILE_MAX=0 npm run db:backfill:person-website-profiles   # unlimited (all matching rows)
 *   INVESTOR_PROFILE_INCOMPLETE_ONLY=0 npm run db:backfill:person-website-profiles   # every row, not only gaps
 *   INVESTOR_PROFILE_FIRM_SLUG=406-ventures npm run db:backfill:person-website-profiles
 *
 * Requires SUPABASE_URL (or VITE_SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/loadEnvFiles";
import { resolvePersonWebsiteProfile } from "../api/_personWebsiteProfile.ts";
import { persistPersonWebsiteProfileToFirmInvestor } from "../api/_persistPersonWebsiteProfileToFirmInvestor.ts";

loadEnvFiles([".env", ".env.local", ".env.enrichment"]);

const SUPA = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const DRY = ["1", "true", "yes"].includes((process.env.DRY_RUN || "").toLowerCase());
const maxRaw = (process.env.INVESTOR_PROFILE_MAX ?? "").trim().toLowerCase();
const MAX =
  maxRaw === "0" || maxRaw === "unlimited" || maxRaw === "all"
    ? Number.POSITIVE_INFINITY
    : Math.max(1, parseInt(process.env.INVESTOR_PROFILE_MAX || "2000", 10));
const PROGRESS_EVERY = Math.max(1, parseInt(process.env.INVESTOR_PROFILE_PROGRESS_EVERY || "25", 10));
const DELAY_MS = Math.max(0, parseInt(process.env.INVESTOR_PROFILE_DELAY_MS || "350", 10));
const PAGE = Math.min(500, Math.max(50, parseInt(process.env.INVESTOR_PROFILE_PAGE_SIZE || "200", 10)));
const INCOMPLETE_ONLY = !["0", "false", "no"].includes(
  (process.env.INVESTOR_PROFILE_INCOMPLETE_ONLY || "1").toLowerCase(),
);
const FIRM_SLUG = (process.env.INVESTOR_PROFILE_FIRM_SLUG || "").trim();

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function safeTrim(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
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

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function isIncompleteRow(r: {
  email: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  bio: string | null;
  background_summary: string | null;
  avatar_url: string | null;
}): boolean {
  return (
    !safeTrim(r.email) ||
    !safeTrim(r.linkedin_url) ||
    !safeTrim(r.x_url) ||
    !safeTrim(r.bio) ||
    !safeTrim(r.background_summary) ||
    !safeTrim(r.avatar_url)
  );
}

type FirmMapRow = { id: string; website_url: string | null; slug: string | null };

type InvRow = {
  id: string;
  firm_id: string;
  full_name: string | null;
  title: string | null;
  email: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  bio: string | null;
  background_summary: string | null;
  avatar_url: string | null;
};

if (!SUPA || !KEY) {
  console.error("Set SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const sb = createClient(SUPA, KEY, { auth: { persistSession: false } });

async function loadFirmWebsiteById(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  let from = 0;
  const batch = 1000;
  for (;;) {
    let q = sb
      .from("firm_records")
      .select("id, website_url, slug")
      .is("deleted_at", null)
      .not("website_url", "is", null)
      .range(from, from + batch - 1);
    if (FIRM_SLUG) q = q.eq("slug", FIRM_SLUG);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as FirmMapRow[];
    for (const r of rows) {
      const w = normalizeWebsiteUrl(r.website_url ?? "");
      if (w) out.set(r.id, w);
    }
    if (rows.length < batch) break;
    from += batch;
  }
  return out;
}

async function main() {
  const firmWebsites = await loadFirmWebsiteById();
  if (firmWebsites.size === 0) {
    console.error("No firm_records with website_url" + (FIRM_SLUG ? ` (slug=${FIRM_SLUG})` : "") + ".");
    process.exit(1);
  }

  const maxLabel = Number.isFinite(MAX) ? String(MAX) : "unlimited";
  console.log(
    `[person-profile-backfill] start ${new Date().toISOString()} firms_with_website=${firmWebsites.size} max=${maxLabel} delay_ms=${DELAY_MS} incomplete_only=${INCOMPLETE_ONLY} dry=${DRY}`,
  );

  let scanned = 0;
  let considered = 0;
  let enriched = 0;
  let changed = 0;
  let skippedNoSite = 0;
  let skippedFilter = 0;
  let failed = 0;
  let emptyProfile = 0;

  const firmIdBatches = chunk([...firmWebsites.keys()], 80);

  outer: for (const firmIdBatch of firmIdBatches) {
    let rangeStart = 0;
    for (;;) {
      const { data, error } = await sb
        .from("firm_investors")
        .select(
          "id, firm_id, full_name, title, email, linkedin_url, x_url, bio, background_summary, avatar_url",
        )
        .is("deleted_at", null)
        .in("firm_id", firmIdBatch)
        .order("id")
        .range(rangeStart, rangeStart + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as InvRow[];
      if (!rows.length) break;

      for (const inv of rows) {
        if (considered >= MAX) break outer;
        scanned += 1;
        const website = firmWebsites.get(inv.firm_id);
        if (!website) {
          skippedNoSite += 1;
          continue;
        }
        const name = safeTrim(inv.full_name);
        if (!name) continue;

        if (INCOMPLETE_ONLY && !isIncompleteRow(inv)) {
          skippedFilter += 1;
          continue;
        }
        considered += 1;

        const capLabel = Number.isFinite(MAX) ? String(MAX) : "∞";
        const label = `${considered}/${capLabel} ${name}`;

        if (!DRY && considered % PROGRESS_EVERY === 0) {
          console.log(
            `[person-profile-backfill] progress ${new Date().toISOString()} considered=${considered} enriched=${enriched} patched=${changed} empty=${emptyProfile} failed=${failed}`,
          );
        }
        if (DRY) {
          console.log(`[dry] ${label}  ${website}`);
          if (DELAY_MS) await sleep(DELAY_MS);
          continue;
        }

        try {
          const profile = await resolvePersonWebsiteProfile({
            firmWebsiteUrl: website,
            fullName: name,
            title: safeTrim(inv.title) || null,
          });
          const hasPayload =
            safeTrim(profile.email) ||
            safeTrim(profile.linkedinUrl) ||
            safeTrim(profile.xUrl) ||
            safeTrim(profile.bio) ||
            safeTrim(profile.headshotUrl) ||
            (profile.portfolioCompanies?.length ?? 0) > 0;
          if (!hasPayload) {
            emptyProfile += 1;
            console.log(`— ${label}  (no extractable profile from site)`);
          } else {
            enriched += 1;
            const { changed: did } = await persistPersonWebsiteProfileToFirmInvestor(sb, inv.id, profile);
            if (did) changed += 1;
            console.log(`✓ ${label}  db_write=${did ? "yes" : "no"}  urls=${profile.scannedUrls?.length ?? 0}`);
          }
        } catch (e) {
          failed += 1;
          console.warn(`! ${label}`, e);
        }

        if (DELAY_MS) await sleep(DELAY_MS);
      }

      if (rows.length < PAGE) break;
      rangeStart += PAGE;
    }
  }

  console.log(
    `[person-profile-backfill] done ${new Date().toISOString()} scanned=${scanned} considered=${considered} enriched=${enriched} db_patched=${changed} empty_profile=${emptyProfile} skipped_no_site=${skippedNoSite} skipped_complete=${skippedFilter} failed=${failed}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
