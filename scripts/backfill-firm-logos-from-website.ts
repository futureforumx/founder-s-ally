/**
 * Backfill firm_records.logo_url when it is empty or a third-party favicon proxy
 * (e.g. Google gstatic globe). Probes the firm's website for apple-touch-icon and
 * favicon.ico, then PATCHes the first URL that returns an image.
 *
 *   npx tsx scripts/backfill-firm-logos-from-website.ts
 *   DRY_RUN=1 npx tsx scripts/backfill-firm-logos-from-website.ts
 *   LOGO_BACKFILL_MAX=500 LOGO_BACKFILL_DELAY_MS=400 npx tsx scripts/backfill-firm-logos-from-website.ts
 *
 * website_url must be the *firm's own* domain. If it points at nfx.com, LinkedIn,
 * Crunchbase, etc., we skip (otherwise you'd save the aggregator's favicon).
 *
 * Undo mistaken NFX (etc.) logos from an earlier run:
 *   LOGO_BACKFILL_REVERT_AGGREGATOR_LOGOS=1 pnpm db:backfill:firm-logos-website
 */

import { createClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/loadEnvFiles";

loadEnvFiles([".env", ".env.local", ".env.enrichment"]);

/** Keep in sync with src/lib/firmLogoUrl.ts — scripts cannot rely on @/ path alias here. */
const PROXY_LOGO_RE =
  /gstatic\.com\/faviconV2|google\.com\/s2\/favicons|googleusercontent\.com\/favicon|unavatar\.io|icon\.horse|clearbit\.com\/logo|duckduckgo\.com\/ip3\//i;

function isProxyLogoUrl(url: string | null | undefined): boolean {
  const t = (url ?? "").trim();
  if (!t) return false;
  return PROXY_LOGO_RE.test(t);
}

const SUPA = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const DRY = ["1", "true", "yes"].includes((process.env.DRY_RUN || process.env.LOGO_BACKFILL_DRY_RUN || "").toLowerCase());
const MAX = Math.max(1, parseInt(process.env.LOGO_BACKFILL_MAX || "2000", 10));
const DELAY_MS = Math.max(0, parseInt(process.env.LOGO_BACKFILL_DELAY_MS || "350", 10));
const REVERT_AGGREGATOR = ["1", "true", "yes"].includes(
  (process.env.LOGO_BACKFILL_REVERT_AGGREGATOR_LOGOS || "").toLowerCase(),
);

if (!SUPA || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPA, KEY, { auth: { persistSession: false } });

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Hosts that are not the firm's own site — never probe these for logo_url. */
const BLOCKED_WEBSITE_HOSTS = new Set([
  "linkedin.com",
  "twitter.com",
  "x.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "linktr.ee",
  "notion.site",
  "crunchbase.com",
  "angel.co",
  "tracxn.com",
  "pitchbook.com",
  "dealroom.co",
  "cbinsights.com",
  "app.cbinsights.com",
  "signal.nfx.com",
  "wellfound.com",
  "f6s.com",
  "golden.com",
  "owler.com",
  "nfx.com", // company pages often stored as nfx.com/... — favicon is NFX's, not the portfolio co
]);

function isBlockedWebsiteHost(host: string): boolean {
  const h = host.toLowerCase();
  if (BLOCKED_WEBSITE_HOSTS.has(h)) return true;
  if (h.endsWith(".linkedin.com")) return true;
  return false;
}

function hostnameFromWebsite(websiteUrl: string): string | null {
  try {
    const u = websiteUrl.trim();
    if (!u) return null;
    const url = new URL(u.startsWith("http") ? u : `https://${u}`);
    return url.hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function candidateLogoUrls(host: string): string[] {
  const origin = `https://${host}`;
  return [
    `${origin}/apple-touch-icon.png`,
    `${origin}/apple-touch-icon-precomposed.png`,
    `${origin}/favicon.ico`,
  ];
}

async function probeImageUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(18_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; VEKTA-LogoBackfill/1.0)" },
    });
    if (!res.ok) return false;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("image/")) return true;
    if (url.endsWith(".ico") && (ct.includes("octet-stream") || ct === "")) return true;
    return false;
  } catch {
    return false;
  }
}

async function firstWorkingLogo(host: string): Promise<string | null> {
  for (const url of candidateLogoUrls(host)) {
    if (await probeImageUrl(url)) return url;
    await sleep(80);
  }
  return null;
}

type Row = { id: string; firm_name: string; website_url: string | null; logo_url: string | null };

function logoUrlHost(logoUrl: string): string | null {
  try {
    return new URL(logoUrl.trim()).hostname.replace(/^www\./i, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

/** Clear logo_url when website points at an aggregator and the saved logo came from that same host (bad backfill). */
async function revertAggregatorLogos(): Promise<number> {
  const { data: rows, error } = await sb
    .from("firm_records")
    .select("id,firm_name,website_url,logo_url")
    .is("deleted_at", null)
    .not("logo_url", "is", null);

  if (error) {
    console.error("revert query:", error.message);
    return 0;
  }

  let cleared = 0;
  for (const row of rows ?? []) {
    const wh = row.website_url ? hostnameFromWebsite(row.website_url) : null;
    if (!wh || !isBlockedWebsiteHost(wh)) continue;

    const lh = row.logo_url ? logoUrlHost(row.logo_url) : null;
    if (!lh) continue;

    const sameHost = lh === wh || lh.endsWith(`.${wh}`) || wh.endsWith(`.${lh}`);
    if (!sameHost) continue;

    if (DRY) {
      console.log(`  [DRY REVERT] ${row.firm_name} — clear logo_url (was ${row.logo_url})`);
      cleared++;
      continue;
    }

    const { error: upErr } = await sb.from("firm_records").update({ logo_url: null }).eq("id", row.id);
    if (upErr) console.warn(`  ✗ revert ${row.firm_name}: ${upErr.message}`);
    else {
      console.log(`  ↩ reverted ${row.firm_name} (logo was from ${lh})`);
      cleared++;
    }
  }
  return cleared;
}

async function main() {
  if (REVERT_AGGREGATOR) {
    console.log("Reverting logo_url rows tied to blocked website hosts…\n");
    const n = await revertAggregatorLogos();
    console.log(`Revert pass: ${n} row(s)\n`);
  }

  const { data: rows, error } = await sb
    .from("firm_records")
    .select("id,firm_name,website_url,logo_url")
    .is("deleted_at", null)
    .not("website_url", "is", null);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  const targets = (rows ?? []).filter((r: Row) => {
    const logo = r.logo_url?.trim() || "";
    return !logo || isProxyLogoUrl(logo);
  });

  console.log(
    `Firms with website and missing or proxy logo_url: ${targets.length} (processing up to ${MAX}${DRY ? ", DRY_RUN" : ""})`,
  );

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (let i = 0; i < Math.min(targets.length, MAX); i++) {
    const row = targets[i];
    const host = row.website_url ? hostnameFromWebsite(row.website_url) : null;
    if (!host) {
      skipped++;
      continue;
    }

    if (isBlockedWebsiteHost(host)) {
      console.log(
        `  [skip] ${row.firm_name} — website_url host "${host}" is a directory/social site; set website_url to the firm's own domain`,
      );
      skipped++;
      await sleep(DELAY_MS);
      continue;
    }

    const logoUrl = await firstWorkingLogo(host);
    if (!logoUrl) {
      console.log(`  [skip] ${row.firm_name} — no image at apple-touch-icon / favicon.ico`);
      skipped++;
      await sleep(DELAY_MS);
      continue;
    }

    if (DRY) {
      console.log(`  [DRY] ${row.firm_name} → ${logoUrl}`);
      updated++;
    } else {
      const { error: upErr } = await sb.from("firm_records").update({ logo_url: logoUrl }).eq("id", row.id);
      if (upErr) {
        console.warn(`  ✗ ${row.firm_name}: ${upErr.message}`);
        failed++;
      } else {
        console.log(`  ✓ ${row.firm_name} → ${logoUrl}`);
        updated++;
      }
    }

    await sleep(DELAY_MS);
  }

  console.log(`\nDone. updated: ${updated}, skipped: ${skipped}, failed: ${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
