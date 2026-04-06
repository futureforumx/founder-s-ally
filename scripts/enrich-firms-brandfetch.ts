/**
 * enrich-firms-brandfetch.ts
 *
 * Enriches firm_records using the Brandfetch v2 API (logo.dev fallback):
 *   - logo_url        (Brandfetch best quality → logo.dev fallback, uploaded to R2)
 *   - description
 *   - total_headcount / headcount
 *   - founded_year
 *   - linkedin_url, x_url, instagram_url, facebook_url, youtube_url, tiktok_url
 *   - website_url     (canonical, if missing)
 *
 * Only fills fields that are currently null/empty (unless BRANDFETCH_FORCE=1).
 * Skips individual investors (firm_type = 'individual').
 *
 * Usage:
 *   npx tsx scripts/enrich-firms-brandfetch.ts
 *   BRANDFETCH_DRY_RUN=1    npx tsx scripts/enrich-firms-brandfetch.ts
 *   BRANDFETCH_FORCE=1      npx tsx scripts/enrich-firms-brandfetch.ts
 *   BRANDFETCH_MAX=500      npx tsx scripts/enrich-firms-brandfetch.ts
 *   BRANDFETCH_CONCURRENCY=3 npx tsx scripts/enrich-firms-brandfetch.ts
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// ── Env ───────────────────────────────────────────────────────────────────────

function loadEnv() {
  for (const name of [".env", ".env.local"]) {
    const p = join(process.cwd(), name);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const m = t.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      if (process.env[m[1]]) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (v) process.env[m[1]] = v;
    }
  }
}
loadEnv();

const e    = (n: string, fb = "") => (process.env[n] || "").trim() || fb;
const eInt = (n: string, fb: number) => { const v = parseInt(e(n), 10); return isFinite(v) && v > 0 ? v : fb; };
const eBool = (n: string) => ["1","true","yes"].includes(e(n).toLowerCase());

const SUPABASE_URL  = e("SUPABASE_URL").replace(/\/$/, "");
const SERVICE_KEY   = e("SUPABASE_SERVICE_ROLE_KEY");
const BF_KEY        = e("BRANDFETCH_API_KEY");
const ACCOUNT_ID    = e("CF_R2_ACCOUNT_ID");
const ACCESS_KEY    = e("CF_R2_ACCESS_KEY_ID");
const SECRET_KEY    = e("CF_R2_SECRET_ACCESS_KEY");
const ENDPOINT      = e("CF_R2_ENDPOINT", `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`);
const BUCKET        = e("CF_R2_BUCKET_LOGOS", "investor-logos");
const PUB_BASE      = e("CF_R2_PUBLIC_BASE_LOGOS", "").replace(/\/$/, "");

const LOGO_DEV_TOKEN = e("LOGO_DEV_TOKEN");

const DRY_RUN     = eBool("BRANDFETCH_DRY_RUN");
const FORCE       = eBool("BRANDFETCH_FORCE");
const MAX         = eInt("BRANDFETCH_MAX", 999_999);
const CONCURRENCY = eInt("BRANDFETCH_CONCURRENCY", 3);
const TIMEOUT_MS  = 12_000;

if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
if (!BF_KEY) throw new Error("Missing BRANDFETCH_API_KEY");
if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY) throw new Error("Missing CF_R2_* credentials");

// ── R2 ────────────────────────────────────────────────────────────────────────

const s3 = new S3Client({
  region: "auto",
  endpoint: ENDPOINT,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
});

async function objectExists(key: string): Promise<boolean> {
  try { await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return true; }
  catch { return false; }
}

async function uploadR2(key: string, data: Buffer, ct: string): Promise<void> {
  if (DRY_RUN) { console.log(`    [DRY] PUT s3://${BUCKET}/${key} (${data.length}b)`); return; }
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: data, ContentType: ct,
    CacheControl: "public, max-age=31536000, immutable",
  }));
}

function r2Url(key: string): string {
  return PUB_BASE ? `${PUB_BASE}/${key}` : `${ENDPOINT}/${BUCKET}/${key}`;
}

// ── Supabase ──────────────────────────────────────────────────────────────────

const SB = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

async function sbGet<T>(table: string, select: string, extra = ""): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}&limit=50000${extra}`, { headers: SB });
  if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbPatch(table: string, id: string, patch: Record<string, unknown>): Promise<void> {
  if (DRY_RUN) { console.log(`    [DRY] PATCH ${table}.${id}:`, Object.keys(patch).join(", ")); return; }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...SB, Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) console.warn(`    ✗ PATCH ${id}: ${res.status}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = url.includes("://") ? new URL(url) : new URL(`https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch { return null; }
}

function extFromCt(ct: string): string {
  const m: Record<string, string> = {
    "image/svg+xml": ".svg", "image/png": ".png", "image/jpeg": ".jpg",
    "image/webp": ".webp", "image/gif": ".gif",
  };
  return m[ct] || ".png";
}

function pickBestLogo(logos: any[]): { src: string; format: string } | null {
  if (!logos?.length) return null;
  // Prefer light theme, then icon; within theme prefer SVG, then largest PNG
  const order = ["light", "icon", "dark"];
  for (const theme of order) {
    const group = logos.find((l: any) => l.theme === theme);
    if (!group?.formats?.length) continue;
    const svg = group.formats.find((f: any) => f.format === "svg" && f.src);
    if (svg) return { src: svg.src, format: "image/svg+xml" };
    const pngs = group.formats
      .filter((f: any) => f.format === "png" && f.src)
      .sort((a: any, b: any) => (b.width || 0) - (a.width || 0));
    if (pngs[0]) return { src: pngs[0].src, format: "image/png" };
  }
  return null;
}

function extractLinks(links: any[]): Record<string, string> {
  if (!links?.length) return {};
  const map: Record<string, string> = {};
  const nameMap: Record<string, string> = {
    twitter: "x_url", linkedin: "linkedin_url", instagram: "instagram_url",
    facebook: "facebook_url", youtube: "youtube_url", tiktok: "tiktok_url",
  };
  for (const link of links) {
    const key = nameMap[link.name?.toLowerCase()];
    if (key && link.url) map[key] = link.url;
  }
  return map;
}

// ── Brandfetch API ────────────────────────────────────────────────────────────

async function fetchBrandfetch(domain: string): Promise<any | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.brandfetch.io/v2/brands/${domain}`, {
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${BF_KEY}`, Accept: "application/json" },
    });
    if (res.status === 404 || res.status === 422) return null;
    if (!res.ok) {
      console.warn(`    ✗ Brandfetch ${domain}: ${res.status}`);
      return null;
    }
    return res.json();
  } catch { return null; }
  finally { clearTimeout(timer); }
}

async function downloadImage(url: string): Promise<{ data: Buffer; contentType: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; VektaBot/1.0)" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "image/png").split(";")[0].trim();
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length < 100) return null;
    return { data, contentType: ct };
  } catch { return null; }
  finally { clearTimeout(timer); }
}

// ── Process one firm ──────────────────────────────────────────────────────────

async function processFirm(
  firm: { id: string; firm_name: string; website_url: string | null; logo_url: string | null; [k: string]: any },
  index: number,
  total: number,
): Promise<"enriched" | "no_data" | "skipped" | "failed"> {
  const pfx = `[${String(index + 1).padStart(5)}/${total}]`;
  const domain = extractDomain(firm.website_url);
  if (!domain) { console.log(`${pfx} ✗ no domain: ${firm.firm_name}`); return "skipped"; }

  const brand = await fetchBrandfetch(domain);

  const patch: Record<string, unknown> = {};

  // ── Logo ──────────────────────────────────────────────────────────────────
  if (!firm.logo_url || FORCE) {
    // Try Brandfetch logo first (if brand data available)
    if (brand) {
      const best = pickBestLogo(brand.logos);
      if (best) {
        const key = `${firm.id}${extFromCt(best.format)}`;
        const exists = !DRY_RUN && await objectExists(key);
        if (exists) {
          patch.logo_url = r2Url(key);
        } else {
          const img = await downloadImage(best.src);
          if (img) {
            await uploadR2(key, img.data, img.contentType);
            patch.logo_url = r2Url(key);
          }
        }
      }
    }
    // Fallback: logo.dev (runs when Brandfetch is unavailable, rate-limited, or had no logo)
    if (!patch.logo_url && LOGO_DEV_TOKEN) {
      const logoDevUrl = `https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}&size=200`;
      const img = await downloadImage(logoDevUrl);
      if (img) {
        const key = `${firm.id}${extFromCt(img.contentType)}`;
        const exists = !DRY_RUN && await objectExists(key);
        if (exists) {
          patch.logo_url = r2Url(key);
        } else {
          await uploadR2(key, img.data, img.contentType);
          patch.logo_url = r2Url(key);
        }
        console.log(`${pfx} ✓ logo.dev: ${firm.firm_name}`);
      }
    }
  }

  // If Brandfetch had no data at all and logo.dev also got nothing, bail out
  if (!brand && !patch.logo_url) {
    console.log(`${pfx} ✗ not found: ${firm.firm_name} (${domain})`);
    return "no_data";
  }

  // ── Text fields (Brandfetch only) ────────────────────────────────────────
  if (brand) {
    if ((!firm.description || FORCE) && brand.description)
      patch.description = brand.description;

    if ((!firm.total_headcount || FORCE) && brand.employees)
      patch.total_headcount = brand.employees;

    if ((!firm.headcount || FORCE) && brand.employees)
      patch.headcount = String(brand.employees);

    if ((!firm.founded_year || FORCE) && brand.foundedYear)
      patch.founded_year = brand.foundedYear;

    // ── Social links ────────────────────────────────────────────────────────
    const links = extractLinks(brand.links || []);
    for (const [col, url] of Object.entries(links)) {
      if (!firm[col] || FORCE) patch[col] = url;
    }

    // ── Website (canonical) ──────────────────────────────────────────────────
    if (!firm.website_url && brand.domain)
      patch.website_url = `https://${brand.domain}`;
  }

  if (Object.keys(patch).length === 0) {
    console.log(`${pfx} — already complete: ${firm.firm_name}`);
    return "skipped";
  }

  patch.last_enriched_at = new Date().toISOString();
  await sbPatch("firm_records", firm.id, patch);

  const fields = Object.keys(patch).filter(k => k !== "last_enriched_at").join(", ");
  console.log(`${pfx} ✓ ${firm.firm_name} — ${fields}`);
  return "enriched";
}

// ── Pool ──────────────────────────────────────────────────────────────────────

async function pool<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = [];
  let i = 0;
  async function next(): Promise<void> {
    while (i < tasks.length) { const idx = i++; results[idx] = await tasks[idx](); }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  VEKTA Firm Enrichment — Brandfetch v2  ${DRY_RUN ? "(DRY RUN)" : ""}`);
  console.log(`  Fields: logo, description, headcount, founded_year, socials`);
  console.log(`  Concurrency: ${CONCURRENCY}  |  Force: ${FORCE}`);
  console.log(`${"═".repeat(64)}\n`);

  type FirmRow = { id: string; firm_name: string; website_url: string | null; logo_url: string | null;
    description: string | null; total_headcount: number | null; headcount: string | null;
    founded_year: number | null; linkedin_url: string | null; x_url: string | null;
    instagram_url: string | null; facebook_url: string | null; youtube_url: string | null; tiktok_url: string | null; };

  const cols = "id,firm_name,website_url,logo_url,description,total_headcount,headcount,founded_year,linkedin_url,x_url,instagram_url,facebook_url,youtube_url,tiktok_url";
  const firms = await sbGet<FirmRow>("firm_records", cols, "&firm_type=neq.individual&deleted_at=is.null&website_url=not.is.null");
  const todo = firms.slice(0, MAX);

  console.log(`  ${todo.length} firms with website URLs to process\n`);

  const stats = { enriched: 0, no_data: 0, skipped: 0, failed: 0 };

  const tasks = todo.map((firm, i) => async () => {
    const result = await processFirm(firm, i, todo.length);
    stats[result]++;
  });

  await pool(tasks, CONCURRENCY);

  console.log(`\n${"═".repeat(64)}`);
  console.log(`  ✅ Done — enriched:${stats.enriched}  no_data:${stats.no_data}  skipped:${stats.skipped}  failed:${stats.failed}`);
  console.log(`${"═".repeat(64)}\n`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
