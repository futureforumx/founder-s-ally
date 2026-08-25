import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ActivityLogIcon } from "@radix-ui/react-icons";
import { Button } from "@/components/ui/button";
import { PublicIntelMoreResources } from "@/components/fresh-capital/PublicIntelMoreResources";
import { TrendingLeaderboard } from "@/components/trending-startups/TrendingLeaderboard";
import { SubscribeModal } from "@/components/SubscribeModal";
import { useTrendingStartups } from "@/hooks/useTrendingStartups";
import { TRENDING_REVALIDATE_SECONDS } from "@/lib/trendingStartups/types";
import { trendingStartupsSignupHref } from "@/lib/trendingStartups/signup";
import { cn } from "@/lib/utils";

/** Emergency fallback TTL. Analog of Next.js `export const revalidate = 86400`. */
export const revalidate = TRENDING_REVALIDATE_SECONDS;

const PANEL = cn(
  "overflow-hidden rounded-2xl border border-zinc-800 bg-[#000000] shadow-lg shadow-black/50 backdrop-blur-sm",
);

export default function TrendingStartupsPage() {
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const { data, isLoading } = useTrendingStartups();
  const signupHref = trendingStartupsSignupHref();
  const rows = data?.startups ?? [];

  useEffect(() => {
    const prev = document.title;
    document.title = "Trending Startups · Vekta";
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#050506] font-satoshi text-zinc-100 antialiased">
      <header className="border-b border-zinc-800 bg-black">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-6 sm:px-6">
          <Link
            to="/"
            aria-label="Vekta home"
            className="inline-flex shrink-0 items-center outline-none ring-offset-black transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          >
            <img
              src="/brand/vekta-hero-wordmark.svg"
              alt=""
              width={120}
              height={32}
              className="h-7 w-auto max-w-[min(40vw,9rem)] bg-transparent object-contain object-left sm:h-8 sm:max-w-[10rem]"
              decoding="async"
            />
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSubscribeOpen(true)}
              className="h-[30px] rounded-full border-white/25 bg-white/10 px-4 text-[11px] font-semibold uppercase tracking-[0.14em] leading-none text-white hover:bg-white/15 hover:text-white"
            >
              Notify me
            </Button>
            <PublicIntelMoreResources />
          </div>
        </div>
      </header>

      <SubscribeModal open={subscribeOpen} onOpenChange={setSubscribeOpen} />

      <section className="border-b border-zinc-800 bg-black">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <p className="inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.2em] text-primary">
            <ActivityLogIcon className="h-3.5 w-3.5" />
            Daily velocity index
          </p>
          <h1 className="mt-3 text-balance text-[30px] font-semibold leading-tight tracking-tight text-[#eeeeee] sm:leading-[1.1]">
            The 20 startups moving fastest right now
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-[14px] leading-relaxed text-[#b3b3b3]">
            Early-stage only. Ranked nightly from cached growth scores — not raw mention or star volume — then decayed
            by hours since the catalyst. Board refreshes at 00:00 UTC.
          </p>
        </div>
      </section>

      <section className="bg-black">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
          <div className={PANEL}>
            {isLoading && rows.length === 0 ? (
              <div className="px-4 py-16 text-center text-sm text-zinc-500">Loading the daily board…</div>
            ) : rows.length === 0 ? (
              <div className="px-4 py-16 text-center text-sm text-zinc-500">
                The leaderboard updates at 00:00 UTC. No cached ranks yet.
              </div>
            ) : (
              <TrendingLeaderboard rows={rows} variant="public" />
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-800/90 bg-[#060709] py-8 text-center text-xs text-zinc-400">
        <p>
          © {new Date().getFullYear()} Vekta ·{" "}
          <Link to={signupHref} className="font-medium text-zinc-200 underline-offset-2 hover:underline">
            Create an account
          </Link>
          {" · "}
          <Link to="/fresh-capital" className="underline-offset-2 hover:underline">
            Fund Watch
          </Link>
        </p>
      </footer>
    </div>
  );
}
