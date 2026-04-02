/**
 * sync-images-to-r2.ts
 *
 * Downloads investor headshots (firm_investors.avatar_url) and firm logos
 * (firm_records.logo_url) from their source URLs and uploads them to
 * Cloudflare R2, then updates the DB records to point at the R2 URLs.
 *
 * Skips records whose URL already points at R2 (contains r2.cloudflarestorage.com
 * or the configured public base URL).
 *
 * Usage:
 *   npx tsx scripts/sync-images-to-r2.ts
 *   R2_MODE=headshots npx tsx scripts/sync-images-to-r2.ts   # headshots only
 *   R2_MODE=logos     npx tsx scripts/sync-images-to-r2.ts   # logos only
 *   R2_DRY_RUN=1      npx tsx scripts/sync-images-to-r2.ts   # no uploads/DB writes
 *   R2_MAX=500        npx tsx scripts/sync-images-to-r2.ts   # cap records processed
 *   R2_CONCURRENCY=5  npx tsx scripts/sync-images-to-r2.ts   # parallel uploads (default 4)
 *
 * Required env vars (.env.local):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   CF_R2_ACCOUNT_ID
 *   CF_R2_ACCESS_KEY_ID
 *   CF_R2_SECRET_ACCESS_KEY
 *   CF_R2_BUCKET_HEADSHOTS   (default: investor-headshots)
 *   CF_R2_BUCKET_LOGOS       (default: investor-logos)
 *   CF_R2_ENDPOINT           (default: https://{account_id}.r2.cloudflarestorage.com)
 *
 * Optional env vars:
 *   CF_R2_PUBLIC_BASE_HEADSHOTS  e.g. https://pub-xxxx.r2.dev  (after enabling public access)
 *   CF_R2_PUBLIC_BASE_LOGOS      e.g. https://pub-xxxx.r2.dev
 *   If not set, falls back to the S3 endpoint URL (still functional, auth required for reads).
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { existsSync, readFileSync } from "node:fs";
import { join, extname } from "node:path";

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
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1);
      if (v) process.env[m[1]] = v;
    }
  }
}
loadEnv();

const e = (n: string, fb = "") => (process.env[n] || "").trim() || fb;
const eInt = (n: string, fb: number) => { const v = parseInt(e(n), 10); return isFinite(v) && v > 0 ? v : fb; };
const eBool = (n: string) => ["1", "true", "yes"].includes(e(n).toLowerCase());

const SUPABASE_URL  = e("SUPABASE_URL").replace(/\/$/, "");
const SERVICE_KEY   = e("SUPABASE_SERVICE_ROLE_KEY");
const ACCOUNT_ID    = e("CF_R2_ACCOUNT_ID");
const ACCESS_KEY    = e("CF_R2_ACCESS_KEY_ID");
const SECRET_KEY    = e("CF_R2_SECRET_ACCESS_KEY");
const ENDPOINT      = e("CF_R2_ENDPOINT", `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`);
const BUCKET_HS     = e("CF_R2_BUCKET_HEADSHOTS", "investor-headshots");
const BUCKET_LOGOS  = e("CF_R2_BUCKET_LOGOS", "investor-logos");
const PUB_BASE_HS   = e("CF_R2_PUBLIC_BASE_HEADSHOTS").replace(/\/$/, "");
const PUB_BASE_LOGO = e("CF_R2_PUBLIC_BASE_LOGOS").replace(/\/$/, "");

const DRY_RUN     = eBool("R2_DRY_RUN");
const MODE        = e("R2_MODE", "both"); // "headshots" | "logos" | "both"
const MAX         = eInt("R2_MAX", 999_999);
const CONCURRENCY = eInt("R2_CONCURRENCY", 4);
const TIMEOUT_MS  = 15_000;

if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY) throw new Error("Missing CF_R2_* credentials");

// ── R2 client ─────────────────────────────────────────────────────────────────

const s3 = new S3Client({
  region: "auto",
  endpoint: ENDPOINT,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const SB = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function sbGet<T>(table: string, select: string, extra = ""): Promise<T[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}&limit=50000${extra}`;
  const res = await fetch(url, { headers: SB });
  if (!res.ok) throw new Error(`GET ${table}: ${res.status} ${await res.text()}`);
  return res.json();
}

async function sbPatch(table: string, id: string, patch: Record<string, string | null>): Promise<void> {
  if (DRY_RUN) { console.log(`  [DRY] PATCH ${table}.${id}:`, patch); return; }
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...SB, Prefer: "return=minimal" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) console.warn(`  ✗ PATCH ${table}.${id}: ${res.status}`);
}

function isAlreadyR2(url: string): boolean {
  return url.includes("r2.cloudflarestorage.com") ||
    (!!PUB_BASE_HS && url.startsWith(PUB_BASE_HS)) ||
    (!!PUB_BASE_LOGO && url.startsWith(PUB_BASE_LOGO));
}

function contentTypeFromUrl(url: string): string {
  const ext = extname(new URL(url).pathname).toLowerCase();
  const map: Record<string, string> = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".png": "image/png", ".webp": "image/webp",
    ".gif": "image/gif", ".svg": "image/svg+xml",
    ".avif": "image/avif",
  };
  return map[ext] || "image/jpeg";
}

function contentTypeFromHeader(ct: string | null): string {
  if (!ct) return "image/jpeg";
  const clean = ct.split(";")[0].trim().toLowerCase();
  return clean.startsWith("image/") ? clean : "image/jpeg";
}

function extFromContentType(ct: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp",
    "image/gif": ".gif", "image/svg+xml": ".svg", "image/avif": ".avif",
  };
  return map[ct] || ".jpg";
}

async function downloadImage(url: string): Promise<{ data: Buffer; contentType: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; VektaBot/1.0)" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = contentTypeFromHeader(res.headers.get("content-type"));
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) return null; // skip tiny/broken images
    return { data: buf, contentType: ct };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function objectExists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function uploadToR2(bucket: string, key: string, data: Buffer, contentType: string): Promise<void> {
  if (DRY_RUN) { console.log(`  [DRY] PUT s3://${bucket}/${key} (${data.length} bytes)`); return; }
  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: data,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));
}

function publicUrl(bucket: string, key: string, pubBase: string): string {
  if (pubBase) return `${pubBase}/${key}`;
  // Fall back to S3 endpoint URL (requires auth to read, but useful as a reference)
  return `${ENDPOINT}/${bucket}/${key}`;
}

async function processImage(opts: {
  id: string;
  sourceUrl: string;
  bucket: string;
  pubBase: string;
  table: string;
  field: string;
  label: string;
  index: number;
  total: number;
}): Promise<"uploaded" | "skipped" | "exists" | "failed"> {
  const { id, sourceUrl, bucket, pubBase, table, field, label, index, total } = opts;
  const pfx = `[${String(index + 1).padStart(5)}/${total}]`;

  if (isAlreadyR2(sourceUrl)) {
    console.log(`${pfx} — already R2: ${label}`);
    return "skipped";
  }

  // Determine key — use id + sniffed extension
  let key = id; // will append ext after download
  const img = await downloadImage(sourceUrl);
  if (!img) {
    console.log(`${pfx} ✗ download failed: ${label}`);
    return "failed";
  }

  const ext = extFromContentType(img.contentType);
  key = `${id}${ext}`;

  // Skip upload if already in R2
  if (!DRY_RUN && await objectExists(bucket, key)) {
    const url = publicUrl(bucket, key, pubBase);
    await sbPatch(table, id, { [field]: url });
    console.log(`${pfx} ✓ exists, updated URL: ${label}`);
    return "exists";
  }

  await uploadToR2(bucket, key, img.data, img.contentType);
  const r2Url = publicUrl(bucket, key, pubBase);
  await sbPatch(table, id, { [field]: r2Url });
  console.log(`${pfx} ✓ uploaded (${Math.round(img.data.length / 1024)}kb): ${label}`);
  return "uploaded";
}

// Run tasks with limited concurrency
async function pool<T>(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]> {
  const results: T[] = [];
  let i = 0;
  async function next(): Promise<void> {
    while (i < tasks.length) {
      const idx = i++;
      results[idx] = await tasks[idx]();
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function syncHeadshots() {
  console.log("\n── Headshots: firm_investors.avatar_url → R2 ──");
  type Row = { id: string; avatar_url: string | null; full_name: string | null };
  const rows = await sbGet<Row>(
    "firm_investors",
    "id,avatar_url,full_name",
    "&avatar_url=not.is.null&deleted_at=is.null"
  );

  const todo = rows
    .filter(r => r.avatar_url && !isAlreadyR2(r.avatar_url))
    .slice(0, MAX);

  console.log(`  ${todo.length} headshots to upload (${rows.length - todo.length} already R2 or no URL)\n`);

  const stats = { uploaded: 0, skipped: 0, exists: 0, failed: 0 };

  const tasks = todo.map((row, i) => () =>
    processImage({
      id: row.id,
      sourceUrl: row.avatar_url!,
      bucket: BUCKET_HS,
      pubBase: PUB_BASE_HS,
      table: "firm_investors",
      field: "avatar_url",
      label: row.full_name || row.id,
      index: i,
      total: todo.length,
    }).then(r => { stats[r]++; })
  );

  await pool(tasks, CONCURRENCY);

  console.log(`\n  ✅ Headshots done — uploaded:${stats.uploaded} exists:${stats.exists} failed:${stats.failed}`);
}

async function syncLogos() {
  console.log("\n── Logos: firm_records.logo_url → R2 ──");
  type Row = { id: string; logo_url: string | null; firm_name: string | null };
  const rows = await sbGet<Row>(
    "firm_records",
    "id,logo_url,firm_name",
    "&logo_url=not.is.null&deleted_at=is.null"
  );

  const todo = rows
    .filter(r => r.logo_url && !isAlreadyR2(r.logo_url))
    .slice(0, MAX);

  console.log(`  ${todo.length} logos to upload (${rows.length - todo.length} already R2 or no URL)\n`);

  const stats = { uploaded: 0, skipped: 0, exists: 0, failed: 0 };

  const tasks = todo.map((row, i) => () =>
    processImage({
      id: row.id,
      sourceUrl: row.logo_url!,
      bucket: BUCKET_LOGOS,
      pubBase: PUB_BASE_LOGO,
      table: "firm_records",
      field: "logo_url",
      label: row.firm_name || row.id,
      index: i,
      total: todo.length,
    }).then(r => { stats[r]++; })
  );

  await pool(tasks, CONCURRENCY);

  console.log(`\n  ✅ Logos done — uploaded:${stats.uploaded} exists:${stats.exists} failed:${stats.failed}`);
}

async function main() {
  console.log(`\n${"═".repeat(64)}`);
  console.log(`  VEKTA Image → R2 Sync  ${DRY_RUN ? "(DRY RUN)" : ""}`);
  console.log(`  Mode: ${MODE}  |  Concurrency: ${CONCURRENCY}  |  Max: ${MAX}`);
  console.log(`${"═".repeat(64)}\n`);

  if (!PUB_BASE_HS || !PUB_BASE_LOGO) {
    console.warn("  ⚠️  CF_R2_PUBLIC_BASE_HEADSHOTS / CF_R2_PUBLIC_BASE_LOGOS not set.");
    console.warn("     URLs stored in DB will use the S3 endpoint (auth-required).");
    console.warn("     Enable public access in Cloudflare R2 dashboard and add those env vars.\n");
  }

  if (mode_includes("headshots")) await syncHeadshots();
  if (mode_includes("logos")) await syncLogos();

  console.log("\n  All done.\n");
}

function mode_includes(m: string) {
  return MODE === "both" || MODE === m;
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
