import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { ReferralsPanel } from "@/components/referrals/ReferralsPanel";
import { getAccessPageBackgroundVideoUrl } from "@/lib/accessPageVideoUrl";

const brandGradientOverlay =
  "radial-gradient(ellipse 80% 50% at 50% -20%, hsl(var(--primary) / 0.35), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 0%, hsl(var(--success) / 0.2), transparent 45%), radial-gradient(ellipse 50% 30% at 0% 100%, hsl(var(--primary) / 0.2), transparent 50%)";

export default function Referrals() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoSrc = useMemo(() => getAccessPageBackgroundVideoUrl(), []);

  useEffect(() => {
    const prev = document.title;
    document.title = "Your referral dashboard · Vekta";
    return () => {
      document.title = prev;
    };
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.defaultMuted = true;
    el.muted = true;
    const kick = () => {
      void el.play().catch(() => {});
    };
    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) kick();
    else el.addEventListener("loadeddata", kick, { once: true });
    return () => el.removeEventListener("loadeddata", kick);
  }, [videoSrc]);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-black font-spaceGrotesk">
      <div className="pointer-events-none absolute inset-0 min-h-[100dvh] overflow-hidden bg-black" aria-hidden>
        <video
          ref={videoRef}
          key={videoSrc}
          className="absolute inset-0 h-full min-h-full w-full scale-[1.02] object-cover"
          src={videoSrc}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/85 via-black/40 to-black/90" />
        <div className="absolute inset-0 opacity-45" style={{ background: brandGradientOverlay }} />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-xl flex-col px-5 pb-20 pt-10 sm:px-6 sm:pt-14">
        <header className="mb-12 flex items-center justify-between gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-md outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <img
              src="/brand/vekta-access-mark.png"
              alt="Vekta"
              className="h-8 w-8 shrink-0 object-contain animate-access-mark-glow motion-reduce:animate-none motion-reduce:filter-none"
              width={32}
              height={32}
            />
          </Link>
          <Link
            to="/access"
            className="text-2xs font-medium text-[#eeeeee] underline-offset-4 transition-colors hover:text-white hover:underline"
          >
            Request access
          </Link>
        </header>

        <main className="flex flex-1 flex-col gap-12">
          <div className="space-y-4 text-center sm:text-left">
            <p className="text-2xs font-semibold uppercase tracking-[0.2em] text-primary/95">Waitlist</p>
            <h1 className="text-balance text-[1.75rem] font-semibold leading-tight tracking-tight text-[#f4f4f5] sm:text-4xl">
              Your referral dashboard
            </h1>
            <p className="mx-auto max-w-md text-pretty text-[0.9375rem] leading-relaxed text-[#a1a1aa] sm:mx-0 sm:text-base">
              Track your position and move up by inviting others.
            </p>
          </div>

          <ReferralsPanel />
        </main>

        <footer className="mt-16 text-center text-2xs text-[#71717a] sm:text-left">
          © {new Date().getFullYear()} Vekta. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
