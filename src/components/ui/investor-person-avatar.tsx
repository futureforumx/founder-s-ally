import { useEffect, useMemo, useState } from "react";
import { User } from "lucide-react";
import { cn, safeTrim } from "@/lib/utils";
import {
  investorAvatarUrlCandidates,
  investorPrimaryAvatarUrl,
  type InvestorAvatarFields,
} from "@/lib/investorAvatarUrl";

export type { InvestorAvatarFields };

/** @deprecated Use `investorAvatarUrlCandidates`. */
export function investorPersonImageCandidates(fields: InvestorAvatarFields): string[] {
  return investorAvatarUrlCandidates(fields);
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
  referrerPolicy = "strict-origin-when-cross-origin",
}: {
  /** Canonical R2 / stored headshot URL (preferred). */
  imageUrl?: string | null;
  /** Fallback chain: if the first URL fails to load (`onError`), the next is tried. */
  imageUrls?: Array<string | null | undefined>;
  /** 1–2 characters shown when there is no image (overrides generic user icon). */
  initials?: string | null;
  className?: string;
  iconClassName?: string;
  size?: "sm" | "md";
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
  /** Default sends referrers for most hosts; Licdn / LinkedIn / WordPress Photon use `no-referrer` automatically. */
  referrerPolicy?: HTMLImageElement["referrerPolicy"] | "";
}) {
  const chain = useMemo(() => {
    const fromProp = (imageUrls ?? []).map((v) => safeTrim(v)).filter(Boolean) as string[];
    const primary = safeTrim(imageUrl);
    const dedup: string[] = [];
    for (const u of [primary, ...fromProp]) {
      if (!u || dedup.includes(u)) continue;
      dedup.push(u);
    }
    return dedup;
  }, [imageUrl, imageUrls]);

  const [attempt, setAttempt] = useState(0);
  const [allFailed, setAllFailed] = useState(false);
  const src = chain[attempt] ?? null;

  /** Hotlink-sensitive CDNs: full Referer from our app can yield 403/empty responses for staff photos. */
  const preferNoReferrer = Boolean(
    src &&
      /licdn\.com|linkedin\.com|dms\.licdn\.com|i[0-9]\.wp\.com\/|\/\/i[0-9]\.wp\.com\//i.test(src),
  );

  useEffect(() => {
    setAttempt(0);
    setAllFailed(false);
  }, [chain.join("|")]);

  const sizeCls = size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const iconSz = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const showImg = Boolean(src) && !allFailed;
  const letter = (safeTrim(initials).charAt(0) || "").toUpperCase();

  const imgReferrerPolicy: HTMLImageElement["referrerPolicy"] | undefined = (() => {
    if (referrerPolicy === "") return undefined;
    if (preferNoReferrer) return "no-referrer";
    return referrerPolicy || undefined;
  })();

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
          key={`${src}|${attempt}`}
          src={src}
          alt=""
          {...(imgReferrerPolicy ? { referrerPolicy: imgReferrerPolicy } : {})}
          width={size === "sm" ? 64 : 80}
          height={size === "sm" ? 64 : 80}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding="async"
          className="h-full w-full object-cover"
          onError={() => {
            setAttempt((i) => {
              if (i < chain.length - 1) return i + 1;
              setAllFailed(true);
              return i;
            });
          }}
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
