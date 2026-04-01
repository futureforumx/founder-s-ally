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
    <div className="flex w-full translate-x-1 justify-center p-0 text-center">
      <img
        src={LOGO_SRC[variant]}
        alt={alt}
        className={cn("block h-auto object-contain", className)}
      />
    </div>
  );
}
