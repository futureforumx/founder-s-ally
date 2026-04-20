import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  firmMarkCandidateUrls,
  formatAnnouncedDate,
  formatFundSizeUsd,
  isLikelyNewFundAnnouncement,
  type FreshCapitalFundRow,
  type FreshCapitalStageFilter,
} from "@/lib/freshCapitalPublic";

/** Aligns live feed surfaces with `/access` (AccessRequestForm + “What happens next” card). */
const ACCESS_CARD = cn(
  "rounded-2xl border border-zinc-800 bg-[#000000] shadow-lg shadow-black/50 backdrop-blur-sm",
);

type Props = {
  id?: string;
  rows: FreshCapitalFundRow[];
  loading: boolean;
  /** True when the feed query failed for RPC/network reasons (not missing env / misconfiguration). */
  rpcFailed: boolean;
  misconfigured: boolean;
  /** Production build — copy for misconfiguration emphasizes deployment env. */
  isProductionBuild: boolean;
  stage: FreshCapitalStageFilter;
  onStageChange: (s: FreshCapitalStageFilter) => void;
  sector: string | null;
  sectorChoices: string[];
  onSectorChange: (s: string | null) => void;
};

/** `"Headline… | TechCrunch"` — split on last ` | ` so the headline can omit the outlet name in the UI. */
function splitAnnouncementTitleHeadAndSource(title: string): { head: string; sourceFromTitle: string | null } {
  const sep = " | ";
  const i = title.lastIndexOf(sep);
  if (i < 0) return { head: title, sourceFromTitle: null };
  const source = title.slice(i + sep.length).trim();
  const head = title.slice(0, i).trimEnd();
  return { head, sourceFromTitle: source || null };
}

/** Short label for the announcement link (e.g. `techcrunch.com` → `Techcrunch`). */
function prettySourceLabelFromUrl(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    const host = hostname.replace(/^www\./i, "");
    if (!host) return null;
    const segments = host.split(".").filter(Boolean);
    const raw = segments[0];
    if (!raw) return null;
    return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
  } catch {
    return null;
  }
}

function AnnouncementSummaryRich({
  title,
  announcementUrl,
}: {
  title: string;
  announcementUrl: string | null;
}) {
  const url = announcementUrl?.trim() || null;
  const trimmed = title.trim();
  const { head, sourceFromTitle } = splitAnnouncementTitleHeadAndSource(trimmed);
  const sourceLabel =
    sourceFromTitle ?? (url ? prettySourceLabelFromUrl(url) : null);
  /** When the title embeds ` | Source`, show only the left side as the headline; otherwise the full title. */
  const headline = sourceFromTitle != null ? head : trimmed;

  const linkClass = "text-inherit no-underline underline-offset-2 hover:underline";

  const sep = (
    <span className="text-zinc-600" aria-hidden>
      {" "}
      |{" "}
    </span>
  );

  if (sourceLabel && url) {
    return (
      <>
        {headline}
        {sep}
        <a href={url} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {sourceLabel}
        </a>
      </>
    );
  }

  if (sourceLabel && !url) {
    return (
      <>
        {headline}
        {sep}
        <span>{sourceLabel}</span>
      </>
    );
  }

  return <>{trimmed}</>;
}

function FirmRowMark({ row }: { row: FreshCapitalFundRow }) {
  const candidates = useMemo(
    () => firmMarkCandidateUrls(row),
    [row.vc_fund_id, row.firm_logo_url, row.firm_domain, row.firm_name],
  );
  const [attempt, setAttempt] = useState(0);
  const letter = (row.firm_name?.trim().charAt(0) || "?").toUpperCase();

  useEffect(() => {
    setAttempt(0);
  }, [row.vc_fund_id, candidates]);

  if (attempt >= candidates.length) {
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
      src={candidates[attempt]}
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

function SignalBadges({ row }: { row: FreshCapitalFundRow }) {
  const activelyDeploying = row.likely_actively_deploying === true;
  return (
    <div className="flex flex-wrap gap-1.5">
      {isLikelyNewFundAnnouncement(row.status) ? (
        <span className="rounded-full border border-zinc-600 bg-zinc-900/80 px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-zinc-300">
          New fund
        </span>
      ) : null}
      {row.has_fresh_capital ? (
        <span className="rounded-full border border-primary/45 bg-primary/15 px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-primary">
          Fresh capital
        </span>
      ) : null}
      {activelyDeploying ? (
        <span className="rounded-full border border-success/40 bg-success/10 px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-[#2EE6A6]">
          Actively deploying
        </span>
      ) : null}
    </div>
  );
}

/** Dark analogue of CommunityView global tabs: `rounded-full border … bg-secondary/35 p-1`. */
const STAGE_SEGMENT_LIST = cn(
  "inline-flex w-max flex-nowrap items-center gap-1 rounded-full border border-zinc-700/60 bg-zinc-900/35 p-1 shadow-sm backdrop-blur-sm",
);

const STAGE_TABS: { id: FreshCapitalStageFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "seed", label: "Seed" },
  { id: "series_a", label: "Series A" },
  { id: "growth", label: "Growth" },
];

/** Radix Select rejects empty string item values; map to public `null` sector filter. */
const SECTOR_SELECT_ALL = "__all_sectors__";

const SECTOR_SELECT_TRIGGER = cn(
  "h-[38px] min-w-[10.5rem] shrink-0 rounded-full border border-zinc-700/60 bg-zinc-900/35 px-3 text-left text-[10px] font-medium uppercase tracking-[0.14em] text-[#eeeeee] shadow-sm backdrop-blur-sm ring-offset-black",
  "focus:ring-2 focus:ring-zinc-500/50 focus:ring-offset-2 focus:ring-offset-black data-[placeholder]:text-[#b3b3b3]",
);

const SECTOR_SELECT_CONTENT = "border-zinc-700 bg-zinc-950 text-[#eeeeee] shadow-lg";
const SECTOR_SELECT_ITEM =
  "text-[11px] font-medium uppercase tracking-[0.12em] focus:bg-white/[0.08] focus:text-[#eeeeee]";

const FEED_MAIN_TABS = [
  { id: "fresh_funds" as const, label: "Fresh funds" },
  { id: "latest_funding" as const, label: "Latest funding" },
];

const PRIMARY_SEGMENT_LIST = cn(
  "inline-flex w-max max-w-full flex-nowrap items-center gap-1 rounded-full border border-zinc-600/70 bg-zinc-950/50 p-1 shadow-sm backdrop-blur-sm",
);

export function FreshCapitalLiveFeed({
  id,
  rows,
  loading,
  rpcFailed,
  misconfigured,
  isProductionBuild,
  stage,
  onStageChange,
  sector,
  sectorChoices,
  onSectorChange,
}: Props) {
  const [mainTab, setMainTab] = useState<(typeof FEED_MAIN_TABS)[number]["id"]>("fresh_funds");

  return (
    <section id={id} className="border-b border-zinc-800 bg-black font-spaceGrotesk">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <div className={cn("mb-5", PRIMARY_SEGMENT_LIST)} role="tablist" aria-label="Feed view">
          {FEED_MAIN_TABS.map((tab) => {
            const isActive = mainTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setMainTab(tab.id)}
                className={cn(
                  "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-4 py-2 text-[11px] font-medium uppercase tracking-[0.14em] transition-all sm:px-5",
                  isActive
                    ? "bg-[#1a1a1a] text-[#eeeeee] shadow-sm ring-1 ring-zinc-500/55"
                    : "text-[#b3b3b3] hover:bg-white/[0.06] hover:text-[#eeeeee]",
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {mainTab === "fresh_funds" ? (
          <>
            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-2xs font-medium uppercase tracking-wider text-primary">Live intelligence</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#eeeeee]">Live fund feed</h2>
                <p className="mt-1 text-sm leading-relaxed text-[#b3b3b3] sm:text-base">
                  Recent raises, sorted for signal—updated as new funds hit the wire.
                </p>
              </div>
            </div>

            <div className={cn("overflow-hidden", ACCESS_CARD)}>
              {loading ? (
            <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-[#b3b3b3]">
              <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
              Loading latest funds…
            </div>
          ) : misconfigured ? (
            <div className="px-6 py-16 text-center text-sm text-[#b3b3b3]">
              <p className="font-medium text-[#eeeeee]">Configuration required</p>
              {isProductionBuild ? (
                <p className="mt-2 leading-relaxed">
                  This deployment is missing the public funding data connection. The host must set{" "}
                  <code className="rounded border border-zinc-700 bg-[#242424] px-1.5 py-0.5 font-mono text-xs text-zinc-200">
                    VITE_SUPABASE_URL
                  </code>{" "}
                  and{" "}
                  <code className="rounded border border-zinc-700 bg-[#242424] px-1.5 py-0.5 font-mono text-xs text-zinc-200">
                    VITE_SUPABASE_PUBLISHABLE_KEY
                  </code>{" "}
                  for this site. This is a <span className="font-medium text-[#eeeeee]">setup issue</span>, not a user or filter
                  problem.
                </p>
              ) : (
                <p className="mt-2 leading-relaxed">
                  Set{" "}
                  <code className="rounded border border-zinc-700 bg-[#242424] px-1.5 py-0.5 font-mono text-xs text-zinc-200">
                    VITE_SUPABASE_URL
                  </code>{" "}
                  and{" "}
                  <code className="rounded border border-zinc-700 bg-[#242424] px-1.5 py-0.5 font-mono text-xs text-zinc-200">
                    VITE_SUPABASE_PUBLISHABLE_KEY
                  </code>{" "}
                  to load live funds. For local-only sample rows, set{" "}
                  <code className="rounded border border-zinc-700 bg-[#242424] px-1.5 py-0.5 font-mono text-xs text-zinc-200">
                    VITE_FRESH_CAPITAL_DEMO=true
                  </code>{" "}
                  in{" "}
                  <code className="rounded border border-zinc-700 bg-[#242424] px-1.5 py-0.5 font-mono text-xs text-zinc-200">
                    .env.local
                  </code>
                  .
                </p>
              )}
            </div>
          ) : rpcFailed ? (
            <div className="px-6 py-16 text-center text-sm text-[#b3b3b3]">
              <p className="font-medium text-[#eeeeee]">Couldn’t load live data</p>
              <p className="mt-2 leading-relaxed">
                The page is configured, but the funding feed did not load (network error, database timeout, or missing RPC after
                deploy). Try again in a moment or refresh. This is <span className="font-medium text-[#eeeeee]">not</span> the same
                as “no funds match your filters.”
              </p>
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-[#b3b3b3]">
              <p className="font-medium text-[#eeeeee]">No matching announcements</p>
              <p className="mt-2 leading-relaxed">
                The feed loaded successfully; there are no rows for this stage/sector/time window. Switch to{" "}
                <button
                  type="button"
                  className="font-medium text-[#eeeeee] underline-offset-2 hover:underline"
                  onClick={() => setMainTab("latest_funding")}
                >
                  Latest funding
                </button>{" "}
                to change stage or sector filters.
              </p>
            </div>
          ) : (
            <>
              <div className="hidden grid-cols-[1.1fr_1fr_0.7fr_0.75fr_0.9fr_1fr] gap-3 border-b border-zinc-800 bg-[#0a0a0a] px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-[#b3b3b3] md:grid">
                <span>Firm</span>
                <span>Fund</span>
                <span className="text-right">Size</span>
                <span>Announced</span>
                <span>Focus</span>
                <span>Signals</span>
              </div>
              <ul className="divide-y divide-zinc-800">
                {rows.map((row) => {
                  const size = formatFundSizeUsd(row.final_size_usd ?? row.target_size_usd ?? null);
                  const stages = (row.stage_focus ?? []).slice(0, 2).join(" · ") || "—";
                  const sectors = (row.sector_focus ?? []).slice(0, 2).join(" · ") || "—";
                  const focus = [stages, sectors].filter((x) => x !== "—").join(" · ") || "—";
                  const summary = row.announcement_title?.trim();
                  const announcementUrl = row.announcement_url ?? null;
                  const displayDate = row.announced_date ?? row.close_date ?? null;

                  return (
                    <li key={row.vc_fund_id} className="px-4 py-4 md:px-0 md:py-0">
                      <div className="hidden md:block">
                        <div className="grid grid-cols-[1.1fr_1fr_0.7fr_0.75fr_0.9fr_1fr] items-center gap-3 px-4 py-3.5">
                          <span className="inline-flex min-w-0 items-center gap-2">
                            <FirmRowMark row={row} />
                            <span className="min-w-0 truncate font-medium text-[#eeeeee]">{row.firm_name}</span>
                          </span>
                          <span className="text-sm text-[#b3b3b3]">{row.fund_name}</span>
                          <span className="text-right text-sm tabular-nums text-[#b3b3b3]">{size ?? "—"}</span>
                          <span className="text-sm text-[#b3b3b3]">{formatAnnouncedDate(displayDate)}</span>
                          <span className="truncate text-sm text-[#b3b3b3]" title={focus}>
                            {focus}
                          </span>
                          <SignalBadges row={row} />
                        </div>
                        {summary ? (
                          <p className="border-t border-zinc-800 px-4 pb-3.5 pt-2 text-xs leading-relaxed text-[#b3b3b3]/90">
                            <AnnouncementSummaryRich title={summary} announcementUrl={announcementUrl} />
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-2 md:hidden">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="inline-flex min-w-0 items-center gap-2">
                            <FirmRowMark row={row} />
                            <span className="min-w-0 truncate font-medium text-[#eeeeee]">{row.firm_name}</span>
                          </span>
                          <span className="text-2xs tabular-nums text-[#b3b3b3]">{formatAnnouncedDate(displayDate)}</span>
                        </div>
                        <div className="text-sm text-[#b3b3b3]">{row.fund_name}</div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-[#b3b3b3]">
                          {size ? <span className="tabular-nums">{size}</span> : <span>—</span>}
                          <span className="text-zinc-600">·</span>
                          <span>{focus}</span>
                        </div>
                        <SignalBadges row={row} />
                        {summary ? (
                          <p className="text-xs leading-relaxed text-[#b3b3b3]/90">
                            <AnnouncementSummaryRich title={summary} announcementUrl={announcementUrl} />
                          </p>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
            </div>
          </>
        ) : (
          <>
            <div className="mb-5 flex min-w-0 flex-nowrap items-center gap-2 sm:gap-3">
              <div className="min-h-[38px] min-w-0 flex-1 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
                <div className={STAGE_SEGMENT_LIST} role="tablist" aria-label="Stage focus">
                  {STAGE_TABS.map((t) => {
                    const isActive = stage === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        onClick={() => onStageChange(t.id)}
                        className={cn(
                          "inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] transition-all",
                          isActive
                            ? "bg-[#141414] text-[#eeeeee] shadow-sm ring-1 ring-zinc-600/60"
                            : "text-[#b3b3b3] hover:bg-white/[0.06] hover:text-[#eeeeee]",
                        )}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="shrink-0">
                <Select
                  value={sector ?? SECTOR_SELECT_ALL}
                  onValueChange={(v) => onSectorChange(v === SECTOR_SELECT_ALL ? null : v)}
                  disabled={misconfigured}
                >
                  <SelectTrigger
                    className={SECTOR_SELECT_TRIGGER}
                    aria-label="Filter funds by sector"
                  >
                    <SelectValue placeholder="Sector" />
                  </SelectTrigger>
                  <SelectContent className={SECTOR_SELECT_CONTENT} position="popper" sideOffset={6}>
                    <SelectItem className={SECTOR_SELECT_ITEM} value={SECTOR_SELECT_ALL}>
                      All sectors
                    </SelectItem>
                    {sectorChoices.map((s) => (
                      <SelectItem className={SECTOR_SELECT_ITEM} key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-2xs font-medium uppercase tracking-wider text-primary">Live intelligence</p>
                <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#eeeeee]">Latest funding</h2>
                <p className="mt-1 text-sm leading-relaxed text-[#b3b3b3] sm:text-base">
                  Company funding rounds and deal headlines—curated for speed. This view is rolling out on the public feed next.
                </p>
              </div>
            </div>

            <div className={cn("overflow-hidden", ACCESS_CARD)}>
              <div className="flex min-h-[240px] flex-col items-center justify-center gap-2 px-6 py-14 text-center">
                <p className="text-sm font-medium text-[#eeeeee]">Coming soon</p>
                <p className="max-w-md text-sm leading-relaxed text-[#b3b3b3]">
                  We&apos;re wiring a public snapshot of the latest venture rounds here. Switch to{" "}
                  <button
                    type="button"
                    onClick={() => setMainTab("fresh_funds")}
                    className="font-medium text-[#eeeeee]/90 underline-offset-2 hover:underline"
                  >
                    Fresh funds
                  </button>{" "}
                  to browse new fund vehicles today.
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
