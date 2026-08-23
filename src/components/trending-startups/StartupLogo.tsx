import { useEffect, useMemo, useState } from "react";
import { buildStartupLogoCandidates, shouldRejectStartupFavicon } from "@/lib/trendingStartups/logos";
import { cn } from "@/lib/utils";

const SIZE_PX = { sm: 32, md: 40, lg: 56 } as const;
const SIZE_CLASS = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
} as const;

export function StartupLogo({
  name,
  logoUrl,
  websiteUrl,
  domain,
  size = "sm",
  className,
}: {
  name: string;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  domain?: string | null;
  size?: keyof typeof SIZE_PX;
  className?: string;
}) {
  const px = SIZE_PX[size];
  const candidates = useMemo(
    () => buildStartupLogoCandidates({ name, logoUrl, websiteUrl, domain, size: px * 2 }),
    [name, logoUrl, websiteUrl, domain, px],
  );
  const [attempt, setAttempt] = useState(0);
  const letter = (name?.trim().charAt(0) || "?").toUpperCase();
  const currentSrc = candidates[attempt] ?? null;

  useEffect(() => {
    setAttempt(0);
  }, [candidates]);

  const advance = () => setAttempt((i) => i + 1);

  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-zinc-700/80 bg-zinc-950 font-semibold uppercase leading-none text-zinc-400",
        SIZE_CLASS[size],
        className,
      )}
      aria-hidden
    >
      {currentSrc ? (
        <img
          src={currentSrc}
          alt=""
          width={px}
          height={px}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={advance}
          onLoad={(event) => {
            if (shouldRejectStartupFavicon(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)) {
              advance();
            }
          }}
        />
      ) : (
        letter
      )}
    </span>
  );
}
