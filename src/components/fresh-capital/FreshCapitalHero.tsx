import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import MuxPlayer from "@mux/mux-player-react";
import type MuxPlayerElement from "@mux/mux-player";
import { Button } from "@/components/ui/button";
import { PublicIntelMoreResources } from "@/components/fresh-capital/PublicIntelMoreResources";
import { trackFreshCapitalGetFullAccess } from "@/lib/freshCapitalAnalytics";

/** Same asset as auth rotation (`AUTH_HERO_MUX_DEFAULT_PLAYBACK_IDS`) — use MuxPlayer, not iframe (iframe often blocked / zero-size). */
const FRESH_CAPITAL_HERO_MUX_PLAYBACK_ID = "GwpGwspdiRXiP00bFyarvtSMx9eno01Tfjld2bxSywt3M";

type Props = {
  onNotifyClick: () => void;
  trackedCount: number;
  trackedLabel?: string;
};

function RollingDigit({ digit, delayMs }: { digit: number; delayMs: number }) {
  const n = Math.min(9, Math.max(0, digit));
  return (
    <span className="relative inline-block h-[1em] w-[0.62em] overflow-hidden">
      <span
        className="absolute inset-x-0 top-0 flex flex-col will-change-transform motion-reduce:transition-none"
        style={{
          transform: `translateY(-${n}em)`,
          transition: `transform 900ms cubic-bezier(0.16, 1, 0.3, 1) ${delayMs}ms`,
        }}
      >
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className="flex h-[1em] items-center justify-center">
            {i}
          </span>
        ))}
      </span>
    </span>
  );
}

function TrackedStat({ value, label }: { value: number; label: string }) {
  const target = Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  const [shown, setShown] = useState(0);

  useEffect(() => {
    setShown(0);
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setShown(target));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [target]);

  const width = Math.max(String(target).length, 1);
  const digits = String(shown).padStart(width, "0").split("").map((ch) => Number(ch));

  return (
    <div className="flex min-w-[5.5rem] flex-col gap-1" aria-label={`${target} ${label.toLowerCase()}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-400">{label}</p>
      <p className="font-semibold tabular-nums text-[28px] leading-none tracking-tight text-[#eeeeee] sm:text-[32px]">
        {digits.map((d, i) => (
          <RollingDigit key={`${width}-${i}`} digit={d} delayMs={i * 70} />
        ))}
      </p>
    </div>
  );
}

export function FreshCapitalHero({ onNotifyClick, trackedCount, trackedLabel = "Funds tracked" }: Props) {
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
      {/* Background: mux-player-react (same stack as Auth) — fills pinned stage; veil on top for readable copy */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
        <div className="absolute inset-0 min-h-[min(40vh,420px)] bg-black" />
        <div className="auth-hero-mux absolute inset-0 min-h-[min(40vh,420px)] overflow-hidden">
          <MuxPlayer
            ref={muxRef}
            playbackId={FRESH_CAPITAL_HERO_MUX_PLAYBACK_ID}
            title="Fund Watch background video"
            className="auth-hero-mux-player block h-full w-full pointer-events-none border-0"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
            nohotkeys
            streamType="on-demand"
            metadata={{ video_title: "Fund Watch hero" }}
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
          <div className="flex shrink-0 items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onNotifyClick}
              className="h-[30px] rounded-full border-white/25 bg-white/10 px-4 text-[11px] font-semibold uppercase tracking-[0.14em] leading-none text-white hover:bg-white/15 hover:text-white"
            >
              Notify me
            </Button>
            <PublicIntelMoreResources />
          </div>
        </div>

        <div className="max-w-2xl space-y-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-primary">Capital Roundup</p>
          <h1 className="text-balance text-[30px] font-semibold leading-tight tracking-tight text-[#eeeeee] sm:leading-[1.1]">
            See which investors just raised fresh capital
          </h1>
          <p className="text-pretty text-[14px] leading-relaxed text-[#b3b3b3]">
            Track new VC funds and active investors—so you know exactly who to target right now.
          </p>
          <div className="flex flex-wrap items-end gap-5">
            <TrackedStat key={trackedLabel} value={trackedCount} label={trackedLabel} />
            <Button
              type="button"
              variant="outline"
              className="h-[30px] rounded-full border-white/25 bg-white/10 px-4 text-xs font-medium leading-none text-white hover:bg-white/15 hover:text-white"
              asChild
            >
              <a
                href="https://vekta.so/register?utm_source=funding_board"
                onClick={() => {
                  trackFreshCapitalGetFullAccess();
                }}
              >
                Get full access
              </a>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
