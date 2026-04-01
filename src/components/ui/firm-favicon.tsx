import { useState } from "react";

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
  const domain = (() => {
    try {
      if (websiteUrl) {
        return new URL(websiteUrl.startsWith("http") ? websiteUrl : `https://${websiteUrl}`)
          .hostname.replace(/^www\./, "");
      }
      return null;
    } catch {
      return null;
    }
  })();
  const [src, setSrc] = useState<string | null>(
    logoUrl ||
      (domain
        ? `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=32`
        : null),
  );
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
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
        if (src.includes("gstatic") && domain) {
          setSrc(`https://www.google.com/s2/favicons?domain=${domain}&sz=32`);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}
