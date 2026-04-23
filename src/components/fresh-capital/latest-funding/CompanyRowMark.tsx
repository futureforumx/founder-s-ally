import { useEffect, useMemo, useState } from "react";
import type { RecentFundingRound } from "@/lib/recentFundingSeed";
import { prettyWebsiteHost } from "@/lib/latestFundingDisplay";

function faviconCandidates(host: string): string[] {
  const h = host.trim().toLowerCase();
  if (!h) return [];

  const hostCandidates = new Set<string>([h]);
  if (!h.startsWith("www.")) hostCandidates.add(`www.${h}`);
  const rootParts = h.split(".");
  if (rootParts.length >= 2) {
    const rootHost = rootParts.slice(-2).join(".");
    hostCandidates.add(rootHost);
    hostCandidates.add(`www.${rootHost}`);
  }

  const urls: string[] = [];
  for (const candidateHost of hostCandidates) {
    // Primary logo provider.
    urls.push(`https://img.logo.dev/${encodeURIComponent(candidateHost)}?size=64&format=png&fallback=404`);
    // Secondary logo provider.
    urls.push(`https://logo.clearbit.com/${encodeURIComponent(candidateHost)}`);
    // Fallback provider.
    urls.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(candidateHost)}&sz=128`);
  }
  return urls;
}

export function CompanyRowMark({ row }: { row: RecentFundingRound }) {
  const candidates = useMemo(() => faviconCandidates(prettyWebsiteHost(row.websiteUrl) ?? ""), [row.websiteUrl]);
  const [attempt, setAttempt] = useState(0);
  const letter = (row.companyName?.trim().charAt(0) || "?").toUpperCase();
  const currentSrc = candidates[attempt] ?? null;

  useEffect(() => {
    setAttempt(0);
  }, [row.id, candidates]);

  if (!candidates.length || attempt >= candidates.length) {
    return (
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[3px] border border-zinc-600/90 bg-zinc-900 text-[10px] font-semibold uppercase leading-none text-zinc-400"
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
      width={20}
      height={20}
      className="h-5 w-5 shrink-0 rounded-[3px] border border-zinc-600/80 bg-zinc-950 object-contain"
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setAttempt((i) => i + 1)}
    />
  );
}
