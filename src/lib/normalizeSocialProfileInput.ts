export type SocialProfilePlatform = "linkedin" | "x";

export interface NormalizedSocialProfileInput {
  platform: SocialProfilePlatform;
  normalized: string;
  display: string;
}

const LINKEDIN_PROFILE_RE = /^[A-Za-z0-9-]{3,100}$/;
const X_HANDLE_RE = /^[A-Za-z0-9_]{1,15}$/;

function firstPathSegment(pathname: string, prefix: string): string {
  return pathname.slice(prefix.length).split("/")[0]?.split("?")[0]?.split("#")[0]?.trim() ?? "";
}

function normalizeLinkedInSlug(slug: string): NormalizedSocialProfileInput | null {
  const clean = decodeURIComponent(slug).trim();
  if (!LINKEDIN_PROFILE_RE.test(clean)) return null;
  return {
    platform: "linkedin",
    normalized: `https://www.linkedin.com/in/${clean}`,
    display: "LinkedIn",
  };
}

function normalizeXHandle(handle: string): NormalizedSocialProfileInput | null {
  const clean = handle.replace(/^@/, "").trim();
  if (!X_HANDLE_RE.test(clean)) return null;
  return {
    platform: "x",
    normalized: `https://x.com/${clean}`,
    display: "X",
  };
}

export function normalizeSocialProfileInput(raw: string): NormalizedSocialProfileInput | null {
  const value = raw.trim();
  if (!value) return null;

  if (value.startsWith("@")) {
    return normalizeXHandle(value);
  }

  const linkedInPathMatch = value.match(/^\/?in\/([^/?#\s]+)\/?$/i);
  if (linkedInPathMatch?.[1]) {
    return normalizeLinkedInSlug(linkedInPathMatch[1]);
  }

  let href = value;
  if (!/^https?:\/\//i.test(href)) {
    href = `https://${href.replace(/^\/+/, "")}`;
  }

  try {
    const url = new URL(href);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const path = url.pathname.replace(/\/+/g, "/").replace(/\/$/, "");
    const lowerPath = path.toLowerCase();

    if (host === "linkedin.com" && lowerPath.startsWith("/in/")) {
      return normalizeLinkedInSlug(firstPathSegment(path, "/in/"));
    }

    if ((host === "x.com" || host === "twitter.com") && path && path !== "/") {
      const handle = firstPathSegment(path, "/");
      return normalizeXHandle(handle);
    }
  } catch {
    return null;
  }

  return null;
}
