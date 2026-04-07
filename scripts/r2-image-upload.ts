/**
 * r2-image-upload.ts
 *
 * R2-backed image upload helper for firm logos and investor headshots.
 *
 * Strategy per URL:
 *   1. Try fetching the URL as-is (detects SVG by Content-Type or extension)
 *   2. If the URL is an image service (Clearbit, unavatar, etc.) try PNG variant
 *   3. Upload to R2 with @aws-sdk/client-s3 (S3-compatible)
 *   4. Insert a row into headshot_assets or logo_assets (approval_state = 'pending')
 *   5. Return { cdnUrl, r2Key, format, fileSizeBytes }
 *
 * Env (all in .env.local):
 *   CF_R2_ENDPOINT             https://[accountId].r2.cloudflarestorage.com
 *   CF_R2_ACCESS_KEY_ID        S3 access key
 *   CF_R2_SECRET_ACCESS_KEY    S3 secret key
 *   CF_R2_BUCKET_HEADSHOTS     bucket name for investor headshots
 *   CF_R2_BUCKET_LOGOS         bucket name for firm logos
 *   CF_R2_PUBLIC_BASE_HEADSHOTS  public CDN base URL (optional — from R2 public bucket)
 *   CF_R2_PUBLIC_BASE_LOGOS      public CDN base URL (optional)
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/loadEnvFiles";

loadEnvFiles([".env", ".env.local"]);

// ── Env helpers ───────────────────────────────────────────────────────────────

function e(name: string): string {
  return (process.env[name] || "").trim();
}

function requireEnv(name: string): string {
  const v = e(name);
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

// ── Config ────────────────────────────────────────────────────────────────────

const R2_ENDPOINT        = requireEnv("CF_R2_ENDPOINT");
const R2_ACCESS_KEY_ID   = requireEnv("CF_R2_ACCESS_KEY_ID");
const R2_SECRET_KEY      = requireEnv("CF_R2_SECRET_ACCESS_KEY");
const BUCKET_HEADSHOTS   = requireEnv("CF_R2_BUCKET_HEADSHOTS");
const BUCKET_LOGOS       = requireEnv("CF_R2_BUCKET_LOGOS");

// Optional: public CDN base URLs — falls back to the R2 endpoint URL if not set
const PUBLIC_BASE_HEADSHOTS = e("CF_R2_PUBLIC_BASE_HEADSHOTS");
const PUBLIC_BASE_LOGOS     = e("CF_R2_PUBLIC_BASE_LOGOS");

const SUPA_URL  = requireEnv("SUPABASE_URL") || requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const SUPA_KEY  = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

// ── Singletons ────────────────────────────────────────────────────────────────

let _s3: S3Client | null = null;
function getS3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_KEY,
      },
      // R2 does not support path-style, but Cloudflare's S3 compat works with both
      forcePathStyle: false,
    });
  }
  return _s3;
}

let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
  }
  return _supabase;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ImageFormat = "svg" | "png" | "webp" | "jpg" | "gif";
export type ImageSource = "signal_nfx" | "clearbit" | "linkedin" | "manual" | "gravatar" | "unavatar" | "other";

export interface UploadResult {
  cdnUrl: string;
  r2Key: string;
  format: ImageFormat;
  fileSizeBytes: number;
  skipped?: boolean; // true if row already exists in DB
}

export interface UploadHeadshotParams {
  investorId: string;   // UUID of firm_investors row
  slug: string;         // used for the R2 key path
  sourceUrl: string;    // original avatar URL
  source?: ImageSource;
}

export interface UploadLogoParams {
  firmId: string;       // UUID of firm_records row
  slug: string;
  sourceUrl: string;
  source?: ImageSource;
}

// ── Format detection ──────────────────────────────────────────────────────────

function detectFormat(url: string, contentType: string): ImageFormat {
  const ct = contentType.toLowerCase();
  if (ct.includes("svg"))  return "svg";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("gif"))  return "gif";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("png"))  return "png";

  // Fall back to URL extension
  const lower = url.toLowerCase().split("?")[0];
  if (lower.endsWith(".svg"))  return "svg";
  if (lower.endsWith(".webp")) return "webp";
  if (lower.endsWith(".gif"))  return "gif";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpg";
  return "png"; // safe default
}

// ── Fetch image ───────────────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 15_000;

interface FetchedImage {
  buffer: Buffer;
  format: ImageFormat;
  contentType: string;
}

async function fetchImage(url: string): Promise<FetchedImage | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VektaBot/1.0; +https://vekta.so)",
        "Accept": "image/svg+xml,image/*,*/*;q=0.8",
      },
    });

    if (!resp.ok) return null;

    const contentType = resp.headers.get("content-type") || "image/png";

    // Skip HTML responses (e.g. redirect to login page)
    if (contentType.includes("text/html")) return null;

    const arrayBuffer = await resp.arrayBuffer();
    if (arrayBuffer.byteLength < 100) return null; // too small to be a real image

    const buffer = Buffer.from(arrayBuffer);
    const format = detectFormat(url, contentType);

    return { buffer, format, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── CDN URL builder ───────────────────────────────────────────────────────────

function buildCdnUrl(bucket: string, r2Key: string, isHeadshot: boolean): string {
  const base = isHeadshot ? PUBLIC_BASE_HEADSHOTS : PUBLIC_BASE_LOGOS;
  if (base) {
    return `${base.replace(/\/$/, "")}/${r2Key}`;
  }
  // Fallback: R2 endpoint URL (not publicly accessible until bucket is made public)
  return `${R2_ENDPOINT.replace(/\/$/, "")}/${bucket}/${r2Key}`;
}

// ── R2 upload ─────────────────────────────────────────────────────────────────

async function uploadToR2(
  bucket: string,
  r2Key: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  const s3 = getS3();

  // Check if object already exists (skip re-upload)
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: r2Key }));
    return; // already exists
  } catch {
    // object not found — proceed with upload
  }

  await s3.send(new PutObjectCommand({
    Bucket: bucket,
    Key: r2Key,
    Body: buffer,
    ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));
}

// ── Supabase insert helpers ───────────────────────────────────────────────────

async function insertHeadshotAsset(params: {
  investorId: string;
  r2Key: string;
  cdnUrl: string;
  format: ImageFormat;
  source: ImageSource;
  sourceUrl: string;
  fileSizeBytes: number;
}): Promise<boolean> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("headshot_assets")
    .upsert(
      {
        investor_id:    params.investorId,
        r2_key:         params.r2Key,
        cdn_url:        params.cdnUrl,
        format:         params.format,
        source:         params.source,
        source_url:     params.sourceUrl,
        quality:        "original",
        file_size_bytes: params.fileSizeBytes,
        approval_state: "pending",
        updated_at:     new Date().toISOString(),
      },
      { onConflict: "investor_id,r2_key", ignoreDuplicates: true }
    );

  if (error && !error.message?.includes("duplicate")) {
    throw new Error(`headshot_assets insert: ${error.message}`);
  }
  return !error;
}

async function insertLogoAsset(params: {
  firmId: string;
  r2Key: string;
  cdnUrl: string;
  format: ImageFormat;
  source: ImageSource;
  sourceUrl: string;
  fileSizeBytes: number;
}): Promise<boolean> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("logo_assets")
    .upsert(
      {
        firm_id:        params.firmId,
        r2_key:         params.r2Key,
        cdn_url:        params.cdnUrl,
        format:         params.format,
        source:         params.source,
        source_url:     params.sourceUrl,
        quality:        "original",
        file_size_bytes: params.fileSizeBytes,
        approval_state: "pending",
        updated_at:     new Date().toISOString(),
      },
      { onConflict: "firm_id,r2_key", ignoreDuplicates: true }
    );

  if (error && !error.message?.includes("duplicate")) {
    throw new Error(`logo_assets insert: ${error.message}`);
  }
  return !error;
}

// ── Avatar write-back with validation guard ────────────────────────────────────

/**
 * Write a canonical R2 URL back to firm_investors.avatar_url, plus provenance
 * metadata. Rejects writes that fail basic sanity checks (not http/https,
 * not pointing at the R2 public base) to prevent future bad-data writes.
 */
export async function writeBackHeadshotCanonical(params: {
  investorId:  string;
  r2CdnUrl:    string;
  sourceUrl:   string;
  sourceType:  string;
  confidence?: number;
}): Promise<void> {
  const { investorId, r2CdnUrl, sourceUrl, sourceType, confidence = 1.0 } = params;

  // Guard: must be an absolute http/https URL
  let parsed: URL;
  try {
    parsed = new URL(r2CdnUrl);
  } catch {
    throw new Error(`writeBackHeadshotCanonical: not a valid URL: ${r2CdnUrl}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`writeBackHeadshotCanonical: non-http URL: ${r2CdnUrl}`);
  }

  // Guard: must be a known R2 public URL (prevents writing arbitrary third-party CDNs)
  const r2Base = PUBLIC_BASE_HEADSHOTS.replace(/\/$/, "");
  if (r2Base && !r2CdnUrl.startsWith(r2Base)) {
    throw new Error(
      `writeBackHeadshotCanonical: URL is not from R2 public base (${r2Base}): ${r2CdnUrl}`,
    );
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("firm_investors")
    .update({
      avatar_url:               r2CdnUrl,
      avatar_source_url:        sourceUrl,
      avatar_source_type:       "r2_canonical",
      avatar_confidence:        confidence,
      avatar_last_verified_at:  new Date().toISOString(),
      avatar_needs_review:      false,
    })
    .eq("id", investorId);

  if (error) {
    throw new Error(`writeBackHeadshotCanonical DB error (${investorId}): ${error.message}`);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fetch sourceUrl, upload to R2, insert pending headshot_assets row.
 * Returns null if the image couldn't be fetched.
 */
export async function uploadHeadshot(params: UploadHeadshotParams): Promise<UploadResult | null> {
  const { investorId, slug, sourceUrl, source = "signal_nfx" } = params;

  const fetched = await fetchImage(sourceUrl);
  if (!fetched) return null;

  const safeSlug = slug.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const r2Key    = `investors/${safeSlug}/headshot.${fetched.format}`;
  const cdnUrl   = buildCdnUrl(BUCKET_HEADSHOTS, r2Key, true);

  await uploadToR2(BUCKET_HEADSHOTS, r2Key, fetched.buffer, fetched.contentType);
  await insertHeadshotAsset({ investorId, r2Key, cdnUrl, format: fetched.format, source, sourceUrl, fileSizeBytes: fetched.buffer.length });

  return { cdnUrl, r2Key, format: fetched.format, fileSizeBytes: fetched.buffer.length };
}

/**
 * Fetch sourceUrl, upload to R2, insert pending logo_assets row.
 * Tries SVG first, then PNG.
 * Returns null if the image couldn't be fetched.
 */
export async function uploadLogo(params: UploadLogoParams): Promise<UploadResult | null> {
  const { firmId, slug, sourceUrl, source = "signal_nfx" } = params;

  // Try the URL as-is first
  let fetched = await fetchImage(sourceUrl);

  // If it's not SVG and the URL looks like it could have an SVG variant, try that
  if (fetched && fetched.format !== "svg" && sourceUrl.includes("clearbit.com")) {
    const svgUrl = sourceUrl.replace(/\.png(\?.*)?$/, ".svg").replace(/format=[^&]+/, "format=svg");
    const svgFetched = await fetchImage(svgUrl);
    if (svgFetched) fetched = svgFetched;
  }

  if (!fetched) return null;

  const safeSlug = slug.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  const r2Key    = `firms/${safeSlug}/logo.${fetched.format}`;
  const cdnUrl   = buildCdnUrl(BUCKET_LOGOS, r2Key, false);

  await uploadToR2(BUCKET_LOGOS, r2Key, fetched.buffer, fetched.contentType);
  await insertLogoAsset({ firmId, r2Key, cdnUrl, format: fetched.format, source, sourceUrl, fileSizeBytes: fetched.buffer.length });

  return { cdnUrl, r2Key, format: fetched.format, fileSizeBytes: fetched.buffer.length };
}
