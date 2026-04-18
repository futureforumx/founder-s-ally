import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FreshCapitalHero } from "@/components/fresh-capital/FreshCapitalHero";
import { FreshCapitalLiveFeed } from "@/components/fresh-capital/FreshCapitalLiveFeed";
import {
  FreshCapitalConversion,
  FreshCapitalGatedPreview,
  FreshCapitalHeatmap,
  FreshCapitalWhyMatters,
} from "@/components/fresh-capital/FreshCapitalSections";
import { useFreshCapitalPageData } from "@/hooks/useFreshCapitalPageData";
import {
  trackFreshCapitalJoinVekta,
  trackFreshCapitalPageView,
  trackFreshCapitalSectorFilter,
  trackFreshCapitalStageFilter,
} from "@/lib/freshCapitalAnalytics";
import { freshCapitalSignupHref } from "@/lib/freshCapitalConversion";
import { FreshCapitalMisconfiguredError, type FreshCapitalStageFilter } from "@/lib/freshCapitalPublic";

const FEED_ANCHOR = "fresh-capital-feed";
const signupHref = freshCapitalSignupHref();

export default function FreshCapitalPage() {
  const [stage, setStage] = useState<FreshCapitalStageFilter>("all");
  const [sector, setSector] = useState<string | null>(null);
  const { data, isPending, isError, error } = useFreshCapitalPageData(stage, sector);
  const pageViewSent = useRef(false);

  useEffect(() => {
    const prev = document.title;
    document.title = "Fresh capital · Vekta";
    return () => {
      document.title = prev;
    };
  }, []);

  useEffect(() => {
    if (isPending) return;
    if (pageViewSent.current) return;
    pageViewSent.current = true;
    const misconfiguredPv = isError && error instanceof FreshCapitalMisconfiguredError;
    trackFreshCapitalPageView({
      heatmap_source: data?.heatmapSource,
      using_demo_data: data?.usingDemoData ?? false,
      load_ok: !isError,
      misconfigured: misconfiguredPv,
    });
  }, [isPending, isError, error, data?.heatmapSource, data?.usingDemoData]);

  const scrollToFeed = useCallback(() => {
    document.getElementById(FEED_ANCHOR)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const funds = data?.funds ?? [];
  const heatmapBuckets = data?.heatmapBuckets ?? [];
  const sectorChoices = data?.sectorChoices ?? [];
  const demo = data?.usingDemoData ?? false;
  const misconfigured = isError && error instanceof FreshCapitalMisconfiguredError;

  const onStageChange = useCallback((next: FreshCapitalStageFilter) => {
    setStage((prev) => {
      if (prev !== next) trackFreshCapitalStageFilter(prev, next);
      return next;
    });
  }, []);

  const onSectorChange = useCallback((next: string | null) => {
    setSector((prev) => {
      if (prev !== next) trackFreshCapitalSectorFilter(prev, next);
      return next;
    });
  }, []);

  return (
    <div className="min-h-screen bg-[hsl(210_20%_99%)] font-sans text-zinc-950 antialiased">
      <FreshCapitalHero onScrollToFeed={scrollToFeed} />

      {demo ? (
        <div className="border-b border-amber-200/80 bg-amber-50 px-4 py-2 text-center text-xs text-amber-950 sm:px-6">
          Demo data enabled (<code className="rounded bg-amber-100/80 px-1">VITE_FRESH_CAPITAL_DEMO=true</code>, non-production
          only). Configure Supabase for the live feed.
        </div>
      ) : null}

      <FreshCapitalLiveFeed
        id={FEED_ANCHOR}
        rows={funds}
        loading={isPending}
        error={isError}
        misconfigured={misconfigured}
        stage={stage}
        onStageChange={onStageChange}
        sector={sector}
        sectorChoices={sectorChoices}
        onSectorChange={onSectorChange}
      />

      <FreshCapitalWhyMatters />
      <FreshCapitalGatedPreview />
      <FreshCapitalHeatmap buckets={heatmapBuckets} />
      <FreshCapitalConversion />

      <footer className="border-t border-zinc-200/80 bg-white py-8 text-center text-xs text-zinc-500">
        <p>
          © {new Date().getFullYear()} Vekta ·{" "}
          <Link
            to={signupHref}
            className="font-medium text-zinc-700 underline-offset-2 hover:underline"
            onClick={() => trackFreshCapitalJoinVekta()}
          >
            Create an account
          </Link>{" "}
          ·{" "}
          <a href="https://tryvekta.com" className="underline-offset-2 hover:underline" target="_blank" rel="noreferrer">
            tryvekta.com
          </a>
        </p>
      </footer>
    </div>
  );
}
