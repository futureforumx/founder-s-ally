/**
 * Global smart-formatting utility for social media URLs.
 *
 * Rules:
 *  1. Strip leading `@` symbols.
 *  2. Username-only input → prepend the platform's canonical base URL.
 *  3. Partial links (no protocol) → prepend `https://`.
 *  4. Already-valid `https://…` URLs → leave unchanged.
 */

export type SocialPlatform = "x" | "linkedin" | "linkedin_personal" | "instagram";

const BASE_URLS: Record<SocialPlatform, string> = {
  x: "https://x.com/",
  linkedin: "https://linkedin.com/company/",
  linkedin_personal: "https://linkedin.com/in/",
  instagram: "https://instagram.com/",
};

// Patterns that indicate the value already contains a domain path
const DOMAIN_PATTERNS: Record<SocialPlatform, RegExp> = {
  x: /(?:twitter\.com|x\.com)\//i,
  linkedin: /linkedin\.com\//i,
  linkedin_personal: /linkedin\.com\//i,
  instagram: /instagram\.com\//i,
};

/**
 * Format a raw user input into a canonical social URL.
 *
 * @param platform  Which social platform this input belongs to.
 * @param value     Raw user input (handle, partial URL, or full URL).
 * @returns         Formatted URL string, or empty string for blank input.
 */
export function formatSocialUrl(platform: SocialPlatform, value: string): string {
  if (!value || value.trim() === "") return "";

  let cleaned = value.trim();

  // Already a fully-qualified URL — leave it alone
  if (/^https?:\/\//i.test(cleaned)) {
    return cleaned;
  }

  // Strip leading protocol-less "www."
  cleaned = cleaned.replace(/^www\./, "");

  // If input contains the platform domain, just prepend https://
  if (DOMAIN_PATTERNS[platform].test(cleaned)) {
    return `https://${cleaned}`;
  }

  // At this point it's likely a bare username/handle
  // Strip leading @ and trailing slashes
  cleaned = cleaned.replace(/^@/, "").replace(/\/+$/, "");

  // If still contains slashes or dots it might be an unknown domain — prepend https://
  if (cleaned.includes("/") || cleaned.includes(".")) {
    return `https://${cleaned}`;
  }

  // Pure username → prepend base URL
  return `${BASE_URLS[platform]}${cleaned}`;
}
