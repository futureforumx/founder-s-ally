import { useEffect, useMemo, useState } from "react";
import { User } from "lucide-react";
import { cn } from "@/lib/utils";
import { investorPrimaryAvatarUrl, type InvestorAvatarFields } from "@/lib/investorAvatarUrl";

export type { InvestorAvatarFields };

/** @deprecated Use `investorPrimaryAvatarUrl` — kept for gradual migration of imports. */
export function investorPersonImageCandidates(fields: InvestorAvatarFields): string[] {
  const u = investorPrimaryAvatarUrl(fields);
  return u ? [u] : [];
}

/** @deprecated Use `investorPrimaryAvatarUrl`. */
export function investorPersonImageUrl(fields: InvestorAvatarFields): string | null {
  return investorPrimaryAvatarUrl(fields);
}

export function InvestorPersonAvatar({
  imageUrl,
  imageUrls,
  initials,
  className,
  iconClassName,
  size = "sm",
  loading = "lazy",
  fetchPriority = "auto",
}: {
  /** Canonical R2 / stored headshot URL (preferred). */
  imageUrl?: string | null;
  /** @deprecated Only the first entry is used; no multi-URL fallback chain. */
  imageUrls?: Array<string | null | undefined>;
  /** 1–2 characters shown when there is no image (overrides generic user icon). */
  initials?: string | null;
  className?: string;
  iconClassName?: string;
  size?: "sm" | "md";
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
}) {
  const [failed, setFailed] = useState(false);
  const src = useMemo(() => {
    const explicit = (imageUrls ?? [])
      .map((value) => value?.trim())
      .find((value): value is string => Boolean(value));
    const primary = imageUrl?.trim() || explicit || null;
    return primary;
  }, [imageUrls, imageUrl]);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const sizeCls = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const iconSz = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const showImg = Boolean(src && !failed);
  const letter = (initials?.trim().charAt(0) || "").toUpperCase();

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
          src={src!}
          alt=""
          width={size === "sm" ? 64 : 80}
          height={size === "sm" ? 64 : 80}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : letter ? (
        <span className={cn("select-none font-semibold text-foreground/70", size === "sm" ? "text-xs" : "text-sm")}>
          {letter}
        </span>
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
