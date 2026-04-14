import { useEffect, useMemo, useState } from "react";
import { resolveFirmDomain, resolveKnownVcLogoUrl } from "@/components/ui/firm-logo";
import { sanitizeFirmLogoUrlForDisplay } from "@/lib/firmLogoUrl";

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

  const storedLogoUrl = sanitizeFirmLogoUrlForDisplay(logoUrl);
  const knownLogoUrl = resolveKnownVcLogoUrl(name, domain);
  const primaryLogoUrl = storedLogoUrl ?? knownLogoUrl;
  const directUrl = domain ? `https://${domain}/favicon.ico` : null;
  const gstaticUrl = domain
    ? `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=32`
    : null;
  const s2Url = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : null;

  const [tier, setTier] = useState<1 | 2 | 3 | 4 | 5>(() => {
    if (primaryLogoUrl) return 1;
    if (directUrl) return 2;
    if (gstaticUrl) return 3;
    if (s2Url) return 4;
    return 5;
  });

  useEffect(() => {
    const stored = sanitizeFirmLogoUrlForDisplay(logoUrl);
    const known = resolveKnownVcLogoUrl(name, domain);
    if (stored ?? known) {
      setTier(1);
    } else if (directUrl) {
      setTier(2);
    } else if (gstaticUrl) {
      setTier(3);
    } else if (s2Url) {
      setTier(4);
    } else {
      setTier(5);
    }
  }, [logoUrl, name, domain, directUrl, gstaticUrl, s2Url]);

  const src =
    tier === 1 ? primaryLogoUrl :
    tier === 2 ? directUrl :
    tier === 3 ? gstaticUrl :
    tier === 4 ? s2Url :
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
          if (prev === 1) return directUrl ? 2 : gstaticUrl ? 3 : s2Url ? 4 : 5;
          if (prev === 2) return gstaticUrl ? 3 : s2Url ? 4 : 5;
          if (prev === 3) return s2Url ? 4 : 5;
          return 5;
        });
      }}
    />
  );
}
