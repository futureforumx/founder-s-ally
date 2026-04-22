import { cn } from "@/lib/utils";
import type { HeatmapBucket } from "@/lib/freshCapitalPublic";

const CARD = cn(
  "rounded-2xl border border-zinc-800 bg-[#000000] shadow-lg shadow-black/50 backdrop-blur-sm",
);

function tierLabel(tier: HeatmapBucket["tier"]) {
  if (tier === "high") return "High activity";
  if (tier === "moderate") return "Moderate";
  return "Lower";
}

type Props = {
  buckets: HeatmapBucket[];
};

/** Sector concentration for the Fresh Capital feed — mirrors page heatmap data in the dark tab shell. */
export function FreshCapitalInsightsTab({ buckets }: Props) {
  return (
    <>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-2xs font-medium uppercase tracking-wider text-primary">Live intelligence</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#eeeeee]">Insights</h2>
          <p className="mt-1 text-sm leading-relaxed text-[#b3b3b3] sm:text-base">
            Where new fund announcements have clustered recently—by sector tag intensity in this cohort.
          </p>
        </div>
      </div>

      <div className={cn("overflow-hidden px-4 py-6 sm:px-6", CARD)}>
        {buckets.length === 0 ? (
          <p className="text-center text-sm text-[#b3b3b3]">
            Sector tags will appear here as coverage grows. Try another stage or sector filter on{" "}
            <span className="font-medium text-[#eeeeee]">Latest funding</span> or check back soon.
          </p>
        ) : (
          <ul className="space-y-4">
            {buckets.map((b) => (
              <li key={b.label} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex w-full max-w-[220px] items-center justify-between gap-2 sm:justify-start">
                  <span className="text-sm font-medium text-[#eeeeee]">{b.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-2xs font-medium",
                      b.tier === "high" && "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25",
                      b.tier === "moderate" && "bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/25",
                      b.tier === "low" && "bg-zinc-700/50 text-zinc-400 ring-1 ring-zinc-600/60",
                    )}
                  >
                    {tierLabel(b.tier)}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-500",
                        b.tier === "high" && "bg-emerald-500",
                        b.tier === "moderate" && "bg-amber-400",
                        b.tier === "low" && "bg-zinc-500",
                      )}
                      style={{ width: `${10 + b.intensity * 90}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-2xs tabular-nums text-[#b3b3b3]">{b.count}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
