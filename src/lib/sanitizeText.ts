/**
 * Render-time text sanitizer for user-facing fields (bio, description, summary).
 *
 * Strips HTML tags (including malformed/unclosed ones), decodes entities,
 * collapses whitespace, and rejects results that are too short to be useful.
 */

// Handles: normal tags, quoted attrs with > inside, unclosed tags at end of string
const TAG_RE = /<(?:"[^"]*"|'[^']*'|[^>"'])*>?/g;
// Remove anything that still looks like a leftover tag fragment after the above
const LEFTOVER_TAG_RE = /<[^<>]{0,200}$/g;
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
    .replace(TAG_RE, " ")            // strip well-formed + quoted-attr tags
    .replace(LEFTOVER_TAG_RE, " ")   // strip unclosed tag fragments at end
    .replace(ENTITY_RE, (m) => ENTITIES[m] ?? m)
    .replace(WHITESPACE_RE, " ")
    .trim();

  return clean.length >= 15 ? clean : null;
}
