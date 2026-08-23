import { Link, useNavigate } from "react-router-dom";
import { LockClosedIcon } from "@radix-ui/react-icons";
import { StartupLogo } from "@/components/trending-startups/StartupLogo";
import { VelocitySparkline } from "@/components/trending-startups/VelocitySparkline";
import { compositeScoreTextClass, formatStartupStageHq } from "@/lib/trendingStartups/display";
import { trendingStartupsSignupHref } from "@/lib/trendingStartups/signup";
import type { TrendingStartupRow } from "@/lib/trendingStartups/types";
import { cn } from "@/lib/utils";

const TABLE = "w-full min-w-[720px] border-collapse text-left";

const SIGNAL_HINTS = {
  L: "Launch platforms",
  S: "Social chatter",
  D: "Developer velocity",
  T: "Traction",
} as const;

export function TrendingLeaderboard({
  rows,
  variant,
  onRowClick,
}: {
  rows: TrendingStartupRow[];
  variant: "public" | "app";
  onRowClick?: (row: TrendingStartupRow) => void;
}) {
  const unlocked = rows.filter((row) => !row.locked);
  const locked = variant === "public" ? rows.filter((row) => row.locked) : [];
  const visible = variant === "public" ? unlocked : rows;
  const signupHref = trendingStartupsSignupHref();
  const app = variant === "app";

  return (
    <div className="min-w-0">
      <div className="min-w-0 overflow-x-auto">
        <table className={TABLE}>
          <thead>
            <tr
              className={cn(
                "border-b text-[10px] font-semibold uppercase tracking-wider",
                app
                  ? "border-border/60 bg-muted/30 font-mono text-muted-foreground"
                  : "border-zinc-800 tracking-[0.16em] text-zinc-500",
              )}
            >
              <th className="w-12 px-4 py-2.5">#</th>
              <th className="px-3 py-2.5">Startup</th>
              <th className="hidden px-3 py-2.5 sm:table-cell">Category</th>
              <th className="hidden px-3 py-2.5 lg:table-cell">Stage</th>
              <th className="hidden px-3 py-2.5 xl:table-cell">HQ</th>
              <th className="px-3 py-2.5">Score</th>
              <th className="hidden px-3 py-2.5 md:table-cell">24h velocity</th>
              {app ? <th className="hidden px-3 py-2.5 lg:table-cell">Signals</th> : null}
              <th className="px-4 py-2.5">{app ? "Why trending" : "Why it's trending"}</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <LeaderboardRow key={row.id} row={row} variant={variant} onRowClick={onRowClick} />
            ))}
          </tbody>
        </table>
      </div>

      {variant === "public" && locked.length > 0 ? (
        <div className="relative overflow-hidden border-t border-zinc-800">
          <div className="pointer-events-none select-none blur-[6px] opacity-50" aria-hidden>
            <table className={TABLE}>
              <tbody>
                {locked.slice(0, 4).map((row) => (
                  <LeaderboardRow key={row.id} row={row} variant="public" muted />
                ))}
              </tbody>
            </table>
          </div>
          <div className="absolute inset-0 flex items-center justify-center bg-black/55 px-4 backdrop-blur-[2px]">
            <div className="max-w-md rounded-2xl border border-zinc-700/80 bg-zinc-950/90 px-5 py-5 text-center shadow-xl shadow-black/40">
              <LockClosedIcon className="mx-auto h-4 w-4 text-primary" />
              <p className="mt-2 text-sm font-semibold text-[#eeeeee]">Deep dives start after #20</p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[#b3b3b3]">
                Sign up / Upgrade to Pro for full deep dives &amp; 1,000+ real-time signals.
              </p>
              <Link
                to={signupHref}
                className="mt-4 inline-flex h-9 items-center rounded-full bg-primary px-4 text-[12px] font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Create an account
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LeaderboardRow({
  row,
  variant,
  muted = false,
  onRowClick,
}: {
  row: TrendingStartupRow;
  variant: "public" | "app";
  muted?: boolean;
  onRowClick?: (row: TrendingStartupRow) => void;
}) {
  const navigate = useNavigate();
  const href = variant === "public" ? `/trending-startups/${row.id}` : `/app/startups/${row.id}`;

  const go = () => {
    if (muted) return;
    if (onRowClick) {
      onRowClick(row);
      return;
    }
    navigate(href);
  };

  const app = variant === "app";

  return (
    <tr
      className={cn(
        app ? "border-b border-border/50 last:border-0" : "border-t border-zinc-800/80",
        !muted && (app ? "cursor-pointer transition-colors hover:bg-muted/25" : "cursor-pointer transition-colors hover:bg-white/[0.03]"),
      )}
      onClick={go}
    >
      <td className={cn("px-4 py-3 align-middle font-mono text-[13px] tabular-nums", app ? "text-muted-foreground" : "text-zinc-500")}>
        {row.rank}
      </td>
      <td className="px-3 py-3 align-middle">
        <div className="flex min-w-0 items-center gap-3">
          <StartupLogo
            name={row.name}
            logoUrl={row.logoUrl}
            websiteUrl={row.website}
            domain={row.domain}
            size="sm"
            className={app ? "rounded-lg border-border bg-muted text-foreground" : undefined}
          />
          <div className="min-w-0">
            <p className={cn("truncate text-sm font-semibold", app ? "text-foreground" : "text-[14px] text-[#eeeeee]")}>
              {row.name}
            </p>
            <p className={cn("truncate text-[11px]", app ? "text-muted-foreground" : "text-zinc-500")}>{row.domain}</p>
            <p className={cn("truncate text-[11px] lg:hidden", app ? "text-muted-foreground" : "text-zinc-500")}>
              {formatStartupStageHq(row)}
            </p>
          </div>
        </div>
      </td>
      <td className="hidden px-3 py-3 align-middle sm:table-cell">
        <span
          className={cn(
            "inline-flex max-w-[11rem] truncate rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider",
            app
              ? "border border-border/70 bg-muted text-foreground"
              : "border border-zinc-700 bg-zinc-900 text-zinc-300",
          )}
          title={row.microCategory}
        >
          {row.microCategory}
        </span>
      </td>
      <td className={cn("hidden px-3 py-3 align-middle text-sm lg:table-cell", app ? "text-foreground" : "text-[12px] text-zinc-300")}>
        {row.fundingStage}
      </td>
      <td className={cn("hidden px-3 py-3 align-middle text-sm xl:table-cell", app ? "text-muted-foreground" : "text-[12px] text-zinc-400")}>
        {row.hqLocation}
      </td>
      <td className="px-3 py-3 align-middle">
        <span className={cn("font-mono text-[15px] font-semibold tabular-nums", compositeScoreTextClass(row.compositeScore))}>
          {row.compositeScore.toFixed(1)}
        </span>
      </td>
      <td className="hidden px-3 py-3 align-middle md:table-cell">
        <VelocitySparkline values={row.velocity24h} />
      </td>
      {app ? (
        <td className="hidden px-3 py-3 align-middle lg:table-cell">
          <div className="flex items-center gap-1">
            {(["L", "S", "D", "T"] as const).map((key) => (
              <span
                key={key}
                title={SIGNAL_HINTS[key]}
                className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-border bg-muted px-1 font-mono text-[10px] font-medium text-foreground"
              >
                {key}
              </span>
            ))}
          </div>
        </td>
      ) : null}
      <td className="max-w-[22rem] px-4 py-3 align-middle">
        <p
          className={cn(
            "text-[12px] leading-snug",
            app ? "line-clamp-2 text-muted-foreground" : "leading-relaxed text-[#b3b3b3]",
          )}
          title={row.catalyst}
        >
          {row.catalyst}
        </p>
      </td>
    </tr>
  );
}
