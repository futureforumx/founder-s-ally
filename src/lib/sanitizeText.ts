/**
 * Render-time text sanitizer for user-facing fields (bio, description, summary).
 *
 * Defence-in-depth: database is cleaned periodically, but new enrichment
 * passes or imports may introduce HTML/SVG scraping artefacts. This utility
 * strips them before display so the UI never renders raw markup.
 *
 * Rules:
 *   1. Strip all HTML/XML/SVG tags
 *   2. Decode common HTML entities
 *   3. Collapse runs of whitespace into single spaces
 *   4. Trim leading/trailing whitespace
 *   5. Return null for empty or too-short results (< 15 chars)
 */

const TAG_RE = /<[^>]+>/g;
const WHITESPACE_RE = /\s+/g;

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};
const ENTITY_RE = /&(?:amp|lt|gt|quot|apos|nbsp|#39);/g;

export function sanitizeText(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let clean = raw
    .replace(TAG_RE, " ")
    .replace(ENTITY_RE, (m) => ENTITIES[m] ?? m)
    .replace(WHITESPACE_RE, " ")
    .trim();

  return clean.length >= 15 ? clean : null;
}
