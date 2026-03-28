import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { SignIn, SignUp, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { Loader2 } from "lucide-react";
import { readClerkPublishableKey } from "@/lib/clerkPublishableKey";
import { BrandLogo } from "@/components/BrandLogo";

const clerkAppearance = {
  elements: {
    rootBox: "w-full flex justify-start",
    socialButtonsBlockButton:
      "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50 h-10",
    formButtonPrimary: "bg-zinc-900 hover:bg-zinc-800 text-[15px] font-medium h-11",
    formFieldInput: "border-zinc-300 bg-white",
    dividerLine: "bg-zinc-200",
    dividerText: "text-zinc-400",
  },
};

const fallback = (
  <div className="flex min-h-[280px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/80 px-4 py-10">
    <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
    <p className="text-center text-xs text-zinc-500">Loading…</p>
  </div>
);

/** Picks one background per full page load / refresh. */
const AUTH_HERO_BACKGROUNDS = [
  { kind: "mp4" as const, src: "/auth-wave.mp4" },
  {
    kind: "mux" as const,
    playbackId: "hoUpKcH1LBS86dkrgoXP1x9ORxOJusTFFhF5P02Pp5T00",
  },
];

function AuthHeroBackground() {
  const variant = useMemo(() => {
    const i = Math.floor(Math.random() * AUTH_HERO_BACKGROUNDS.length);
    return AUTH_HERO_BACKGROUNDS[i]!;
  }, []);

  if (variant.kind === "mp4") {
    return (
      <div className="absolute inset-0 z-0 overflow-hidden">
        <video
          className="absolute inset-0 z-0 h-full w-full min-h-full min-w-full object-cover object-center"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
        >
          <source src={variant.src} type="video/mp4" />
        </video>
      </div>
    );
  }

  const iframeSrc = `https://player.mux.com/${variant.playbackId}?muted=true&autoplay=true&loop=true&playsinline=true`;

  /* Mux’s hosted player letterboxes inside the iframe; scale + clip to mimic object-cover. */
  return (
    <div className="absolute inset-0 z-0 overflow-hidden">
      <iframe
        title="Background video"
        src={iframeSrc}
        className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-full w-full max-w-none -translate-x-1/2 -translate-y-1/2 origin-center scale-[1.28] border-0 xl:scale-[1.18]"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      />
    </div>
  );
}

function shell(content: ReactNode) {
  return (
    <div className="h-dvh min-h-0 overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.98),_rgba(244,244,245,0.92)_45%,_rgba(228,228,231,0.82)_100%)] p-4 sm:p-6">
      <div className="mx-auto flex h-full min-h-0 w-full max-w-7xl overflow-hidden rounded-[32px] border border-zinc-200/80 bg-white shadow-[0_30px_120px_rgba(15,23,42,0.12)]">
        <div className="flex h-full min-h-0 min-w-0 w-full flex-col border-zinc-200/80 lg:w-[460px] lg:border-r xl:w-[520px]">
          <div className="font-clash flex min-h-0 flex-1 flex-col">
            <div className="mx-auto min-h-0 w-full max-w-[420px] flex-1 overflow-y-auto overscroll-y-contain px-8 py-6 pb-8 pt-[max(1.5rem,env(safe-area-inset-top))] sm:px-10 lg:px-12">
              <div className="mb-4 flex flex-col items-start gap-4 md:mb-6">
                <BrandLogo variant="black" className="w-[132px] sm:w-[148px]" />
              </div>
              {content}
              <p className="mt-8 text-xs leading-relaxed text-zinc-500">
                Our privacy standards are worldclass. Find them{" "}
                <a
                  href="https://tryvekta.com/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900"
                >
                  here
                </a>
                .
              </p>
            </div>
          </div>
        </div>

        <div className="relative isolate hidden min-h-0 flex-1 overflow-hidden bg-zinc-950 lg:block">
          <AuthHeroBackground />
          <div className="pointer-events-none absolute inset-0 z-[1] bg-[linear-gradient(135deg,rgba(10,10,10,0.76)_0%,rgba(24,24,27,0.28)_42%,rgba(255,255,255,0.08)_100%)]" />
          <div className="pointer-events-none absolute inset-0 z-[1] bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.18),_transparent_32%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.12),_transparent_38%)]" />

          <div className="relative z-[2] flex h-full min-h-0 flex-col justify-between p-10 xl:p-14">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white bg-white/8 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.28em] text-white backdrop-blur-sm">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              Live Founder Signal
            </div>

            <div className="max-w-xl space-y-5">
              <p className="text-sm font-medium uppercase tracking-[0.34em] text-white drop-shadow-[0_1px_12px_rgba(0,0,0,0.45)]">
                Founder Intelligence
              </p>
              <h2 className="text-4xl font-semibold leading-tight tracking-tight text-white xl:text-5xl">
                A calm front door for a fast-moving fundraising system.
              </h2>
              <p className="max-w-lg text-base leading-7 text-white">
                Search, sync, and operate from a workspace that feels composed even while the market moves underneath
                it.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Path-based routes under `/auth/*` — set the same paths in Clerk Dashboard → Paths if prompted.
 */
export default function Auth() {
  const { isLoaded, userId } = useClerkAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [clerkLoadTimedOut, setClerkLoadTimedOut] = useState(false);
  const clerkKey = readClerkPublishableKey();
  const showLocalPreviewFallback =
    import.meta.env.DEV && clerkKey.startsWith("pk_live_") && !isLoaded;
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "this domain";

  useEffect(() => {
    if (isLoaded) {
      setClerkLoadTimedOut(false);
      return;
    }
    const t = window.setTimeout(() => setClerkLoadTimedOut(true), 15_000);
    return () => window.clearTimeout(t);
  }, [isLoaded]);

  useEffect(() => {
    if (isLoaded && userId) navigate("/", { replace: true });
  }, [isLoaded, userId, navigate]);

  if (showLocalPreviewFallback) {
    return (
      <div className="min-h-screen bg-zinc-100 px-4 py-10 sm:py-14">
        <div className="mx-auto w-full max-w-[420px] rounded-2xl border border-zinc-200/80 bg-white p-8 shadow-sm sm:p-10">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Preview mode</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-500">
            This localhost build is using a production Clerk key, so sign-in cannot load here. Add{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs">VITE_CLERK_PUBLISHABLE_KEY_DEV=pk_test_…</code> in{" "}
            <code className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs">.env.local</code>.
          </p>
        </div>
      </div>
    );
  }

  if (!isLoaded && !clerkLoadTimedOut) {
    return shell(
      <div className="flex min-h-[320px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-500" />
      </div>
    );
  }

  const isSignUp = location.pathname.startsWith("/auth/sign-up");

  return shell(
    isSignUp ? (
      <>
        {clerkLoadTimedOut && (
          <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900">
            Clerk is still initializing for <span className="font-semibold">{currentOrigin}</span>. If sign-in does not appear,
            add this domain in Clerk → Domains, disable blockers for this site, and hard-refresh.
          </div>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Ready for big things?</h1>
        <p className="mt-2 text-sm leading-relaxed text-zinc-500">
          It&apos;s easy to get started. Don&apos;t know the low-down on Vekta? Find out more{" "}
          <a
            href="https://tryvekta.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-zinc-900 underline decoration-zinc-300 underline-offset-2 hover:decoration-zinc-900"
          >
            here
          </a>
          .
        </p>
        <div className="mt-8 w-full min-w-0">
          <SignUp
            routing="path"
            path="/auth/sign-up"
            signInUrl="/auth"
            fallbackRedirectUrl="/"
            appearance={clerkAppearance}
            fallback={fallback}
          />
        </div>
      </>
    ) : (
      <>
        {clerkLoadTimedOut && (
          <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs leading-6 text-amber-900">
            Clerk is still initializing for <span className="font-semibold">{currentOrigin}</span>. If sign-in does not appear,
            add this domain in Clerk → Domains, disable blockers for this site, and hard-refresh.
          </div>
        )}
        <h1 className="hidden md:block text-2xl font-semibold tracking-tight text-zinc-900">Welcome Back.</h1>
        <p className="hidden md:block mt-2 text-sm text-zinc-500">Your founder co-pilot awaits.</p>
        <div className="mt-8 w-full min-w-0">
          <SignIn
            routing="path"
            path="/auth"
            signUpUrl="/auth/sign-up"
            fallbackRedirectUrl="/"
            appearance={clerkAppearance}
            fallback={fallback}
          />
        </div>
      </>
    )
  );
}
