/**
 * r2-headshots.ts
 *
 * Shared utility for uploading investor headshots to Cloudflare R2.
 * R2 uses the S3-compatible API, so we use @aws-sdk/client-s3.
 *
 * Env vars required:
 *   CF_R2_ACCOUNT_ID          — Cloudflare account ID
 *   CF_R2_ACCESS_KEY_ID       — R2 API token access key
 *   CF_R2_SECRET_ACCESS_KEY   — R2 API token secret key
 *   CF_R2_BUCKET_HEADSHOTS    — Bucket name (e.g. "vekta-headshots")
 *   CF_R2_PUBLIC_URL          — Public URL prefix (e.g. "https://headshots.yourdomain.com")
 *                                Falls back to R2 dev URL if not set.
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Known third-party avatar URL patterns (never canonical)
// ---------------------------------------------------------------------------

const THIRD_PARTY_PATTERNS = [
  /signal\.nfx\.com/i,
  /nfx\.com/i,
  /media\.licdn\.com/i,
  /linkedin\.com/i,
  /pbs\.twimg\.com/i,
  /twimg\.com/i,
  /abs\.twimg\.com/i,
  /avatars\.githubusercontent\.com/i,
  /googleusercontent\.com/i,
  /gravatar\.com/i,
  /cloudfront\.net/i,
  /apollo\.io/i,
  /crunchbase/i,
  /pitchbook/i,
];

/**
 * Returns true if the URL is a third-party image host (not our R2 bucket).
 */
export function isThirdPartyAvatarUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const trimmed = url.trim();
  return THIRD_PARTY_PATTERNS.some((rx) => rx.test(trimmed));
}

/**
 * Returns true if the URL is already an R2-hosted canonical URL.
 */
export function isR2AvatarUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return false;
  const trimmed = url.trim();
  const publicUrl = getR2PublicUrl();
  if (publicUrl && trimmed.startsWith(publicUrl)) return true;
  // Also match the r2.dev public URLs and r2.cloudflarestorage.com direct URLs
  if (/pub-[a-f0-9]+\.r2\.dev/i.test(trimmed)) return true;
  if (/r2\.cloudflarestorage\.com/i.test(trimmed)) return true;
  return false;
}

/**
 * Returns true if the URL looks malformed/truncated/invalid.
 */
export function isMalformedUrl(url: string | null | undefined): boolean {
  if (!url?.trim()) return true;
  const trimmed = url.trim();
  if (trimmed.length < 10) return true;
  try {
    const u = new URL(trimmed);
    return !u.protocol.startsWith("http");
  } catch {
    return true;
  }
}

// ---------------------------------------------------------------------------
// R2 Client
// ---------------------------------------------------------------------------

let _client: S3Client | null = null;

function getR2Client(): S3Client {
  if (_client) return _client;

  const accountId = process.env.CF_R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.CF_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.CF_R2_SECRET_ACCESS_KEY?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2 credentials. Set CF_R2_ACCOUNT_ID, CF_R2_ACCESS_KEY_ID, CF_R2_SECRET_ACCESS_KEY."
    );
  }

  _client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

function getBucket(): string {
  const bucket = process.env.CF_R2_BUCKET_HEADSHOTS?.trim();
  if (!bucket) throw new Error("CF_R2_BUCKET_HEADSHOTS is not set.");
  return bucket;
}

function getR2PublicUrl(): string {
  const url = (process.env.CF_R2_PUBLIC_BASE_HEADSHOTS || process.env.CF_R2_PUBLIC_URL)?.trim();
  if (!url) return "";
  return url.replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Image validation
// ---------------------------------------------------------------------------

const VALID_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
]);

const MAGIC_BYTES: Array<{ prefix: number[]; type: string }> = [
  { prefix: [0xff, 0xd8, 0xff], type: "image/jpeg" },
  { prefix: [0x89, 0x50, 0x4e, 0x47], type: "image/png" },
  { prefix: [0x47, 0x49, 0x46, 0x38], type: "image/gif" },
  // WebP: RIFF....WEBP
  { prefix: [0x52, 0x49, 0x46, 0x46], type: "image/webp" },
];

function detectImageType(buffer: Buffer): string | null {
  for (const { prefix, type } of MAGIC_BYTES) {
    if (buffer.length >= prefix.length && prefix.every((b, i) => buffer[i] === b)) {
      return type;
    }
  }
  return null;
}

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/avif": ".avif",
};

// ---------------------------------------------------------------------------
// Fetch + validate + upload
// ---------------------------------------------------------------------------

export type HeadshotUploadResult = {
  success: boolean;
  r2_url: string | null;
  source_url: string;
  content_type: string | null;
  size_bytes: number;
  error?: string;
};

/**
 * Fetch an image from a source URL, validate it, and upload to R2.
 *
 * @param sourceUrl - The third-party image URL to fetch
 * @param investorId - Unique identifier used as the R2 object key prefix
 * @param options.skipIfExists - If true, skip upload if object already exists in R2
 */
export async function fetchAndUploadHeadshot(
  sourceUrl: string,
  investorId: string,
  options: { skipIfExists?: boolean } = {}
): Promise<HeadshotUploadResult> {
  const result: HeadshotUploadResult = {
    success: false,
    r2_url: null,
    source_url: sourceUrl,
    content_type: null,
    size_bytes: 0,
  };

  // 1) Validate source URL
  if (isMalformedUrl(sourceUrl)) {
    result.error = "Malformed source URL";
    return result;
  }

  // 2) Fetch the image
  let response: Response;
  try {
    response = await fetch(sourceUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "image/*",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    result.error = `Fetch failed: ${e instanceof Error ? e.message : String(e)}`;
    return result;
  }

  if (!response.ok) {
    result.error = `HTTP ${response.status}`;
    return result;
  }

  // 3) Read body
  const buffer = Buffer.from(await response.arrayBuffer());
  result.size_bytes = buffer.length;

  if (buffer.length < 100) {
    result.error = "Response too small to be a valid image";
    return result;
  }

  // 4) Validate content type via magic bytes
  const detectedType = detectImageType(buffer);
  const headerType = response.headers.get("content-type")?.split(";")[0]?.trim();
  const contentType = detectedType || headerType || null;

  if (!contentType || !VALID_IMAGE_TYPES.has(contentType)) {
    result.error = `Not a valid image: content-type=${headerType}, detected=${detectedType}`;
    return result;
  }
  result.content_type = contentType;

  // 5) Compute hash for dedup
  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const ext = MIME_TO_EXT[contentType] || ".bin";
  const objectKey = `investors/${investorId}/${hash}${ext}`;

  // 6) Check if already exists
  if (options.skipIfExists) {
    try {
      await getR2Client().send(
        new HeadObjectCommand({ Bucket: getBucket(), Key: objectKey })
      );
      // Already exists
      const publicUrl = getR2PublicUrl();
      result.r2_url = publicUrl ? `${publicUrl}/${objectKey}` : objectKey;
      result.success = true;
      return result;
    } catch {
      // Doesn't exist, proceed with upload
    }
  }

  // 7) Upload to R2
  try {
    await getR2Client().send(
      new PutObjectCommand({
        Bucket: getBucket(),
        Key: objectKey,
        Body: buffer,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
        Metadata: {
          "source-url": sourceUrl.slice(0, 512),
          "investor-id": investorId,
          "uploaded-at": new Date().toISOString(),
        },
      })
    );
  } catch (e) {
    result.error = `R2 upload failed: ${e instanceof Error ? e.message : String(e)}`;
    return result;
  }

  const publicUrl = getR2PublicUrl();
  result.r2_url = publicUrl ? `${publicUrl}/${objectKey}` : objectKey;
  result.success = true;
  return result;
}

/**
 * Build the canonical R2 URL for an investor given just the object key.
 */
export function buildR2Url(objectKey: string): string {
  const publicUrl = getR2PublicUrl();
  return publicUrl ? `${publicUrl}/${objectKey}` : objectKey;
}

/**
 * Validates that an avatar_url is acceptable as canonical.
 * Returns null if valid, or an error reason string if not.
 */
export function validateCanonicalAvatarUrl(url: string | null | undefined): string | null {
  if (!url?.trim()) return null; // null is fine (no avatar)
  const trimmed = url.trim();

  if (isMalformedUrl(trimmed)) return "malformed_url";
  if (isThirdPartyAvatarUrl(trimmed)) return "third_party_url";

  return null; // valid
}
