import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { BookmarkFilledIcon, BookmarkIcon, ExternalLinkIcon, GitHubLogoIcon, LinkedInLogoIcon } from "@radix-ui/react-icons";
import { CatalystTeardown } from "@/components/trending-startups/CatalystTeardown";
import { SignalAttribution } from "@/components/trending-startups/SignalAttribution";
import { TrajectoryCharts } from "@/components/trending-startups/TrajectoryCharts";
import { Button } from "@/components/ui/button";
import { StartupLogo } from "@/components/trending-startups/StartupLogo";
import { useTrendingStartup } from "@/hooks/useTrendingStartups";
import { compositeScoreTextClass, formatStartupCategoryStageHq } from "@/lib/trendingStartups/display";
import { isEarlySpotter, toggleEarlySpotter } from "@/lib/trendingStartups/signup";
import { cn } from "@/lib/utils";

export default function TrendingStartupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { pathname } = useLocation();
  const { startup, isLoading } = useTrendingStartup(id);
  const [spotted, setSpotted] = useState(false);
  const publicSurface = pathname.startsWith("/trending-startups");
  const backTo = publicSurface ? "/trending-startups" : "/?view=market-trending";
  const crumb = publicSurface ? "Trending startups" : "Research · Market · Trending";

  useEffect(() => {
    if (id) setSpotted(isEarlySpotter(id));
  }, [id]);

  useEffect(() => {
    const prev = document.title;
    document.title = startup ? `${startup.name} · Trending · Vekta` : "Trending startup · Vekta";
    return () => {
      document.title = prev;
    };
  }, [startup]);

  if (isLoading && !startup) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16 text-sm text-muted-foreground">Loading startup signals…</div>
    );
  }

  if (!startup) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-16">
        <p className="text-sm font-medium text-foreground">Startup not found</p>
        <Link to={backTo} className="mt-3 inline-block text-sm text-primary underline-offset-2 hover:underline">
          Back to Trending
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/80">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link to={backTo} className="inline-flex items-center">
            <img src="/brand/vekta-hero-wordmark.svg" alt="Vekta" className="h-6 w-auto dark:invert-0" />
          </Link>
          <Link to={backTo} className="text-[12px] text-muted-foreground hover:text-foreground">
            Back to Trending
          </Link>
        </div>
      </header>
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
        <Link to={backTo} className="hover:text-foreground">
          {crumb}
        </Link>
        <span className="px-1.5">/</span>
        #{startup.rank}
      </p>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <StartupLogo name={startup.name} logoUrl={startup.logoUrl} websiteUrl={startup.website} domain={startup.domain} size="lg" />
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{startup.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{formatStartupCategoryStageHq(startup)}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[12px]">
              <a
                href={startup.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-foreground hover:bg-muted/50"
              >
                {startup.domain} <ExternalLinkIcon className="h-3 w-3" />
              </a>
              {startup.twitter ? (
                <a href={startup.twitter} target="_blank" rel="noreferrer" className="rounded-full border border-border px-2.5 py-1 hover:bg-muted/50">
                  X
                </a>
              ) : null}
              {startup.linkedin ? (
                <a href={startup.linkedin} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 hover:bg-muted/50">
                  <LinkedInLogoIcon className="h-3 w-3" /> LinkedIn
                </a>
              ) : null}
              {startup.github ? (
                <a href={startup.github} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 hover:bg-muted/50">
                  <GitHubLogoIcon className="h-3 w-3" /> GitHub
                </a>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-border bg-card px-4 py-3 text-right">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Composite</p>
            <p className={cn("font-mono text-2xl font-semibold tabular-nums", compositeScoreTextClass(startup.compositeScore))}>
              {startup.compositeScore.toFixed(1)}
            </p>
          </div>
          <Button
            type="button"
            variant={spotted ? "default" : "outline"}
            onClick={() => id && setSpotted(toggleEarlySpotter(id))}
            className={cn("gap-2", spotted && "bg-primary text-primary-foreground")}
          >
            {spotted ? <BookmarkFilledIcon className="h-4 w-4" /> : <BookmarkIcon className="h-4 w-4" />}
            Early Spotter
          </Button>
        </div>
      </header>

      <div className="mt-8 grid gap-5">
        <SignalAttribution row={startup} />
        <TrajectoryCharts row={startup} />
        <CatalystTeardown row={startup} />
      </div>
    </div>
    </div>
  );
}
