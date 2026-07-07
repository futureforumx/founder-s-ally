import type { IncomingMessage } from "http";
import busboy from "busboy";
import { randomUUID } from "node:crypto";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export type R2UserAssetType = "pitch-deck" | "company-logo" | "founder-headshot";

const ASSET_LIMITS: Record<R2UserAssetType, number> = {
  "pitch-deck": 50 * 1024 * 1024,
  "company-logo": 5 * 1024 * 1024,
  "founder-headshot": 5 * 1024 * 1024,
};

const ASSET_PREFIX: Record<R2UserAssetType, string> = {
  "pitch-deck": "pitch-decks",
  "company-logo": "company-logos",
  "founder-headshot": "founder-headshots",
};

function e(name: string): string {
  return (process.env[name] ?? "").trim();
}

function r2Endpoint(): string {
  const direct = e("CF_R2_ENDPOINT");
  if (direct) return direct;
  const accountId = e("CF_R2_ACCOUNT_ID");
  return accountId ? `https://${accountId}.r2.cloudflarestorage.com` : "";
}

function publicBaseFor(type: R2UserAssetType): string {
  const keys: Record<R2UserAssetType, string[]> = {
    "pitch-deck": ["CF_R2_PUBLIC_BASE_PITCH_DECKS"],
    "company-logo": ["CF_R2_PUBLIC_BASE_COMPANY_LOGOS", "CF_R2_PUBLIC_BASE_LOGOS"],
    "founder-headshot": ["CF_R2_PUBLIC_BASE_FOUNDER_HEADSHOTS", "CF_R2_PUBLIC_BASE_HEADSHOTS"],
  };
  for (const key of keys[type]) {
    const v = e(key).replace(/\/$/, "");
    if (v) return v;
  }
  return "";
}

export function bucketFor(type: R2UserAssetType): string {
  const keys: Record<R2UserAssetType, string[]> = {
    "pitch-deck": ["CF_R2_BUCKET_PITCH_DECKS"],
    "company-logo": ["CF_R2_BUCKET_COMPANY_LOGOS", "CF_R2_BUCKET_LOGOS"],
    "founder-headshot": ["CF_R2_BUCKET_FOUNDER_HEADSHOTS", "CF_R2_BUCKET_HEADSHOTS"],
  };
  for (const key of keys[type]) {
    const v = e(key);
    if (v) return v;
  }
  return "";
}

export function r2ConfiguredFor(type: R2UserAssetType): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!r2Endpoint()) missing.push("CF_R2_ENDPOINT or CF_R2_ACCOUNT_ID");
  if (!e("CF_R2_ACCESS_KEY_ID")) missing.push("CF_R2_ACCESS_KEY_ID");
  if (!e("CF_R2_SECRET_ACCESS_KEY")) missing.push("CF_R2_SECRET_ACCESS_KEY");
  if (!bucketFor(type)) missing.push(`bucket for ${type}`);
  if (type !== "pitch-deck" && !publicBaseFor(type)) missing.push(`public base for ${type}`);
  return { ok: missing.length === 0, missing };
}

let cachedS3: S3Client | null = null;
function s3(): S3Client {
  if (!cachedS3) {
    cachedS3 = new S3Client({
      region: "auto",
      endpoint: r2Endpoint(),
      credentials: {
        accessKeyId: e("CF_R2_ACCESS_KEY_ID"),
        secretAccessKey: e("CF_R2_SECRET_ACCESS_KEY"),
      },
      forcePathStyle: false,
    });
  }
  return cachedS3;
}

function sanitizeFileName(raw: string): string {
  return (raw || "upload")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .slice(0, 96) || "upload";
}

function parseType(raw: string): R2UserAssetType | null {
  if (raw === "pitch-deck" || raw === "company-logo" || raw === "founder-headshot") return raw;
  return null;
}

function validateContent(type: R2UserAssetType, fileName: string, mimeType: string): string | null {
  const lower = fileName.toLowerCase();
  if (type === "pitch-deck") {
    if (lower.endsWith(".pdf") || lower.endsWith(".txt") || lower.endsWith(".md")) return null;
    return "Pitch deck must be PDF, TXT, or MD.";
  }
  if (mimeType.startsWith("image/")) return null;
  return "Image upload must have an image content type.";
}

export function r2StoredValue(type: R2UserAssetType, key: string): string {
  return type === "pitch-deck" ? `r2://${key}` : `${publicBaseFor(type)}/${key}`;
}

export function parseR2StoredValue(value: string): string | null {
  const t = value.trim();
  if (!t.startsWith("r2://")) return null;
  return t.slice("r2://".length);
}

export function parseMultipartAsset(req: IncomingMessage): Promise<
  | { ok: true; assetType: R2UserAssetType; fileName: string; mimeType: string; fileData: Buffer }
  | { ok: false; error: string }
> {
  return new Promise((resolve) => {
    let rawType = "";
    let fileName = "upload";
    let mimeType = "application/octet-stream";
    const chunks: Buffer[] = [];

    const bb = busboy({
      headers: req.headers,
      limits: { fileSize: Math.max(...Object.values(ASSET_LIMITS)), files: 1, fields: 10 },
    });

    bb.on("field", (name, val) => {
      if (name === "asset_type") rawType = String(val).trim();
    });

    bb.on("file", (name, file, info) => {
      if (name !== "file") {
        file.resume();
        return;
      }
      fileName = sanitizeFileName(info.filename || "upload");
      mimeType = info.mimeType || "application/octet-stream";
      file.on("data", (d: Buffer) => chunks.push(Buffer.isBuffer(d) ? d : Buffer.from(d)));
    });

    bb.on("error", (err: Error) => resolve({ ok: false, error: err.message || "Upload parse error" }));
    bb.on("partsLimit", () => resolve({ ok: false, error: "Too many parts" }));
    bb.on("filesLimit", () => resolve({ ok: false, error: "Too many files" }));
    bb.on("fieldsLimit", () => resolve({ ok: false, error: "Too many fields" }));
    bb.on("finish", () => {
      const assetType = parseType(rawType);
      if (!assetType) return resolve({ ok: false, error: "Invalid asset_type" });
      const fileData = Buffer.concat(chunks);
      if (!fileData.length) return resolve({ ok: false, error: "Missing file" });
      if (fileData.length > ASSET_LIMITS[assetType]) return resolve({ ok: false, error: "File too large" });
      const contentError = validateContent(assetType, fileName, mimeType);
      if (contentError) return resolve({ ok: false, error: contentError });
      resolve({ ok: true, assetType, fileName, mimeType, fileData });
    });

    req.pipe(bb);
  });
}

export async function uploadR2UserAsset(args: {
  userId: string;
  assetType: R2UserAssetType;
  fileName: string;
  mimeType: string;
  fileData: Buffer;
}): Promise<{ key: string; url: string; bucket: string }> {
  const bucket = bucketFor(args.assetType);
  const safeName = sanitizeFileName(args.fileName);
  const key = `${ASSET_PREFIX[args.assetType]}/${args.userId}/${Date.now()}-${randomUUID()}-${safeName}`;
  await s3().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: args.fileData,
      ContentType: args.mimeType,
      CacheControl: args.assetType === "pitch-deck" ? "private, max-age=0" : "public, max-age=31536000, immutable",
    }),
  );
  return { key, bucket, url: r2StoredValue(args.assetType, key) };
}

export async function deleteR2UserAsset(key: string, assetType: R2UserAssetType): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucketFor(assetType), Key: key }));
}

export async function signedR2PitchDeckUrl(key: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: bucketFor("pitch-deck"), Key: key }),
    { expiresIn: 60 * 60 },
  );
}
