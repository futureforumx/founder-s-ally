import { cn } from "@/lib/utils";

interface BrandLogoProps {
  variant?: "black" | "white";
  /**
   * Sidebar rail: full wordmark when expanded, mark-only when collapsed.
   * Only used with `variant="white"` (main app sidebar).
   */
  sidebarMode?: "expanded" | "collapsed";
  className?: string;
  alt?: string;
}

const LOGO_BLACK = "/brand/vekta-black.svg";
/** Square wordmark (light on dark); used for expanded + collapsed sidebar rail. */
const LOGO_WHITE = "/brand/vekta-wordmark.png";

function logoSrc(variant: "black" | "white", _sidebarMode?: "expanded" | "collapsed"): string {
  if (variant === "black") return LOGO_BLACK;
  return LOGO_WHITE;
}

export function BrandLogo({
  variant = "black",
  sidebarMode,
  className,
  alt = "Vekta",
}: BrandLogoProps) {
  return (
    <div className="flex w-full translate-x-1 justify-center p-0 text-center">
      <img
        src={logoSrc(variant, sidebarMode)}
        alt={alt}
        className={cn("block h-auto object-contain", className)}
      />
    </div>
  );
}
