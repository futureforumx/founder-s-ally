/** Paths that are not profile handles on x.com / twitter.com */
const RESERVED_SEGMENTS = new Set([
  "intent",
  "search",
  "hashtags",
  "home",
  "explore",
  "settings",
  "compose",
  "share",
  "login",
  "signup",
  "download",
  "messages",
  "notifications",
  "topics",
  "lists",
  "spaces",
  "i",
]);

function sanitizeHandle(segment: string): string | null {
  const decoded = decodeURIComponent(segment).replace(/^@+/, "").trim();
  if (!decoded) return null;
  // X usernames: letters, digits, underscore; practical upper bound kept loose for future changes
  if (!/^[A-Za-z0-9_]{1,30}$/.test(decoded)) return null;
  return decoded.toLowerCase();
}

/**
 * Normalizes firm `x_url` into a bare X handle for embedded profile timelines.
 * Supports full URLs, @handle, and raw handles. Returns null when unusable.
 */
export function extractXHandle(xUrl?: string | null): string | null {
  if (xUrl == null) return null;
  const raw = String(xUrl).trim();
  if (!raw) return null;

  if (!/^https?:\/\//i.test(raw)) {
    return sanitizeHandle(raw);
  }

  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./i, "").toLowerCase();
    const allowed =
      host === "x.com" ||
      host === "twitter.com" ||
      host === "mobile.twitter.com" ||
      host === "mobile.x.com";

    if (!allowed) return null;

    const path = u.pathname.replace(/\/+$/, "");
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) return null;

    const first = segments[0].toLowerCase();

    if (first === "intent" && segments[1] === "user") {
      const screen = u.searchParams.get("screen_name");
      return screen ? sanitizeHandle(screen) : null;
    }

    if (first === "i" && segments[1] === "user") return null;
    if (RESERVED_SEGMENTS.has(first)) return null;

    return sanitizeHandle(segments[0]);
  } catch {
    return null;
  }
}
