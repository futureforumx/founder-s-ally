/**
 * repair-firm-investor-avatars.ts
 *
 * End-to-end avatar repair and canonicalization pipeline for firm_investors.
 *
 * For each investor needing repair:
 *   1. Classify current avatar_url (malformed / dead / mismatch / missing)
 *   2. Run discovery waterfall to find best headshot source
 *   3. Validate: HTTP 200, image/*, >= MIN_IMAGE_SIZE_BYTES
 *   4. Fetch full image bytes
 *   5. Upload to Cloudflare R2 (investor-headshots bucket)
 *   6. Write canonical R2 URL + metadata back to firm_investors:
 *        avatar_url                ← R2 public CDN URL
 *        avatar_source_url         ← original source URL
 *        avatar_source_type        ← "r2_canonical"
 *        avatar_confidence         ← discovery confidence score
 *        avatar_last_verified_at   ← now()
 *        avatar_needs_review       ← FALSE (if confidence >= MIN_CONFIDENCE_AUTO)
 *   7. If confidence < MIN_CONFIDENCE_AUTO: set avatar_needs_review=TRUE, skip write
 *
 * Repair modes (REPAIR_MODE env):
 *   "broken"   (default) — only rows classified as malformed/dead/non_image/mismatch/missing
 *   "third_party"        — broken + valid third-party (migrate all to R2)
 *   "all"                — every row (force re-upload)
 *   "review"             — only rows where avatar_needs_review=TRUE
 *
 * Usage:
 *   npx tsx scripts/repair-firm-investor-avatars.ts
 *   DRY_RUN=1 npx tsx scripts/repair-firm-investor-avatars.ts
 *   REPAIR_MODE=third_party npx tsx scripts/repair-firm-investor-avatars.ts
 *   FIRM_ID=<uuid> npx tsx scripts/repair-firm-investor-avatars.ts
 *   CONCURRENCY=5 npx tsx scripts/repair-firm-investor-avatars.ts
 *   LIMIT=50 npx tsx scripts/repair-firm-investor-avatars.ts
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "./lib/loadEnvFiles";
import {
  validateAvatarUrl,
  discoverHeadshot,
  classifySourceType,
  isCanonicalR2Url,
  MIN_IMAGE_SIZE_BYTES,
  MIN_CONFIDENCE_AUTO,
  FETCH_TIMEOUT_MS,
  type AvatarClassification,
  type InvestorRecord,
} from "./lib/avatarValidation";

loadEnvFiles([".env", ".env.local"]);

// ── Config ────────────────────────────────────────────────────────────────────

function req(name: string): string {
  const v = (process.env[name] || "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}
function opt(name: string): string { return (process.env[name] || "").trim(); }

const SUPABASE_URL    = req("SUPABASE_URL");
const SUPABASE_KEY    = req("SUPABASE_SERVICE_ROLE_KEY");
const R2_ENDPOINT     = req("CF_R2_ENDPOINT");
const R2_ACCESS_KEY   = req("CF_R2_ACCESS_KEY_ID");
const R2_SECRET_KEY   = req("CF_R2_SECRET_ACCESS_KEY");
const BUCKET          = req("CF_R2_BUCKET_HEADSHOTS");
const R2_PUBLIC_BASE  = req("CF_R2_PUBLIC_BASE_HEADSHOTS");

const DRY_RUN        = ["1","true","yes"].includes(opt("DRY_RUN").toLowerCase());
const REPAIR_MODE    = (opt("REPAIR_MODE") || "broken") as "broken" | "third_party" | "all" | "review";
const FIRM_ID_FILTER = opt("FIRM_ID") || null;
const ROW_LIMIT      = parseInt(opt("LIMIT") || "0", 10) || null;
const CONCURRENCY    = Math.max(1, parseInt(opt("CONCURRENCY") || "5", 10));
const DELAY_MS       = Math.max(0, parseInt(opt("DELAY_MS") || "200", 10));

// ── Singletons ────────────────────────────────────────────────────────────────

let _s3: S3Client;
function getS3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      region: "auto",
      endpoint: R2_ENDPOINT,
      credentials: { accessKeyId: R2_ACCESS_KEY, secretAccessKey: R2_SECRET_KEY },
      forcePathStyle: false,
    });
  }
  return _s3;
}

let _sb: SupabaseClient;
function getSb(): SupabaseClient {
  if (!_sb) _sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  return _sb;
}

// ── Image fetch ───────────────────────────────────────────────────────────────

type ImageFormat = "avif" | "webp" | "jpg" | "png" | "gif" | "svg";

function detectFormat(url: string, contentType: string): ImageFormat {
  const ct = contentType.toLowerCase();
  if (ct.includes("avif"))  return "avif";
  if (ct.includes("webp"))  return "webp";
  if (ct.includes("svg"))   return "svg";
  if (ct.includes("gif"))   return "gif";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  if (ct.includes("png"))   return "png";
  const path = url.toLowerCase().split("?")[0];
  if (path.endsWith(".avif")) return "avif";
  if (path.endsWith(".webp")) return "webp";
  if (path.endsWith(".svg"))  return "svg";
  if (path.endsWith(".gif"))  return "gif";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "jpg";
  return "png";
}

async function fetchImageBytes(url: string): Promise<{ buf: Buffer; format: ImageFormat; contentType: string } | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VektaBot/1.0)",
        "Accept": "image/*,*/*;q=0.8",
      },
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const ct = resp.headers.get("content-type") || "image/jpeg";
    if (!ct.toLowerCase().includes("image/")) return null;
    const ab = await resp.arrayBuffer();
    if (ab.byteLength < MIN_IMAGE_SIZE_BYTES) return null;
    return { buf: Buffer.from(ab), format: detectFormat(url, ct), contentType: ct };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

// ── R2 upload ─────────────────────────────────────────────────────────────────

async function uploadToR2(key: string, buf: Buffer, contentType: string): Promise<boolean> {
  const s3 = getS3();
  // Skip if already uploaded (idempotent)
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true; // already exists
  } catch { /* not found — proceed */ }
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: buf, ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return true;
}

function buildR2Key(investorId: string, fullName: string, format: ImageFormat): string {
  const safeSlug = fullName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
  return `investors/${investorId}/${safeSlug}.${format}`;
}

// ── Supabase write-back ───────────────────────────────────────────────────────

interface WriteBackParams {
  investorId: string;
  avatarUrl: string;
  sourceUrl: string;
  sourceType: string;
  confidence: number;
  needsReview: boolean;
}

async function writeBackAvatar(params: WriteBackParams): Promise<void> {
  const { error } = await getSb()
    .from("firm_investors")
    .update({
      avatar_url:                params.avatarUrl,
      avatar_source_url:         params.sourceUrl,
      avatar_source_type:        params.sourceType,
      avatar_confidence:         params.confidence,
      avatar_last_verified_at:   new Date().toISOString(),
      avatar_needs_review:       params.needsReview,
    })
    .eq("id", params.investorId);

  if (error) throw new Error(`writeBackAvatar(${params.investorId}): ${error.message}`);
}

async function markNeedsReview(investorId: string): Promise<void> {
  const { error } = await getSb()
    .from("firm_investors")
    .update({ avatar_needs_review: true })
    .eq("id", investorId);
  if (error) throw new Error(`markNeedsReview(${investorId}): ${error.message}`);
}

// ── Concurrency pool ──────────────────────────────────────────────────────────

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

async function pool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, idx: number) => Promise<void>,
): Promise<void> {
  let i = 0;
  const worker = async () => { while (i < items.length) { const j = i++; await fn(items[j], j); } };
  await Promise.all(Array.from({ length: concurrency }, worker));
}

// ── Row selection ─────────────────────────────────────────────────────────────

async function fetchInvestors(): Promise<InvestorRecord[]> {
  let query = getSb()
    .from("firm_investors")
    .select("id, full_name, first_name, last_name, avatar_url, linkedin_url, x_url, email, avatar_needs_review, ready_for_live")
    .is("deleted_at", null);

  if (FIRM_ID_FILTER) query = query.eq("firm_id", FIRM_ID_FILTER);

  switch (REPAIR_MODE) {
    case "broken":
      // malformed, truncated, null — skip already-canonical R2 and valid third-party
      query = query.or(
        `avatar_url.is.null,avatar_needs_review.eq.true`,
      );
      break;
    case "third_party":
      // everything that isn't already canonical R2
      query = query.not("avatar_url", "like", `${R2_PUBLIC_BASE.replace(/\/$/, "")}%`);
      break;
    case "review":
      query = query.eq("avatar_needs_review", true);
      break;
    case "all":
      // no extra filter — all rows
      break;
  }

  if (ROW_LIMIT) query = (query as any).limit(ROW_LIMIT);

  const { data, error } = await query.order("full_name");
  if (error) { console.error("Fetch error:", error.message); process.exit(1); }
  return (data ?? []) as InvestorRecord[];
}

// ── Per-investor repair ───────────────────────────────────────────────────────

interface RepairOutcome {
  id: string;
  full_name: string;
  status: "repaired" | "review_queue" | "no_source" | "skipped" | "already_r2" | "error";
  old_url: string | null;
  new_url?: string;
  source?: string;
  confidence?: number;
  error?: string;
}

async function repairOne(inv: InvestorRecord): Promise<RepairOutcome> {
  const base: RepairOutcome = { id: inv.id, full_name: inv.full_name, old_url: inv.avatar_url, status: "no_source" };

  // Already canonical R2 and we're in "broken" mode — skip
  if (REPAIR_MODE === "broken" && inv.avatar_url && isCanonicalR2Url(inv.avatar_url, R2_PUBLIC_BASE)) {
    return { ...base, status: "already_r2", new_url: inv.avatar_url };
  }

  // Discover best headshot
  const discovered = await discoverHeadshot(inv);

  if (!discovered) {
    // No source found — mark for review if ready_for_live
    if ((inv as any).ready_for_live && !DRY_RUN) {
      await markNeedsReview(inv.id);
    }
    return { ...base, status: "no_source" };
  }

  // Below confidence threshold → review queue
  if (discovered.confidence < MIN_CONFIDENCE_AUTO) {
    if (!DRY_RUN) await markNeedsReview(inv.id);
    return {
      ...base,
      status: "review_queue",
      source: discovered.sourceType,
      confidence: discovered.confidence,
    };
  }

  // Fetch image bytes
  const img = await fetchImageBytes(discovered.url);
  if (!img) {
    // Source URL validated but couldn't fetch bytes — mark review
    if (!DRY_RUN) await markNeedsReview(inv.id);
    return { ...base, status: "review_queue", error: "could not fetch image bytes", source: discovered.sourceType };
  }

  // Upload to R2
  const r2Key = buildR2Key(inv.id, inv.full_name, img.format);
  const cdnUrl = `${R2_PUBLIC_BASE.replace(/\/$/, "")}/${r2Key}`;

  if (!DRY_RUN) {
    await uploadToR2(r2Key, img.buf, img.contentType);
    await writeBackAvatar({
      investorId:   inv.id,
      avatarUrl:    cdnUrl,
      sourceUrl:    discovered.url,
      sourceType:   "r2_canonical",
      confidence:   discovered.confidence,
      needsReview:  false,
    });
  }

  return {
    ...base,
    status: "repaired",
    new_url: cdnUrl,
    source: discovered.sourceType,
    confidence: discovered.confidence,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`=== Firm Investor Avatar Repair ===`);
  console.log(`mode=${REPAIR_MODE} dry_run=${DRY_RUN} concurrency=${CONCURRENCY}`);
  if (FIRM_ID_FILTER) console.log(`firm_id=${FIRM_ID_FILTER}`);
  console.log();

  const investors = await fetchInvestors();
  console.log(`Found ${investors.length} investor(s) to process\n`);

  const outcomes: RepairOutcome[] = new Array(investors.length);
  let done = 0;

  await pool(investors, CONCURRENCY, async (inv, i) => {
    try {
      outcomes[i] = await repairOne(inv);
    } catch (err: any) {
      outcomes[i] = { id: inv.id, full_name: inv.full_name, old_url: inv.avatar_url, status: "error", error: String(err?.message ?? err) };
    }
    done++;
    if (DELAY_MS > 0 && i < investors.length - 1) await sleep(DELAY_MS);

    if (done % 25 === 0 || done === investors.length) {
      const cnts = countOutcomes(outcomes.filter(Boolean));
      process.stdout.write(
        `\r  [${done}/${investors.length}]  repaired=${cnts.repaired} review=${cnts.review_queue} no_source=${cnts.no_source} error=${cnts.error}   `,
      );
    }
  });

  console.log("\n");

  // ── Summary ──────────────────────────────────────────────────────────────────

  const cnts = countOutcomes(outcomes);
  console.log("=== Repair Summary ===");
  console.log(`  repaired     : ${cnts.repaired}${DRY_RUN ? " (dry run)" : ""}`);
  console.log(`  already_r2   : ${cnts.already_r2}`);
  console.log(`  review_queue : ${cnts.review_queue}`);
  console.log(`  no_source    : ${cnts.no_source}`);
  console.log(`  error        : ${cnts.error}`);
  console.log(`  TOTAL        : ${outcomes.length}`);

  if (cnts.repaired > 0) {
    console.log("\n=== Repaired (up to 20) ===");
    outcomes.filter((o) => o.status === "repaired").slice(0, 20).forEach((o) => {
      console.log(`  ✓ ${o.full_name.padEnd(30)} ${o.new_url?.substring(0, 70)}`);
    });
  }

  if (cnts.review_queue > 0) {
    console.log("\n=== Review Queue (up to 20) ===");
    outcomes.filter((o) => o.status === "review_queue").slice(0, 20).forEach((o) => {
      console.log(`  ? ${o.full_name.padEnd(30)} confidence=${o.confidence ?? "n/a"} source=${o.source ?? "n/a"}`);
    });
  }

  if (cnts.no_source > 0) {
    console.log("\n=== No Source Found (up to 10) ===");
    outcomes.filter((o) => o.status === "no_source").slice(0, 10).forEach((o) => {
      console.log(`  ✗ ${o.full_name}`);
    });
  }

  if (cnts.error > 0) {
    console.log("\n=== Errors ===");
    outcomes.filter((o) => o.status === "error").forEach((o) => {
      console.log(`  ! ${o.full_name}: ${o.error}`);
    });
  }

  if (DRY_RUN) {
    console.log("\n⚠  DRY RUN — no changes written. Remove DRY_RUN=1 to apply.");
  } else {
    console.log("\n✓ All changes written to firm_investors and R2.");
  }
}

function countOutcomes(arr: RepairOutcome[]) {
  const out = { repaired: 0, already_r2: 0, review_queue: 0, no_source: 0, skipped: 0, error: 0 };
  for (const o of arr) if (o?.status) out[o.status as keyof typeof out] = (out[o.status as keyof typeof out] ?? 0) + 1;
  return out;
}

main().catch((err) => { console.error("Fatal:", err); process.exit(1); });
