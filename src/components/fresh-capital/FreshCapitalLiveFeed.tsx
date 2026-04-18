import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatAnnouncedDate,
  formatFundSizeUsd,
  isLikelyNewFundAnnouncement,
  type FreshCapitalFundRow,
  type FreshCapitalStageFilter,
} from "@/lib/freshCapitalPublic";

type Props = {
  id?: string;
  rows: FreshCapitalFundRow[];
  loading: boolean;
  error: boolean;
  misconfigured: boolean;
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
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-zinc-700">
          New fund
        </span>
      ) : null}
      {row.has_fresh_capital ? (
        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-violet-800">
          Fresh capital
        </span>
      ) : null}
      {activelyDeploying ? (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-2xs font-medium uppercase tracking-wide text-emerald-900">
          Actively deploying
        </span>
      ) : null}
    </div>
  );
}

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
  error,
  misconfigured,
  stage,
  onStageChange,
  sector,
  sectorChoices,
  onSectorChange,
}: Props) {
  return (
    <section id={id} className="border-b border-zinc-200/80 bg-zinc-50/40">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-12">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-950">Live fund feed</h2>
            <p className="mt-1 text-sm text-zinc-600">Recent raises, sorted for signal—updated as new funds hit the wire.</p>
          </div>
        </div>

        <div className="mb-6 flex flex-col gap-4 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Stage focus">
            {STAGE_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={stage === t.id}
                onClick={() => onStageChange(t.id)}
                className={cn(
                  "rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors",
                  stage === t.id ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          {sectorChoices.length > 0 ? (
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:ml-auto sm:max-w-xs">
              <label className="text-2xs font-medium uppercase tracking-wide text-zinc-500">Sector</label>
              <select
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-violet-500 focus:ring-2"
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
        </div>

        <div className="overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
          {loading ? (
            <div className="flex min-h-[220px] items-center justify-center gap-2 text-sm text-zinc-500">
              <Loader2 className="h-5 w-5 animate-spin text-violet-600" aria-hidden />
              Loading latest funds…
            </div>
          ) : misconfigured ? (
            <div className="px-6 py-16 text-center text-sm text-zinc-600">
              <p className="font-medium text-zinc-900">Fresh Capital isn’t configured in this environment</p>
              <p className="mt-2">
                Set <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs">VITE_SUPABASE_URL</code> and{" "}
                <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs">VITE_SUPABASE_PUBLISHABLE_KEY</code> for
                production. For local-only sample rows, set{" "}
                <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs">VITE_FRESH_CAPITAL_DEMO=true</code> in{" "}
                <code className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-xs">.env.local</code>.
              </p>
            </div>
          ) : error ? (
            <div className="px-6 py-16 text-center text-sm text-zinc-600">
              We couldn’t load live data right now. Please refresh, or try again in a few minutes.
            </div>
          ) : rows.length === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-zinc-600">
              No funds match these filters yet. Try another stage or sector.
            </div>
          ) : (
            <>
              <div className="hidden grid-cols-[1.1fr_1fr_0.7fr_0.75fr_0.9fr_1fr] gap-3 border-b border-zinc-100 bg-zinc-50/80 px-4 py-2.5 text-2xs font-semibold uppercase tracking-wide text-zinc-500 md:grid">
                <span>Firm</span>
                <span>Fund</span>
                <span className="text-right">Size</span>
                <span>Announced</span>
                <span>Focus</span>
                <span>Signals</span>
              </div>
              <ul className="divide-y divide-zinc-100">
                {rows.map((row) => {
                  const size = formatFundSizeUsd(row.final_size_usd ?? row.target_size_usd ?? null);
                  const stages = (row.stage_focus ?? []).slice(0, 2).join(" · ") || "—";
                  const sectors = (row.sector_focus ?? []).slice(0, 2).join(" · ") || "—";
                  const focus = [stages, sectors].filter((x) => x !== "—").join(" · ") || "—";
                  const summary = row.announcement_title?.trim();

                  return (
                    <li key={row.vc_fund_id} className="px-4 py-4 md:px-0 md:py-0">
                      <div className="hidden md:block">
                        <div className="grid grid-cols-[1.1fr_1fr_0.7fr_0.75fr_0.9fr_1fr] items-center gap-3 px-4 py-3.5">
                          <span className="font-medium text-zinc-950">{row.firm_name}</span>
                          <span className="text-sm text-zinc-800">{row.fund_name}</span>
                          <span className="text-right text-sm tabular-nums text-zinc-700">{size ?? "—"}</span>
                          <span className="text-sm text-zinc-600">{formatAnnouncedDate(row.announced_date)}</span>
                          <span className="truncate text-sm text-zinc-600" title={focus}>
                            {focus}
                          </span>
                          <SignalBadges row={row} />
                        </div>
                        {summary ? (
                          <p className="border-t border-zinc-50 px-4 pb-3.5 pt-2 text-xs leading-relaxed text-zinc-500">{summary}</p>
                        ) : null}
                      </div>
                      <div className="flex flex-col gap-2 md:hidden">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-medium text-zinc-950">{row.firm_name}</span>
                          <span className="text-2xs tabular-nums text-zinc-500">{formatAnnouncedDate(row.announced_date)}</span>
                        </div>
                        <div className="text-sm text-zinc-800">{row.fund_name}</div>
                        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-600">
                          {size ? <span className="tabular-nums">{size}</span> : <span>—</span>}
                          <span className="text-zinc-300">·</span>
                          <span>{focus}</span>
                        </div>
                        <SignalBadges row={row} />
                        {summary ? <p className="text-xs leading-relaxed text-zinc-500">{summary}</p> : null}
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
