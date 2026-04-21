import type { KeyboardEvent } from "react";
import type { RecentFundingRound } from "@/lib/recentFundingSeed";
import { SourceOutletBadge } from "@/components/fresh-capital/SourceOutletBadge";
import { normalizeWebsiteUrl, prettyWebsiteHost } from "@/lib/latestFundingDisplay";
import { roundKindStageBucket } from "@/lib/latestFundingFilters";
import { formatAnnouncedDate } from "@/lib/freshCapitalPublic";
import { cn } from "@/lib/utils";
import { CompanyRowMark } from "./CompanyRowMark";

/** Matches `ThemePills` on Fresh Funds — single sector label. */
function SectorThemePill({ label }: { label: string }) {
  return (
    <span
      className="inline-block max-w-[12rem] truncate rounded-full border border-primary/45 bg-primary/15 px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-primary"
      title={label}
    >
      {label.toUpperCase()}
    </span>
  );
}

function prettyOutletFromSourceUrl(url: string): string | null {
  const t = url?.trim();
  if (!t) return null;
  try {
    const { hostname } = new URL(t);
    const host = hostname.replace(/^www\./i, "");
    if (!host) return null;
    if (host === "tech.eu") return "Tech EU";
    const segments = host.split(".").filter(Boolean);
    const raw = segments[0];
    if (!raw) return null;
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  } catch {
    return null;
  }
}

function RumorBadge() {
  return (
    <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200/90">
      Rumor
    </span>
  );
}

/** Same grid proportions as Fresh Funds desktop feed. */
const DESKTOP_GRID =
  "grid grid-cols-[1.05fr_0.95fr_0.7fr_0.75fr_0.8fr_0.8fr_1.15fr] items-center gap-3 px-4 py-3.5";

function FundingDealMetaRow({
  row,
  stopRowOpen,
}: {
  row: RecentFundingRound;
  stopRowOpen: (e: { stopPropagation: () => void }) => void;
}) {
  const host = prettyWebsiteHost(row.websiteUrl)?.toLowerCase() ?? null;
  const webHref = normalizeWebsiteUrl(row.websiteUrl);
  const outlet = prettyOutletFromSourceUrl(row.sourceUrl);
  const hasArticle = Boolean(row.sourceUrl?.trim());

  const pieces = [
    host && webHref ? (
      <a
        key="web"
        href={webHref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-inherit underline-offset-2 hover:text-[#eeeeee] hover:underline"
        onClick={stopRowOpen}
        onAuxClick={stopRowOpen}
      >
        {host}
      </a>
    ) : null,
    <span key="badge">
      <SourceOutletBadge hasArticle={hasArticle} outletLabel={outlet ?? "Source"} />
    </span>,
  ].filter(Boolean);

  if (pieces.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-relaxed text-[#b3b3b3]/90">
      {pieces.map((piece, index) => (
        <span key={index} className="inline-flex items-center gap-2">
          {index > 0 ? <span className="text-zinc-600">·</span> : null}
          {piece}
        </span>
      ))}
    </div>
  );
}

export function FundingFeedRow({ row }: { row: RecentFundingRound }) {
  const displayDate = formatAnnouncedDate(row.announcedAt || null);
  const co = row.coInvestors.filter(Boolean);
  const coShown = co.slice(0, 2);
  const coExtra = co.length > coShown.length ? co.length - coShown.length : 0;
  const leadHref = normalizeWebsiteUrl(row.leadWebsiteUrl ?? undefined);
  const showRumorBadge = row.confirmationStatus === "rumor";
  const hasArticle = Boolean(row.sourceUrl?.trim());

  const openSource = () => {
    if (!hasArticle) return;
    window.open(row.sourceUrl, "_blank", "noopener,noreferrer");
  };

  const onRowKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!hasArticle) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openSource();
    }
  };

  const stopRowOpen = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
  };

  const interactiveShell = cn(
    "outline-none",
    hasArticle &&
      "cursor-pointer hover:bg-white/[0.02] focus-visible:bg-white/[0.03] focus-visible:ring-2 focus-visible:ring-zinc-600/60 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
  );

  const roundBucket = roundKindStageBucket(row.roundKind);
  const roundKindTitle =
    roundBucket === "other"
      ? "Uncategorized stage label — select All stages to see every deal, including ones that don’t match Seed / Series A / Growth yet."
      : undefined;

  const coSummary =
    coShown.length > 0 ? `${coShown.join(", ")}${coExtra > 0 ? ` +${coExtra}` : ""}` : "—";

  return (
    <li className="px-4 py-4 md:px-0 md:py-0">
      <div
        role={hasArticle ? "button" : undefined}
        tabIndex={hasArticle ? 0 : undefined}
        aria-label={
          hasArticle
            ? `Open funding article for ${row.companyName}`
            : `Funding deal for ${row.companyName} (no public article URL)`
        }
        className={cn("hidden md:block", interactiveShell)}
        onClick={hasArticle ? openSource : undefined}
        onKeyDown={hasArticle ? onRowKeyDown : undefined}
      >
        <div className={DESKTOP_GRID}>
          <span className="inline-flex min-w-0 items-center gap-2">
            <CompanyRowMark row={row} />
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 truncate font-medium text-[#eeeeee]">{row.companyName}</span>
              {showRumorBadge ? <RumorBadge /> : null}
            </span>
          </span>
          <span className="min-w-0 truncate text-sm text-[#b3b3b3]" title={roundKindTitle}>
            {row.roundKind}
          </span>
          <span className="text-right text-sm tabular-nums text-[#b3b3b3]">{row.amountLabel}</span>
          <span className="text-sm text-[#b3b3b3]">{displayDate}</span>
          <SectorThemePill label={row.sector} />
          <span className="min-w-0 truncate text-sm text-[#b3b3b3]" title={row.leadInvestor}>
            {leadHref ? (
              <a
                href={leadHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-inherit underline-offset-2 hover:text-[#eeeeee] hover:underline"
                onClick={stopRowOpen}
                onAuxClick={stopRowOpen}
              >
                {row.leadInvestor}
              </a>
            ) : (
              row.leadInvestor
            )}
          </span>
          <span className="min-w-0 truncate text-sm text-[#b3b3b3]" title={co.length ? co.join(", ") : undefined}>
            {coSummary}
          </span>
        </div>
        <div className="border-t border-zinc-800 px-4 pb-3.5 pt-2">
          <FundingDealMetaRow row={row} stopRowOpen={stopRowOpen} />
        </div>
      </div>

      <div
        role={hasArticle ? "button" : undefined}
        tabIndex={hasArticle ? 0 : undefined}
        aria-label={
          hasArticle
            ? `Open funding article for ${row.companyName}`
            : `Funding deal for ${row.companyName} (no public article URL)`
        }
        className={cn("flex flex-col gap-2 md:hidden", interactiveShell)}
        onClick={hasArticle ? openSource : undefined}
        onKeyDown={hasArticle ? onRowKeyDown : undefined}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-2">
            <CompanyRowMark row={row} />
            <span className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="min-w-0 truncate font-medium text-[#eeeeee]">{row.companyName}</span>
              {showRumorBadge ? <RumorBadge /> : null}
            </span>
          </span>
          <span className="text-2xs tabular-nums text-[#b3b3b3]">{displayDate}</span>
        </div>
        <div className="min-w-0 text-sm text-[#b3b3b3]">
          <span className="break-words font-normal" title={roundKindTitle}>
            {row.roundKind}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#b3b3b3]">
          <span className="tabular-nums">{row.amountLabel}</span>
          <span className="text-zinc-600">·</span>
          <span className="inline-flex items-center gap-2">
            <span className="text-zinc-600">Sector</span>
            <SectorThemePill label={row.sector} />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-[#b3b3b3]">
          <span className="truncate" title={row.leadInvestor}>
            <span className="text-zinc-600">Lead · </span>
            {leadHref ? (
              <a
                href={leadHref}
                target="_blank"
                rel="noopener noreferrer"
                className="underline-offset-2 hover:text-[#eeeeee] hover:underline"
                onClick={stopRowOpen}
                onAuxClick={stopRowOpen}
              >
                {row.leadInvestor}
              </a>
            ) : (
              row.leadInvestor
            )}
          </span>
          <span className="text-zinc-600">·</span>
          <span className="min-w-0 truncate" title={co.length ? co.join(", ") : undefined}>
            Co · {coSummary}
          </span>
        </div>
        <div className="border-t border-zinc-800 pt-2">
          <FundingDealMetaRow row={row} stopRowOpen={stopRowOpen} />
        </div>
      </div>
    </li>
  );
}
