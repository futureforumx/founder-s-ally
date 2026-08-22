import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { RecentFundingRound } from "@/lib/recentFundingSeed";
import { prettyWebsiteHost } from "@/lib/latestFundingDisplay";
import {
  buildCompanyMarkCandidateUrls,
  logoProxyUrlsForHost,
  shouldRejectLoadedMark,
} from "@/lib/latestFundingMarks";
import { sanitizeFirmLogoUrlForDisplay } from "@/lib/firmLogoUrl";

export function EntityRowMark({
  name,
  websiteUrl,
  logoUrl,
  resetKey,
}: {
  name: string;
  websiteUrl?: string | null;
  logoUrl?: string | null;
  resetKey?: string;
}) {
  const candidates = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (u: string | null | undefined) => {
      const t = u?.trim();
      if (!t || seen.has(t)) return;
      seen.add(t);
      out.push(t);
    };
    push(sanitizeFirmLogoUrlForDisplay(logoUrl));
    const host = prettyWebsiteHost(websiteUrl);
    if (host) {
      for (const url of logoProxyUrlsForHost(host)) push(url);
    }
    return out;
  }, [logoUrl, websiteUrl]);
  const [attempt, setAttempt] = useState(0);
  const letter = (name?.trim().charAt(0) || "?").toUpperCase();
  const currentSrc = candidates[attempt] ?? null;

  useEffect(() => {
    setAttempt(0);
  }, [resetKey, candidates]);

  if (!candidates.length || attempt >= candidates.length) {
    return (
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-zinc-700/80 bg-zinc-900 text-[10px] font-semibold uppercase leading-none text-zinc-400"
        aria-hidden
      >
        {letter}
      </span>
    );
  }

  return (
    <img
      src={currentSrc}
      alt=""
      width={24}
      height={24}
      className="h-6 w-6 shrink-0 rounded-md bg-zinc-950 object-contain"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setAttempt((i) => i + 1)}
      onLoad={(event) => {
        if (shouldRejectLoadedMark(currentSrc, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)) {
          setAttempt((i) => i + 1);
        }
      }}
    />
  );
}

export function CompanyRowMark({
  row,
  size = "sm",
}: {
  row: RecentFundingRound;
  size?: "sm" | "md";
}) {
  const box = size === "md" ? "h-10 w-10" : "h-6 w-6";
  const letterClass = size === "md" ? "text-sm" : "text-[10px]";
  const px = size === "md" ? 40 : 24;
  const candidates = useMemo(
    () =>
      buildCompanyMarkCandidateUrls({
        companyName: row.companyName,
        logoUrl: row.companyLogoUrl,
        websiteUrl: row.websiteUrl,
        sourceUrl: row.sourceUrl,
      }),
    [row.companyName, row.companyLogoUrl, row.websiteUrl, row.sourceUrl],
  );
  const [attempt, setAttempt] = useState(0);
  const letter = (row.companyName?.trim().charAt(0) || "?").toUpperCase();
  const currentSrc = candidates[attempt] ?? null;

  useEffect(() => {
    setAttempt(0);
  }, [row.id, candidates]);

  if (!candidates.length || attempt >= candidates.length) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md border border-zinc-700/80 bg-zinc-900 font-semibold uppercase leading-none text-zinc-400",
          box,
          letterClass,
        )}
        aria-hidden
      >
        {letter}
      </span>
    );
  }

  return (
    <img
      src={currentSrc}
      alt=""
      width={px}
      height={px}
      className={cn("shrink-0 rounded-md bg-zinc-950 object-contain", box)}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setAttempt((i) => i + 1)}
      onLoad={(event) => {
        if (shouldRejectLoadedMark(currentSrc, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)) {
          setAttempt((i) => i + 1);
        }
      }}
    />
  );
}
