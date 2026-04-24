import { useEffect, useRef } from "react";
import { ChevronDown } from "lucide-react";
import { Link } from "react-router-dom";
import MuxPlayer from "@mux/mux-player-react";
import type MuxPlayerElement from "@mux/mux-player";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { trackFreshCapitalGetFullAccess, trackFreshCapitalViewLatestFunds } from "@/lib/freshCapitalAnalytics";

/** Same asset as auth rotation — use MuxPlayer, not iframe (iframe often blocked / zero-size). */
const FRESH_CAPITAL_HERO_MUX_PLAYBACK_ID = "GwpGwspdiRXiP00bFyarvtSMx9eno01Tfjld2bxSywt3M";

type Props = {
  onScrollToFeed: () => void;
};

const HERO_EXPLORE_MENU =
  "min-w-[12.5rem] rounded-lg border border-zinc-700/90 bg-zinc-950 py-1 text-zinc-100 shadow-xl";

const HERO_EXPLORE_ITEM = cn(
  "cursor-pointer rounded-none px-3 py-2 text-[13px] font-normal leading-snug text-zinc-200",
  "focus:bg-white/[0.06] focus:text-zinc-50 data-[highlighted]:bg-white/[0.06] data-[highlighted]:text-zinc-50",
);

export function FreshCapitalHero({ onScrollToFeed }: Props) {
  const muxRef = useRef<MuxPlayerElement | null>(null);

  /** Same autoplay kick as `/auth` — Safari / Low Power Mode need explicit play(). */
  useEffect(() => {
    const el = muxRef.current;
    if (!el) return;
    el.defaultMuted = true;
    el.muted = true;
    const kick = () => {
      void el.play().catch(() => {
        /* autoplay policies */
      });
    };
    kick();
    el.addEventListener("loadeddata", kick, { once: true });
    el.addEventListener("canplay", kick, { once: true });
    return () => {
      el.removeEventListener("loadeddata", kick);
      el.removeEventListener("canplay", kick);
    };
  }, []);

  return (
    <header className="relative ml-[calc(50%-50vw)] w-screen max-w-none shrink-0 min-h-[min(40vh,420px)] border-b border-zinc-800 bg-black">
      {/* Background: mux-player-react fills pinned stage; veil on top for readable copy */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 min-h-[min(40vh,420px)] bg-black" />
        <div className="auth-hero-mux absolute inset-0 min-h-[min(40vh,420px)] overflow-hidden">
          <MuxPlayer
            ref={muxRef}
            playbackId={FRESH_CAPITAL_HERO_MUX_PLAYBACK_ID}
            title="Fresh capital background video"
            className="auth-hero-mux-player block h-full w-full pointer-events-none border-0"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            nohotkeys
            streamType="on-demand"
            metadata={{ video_title: "Fresh capital hero" }}
          />
        </div>
        <div className="absolute inset-0 bg-black/45" aria-hidden />
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
                <Link to="/ai-agents">Agent Library</Link>
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
