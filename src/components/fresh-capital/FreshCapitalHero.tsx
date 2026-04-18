import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { trackFreshCapitalGetFullAccess, trackFreshCapitalViewLatestFunds } from "@/lib/freshCapitalAnalytics";
import { freshCapitalSignupHref } from "@/lib/freshCapitalConversion";

/** Playback ID from `https://stream.mux.com/GwpGwspdiRXiP00bFyarvtSMx9eno01Tfjld2bxSywt3M` — embed via `https://player.mux.com/{id}`. */
const FRESH_CAPITAL_HERO_MUX_PLAYBACK_ID = "GwpGwspdiRXiP00bFyarvtSMx9eno01Tfjld2bxSywt3M";

/** Same delegated permissions as `/auth` Mux iframe (muted autoplay, esp. Safari). */
const MUX_IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";

type Props = {
  onScrollToFeed: () => void;
};

const signupHref = freshCapitalSignupHref();

/** Iframe query: muted autoplay + hide control UI via CSS vars (Mux iframe embed — customize look-and-feel). */
function buildFreshCapitalMuxEmbedSrc(): string {
  const id = FRESH_CAPITAL_HERO_MUX_PLAYBACK_ID;
  const params = new URLSearchParams();
  params.set("autoplay", "muted");
  params.set("muted", "true");
  params.set("loop", "true");
  params.set("playsinline", "true");
  params.set("controls", "false");
  params.set("nohotkeys", "true");
  params.set(
    "style",
    "--controls: none; --play-button: none; --center-controls: none; --bottom-play-button: none; --loading-indicator: none; --dialog: none;",
  );
  return `https://player.mux.com/${id}?${params.toString()}`;
}

export function FreshCapitalHero({ onScrollToFeed }: Props) {
  const muxEmbedSrc = useMemo(() => buildFreshCapitalMuxEmbedSrc(), []);

  return (
    <header className="relative ml-[calc(50%-50vw)] w-screen max-w-none shrink-0 min-h-[min(52vh,560px)] border-b border-zinc-800 bg-black">
      {/* Background fills header; header is viewport-wide so Mux is not clipped by a narrow ancestor. */}
      <div className="pointer-events-none absolute inset-0 z-0 min-h-[min(52vh,560px)]" aria-hidden>
        <div className="auth-hero-mux relative h-full min-h-full w-full overflow-hidden">
          <iframe
            src={muxEmbedSrc}
            title="Fresh capital background video"
            className="auth-hero-mux-player"
            allow={MUX_IFRAME_ALLOW}
            loading="eager"
            tabIndex={-1}
          />
        </div>
        {/* Black veil over video (readable copy on top at z-10). */}
        <div className="absolute inset-0 bg-black/65" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[min(52vh,560px)] max-w-5xl flex-col gap-8 px-4 pb-12 pt-10 sm:px-6 sm:pb-14 sm:pt-14">
        <div className="flex items-center justify-between gap-4">
          <Link
            to="/"
            className="text-sm font-semibold tracking-tight text-[#eeeeee] outline-none ring-offset-black transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2"
          >
            Vekta
          </Link>
          <a
            href="https://www.tryvekta.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-[#eeeeee]/85 underline-offset-4 transition-colors hover:text-white hover:underline"
          >
            Learn more
          </a>
        </div>

        <div className="max-w-2xl space-y-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Fresh capital</p>
          <h1 className="text-balance text-3xl font-semibold tracking-tight text-[#eeeeee] sm:text-4xl sm:leading-[1.1]">
            See which investors just raised fresh capital
          </h1>
          <p className="text-pretty text-base leading-relaxed text-[#b3b3b3] sm:text-lg">
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
            <Button
              type="button"
              size="lg"
              variant="outline"
              className="rounded-full border-white/25 bg-white/10 px-6 text-white hover:bg-white/15 hover:text-white"
              asChild
            >
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
