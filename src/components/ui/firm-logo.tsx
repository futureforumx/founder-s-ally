import { useState, useCallback, useEffect } from "react";

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

type Tier = 1 | 2 | 3 | 4;

function computeInitialTier(logoUrl?: string | null, websiteUrl?: string | null): Tier {
  if (logoUrl) return 1;
  if (websiteUrl) return 2;
  return 4;
}

/**
 * 4-tier logo fallback:
 *  1. logo_url from database (explicit, highest fidelity)
 *  2. Clearbit logo API — returns brand logos, not platform favicons
 *  3. Google gstatic faviconV2 — smarter than s2/favicons, good last resort
 *  4. Styled initial letter placeholder
 *
 * Tiers 2 & 3 fix the WordPress/Squarespace favicon problem: Clearbit indexes
 * actual company brand assets, so it returns the firm's real logo rather than
 * whatever generic icon their CMS installed.
 */
export function FirmLogo({ firmName, logoUrl, websiteUrl, size = "md", className = "", onClick }: FirmLogoProps) {
  const [tier, setTier] = useState<Tier>(() => computeInitialTier(logoUrl, websiteUrl));

  // Re-sync tier when props change (e.g. DB data arrives after mount)
  useEffect(() => {
    setTier(computeInitialTier(logoUrl, websiteUrl));
  }, [logoUrl, websiteUrl]);

  const sizeClass = SIZE_MAP[size];

  const domain = websiteUrl ? extractDomain(websiteUrl) : null;

  // Tier 2: Clearbit — brand logo, not a site favicon
  const clearbitUrl = domain ? `https://logo.clearbit.com/${domain}` : null;
  // Tier 3: gstatic faviconV2 — better fallback than s2/favicons
  const gstaticUrl = domain
    ? `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`
    : null;

  const handleError = useCallback(() => {
    setTier((prev) => {
      if (prev === 1) return clearbitUrl ? 2 : gstaticUrl ? 3 : 4;
      if (prev === 2) return gstaticUrl ? 3 : 4;
      return 4;
    });
  }, [clearbitUrl, gstaticUrl]);

  const initial = firmName?.charAt(0).toUpperCase() || "?";

  const containerClasses = `flex items-center justify-center rounded-xl bg-secondary border border-border/50 shrink-0 overflow-hidden aspect-square ${sizeClass} ${
    onClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""
  } ${className}`;

  const currentSrc =
    tier === 1 ? logoUrl :
    tier === 2 ? clearbitUrl :
    tier === 3 ? gstaticUrl :
    null;

  return (
    <div className={containerClasses} onClick={onClick}>
      {currentSrc ? (
        <img
          src={currentSrc}
          alt={firmName}
          className="h-full w-full object-contain p-1"
          onError={handleError}
        />
      ) : (
        <span className="font-bold text-muted-foreground">{initial}</span>
      )}
    </div>
  );
}
