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

function computeTier(logoUrl?: string | null, websiteUrl?: string | null): 1 | 2 | 3 {
  if (logoUrl) return 1;
  if (websiteUrl) return 2;
  return 3;
}

/**
 * 3-tier logo fallback:
 *  1. logo_url from database
 *  2. Google Favicon Service via website_url
 *  3. Styled initial letter placeholder
 */
export function FirmLogo({ firmName, logoUrl, websiteUrl, size = "md", className = "", onClick }: FirmLogoProps) {
  const [tier, setTier] = useState<1 | 2 | 3>(() => computeTier(logoUrl, websiteUrl));

  // Re-sync tier when props change (e.g. DB data arrives after mount)
  useEffect(() => {
    setTier(computeTier(logoUrl, websiteUrl));
  }, [logoUrl, websiteUrl]);

  const sizeClass = SIZE_MAP[size];

  const faviconUrl = websiteUrl
    ? `https://www.google.com/s2/favicons?domain=${websiteUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "")}&sz=128`
    : null;

  const handleError = useCallback(() => {
    if (tier === 1 && faviconUrl) {
      setTier(2);
    } else {
      setTier(3);
    }
  }, [tier, faviconUrl]);

  const initial = firmName?.charAt(0).toUpperCase() || "?";

  const containerClasses = `flex items-center justify-center rounded-xl bg-secondary border border-border/50 shrink-0 overflow-hidden aspect-square ${sizeClass} ${
    onClick ? "cursor-pointer hover:opacity-80 transition-opacity" : ""
  } ${className}`;

  const currentSrc = tier === 1 ? logoUrl : tier === 2 ? faviconUrl : null;

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
