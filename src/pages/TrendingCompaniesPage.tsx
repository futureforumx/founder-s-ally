import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PublicIntelMoreResources } from "@/components/fresh-capital/PublicIntelMoreResources";
import { FundingFeedEmptyState } from "@/components/fresh-capital/latest-funding/FundingFeedEmptyState";
import { FundingFeedRow, LATEST_FUNDING_TABLE, LatestFundingTableHeader } from "@/components/fresh-capital/latest-funding/FundingFeedRow";
import { FundingFeedSkeleton } from "@/components/fresh-capital/latest-funding/FundingFeedSkeleton";
import { SubscribeModal } from "@/components/SubscribeModal";
import { useRecentFundingFeed } from "@/hooks/useRecentFundingFeed";
import { isSupabaseConfigured } from "@/integrations/supabase/client";
import { freshCapitalSignupHref } from "@/lib/freshCapitalConversion";
import { uniqueCompaniesByLatestRound } from "@/lib/trendingCompanies";
import { cn } from "@/lib/utils";

const PANEL = cn(
  "overflow-hidden rounded-2xl border border-zinc-800 bg-[#000000] shadow-lg shadow-black/50 backdrop-blur-sm",
);

const signupHref = freshCapitalSignupHref();

export default function TrendingCompaniesPage() {
  const [subscribeOpen, setSubscribeOpen] = useState(false);
  const { rows: sourceRows, isLoading, error } = useRecentFundingFeed({ limit: 200 });
  const companies = useMemo(() => uniqueCompaniesByLatestRound(sourceRows), [sourceRows]);
  const showSkeleton = isLoading && isSupabaseConfigured;
  const loadFailed = Boolean(isSupabaseConfigured && error);

  useEffect(() => {
    const prev = document.title;
    document.title = "Trending Companies · Vekta";
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#050506] font-sans text-zinc-100 antialiased">
      <header className="border-b border-zinc-800 bg-black">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-6 sm:px-6">
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
        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-primary">Trending companies</p>
          <h1 className="mt-3 text-balance text-[30px] font-semibold leading-tight tracking-tight text-[#eeeeee] sm:leading-[1.1]">
            Companies raising right now
          </h1>
          <p className="mt-3 max-w-2xl text-pretty text-[14px] leading-relaxed text-[#b3b3b3]">
            Recently funded startups from the Capital Roundup feed—one row per company, latest round first.
          </p>
        </div>
      </section>

      <section className="bg-black font-spaceGrotesk">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12">
          <div className={PANEL}>
            {showSkeleton ? (
              <div className="min-w-0 overflow-x-hidden">
                <FundingFeedSkeleton />
              </div>
            ) : loadFailed ? (
              <FundingFeedEmptyState variant="load_failed" />
            ) : companies.length === 0 ? (
              <FundingFeedEmptyState variant="feed_empty" />
            ) : (
              <div className="min-w-0 overflow-x-hidden">
                <table className={LATEST_FUNDING_TABLE}>
                  <LatestFundingTableHeader />
                  <tbody>
                    {companies.map((row) => (
                      <FundingFeedRow
                        key={row.id}
                        row={row}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
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
