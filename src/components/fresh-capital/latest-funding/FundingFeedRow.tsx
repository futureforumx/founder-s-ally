import type { KeyboardEvent } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ChevronDown, MapPin } from "lucide-react";
import type { RecentFundingRound } from "@/lib/recentFundingSeed";
import { normalizeWebsiteUrl } from "@/lib/latestFundingDisplay";
import { formatRoundKind, roundKindStageBucket, sectorLabelsForDisplay } from "@/lib/latestFundingFilters";
import { formatAnnouncedDate } from "@/lib/freshCapitalPublic";
import type { MatchedVcFirm } from "@/lib/fundingFeedEntityMatch";
import { useFundingCompanySnapshot } from "@/hooks/useFundingCompanySnapshot";
import { buildOutboundUrl, isValidOutboundUrl } from "@/lib/outboundUrl";
import { EXTERNAL_SOURCE_LINK_ATTRS, formatOutboundUrl } from "@/lib/utils/formatOutboundUrl";
import { cn } from "@/lib/utils";
import { CompanyRowMark, EntityRowMark } from "./CompanyRowMark";

/** Shared table so header and body use one column layout. */
export const LATEST_FUNDING_TABLE = "w-full min-w-0 table-fixed border-collapse";

const TH = "px-2 py-2.5 text-left font-semibold first:pl-4 last:pr-4";
const TD = "px-2 py-3 align-middle first:pl-4 last:pr-4";

export function LatestFundingTableHeader() {
  return (
    <thead>
      <tr className="border-b border-zinc-800/60 bg-[#0a0a0a] text-2xs uppercase tracking-wide text-zinc-500">
        <th className={cn(TH, "w-[22%]")}>Company</th>
        <th className={cn(TH, "w-[12%]")}>Sector</th>
        <th className={cn(TH, "w-[11%]")}>Round</th>
        <th className={cn(TH, "w-[10%]")}>Amount</th>
        <th className={cn(TH, "w-[18%]")}>Lead investor</th>
        <th className={cn(TH, "w-[14%]")}>Date</th>
        <th className={cn(TH, "w-[13%]")}>Source</th>
      </tr>
    </thead>
  );
}

function RoundKindPill({ label, title }: { label: string; title?: string }) {
  const trimmed = label?.trim();
  if (!trimmed || trimmed === "—" || trimmed.toLowerCase() === "unknown") {
    return <span className="text-xs text-zinc-400">—</span>;
  }

  return (
    <span
      className="inline-block max-w-full truncate rounded-full border border-blue-500/20 bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400"
      title={title ?? trimmed}
    >
      {trimmed}
    </span>
  );
}

function SectorCell({ labels }: { labels: string[] }) {
  const primary = labels.find((label) => {
    const t = label.trim();
    return t && t !== "—" && t.toLowerCase() !== "unknown";
  });
  if (!primary) return <span className="text-xs font-medium text-zinc-400">—</span>;
  return (
    <span className="truncate text-xs font-medium text-zinc-400" title={labels.join(", ")}>
      {primary}
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
    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-amber-200/80">
      Rumor
    </span>
  );
}

function SourceLink({
  href,
  label,
  stopRowOpen,
}: {
  href: string | null;
  label: string;
  stopRowOpen: (e: { stopPropagation: () => void }) => void;
}) {
  if (!href) {
    return <span className="text-xs text-zinc-400">—</span>;
  }
  return (
    <a
      href={href}
      {...EXTERNAL_SOURCE_LINK_ATTRS}
      title={label}
      onClick={stopRowOpen}
      onAuxClick={stopRowOpen}
      className="inline-flex min-w-0 max-w-full items-center gap-0.5 text-xs text-zinc-400 transition-colors hover:text-zinc-200"
    >
      <span className="truncate">{label}</span>
      <ArrowUpRight className="h-3 w-3 shrink-0" aria-hidden />
    </a>
  );
}

function LeadInvestorCell({
  row,
  leadFirm,
  leadHref,
  stopRowOpen,
}: {
  row: RecentFundingRound;
  leadFirm: MatchedVcFirm | null;
  leadHref: string | null;
  stopRowOpen: (e: { stopPropagation: () => void }) => void;
}) {
  const mark = (
    <EntityRowMark
      name={row.leadInvestor}
      websiteUrl={leadFirm?.websiteUrl ?? row.leadWebsiteUrl}
      logoUrl={leadFirm?.logoUrl}
      resetKey={`${row.id}-lead`}
    />
  );
  const name = <span className="min-w-0 truncate text-xs text-zinc-400">{row.leadInvestor}</span>;
  const shellClass = "inline-flex min-w-0 max-w-full items-center gap-2";

  if (leadFirm?.id) {
    return (
      <Link
        to={`/firms/${leadFirm.id}`}
        className={cn(shellClass, "hover:text-white")}
        title={row.leadInvestor}
        onClick={stopRowOpen}
        onAuxClick={stopRowOpen}
      >
        {mark}
        {name}
      </Link>
    );
  }

  if (leadHref) {
    return (
      <a
        href={leadHref}
        {...EXTERNAL_SOURCE_LINK_ATTRS}
        className={cn(shellClass, "hover:text-zinc-200")}
        title={row.leadInvestor}
        onClick={stopRowOpen}
        onAuxClick={stopRowOpen}
      >
        {mark}
        {name}
      </a>
    );
  }

  return (
    <span className={shellClass} title={row.leadInvestor}>
      {mark}
      {name}
    </span>
  );
}

export function FundingFeedRow({
  row,
  leadFirm = null,
}: {
  row: RecentFundingRound;
  leadFirm?: MatchedVcFirm | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const snapshotQuery = useFundingCompanySnapshot(expanded, row.companyName, row.websiteUrl);
  const snapshot = snapshotQuery.data;
  const displayDate = formatAnnouncedDate(row.announcedAt || null) || "—";
  const leadHref = buildOutboundUrl(
    normalizeWebsiteUrl(leadFirm?.websiteUrl ?? row.leadWebsiteUrl ?? undefined),
    "lead_investor",
    "latest_funding",
    row.id,
  );
  const showRumorBadge = row.confirmationStatus === "rumor";
  const sourceOutboundHref =
    row.sourceUrl?.trim() && isValidOutboundUrl(row.sourceUrl.trim())
      ? formatOutboundUrl(row.sourceUrl.trim())
      : null;

  const toggleExpanded = () => setExpanded((open) => !open);

  const onRowKeyDown = (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggleExpanded();
    }
  };

  const stopRowOpen = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
  };

  const interactiveShell = cn(
    "cursor-pointer transition-colors hover:bg-zinc-900/40",
    "outline-none focus-visible:bg-zinc-900/50 focus-visible:ring-1 focus-visible:ring-zinc-700",
    expanded && "bg-zinc-900/30",
  );

  const roundBucket = roundKindStageBucket(row.roundKind);
  const roundKindTitle =
    roundBucket === "other"
      ? "Uncategorized stage label — select All stages to see every deal, including ones that don’t match Seed / Series A / Growth yet."
      : undefined;

  const outlet = prettyOutletFromSourceUrl(row.sourceUrl) ?? "Source";
  const sectorLabels = sectorLabelsForDisplay(row.sector);
  const hqLine = snapshot?.hqLine ?? null;
  const description = snapshot?.description ?? null;
  const expandedName = snapshot?.name || row.companyName;
  const expandedRow: RecentFundingRound = {
    ...row,
    companyLogoUrl: snapshot?.logoUrl || row.companyLogoUrl,
  };

  return (
    <>
      <tr
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-label={`${expanded ? "Collapse" : "Expand"} details for ${row.companyName}`}
        className={cn("border-b border-zinc-800/60", expanded ? "border-b-0" : "last:border-b-0", interactiveShell)}
        onClick={toggleExpanded}
        onKeyDown={onRowKeyDown}
      >
        <td className={TD}>
          <span className="flex min-w-0 items-center gap-2.5 overflow-hidden">
            <CompanyRowMark row={row} />
            <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
              <span className="min-w-0 truncate font-medium text-white">{row.companyName}</span>
              {showRumorBadge ? <span className="shrink-0"><RumorBadge /></span> : null}
            </span>
            <ChevronDown
              className={cn(
                "ml-auto h-3.5 w-3.5 shrink-0 text-zinc-600 transition-transform",
                expanded && "rotate-180 text-zinc-400",
              )}
              aria-hidden
            />
          </span>
        </td>
        <td className={TD}>
          <SectorCell labels={sectorLabels} />
        </td>
        <td className={TD}>
          <RoundKindPill label={formatRoundKind(row.roundKind)} title={roundKindTitle} />
        </td>
        <td className={TD}>
          <span className="whitespace-nowrap font-mono text-sm font-semibold tabular-nums text-white">{row.amountLabel}</span>
        </td>
        <td className={TD}>
          <LeadInvestorCell row={row} leadFirm={leadFirm} leadHref={leadHref} stopRowOpen={stopRowOpen} />
        </td>
        <td className={TD}>
          <span className="whitespace-nowrap text-xs text-zinc-400">{displayDate}</span>
        </td>
        <td className={TD} onClick={stopRowOpen} onAuxClick={stopRowOpen}>
          <SourceLink href={sourceOutboundHref} label={outlet} stopRowOpen={stopRowOpen} />
        </td>
      </tr>
      {expanded ? (
        <tr className="border-b border-zinc-800/60 bg-[#080808] last:border-b-0">
          <td colSpan={7} className="px-4 pb-4 pt-1 first:pl-4 last:pr-4">
            <div className="max-w-2xl rounded-xl border border-zinc-800/80 bg-black/40 px-4 py-4">
              <div className="flex min-w-0 items-center gap-3">
                <CompanyRowMark row={expandedRow} size="md" />
                <p className="min-w-0 truncate text-base font-semibold tracking-tight text-white">{expandedName}</p>
              </div>
              <dl className="mt-4 space-y-3">
                <div>
                  <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    <MapPin className="h-3 w-3" aria-hidden />
                    HQ location
                  </dt>
                  <dd className="mt-1 text-sm text-zinc-300">
                    {snapshotQuery.isFetching && !snapshot ? (
                      <span className="inline-block h-3 w-36 animate-pulse rounded bg-zinc-800" />
                    ) : (
                      hqLine || "—"
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Description</dt>
                  <dd className="mt-1 text-sm leading-relaxed text-zinc-400">
                    {snapshotQuery.isFetching && !snapshot ? (
                      <span className="block space-y-1.5">
                        <span className="block h-3 w-full max-w-md animate-pulse rounded bg-zinc-800" />
                        <span className="block h-3 w-2/3 max-w-sm animate-pulse rounded bg-zinc-800" />
                      </span>
                    ) : description ? (
                      <span className="line-clamp-6 whitespace-pre-wrap">{description}</span>
                    ) : (
                      "—"
                    )}
                  </dd>
                </div>
              </dl>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
