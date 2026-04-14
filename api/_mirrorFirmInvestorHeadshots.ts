/**
 * Mirror `firm_investors` avatar / profile_image URLs to R2 (same bucket + public base as website-team mirror).
 * Used when the investor detail panel loads so LinkedIn/CDN URLs become stable public R2 URLs.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

/** Keep in sync with `src/lib/investorAvatarUrl.ts` — avoid importing `@/` from Vite-bundled API code. */
const BLOCKED_AVATAR_URL_RE =
  /unavatar\.io|gravatar\.com|ui-avatars\.com|googleusercontent\.com\/favicon|\/faviconV2\?|\/s2\/favicons/i;

function isBlockedExternalAvatarUrl(url: string | null | undefined): boolean {
  const t = (url ?? "").trim();
  if (!t) return true;
  return BLOCKED_AVATAR_URL_RE.test(t);
}

const FETCH_TIMEOUT_MS = 12_000;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_ROWS_PER_REQUEST = 80;
const MIRROR_CONCURRENCY = 6;

const IMAGE_FETCH_HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; VEKTADbInvestorHeadshotMirror/1.0; +https://vekta.app)",
  accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
};

function e(name: string): string {
  return (process.env[name] ?? "").trim();
}

function r2Endpoint(): string {
  const direct = e("CF_R2_ENDPOINT");
  if (direct) return direct;
  const accountId = e("CF_R2_ACCOUNT_ID");
  if (accountId) return `https://${accountId}.r2.cloudflarestorage.com`;
  return "";
}

export function isR2HeadshotMirrorConfigured(): boolean {
  return Boolean(
    r2Endpoint() &&
      e("CF_R2_ACCESS_KEY_ID") &&
      e("CF_R2_SECRET_ACCESS_KEY") &&
      e("CF_R2_BUCKET_HEADSHOTS") &&
      e("CF_R2_PUBLIC_BASE_HEADSHOTS"),
  );
}

function publicBaseHeadshots(): string {
  return e("CF_R2_PUBLIC_BASE_HEADSHOTS").replace(/\/$/, "");
}

function alreadyCanonicalR2Headshot(url: string): boolean {
  const base = publicBaseHeadshots();
  if (!base) return false;
  const t = url.trim();
  if (t.includes("r2.cloudflarestorage.com")) return true;
  return t.startsWith(base);
}

let _s3: S3Client | null = null;
function s3Client(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: "auto",
      endpoint: r2Endpoint(),
      credentials: {
        accessKeyId: e("CF_R2_ACCESS_KEY_ID"),
        secretAccessKey: e("CF_R2_SECRET_ACCESS_KEY"),
      },
      forcePathStyle: false,
    });
  }
  return _s3;
}

function extFromContentType(ct: string): "jpg" | "png" | "webp" | "gif" {
  const c = ct.toLowerCase();
  if (c.includes("webp")) return "webp";
  if (c.includes("gif")) return "gif";
  if (c.includes("jpeg") || c.includes("jpg")) return "jpg";
  return "png";
}

function sniffRasterFormat(buf: Buffer): { contentType: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return { contentType: "image/jpeg" };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { contentType: "image/png" };
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return { contentType: "image/gif" };
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return { contentType: "image/webp" };
  }
  return null;
}

async function fetchImageBytes(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: IMAGE_FETCH_HEADERS });
    if (!res.ok) return null;
    const headerCt = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 80 || buf.length > MAX_IMAGE_BYTES) return null;
    if (headerCt.startsWith("image/") && !headerCt.includes("svg")) {
      return { buffer: buf, contentType: headerCt || "image/jpeg" };
    }
    const sniffed = sniffRasterFormat(buf);
    if (sniffed) return { buffer: buf, contentType: sniffed.contentType };
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function putHeadshotIfMissing(bucket: string, keyWithExt: string, body: Buffer, contentType: string): Promise<string> {
  const s3 = s3Client();
  const base = publicBaseHeadshots();
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: keyWithExt }));
  } catch {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: keyWithExt,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }
  return `${base}/${keyWithExt}`;
}

function pickMirrorSource(avatarUrl: string | null, profileImageUrl: string | null): string | null {
  for (const u of [avatarUrl, profileImageUrl]) {
    const t = (u ?? "").trim();
    if (!t || isBlockedExternalAvatarUrl(t)) continue;
    if (alreadyCanonicalR2Headshot(t)) continue;
    return t;
  }
  return null;
}

type InvestorRow = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  profile_image_url: string | null;
};

async function poolMap<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export type MirrorFirmHeadshotsResult = {
  configured: boolean;
  firmRecordId: string;
  candidates: number;
  mirrored: number;
  failed: number;
};

/**
 * For each investor at the firm with a non-R2, non-blocked image URL: fetch, upload to R2, update `avatar_url` + `profile_image_url`.
 */
export async function mirrorFirmInvestorHeadshotsForFirm(
  admin: SupabaseClient,
  firmRecordId: string,
): Promise<MirrorFirmHeadshotsResult> {
  const base: MirrorFirmHeadshotsResult = {
    configured: isR2HeadshotMirrorConfigured(),
    firmRecordId,
    candidates: 0,
    mirrored: 0,
    failed: 0,
  };
  if (!base.configured) return base;

  const { data: rows, error } = await admin
    .from("firm_investors")
    .select("id, full_name, avatar_url, profile_image_url")
    .eq("firm_id", firmRecordId)
    .is("deleted_at", null)
    .limit(MAX_ROWS_PER_REQUEST);

  if (error || !rows?.length) return base;

  const todo = (rows as InvestorRow[]).filter((r) => pickMirrorSource(r.avatar_url, r.profile_image_url));
  base.candidates = todo.length;
  if (todo.length === 0) return base;

  const bucket = e("CF_R2_BUCKET_HEADSHOTS");

  const outcomes = await poolMap(todo, MIRROR_CONCURRENCY, async (row) => {
    const source = pickMirrorSource(row.avatar_url, row.profile_image_url);
    if (!source) return { ok: false as const, id: row.id };
    const fetched = await fetchImageBytes(source);
    if (!fetched) return { ok: false as const, id: row.id };
    const ext = extFromContentType(fetched.contentType);
    const keyWithExt = `${row.id}.${ext}`;
    try {
      const cdnUrl = await putHeadshotIfMissing(bucket, keyWithExt, fetched.buffer, fetched.contentType);
      const patch: Record<string, unknown> = {
        avatar_url: cdnUrl,
        profile_image_url: cdnUrl,
        avatar_source_url: source,
        avatar_source_type: "r2_db_mirror",
        avatar_confidence: 1,
        avatar_last_verified_at: new Date().toISOString(),
        avatar_needs_review: false,
      };
      const { error: upErr } = await admin.from("firm_investors").update(patch).eq("id", row.id);
      if (upErr) return { ok: false as const, id: row.id };
      return { ok: true as const, id: row.id };
    } catch {
      return { ok: false as const, id: row.id };
    }
  });

  for (const o of outcomes) {
    if (o.ok) base.mirrored++;
    else base.failed++;
  }
  return base;
}

export function supabaseAdminForMirror(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}
