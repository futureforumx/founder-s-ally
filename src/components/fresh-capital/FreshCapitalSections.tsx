import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trackFreshCapitalGatedPreviewInteraction, trackFreshCapitalJoinVekta } from "@/lib/freshCapitalAnalytics";
import { freshCapitalSignupHref } from "@/lib/freshCapitalConversion";
import type { HeatmapBucket } from "@/lib/freshCapitalPublic";

const signupHref = freshCapitalSignupHref();

export function FreshCapitalWhyMatters() {
  return (
    <section className="bg-[#060709]">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-100">Why this matters</h2>
        <p className="mt-4 max-w-2xl text-pretty text-base leading-relaxed text-zinc-400">
          Investors are most responsive right after raising a new fund. Fund Watch surfaces fresh capital in real time so you reach the right investors when they’re actively writing checks.
        </p>
      </div>
    </section>
  );
}

export function FreshCapitalGatedPreview() {
  return (
    <section className="border-y border-zinc-800/90 bg-[#07080b]">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-100">Inside Vekta</h2>
            <p className="mt-1 max-w-xl text-sm text-zinc-400">
              Full access turns announcements into action—who is deploying, where they lean, and when to move.
            </p>
          </div>
          <Lock className="mt-1 h-5 w-5 shrink-0 text-zinc-500" aria-hidden />
        </div>

        <div className="relative grid gap-4 md:grid-cols-2">
          <div
            className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-violet-500"
            role="button"
            tabIndex={0}
            onClick={() => trackFreshCapitalGatedPreviewInteraction("gated_card_left")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                trackFreshCapitalGatedPreviewInteraction("gated_card_left_keyboard");
              }
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">Example</p>
            <p className="mt-2 font-medium text-zinc-100">Aurora Stack Capital — $300M Fund III</p>
            <ul className="mt-3 space-y-2 text-sm text-zinc-300">
              <li>3 partners actively investing</li>
              <li>Focus: AI infrastructure</li>
              <li>Best time to reach out: now</li>
            </ul>
            <div
              className="pointer-events-none absolute inset-0 flex items-end justify-center bg-gradient-to-t from-black/85 via-black/35 to-transparent pb-4"
              aria-hidden
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-900/90 px-3 py-1 text-2xs font-medium text-white">
                <Lock className="h-3 w-3" aria-hidden />
                Names & paths in Vekta
              </span>
            </div>
          </div>

          <div
            className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-sm outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-violet-500"
            role="button"
            tabIndex={0}
            onClick={() => trackFreshCapitalGatedPreviewInteraction("gated_card_right")}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                trackFreshCapitalGatedPreviewInteraction("gated_card_right_keyboard");
              }
            }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">Example</p>
            <p className="mt-2 font-medium text-zinc-100">Coastal Robotics Ventures — Fund II</p>
            <ul className="mt-3 space-y-2 text-sm text-zinc-300">
              <li>Warm intro routes identified</li>
              <li>Check size fit for Series A</li>
              <li className="blur-[5px] select-none">Priority score: ●●●●●</li>
            </ul>
            <div
              className="pointer-events-none absolute inset-0 backdrop-blur-[2px]"
              style={{ maskImage: "linear-gradient(to top, black 35%, transparent)" }}
              aria-hidden
            />
            <div className="pointer-events-none absolute bottom-4 left-5 right-5 flex justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-800/95 px-3 py-1 text-2xs font-medium text-zinc-200 shadow ring-1 ring-zinc-700">
                <Lock className="h-3 w-3" aria-hidden />
                Blurred in preview
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function tierLabel(tier: HeatmapBucket["tier"]) {
  if (tier === "high") return "High activity";
  if (tier === "moderate") return "Moderate";
  return "Lower";
}

export function FreshCapitalHeatmap({ buckets }: { buckets: HeatmapBucket[] }) {
  return (
    <section className="bg-[#060709]">
      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        <h2 className="text-lg font-semibold tracking-tight text-zinc-100">Capital activity by sector</h2>
        <p className="mt-1 text-sm text-zinc-400">Where new fund announcements have clustered recently.</p>

        {buckets.length === 0 ? (
          <p className="mt-8 text-sm text-zinc-500">Sector tags will appear here as coverage grows.</p>
        ) : (
          <ul className="mt-8 space-y-4">
            {buckets.map((b) => (
              <li key={b.label} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex w-full max-w-[200px] items-center justify-between gap-2 sm:justify-start">
                  <span className="text-sm font-medium text-zinc-100">{b.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-2xs font-medium",
                      b.tier === "high" && "bg-emerald-500/20 text-emerald-200",
                      b.tier === "moderate" && "bg-amber-500/20 text-amber-200",
                      b.tier === "low" && "bg-zinc-700 text-zinc-200",
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
                        b.tier === "low" && "bg-zinc-400",
                      )}
                      style={{ width: `${10 + b.intensity * 90}%` }}
                    />
                  </div>
                  <span className="w-8 text-right text-2xs tabular-nums text-zinc-500">{b.count}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function FreshCapitalConversion() {
  return (
    <section className="border-t border-zinc-800/90 bg-zinc-950 text-white">
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-6 px-4 py-14 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-16">
        <div className="max-w-xl space-y-3">
          <h2 className="text-2xl font-semibold tracking-tight">Turn signals into access</h2>
          <p className="text-sm leading-relaxed text-zinc-300 sm:text-base">
            Don’t just see who raised—know who to contact and how to reach them.
          </p>
        </div>
        <Button asChild size="lg" className="rounded-full bg-zinc-100 text-zinc-950 hover:bg-white">
          <Link
            to={signupHref}
            onClick={() => {
              trackFreshCapitalJoinVekta({ cta_location: "conversion_join_vekta" });
            }}
          >
            Join Vekta
          </Link>
        </Button>
      </div>
    </section>
  );
}
