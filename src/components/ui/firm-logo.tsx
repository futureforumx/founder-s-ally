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

/**
 * Curated canonical domains for prominent VC firms that either have non-obvious
 * domains or commonly appear in cap tables without an explicit website_url.
 * Keys are lowercase firm names (or common aliases). Values are bare domains.
 */
const KNOWN_VC_DOMAINS: Record<string, string> = {
  "sequoia capital": "sequoiacap.com",
  "sequoia capital india": "sequoiacap.com",
  "sequoia capital china": "sequoiacap.com",
  "andreessen horowitz": "a16z.com",
  "andreessen horowitz (a16z)": "a16z.com",
  "a16z": "a16z.com",
  "benchmark capital": "benchmark.com",
  "benchmark capital partners": "benchmark.com",
  "kleiner perkins": "kleinerperkins.com",
  "kleiner perkins caufield & byers": "kleinerperkins.com",
  "accel": "accel.com",
  "accel partners": "accel.com",
  "tiger global": "tigerglobal.com",
  "tiger global management": "tigerglobal.com",
  "lightspeed venture partners": "lsvp.com",
  "lightspeed": "lsvp.com",
  "general catalyst": "generalcatalyst.com",
  "greylock": "greylock.com",
  "greylock partners": "greylock.com",
  "nea": "nea.com",
  "new enterprise associates": "nea.com",
  "bessemer venture partners": "bvp.com",
  "bessemer": "bvp.com",
  "index ventures": "indexventures.com",
  "gv": "gv.com",
  "google ventures": "gv.com",
  "insight partners": "insightpartners.com",
  "battery ventures": "battery.com",
  "founders fund": "foundersfund.com",
  "first round capital": "firstround.com",
  "first round": "firstround.com",
  "khosla ventures": "khoslaventures.com",
  "spark capital": "sparkcapital.com",
  "union square ventures": "usv.com",
  "usv": "usv.com",
  "matrix partners": "matrixpartners.com",
  "redpoint ventures": "redpoint.com",
  "redpoint": "redpoint.com",
  "softbank vision fund": "softbankvisionfund.com",
  "softbank": "softbank.com",
  "y combinator": "ycombinator.com",
  "ycombinator": "ycombinator.com",
  "yc": "ycombinator.com",
  "coatue": "coatue.com",
  "coatue management": "coatue.com",
  "dragoneer": "dragoneer.com",
  "dragoneer investment group": "dragoneer.com",
  "emergence capital": "emcap.com",
  "emergence": "emcap.com",
  "felicis ventures": "felicis.com",
  "felicis": "felicis.com",
  "initialized capital": "initialized.com",
  "initialized": "initialized.com",
  "lowercase capital": "lowercasecapital.com",
  "lowercase": "lowercasecapital.com",
  "menlo ventures": "menlovc.com",
  "menlo": "menlovc.com",
  "norwest venture partners": "nvp.com",
  "norwest": "nvp.com",
  "oak hc/ft": "oakhcft.com",
  "scale venture partners": "scalevp.com",
  "scale vp": "scalevp.com",
  "social capital": "socialcapital.com",
  "true ventures": "trueventures.com",
  "true": "trueventures.com",
  "valor equity partners": "valorep.com",
  "venrock": "venrock.com",
  "wing venture capital": "wing.vc",
  "wing vc": "wing.vc",
  "collaborative fund": "collaborativefund.com",
  "lux capital": "luxcapital.com",
  "lux": "luxcapital.com",
  "dcvc": "dcvc.com",
  "data collective": "dcvc.com",
  "founders circle capital": "founderscirclecapital.com",
  "ff venture capital": "ffvc.com",
  "ff vc": "ffvc.com",
  "general atlantic": "generalatlantic.com",
  "hummer winblad": "humwin.com",
  "idc ventures": "idcventures.com",
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

/**
 * Resolve the best domain for logo lookup given an optional explicit websiteUrl
 * and the firm's name. Checks the curated map first so well-known firms with
 * non-obvious domains (e.g. Sequoia → sequoiacap.com) are handled immediately
 * without a network round-trip.
 */
function resolveDomain(websiteUrl?: string | null, firmName?: string): string | null {
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

type Tier = 1 | 2 | 3 | 4;

function computeInitialTier(logoUrl?: string | null, domain?: string | null): Tier {
  if (logoUrl) return 1;
  if (domain) return 2;
  return 4;
}

/**
 * 4-tier logo fallback:
 *  1. logo_url from database (explicit, highest fidelity)
 *  2. Clearbit logo API — brand logos, not CMS-platform favicons
 *  3. Google gstatic faviconV2 — smarter fallback
 *  4. Styled initial letter placeholder
 *
 * Domain resolution order:
 *  a. Explicit websiteUrl prop
 *  b. KNOWN_VC_DOMAINS curated map (handles Sequoia → sequoiacap.com etc.)
 *  c. Falls through to initials if no domain found
 */
export function FirmLogo({ firmName, logoUrl, websiteUrl, size = "md", className = "", onClick }: FirmLogoProps) {
  const domain = resolveDomain(websiteUrl, firmName);
  const [tier, setTier] = useState<Tier>(() => computeInitialTier(logoUrl, domain));

  // Re-sync when props change (e.g. async DB data arrives after mount)
  useEffect(() => {
    setTier(computeInitialTier(logoUrl, domain));
  }, [logoUrl, domain]);

  const sizeClass = SIZE_MAP[size];

  // Tier 2: Clearbit — brand logo, not a site favicon
  const clearbitUrl = domain ? `https://logo.clearbit.com/${domain}` : null;
  // Tier 3: gstatic faviconV2 — more reliable than s2/favicons
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
