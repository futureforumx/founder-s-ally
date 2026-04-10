import { useEffect, useMemo, useState } from "react";
import { resolveFirmDomain } from "@/components/ui/firm-logo";

export function FirmFavicon({
  websiteUrl,
  logoUrl,
  name,
  className = "h-3.5 w-3.5 rounded-sm object-contain",
}: {
  websiteUrl: string | null;
  logoUrl: string | null;
  name: string;
  className?: string;
}) {
  const domain = useMemo(() => {
    return resolveFirmDomain(websiteUrl, name);
  }, [websiteUrl, name]);

  const gstaticUrl = domain
    ? `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=32`
    : null;
  const s2Url = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : null;
  const directUrl = domain ? `https://${domain}/favicon.ico` : null;

  const [tier, setTier] = useState<1 | 2 | 3 | 4 | 5>(() => {
    if (logoUrl) return 1;
    if (gstaticUrl) return 2;
    if (s2Url) return 3;
    if (directUrl) return 4;
    return 5;
  });

  useEffect(() => {
    if (logoUrl) {
      setTier(1);
    } else if (gstaticUrl) {
      setTier(2);
    } else if (s2Url) {
      setTier(3);
    } else if (directUrl) {
      setTier(4);
    } else {
      setTier(5);
    }
  }, [logoUrl, gstaticUrl, s2Url, directUrl]);

  const src =
    tier === 1 ? logoUrl :
    tier === 2 ? gstaticUrl :
    tier === 3 ? s2Url :
    tier === 4 ? directUrl :
    null;

  if (!src) {
    return (
      <span className="inline-flex h-3.5 min-w-[14px] items-center justify-center rounded-sm bg-secondary px-0.5 text-[10px] font-bold text-muted-foreground/60">
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt=""
      className={className}
      onError={() => {
        setTier((prev) => {
          if (prev === 1) return gstaticUrl ? 2 : s2Url ? 3 : directUrl ? 4 : 5;
          if (prev === 2) return s2Url ? 3 : directUrl ? 4 : 5;
          if (prev === 3) return directUrl ? 4 : 5;
          return 5;
        });
      }}
    />
  );
}
