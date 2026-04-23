/**
 * Mirror firm-website team headshots to Cloudflare R2 (same bucket + public base as other headshots).
 * Called from `resolveFirmWebsiteTeam` after HTML crawl — keep `api/firm-website-team` `maxDuration`
 * high enough in `vercel.json` (e.g. 120s) so this can finish on Pro plans.
 *
 * Env (same family as `scripts/r2-image-upload.ts` / Vercel project env):
 *   CF_R2_ACCESS_KEY_ID, CF_R2_SECRET_ACCESS_KEY, CF_R2_BUCKET_HEADSHOTS, CF_R2_PUBLIC_BASE_HEADSHOTS
 *   plus either CF_R2_ENDPOINT or CF_R2_ACCOUNT_ID (endpoint defaults like other repo scripts).
 *
 * When unset, mirroring is skipped and original URLs are returned.
 */

import { createHash } from "node:crypto";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";

/** Row shape from `resolveFirmWebsiteTeam` — kept generic to avoid circular imports with `_firmWebsiteTeam`. */
type WebsiteTeamPersonRow = {
  id: string;
  profile_image_url: string | null;
} & Record<string, unknown>;

const FETCH_TIMEOUT_MS = 8000;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
/** Cap per firm request (balance coverage vs serverless wall clock). */
const MAX_HEADSHOTS_TO_MIRROR = 40;
const MIRROR_CONCURRENCY = 12;

const IMAGE_FETCH_HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; VEKTAFirmTeamHeadshotMirror/1.0; +https://vekta.app)",
  accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
};

function e(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** Same resolution as logo scripts: explicit endpoint or `https://{CF_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`. */
function r2Endpoint(): string {
  const direct = e("CF_R2_ENDPOINT");
  if (direct) return direct;
  const accountId = e("CF_R2_ACCOUNT_ID");
  if (accountId) return `https://${accountId}.r2.cloudflarestorage.com`;
  return "";
}

function isR2MirrorConfigured(): boolean {
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
  return url.trim().startsWith(base);
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

function looksLikeRasterImagePath(url: string): boolean {
  const path = url.split("?")[0].split("#")[0] ?? "";
  return /\.(jpe?g|png|webp|gif|avif)(?:$|[?#])/i.test(path) || /format=(jpe?g|png|webp|gif)/i.test(url);
}

function sniffRasterFormat(buf: Buffer): { contentType: string } | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8) return { contentType: "image/jpeg" };
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return { contentType: "image/png" };
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return { contentType: "image/gif" };
  // RIFF....WEBP
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return { contentType: "image/webp" };
  }
  return null;
}

function stableHeadshotKey(hostname: string, personId: string, sourceUrl: string): string {
  const h = createHash("sha256").update(`${personId}|${sourceUrl}`).digest("hex").slice(0, 32);
  const host = hostname.replace(/[^a-z0-9.-]/gi, "-").toLowerCase().slice(0, 80) || "unknown-host";
  return `website-team/${host}/${h}`;
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
    const octetOk =
      headerCt === "application/octet-stream" ||
      headerCt === "binary/octet-stream" ||
      headerCt === "";
    if (sniffed && (octetOk || looksLikeRasterImagePath(url))) {
      return { buffer: buf, contentType: sniffed.contentType };
    }

    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function putHeadshotIfMissing(
  bucket: string,
  keyWithExt: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const s3 = s3Client() as S3Client & {
    send(command: HeadObjectCommand | PutObjectCommand): Promise<unknown>;
  };
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

async function mirrorOnePersonHeadshot<T extends WebsiteTeamPersonRow>(
  person: T,
  hostname: string,
): Promise<T> {
  const src = person.profile_image_url?.trim();
  if (!src || alreadyCanonicalR2Headshot(src)) return person;

  const bucket = e("CF_R2_BUCKET_HEADSHOTS");
  const fetched = await fetchImageBytes(src);
  if (!fetched) return person;

  const ext = extFromContentType(fetched.contentType);
  const keyBase = stableHeadshotKey(hostname, person.id, src);
  const keyWithExt = `${keyBase}.${ext}`;

  try {
    const cdnUrl = await putHeadshotIfMissing(bucket, keyWithExt, fetched.buffer, fetched.contentType);
    return { ...person, profile_image_url: cdnUrl } as T;
  } catch {
    return person;
  }
}

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

/**
 * For each person with a third-party `profile_image_url`, download and store in R2; replace URL with CDN.
 * No-op when R2 env is incomplete or on failure (keeps original URL).
 */
export async function mirrorWebsiteTeamHeadshotsToR2<T extends WebsiteTeamPersonRow>(
  people: T[],
  firmWebsiteOrigin: string,
): Promise<T[]> {
  if (!isR2MirrorConfigured() || people.length === 0) return people;

  let hostname: string;
  try {
    hostname = new URL(firmWebsiteOrigin).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return people;
  }

  const indices: number[] = [];
  for (let i = 0; i < people.length; i++) {
    const u = people[i].profile_image_url?.trim();
    if (u && !alreadyCanonicalR2Headshot(u)) indices.push(i);
    if (indices.length >= MAX_HEADSHOTS_TO_MIRROR) break;
  }
  if (indices.length === 0) return people;

  const toMirror = indices.map((i) => people[i]);
  const mirrored = await poolMap(toMirror, MIRROR_CONCURRENCY, (p) => mirrorOnePersonHeadshot(p, hostname));

  const out = people.slice();
  for (let j = 0; j < indices.length; j++) {
    out[indices[j]] = mirrored[j];
  }
  return out;
}
