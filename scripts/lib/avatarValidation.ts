/**
 * avatarValidation.ts
 *
 * Shared utilities for validating, classifying, and writing investor avatar URLs.
 *
 * Rules enforced before any write to firm_investors.avatar_url:
 *   - Absolute URL (http/https)
 *   - Not obviously malformed / truncated
 *   - HTTP 200 response (after redirects)
 *   - Content-Type is image/*
 *   - Response body >= MIN_IMAGE_SIZE_BYTES
 *   - For R2 canonical writes: URL must be from CF_R2_PUBLIC_BASE_HEADSHOTS
 */

// ── Constants ─────────────────────────────────────────────────────────────────

export const MIN_IMAGE_SIZE_BYTES = 4_096;   // 4 KB — filters default blank avatars
export const FETCH_TIMEOUT_MS     = 12_000;
export const MIN_CONFIDENCE_AUTO  = 0.70;    // below this → review queue

// Source-type taxonomy
export type AvatarSourceType =
  | "r2_canonical"
  | "nfx"
  | "webflow"
  | "unavatar"
  | "apollo"
  | "pdl"
  | "linkedin_direct"
  | "x_direct"
  | "manual"
  | "other";

// Classification buckets produced by classifyAvatarUrl()
export type AvatarClassification =
  | "valid_r2"         // already canonical R2 URL, verified
  | "valid_third_party"// accessible third-party image
  | "malformed"        // cannot parse as URL / obviously truncated
  | "dead"             // HTTP error / timeout
  | "non_image"        // returns HTML or non-image content-type
  | "mismatch_suspect" // filename references a different person's name
  | "missing";         // avatar_url IS NULL

export interface AvatarValidationResult {
  ok: boolean;
  classification: AvatarClassification;
  contentType?: string;
  sizeBytes?: number;
  errorReason?: string;
  finalUrl?: string; // URL after redirects
}

// ── URL pre-checks (no network) ───────────────────────────────────────────────

/** Returns true if the URL string is absolutely fine to attempt fetching. */
export function isWellFormedUrl(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  try {
    const u = new URL(raw.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Returns true if the URL looks truncated / malformed before we even fetch.
 * Heuristics:
 *   - ends with "(" or "%20(" — filename has an open paren with no closing
 *   - no file extension AND no query string (for CDN paths that normally have ext)
 *   - unusually short path segment (< 3 chars before any extension)
 */
export function isTruncatedUrl(raw: string | null | undefined): boolean {
  if (!raw?.trim()) return false;
  const url = raw.trim();
  const path = url.split("?")[0];
  // Open parenthesis at end (Webflow truncation pattern)
  if (path.endsWith("(") || path.endsWith("%20(") || path.endsWith("%20%281")) return true;
  // Path has no dot at all AND host is a known CDN (these always have extensions)
  const knownCdnHosts = ["cdn.prod.website-files.com", "cloudfront.net", "ctfassets.net", "imgix.net"];
  try {
    const u = new URL(url);
    const pathLower = u.pathname.toLowerCase();
    const isCdn = knownCdnHosts.some((h) => u.hostname.includes(h));
    if (isCdn && !pathLower.match(/\.(avif|webp|jpg|jpeg|png|gif|svg)$/)) return true;
  } catch {
    return true; // can't parse → malformed
  }
  return false;
}

/** Returns true if the URL is already a canonical R2 headshot URL. */
export function isCanonicalR2Url(
  raw: string | null | undefined,
  r2PublicBase: string,
): boolean {
  if (!raw?.trim() || !r2PublicBase) return false;
  return raw.trim().startsWith(r2PublicBase.replace(/\/$/, ""));
}

/**
 * Detect likely person-photo mismatch by comparing the filename slug with
 * the investor's actual name.
 *
 * Strategy: decode the URL path's last segment, extract word tokens,
 * and check if ANY of the investor's name tokens appear. Returns false
 * (suspect mismatch) only when the filename contains another person's
 * name tokens but zero tokens from the actual investor's name.
 */
export function isSuspectedMismatch(
  raw: string | null | undefined,
  investorFullName: string,
): boolean {
  if (!raw?.trim()) return false;
  try {
    const u = new URL(raw.trim());
    const segment = decodeURIComponent(u.pathname.split("/").filter(Boolean).pop() ?? "");
    if (!segment) return false;

    const segTokens = segment.toLowerCase().replace(/\.(avif|webp|jpg|jpeg|png|gif|svg)$/i, "").split(/[\s_\-%()+]+/).filter((t) => t.length > 2);
    if (segTokens.length === 0) return false;

    const nameTokens = investorFullName.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    // If any name token appears in the filename, it's probably a match
    const anyMatch = nameTokens.some((nt) => segTokens.some((st) => st.includes(nt) || nt.includes(st)));
    return !anyMatch;
  } catch {
    return false;
  }
}

/** Classify source type from URL string. */
export function classifySourceType(raw: string | null | undefined): AvatarSourceType {
  if (!raw) return "other";
  const url = raw.toLowerCase();
  if (url.includes("r2.dev") || url.includes("r2.cloudflarestorage.com")) return "r2_canonical";
  if (url.includes("signal-api.nfx.com")) return "nfx";
  if (url.includes("website-files.com")) return "webflow";
  if (url.includes("unavatar.io")) return "unavatar";
  if (url.includes("apollo.io") || url.includes("apllo.io")) return "apollo";
  if (url.includes("peopledatalabs") || url.includes("pdl")) return "pdl";
  if (url.includes("media.licdn.com") || url.includes("linkedin.com")) return "linkedin_direct";
  if (url.includes("pbs.twimg.com") || url.includes("x.com") || url.includes("twitter.com")) return "x_direct";
  return "other";
}

// ── Network validation ────────────────────────────────────────────────────────

/**
 * Fetch and validate a URL as a usable headshot.
 * Returns AvatarValidationResult with ok=true only when all checks pass.
 */
export async function validateAvatarUrl(
  raw: string | null | undefined,
  investorFullName?: string,
  r2PublicBase?: string,
): Promise<AvatarValidationResult> {
  if (!raw?.trim()) {
    return { ok: false, classification: "missing", errorReason: "null or empty" };
  }

  if (!isWellFormedUrl(raw)) {
    return { ok: false, classification: "malformed", errorReason: "not a valid http/https URL" };
  }

  if (isTruncatedUrl(raw)) {
    return { ok: false, classification: "malformed", errorReason: "URL appears truncated" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const resp = await fetch(raw.trim(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; VektaAuditBot/1.0)",
        "Accept": "image/*,*/*;q=0.8",
      },
    });

    clearTimeout(timer);

    if (!resp.ok) {
      return {
        ok: false,
        classification: "dead",
        errorReason: `HTTP ${resp.status}`,
        finalUrl: resp.url,
      };
    }

    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("image/")) {
      return {
        ok: false,
        classification: "non_image",
        errorReason: `content-type: ${contentType}`,
        finalUrl: resp.url,
      };
    }

    const buf = await resp.arrayBuffer();
    const sizeBytes = buf.byteLength;

    if (sizeBytes < MIN_IMAGE_SIZE_BYTES) {
      return {
        ok: false,
        classification: "non_image",
        errorReason: `too small: ${sizeBytes} bytes`,
        contentType,
        sizeBytes,
        finalUrl: resp.url,
      };
    }

    // Person-photo mismatch check (only for Webflow CDN URLs — most error-prone)
    if (investorFullName && raw.includes("website-files.com")) {
      if (isSuspectedMismatch(raw, investorFullName)) {
        return {
          ok: false,
          classification: "mismatch_suspect",
          errorReason: "filename does not match investor name",
          contentType,
          sizeBytes,
          finalUrl: resp.url,
        };
      }
    }

    // Determine bucket classification
    const isR2 = r2PublicBase ? isCanonicalR2Url(raw, r2PublicBase) : false;
    const classification: AvatarClassification = isR2 ? "valid_r2" : "valid_third_party";

    return { ok: true, classification, contentType, sizeBytes, finalUrl: resp.url };
  } catch (err: any) {
    clearTimeout(timer);
    return {
      ok: false,
      classification: "dead",
      errorReason: err?.name === "AbortError" ? "timeout" : String(err?.message ?? err),
    };
  }
}

// ── Headshot discovery waterfall ─────────────────────────────────────────────

export interface InvestorRecord {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  linkedin_url: string | null;
  x_url: string | null;
  email: string | null;
}

export interface DiscoveredHeadshot {
  url: string;
  sourceType: AvatarSourceType;
  confidence: number;
  validationResult: AvatarValidationResult;
}

function parseXHandle(xUrl: string | null | undefined): string | null {
  if (!xUrl?.trim()) return null;
  try {
    const u = xUrl.includes("://") ? new URL(xUrl) : new URL(`https://${xUrl}`);
    const first = (u.pathname.split("/").filter(Boolean)[0] ?? "").replace(/^@/, "").trim();
    return first || null;
  } catch {
    return null;
  }
}

/**
 * Try a list of candidate URLs in order and return the first that validates.
 * Confidence is set based on the source quality.
 */
export async function discoverHeadshot(investor: InvestorRecord): Promise<DiscoveredHeadshot | null> {
  type Candidate = { url: string; sourceType: AvatarSourceType; confidence: number };

  const candidates: Candidate[] = [];

  // 1. Existing avatar (if it looks non-truncated) — try to rehabilitate it
  if (investor.avatar_url && !isTruncatedUrl(investor.avatar_url) && isWellFormedUrl(investor.avatar_url)) {
    const sourceType = classifySourceType(investor.avatar_url);
    // Only preserve if it's a real headshot URL (not a known garbage source)
    if (!["linkedin_direct", "unavatar"].includes(sourceType)) {
      candidates.push({ url: investor.avatar_url, sourceType, confidence: 0.85 });
    }
  }

  // 2. Unavatar with LinkedIn (high confidence — resolves to LinkedIn profile pic)
  if (investor.linkedin_url?.trim()) {
    candidates.push({
      url: `https://unavatar.io/${encodeURIComponent(investor.linkedin_url.trim())}`,
      sourceType: "unavatar",
      confidence: 0.82,
    });
  }

  // 3. Unavatar with X/Twitter (high confidence)
  const xHandle = parseXHandle(investor.x_url);
  if (xHandle) {
    candidates.push({
      url: `https://unavatar.io/x/${encodeURIComponent(xHandle)}`,
      sourceType: "unavatar",
      confidence: 0.80,
    });
  }

  // 4. Unavatar with email
  if (investor.email?.trim()) {
    candidates.push({
      url: `https://unavatar.io/${encodeURIComponent(investor.email.trim())}`,
      sourceType: "unavatar",
      confidence: 0.72,
    });
  }

  // 5. Unavatar with full name (low specificity — many false positives)
  if (investor.full_name?.trim()) {
    candidates.push({
      url: `https://unavatar.io/${encodeURIComponent(investor.full_name.trim())}`,
      sourceType: "unavatar",
      confidence: 0.55, // below MIN_CONFIDENCE_AUTO → goes to review
    });
  }

  for (const candidate of candidates) {
    const result = await validateAvatarUrl(
      candidate.url,
      investor.full_name,
    );
    if (result.ok) {
      return {
        url: candidate.url,
        sourceType: candidate.sourceType,
        confidence: candidate.confidence,
        validationResult: result,
      };
    }
  }

  return null;
}
