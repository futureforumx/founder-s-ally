import { useMemo } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { trackFreshCapitalGetFullAccess, trackFreshCapitalViewLatestFunds } from "@/lib/freshCapitalAnalytics";

/** Playback ID from `https://stream.mux.com/GwpGwspdiRXiP00bFyarvtSMx9eno01Tfjld2bxSywt3M` — embed via `https://player.mux.com/{id}`. */
const FRESH_CAPITAL_HERO_MUX_PLAYBACK_ID = "GwpGwspdiRXiP00bFyarvtSMx9eno01Tfjld2bxSywt3M";

/** Same delegated permissions as `/auth` Mux iframe (muted autoplay, esp. Safari). */
const MUX_IFRAME_ALLOW =
  "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen";

type Props = {
  onScrollToFeed: () => void;
};

const HERO_EXPLORE_MENU =
  "min-w-[12.5rem] rounded-lg border border-zinc-700/90 bg-zinc-950 py-1 text-zinc-100 shadow-xl";

const HERO_EXPLORE_ITEM = cn(
  "cursor-pointer rounded-none px-3 py-2 text-[13px] font-normal leading-snug text-zinc-200",
  "focus:bg-white/[0.06] focus:text-zinc-50 data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-zinc-50",
);

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
    <header className="relative ml-[calc(50%-50vw)] w-screen max-w-none shrink-0 min-h-[min(40vh,420px)] border-b border-zinc-800 bg-black">
      {/* Background fills header; header is viewport-wide so Mux is not clipped by a narrow ancestor. */}
      <div className="pointer-events-none absolute inset-0 z-0 min-h-[min(40vh,420px)]" aria-hidden>
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

      <div className="relative z-10 mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-6 pt-8 sm:gap-7 sm:px-6 sm:pb-8 sm:pt-10">
        <div className="flex items-center justify-between gap-4">
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
          <DropdownMenu>
            <DropdownMenuTrigger
              type="button"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium text-[#eeeeee]/80 outline-none ring-offset-black transition-colors hover:bg-white/[0.06] hover:text-[#eeeeee] focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-black data-[state=open]:bg-white/[0.06] data-[state=open]:text-[#eeeeee]"
            >
              <span>More resources</span>
              <ChevronDown className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.75} aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={6} className={HERO_EXPLORE_MENU}>
              <DropdownMenuItem asChild className={HERO_EXPLORE_ITEM} onSelect={(e) => e.preventDefault()}>
                <Link to="/?view=resources">Fundraising best practices</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className={HERO_EXPLORE_ITEM} onSelect={(e) => e.preventDefault()}>
                <Link to="/?view=investor-funding">Recent funding</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className={HERO_EXPLORE_ITEM} onSelect={(e) => e.preventDefault()}>
                <Link to="/?view=directory">Trending companies</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className={HERO_EXPLORE_ITEM} onSelect={(e) => e.preventDefault()}>
                <a href="https://tryvekta.com/aurora" target="_blank" rel="noopener noreferrer">
                  Agent Library
                </a>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="max-w-2xl space-y-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-primary">Fresh capital</p>
          <h1 className="text-balance text-[30px] font-semibold leading-tight tracking-tight text-[#eeeeee] sm:leading-[1.1]">
            See which investors just raised fresh capital
          </h1>
          <p className="text-pretty text-[14px] leading-relaxed text-[#b3b3b3]">
            Track new VC funds and active investors—so you know exactly who to target right now.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              className="h-[30px] rounded-full px-4 text-xs font-medium leading-none"
              onClick={() => {
                trackFreshCapitalViewLatestFunds();
                onScrollToFeed();
              }}
            >
              View latest funds
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-[30px] rounded-full border-white/25 bg-white/10 px-4 text-xs font-medium leading-none text-white hover:bg-white/15 hover:text-white"
              asChild
            >
              <Link
                to="/access"
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
