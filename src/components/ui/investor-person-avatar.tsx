import { useState } from "react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";

export function investorPersonImageUrl(
  profile_image_url?: string | null,
  avatar_url?: string | null,
): string | null {
  const u = profile_image_url?.trim() || avatar_url?.trim();
  return u || null;
}

export function InvestorPersonAvatar({
  imageUrl,
  className,
  iconClassName,
  size = "sm",
}: {
  /** Profile or legacy avatar URL */
  imageUrl?: string | null;
  className?: string;
  iconClassName?: string;
  size?: "sm" | "md";
}) {
  const [broken, setBroken] = useState(false);
  const src = imageUrl?.trim();
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
          onError={() => setBroken(true)}
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
