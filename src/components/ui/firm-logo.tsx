import { useState, useCallback, useEffect } from "react";
import { sanitizeFirmLogoUrlForDisplay } from "@/lib/firmLogoUrl";
import { lookupKnownVcDomain, resolveDirectoryFirmWebsiteUrl } from "@/lib/knownVcDomains";
import { safeTrim } from "@/lib/utils";

interface FirmLogoProps {
  firmName: string;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  onClick?: (e: React.MouseEvent) => void;
}

const SIZE_MAP = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
};

/**
 * High-quality logos for firms whose live `favicon.ico` / apple-touch assets are
 * placeholders or unusable in UI. Keys: lowercase firm name; {@link KNOWN_DOMAIN_LOGO_URLS} for domain-only match.
 * URLs must be stable HTTPS assets (e.g. Wikimedia Commons).
 */
const KNOWN_VC_LOGO_URLS: Record<string, string> = {
  "sequoia capital":
    "https://upload.wikimedia.org/wikipedia/commons/7/78/Sequoia_Capital_Logo_2022.svg",
  "sequoia capital india":
    "https://upload.wikimedia.org/wikipedia/commons/7/78/Sequoia_Capital_Logo_2022.svg",
  "sequoia capital china":
    "https://upload.wikimedia.org/wikipedia/commons/7/78/Sequoia_Capital_Logo_2022.svg",
  "1955 capital":
    "https://image.pitchbook.com/dyVy2lGNkma4M3fHJf5FJkCXyYh1764067281169_200x200",
};

const KNOWN_DOMAIN_LOGO_URLS: Record<string, string> = {
  "sequoiacap.com":
    "https://upload.wikimedia.org/wikipedia/commons/7/78/Sequoia_Capital_Logo_2022.svg",
  "1955.capital":
    "https://image.pitchbook.com/dyVy2lGNkma4M3fHJf5FJkCXyYh1764067281169_200x200",
};

/** Prefer DB logo; when absent, use a curated asset for well-known firms with bad favicons. */
export function resolveKnownVcLogoUrl(firmName?: string, domain?: string | null): string | null {
  if (domain) {
    const d = domain.toLowerCase().trim();
    if (KNOWN_DOMAIN_LOGO_URLS[d]) return KNOWN_DOMAIN_LOGO_URLS[d];
  }
  if (!firmName) return null;
  const key = firmName.toLowerCase().trim();
  if (KNOWN_VC_LOGO_URLS[key]) return KNOWN_VC_LOGO_URLS[key];
  const partial = Object.entries(KNOWN_VC_LOGO_URLS).find(([k]) => key.startsWith(k) || k.startsWith(key));
  return partial ? partial[1] : null;
}

/** Strip protocol, www, paths, and query strings to return a bare domain. */
function extractDomain(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .split("/")[0]
    .split("?")[0]
    .split("#")[0]
    .toLowerCase();
}

/**
 * Resolve the best domain for logo lookup given an optional explicit websiteUrl
 * and the firm's name. Checks the curated map first so well-known firms with
 * non-obvious domains (e.g. Sequoia → sequoiacap.com) are handled immediately
 * without a network round-trip.
 */
export function resolveFirmDomain(websiteUrl?: string | null, firmName?: string): string | null {
  // 1. Explicit website always wins
  if (websiteUrl) return extractDomain(websiteUrl);
  // 2. Curated lookup by exact firm name (case-insensitive)
  if (firmName) {
    const key = firmName.toLowerCase().trim();
    if (KNOWN_VC_DOMAINS[key]) return KNOWN_VC_DOMAINS[key];
    // 3. Partial match — handle names like "Sequoia Capital (India)" matching "Sequoia Capital"
    const partialMatch = Object.entries(KNOWN_VC_DOMAINS).find(([k]) =>
      key.startsWith(k) || k.startsWith(key)
    );
    if (partialMatch) return partialMatch[1];
  }
  return null;
}

type Tier = 1 | 2 | 3 | 4 | 5;

function computeInitialTier(primaryLogoUrl?: string | null, domain?: string | null): Tier {
  if (primaryLogoUrl) return 1;
  if (domain) return 2;
  return 5;
}

/**
 * 5-tier logo fallback:
 *  1. logo_url from database, else curated high-res logo for firms with unusable favicons (e.g. Sequoia)
 *     (stored URL skipped if it is a third-party favicon proxy / generic globe URL)
 *  2. Direct /favicon.ico on the firm's domain (real site asset before Google proxies)
 *  3. Google gstatic faviconV2
 *  4. Google s2/favicons
 *  5. Styled initial letter placeholder
 *
 * Domain resolution order:
 *  a. Explicit websiteUrl prop
 *  b. {@link KNOWN_VC_DOMAIN_BY_FIRM_NAME} curated map (handles Sequoia → sequoiacap.com etc.)
 *  c. Falls through to initials if no domain found
 */
export function FirmLogo({ firmName, logoUrl, websiteUrl, size = "md", className = "", onClick }: FirmLogoProps) {
  const domain = resolveFirmDomain(websiteUrl, firmName);
  const rawStored = safeTrim(logoUrl);
  const storedLogoUrl = sanitizeFirmLogoUrlForDisplay(logoUrl);
  const knownLogoUrl = resolveKnownVcLogoUrl(firmName, domain);
  /**
   * We normally strip favicon-proxy URLs so FirmLogo can use the fund’s own domain.
   * If we have no domain (no website + not in curated name→domain map), dropping the URL
   * leaves only initials — so keep the stored URL (even gstatic/clearbit) when it’s all we have.
   */
  const proxyOnlyFallback =
    !storedLogoUrl && rawStored.length > 0 && !knownLogoUrl && !domain ? rawStored : null;
  const primaryLogoUrl = storedLogoUrl ?? knownLogoUrl ?? proxyOnlyFallback;
  const [tier, setTier] = useState<Tier>(() => computeInitialTier(primaryLogoUrl, domain));

  // Re-sync when props change (e.g. async DB data arrives after mount)
  useEffect(() => {
    const raw = safeTrim(logoUrl);
    const stored = sanitizeFirmLogoUrlForDisplay(logoUrl);
    const known = resolveKnownVcLogoUrl(firmName, domain);
    const fallback = !stored && raw.length > 0 && !known && !domain ? raw : null;
    setTier(computeInitialTier(stored ?? known ?? fallback, domain));
  }, [logoUrl, domain, firmName]);

  const sizeClass = SIZE_MAP[size];

  const directUrl = domain ? `https://${domain}/favicon.ico` : null;
  const gstaticUrl = domain
    ? `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`
    : null;
  const s2Url = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=128` : null;

  const handleError = useCallback(() => {
    setTier((prev) => {
      if (prev === 1) return directUrl ? 2 : gstaticUrl ? 3 : s2Url ? 4 : 5;
      if (prev === 2) return gstaticUrl ? 3 : s2Url ? 4 : 5;
      if (prev === 3) return s2Url ? 4 : 5;
      return 5;
    });
  }, [directUrl, gstaticUrl, s2Url]);

  const initial = firmName?.charAt(0).toUpperCase() || "?";

  const containerClasses = `flex items-center justify-center rounded-xl bg-secondary border border-border/50 shrink-0 overflow-hidden aspect-square ${sizeClass} ${
    onClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""
  } ${className}`;

  const currentSrc =
    tier === 1 ? primaryLogoUrl :
    tier === 2 ? directUrl :
    tier === 3 ? gstaticUrl :
    tier === 4 ? s2Url :
    null;

  return (
    <div className={containerClasses} onClick={onClick}>
      {currentSrc ? (
        <img
          src={currentSrc}
          alt={firmName}
          className="h-full w-full object-contain p-1"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={handleError}
        />
      ) : (
        <span className="font-bold text-foreground/70">{initial}</span>
      )}
    </div>
  );
}
