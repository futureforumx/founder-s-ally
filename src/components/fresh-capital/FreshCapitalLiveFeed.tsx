import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
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

const ACCESS_FIELD_SURFACE = cn(
  "border-zinc-600 bg-[#242424] text-zinc-100 ring-offset-[#242424]",
  "focus-visible:border-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/50 focus-visible:ring-offset-2",
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
  "flex w-fit max-w-full flex-wrap items-center gap-1 rounded-full border border-zinc-700/60 bg-zinc-900/35 p-1 shadow-sm backdrop-blur-sm",
);

const STAGE_TABS: { id: FreshCapitalStageFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "seed", label: "Seed" },
  { id: "series_a", label: "Series A" },
  { id: "growth", label: "Growth" },
];

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
  return (
    <section id={id} className="border-b border-zinc-800 bg-black font-spaceGrotesk">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <div className={cn("mb-5", STAGE_SEGMENT_LIST)} role="tablist" aria-label="Stage focus">
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
                  "inline-flex items-center justify-center whitespace-nowrap rounded-full px-3.5 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] transition-all",
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

        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-2xs font-medium uppercase tracking-wider text-primary">Live intelligence</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#eeeeee]">Live fund feed</h2>
            <p className="mt-1 text-sm leading-relaxed text-[#b3b3b3] sm:text-base">
              Recent raises, sorted for signal—updated as new funds hit the wire.
            </p>
          </div>
        </div>

        {sectorChoices.length > 0 ? (
          <div className="mb-6 flex max-w-xs flex-col gap-1.5">
            <label className="text-xs font-medium text-[#b3b3b3]">Sector</label>
            <select
              className={cn("h-10 w-full rounded-md px-3 py-2 text-sm", ACCESS_FIELD_SURFACE)}
              value={sector ?? ""}
              onChange={(e) => onSectorChange(e.target.value || null)}
            >
              <option value="">All sectors</option>
              {sectorChoices.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        ) : null}

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
                The feed loaded successfully; there are no rows for this stage/sector/time window. Try clearing the sector
                filter or choosing another stage.
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
                  const displayDate = row.announced_date ?? row.close_date ?? null;

                  return (
                    <li key={row.vc_fund_id} className="px-4 py-4 md:px-0 md:py-0">
                      <div className="hidden md:block">
                        <div className="grid grid-cols-[1.1fr_1fr_0.7fr_0.75fr_0.9fr_1fr] items-center gap-3 px-4 py-3.5">
                          <span className="font-medium text-[#eeeeee]">{row.firm_name}</span>
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
                            {summary}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-2 md:hidden">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-medium text-[#eeeeee]">{row.firm_name}</span>
                          <span className="text-2xs tabular-nums text-[#b3b3b3]">{formatAnnouncedDate(displayDate)}</span>
                        </div>
                        <div className="text-sm text-[#b3b3b3]">{row.fund_name}</div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-[#b3b3b3]">
                          {size ? <span className="tabular-nums">{size}</span> : <span>—</span>}
                          <span className="text-zinc-600">·</span>
                          <span>{focus}</span>
                        </div>
                        <SignalBadges row={row} />
                        {summary ? <p className="text-xs leading-relaxed text-[#b3b3b3]/90">{summary}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
