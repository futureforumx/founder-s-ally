import { useEffect, useMemo, useRef } from "react";
import { Link } from "react-router-dom";
import { AccessRequestForm } from "@/components/public/AccessRequestForm";
import { getAccessPageBackgroundVideoUrl } from "@/lib/accessPageVideoUrl";

/** Subtle brand tint on top of video + dark veil (kept low so the page stays deep, not milky). */
const brandGradientOverlay =
  "radial-gradient(ellipse 80% 50% at 50% -20%, hsl(var(--primary) / 0.35), transparent 55%), radial-gradient(ellipse 60% 40% at 100% 0%, hsl(var(--success) / 0.2), transparent 45%), radial-gradient(ellipse 50% 30% at 0% 100%, hsl(var(--primary) / 0.2), transparent 50%)";

export default function AccessRequest() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoSrc = useMemo(() => getAccessPageBackgroundVideoUrl(), []);

  useEffect(() => {
    const prev = document.title;
    document.title = "Request access · Vekta";
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
      void el.play().catch(() => {
        /* Autoplay can be blocked; gradient fallback remains visible. */
      });
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

      <div className="relative z-10 mx-auto flex min-h-screen max-w-lg flex-col px-5 pb-16 pt-10 sm:px-6 sm:pt-14">
        <header className="mb-10 flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-2 rounded-md outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
            <img
              src="/brand/vekta-access-mark.png"
              alt="Vekta"
              className="h-8 w-8 shrink-0 object-contain animate-access-mark-glow motion-reduce:animate-none motion-reduce:filter-none"
              width={32}
              height={32}
            />
          </Link>
          <a
            href="https://vekta.so"
            target="_blank"
            rel="noopener noreferrer"
            className="text-2xs font-medium text-[#eeeeee] underline-offset-4 transition-colors hover:text-white hover:underline"
          >
            Learn more
          </a>
        </header>

        <main className="flex flex-1 flex-col gap-10">
          <div className="space-y-3 text-center sm:text-left">
            <p className="text-2xs font-medium uppercase tracking-wider text-primary">Early access</p>
            <h1 className="text-balance text-3xl font-semibold tracking-tight text-[#eeeeee] sm:text-4xl">
              Request access to Vekta
            </h1>
            <p className="text-pretty text-sm leading-relaxed text-[#b3b3b3] sm:text-base">
              Connect your data. Turn real-time signals into opportunities across funding, markets, and people.
            </p>
          </div>

          <AccessRequestForm />

          <section
            aria-labelledby="access-next-heading"
            className="space-y-3 rounded-2xl border border-zinc-800 bg-[#000000] px-4 py-5 shadow-lg shadow-black/50 backdrop-blur-sm"
          >
            <h2 id="access-next-heading" className="text-xs font-semibold uppercase tracking-wide text-primary">
              What happens next
            </h2>
            <ol className="list-decimal space-y-2 pl-4 text-sm text-[#b3b3b3] marker:text-primary">
              <li>We review your request and how you plan to use Vekta.</li>
              <li>You’ll get an email when access is ready—no spam.</li>
              <li>Share your referral link to move up for priority consideration.</li>
            </ol>
          </section>
        </main>

        <footer className="mt-12 text-center text-2xs text-[#b3b3b3] sm:text-left">
          © {new Date().getFullYear()} Vekta. All rights reserved.
        </footer>
      </div>
    </div>
  );
}
