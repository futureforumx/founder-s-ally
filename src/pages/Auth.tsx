import { useEffect, type ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { SignIn, SignUp, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { BrandLogo } from "@/components/BrandLogo";
import { Loader2 } from "lucide-react";
import { readClerkPublishableKey } from "@/lib/clerkPublishableKey";

/** Path-based routing matches `/auth/*` — more reliable than `routing="virtual"` with React Router. */
export default function Auth() {
  const { isLoaded, userId } = useClerkAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const clerkKey = readClerkPublishableKey();
  const showLocalPreviewFallback =
    import.meta.env.DEV && clerkKey.startsWith("pk_live_") && !isLoaded;

  useEffect(() => {
    if (isLoaded && userId) navigate("/", { replace: true });
  }, [isLoaded, userId, navigate]);

  const clerkAppearance = {
    elements: {
      rootBox: "w-full flex justify-start",
      // Do not strip card background/border — transparent card made the form invisible on white.
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
      <p className="text-center text-xs text-zinc-500">Loading sign-in…</p>
    </div>
  );

  const shell = (children: ReactNode) => (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.98),_rgba(244,244,245,0.92)_45%,_rgba(228,228,231,0.82)_100%)] px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-7xl overflow-hidden rounded-[32px] border border-zinc-200/80 bg-white shadow-[0_30px_120px_rgba(15,23,42,0.12)]">
        <div className="w-full lg:w-[460px] lg:border-r lg:border-zinc-200/80 xl:w-[520px]">
          <div className="font-clash flex h-full flex-col justify-center px-8 py-8 sm:px-10 lg:px-12">
            <div className="mx-auto w-full max-w-[420px]">
              <div className="mb-4 md:mb-8 flex flex-col items-start gap-4">
                <BrandLogo variant="black" className="w-[132px] sm:w-[148px]" />
              </div>
              {children}
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

        <div className="relative hidden flex-1 overflow-hidden bg-zinc-950 lg:block">
          <video
            className="absolute inset-0 h-full w-full object-cover"
            autoPlay
            muted
            loop
            playsInline
            preload="auto"
          >
            <source src="/auth-wave.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(10,10,10,0.76)_0%,rgba(24,24,27,0.28)_42%,rgba(255,255,255,0.08)_100%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.18),_transparent_32%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.12),_transparent_38%)]" />

          <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/8 px-4 py-2 text-[11px] font-medium uppercase tracking-[0.28em] text-white backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-white/80" />
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

  if (showLocalPreviewFallback) {
    return shell(
      <>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Preview Mode</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-500">
          This localhost build is using a production Clerk key, so sign-in cannot load here. The page is still
          rendering so we can iterate on the UI while you edit.
        </p>

        <div className="mt-8 space-y-4">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950">
            Add a <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">VITE_CLERK_PUBLISHABLE_KEY_DEV=pk_test_...</code>{" "}
            value in <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs">.env.local</code> when you want live
            auth on localhost.
          </div>

          <div className="space-y-3 rounded-[28px] border border-zinc-200 bg-zinc-50/70 p-5">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-zinc-800">Email</label>
              <input
                disabled
                value="you@company.com"
                readOnly
                className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-500"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-zinc-800">Password</label>
              <input
                disabled
                value="Your password"
                readOnly
                className="h-11 w-full rounded-xl border border-zinc-300 bg-white px-3 text-sm text-zinc-500"
              />
            </div>

            <button
              disabled
              className="flex h-11 w-full items-center justify-center rounded-xl bg-zinc-900 text-sm font-medium text-white opacity-70"
            >
              Sign in
            </button>

            <div className="relative py-2 text-center text-xs uppercase tracking-[0.28em] text-zinc-400">
              <span className="bg-zinc-50 px-2">or</span>
            </div>

            <div className="grid gap-3">
              <button
                disabled
                className="flex h-11 w-full items-center justify-center rounded-xl border border-zinc-300 bg-white text-sm text-zinc-500"
              >
                Continue with Google
              </button>
              <button
                disabled
                className="flex h-11 w-full items-center justify-center rounded-xl border border-zinc-300 bg-white text-sm text-zinc-500"
              >
                Continue with LinkedIn
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (!isLoaded) {
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
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Create your account</h1>
        <p className="mt-2 text-sm text-zinc-500">
          Get started in a few steps. You can also continue with Google or other providers if enabled in Clerk.
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
