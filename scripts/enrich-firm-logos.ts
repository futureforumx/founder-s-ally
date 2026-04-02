/**
 * enrich-firm-logos.ts
 *
 * Fills in missing firm_records.logo_url using a waterfall of logo sources:
 *   1. Clearbit     — logo.clearbit.com/{domain}
 *   2. Logo.dev     — img.logo.dev/{domain}?token=...
 *   3. Brandfetch   — cdn.brandfetch.io/{domain}
 *   4. Nubela       — nubela.co/logo/?url=...
 *   5. companieslogo— companieslogo.com/img/orig/{slug}.png
 *   6. Google S2    — favicon (last resort, marks as favicon source)
 *
 * Logos are uploaded to Cloudflare R2 and logo_url is updated in Supabase.
 *
 * Usage:
 *   npx tsx scripts/enrich-firm-logos.ts
 *   LOGO_DRY_RUN=1    npx tsx scripts/enrich-firm-logos.ts
 *   LOGO_MAX=500      npx tsx scripts/enrich-firm-logos.ts
 *   LOGO_FORCE=1      npx tsx scripts/enrich-firm-logos.ts   # re-process existing logos
 *   LOGO_CONCURRENCY=8 npx tsx scripts/enrich-firm-logos.ts
 *
 * Optional env:
 *   LOGO_DEV_TOKEN        — Logo.dev API token
 *   BRANDFETCH_API_KEY    — Brandfetch API key
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

const e   = (n: string, fb = "") => (process.env[n] || "").trim() || fb;
const eInt = (n: string, fb: number) => { const v = parseInt(e(n), 10); return isFinite(v) && v > 0 ? v : fb; };
const eBool = (n: string) => ["1","true","yes"].includes(e(n).toLowerCase());

const SUPABASE_URL  = e("SUPABASE_URL").replace(/\/$/, "");
const SERVICE_KEY   = e("SUPABASE_SERVICE_ROLE_KEY");
const ACCOUNT_ID    = e("CF_R2_ACCOUNT_ID");
const ACCESS_KEY    = e("CF_R2_ACCESS_KEY_ID");
const SECRET_KEY    = e("CF_R2_SECRET_ACCESS_KEY");
const ENDPOINT      = e("CF_R2_ENDPOINT", `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`);
const BUCKET        = e("CF_R2_BUCKET_LOGOS", "investor-logos");
const PUB_BASE      = e("CF_R2_PUBLIC_BASE_LOGOS", "").replace(/\/$/, "");
const LOGO_DEV_TOKEN      = e("LOGO_DEV_TOKEN");
const BRANDFETCH_CLIENT   = e("BRANDFETCH_CLIENT_ID");
const NUBELA_KEY          = e("NUBELA_API_KEY");

const DRY_RUN     = eBool("LOGO_DRY_RUN");
const FORCE       = eBool("LOGO_FORCE");
const MAX         = eInt("LOGO_MAX", 999_999);
const CONCURRENCY = eInt("LOGO_CONCURRENCY", 6);
const TIMEOUT_MS  = 10_000;
const MIN_BYTES   = 512; // skip suspiciously tiny images

if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
if (!ACCOUNT_ID || !ACCESS_KEY || !SECRET_KEY) throw new Error("Missing CF_R2_* credentials");

// ── R2 ────────────────────────────────────────────────────────────────────────

const s3 = new S3Client({
  region: "auto",
  endpoint: ENDPOINT,
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
});

// ── Supabase helpers ──────────────────────────────────────────────────────────

const SB = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

async function sbGet<T>(table: string, select: string, extra = ""): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=${select}&limit=20000${extra}`, { headers: SB });
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
  if (!res.ok) console.warn(`  ✗ PATCH failed ${id}: ${res.status}`);
}

// ── Domain helpers ────────────────────────────────────────────────────────────

function extractDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = url.includes("://") ? new URL(url) : new URL(`https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch { return null; }
}

function firmSlug(name: string): string {
  return name.toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ── Logo source waterfall ─────────────────────────────────────────────────────

type LogoSource = { url: string; source: string };

function buildSources(domain: string | null, firmName: string): LogoSource[] {
  const sources: LogoSource[] = [];

  if (domain) {
    // 1. Logo.dev — best quality, Clearbit replacement
    if (LOGO_DEV_TOKEN)
      sources.push({ source: "logo.dev", url: `https://img.logo.dev/${domain}?token=${LOGO_DEV_TOKEN}&size=200` });

    // 2. Brandfetch CDN — client ID in query param
    if (BRANDFETCH_CLIENT)
      sources.push({ source: "brandfetch", url: `https://cdn.brandfetch.io/${domain}?c=${BRANDFETCH_CLIENT}` });

    // 3. Nubela — returns image directly, auth via header (handled in fetchLogo)
    if (NUBELA_KEY)
      sources.push({ source: "nubela", url: `https://nubela.co/api/v1/company/logo?website=https://${domain}` });

    // 4. ifetchly — free, no auth
    sources.push({ source: "ifetchly", url: `https://logo.ifetchly.com/api/logo?domain=${domain}` });

    // 5. Google favicon — last resort
    sources.push({
      source: "google_favicon",
      url: `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`,
    });
  }

  return sources;
}

// ── Image fetch & validation ──────────────────────────────────────────────────

async function fetchLogo(url: string): Promise<{ data: Buffer; contentType: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const headers: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (compatible; VektaBot/1.0)",
    Accept: "image/*,*/*;q=0.8",
  };
  // Nubela requires API key in Authorization header (no Bearer prefix)
  if (url.includes("nubela.co") && NUBELA_KEY) headers["Authorization"] = NUBELA_KEY;

  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (!ct.startsWith("image/")) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < MIN_BYTES) return null;
    return { data: buf, contentType: ct };
  } catch { return null; }
  finally { clearTimeout(timer); }
}

function extFromCt(ct: string): string {
  const m: Record<string, string> = {
    "image/png": ".png", "image/jpeg": ".jpg", "image/jpg": ".jpg",
    "image/webp": ".webp", "image/svg+xml": ".svg", "image/gif": ".gif",
    "image/x-icon": ".ico", "image/vnd.microsoft.icon": ".ico",
  };
  return m[ct] || ".png";
}

// ── R2 upload ─────────────────────────────────────────────────────────────────

async function objectExists(key: string): Promise<boolean> {
  try { await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return true; }
  catch { return false; }
}

async function upload(key: string, data: Buffer, ct: string): Promise<void> {
  if (DRY_RUN) { console.log(`  [DRY] PUT s3://${BUCKET}/${key} (${data.length}b)`); return; }
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: data, ContentType: ct,
    CacheControl: "public, max-age=31536000, immutable",
  }));
}

function publicUrl(key: string): string {
  return PUB_BASE ? `${PUB_BASE}/${key}` : `${ENDPOINT}/${BUCKET}/${key}`;
}

// ── Process one firm ──────────────────────────────────────────────────────────

async function processFirm(
  firm: { id: string; firm_name: string; website_url: string | null; logo_url: string | null },
  index: number,
  total: number,
): Promise<string> {
  const pfx = `[${String(index + 1).padStart(5)}/${total}]`;
  const domain = extractDomain(firm.website_url);
  const sources = buildSources(domain, firm.firm_name);

  for (const { source, url } of sources) {
    const img = await fetchLogo(url);
    if (!img) continue;

    const ext = extFromCt(img.contentType);
    const key = `${firm.id}${ext}`;

    if (!DRY_RUN && await objectExists(key)) {
      const r2url = publicUrl(key);
      await sbPatch("firm_records", firm.id, { logo_url: r2url });
      console.log(`${pfx} ✓ exists→updated [${source}]: ${firm.firm_name}`);
      return "exists";
    }

    await upload(key, img.data, img.contentType);
    const r2url = publicUrl(key);
    await sbPatch("firm_records", firm.id, { logo_url: r2url });
    console.log(`${pfx} ✓ ${Math.round(img.data.length / 1024)}kb [${source}]: ${firm.firm_name}`);
    return "uploaded";
  }

  console.log(`${pfx} ✗ no logo found: ${firm.firm_name} (${domain || "no domain"})`);
  return "failed";
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
  console.log(`  VEKTA Firm Logo Enrichment  ${DRY_RUN ? "(DRY RUN)" : ""}`);
  console.log(`  Sources: Logo.dev → Brandfetch → Nubela → ifetchly → Google favicon`);
  console.log(`  Concurrency: ${CONCURRENCY}  |  Max: ${MAX}  |  Force: ${FORCE}`);
  console.log(`${"═".repeat(64)}\n`);

  type FirmRow = { id: string; firm_name: string; website_url: string | null; logo_url: string | null };

  const extra = (FORCE
    ? "&deleted_at=is.null"
    : "&logo_url=is.null&deleted_at=is.null")
    + "&firm_type=neq.individual";

  const firms = await sbGet<FirmRow>("firm_records", "id,firm_name,website_url,logo_url", extra);
  const todo = firms.slice(0, MAX);

  console.log(`  ${todo.length} firms to process\n`);

  const stats = { uploaded: 0, exists: 0, failed: 0 };

  const tasks = todo.map((firm, i) => async () => {
    const result = await processFirm(firm, i, todo.length);
    stats[result as keyof typeof stats]++;
  });

  await pool(tasks, CONCURRENCY);

  console.log(`\n${"═".repeat(64)}`);
  console.log(`  ✅ Done — uploaded:${stats.uploaded}  exists:${stats.exists}  failed:${stats.failed}`);
  console.log(`${"═".repeat(64)}\n`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
