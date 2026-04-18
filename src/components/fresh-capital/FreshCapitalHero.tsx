import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { trackFreshCapitalGetFullAccess, trackFreshCapitalJoinVekta, trackFreshCapitalViewLatestFunds } from "@/lib/freshCapitalAnalytics";
import { freshCapitalSignupHref } from "@/lib/freshCapitalConversion";

type Props = {
  onScrollToFeed: () => void;
};

const signupHref = freshCapitalSignupHref();

export function FreshCapitalHero({ onScrollToFeed }: Props) {
  return (
    <header className="border-b border-zinc-200/80 bg-white">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 px-4 pb-12 pt-10 sm:px-6 sm:pb-14 sm:pt-14">
        <div className="flex items-center justify-between gap-4">
          <Link to="/" className="text-sm font-semibold tracking-tight text-zinc-900">
            Vekta
          </Link>
          <div className="flex items-center gap-3">
            <Link
              to="/auth"
              className="text-sm font-medium text-zinc-600 underline-offset-4 hover:text-zinc-900 hover:underline"
            >
              Sign in
            </Link>
            <Button asChild size="sm" className="rounded-full px-4">
              <Link to={signupHref} onClick={() => trackFreshCapitalJoinVekta()}>
                Join
              </Link>
            </Button>
          </div>
        </div>

        <div className="max-w-2xl space-y-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-600">Fresh capital</p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-zinc-950 sm:text-4xl sm:leading-[1.1]">
            See which investors just raised fresh capital
          </h1>
          <p className="text-pretty text-base leading-relaxed text-zinc-600 sm:text-lg">
            Track new VC funds and active investors—so you know exactly who to target right now.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Button
              type="button"
              size="lg"
              className="rounded-full px-6"
              onClick={() => {
                trackFreshCapitalViewLatestFunds();
                onScrollToFeed();
              }}
            >
              View latest funds
            </Button>
            <Button type="button" size="lg" variant="outline" className="rounded-full border-zinc-300 bg-white px-6" asChild>
              <Link
                to={signupHref}
                onClick={() => {
                  trackFreshCapitalGetFullAccess();
                }}
              >
                Get full access
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
