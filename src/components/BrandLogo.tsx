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
const LOGO_WHITE_EXPANDED = "/brand/vekta-sidebar-expanded.png";
const LOGO_WHITE_COLLAPSED = "/brand/vekta-sidebar-collapsed.png";

function logoSrc(variant: "black" | "white", sidebarMode?: "expanded" | "collapsed"): string {
  if (variant === "black") return LOGO_BLACK;
  return sidebarMode === "collapsed" ? LOGO_WHITE_COLLAPSED : LOGO_WHITE_EXPANDED;
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
