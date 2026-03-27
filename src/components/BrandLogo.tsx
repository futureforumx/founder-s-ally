import { cn } from "@/lib/utils";

interface BrandLogoProps {
  variant?: "black" | "white";
  className?: string;
  alt?: string;
}

const LOGO_SRC = {
  black: "/brand/vekta-black.svg",
  white: "/brand/vekta-white.svg",
} as const;

export function BrandLogo({
  variant = "black",
  className,
  alt = "Vekta",
}: BrandLogoProps) {
  return (
    <img
      src={LOGO_SRC[variant]}
      alt={alt}
      className={cn("h-auto w-full object-contain", className)}
    />
  );
}
