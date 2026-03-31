import { useEffect, useMemo, useState } from "react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { getFaviconUrl } from "@/utils/company-utils";

function md5(input: string): string {
  function rotateLeft(x: number, c: number) {
    return (x << c) | (x >>> (32 - c));
  }

  function add32(a: number, b: number) {
    return (a + b) & 0xffffffff;
  }

  function cmn(q: number, a: number, b: number, x: number, s: number, t: number) {
    return add32(rotateLeft(add32(add32(a, q), add32(x, t)), s), b);
  }

  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }

  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }

  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }

  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number) {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  function toBlocks(str: string) {
    const n = (((str.length + 8) >> 6) + 1) * 16;
    const blocks = new Array<number>(n).fill(0);
    for (let i = 0; i < str.length; i++) {
      blocks[i >> 2] |= str.charCodeAt(i) << ((i % 4) * 8);
    }
    blocks[str.length >> 2] |= 0x80 << ((str.length % 4) * 8);
    blocks[n - 2] = str.length * 8;
    return blocks;
  }

  function toHex(num: number) {
    const hex = "0123456789abcdef";
    let out = "";
    for (let i = 0; i < 4; i++) {
      out += hex[(num >> (i * 8 + 4)) & 0x0f] + hex[(num >> (i * 8)) & 0x0f];
    }
    return out;
  }

  const data = unescape(encodeURIComponent(input));
  const x = toBlocks(data);
  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;

  for (let i = 0; i < x.length; i += 16) {
    const oa = a;
    const ob = b;
    const oc = c;
    const od = d;

    a = ff(a, b, c, d, x[i], 7, -680876936);
    d = ff(d, a, b, c, x[i + 1], 12, -389564586);
    c = ff(c, d, a, b, x[i + 2], 17, 606105819);
    b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, x[i + 4], 7, -176418897);
    d = ff(d, a, b, c, x[i + 5], 12, 1200080426);
    c = ff(c, d, a, b, x[i + 6], 17, -1473231341);
    b = ff(b, c, d, a, x[i + 7], 22, -45705983);
    a = ff(a, b, c, d, x[i + 8], 7, 1770035416);
    d = ff(d, a, b, c, x[i + 9], 12, -1958414417);
    c = ff(c, d, a, b, x[i + 10], 17, -42063);
    b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, x[i + 12], 7, 1804603682);
    d = ff(d, a, b, c, x[i + 13], 12, -40341101);
    c = ff(c, d, a, b, x[i + 14], 17, -1502002290);
    b = ff(b, c, d, a, x[i + 15], 22, 1236535329);

    a = gg(a, b, c, d, x[i + 1], 5, -165796510);
    d = gg(d, a, b, c, x[i + 6], 9, -1069501632);
    c = gg(c, d, a, b, x[i + 11], 14, 643717713);
    b = gg(b, c, d, a, x[i], 20, -373897302);
    a = gg(a, b, c, d, x[i + 5], 5, -701558691);
    d = gg(d, a, b, c, x[i + 10], 9, 38016083);
    c = gg(c, d, a, b, x[i + 15], 14, -660478335);
    b = gg(b, c, d, a, x[i + 4], 20, -405537848);
    a = gg(a, b, c, d, x[i + 9], 5, 568446438);
    d = gg(d, a, b, c, x[i + 14], 9, -1019803690);
    c = gg(c, d, a, b, x[i + 3], 14, -187363961);
    b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, x[i + 13], 5, -1444681467);
    d = gg(d, a, b, c, x[i + 2], 9, -51403784);
    c = gg(c, d, a, b, x[i + 7], 14, 1735328473);
    b = gg(b, c, d, a, x[i + 12], 20, -1926607734);

    a = hh(a, b, c, d, x[i + 5], 4, -378558);
    d = hh(d, a, b, c, x[i + 8], 11, -2022574463);
    c = hh(c, d, a, b, x[i + 11], 16, 1839030562);
    b = hh(b, c, d, a, x[i + 14], 23, -35309556);
    a = hh(a, b, c, d, x[i + 1], 4, -1530992060);
    d = hh(d, a, b, c, x[i + 4], 11, 1272893353);
    c = hh(c, d, a, b, x[i + 7], 16, -155497632);
    b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, x[i + 13], 4, 681279174);
    d = hh(d, a, b, c, x[i], 11, -358537222);
    c = hh(c, d, a, b, x[i + 3], 16, -722521979);
    b = hh(b, c, d, a, x[i + 6], 23, 76029189);
    a = hh(a, b, c, d, x[i + 9], 4, -640364487);
    d = hh(d, a, b, c, x[i + 12], 11, -421815835);
    c = hh(c, d, a, b, x[i + 15], 16, 530742520);
    b = hh(b, c, d, a, x[i + 2], 23, -995338651);

    a = ii(a, b, c, d, x[i], 6, -198630844);
    d = ii(d, a, b, c, x[i + 7], 10, 1126891415);
    c = ii(c, d, a, b, x[i + 14], 15, -1416354905);
    b = ii(b, c, d, a, x[i + 5], 21, -57434055);
    a = ii(a, b, c, d, x[i + 12], 6, 1700485571);
    d = ii(d, a, b, c, x[i + 3], 10, -1894986606);
    c = ii(c, d, a, b, x[i + 10], 15, -1051523);
    b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, x[i + 8], 6, 1873313359);
    d = ii(d, a, b, c, x[i + 15], 10, -30611744);
    c = ii(c, d, a, b, x[i + 6], 15, -1560198380);
    b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, x[i + 4], 6, -145523070);
    d = ii(d, a, b, c, x[i + 11], 10, -1120210379);
    c = ii(c, d, a, b, x[i + 2], 15, 718787259);
    b = ii(b, c, d, a, x[i + 9], 21, -343485551);

    a = add32(a, oa);
    b = add32(b, ob);
    c = add32(c, oc);
    d = add32(d, od);
  }

  return toHex(a) + toHex(b) + toHex(c) + toHex(d);
}

function trimOrNull(value?: string | null): string | null {
  const v = value?.trim();
  return v ? v : null;
}

function parseHost(input?: string | null): string | null {
  const raw = input?.trim();
  if (!raw) return null;
  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

function parseXPathHandle(xUrl?: string | null): string | null {
  const raw = xUrl?.trim();
  if (!raw) return null;
  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "x.com" && host !== "twitter.com") return null;
    const first = (url.pathname.split("/").filter(Boolean)[0] || "").replace(/^@/, "").trim();
    if (!first || ["home", "i", "intent", "search", "share", "explore"].includes(first.toLowerCase())) {
      return null;
    }
    return first;
  } catch {
    return null;
  }
}

function isRealLinkedInProfile(linkedinUrl?: string | null): boolean {
  const raw = linkedinUrl?.trim();
  if (!raw) return false;
  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "linkedin.com") return false;
    const path = url.pathname.toLowerCase();
    return path.startsWith("/in/") || path.startsWith("/pub/");
  } catch {
    return false;
  }
}

function isPartnerLevelProfile(input: {
  title?: string | null;
  role?: string | null;
  investorType?: string | null;
}): boolean {
  const haystack = [input.title, input.role, input.investorType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!haystack) return false;
  return /(general partner|managing partner|venture partner|partner|principal|associate|analyst|scout|investor|advisor)/.test(haystack);
}

function unavatarFrom(value?: string | null): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  return `https://unavatar.io/${encodeURIComponent(raw)}`;
}

function unavatarFromXHandle(handle?: string | null): string | null {
  const raw = handle?.trim();
  if (!raw) return null;
  return `https://unavatar.io/x/${encodeURIComponent(raw)}`;
}

function optionalResolverAvatar(input: {
  full_name?: string | null;
  email?: string | null;
  website_url?: string | null;
  linkedin_url?: string | null;
  x_url?: string | null;
}): string | null {
  const base = trimOrNull(import.meta.env.VITE_INVESTOR_AVATAR_RESOLVER_URL);
  if (!base) return null;
  const url = new URL(base);
  if (input.full_name) url.searchParams.set("name", input.full_name);
  if (input.email) url.searchParams.set("email", input.email);
  if (input.website_url) url.searchParams.set("website", input.website_url);
  if (input.linkedin_url) url.searchParams.set("linkedin", input.linkedin_url);
  if (input.x_url) url.searchParams.set("x", input.x_url);
  return url.toString();
}

function gravatarUrl(email?: string | null, size: number = 160): string | null {
  const normalized = email?.trim().toLowerCase();
  if (!normalized || !normalized.includes("@")) return null;
  return `https://www.gravatar.com/avatar/${md5(normalized)}?s=${size}&d=404`;
}

export function investorPersonImageCandidates({
  profile_image_url,
  avatar_url,
  firmWebsiteUrl,
  title,
  role,
  investorType,
  email,
  website_url,
  linkedin_url,
  x_url,
  personal_website_url,
  full_name,
}: {
  profile_image_url?: string | null;
  avatar_url?: string | null;
  firmWebsiteUrl?: string | null;
  title?: string | null;
  role?: string | null;
  investorType?: string | null;
  email?: string | null;
  website_url?: string | null;
  linkedin_url?: string | null;
  x_url?: string | null;
  personal_website_url?: string | null;
  full_name?: string | null;
}): string[] {
  const normalizedEmail = trimOrNull(email)?.toLowerCase() ?? null;
  const xHandle = parseXPathHandle(x_url);
  const websiteHost = parseHost(website_url);
  const personalWebsiteHost = parseHost(personal_website_url);
  // NOTE: favicons (firm, website, X) are logos, not person headshots — excluded from all sources.

  const sources = [
    // Direct uploads / stored headshots first (fastest, most reliable)
    trimOrNull(profile_image_url),
    trimOrNull(avatar_url),
    gravatarUrl(normalizedEmail),
    gravatarUrl(email),
    // External resolution services that return actual person photos
    unavatarFrom(normalizedEmail),
    unavatarFromXHandle(xHandle),
    unavatarFrom(linkedin_url),
    unavatarFrom(websiteHost),
    unavatarFrom(personalWebsiteHost),
    optionalResolverAvatar({
      full_name,
      email: normalizedEmail,
      website_url,
      linkedin_url,
      x_url,
    }),
  ].filter((value): value is string => Boolean(value));

  return Array.from(new Set(sources));
}

export function investorPersonImageUrl(
  profile_image_url?: string | null,
  avatar_url?: string | null,
  firmWebsiteUrl?: string | null,
  title?: string | null,
  role?: string | null,
  investorType?: string | null,
  email?: string | null,
  website_url?: string | null,
  linkedin_url?: string | null,
  x_url?: string | null,
  personal_website_url?: string | null,
  full_name?: string | null,
): string | null {
  return (
    investorPersonImageCandidates({
      profile_image_url,
      avatar_url,
      firmWebsiteUrl,
      title,
      role,
      investorType,
      email,
      website_url,
      linkedin_url,
      x_url,
      personal_website_url,
      full_name,
    })[0] ?? null
  );
}

export function InvestorPersonAvatar({
  imageUrl,
  imageUrls,
  className,
  iconClassName,
  size = "sm",
}: {
  /** Profile or legacy avatar URL */
  imageUrl?: string | null;
  /** Ordered image candidates; each failed image falls through to the next */
  imageUrls?: Array<string | null | undefined>;
  className?: string;
  iconClassName?: string;
  size?: "sm" | "md";
}) {
  const [broken, setBroken] = useState(false);
  const [sourceIndex, setSourceIndex] = useState(0);
  const sources = useMemo(() => {
    const explicit = (imageUrls ?? [])
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));
    if (explicit.length > 0) return Array.from(new Set(explicit));
    const single = imageUrl?.trim();
    return single ? [single] : [];
  }, [imageUrls, imageUrl]);
  const sourceKey = useMemo(() => sources.join("|"), [sources]);

  useEffect(() => {
    setBroken(false);
    setSourceIndex(0);
  }, [sourceKey]);

  const src = sources[sourceIndex] ?? null;
  const showImg = Boolean(src && !broken);
  const sizeCls = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const iconSz = size === "sm" ? "h-4 w-4" : "h-5 w-5";

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-border/70 bg-muted/50",
        sizeCls,
        className,
      )}
    >
      {showImg ? (
        <img
          src={src}
          alt=""
          className="h-full w-full object-cover"
          onError={() => {
            if (sourceIndex < sources.length - 1) {
              setSourceIndex((prev) => prev + 1);
              return;
            }
            setBroken(true);
          }}
        />
      ) : (
        <User
          className={cn(iconSz, "text-foreground/55", iconClassName)}
          strokeWidth={2}
          aria-hidden
        />
      )}
    </div>
  );
}
